# Preview activation

이 문서는 실제 적용 성공 기록이 아니다. 구현·로컬 검증과 외부 설정·배포를 구분한다. 기존 상담 이력·예약·원격 브랜치·원본 프로젝트는 유지한다.

## Prerequisites

- preview 환경변수: `VITE_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, 32자 이상 임의 비밀 `CONSULT_RATE_LIMIT_SECRET`(또는 충분한 길이의 `SESSION_SECRET`). 비밀은 로그/코드/채팅에 넣지 않는다.
- Turnstile widget에 안정적인 preview hostname을 허용한다. 클라이언트 action은 `consult_request`이며 서버에서 hostname과 함께 검증한다. 실제 접수에 테스트 키를 쓰지 않는다.
- 기존 `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`, `CRON_SECRET`을 확인한다. 사용 중인 VAPID 키를 임의 교체하지 않는다.

## Apply and verify

1. Node 24.22.1 이상에서 로컬 `verify:local`을 실행한다.
2. 실제 DB 적용이 요청되면 `node sql/operations/20261105_apply_consult_push_security.mjs`의 읽기 전용 preflight로 프로젝트/이전 migration hash/현재 행 상태를 확인한다.
3. `--apply`는 정확한 0042만 실행한다. public 테이블 잠금·migration 전 schema/행 백업(.vercel/backups, 0600, 읽기 재검증), 한 트랜잭션에서 DDL/원장 반영, 기존 모든 public 행 동일성·익명 권한 차단·상담 trigger·cron 확인 후 커밋한다. 새 NULL source 열은 기존 push event hash 비교에서 제외한다. 오류는 트랜잭션 롤백한다. 재실행은 동일 migration hash를 확인하고 이미 적용된 변경을 중복 실행하지 않는다.
4. Vault `lestly_consult_push_app_url`에 안정적인 preview origin(HTTPS, 끝 슬래시 없음)을 등록한다. 기존 `lestly_web_push_cron_secret`과 preview `CRON_SECRET`이 일치해야 한다. 기존 예약 cron의 app URL은 바꾸지 않는다. 상담 재시도 job은 이 새 URL이 없으면 HTTP 호출을 하지 않는다.
5. 승인된 preview 배포로 새 코드/서비스워커를 제공한다. main으로 병합하지 않는다.
6. 비회원 POST의 잘못된 출처/보안 확인/비공개 클래스 거절, 익명 직접 DB INSERT·RPC 거절, 관리자 자기 조직 상담 목록/상세/전화/수정, 알림 기능 off일 때 상담 종 아이콘을 확인한다.
7. 별도 승인된 합성 상담으로 PWA 구독 기기의 수신/상세 이동과 cron 재시도를 확인한다. iOS는 홈 화면 설치와 사용자 알림 허용이 필요하다. CAPTCHA·외부 발송이 포함된 실제 시험은 로컬 fixture 검사와 구분해 기록한다.

## Compatibility and recovery

0042는 과거 상담을 이동/재작성/삭제하지 않는다. 새 접수는 유료 발송 없이 bell/outbox를 함께 생성한다. 구형 운영 worker는 CONSULT_PENDING/CONSULT_SENDING을 가져가지 않는다. preview의 즉시 발송 장애는 보존된 outbox와 새 재시도 job이 처리한다. 구독을 끈 기기에는 발송하지 않지만 상담·bell은 남는다.

접수를 급히 닫아야 하면 preview의 상담용 설정을 비활성화해 API를 준비 중 상태로 유지하고 관리자 이력은 보존한다. 기존 예약/상담을 삭제하거나 구형 알림톡 trigger를 복구하는 방식으로 대응하지 않는다. 운영 이전 코드로만 롤백하면 상담 상세 링크를 지원하지 않으므로 관리자 조회 경로와 worker 설정을 함께 점검한다.

참고: [Turnstile 서버 검증](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Vercel 요청 헤더](https://vercel.com/docs/headers/request-headers), [iOS Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
