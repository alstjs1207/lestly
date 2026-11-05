# 검증 기록

- 일자: 2026-11-04 (Asia/Seoul).
- 변경 전 로컬 HEAD: main `1804138`. 이번 기능 변경은 미커밋 상태에서 검증했다.
- 런타임: Node 24.22.1. 기본 셸의 Node 25.9.0은 저장소 런타임 검사에서 거절되어 설치된 24.22.1로 재실행했다.

## 실행 결과

| 명령/검사 | 결과 |
| --- | --- |
| `npm run verify:local` | 최종 실행 exit 0 |
| 명세/연결/분류 + `test:spec-tools` | 통과, 도구 검사 9개 |
| `test:unit` | 219개 통과, 실패 0 |
| `test:db` | PGlite 268개 통과, 기존 booking lifecycle 132개 전부 검증 |
| `typecheck` / `build` | 통과 |
| `test:ssr` | 출결·수강생 일정·유형·예약 정책·예약 기간·일반 수업 화면 6종 통과 |
| `openspec validate require-student-course-dates --strict` | 통과 |
| `git diff --check` | 통과 |

## 회귀 근거

- `student-form.test.ts`: KST 신규 시작일 기본값, 종료일 미입력 거절, 두 날짜 없는 기존 수정 허용, 수동 종료일 보존, 월말/윤년/연도 경계 계산.
- `student-bulk.test.ts` / `student-management.test.ts`: 단건·일괄 저장의 종료일 명시, 기존 오류·부분 성공·전화번호·상태/날짜 보존 회귀.
- `student-booking-push.test.ts`: 시작일 또는 종료일 누락 시 예약 RPC·푸시 전에 차단.
- `student-week-loader.test.ts`: 기간 없는 계정의 새 예약 불가와 기존 일정 조회 유지. 다른 예약 검사는 유효한 기간 fixture로 본래 요일·시간·정원·조직 검증을 유지했다.
- `sql/checks/student-course-dates.mjs`: 0040 적용 전후 모든 public 테이블 행 비교 불변, 종료일 없는 신규 RPC/직접 날짜 변경 차단, 기간 없는 학생의 학생 RPC·관리자 반복 RPC·직접 INSERT/이동 차단, 기존 예약 조회/로그인/출결/취소 보존, 기간 보완 후 예약 및 종료일 포함 경계.
- `service-generalization-ssr.mjs`: 실제 빌드된 신규 등록 화면에서 오늘 시작일·빈 필수 종료일·4개 기간 버튼 확인. HTML 속성 순서에 의존하던 신규 검사 정규식을 입력 태그별 검사로 수정했다.

## 브라우저 검증

`ego-browser`로 실제 StudentCourseDates 컴포넌트를 번들한 격리된 로컬 파일 화면을 조작했다. 1·3·6·12개월 버튼 결과, 1월 31일의 월말 보정, 윤년 2월 29일의 1년 보정, 시작일 변경 시 기존 종료일 유지, 시작일 삭제 시 버튼 비활성화, 시작일 미입력에서도 빈 종료일 제출 차단을 확인했다. 날짜 필드의 fill 동작은 React 변경 이벤트를 반영하지 않아 실제 날짜 spinbutton 키보드 입력으로 확인했다. 테스트 브라우저를 종료했고 임시 fixture는 제거했다. 인증된 운영 화면 E2E는 실행하지 않았다.

## 반영 범위

코드·명세·신규 `0040_student_course_dates.sql`만 준비했다. 고객 DB 접속·데이터 변경·마이그레이션 적용·배포·추가 커밋·푸시는 수행하지 않았다. 기존 날짜를 채우거나 기존 예약을 정리하지 않는다. 운영 반영은 0040 migration 적용 후 새 앱 배포 순서다.

## Archive 후 확인

2026-11-04에 3/3 작업 완료 후 CLI archive로 3개 capability의 4개 요구사항을 현재 명세에 반영했다. 이후 `npm run spec:check`와 main/delta 내용 대조가 통과했다.


## 최종 변경 누락 검사 보완

`npm run spec:changed -- HEAD`에서 신규 migration 등록에 필요한 `sql/migrations/meta/_journal.json`이 미분류되어 실패했다. SPEC-002·SPEC-003과 PLAT-003 근거로 저널을 platform에 분류했다. 저널도 정책 근거를 요구하며 미분류 신규 SQL은 계속 거절하는 회귀를 `spec-tools.test.mjs`에 추가했다. 이 보완은 제품 정책을 바꾸지 않는다.

보완 후 `npm run test:spec-tools` 10개와 `npm run spec:check`가 통과했다. 변경 누락 검사는 공용 일정 화면의 learning 근거가 추가로 필요하여 LEARN-001·LEARN-002의 기존 기록 조회/집계 보존 근거를 proposal에 추가했다.

최종 `npm run spec:changed -- HEAD`는 recurring-schedules·booking·student-management·learning·platform 모두 근거 확인으로 exit 0, `git diff --check`도 exit 0이었다.
