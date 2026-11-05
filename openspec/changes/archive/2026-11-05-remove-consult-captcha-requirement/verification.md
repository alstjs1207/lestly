# Verification

- 날짜: 2026-11-05, Asia/Seoul. 원본 `/Users/msyu/study/lestly`, `preview` working tree(기준 `259b588`), 별도 worktree/clone 없음.
- Node 24.22.1에서 `npm run verify:local` exit 0. spec-tools 10개, 단위 **237개**, 격리 PostgreSQL **281개**, 타입 검사, production 빌드, 빌드 라우트 SSR **7종** 통과.
- 상담 CAPTCHA/token/키 없이 HMAC 설정만으로 접수 경로가 열리며 요청 한도와 중복 처리가 유지되는 route/config 회귀 통과. 설정 누락, 위조 출처/메서드, 실제 본문 초과, malformed 입력, 조직/상태 위조, 저장 오류와 응답 비밀 유출 차단 검증 유지.
- 새 DB 회귀: SQL DELETE/스크립트 형태의 이름·문의 입력을 매개변수로 제출하고 원문 데이터로만 저장됨을 확인했다. 기존 profiles 전체 행이 동일하다. 기존 익명 직접 INSERT/RPC 차단, 타 조직/학생 조회·수정 차단, 원본 필드 보호와 저장/알림 롤백 검사도 통과했다. XSS 형태 문자열의 React 이스케이프는 기존 빌드 SSR 검사로 계속 통과했다.
- `npm run spec:changed -- 259b588`, change strict validation, `git diff --check`: 통과. 현재 명세를 먼저 동기화하고 전체 검사했으므로 archive에서 --skip-specs로 중복 동기화만 생략한다. 검증은 생략하지 않는다.
- 현재 미적용 migration SHA256: `0f1e43f40a5b4cde4d6b92fe96477f50e60406e1dcd45fb7f63bebace38cfa7e`. 0042 변경은 CAPTCHA 관련 주석 1건이며 DB 동작·권한·한도·데이터 보존 계약 변경 없음.
- 로그: `/Users/msyu/study/output/lestly-consultations-20261105/no-captcha-verify-local.log`. 이전 CAPTCHA 구현/검증은 앞선 archive의 당시 이력으로 보존하고 이번 명세/활성화 조건이 이를 대체한다.

## Limits

실제 DB 적용/고객 데이터 변경, 외부 발송, 기기 수신, 다중 DB 연결 경합, 원격 커밋/푸시/배포는 수행하지 않았다. 이 검증은 공개 경로의 취약점이 전혀 없거나 대규모 DDoS를 견딘다는 보증이 아니다. CAPTCHA 없이 신청 횟수/중복 제한으로 시작하며 필요한 엣지/WAF 제한은 실제 트래픽을 보고 별도로 결정한다. 기존 일반 문의의 CAPTCHA는 유지한다.
