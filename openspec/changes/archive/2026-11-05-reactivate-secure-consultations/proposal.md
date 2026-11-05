# Proposal

## Why

사용자가 보안 문제로 중단했던 공개 상담을 재개하고, 상담관리와 종 아이콘·PWA 푸시로 처리하기를 요청했다. 기존 이력을 보존하면서 유료 메시지 경로와 접수 남용을 분리해야 한다.

## What Changes

- 공개 ACTIVE 클래스의 비회원 상담을 서버 CAPTCHA·분산 요청 제한·중복 방지로 재개한다. 검증 설정이 없으면 접수하지 않는다.
- 기존 notifications의 CONSULT_REQUEST와 처리 이력은 유지하고 상담 목록·상세·전화 연결을 별도 관리자 메뉴로 제공한다.
- 신규 상담은 유료 알림톡·메일을 만들지 않고 상담·공통 인앱 알림·기기 푸시 대기열을 함께 저장한다. 푸시 실패는 접수 성공과 분리한다.
- 알림관리 기능 설정을 꺼도 상담 목록과 상담 종 아이콘은 이용한다. 기존 예약 알림 설정은 유지한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `public-service`: PUB-001 접수 재개/남용 방지, PUB-003 상담관리/기존 이력 보존.
- `notifications`: NOT-001 상담 분리 예외, NOT-004 종 아이콘 연결, NOT-005 상담 푸시, NOT-008 원자적인 상담 알림.

## Impact

SEC-001·SEC-002·SEC-003의 관리자/조직/출처 검증을 보존한다. CAT-001의 공개 ACTIVE 조건을 접수 트랜잭션에서 다시 확인한다. STU-001의 수강생 등록과 별개로 상담은 계정·수강생을 만들지 않는다. PLAT-001·PLAT-003에 따라 Node 24.22.1에서 격리 검증하고, 기존 운영 worker와 신규 preview 이벤트를 분리한다. SPEC-002·SPEC-003의 source-index와 실행 증거를 갱신한다. 원본 `/Users/msyu/study/lestly`의 preview에서 작업하며 별도 복사·worktree를 만들지 않는다. 실제 DB 적용·환경변수 등록·원격 배포는 로컬 구현 검증과 구분해 기록한다.
