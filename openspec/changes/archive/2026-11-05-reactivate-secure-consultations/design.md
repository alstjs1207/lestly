# Design

## 저장과 호환성

기존 상담은 notifications(CONSULT_REQUEST)에 그대로 남긴다. 이력 이동/재작성/과거 푸시 재생은 없다. 신규 0042는 0013의 최종 on_consult_request_insert를 대체해 유료 메시지 대신 bell/outbox를 생성한다. push_events의 예약 식별자는 상담 행에서만 NULL을 허용하고 source CHECK로 예약과 상담을 구분한다. 기존 0023 예약 이벤트 생성 함수는 유지한다.

공유 DB의 구형 운영 worker가 상담을 SKIPPED로 소비하지 않도록 CONSULT_PENDING/CONSULT_SENDING을 사용한다. 기존 worker가 조회하는 PENDING/SENDING은 예약용으로 유지하고 신규 worker는 두 종류를 처리한다. 신규 `consult-push-retry-job`은 Vault `lestly_consult_push_app_url`의 안정적인 preview URL과 기존 `lestly_web_push_cron_secret`으로 매분 호출한다. 활성화 시 URL/키 일치와 작업 성공을 확인한다. 예약용 기존 cron URL은 바꾸지 않는다.

## 공개 경계와 경합

POST/동일 출처 → 실제 16KiB 제한/스키마 → HMAC IP 예산 → 완료된 request UUID+payload HMAC 확인 → Turnstile success/hostname/action 검증 → 서버 전용 SQL 함수 순서다. CAPTCHA 설정·HMAC 비밀·신뢰 가능한 운영 IP가 없거나 DB가 실패하면 503으로 닫는다. Vercel 배포에서는 플랫폼이 덮어쓰는 x-vercel-forwarded-for만 신뢰하며 일반 forwarded 헤더는 사용하지 않는다. 운영이 아닌 로컬은 단일 local 예산을 쓴다. Turnstile 장애·거부는 저장 없이 다시 검증하도록 안내한다.

IP 10회/10분, 조직+연락처 3회/시간, 조직 전체 100회/시간의 고정 시간창을 DB UPSERT로 제한한다. 원본 IP/번호를 제한 테이블에 남기지 않고 HMAC 구분자를 사용한다. IP 제한은 CAPTCHA 전에 별도 커밋하고 연락처·조직 제한은 접수 트랜잭션 안에 있다. UUID advisory lock과 PK가 같은 요청의 동시 중복을 막는다. 같은 UUID의 다른 payload는 409다. 성공한 요청은 24시간 내 재시도에서 단일사용 CAPTCHA를 재검증하지 않는다. 키/예산의 만료 행은 다음 요청에서 정리하며 상담 이력은 삭제하지 않는다.

공개/ACTIVE 프로그램을 FOR SHARE로 재검사해 조직은 DB에서 결정한다. 상담·종 아이콘·각 활성 ADMIN의 푸시 이벤트/구독별 delivery 생성 중 하나라도 실패하면 모두 롤백한다. 익명/일반 인증 사용자는 전용 함수·제한 테이블을 직접 호출/수정할 수 없다. 계정/수강생 생성은 없다.

## 관리자와 알림

관리자 loader/action은 NORMAL ADMIN guard와 조직+타입+ID 조건을 각각 적용한다. 업데이트는 상태/결과/메모만 허용하고 DB invoker trigger도 원본 필드를 보호한다. 완료 시각/담당자는 DB에서 기록하고 대기로 복귀하면 완료 필드를 지운다. 기존 메모·결과·완료 시각은 migration에서 수정하지 않는다. 종 아이콘 읽음과 상담 상태는 독립이다.

notifications_enabled가 false이면 bell API의 목록/count/읽음을 SYS_CONSULT_ADMIN으로 제한한다. 공통 읽음 상태는 기존대로 유지한다. 최신9건 밖을 포함한 미읽음 수는 서버에서 세며 PWA 복귀/focus 때 갱신한다. 상담 상세 링크와 전화 링크는 중첩하지 않는다.

잠금화면 푸시에는 전화·이름·문의 전문을 넣지 않는다. 클릭 URL은 `/admin/consultations/<positive-id>` 또는 기존 일정 화면만 허용하며 인증·조직 검사는 도착 화면이 수행한다. 구독 만료/권한 회수/계정 전환 재검사, lease, claim token, 재시도는 기존 계약을 유지한다.

## 활성화 조건

preview 환경에 VITE_TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, 32자 이상 CONSULT_RATE_LIMIT_SECRET(또는 SESSION_SECRET), 기존 Web Push VAPID 3종과 CRON_SECRET이 필요하다. Turnstile 허용 hostname에 안정적인 preview 도메인을 등록해야 한다. test secret을 실제 접수에 사용하지 않는다. 현재 로컬 .env에는 CAPTCHA/푸시 설정이 없으며 운영 등록 여부는 검증하지 않았다.

검증은 단위·PGlite·실제 빌드 SSR·모바일/데스크톱 화면을 구분한다. 실제 Cloudflare 토큰/기기 전송, 실제 두 DB 연결 경합, Vault·pg_cron 실행은 로컬 성공으로 주장하지 않는다.
