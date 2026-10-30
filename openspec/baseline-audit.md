# 초기 정책 분석·도입 기록

분석 기준: `preview` / `6647fb055b406bd8176ebb8f1ce31ad5ea6b90e5`, 2026-10-30.
원본: `/Users/msyu/study/lestly`. 별도 worktree·clone·전체 복사본은 만들지 않았다.

> **후속 결정 (2026-10-31):** GAP-001은 현재 동작 정상으로 확정했다. GAP-002는 복수 조직 문제 확인 항목, GAP-003/004는 현재 미지원 유지, GAP-005 이후는 후속 정리로 보류한다. 아래 수치와 policy_review 6건은 최초 분석 시점의 기록이다. 현재 상태는 [GAP 검토 결과](known-gaps.md)와 `confirm-gap-review-outcomes` 변경 기록을 따른다.

## 분석 방법과 범위

- 전체 Git 추적 파일과 실제 소스 디렉터리를 조사하고 `app/routes.ts`에서 공개·인증·관리자·서비스 관리자·API 경로를 추적했다.
- 앱 TypeScript를 AST로 훑어 함수, 권한 guard, RPC, 테이블 접근, 입력 검증 위치를 식별한 뒤 기능별 주요 action/loader·정책 helper·화면 상태를 대조했다.
- feature별 schema와 SQL 0000~0039의 변경 순서를 조사했다. 특히 반복 변경·예약 검증의 최종 0039, 클래스 0036/0037, 취소 0035, 설정 0038, 수강생 상태·출결 0024/0027의 덮어쓰기 관계를 확인했다.
- 기존 단위·PGlite·SSR 검증을 실제 실행하고 기존 감사·정책·릴리스 문서와 비교했다. 외부 인증·실제 발송·실제 DB 경합은 재실행하지 않았다.
- `source-index.json`은 앱 333개를 포함한 first-party 소스·SQL·테스트·템플릿·도구·실행 설정 **533개**를 관리한다. 문서·이미지·의존성·빌드·생성 snapshot·운영 결과 JSON은 코드 인덱스에서 제외한다.
- 이 결과는 전체 파일의 정책 소유 영역과 현재 동작의 초기 기준이다. 모든 코드 줄의 정확성, 모든 입력·상태 조합의 검증, 보안 감사 완료를 보증하지 않는다. 테스트 연결은 요구사항 단위이며 시나리오별 실행 커버리지 측정값이 아니다.

## 정책 목록

14개 영역, 요구사항 56개, WHEN/THEN 시나리오 78개. 52개 요구사항은 자동 회귀 파일에 연결되었고 4개는 source-reviewed로 명시했다. 각 요구사항의 최소 한 구현 심벌/구문 anchor도 검사한다. anchor 존재는 의미적 일치의 증명이 아니다.

| 영역                  | 요구사항 | 시나리오 | 전용 자동 근거 부족 |
| --------------------- | -------: | -------: | ------------------: |
| identity              |        5 |        8 |                   1 |
| access-control        |        4 |        5 |                   0 |
| student-management    |        6 |        9 |                   0 |
| catalog               |        4 |        7 |                   0 |
| booking               |        7 |       12 |                   0 |
| recurring-schedules   |        4 |        7 |                   0 |
| attendance            |        3 |        4 |                   0 |
| organization-settings |        3 |        3 |                   0 |
| notifications         |        7 |        9 |                   2 |
| learning              |        3 |        3 |                   0 |
| public-service        |        2 |        2 |                   1 |
| payments              |        2 |        2 |                   0 |
| platform              |        3 |        3 |                   0 |
| spec-governance       |        3 |        4 |                   0 |

## 문서·구현 대조 결과

| 항목                       | 확인 내용                                                               | 처리                                           |
| -------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| 취소 설정 저장             | 과거 문서는 전체 저장, 최신 코드는 영역별 저장                          | SET-001/002가 현재 기준, 기존 문서는 이력 표시 |
| 학생 상태 도입             | 아키텍처에 별도 구현 예정 문구가 남아 있지만 RPC·차단·회귀 존재         | STU-005/006 및 구현 근거 연결                  |
| 예약 감사 결함             | 수정 전 F1~F7/N1~N2와 수정 후 동작 기록이 공존                          | SER·NOT·BOOK에 수정 후 계약, 과거 보고서 보존  |
| owner와 Organization/Class | README의 owner/클래스 용어가 실제 ADMIN/STUDENT 및 조직/프로그램과 다름 | SEC-001과 명세의 용어를 기준으로 사용          |
| 상담                       | 입력 UI가 남아 있지만 API는 503 중단                                    | PUB-001, GAP-005                               |
| 결제                       | 수강료 결제가 아니라 비운영 전용 서명 주문 데모                         | PAY-001/002, GAP-004                           |
| 인앱 알림                  | 개인 수신함이 아니라 조직 공통 읽음과 처리자 read_by                    | NOT-004에 실제 범위 명시                       |
| 테스트 발송 권한           | 공통 super_admin과 API의 SUPER_ADMIN/is_super_admin 판정 불일치         | GAP-007, 제품 코드는 이번에 수정하지 않음      |
| 발송 한도                  | 서버 로컬 자정, count/생성/로그가 별도 처리                             | NOT-006에서 관찰 조건만 명세화, GAP-008        |
| 출결과 상태 변경           | SQL 132개 연속 검사 중 6개는 진행 중 결석 복원 정책 질문                | GAP-001, 테스트 통과와 정책 확정을 분리        |
| 클래스 배정·회차 차감      | 별도 배정 계약·회차 소진 모델 없음                                      | GAP-003/004로 현재 미지원 범위 보존            |

## 도입한 관리 장치

- 루트 AGENTS와 Cursor 공통 진입점. 기존 Cursor의 실제 구조와 맞지 않는 형식상 export 강제·Supabase 위치 지시를 제거했다.
- OpenSpec **1.15.0** exact devDependency와 lockfile, 표준 Codex/Cursor core workflow.
- policy-map의 요구사항↔코드·심벌↔회귀 연결과 검증 상태.
- source-index와 신규 feature/마이그레이션의 명시적 분류 요구.
- `spec:context`로 도메인/경로의 관련 명세·심벌·테스트·명령만 조회.
- `spec:changed -- <base>`는 변경한 동작 영역의 명세 또는 요구사항 ID를 적은 change 문서를 요구한다. ID 언급의 설명 품질은 리뷰해야 한다.
- GitHub Actions PR/preview/main CI와 `verify:local`. CI 추가는 원격 required status 설정·실행 완료가 아니다.
- 과거 docs 23개 본문은 그대로 보존하고 이력 경계 배너만 붙였다.

## 실행 검증

Node **24.22.1**에서 실행했다.

| 검사                    | 결과                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| 기존 단위 테스트        | 215/215 통과                                                                                  |
| 격리 SQL                | 263/263 통과                                                                                  |
| SQL 연속 동작 하위 검사 | 132건, verified 126 / policy_review 6 / unexpected_failure 0                                  |
| 관리 도구 회귀          | 9/9 통과: 중복·누락 ID, 시나리오, 삭제 근거, 미분류·인덱스 차이, 경로, 변경 누락, 사라진 심벌 |
| TypeScript              | 통과                                                                                          |
| Production build        | 통과                                                                                          |
| SSR                     | 출결·학생 일정·유형·예약 정책·예약 기간·일반화 6종 통과                                       |
| spec:changed            | 기준 커밋 대비 제품 동작 변경 없음 확인                                                       |

`verify:local`에서 Supabase/DB/메일 자격을 시험용 값으로 덮어쓰고 Sentry upload·DSN·배포 worker 검사를 비활성화했다. SSR은 추가로 `.env`가 없는 빈 임시 작업 디렉터리와 최소 시험용 환경에서 6종 모두 통과했다. 파일 복사나 실제 사용자 계정은 사용하지 않는다.

기존 테마 cookie 미서명 안내 및 빌드 chunk 경고는 기존 앱의 경고다. 이번 관리 체계 작업에서 제품 동작을 바꾸지 않았다.

실행 로그 보관: `/Users/msyu/study/output/lestly-openspec-20261030/`. 명세 archive 후의 최종 구조·링크·검사 결과는 `verification-summary.json`를 따른다.

## 남은 범위와 운영 상태

[known-gaps.md](known-gaps.md)에 13개 항목을 상태별로 정리했다. AUTH-002, PUB-002, NOT-006, NOT-007은 전용 자동 근거 부족 상태를 유지한다. 원격 CI·required status, 실제 인증 제공자·PostgREST·2연결 경합·알림 전달은 이번에 검증하지 않았다.

제품 app·배포 SQL·실제 DB·원격 branch protection은 변경하지 않았다. 커밋·푸시·main 병합·운영 배포는 수행하지 않았다. 모든 변경은 원본 preview 작업 디렉터리에 남겨 검토 가능하게 한다.
