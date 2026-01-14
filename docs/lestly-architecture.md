# Lestly 아키텍처 문서

수강생 스케쥴 관리 백오피스 시스템의 기술 아키텍처를 정의합니다.

---

## 1. 시스템 개요

### 1.1 목적

- 수강생(학생) 정보 및 수업 스케쥴 관리
- 관리자용 백오피스 대시보드
- 학생용 스케쥴 조회/등록/취소 기능
- **멀티테넌시 지원** (조직별 독립적인 데이터 관리)

### 1.2 시스템 구조

```
User (Profile) ──┬── Organization A (role: ADMIN, state: NORMAL)
                 └── Organization B (role: STUDENT, state: NORMAL)

Organization ──┬── Programs (프로그램/클래스) [1:N]
               │       └── Schedules (스케줄) [1:N]
               ├── Members (organization_members) [N:N via junction table]
               └── Settings (조직별 설정)
```

- **Profile**: 사용자 기본 정보 (이름, 전화번호 등)
- **Organization**: 상위 개념으로 서비스를 사용하는 하나의 조직
- **Organization Members**: N:N 관계 중간 테이블 (role, state, type 포함)
  - 한 사용자가 여러 조직에 소속 가능
  - 조직별로 다른 역할 가질 수 있음 (A조직: ADMIN, B조직: STUDENT)
- **Program**: 조직에 속한 수업/클래스
- **Schedule**: 특정 프로그램에 대한 수강생의 스케줄

### 1.2 기술 스택

| 구분          | 기술                                     |
| ------------- | ---------------------------------------- |
| Frontend      | React 19, React Router 7, Tailwind CSS 4 |
| UI Components | shadcn/ui                                |
| Calendar      | FullCalendar                             |
| Backend       | Supabase (PostgreSQL, Auth, RLS)         |
| ORM           | Drizzle ORM                              |
| 반복 일정     | rrule.js                                 |
| 날짜 처리     | date-fns                                 |

### 사용자 상태 (state)

- `NORMAL` : 정상 수강 중인 수강생
- `GRADUATE` : 졸업 처리된 수강생
- `DELETED` : 탈퇴 처리된 수강생 (관리자 전용 목록에서만 확인 가능)

> `GRADUATE`, `DELETED` 상태의 수강생은 스케쥴 등록 시 선택 불가

### 사용자 유형 (type)

- `EXAMINEE` : 입시생
- `DROPPER` : 재수생
- `ADULT` : 성인 수강생

### 사용자 권한 (role)

- `STUDENT` : 수강생
- `ADMIN` : 관리자

### 접근 권한

- role이 ADMIN인 사용자만 관리자 백오피스에 접근 가능
- **관리자는 소속된 조직 내에서만 권한 보유**
- 다른 조직의 데이터에 대한 접근 권한 없음

### 관리자 가입 플로우

```
1. 관리자 가입 (/admin/signup)
   └── 이메일, 비밀번호, 이름 입력
   └── is_admin_signup: true 메타데이터로 가입
   └── 프로필 생성 (기본 정보만)

2. 이메일 인증

3. 조직 설정 (/admin/signup/organization)
   └── 조직명, 설명 입력
   └── 조직 생성
   └── organization_members에 ADMIN 멤버십 생성

4. 관리자 대시보드 (/admin)
   └── 조직 내 데이터만 접근 가능
```

---

## 2. 데이터베이스 스키마

### 2.1 ENUM 타입

```sql
-- 멤버 역할 (organization_members에서 사용)
CREATE TYPE member_role AS ENUM ('STUDENT', 'ADMIN');

-- 멤버 상태 (organization_members에서 사용)
CREATE TYPE member_state AS ENUM ('NORMAL', 'GRADUATE', 'DELETED');

-- 멤버 유형 (organization_members에서 사용, 학생 전용)
CREATE TYPE member_type AS ENUM ('EXAMINEE', 'DROPPER', 'ADULT');

-- 프로그램 상태
CREATE TYPE program_status AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- 프로그램 레벨
CREATE TYPE program_level AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
```

### 2.2 테이블 구조

#### organizations

```
┌─────────────────────┬──────────────┬─────────────────────────────────┐
│ Column              │ Type         │ Description                     │
├─────────────────────┼──────────────┼─────────────────────────────────┤
│ organization_id     │ uuid (PK)    │ 조직 고유 ID                    │
│ name                │ text         │ 조직명                          │
│ description         │ text         │ 조직 설명                       │
│ created_at          │ timestamp    │ 생성일                          │
│ updated_at          │ timestamp    │ 수정일                          │
└─────────────────────┴──────────────┴─────────────────────────────────┘
```

#### organization_members (N:N 중간 테이블)

```
┌─────────────────────┬──────────────┬─────────────────────────────────┐
│ Column              │ Type         │ Description                     │
├─────────────────────┼──────────────┼─────────────────────────────────┤
│ organization_id     │ uuid (PK,FK) │ 조직 ID                         │
│ profile_id          │ uuid (PK,FK) │ 프로필 ID                       │
│ role                │ member_role  │ STUDENT / ADMIN                 │
│ state               │ member_state │ NORMAL / GRADUATE / DELETED     │
│ type                │ member_type  │ EXAMINEE / DROPPER / ADULT      │
│ created_at          │ timestamp    │ 생성일                          │
│ updated_at          │ timestamp    │ 수정일                          │
└─────────────────────┴──────────────┴─────────────────────────────────┘
```

**복합 Primary Key:** `(organization_id, profile_id)`

> 한 사용자가 여러 조직에 소속될 수 있으며, 각 조직에서 다른 역할을 가질 수 있습니다.
> 예: A조직에서 ADMIN, B조직에서 STUDENT

#### instructors

```
┌─────────────────────┬──────────────┬─────────────────────────────────┐
│ Column              │ Type         │ Description                     │
├─────────────────────┼──────────────┼─────────────────────────────────┤
│ instructor_id       │ bigint (PK)  │ Auto-increment ID               │
│ organization_id     │ uuid (FK)    │ 소속 조직 ID                    │
│ name                │ text         │ 강사명                          │
│ info                │ text         │ 강사 소개                       │
│ photo_url           │ text         │ 프로필 사진 URL                 │
│ career              │ jsonb        │ 경력 배열 ["경력1", "경력2"]    │
│ sns                 │ jsonb        │ SNS {instagram, youtube}        │
│ created_at          │ timestamp    │ 생성일                          │
│ updated_at          │ timestamp    │ 수정일                          │
└─────────────────────┴──────────────┴─────────────────────────────────┘
```

#### programs

```
┌─────────────────────┬──────────────┬─────────────────────────────────┐
│ Column              │ Type         │ Description                     │
├─────────────────────┼──────────────┼─────────────────────────────────┤
│ program_id          │ bigint (PK)  │ Auto-increment ID               │
│ organization_id     │ uuid (FK)    │ 소속 조직 ID                    │
│ instructor_id       │ bigint (FK)  │ 담당 강사 ID                    │
│ title               │ text         │ 프로그램명                      │
│ subtitle            │ text         │ 부제목                          │
│ description         │ text         │ 설명                            │
│ slug                │ text         │ URL 슬러그 (/class/:slug)       │
│ cover_image_url     │ text         │ 커버 이미지 URL                 │
│ thumbnail_url       │ text         │ 썸네일 URL                      │
│ location_type       │ text         │ offline / online                │
│ location_address    │ text         │ 수업 장소 주소                  │
│ duration_minutes    │ integer      │ 1회 수업 시간 (분)              │
│ total_sessions      │ integer      │ 총 회차                         │
│ max_capacity        │ integer      │ 모집 정원                       │
│ curriculum          │ jsonb        │ 커리큘럼 배열                   │
│ is_public           │ boolean      │ 공개 페이지 게시 여부           │
│ status              │ program_status│ DRAFT / ACTIVE / ARCHIVED      │
│ level               │ program_level│ BEGINNER / INTERMEDIATE / ADVANCED │
│ price               │ double       │ 가격                            │
│ created_at          │ timestamp    │ 생성일                          │
│ updated_at          │ timestamp    │ 수정일                          │
└─────────────────────┴──────────────┴─────────────────────────────────┘
```

#### profiles

```
┌─────────────────────┬──────────────┬─────────────────────────────────┐
│ Column              │ Type         │ Description                     │
├─────────────────────┼──────────────┼─────────────────────────────────┤
│ profile_id          │ uuid (PK)    │ Supabase Auth user ID           │
│ name                │ text         │ 이름                            │
│ region              │ text         │ 지역                            │
│ birth_date          │ date         │ 생년월일                        │
│ description         │ text         │ 메모                            │
│ class_start_date    │ date         │ 수강 시작일                     │
│ class_end_date      │ date         │ 수강 종료일                     │
│ phone               │ text         │ 전화번호                        │
│ parent_name         │ text         │ 보호자 이름                     │
│ parent_phone        │ text         │ 보호자 전화번호                 │
│ color               │ text         │ 캘린더 표시 색상                │
│ avatar_url          │ text         │ 프로필 이미지                   │
│ marketing_consent   │ boolean      │ 마케팅 동의                     │
│ created_at          │ timestamp    │ 생성일                          │
│ updated_at          │ timestamp    │ 수정일                          │
└─────────────────────┴──────────────┴─────────────────────────────────┘
```

> **Note:** `role`, `state`, `type`은 `organization_members` 테이블로 이동.
> 사용자의 조직별 역할/상태는 해당 테이블에서 관리됩니다.

#### schedules

```
┌─────────────────────┬──────────────┬─────────────────────────────────┐
│ Column              │ Type         │ Description                     │
├─────────────────────┼──────────────┼─────────────────────────────────┤
│ schedule_id         │ bigint (PK)  │ Auto-increment ID               │
│ organization_id     │ uuid (FK)    │ 소속 조직 ID                    │
│ program_id          │ bigint (FK)  │ 프로그램 ID (선택)              │
│ student_id          │ uuid (FK)    │ profiles.profile_id 참조        │
│ start_time          │ timestamptz  │ 수업 시작 시간                  │
│ end_time            │ timestamptz  │ 수업 종료 시간                  │
│ rrule               │ text         │ 반복 규칙 (RFC 5545)            │
│ parent_schedule_id  │ bigint (FK)  │ 반복 일정의 부모 ID             │
│ is_exception        │ boolean      │ 반복 일정의 예외 여부           │
│ created_at          │ timestamp    │ 생성일                          │
│ updated_at          │ timestamp    │ 수정일                          │
└─────────────────────┴──────────────┴─────────────────────────────────┘
```

#### settings

```
┌─────────────────────┬──────────────┬─────────────────────────────────┐
│ Column              │ Type         │ Description                     │
├─────────────────────┼──────────────┼─────────────────────────────────┤
│ organization_id     │ uuid (PK)    │ 조직 ID (복합키)                │
│ setting_key         │ text (PK)    │ 설정 키 (복합키)                │
│ setting_value       │ jsonb        │ 설정 값 (JSON)                  │
│ created_at          │ timestamp    │ 생성일                          │
│ updated_at          │ timestamp    │ 수정일                          │
└─────────────────────┴──────────────┴─────────────────────────────────┘
```

**기본 설정값:**
| Key | Default | Description |
|-----|---------|-------------|
| max_concurrent_students | 5 | 동시간대 최대 수강 인원 |
| schedule_duration_hours | 3 | 수업 시간 (고정) |
| time_slot_interval_minutes | 30 | 시간 선택 단위 |

### 2.3 ERD

```
┌──────────────────┐                              ┌──────────────────┐
│  organizations   │                              │    profiles      │
├──────────────────┤                              ├──────────────────┤
│ organization_id  │◄─────────────────────────────│ profile_id       │
│ name             │                              │ name             │
│ description      │                              │ phone            │
└──────────────────┘                              │ ...              │
        │                                         └──────────────────┘
        │                                                  │
        │ N:N (via organization_members)                   │
        ▼                                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    organization_members                          │
├─────────────────────────────────────────────────────────────────┤
│ organization_id (PK, FK) ◄──────────────────────────────────────│
│ profile_id (PK, FK) ◄───────────────────────────────────────────│
│ role (STUDENT / ADMIN)                                          │
│ state (NORMAL / GRADUATE / DELETED)                             │
│ type (EXAMINEE / DROPPER / ADULT)                               │
└─────────────────────────────────────────────────────────────────┘
        │
        │
        ▼
┌──────────────────┐       ┌──────────────────┐
│    programs      │       │    schedules     │
├──────────────────┤       ├──────────────────┤
│ program_id       │       │ schedule_id      │
│ organization_id  │───────│ organization_id  │
│ title            │       │ program_id       │◄─────────────────┘
│ status           │       │ student_id       │◄──── profiles.profile_id
│ ...              │       │ start_time       │
└──────────────────┘       │ end_time         │
        │                  │ ...              │
        │ 1:N              └──────────────────┘
        │
        ▼
┌──────────────────┐
│     settings     │
├──────────────────┤
│ organization_id  │
│ setting_key      │
│ setting_value    │
└──────────────────┘
```

> **N:N 관계 특징:**
> - 한 사용자(Profile)가 여러 조직에 소속 가능
> - 각 조직에서 서로 다른 역할 (ADMIN/STUDENT) 가질 수 있음
> - 조직별로 독립적인 state (NORMAL/GRADUATE/DELETED) 관리

---

## 3. Row Level Security (RLS) 정책

### 3.1 SQL 함수 (RLS 지원)

```sql
-- 특정 조직의 관리자인지 확인
CREATE FUNCTION is_org_admin(org_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE profile_id = auth.uid()
    AND organization_id = org_id
    AND role = 'ADMIN'
    AND state = 'NORMAL'
  );
$$;

-- 특정 조직의 멤버인지 확인
CREATE FUNCTION is_org_member(org_id uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE profile_id = auth.uid()
    AND organization_id = org_id
    AND state = 'NORMAL'
  );
$$;

-- 현재 사용자의 모든 조직 ID 반환
CREATE FUNCTION get_user_organizations() RETURNS SETOF uuid AS $$
  SELECT organization_id FROM organization_members
  WHERE profile_id = auth.uid()
  AND state = 'NORMAL';
$$;
```

### 3.2 organization_members 테이블

```sql
-- 본인 멤버십 조회
CREATE POLICY "Users can view own memberships"
  ON organization_members FOR SELECT
  USING (auth.uid() = profile_id);

-- 조직 관리자: 멤버십 CRUD
CREATE POLICY "Admins can manage org memberships"
  ON organization_members FOR ALL
  USING (is_org_admin(organization_id));
```

### 3.3 profiles 테이블

```sql
-- 본인 프로필 조회/수정
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = profile_id);

-- 조직 관리자: 같은 조직 멤버 프로필 조회/수정
CREATE POLICY "Admins can view org member profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om1
      JOIN organization_members om2 ON om1.organization_id = om2.organization_id
      WHERE om1.profile_id = auth.uid()
      AND om1.role = 'ADMIN'
      AND om1.state = 'NORMAL'
      AND om2.profile_id = profiles.profile_id
    )
  );

CREATE POLICY "Admins can update org member profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om1
      JOIN organization_members om2 ON om1.organization_id = om2.organization_id
      WHERE om1.profile_id = auth.uid()
      AND om1.role = 'ADMIN'
      AND om1.state = 'NORMAL'
      AND om2.profile_id = profiles.profile_id
    )
  );
```

### 3.4 schedules 테이블

```sql
-- 학생: 본인 스케쥴만 조회/등록/삭제
CREATE POLICY "Students can view own schedules"
  ON schedules FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Students can insert own schedules"
  ON schedules FOR INSERT
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can delete own schedules"
  ON schedules FOR DELETE
  USING (auth.uid() = student_id);

-- 조직 관리자: 해당 조직 스케쥴 CRUD
CREATE POLICY "Admins full access to org schedules"
  ON schedules FOR ALL
  USING (is_org_admin(organization_id));
```

### 3.5 settings 테이블

```sql
-- 조직 멤버: 해당 조직 설정 조회
CREATE POLICY "Members can view org settings"
  ON settings FOR SELECT
  USING (is_org_member(organization_id));

-- 조직 관리자만: 설정 수정
CREATE POLICY "Admins can update org settings"
  ON settings FOR ALL
  USING (is_org_admin(organization_id));
```

---

## 4. Supabase Storage

### 4.1 버킷 구조

| 버킷명 | 용도 | 경로 패턴 |
|--------|------|-----------|
| `coverimages` | 클래스 커버 이미지 | `programs/{program_id}/cover.{ext}` |
| `instructors` | 강사 프로필 사진 | `{instructor_id}/photo.{ext}` |

### 4.2 RLS 정책

```sql
-- 인증된 사용자 업로드 허용
CREATE POLICY "Authenticated users can upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'coverimages');

-- 본인이 올린 파일만 수정/삭제
CREATE POLICY "Users can update own files" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'coverimages' AND owner_id = auth.uid());

CREATE POLICY "Users can delete own files" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'coverimages' AND owner_id = auth.uid());

-- 공개 읽기
CREATE POLICY "Public read access" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'coverimages');
```

> `instructors` 버킷도 동일한 정책 적용

### 4.3 캐시 무효화

이미지 URL에 타임스탬프 쿼리 파라미터를 추가하여 브라우저 캐시 무효화:

```typescript
// 이미지 업로드 후 URL 저장 시
const photoUrl = `${urlData.publicUrl}?t=${Date.now()}`;
```

---

## 5. 디렉토리 구조

```
app/
├── features/
│   ├── admin/                          # 관리자 모듈
│   │   ├── guards.server.ts            # 관리자 권한 체크
│   │   ├── queries.ts                  # 관리자 쿼리
│   │   ├── layouts/
│   │   │   └── admin.layout.tsx        # 관리자 레이아웃 (사이드바)
│   │   ├── screens/
│   │   │   ├── dashboard.tsx           # 대시보드 (월별 캘린더)
│   │   │   ├── today.tsx               # 오늘의 수업
│   │   │   ├── settings.tsx            # 설정 관리
│   │   │   ├── students/
│   │   │   │   ├── list.tsx            # 수강생 목록
│   │   │   │   ├── detail.tsx          # 수강생 상세
│   │   │   │   ├── create.tsx          # 수강생 등록
│   │   │   │   └── edit.tsx            # 수강생 수정
│   │   │   ├── schedules/
│   │   │   │   ├── calendar.tsx        # 스케쥴 캘린더
│   │   │   │   ├── list.tsx            # 스케쥴 목록
│   │   │   │   ├── create.tsx          # 스케쥴 등록
│   │   │   │   └── edit.tsx            # 스케쥴 수정
│   │   │   └── instructors/
│   │   │       ├── list.tsx            # 강사 목록
│   │   │       ├── detail.tsx          # 강사 상세
│   │   │       ├── create.tsx          # 강사 등록
│   │   │       └── edit.tsx            # 강사 수정
│   │   ├── components/
│   │   │   ├── admin-sidebar.tsx       # 관리자 사이드바
│   │   │   ├── admin-calendar.tsx      # FullCalendar 래퍼
│   │   │   ├── student-form.tsx        # 수강생 폼
│   │   │   ├── schedule-form.tsx       # 스케쥴 폼
│   │   │   ├── program-form.tsx        # 클래스 폼 (이미지 업로드)
│   │   │   └── instructor-form.tsx     # 강사 폼 (이미지 업로드)
│   │   └── api/
│   │       ├── students/               # 수강생 API
│   │       │   ├── create.tsx
│   │       │   ├── update.tsx
│   │       │   ├── graduate.tsx
│   │       │   └── delete.tsx
│   │       ├── schedules/              # 스케쥴 API
│   │       │   ├── create.tsx
│   │       │   ├── update.tsx
│   │       │   └── delete.tsx
│   │       ├── settings/
│   │       │   └── update.tsx
│   │       └── instructors/              # 강사 API
│   │           ├── create.tsx
│   │           ├── update.tsx
│   │           └── delete.tsx
│   │
│   ├── schedules/                      # 스케쥴 모듈 (공통)
│   │   ├── schema.ts                   # Drizzle 스키마
│   │   ├── queries.ts                  # 스케쥴 쿼리
│   │   ├── utils/
│   │   │   └── student-schedule-rules.ts  # 학생 스케쥴 규칙
│   │   ├── screens/
│   │   │   ├── my-schedules.tsx        # 내 스케쥴 목록
│   │   │   └── calendar.tsx            # 내 스케쥴 캘린더
│   │   └── api/
│   │       ├── create-schedule.tsx     # 학생 스케쥴 등록
│   │       └── delete-schedule.tsx     # 학생 스케쥴 취소
│   │
│   └── app-settings/                   # 설정 모듈
│       ├── schema.ts                   # Drizzle 스키마
│       ├── queries.ts                  # 설정 쿼리
│       └── types.ts                    # 타입 정의
│
└── routes.ts                           # 라우트 정의
```

---

## 6. 라우팅 구조

### 5.1 관리자 라우트

| Path                        | Screen                 | Description          |
| --------------------------- | ---------------------- | -------------------- |
| `/admin`                    | dashboard.tsx          | 월별 캘린더 대시보드 |
| `/admin/today`              | today.tsx              | 오늘의 수업 목록     |
| `/admin/students`           | students/list.tsx      | 수강생 목록          |
| `/admin/students/new`       | students/create.tsx    | 수강생 등록          |
| `/admin/students/:id`       | students/detail.tsx    | 수강생 상세          |
| `/admin/students/:id/edit`  | students/edit.tsx      | 수강생 수정          |
| `/admin/schedules`          | schedules/calendar.tsx | 스케쥴 캘린더        |
| `/admin/schedules/list`     | schedules/list.tsx     | 스케쥴 목록          |
| `/admin/schedules/new`      | schedules/create.tsx   | 스케쥴 등록          |
| `/admin/schedules/:id/edit` | schedules/edit.tsx     | 스케쥴 수정          |
| `/admin/instructors`        | instructors/list.tsx   | 강사 목록            |
| `/admin/instructors/new`    | instructors/create.tsx | 강사 등록            |
| `/admin/instructors/:id`    | instructors/detail.tsx | 강사 상세            |
| `/admin/instructors/:id/edit`| instructors/edit.tsx  | 강사 수정            |
| `/admin/settings`           | settings.tsx           | 설정 관리            |

### 5.2 학생 라우트

| Path                     | Screen           | Description      |
| ------------------------ | ---------------- | ---------------- |
| `/my-schedules`          | my-schedules.tsx | 내 스케쥴 목록   |
| `/my-schedules/calendar` | calendar.tsx     | 내 스케쥴 캘린더 |

### 5.3 API 라우트

| Path                               | Method | Description      |
| ---------------------------------- | ------ | ---------------- |
| `/api/admin/students/create`       | POST   | 수강생 등록      |
| `/api/admin/students/:id/update`   | POST   | 수강생 수정      |
| `/api/admin/students/:id/graduate` | POST   | 수강생 졸업      |
| `/api/admin/students/:id/delete`   | POST   | 수강생 탈퇴      |
| `/api/admin/schedules/create`      | POST   | 스케쥴 등록      |
| `/api/admin/schedules/:id/update`  | POST   | 스케쥴 수정      |
| `/api/admin/schedules/:id/delete`  | POST   | 스케쥴 삭제      |
| `/api/admin/settings`              | POST   | 설정 수정        |
| `/api/admin/instructors/create`    | POST   | 강사 등록        |
| `/api/admin/instructors/:id/update`| POST   | 강사 수정        |
| `/api/admin/instructors/:id/delete`| POST   | 강사 삭제        |
| `/api/admin/programs/create`       | POST   | 클래스 등록      |
| `/api/admin/programs/:id/update`   | POST   | 클래스 수정      |
| `/api/schedules/create`            | POST   | 학생 스케쥴 등록 |
| `/api/schedules/:id/delete`        | POST   | 학생 스케쥴 취소 |

---

## 7. 비즈니스 로직

### 6.1 스케쥴 등록 규칙

```typescript
// 공통 규칙
const SCHEDULE_RULES = {
  TIME_SLOT_INTERVAL: 30, // 30분 단위
  DURATION_HOURS: 3, // 3시간 고정
  MAX_CONCURRENT: 5, // 동시간대 최대 인원 (설정 가능)
};

// 시간 검증
function isValidTimeSlot(time: Date): boolean {
  const minutes = time.getMinutes();
  return minutes % SCHEDULE_RULES.TIME_SLOT_INTERVAL === 0;
}

// 동시간대 인원 체크
async function checkConcurrentLimit(
  startTime: Date,
  endTime: Date,
): Promise<boolean> {
  const count = await getOverlappingScheduleCount(startTime, endTime);
  return count < SCHEDULE_RULES.MAX_CONCURRENT;
}
```

### 6.2 학생 스케쥴 제한

```typescript
// 등록 가능 기간 체크
function canStudentRegister(targetDate: Date): boolean {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentDay = today.getDate();
  const targetMonth = targetDate.getMonth();

  // 현재 월 등록 가능
  if (targetMonth === currentMonth) return true;

  // 25일 이후 다음 월 등록 가능
  if (currentDay >= 25 && targetMonth === currentMonth + 1) return true;

  return false;
}

// 취소 가능 여부 체크 (당일 취소 불가)
function canStudentCancel(scheduleDate: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scheduleDay = new Date(scheduleDate);
  scheduleDay.setHours(0, 0, 0, 0);

  return scheduleDay > today; // 내일 이후만 취소 가능
}
```

### 6.3 관리자 스케쥴 제한

```typescript
// 과거 날짜 수정/삭제 불가
function canAdminModify(scheduleDate: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scheduleDay = new Date(scheduleDate);
  scheduleDay.setHours(0, 0, 0, 0);

  return scheduleDay >= today; // 오늘 이후만 수정 가능
}
```

### 6.4 반복 일정 처리

```typescript
import { RRule, RRuleSet } from "rrule";

// 반복 일정 생성
function createRecurringSchedule(
  startTime: Date,
  endTime: Date,
  frequency: "weekly" | "daily",
  until: Date,
): Date[] {
  const rule = new RRule({
    freq: frequency === "weekly" ? RRule.WEEKLY : RRule.DAILY,
    dtstart: startTime,
    until: until,
  });

  return rule.all();
}

// 반복 일정 수정 옵션
type RecurringEditOption =
  | "this_only" // 이 일정만
  | "this_and_future" // 이 일정 및 이후 일정
  | "all"; // 모든 일정
```

---

## 8. 컴포넌트 구조

### 7.1 관리자 레이아웃

```
┌─────────────────────────────────────────────────────────┐
│ Header (기존 레이아웃)                                   │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│  Admin   │           Main Content Area                  │
│ Sidebar  │                                              │
│          │  ┌────────────────────────────────────────┐  │
│ - 대시보드│  │                                        │  │
│ - 오늘의  │  │     Page Content (screens/*.tsx)       │  │
│   수업   │  │                                        │  │
│ - 수강생  │  │                                        │  │
│   관리   │  │                                        │  │
│ - 스케쥴  │  │                                        │  │
│   관리   │  │                                        │  │
│ - 설정   │  │                                        │  │
│          │  └────────────────────────────────────────┘  │
│          │                                              │
└──────────┴──────────────────────────────────────────────┘
```

### 7.2 캘린더 뷰

```typescript
// AdminCalendar 컴포넌트 이벤트 구조
interface CalendarEvent {
  id: string;
  title: string; // 학생명
  start: string; // ISO 8601
  end: string; // ISO 8601
  backgroundColor: string; // 학생 색상
  borderColor: string;
  extendedProps: {
    scheduleId: number;
    studentId: string;
    studentName: string;
  };
}
```

---

## 9. 데이터 흐름

### 8.1 스케쥴 등록 (관리자)

```
┌─────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│ Calendar│───▶│ ScheduleForm │───▶│ API Handler │───▶│ Database │
│  Click  │    │              │    │             │    │          │
└─────────┘    └──────────────┘    └─────────────┘    └──────────┘
                     │                    │
                     │                    ▼
                     │              ┌─────────────┐
                     │              │ Validation  │
                     │              │ - 시간 단위 │
                     │              │ - 동시 인원 │
                     │              │ - 과거 날짜 │
                     │              └─────────────┘
                     │                    │
                     ▼                    ▼
              ┌──────────────┐    ┌─────────────┐
              │ 반복 일정?   │───▶│ RRule 생성  │
              │ - 단일       │    │ - 일괄 등록 │
              │ - 매주       │    └─────────────┘
              └──────────────┘
```

### 8.2 스케쥴 등록 (학생)

```
┌─────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│ 시간    │───▶│ Validation   │───▶│ API Handler │───▶│ Database │
│ 선택    │    │              │    │             │    │          │
└─────────┘    └──────────────┘    └─────────────┘    └──────────┘
                     │
                     ▼
              ┌──────────────┐
              │ 학생 규칙    │
              │ - 현재월/다음│
              │   월 체크    │
              │ - 25일 이후  │
              │   다음월 허용│
              │ - 동시 인원  │
              └──────────────┘
```

---

## 10. 보안 고려사항

### 9.1 인증/인가

- Supabase Auth 기반 JWT 인증
- RLS 정책으로 데이터 접근 제어
- 서버 사이드 권한 체크 (`requireAdminRole`)

### 9.2 입력 검증

- 서버 사이드 필수 필드 검증
- 날짜/시간 포맷 검증
- 동시간대 인원 제한 검증

### 9.3 데이터 보호

- 개인정보(전화번호, 보호자 정보) 관리자만 접근
- 학생은 본인 데이터만 조회 가능

---

## 11. 확장 고려사항

### 10.1 향후 기능

- [ ] 결제 연동 (수업료 관리)
- [ ] 알림 기능 (수업 리마인더)
- [ ] 출석 체크
- [ ] 수업 노트/피드백
- [ ] 통계 대시보드

### 10.2 성능 최적화

- 스케쥴 조회 시 인덱스 활용
- 월별 데이터 페이징/캐싱
- FullCalendar lazy loading

---

## 부록: 주요 파일 참조

| 파일                                                                                   | 설명              |
| -------------------------------------------------------------------------------------- | ----------------- |
| [guards.server.ts](../app/features/admin/guards.server.ts)                             | 관리자 권한 체크  |
| [admin/queries.ts](../app/features/admin/queries.ts)                                   | 관리자 쿼리       |
| [schedules/queries.ts](../app/features/schedules/queries.ts)                           | 스케쥴 쿼리       |
| [app-settings/queries.ts](../app/features/app-settings/queries.ts)                     | 설정 쿼리         |
| [student-schedule-rules.ts](../app/features/schedules/utils/student-schedule-rules.ts) | 학생 스케쥴 규칙  |
| [routes.ts](../app/routes.ts)                                                          | 라우트 정의       |
| [database.types.ts](../database.types.ts)                                              | 데이터베이스 타입 |
| [instructors/queries.ts](../app/features/instructors/queries.ts)                       | 강사 쿼리         |
| [instructor-form.tsx](../app/features/admin/components/instructor-form.tsx)            | 강사 폼 컴포넌트  |
| [program-form.tsx](../app/features/admin/components/program-form.tsx)                  | 클래스 폼 컴포넌트|
