> **이력 문서**: 현재 정책은 [OpenSpec 명세](../openspec/README.md)를 따른다. 이 문서는 당시 계획·구현·검증 기록이며 현재 지원 여부나 미해결 결함의 기준으로 단독 사용하지 않는다.

# Lestly 클래스와 수강생 상태별 예약 처리 검토

2026년 10월 30일 기준 `/Users/msyu/study/lestly`의 `preview` 브랜치, 커밋 `bcc29b8d589d689099466882dd45432e7c45104e`를 검토했다. 클래스의 초안·활성·보관 상태, 수강생의 수강 중·수강 종료·탈퇴 상태와 수강 기간, 예약의 단건·반복·취소·출결 상태를 수강생 화면, 관리자 화면, HTTP API, DB RPC·트리거·RLS에서 대조했다.

후속 조사에서는 최종 DB 구조에서 130개 연속 동작 시나리오를 실행하고 추가 문제 2개를 확인했다. 상세 결과는 [예약과 상태 변경 연속 동작 검토](/Users/msyu/study/lestly/docs/reservation-transitions-audit-2026-10-30.md)를 따른다.

신규 예약 자격은 클래스와 수강생 상태의 9가지 조합에서 의도대로 제한된다. 다만 **반복 첫 회차 취소 후 남은 회차의 수정 실패**, **일반 취소 후에도 발송 가능한 리마인더**, **일괄 등록의 부분 실패 누락** 등을 포함한 7개 결함을 확인했다. 실제 공용 DB의 발생 건수나 현재 배포 상태를 측정한 결과는 아니며, 아래 재현은 저장소 코드와 격리 DB 기준이다.

## 상태별 신규 예약

표의 허용은 수강 기간·정원·중복·시간 규칙까지 통과하는 경우를 뜻한다. 학생 직접 신청과 관리자 대리 등록 모두 같은 자격 제한을 받는다. DB에 실제 인증 역할과 멤버십을 구성하여 9개 조합의 학생 예약 RPC와 관리자 등록 RPC를 각각 검사했다.

| 클래스 상태   | 수강 중 NORMAL                  | 수강 종료 GRADUATE | 탈퇴 DELETED |
| ------------- | ------------------------------- | ------------------ | ------------ |
| 활성 ACTIVE   | 학생 신청·관리자 대리 등록 가능 | 둘 다 불가         | 둘 다 불가   |
| 초안 DRAFT    | 둘 다 불가                      | 둘 다 불가         | 둘 다 불가   |
| 보관 ARCHIVED | 둘 다 불가                      | 둘 다 불가         | 둘 다 불가   |

학생 화면과 관리자 신규 등록 화면은 ACTIVE 클래스만 가져온다. 신규 예약에는 클래스가 반드시 필요하고, 예약 원본이 남은 클래스는 삭제할 수 없다. 공개 여부 `is_public`은 홍보 페이지 노출 조건이며, 조직 내 활성 클래스 예약 자격과는 별개다.

주요 근거: [DB 예약 검증](/Users/msyu/study/lestly/sql/migrations/0036_class_booking_policy.sql:80), [활성 클래스 조회](/Users/msyu/study/lestly/app/features/programs/queries.ts:51), [관리자 신규 등록 화면](/Users/msyu/study/lestly/app/features/admin/screens/schedules/create.tsx:26).

## 수강생 상태와 기간에 따른 기존 예약

| 조건                                  | 수강생 화면                                                          | 관리자 처리와 기존 예약                                                                       |
| ------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| NORMAL이고 수강 기간 안               | 예약 조회·신청·정책상 허용된 취소 가능                               | 단건·복수 학생·반복 등록 및 변경 가능                                                         |
| NORMAL이고 수강 시작 전               | 현재 날짜의 신청은 불가하며 수강 시작일 이후의 열린 날짜는 신청 가능 | 대상 수업 시작일이 수강 기간 안이어야 함                                                      |
| NORMAL이고 수강 기간 만료             | 로그인·기록 조회 유지, 신규 예약 불가                                | 기간 연장 후 예약 가능. 날짜 경과만으로 자동 상태 변경·예약 취소하지 않음                     |
| 종료일 당일                           | 수업 시작 날짜가 종료일이면 신청 가능                                | KST 시작 날짜 기준. 종료 시각이 다음 날인 경우도 시작 날짜로 판단                             |
| 수강 기간 미설정                      | 설정된 시작일·종료일만 각각 검사                                     | 단건 등록은 가능. 반복 등록은 종료일이 필요                                                   |
| GRADUATE로 변경                       | 로그인·종료 수업 기록 조회 가능, 신규 예약 불가                      | 시작 전 예약을 취소하고 초대·안내 중단. 진행 중 수업이 있으면 상태 변경 거절                  |
| DELETED로 변경                        | 로그인·기존 세션 차단, 서비스 이용 불가                              | 시작 전 예약 취소, 초대·안내 중단. 과거 수업 기록 유지                                        |
| GRADUATE 또는 DELETED에서 NORMAL 복귀 | 유효한 기간 안에서 다시 신청 가능. 탈퇴 복귀자는 새 로그인 필요      | 기존 수강 기간 유지. 취소된 예약은 복구하지 않음                                              |
| 수강 종료일을 앞당김                  | 새 기간 밖 신규 신청 불가                                            | 새 종료일 이후의 시작 전 예약을 확인 후 취소. 상태 변경·기간 변경과 예약 취소는 같은 트랜잭션 |

수강 기간은 프로필에 저장되며, 여러 조직에 연결된 프로필의 기간 변경에는 별도 보호가 있다. 수강생 유형은 분류 정보로 사용하며, 유형 사용 중지 자체가 기존 학생의 예약을 차단하는 조건은 아니다.

주요 근거: [수강생 운영 정책](/Users/msyu/study/lestly/docs/student-lifecycle-policy.md), [상태 변경과 예약 취소](/Users/msyu/study/lestly/sql/migrations/0027_attendance.sql:287), [기간 축소 트리거](/Users/msyu/study/lestly/sql/migrations/0024_student_lifecycle.sql:146), [수강생 캘린더](/Users/msyu/study/lestly/app/features/schedules/utils/student-calendar.server.ts:104).

## 클래스와 예약 상태 변경에 따른 처리

| 변경 또는 조건                           | 현재 동작                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| ACTIVE에서 DRAFT 또는 ARCHIVED로 변경    | 기존 예약은 남고 신규 신청만 차단. 학생은 본인 예약과 클래스 정보를 조회하고 취소 기한 안에서 취소 가능. 관리자 변경에는 아래 F4 화면 결함이 있음 |
| 정원 축소                                | 기존 예약을 지우지 않음. 신규 등록·시간 또는 클래스 변경·결석 복원은 정원 재검사. 이미 유효한 예약의 출석 확인은 허용                             |
| 허용 수업 길이 변경                      | 기존 길이는 보존. 같은 클래스 안에서 기존 길이를 유지한 이동은 가능. 클래스 변경 시 대상 클래스 길이 검사                                         |
| 예약 기간·휴무 요일·차단 시간 변경       | 기존 예약 유지. 학생 신규 예약에 새 설정 적용. 관리자의 직접 등록은 학생용 날짜 오픈·요일·시작 시각 차단·접수 마감의 예외                         |
| 취소 정책 변경                           | 기존 예약은 신청 당시 정책 유지. 학생은 새 정책과 취소 불가 예약 동의를 확인하여 신청                                                             |
| PENDING                                  | 유효 예약이며 정원·본인 중복에 포함. 종료되었더라도 출석 확인 전에는 학습 시간에 포함하지 않음                                                    |
| PRESENT                                  | 유효 예약. 종료 후 학습 시간에 포함. 일반 예약 수정·삭제는 출결 기록 보호에 의해 제한                                                             |
| ABSENT                                   | 예약 원본과 출결 이력은 남고 `cancelled_at` 설정. 일반 일정·정원·중복·학습 집계에서 제외                                                          |
| ABSENT에서 PRESENT 또는 PENDING으로 정정 | 시작된 수업의 출결 RPC에서 복구. 정원과 본인 중복 재검사. 클래스 보관·학생 수강 종료 후에도 과거 출결 정정은 별도 허용                            |
| 학생 예약 취소                           | 허용 기한 내 본인 예약 한 건을 물리 삭제. 직접 일정 변경 API는 없으며 취소 후 새 신청 방식                                                        |
| 관리자 반복 등록                         | 학생 한 명의 전체 회차는 하나의 RPC로 처리. 복수 학생 전체는 하나의 트랜잭션이 아니며 F3에 해당                                                   |
| 관리자 이후 일정 일괄 변경               | 선택 회차와 그 이후 실제 예약 행들을 시간 차이만큼 이동. 취소 회차 제외. 일반 수정은 출결 확인 이력이 있는 행을 변경할 수 없음                    |

한 학생의 겹치는 예약은 클래스를 통틀어 DB에서 차단한다. 정원은 클래스별 최대 동시 참여 인원이며 `[시작, 종료)` 구간으로 계산한다. 수강생별 특정 클래스 배정 테이블은 없으므로 같은 조직의 NORMAL 학생은 모든 ACTIVE 클래스를 선택할 수 있다. 클래스의 총 회차는 소개용이며 반복 생성 횟수는 수강 종료일로 정한다. 이 동작들은 현재 구현 범위로 확인했으며 결함 수에 포함하지 않았다.

주요 근거: [클래스별 정책](/Users/msyu/study/lestly/docs/class-booking-policy.md), [출결 보호](/Users/msyu/study/lestly/sql/migrations/0027_attendance.sql:36), [출결 정정](/Users/msyu/study/lestly/sql/migrations/0036_class_booking_policy.sql:229), [기존 출석 보존](/Users/msyu/study/lestly/sql/migrations/0037_preserve_existing_class_attendance.sql:2), [학생 취소 API](/Users/msyu/study/lestly/app/features/schedules/api/delete-schedule.tsx:21).

## 확인된 결함

P1은 예약 관리가 막히거나 취소된 수업 안내가 발송될 수 있어 우선 수정할 항목이다. P2는 특정 조건에서 결과 누락·화면 제한·검증 불일치가 발생하는 항목이다.

### F1 반복 첫 회차를 취소하면 남은 회차를 수정할 수 없음

**P1.** 반복 예약은 첫 예약 행을 부모로 참조한다. 첫 회차를 학생이 취소하거나 관리자가 단건 삭제하면 나머지 회차의 `parent_schedule_id`가 삭제된 행을 계속 가리킨다. 이후 단건·일괄 수정은 DB에서 `schedule_parent_not_eligible`로 거절된다. 남은 예약이 조회되지만 시간을 옮길 수 없는 상태다.

격리 DB에서 첫 회차와 다음 회차를 생성하고, 학생 역할로 첫 회차를 실제 삭제한 뒤 관리자 수정 RPC가 위 오류로 실패하는 것을 확인했다. 관리자 화면은 부모 ID가 있는 자식 회차에만 이후 일괄 삭제를 표시한다. 첫 회차에 `delete_scope=future`를 직접 보내도 서버가 단건만 삭제하는 별도 재현도 통과했다.

수정 시 반복 묶음의 식별을 삭제 가능한 첫 예약에서 분리하거나, 첫 회차 삭제와 남은 회차의 참조 정리를 하나의 트랜잭션에서 처리해야 한다. 첫 회차에도 이후 삭제를 제공하고 수정·삭제가 같은 반복 범위를 사용하도록 맞춰야 한다.

근거: [부모 예약 생성](/Users/msyu/study/lestly/sql/migrations/0024_student_lifecycle.sql:454), [삭제 대상 선택](/Users/msyu/study/lestly/app/features/admin/api/schedules/delete.tsx:39), [부모 존재 검사](/Users/msyu/study/lestly/sql/migrations/0036_class_booking_policy.sql:109).

### F2 일반 예약 취소와 변경이 대기 중인 안내에 반영되지 않음

**P1.** 예약을 물리 삭제해도 기존 예약 안내·리마인더에 발송 취소 표시를 하지 않는다. FK가 기존 알림의 예약 ID를 NULL로 바꾸며, 수신 학생이 NORMAL이면 `can_deliver_student_notification`이 계속 true를 반환한다. 따라서 발송 대기 중이던 리마인더가 취소 후에도 발송 대상에 남을 수 있다. 일정 변경에서도 기존 알림의 날짜·시각 변수가 갱신되거나 발송 취소되지 않는다.

격리 DB에 대기 리마인더를 만들고 학생 역할로 예약을 취소한 후, `email_status=PENDING`, `schedule_id=NULL`, `delivery_cancelled_at=NULL`, 발송 자격 true가 유지됨을 확인했다. 별도로 관리자 일정 이동 후에도 이전 날짜 변수가 PENDING 상태로 유지됨을 확인했다. 이메일 worker는 알림에 저장된 변수로 본문을 만들고 위 발송 자격 함수를 호출한다. 실제 메일·문자는 발송하지 않았다.

졸업·탈퇴·기간 축소·결석에는 알림 중단 처리가 있지만 일반 DELETE·UPDATE에는 같은 처리가 없다. 일반 취소 때 미발송 수업 안내와 리마인더를 먼저 무효화하고, 변경 때 최신 일정으로 안내를 재구성하거나 기존 대기를 취소해야 한다. 새 취소 통지까지 무효화하지 않도록 알림 종류를 구분해야 한다.

근거: [알림 FK](/Users/msyu/study/lestly/sql/migrations/0010_notifications.sql:96), [일정 수정 RPC](/Users/msyu/study/lestly/sql/migrations/0024_student_lifecycle.sql:475), [발송 자격 검사](/Users/msyu/study/lestly/sql/migrations/0024_student_lifecycle.sql:324), [이메일 변수 사용](/Users/msyu/study/lestly/app/features/notifications/api/email-cron.tsx:174).

### F3 여러 학생 등록에서 일부 실패가 화면에 전달되지 않음

**P2.** 관리자 등록은 학생별로 저장한다. 예를 들어 정상 학생 한 명과 수강 기간이 만료된 학생 한 명을 선택하면 정상 학생 예약은 저장하고 나머지는 실패할 수 있다. 그러나 실패가 하나라도 있고 전체 실패는 아니면 일반 성공과 같은 목록 URL로 이동한다. 실패한 학생 이름과 사유, 성공·실패 건수가 사라진다.

실제 create action에 첫 학생 성공·둘째 학생 DB 오류를 돌려주는 의존성을 연결하여, 두 학생 처리를 시도하고도 경고 없는 `/admin/schedules` 리디렉션만 반환하는 것을 확인했다. 운영자가 두 명 모두 등록됐다고 오인할 수 있다.

학생별 저장 정책을 유지하려면 성공한 학생과 실패한 학생을 응답·화면에 남기고 실패 건만 재시도하게 해야 한다. 전체 원자성을 요구한다면 복수 학생을 한 RPC에서 검증·저장해야 한다.

근거: [부분 실패 리디렉션](/Users/msyu/study/lestly/app/features/admin/api/schedules/create.tsx:194).

### F4 보관 클래스 예약을 유일한 활성 클래스로 옮길 수 없음

**P2.** 기존 클래스 A를 보관하고 활성 클래스 B만 한 개 남기면, 수정 loader는 B만 반환하지만 폼의 선택 상태는 A를 유지한다. 활성 클래스가 한 개일 때 클래스 선택기를 숨기므로 사용자가 선택 상태를 B로 바꿀 수 없다. `selectedProgram`이 없어 수정 완료 버튼도 비활성화된다.

실제 ScheduleForm을 렌더링하여 A 예약·B 한 개 조합에서 저장 버튼 비활성, B 예약·B 한 개 조합에서는 활성인 것을 확인했다. 이 검사는 React 상태와 제출 조건에 실제 소스를 사용했고 UI 기초 컴포넌트는 대체했다. 클래스 A가 DRAFT로 변경된 경우도 같은 조회·폼 분기에 해당한다.

신규 등록과 기존 예약 수정의 클래스 목록 처리를 구분해야 한다. 기존 비활성 클래스 표시와 다른 활성 클래스로의 명시적 선택을 제공하고, 제출 클래스 ID와 내부 선택 상태를 일치시켜야 한다. 비활성 클래스의 같은 클래스 내 이동 허용 여부는 별도 정책으로 정할 수 있다.

근거: [수정 loader](/Users/msyu/study/lestly/app/features/admin/screens/schedules/edit.tsx:42), [선택 상태](/Users/msyu/study/lestly/app/features/admin/components/schedule-form.tsx:97), [한 개일 때 선택기 생략](/Users/msyu/study/lestly/app/features/admin/components/schedule-form.tsx:367), [저장 제한](/Users/msyu/study/lestly/app/features/admin/components/schedule-form.tsx:568).

### F5 두 조직에서 수강 중이면 학생 예약과 캘린더가 실패함

**P2.** 데이터 모델은 한 프로필의 복수 조직 소속을 허용한다. 그러나 예약 생성과 예약 가능 시간 API는 조직 조건 없이 NORMAL 학생 멤버십 전체를 `.single()`로 읽고, 캘린더는 `.maybeSingle()`로 읽는다. NORMAL 소속이 두 개면 단일 행 조회가 실패한다. 생성 API는 소속이 없다는 400 오류, 가능 시간 API는 403, 캘린더는 오류를 던진다.

격리 DB에서 한 학생의 NORMAL 소속 두 개가 허용되고 학생에게 두 행 모두 조회됨을 확인했다. 실제 학생 생성 action에 해당 다중 행 오류를 연결하여 “소속된 조직이 없습니다.”로 응답하는 것을 확인했다.

선택 중인 조직을 화면·예약 요청에 명시하고 서버에서 그 조직의 멤버십을 검증해야 한다. 임의 첫 행을 택하는 방식은 예약 대상과 정책이 뒤섞일 수 있다. 관리자의 조직 선택도 첫 조직 기본값을 사용하므로 복수 조직 운영을 지원할 때 함께 점검할 대상이다.

근거: [예약 생성](/Users/msyu/study/lestly/app/features/schedules/api/create-schedule.tsx:53), [가능 시간 조회](/Users/msyu/study/lestly/app/features/schedules/api/booking-availability.tsx:28), [캘린더 조회](/Users/msyu/study/lestly/app/features/schedules/utils/student-calendar.server.ts:44).

### F6 관리자 RPC가 과거 날짜로 이동하는 요청을 허용함

**P2.** HTTP update action은 새 날짜가 오늘 이전이면 거절한다. 하지만 인증된 관리자에게 실행 권한을 준 `update_admin_schedule_batch`는 기존 예약 날짜만 검사한다. 학생 수강 기간 안이고 충돌이 없으면 미래 예약을 어제로 이동할 수 있다. 이는 학생의 관리자 권한 획득 문제가 아니라, 관리자에게 적용하는 날짜 제한이 HTTP와 DB에서 다른 문제다.

관리자 역할로 공개 RPC를 직접 호출하여 미래 예약의 시작·종료를 어제로 바꾸고, 실제 저장된 시작 시각이 과거임을 확인했다. 반면 다음 일반 수정에서는 기존 예약이 과거이므로 수정 대상에서 제외된다.

기존 예약 날짜뿐 아니라 전달받은 모든 대상 시작 날짜를 DB에서 검사해야 한다. 관리자 과거 예약 신규 등록도 현재 허용되므로, 과거 기록 입력과 일반 예약 이동을 서로 다른 정책으로 관리할 필요가 있다.

근거: [HTTP 대상 날짜 검사](/Users/msyu/study/lestly/app/features/admin/api/schedules/update.tsx:118), [RPC 기존 날짜만 검사](/Users/msyu/study/lestly/sql/migrations/0024_student_lifecycle.sql:472), [인증 사용자 실행 권한](/Users/msyu/study/lestly/sql/migrations/0024_student_lifecycle.sql:480).

### F7 수정 화면의 매주 반복 옵션이 저장에 반영되지 않음

**P2.** ScheduleForm은 수정 모드에서도 매주 반복 등록 체크박스를 표시하고 `is_recurring`을 제출한다. 하지만 update action은 이를 읽지 않고 `update_scope`에 따라 이미 존재하는 예약만 바꾼다. 단건 일정에서 체크해도 반복 회차가 만들어지지 않고, 반복 일정에서 해제해도 이후 회차가 없어지지 않는다. 첫 회차는 부모 ID가 없어 반복 묶음이어도 체크가 꺼진 상태로 초기화된다.

실제 update action에 단건 예약과 `is_recurring=true`를 전달하여, 반복 생성 없이 한 행의 update RPC만 호출함을 확인했다.

수정 시 지원하지 않는 옵션은 감추거나 읽기 정보로 표시해야 한다. 반복 전환·중단을 제공하려면 영향 회차를 표시하고 서버가 해당 동작을 실제 처리해야 한다. 첫 회차 반복 표시는 `rrule`도 함께 판단해야 한다.

근거: [반복 체크박스](/Users/msyu/study/lestly/app/features/admin/components/schedule-form.tsx:471), [단건 수정 요청](/Users/msyu/study/lestly/app/features/admin/api/schedules/update.tsx:229), [반복 기본값](/Users/msyu/study/lestly/app/features/admin/screens/schedules/edit.tsx:187).

## 검증 결과와 보존 위치

| 검증                          | 결과                                   |
| ----------------------------- | -------------------------------------- |
| 기존 단위 테스트              | 208개 통과                             |
| 기존 SQL 회귀 검사            | 131개 통과                             |
| 추가 SQL 검사                 | 15개 통과. 기존 검사와 함께 146개 통과 |
| 실제 action과 폼의 별도 재현  | 5개 통과                               |
| TypeScript와 라우트 타입 생성 | `npm run typecheck` 통과               |

추가 검사의 통과는 결함 동작과 상태 제한이 예상대로 재현됐다는 의미이며 수정 완료를 뜻하지 않는다. SQL 검사는 PGlite에서 전체 마이그레이션을 재생하여 실행했고, 각 시나리오는 롤백했다. 서버 action은 실제 소스에 명시적 대체 의존성을 연결했다. 브라우저 실제 클릭, 운영 DB 발생 건수, 다중 연결 동시성 및 실제 메시지 전송은 이번 검증 범위에 포함하지 않았다. 실행 환경은 Node `v25.9.0`이며 저장소 배포 기준은 Node 24다.

검증 스크립트와 로그는 [조사 산출물 폴더](/Users/msyu/study/output/lestly-booking-state-audit-20261030)에 보존했다. 주요 파일은 [추가 SQL 검사](/Users/msyu/study/output/lestly-booking-state-audit-20261030/extra-db-checks.mjs), [SQL 실행 결과](/Users/msyu/study/output/lestly-booking-state-audit-20261030/db-audit.log), [action과 폼 재현](/Users/msyu/study/output/lestly-booking-state-audit-20261030/route-audit.mjs), [재현 결과](/Users/msyu/study/output/lestly-booking-state-audit-20261030/route-audit.log)다.

원본 프로젝트 `/Users/msyu/study/lestly`를 사용했으며 worktree·clone·전체 복사본은 만들지 않았다. 이 검토 문서 외 애플리케이션·DB 소스 수정, 커밋·푸시·배포, 공용 DB 변경은 수행하지 않았다.
