# Design

## 공개 API 경계

공개 API가 있다는 사실 자체가 임의 DB 실행·조회 권한을 의미하지 않는다. 상담은 허용 필드만 파싱하고 매개변수 바인딩으로 고정 SQL 함수를 호출한다. DB는 공개 ACTIVE 클래스를 재검사해 조직을 결정하며 익명·일반 인증 클라이언트는 이 함수/원본 테이블에 직접 쓸 수 없다. 관리자 목록·상세·수정은 별도 ADMIN/조직/타입 검사를 유지한다. 이름과 문의는 React 텍스트로 표시하며 HTML로 실행하지 않는다. 입력은 실제 16KiB·필드별 길이/형식으로 제한한다.

CAPTCHA를 UI/API/입력 스키마·구성에서 제거한다. 상담 readiness는 32자 이상 CONSULT_RATE_LIMIT_SECRET 또는 SESSION_SECRET만 요구하고 원문 IP/전화는 HMAC으로 구분한다. 기존 IP 10/10분, 조직+전화 3/시간, 조직 100/시간과 UUID 잠금/24시간 멱등 처리를 유지한다. 별도 일반 문의 페이지의 CAPTCHA와 공통 CSP는 변경하지 않는다.

## 범위와 한계

현재 한도는 일반적인 접수 도배와 DB/알림 누적량을 제한한다. 이미 앱과 DB까지 도달한 요청을 처리하므로 이것만으로 대규모 분산 서비스 거부 공격을 완전히 막는다고 주장하지 않는다. 실제 트래픽에서 필요한 CDN/WAF/엣지 제한은 별도 운영 설정이다. CAPTCHA도 SQL injection·조직 권한 검사를 대체하는 보안 경계로 간주하지 않는다.

기존 구현/검증 기록은 archive 이력으로 보존하고 이번 변경의 활성화 안내가 이를 대체한다. 실제 DB 적용·커밋·푸시·preview 배포는 아직 수행하지 않는다. 원본 preview 체크아웃을 계속 사용하며 새 작업 폴더는 만들지 않는다.

참고: [OWASP 권한 검증](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [SQL 바인딩](https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html), [DoS 방어 계층](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html).
