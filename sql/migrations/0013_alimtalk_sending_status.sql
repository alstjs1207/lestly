-- =============================================
-- Migration: Add SENDING status and remove pgmq.send()
--
-- This migration:
-- 1. Adds SENDING status to alimtalk_status enum for concurrency control
-- 2. Removes pgmq.send() calls from triggers (pgmq was not being consumed)
-- =============================================

-- =============================================
-- STEP 1: Add SENDING status to alimtalk_status enum
-- =============================================

ALTER TYPE alimtalk_status ADD VALUE 'SENDING' BEFORE 'SENT';

-- =============================================
-- STEP 2: Recreate trigger functions without pgmq.send()
-- =============================================

/**
 * 수강생/관리자 예약 알림 트리거
 * - 수강생이 예약하면 관리자에게 (STD_BOOK_ADMIN) - 즉시 발송
 * - 관리자가 예약하면 수강생에게 (ADM_BOOK_STUDENT) - 하이브리드 발송
 *
 * pgmq.send() 제거됨 - Cron이 notifications 테이블을 직접 폴링
 */
CREATE OR REPLACE FUNCTION on_schedule_insert()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET SEARCH_PATH = ''
AS $$
DECLARE
  v_is_student BOOLEAN;
  v_template_type TEXT;
  v_template RECORD;
  v_recipient_phone TEXT;
  v_recipient_name TEXT;
  v_recipient_profile_id UUID;
  v_admin_phone TEXT;
  v_admin_profile_id UUID;
  v_org_name TEXT;
  v_program_title TEXT;
  v_variables JSONB;
  v_notification_id BIGINT;
  v_is_batch_period BOOLEAN;
  v_scheduled_send_at TIMESTAMPTZ;
  v_current_hour INT;
BEGIN
  -- 반복 일정 인스턴스는 원본만 처리
  IF NEW.parent_schedule_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 예약자가 수강생인지 확인
  v_is_student := NEW.student_id = auth.uid();

  IF v_is_student THEN
    -- 수강생이 직접 예약 → 관리자에게 알림
    v_template_type := 'STD_BOOK_ADMIN';
  ELSE
    -- 관리자가 예약 → 수강생에게 알림
    v_template_type := 'ADM_BOOK_STUDENT';
  END IF;

  -- 템플릿 설정 조회
  SELECT
    st.kakao_template_code,
    st.content,
    COALESCE(ot.status, 'ACTIVE') as status,
    COALESCE(ot.send_timing, st.default_timing) as send_timing,
    COALESCE(ot.scheduled_send_time, '09:00'::TIME) as scheduled_send_time,
    COALESCE(ot.batch_start_hour, 23) as batch_start_hour
  INTO v_template
  FROM public.super_templates st
  LEFT JOIN public.organization_templates ot
    ON st.super_template_id = ot.super_template_id
    AND ot.organization_id = NEW.organization_id
  WHERE st.type = v_template_type
    AND st.status = 'ACTIVE';

  -- 템플릿이 비활성화면 스킵
  IF v_template IS NULL OR v_template.status != 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  -- 조직명 조회
  SELECT name INTO v_org_name
  FROM public.organizations
  WHERE organization_id = NEW.organization_id;

  -- 프로그램명 조회
  IF NEW.program_id IS NOT NULL THEN
    SELECT title INTO v_program_title
    FROM public.programs
    WHERE program_id = NEW.program_id;
  END IF;

  IF v_is_student THEN
    -- 수강생 정보 조회
    SELECT name, phone INTO v_recipient_name, v_recipient_phone
    FROM public.profiles
    WHERE profile_id = NEW.student_id;

    -- 관리자 전화번호 조회 (첫 번째 관리자)
    SELECT p.profile_id, p.phone INTO v_admin_profile_id, v_admin_phone
    FROM public.organization_members om
    JOIN public.profiles p ON p.profile_id = om.profile_id
    WHERE om.organization_id = NEW.organization_id
      AND om.role = 'ADMIN'
      AND om.state = 'NORMAL'
      AND p.phone IS NOT NULL
    LIMIT 1;

    -- 관리자 전화번호가 없으면 스킵
    IF v_admin_phone IS NULL THEN
      RETURN NEW;
    END IF;

    -- 변수 설정
    v_variables := jsonb_build_object(
      'organization_name', v_org_name,
      'program_title', COALESCE(v_program_title, '미지정'),
      'schedule_datetime', to_char(NEW.start_time AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
      'student_name', v_recipient_name,
      'student_phone', v_recipient_phone
    );

    -- notifications 생성 (즉시 발송)
    INSERT INTO public.notifications (
      organization_id, type, recipient_phone, recipient_name, recipient_profile_id,
      sender_profile_id, alimtalk_status, alimtalk_template_code, alimtalk_variables,
      schedule_id, program_id, send_mode
    ) VALUES (
      NEW.organization_id, 'ALIMTALK', v_admin_phone, NULL, v_admin_profile_id,
      NEW.student_id, 'PENDING', v_template.kakao_template_code, v_variables,
      NEW.schedule_id, NEW.program_id, 'LIVE'
    );

  ELSE
    -- 관리자가 예약 → 수강생에게 알림 (하이브리드)
    -- 수강생 정보 조회
    SELECT p.name, p.phone, p.profile_id INTO v_recipient_name, v_recipient_phone, v_recipient_profile_id
    FROM public.profiles p
    WHERE p.profile_id = NEW.student_id;

    -- 수강생 전화번호가 없으면 스킵
    IF v_recipient_phone IS NULL THEN
      RETURN NEW;
    END IF;

    -- 변수 설정
    v_variables := jsonb_build_object(
      'organization_name', v_org_name,
      'program_title', COALESCE(v_program_title, '미지정'),
      'schedule_datetime', to_char(NEW.start_time AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
      'student_name', v_recipient_name
    );

    -- 배치 구간 판단 (예: 23시~9시)
    v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Seoul');
    v_is_batch_period := (
      v_current_hour >= v_template.batch_start_hour OR
      v_current_hour < EXTRACT(HOUR FROM v_template.scheduled_send_time)
    );

    -- scheduled_send_at 계산
    IF v_is_batch_period THEN
      -- 배치 구간: 다음 발송 시간으로 설정
      IF v_current_hour >= v_template.batch_start_hour THEN
        -- 23시 이후면 다음날
        v_scheduled_send_at := (CURRENT_DATE + INTERVAL '1 day')::DATE + v_template.scheduled_send_time;
      ELSE
        -- 자정~9시면 오늘
        v_scheduled_send_at := CURRENT_DATE::DATE + v_template.scheduled_send_time;
      END IF;
    ELSE
      -- 즉시 발송 구간
      v_scheduled_send_at := NULL;
    END IF;

    -- notifications 생성
    INSERT INTO public.notifications (
      organization_id, type, recipient_phone, recipient_name, recipient_profile_id,
      sender_profile_id, alimtalk_status, alimtalk_template_code, alimtalk_variables,
      schedule_id, program_id, send_mode, scheduled_send_at
    ) VALUES (
      NEW.organization_id, 'ALIMTALK', v_recipient_phone, v_recipient_name, v_recipient_profile_id,
      auth.uid(), 'PENDING', v_template.kakao_template_code, v_variables,
      NEW.schedule_id, NEW.program_id, 'LIVE', v_scheduled_send_at
    );
  END IF;

  RETURN NEW;
END;
$$;

/**
 * 수강생/관리자 취소 알림 트리거
 * - 수강생이 취소하면 관리자에게 (STD_CANCEL_ADMIN) - 즉시 발송
 * - 관리자가 취소하면 수강생에게 (ADM_CANCEL_STUDENT) - 하이브리드 발송
 *
 * pgmq.send() 제거됨 - Cron이 notifications 테이블을 직접 폴링
 */
CREATE OR REPLACE FUNCTION on_schedule_delete()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET SEARCH_PATH = ''
AS $$
DECLARE
  v_is_student BOOLEAN;
  v_template_type TEXT;
  v_template RECORD;
  v_recipient_phone TEXT;
  v_recipient_name TEXT;
  v_recipient_profile_id UUID;
  v_admin_phone TEXT;
  v_admin_profile_id UUID;
  v_org_name TEXT;
  v_program_title TEXT;
  v_variables JSONB;
  v_notification_id BIGINT;
  v_is_batch_period BOOLEAN;
  v_scheduled_send_at TIMESTAMPTZ;
  v_current_hour INT;
BEGIN
  -- 반복 일정 인스턴스는 원본만 처리
  IF OLD.parent_schedule_id IS NOT NULL THEN
    RETURN OLD;
  END IF;

  -- 삭제자가 수강생인지 확인
  v_is_student := OLD.student_id = auth.uid();

  IF v_is_student THEN
    -- 수강생이 직접 취소 → 관리자에게 알림
    v_template_type := 'STD_CANCEL_ADMIN';
  ELSE
    -- 관리자가 취소 → 수강생에게 알림
    v_template_type := 'ADM_CANCEL_STUDENT';
  END IF;

  -- 템플릿 설정 조회
  SELECT
    st.kakao_template_code,
    st.content,
    COALESCE(ot.status, 'ACTIVE') as status,
    COALESCE(ot.send_timing, st.default_timing) as send_timing,
    COALESCE(ot.scheduled_send_time, '09:00'::TIME) as scheduled_send_time,
    COALESCE(ot.batch_start_hour, 23) as batch_start_hour
  INTO v_template
  FROM public.super_templates st
  LEFT JOIN public.organization_templates ot
    ON st.super_template_id = ot.super_template_id
    AND ot.organization_id = OLD.organization_id
  WHERE st.type = v_template_type
    AND st.status = 'ACTIVE';

  -- 템플릿이 비활성화면 스킵
  IF v_template IS NULL OR v_template.status != 'ACTIVE' THEN
    RETURN OLD;
  END IF;

  -- 조직명 조회
  SELECT name INTO v_org_name
  FROM public.organizations
  WHERE organization_id = OLD.organization_id;

  -- 프로그램명 조회
  IF OLD.program_id IS NOT NULL THEN
    SELECT title INTO v_program_title
    FROM public.programs
    WHERE program_id = OLD.program_id;
  END IF;

  IF v_is_student THEN
    -- 수강생 정보 조회
    SELECT name, phone INTO v_recipient_name, v_recipient_phone
    FROM public.profiles
    WHERE profile_id = OLD.student_id;

    -- 관리자 전화번호 조회 (첫 번째 관리자)
    SELECT p.profile_id, p.phone INTO v_admin_profile_id, v_admin_phone
    FROM public.organization_members om
    JOIN public.profiles p ON p.profile_id = om.profile_id
    WHERE om.organization_id = OLD.organization_id
      AND om.role = 'ADMIN'
      AND om.state = 'NORMAL'
      AND p.phone IS NOT NULL
    LIMIT 1;

    -- 관리자 전화번호가 없으면 스킵
    IF v_admin_phone IS NULL THEN
      RETURN OLD;
    END IF;

    -- 변수 설정
    v_variables := jsonb_build_object(
      'organization_name', v_org_name,
      'program_title', COALESCE(v_program_title, '미지정'),
      'schedule_datetime', to_char(OLD.start_time AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
      'student_name', v_recipient_name
    );

    -- notifications 생성 (즉시 발송)
    INSERT INTO public.notifications (
      organization_id, type, recipient_phone, recipient_name, recipient_profile_id,
      sender_profile_id, alimtalk_status, alimtalk_template_code, alimtalk_variables,
      schedule_id, program_id, send_mode
    ) VALUES (
      OLD.organization_id, 'ALIMTALK', v_admin_phone, NULL, v_admin_profile_id,
      OLD.student_id, 'PENDING', v_template.kakao_template_code, v_variables,
      OLD.schedule_id, OLD.program_id, 'LIVE'
    );

  ELSE
    -- 관리자가 취소 → 수강생에게 알림 (하이브리드)
    -- 수강생 정보 조회
    SELECT p.name, p.phone, p.profile_id INTO v_recipient_name, v_recipient_phone, v_recipient_profile_id
    FROM public.profiles p
    WHERE p.profile_id = OLD.student_id;

    -- 수강생 전화번호가 없으면 스킵
    IF v_recipient_phone IS NULL THEN
      RETURN OLD;
    END IF;

    -- 변수 설정
    v_variables := jsonb_build_object(
      'organization_name', v_org_name,
      'program_title', COALESCE(v_program_title, '미지정'),
      'schedule_datetime', to_char(OLD.start_time AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'),
      'student_name', v_recipient_name
    );

    -- 배치 구간 판단 (예: 23시~9시)
    v_current_hour := EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Seoul');
    v_is_batch_period := (
      v_current_hour >= v_template.batch_start_hour OR
      v_current_hour < EXTRACT(HOUR FROM v_template.scheduled_send_time)
    );

    -- scheduled_send_at 계산
    IF v_is_batch_period THEN
      IF v_current_hour >= v_template.batch_start_hour THEN
        v_scheduled_send_at := (CURRENT_DATE + INTERVAL '1 day')::DATE + v_template.scheduled_send_time;
      ELSE
        v_scheduled_send_at := CURRENT_DATE::DATE + v_template.scheduled_send_time;
      END IF;
    ELSE
      v_scheduled_send_at := NULL;
    END IF;

    -- notifications 생성
    INSERT INTO public.notifications (
      organization_id, type, recipient_phone, recipient_name, recipient_profile_id,
      sender_profile_id, alimtalk_status, alimtalk_template_code, alimtalk_variables,
      schedule_id, program_id, send_mode, scheduled_send_at
    ) VALUES (
      OLD.organization_id, 'ALIMTALK', v_recipient_phone, v_recipient_name, v_recipient_profile_id,
      auth.uid(), 'PENDING', v_template.kakao_template_code, v_variables,
      OLD.schedule_id, OLD.program_id, 'LIVE', v_scheduled_send_at
    );
  END IF;

  RETURN OLD;
END;
$$;

/**
 * 상담 신청 시 관리자에게 알림 트리거
 *
 * pgmq.send() 제거됨 - Cron이 notifications 테이블을 직접 폴링
 */
CREATE OR REPLACE FUNCTION on_consult_request_insert()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET SEARCH_PATH = ''
AS $$
DECLARE
  v_template RECORD;
  v_admin_phone TEXT;
  v_admin_profile_id UUID;
  v_org_name TEXT;
  v_program_title TEXT;
  v_variables JSONB;
  v_notification_id BIGINT;
BEGIN
  -- 상담 신청 타입만 처리
  IF NEW.type != 'CONSULT_REQUEST' THEN
    RETURN NEW;
  END IF;

  -- 템플릿 설정 조회
  SELECT
    st.kakao_template_code,
    COALESCE(ot.status, 'ACTIVE') as status
  INTO v_template
  FROM public.super_templates st
  LEFT JOIN public.organization_templates ot
    ON st.super_template_id = ot.super_template_id
    AND ot.organization_id = NEW.organization_id
  WHERE st.type = 'SYS_CONSULT_ADMIN'
    AND st.status = 'ACTIVE';

  -- 템플릿이 비활성화면 스킵
  IF v_template IS NULL OR v_template.status != 'ACTIVE' THEN
    RETURN NEW;
  END IF;

  -- 조직명 조회
  SELECT name INTO v_org_name
  FROM public.organizations
  WHERE organization_id = NEW.organization_id;

  -- 프로그램명 조회
  IF NEW.program_id IS NOT NULL THEN
    SELECT title INTO v_program_title
    FROM public.programs
    WHERE program_id = NEW.program_id;
  END IF;

  -- 관리자 전화번호 조회 (첫 번째 관리자)
  SELECT p.profile_id, p.phone INTO v_admin_profile_id, v_admin_phone
  FROM public.organization_members om
  JOIN public.profiles p ON p.profile_id = om.profile_id
  WHERE om.organization_id = NEW.organization_id
    AND om.role = 'ADMIN'
    AND om.state = 'NORMAL'
    AND p.phone IS NOT NULL
  LIMIT 1;

  -- 관리자 전화번호가 없으면 스킵
  IF v_admin_phone IS NULL THEN
    RETURN NEW;
  END IF;

  -- 변수 설정
  v_variables := jsonb_build_object(
    'organization_name', v_org_name,
    'requester_name', NEW.recipient_name,
    'requester_phone', NEW.recipient_phone,
    'program_title', COALESCE(v_program_title, '미지정'),
    'consult_message', COALESCE(NEW.consult_message, '')
  );

  -- 알림톡용 notifications 생성 (관리자에게)
  INSERT INTO public.notifications (
    organization_id, type, recipient_phone, recipient_name, recipient_profile_id,
    alimtalk_status, alimtalk_template_code, alimtalk_variables, program_id, send_mode
  ) VALUES (
    NEW.organization_id, 'ALIMTALK', v_admin_phone, NULL, v_admin_profile_id,
    'PENDING', v_template.kakao_template_code, v_variables, NEW.program_id, 'LIVE'
  );

  RETURN NEW;
END;
$$;

-- =============================================
-- STEP 3: Clean up existing pgmq messages (optional)
-- Uncomment to purge accumulated messages
-- =============================================

-- SELECT pgmq.purge('alimtalk');
