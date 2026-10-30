# Lestly 정책 관리

기준: `preview`의 `6647fb055b406bd8176ebb8f1ce31ad5ea6b90e5` (2026-10-30). 이번 도입은 기존 앱 동작을 바꾸지 않고 코드·SQL·기존 정책·테스트를 대조해 초기 명세를 만든다. 이후 변경은 아래 절차로 현재 명세에 반영한다.

## 읽는 순서

1. 루트 `AGENTS.md`.
2. `npm run spec:context -- <domain-or-path>`가 가리키는 명세와 근거.
3. 관련 active change와 [미확정·미구현 목록](known-gaps.md).
4. 설계 배경이 필요할 때만 기존 docs 또는 archive.

| 영역                        | 명세                                                         |
| --------------------------- | ------------------------------------------------------------ |
| 인증·로그인·초대·계정       | [identity](specs/identity/spec.md)                           |
| 조직 권한·RLS·요청 보안     | [access-control](specs/access-control/spec.md)               |
| 수강생 등록·상태·분류       | [student-management](specs/student-management/spec.md)       |
| 클래스·강사·공개 소개       | [catalog](specs/catalog/spec.md)                             |
| 예약 시간·정원·취소         | [booking](specs/booking/spec.md)                             |
| 관리자 단건·반복·일괄 예약  | [recurring-schedules](specs/recurring-schedules/spec.md)     |
| 출결·취소·정정              | [attendance](specs/attendance/spec.md)                       |
| 조직 설정·영역별 저장       | [organization-settings](specs/organization-settings/spec.md) |
| 알림·메일·알림톡·기기 푸시  | [notifications](specs/notifications/spec.md)                 |
| 학습 기록·통계·로컬 회고    | [learning](specs/learning/spec.md)                           |
| 상담 중단·문의·법적 페이지  | [public-service](specs/public-service/spec.md)               |
| 결제 데모·결제 내역         | [payments](specs/payments/spec.md)                           |
| 런타임·라우트·SSR·운영 경계 | [platform](specs/platform/spec.md)                           |
| 명세·근거·변경 관리         | [spec-governance](specs/spec-governance/spec.md)             |

## 무엇이 기준인가

- `specs/`: 현재 지원하는 동작의 계약. 이번 기준은 코드·SQL에서 관찰한 동작과 기존 제품 정책을 대조한 결과이며 모든 제품 판단을 새로 승인받았다는 의미는 아니다.
- `changes/<name>/`: 제안 또는 진행 중인 변경. 미구현 제안을 현재 지원 기능으로 쓰지 않는다.
- `changes/archive/`: 완료한 변경 이력. 현재 규칙 검색의 기본 입력에서 제외한다.
- `known-gaps.md`: 정책 질문, 현재 미지원 기능, 검증 공백. 발견은 수정 승인·미래 기능 확약이 아니다.
- `policy-map.json`: 요구사항 ID와 구현·검증 파일 연결. 경로와 anchor 유효성은 검사하지만 코드의 의미적 일치를 증명하지 않는다.
- `source-index.json`: 모든 관리 대상 코드·SQL·테스트·도구·설정 파일의 위치와 관련 명세. 파일 분류는 개별 동작의 검증 완료를 의미하지 않는다.
- `baseline-audit.md`: 이번 분석 범위·모순·실행 증거·한계. `docs/`의 이전 기록은 이력으로 보존한다.

사용자 지시는 가장 우선한다. 명세·기존 문서·구현 사이에 차이가 있으면 명세를 조용히 코드에 맞추지 말고 재현·근거를 확인한다. 정책 변경이 필요하면 change에 기록한다.

## 근거 상태

`automated`는 연결된 실행 테스트가 있다는 의미다. 모든 시나리오가 테스트되거나 최근 실행이 통과했다는 의미가 아니다. `source-reviewed`는 구현을 읽었지만 요구사항 전용 회귀 테스트 연결이 부족한 항목이다. `known-gaps.md`의 정책 질문은 통과 테스트와 별개로 남는다. 실행 결과는 날짜·커밋과 함께 audit 또는 change 검증 기록에 적는다.

## 일상 작업

```sh
npm ci
npm run spec:context -- booking
npm run spec -- new change describe-the-change
npm run spec -- status --change describe-the-change
npm run spec -- instructions proposal --change describe-the-change
```

표준 schema는 proposal → specs/design → tasks를 사용한다. 동작 변경은 `ADDED/MODIFIED/REMOVED Requirements`와 `#### Scenario:`의 WHEN/THEN으로 작성한다. 기존 요구사항 ID를 유지하고 각 시나리오에서 주체·조직·이전 상태·동작·결과·데이터 보존을 구체화한다. 변경이 정책을 바꾸지 않는다면 그 이유와 기존 요구사항·테스트 근거를 기록한다.

Codex에는 `.agents/skills/openspec-*`, Cursor에는 `.cursor/skills/openspec-*`와 `.cursor/commands/opsx-*.md`가 설치되어 있다. Codex CLI/IDE에서는 `$openspec-propose`, `$openspec-apply-change`, `$openspec-archive-change`를 사용할 수 있다. 명령 표기는 도구에 따라 다르므로 이 저장소의 고정 CLI는 `npm run spec -- ...`로 실행한다. 사용자 요청이 구현까지 포함하면 루트 지침에 따라 이미 승인된 범위를 진행한다.

```sh
npm run spec:index
npm run spec:check
npm run verify:local
npm run spec -- validate describe-the-change --strict
npm run spec -- archive describe-the-change --yes
npm run spec:check
```

archive 전 실제 검증 기록과 tasks를 확인한다. archive 후 main spec과 연결표를 다시 검사한다. CLI 검증은 문서 구조 검사이며 구현 완료 보증이 아니다. 새 명세를 archive 전에 검증할 때 `policy-map.json`은 아직 없는 main spec 대신 active change의 새 capability를 읽을 수 있다.

`npm run spec:context -- app/features/schedules/api/create-schedule.tsx`처럼 경로로도 찾을 수 있다. 전체 인덱스를 대화에 넣지 않아도 된다. `config.yaml`에는 짧은 공통 조건만 유지한다.

## CI와 변경 누락 검사

GitHub Actions의 `Policy and regression checks`는 PR 및 preview/main 푸시에 로컬 검증을 실행한다. PR에서는 base SHA를 기준으로 `npm run spec:changed -- <base-sha>`도 실행한다. 동작 코드가 바뀐 각 영역에는 해당 명세 변경 또는 그 영역의 요구사항 ID를 적은 change 기록이 필요하다. 연결표의 `domains`에 ID만 넣는 편법은 허용하지 않고 실제 change 문서에서 요구사항 ID를 확인한다. 이 검사는 설명의 충분함·정확함까지 판단하지 않으므로 리뷰와 회귀 테스트가 필요하다.

규칙은 로컬/CI 실행으로 강제된다. GitHub branch protection의 required status 설정은 원격 관리자 설정이므로 이번 도입에서 변경하지 않는다. 설정 전에는 실패한 체크가 있어도 관리자에 의한 병합을 기술적으로 차단하지 못할 수 있다.

## 검증과 운영의 구분

`verify:local`은 운영 비밀 값 없이 실행하며 PGlite fixture를 사용한다. `test:e2e`, `sql/operations/`의 실제 DB 검증, 배포 시 `verify:worker`는 외부 환경이 필요한 별도 범위다. preview와 운영의 DB 공유는 의도된 구성이다. 이 안내를 공유 DB에 테스트 데이터를 작성할 권한으로 해석하지 않는다.

참조: [OpenSpec](https://openspec.dev/docs/quickstart), [설정](https://openspec.dev/docs/project-config), [기존 프로젝트](https://github.com/Fission-AI/OpenSpec/blob/main/docs/existing-projects.md), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
