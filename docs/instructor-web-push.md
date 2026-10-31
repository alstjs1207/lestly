> **이력 문서**: 현재 정책은 [OpenSpec 명세](../openspec/README.md)를 따른다. 이 문서는 당시 계획·구현·검증 기록이며 현재 지원 여부나 미해결 결함의 기준으로 단독 사용하지 않는다.

# 담당 강사 예약·취소 Web Push

수강생이 본인 수업을 예약·취소하면 클래스에 지정된 담당 강사 계정의 등록 기기로 푸시를 보낸다. 관리자 대리 등록·취소, 담당 강사가 없는 클래스, 로그인 계정이 연결되지 않은 강사에게는 발송하지 않는다. 기존 알림톡·이메일 템플릿 및 `notifications_enabled` 설정과 독립적으로 동작한다.

## 활성화

1. Node.js는 `.nvmrc`의 24.x 버전을 사용한다. `npm ci` 후 `0023_instructor_web_push.sql`까지 저장소의 마이그레이션 절차로 적용한다. `database.types.ts`와 Drizzle 스키마에도 변경을 반영했다.
2. 서버 환경에 다음 세 값을 설정한다. 키는 `npx web-push generate-vapid-keys --json`으로 한 번 생성하고 환경별로 안전하게 보관한다. private key를 브라우저용 환경 변수에 넣지 않는다.

   ```dotenv
   WEB_PUSH_VAPID_PUBLIC_KEY=<publicKey>
   WEB_PUSH_VAPID_PRIVATE_KEY=<privateKey>
   WEB_PUSH_VAPID_SUBJECT=mailto:<운영자 이메일>
   ```

3. 운영 적용은 `node sql/operations/20261024_apply_web_push.mjs preflight`로 사전 점검한 뒤 `apply`로 실행한다. 기존 `CRON_SECRET`과 운영 주소를 Supabase Vault의 `lestly_web_push_cron_secret`, `lestly_web_push_app_url`에 암호화해 보관하며, 앱/DB의 cron secret은 동일해야 한다. 새 `web-push-retry-job`은 1분마다 `/api/cron/push`를 POST로 호출한다. Vercel의 GET cron에 의존하지 않는다.
4. 강사 등록·수정에서 **예약·취소 알림을 받을 계정**을 연결한다. 현재 서비스에는 `STUDENT`, `ADMIN` 역할만 있으므로 같은 학원의 활성 관리자 로그인 계정만 선택할 수 있다. 이름으로 자동 연결하지 않는다.
5. 담당 강사가 해당 계정으로 로그인하고 **계정 설정 → 예약·취소 푸시 알림 → 이 기기 알림 켜기**를 누른다. 여러 기기는 각각 허용한다. iPhone·iPad는 iOS/iPadOS 16.4 이상에서 홈 화면에 추가한 Lestly 앱 안에서 진행한다.

서버 키가 없으면 설정 화면에는 준비 중으로 표시되며 실제 발송은 시작하지 않는다. 운영 적용 상태와 데이터 보존 검증 결과는 `sql/operations/20261024_web_push_*.result.json`을 확인한다.

## 발송 및 권한

- `schedules` AFTER INSERT/DELETE 트리거가 실제 로그인 수강생과 NORMAL 소속을 확인한다. 같은 트랜잭션에서 `push_events`와 기기별 `push_deliveries`를 기록한다. 예약 실패·롤백이면 알림도 남지 않는다. 취소 이벤트는 삭제된 일정의 정보를 보존한다.
- 수강생 API는 예약/취소 커밋 직후 해당 일정·수강생의 대기열을 처리한다. 즉시 발송 경로는 다음 cron 주기를 기다리지 않는다. 요청이 끝난 뒤 중단될 수 있는 fire-and-forget 작업을 사용하지 않는다.
- 브라우저 푸시 서버가 요청을 수락하면 기기별 `SENT`로 기록한다. 이 상태는 실제 기기 수신/읽음 확인을 뜻하지 않는다. OS·네트워크 상황으로 수신이 늦거나 TTL을 넘겨 만료될 수 있다.
- 발송 직전에 현재 담당 강사 연결, 활성 관리자 소속, 로그인 계정 연결, 구독 소유자와 만료를 다시 검사한다. 바뀐 계정이나 권한으로는 이전 이벤트를 발송하지 않는다. 기관 전체 관리자에게 일괄 발송하지 않는다.
- HTTP 404/410은 구독을 정리한다. 네트워크 오류·408·429·5xx는 지수 간격으로 최대 5회 시도한다. lease와 `FOR UPDATE SKIP LOCKED`로 동시 worker의 중복 처리를 방지하고 중단된 작업은 2분 뒤 회수한다. 24시간 이상 지난 이벤트는 발송하지 않는다.
- 공급자 수락 직후 DB 상태 저장이 실패한 경우 재전송 가능성이 있다. 동일 이벤트의 notification tag로 기기의 중복 표시를 줄인다. 정확히 한 번의 기기 수신을 보장하지 않는다.
- 로그아웃은 HttpOnly 기기 쿠키의 구독을 먼저 해제한다. 계정 전환·세션 만료 후 앱을 다시 열면 계정과 기기를 재검사한다. 다른 기기의 구독에는 영향을 주지 않는다. 이미 공급자가 수락한 메시지는 회수할 수 없다.
- 구독 endpoint와 암호화 키가 있는 테이블은 RLS를 켜고 anon/authenticated의 직접 접근 권한을 제거했다. 구독 API는 서버 인증과 같은 origin 검사로 소유자를 결정하며 외부 push 서비스 URL만 허용한다. 오류 기록에는 endpoint·키·학생 본문을 포함하지 않는다. 이벤트 스냅샷은 재시도 worker에서 30일 뒤 정리한다.
- 서비스 워커는 push/notificationclick만 처리한다. 로그인 HTML·API를 캐시하지 않으며, 알림 클릭은 인증된 `/admin/schedules` 화면으로 이동한다. 기존 종 아이콘 알림은 유지하고 페이지의 `new Notification()` 호출을 제거해 별도 브라우저 알림이 겹치지 않게 했다.

## 검증

`npm run typecheck`, `npm run test:unit`, `npm run test:db`로 타입·API·기기 등록·서비스 워커·실제 PostgreSQL 호환 트리거/권한/대기열을 검증한다. DB 검증은 자격 증명 없는 PGlite로 전체 마이그레이션을 재생하며 pg_cron/pg_net은 mock이다. 로컬 빌드는 외부 Sentry 업로드를 끈 상태에서 `SENTRY_AUTH_TOKEN='' npx react-router build`로 확인할 수 있다. 배포 prebuild의 기존 알림톡 인증 검사는 별도로 유지한다.

활성화 후 실제 iPhone PWA와 Android Chrome에서 화면을 닫고 예약·취소 수신, 두 기기 수신, 다른 강사 미수신, 클릭 후 인증, 로그아웃/계정 전환, 오프라인 복구를 검증해야 한다. 실제 cron 실행과 다중 DB 연결의 경합은 staging에서 확인해야 한다.
