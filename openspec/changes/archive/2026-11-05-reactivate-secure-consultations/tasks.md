# Tasks

## 1. 공개 접수와 보안

- [x] 1.1 서버 CAPTCHA·요청 크기·IP/연락처/조직 제한·UUID 중복 방지와 공개 ACTIVE 재검사를 구현한다.
- [x] 1.2 신규 0042, Drizzle 모델과 과거 상담 보존·권한·부분 실패·재시도 DB 회귀를 구현한다.

## 2. 상담관리와 알림

- [x] 2.1 상담관리 목록/상세/전화 연결/상태·결과·메모 편집을 조직 권한과 함께 분리한다.
- [x] 2.2 유료 메시지와 독립된 인앱/푸시·상세 연결·구형 worker 호환성과 앱 복귀 갱신을 구현한다.

## 3. 검증과 기록

- [x] 3.1 관련 단위/DB/빌드 SSR 및 화면을 확인하고 전체 verify:local을 통과한다.
- [x] 3.2 policy-map/source-index/known-gaps와 실행 증거를 갱신하고 change를 검증·archive한다.

## Activation follow-up

실제 접수 활성화는 CAPTCHA/비밀키·안정 preview URL/Vault 설정, 백업·트랜잭션 기반 0042 적용, preview 배포와 실제 기기 수신 검증이 필요하다. 로컬 구현 완료와 구분한다.
