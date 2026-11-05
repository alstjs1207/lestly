# Proposal

## Why

사용자가 우려한 것은 공개 상담 API를 통한 권한 우회·데이터 침해다. CAPTCHA는 그 권한 경계를 대신하지 않으며 사용자는 우선 신청 횟수 제한과 중복 방지로 운영하기를 제안했다. 상담 접수의 외부 CAPTCHA 의존성을 제거하고 실제 공격 경계를 유지한다.

## What Changes

- 공개 상담에서 CAPTCHA widget/token/외부 검증과 키 등록 요구를 제거한다.
- HMAC 설정·신뢰 IP, IP/전화/조직 한도, UUID 중복 방지, 실제 본문 크기·스키마 검증을 유지한다.
- SEC-001·SEC-002·SEC-003의 조직 관리자/테넌트/동일 출처 검사와 서버 전용 SQL 경계를 유지하고 SQL/스크립트 형태 입력의 회귀 검증을 추가한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `public-service`: PUB-001 상담 CAPTCHA 제거. PUB-002의 별도 일반 문의 CAPTCHA는 유지한다.

## Impact

CAT-001 공개 ACTIVE 조건, PUB-003 기존 이력/상담관리, NOT-008 인앱·푸시 트랜잭션은 유지한다. 0042는 아직 실제 DB에 적용하지 않았고 이번에는 오래된 CAPTCHA 주석만 정리하며 DDL/권한/제한 정책은 바꾸지 않는다. PLAT-003에 따라 실제 DB·원격 배포를 실행하지 않는다. SPEC-002·SPEC-003 연결/검증 증거를 갱신한다.
