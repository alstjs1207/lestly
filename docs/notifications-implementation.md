# 알림 시스템 구현 완료 보고서

## 개요

Kakao AlimTalk 기반 알림 시스템을 구현하였습니다. 수강생/관리자 일정 예약/취소, 상담 신청, 리마인더 등의 알림을 자동으로 발송하고, 관리자 화면에서 인앱 알림을 실시간으로 확인할 수 있습니다.

---

## 구현된 기능

### 1. 알림 유형 (6종)

| 템플릿 코드 | 설명 | 발송 타이밍 |
|------------|------|------------|
| STD_BOOK_ADMIN | 수강생 예약 → 관리자 | 즉시 |
| STD_CANCEL_ADMIN | 수강생 취소 → 관리자 | 즉시 |
| ADM_BOOK_STUDENT | 관리자 예약 → 수강생 | 하이브리드 (즉시/배치) |
| ADM_CANCEL_STUDENT | 관리자 취소 → 수강생 | 하이브리드 (즉시/배치) |
| SYS_CONSULT_ADMIN | 상담 신청 → 관리자 | 즉시 |
| SYS_REMIND_STUDENT | 수업 리마인더 → 수강생 | 예약 (N시간 전) |

### 2. 하이브리드 발송 로직

- **주간 (09:00~23:00)**: 즉시 발송
- **야간 (23:00~09:00)**: 다음날 09:00 배치 발송

### 3. 인앱 알림

- 관리자 헤더에 종 아이콘 표시
- 읽지 않은 알림 개수 배지
- Supabase Realtime으로 실시간 업데이트

---

## 생성된 파일

### 데이터베이스

```
sql/migrations/0010_notifications.sql    # 테이블, RLS, 트리거, 초기 데이터
sql/migrations/0011_alimtalk_cron.sql    # pg_cron 설정
```

### Drizzle 스키마

```
app/features/notifications/schema.ts     # Enum, 테이블, RLS 정책 정의
```

### API 엔드포인트

```
app/features/notifications/api/in-app-notifications.tsx  # 인앱 알림 CRUD
app/features/notifications/api/test-send.tsx             # 테스트 발송 (일 5회 제한)
app/features/notifications/api/alimtalk-cron.tsx         # Cron 배치/리마인더 처리
```

### Edge Function

```
supabase/functions/send-alimtalk/index.ts  # Solapi API 연동, 알림 발송
```

### 프론트엔드

```
app/features/notifications/hooks/use-in-app-notifications.ts  # Realtime 구독 훅
app/features/notifications/components/notification-bell.tsx   # 종 아이콘 컴포넌트
app/core/lib/supa-browser-client.ts                          # 브라우저 Supabase 클라이언트
```

---

## 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `app/routes.ts` | notifications API 라우트 등록 |
| `app/features/admin/layouts/admin.layout.tsx` | NotificationBell 컴포넌트 추가 |
| `sql/migrations/meta/_journal.json` | 0010, 0011 마이그레이션 엔트리 추가 |
| `tsconfig.json` | `supabase/functions` exclude 추가 |
| `database.types.ts` | db:typegen으로 새 테이블 타입 생성 |

---

## 데이터베이스 구조

### 테이블

| 테이블명 | 설명 |
|---------|------|
| `notifications` | 모든 알림 기록 (알림톡, 상담 신청) |
| `super_templates` | 마스터 템플릿 정의 (6종) |
| `organization_templates` | 조직별 템플릿 설정 |
| `test_send_logs` | 테스트 발송 기록 |
| `in_app_notifications` | 인앱 알림 (종 아이콘) |

### Enum 타입

- `notification_type`: ALIMTALK, CONSULT_REQUEST
- `alimtalk_status`: PENDING, SENT, FAILED
- `consult_status`: WAITING, COMPLETED
- `consult_result`: SUCCESS, FAILED
- `send_mode`: TEST, LIVE
- `template_channel`: ALIMTALK
- `template_status`: ACTIVE, INACTIVE
- `send_timing`: IMMEDIATE, SCHEDULED

### 트리거 함수

- `on_schedule_insert()`: 일정 생성 시 알림 발송
- `on_schedule_delete()`: 일정 삭제 시 알림 발송
- `on_consult_request_insert()`: 상담 신청 시 알림 발송

---

## API 라우트

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/notifications` | GET | 인앱 알림 목록 조회 |
| `/api/notifications` | PATCH | 단일 알림 읽음 처리 |
| `/api/notifications` | POST | 전체 알림 읽음 처리 |
| `/api/notifications/test-send` | POST | 테스트 알림 발송 |
| `/api/cron/alimtalk` | POST | 배치 발송 + 리마인더 처리 |

---

## 배포 완료 항목

- [x] DB 마이그레이션 실행
- [x] Edge Function 배포 (`supabase functions deploy send-alimtalk`)
- [x] pg_cron 설정
- [x] NotificationBell 헤더 연동
- [x] 타입 체크 통과

---

## 환경 변수 설정 필요

Edge Function Secrets (Supabase Dashboard):
- `SOLAPI_API_KEY`
- `SOLAPI_API_SECRET`
- `SOLAPI_PFID` (카카오 채널 ID)

---

## 테스트 방법

1. **인앱 알림 확인**: Admin 페이지 접속 → 헤더 종 아이콘 확인
2. **테스트 발송**: `/api/notifications/test-send` POST 요청
3. **트리거 테스트**: 일정 등록/취소 시 알림 발송 확인
4. **Cron 테스트**: `/api/cron/alimtalk` POST 요청
