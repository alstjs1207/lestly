# Verification

- 날짜: 2026-11-05 (Asia/Seoul). 원본 `/Users/msyu/study/lestly`, 브랜치 `preview`, 기준 커밋 `259b588`. 이번 작업은 변경된 working tree에서 검증했다.
- 런타임: Node **24.22.1** (`/private/tmp/lestly-push-node24/node_modules/node/bin/node`).
- `npm run verify:local`: **exit 0**. verify:node, spec:check, spec-tools 10개, 단위 **238개**, 격리 PostgreSQL **280개**, 타입 검사, 프로덕션 빌드, 실제 빌드 라우트 SSR **7종** 통과.
- 단위 검증: 공개 API의 출처/메서드/본문 제한/필드 위조/CAPTCHA/설정 누락/저장 실패/성공 재시도, CAPTCHA hostname/action, 신뢰 IP/HMAC, 상담 상세 권한/수정 범위/전화 링크, 알림 기능 비활성 때 bell 목록/count/읽음, 푸시 상세 경로와 서비스워커 외부 URL 거부/구독 worker 갱신.
- DB 검증: 0042 전후 기존 public 전체 행 동일(기존 완료 상담의 내용·메모·결과 포함), 익명/일반 인증의 직접 쓰기·함수·제한 데이터 접근 거절, 공개 ACTIVE 재검사, 단일 상담+bell+조직 관리자 outbox, 알림톡/메일/계정 생성 없음, 중복 UUID, IP/전화/조직 한도, outbox 부분 실패 전체 롤백, 타 조직/학생 조회·수정 차단, 원본 필드/NULL 상태 보호, 완료 담당자/시각과 대기 복귀, 구형 worker 격리와 lease 재시도/권한 회수 재검사.
- 새 SSR: 실제 빌드 라우트의 목록/상세/빈 목록/전화 링크/수정 폼/HTML 이스케이프 검증. 실제 loader나 외부 API를 호출하지 않는 합성 fixture다.
- 브라우저 시각 검증: 실제 빌드 CSS/SSR fixture를 로컬 임시 서버에서 확인. 1440px 데스크톱, 390px 모바일 목록/상세, 320px 목록과 빈 상태. 320px의 documentWidth=320, 390px의 documentWidth=390. 전화 영역의 hit target은 `tel:01012345678`로 상세 링크에 가려지지 않았다.
- 스크린샷/전체 로그: `/Users/msyu/study/output/lestly-consultations-20261105/`. 임시 브라우저 공간을 종료하고 직접 띄운 서버(53743 포트)와 임시 HTML/빌드 자산 심볼릭 링크를 제거했다. 다른 앱의 서버는 건드리지 않았다.
- 마지막 화면 마감(긴 이름 줄바꿈, 기존 9자리 지역 전화 링크) 후 상담관리 단위 4개·타입·빌드·상담 SSR을 다시 통과했다. 상세 검증 로그: `output/lestly-consultations-20261105/final-check.log`.
- `npm run spec:changed -- 259b588`, archive 후 `npm run spec:check`, `git diff --check`: 통과.
- `node --check sql/operations/20261105_apply_consult_push_security.mjs`: 통과. 이 스크립트는 실행하지 않았으며 실제 DB dry-run/apply 결과가 아니다.
- migration SHA256: `ed0a60c366e9b347d7deff7eb7417a867b45ef1f638d144dff08431c3cd44df3`.
- 빌드에는 기존 Radix 컴포넌트의 sourcemap/module directive 경고, SSR에는 기존 theme cookie 서명 경고가 남으며 명령은 성공했다. 새 상담 검사 실패는 없다.

## Limits and activation

실제 Supabase 변경, 운영 데이터 조회/작성, Cloudflare 토큰 검증, 실제 기기 푸시/통화, Vault·pg_cron, 실제 다중 연결 경합, preview 원격 배포는 수행하지 않았다. 로컬 .env에는 CAPTCHA/HMAC·VAPID 준비가 없고 preview 등록 여부는 검증하지 않았다. 설정 누락 시 공개 접수는 503/준비 중 상태다. 실제 접수 활성화는 deployment.md의 환경변수·백업 적용·worker URL·기기 검증 절차를 따른다. main 병합·커밋·푸시도 수행하지 않았다.

현재 명세를 구현과 함께 먼저 동기화하고 전체 검증했다. archive는 동기화된 명세를 다시 덮어쓰지 않도록 `--skip-specs`를 사용하며 검증 자체는 건너뛰지 않는다.
