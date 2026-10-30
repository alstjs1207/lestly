# Tasks

## 1. 기준과 도구

- [x] 1.1 preview 6647fb0과 clean status를 기록하고 전체 추적 소스·라우트·기능별 정책 경로를 분류한다. source-index 및 baseline-audit로 범위를 확인한다.
- [x] 1.2 OpenSpec 1.15.0을 고정 의존성으로 설치하고 Codex/Cursor 워크플로를 생성한다. CLI 버전과 package-lock을 확인한다.
- [x] 1.3 AGENTS·README·Cursor 진입점과 짧은 config를 작성한다. 문서가 한 현재 정책 기준을 가리키는지 확인한다.

## 2. 현재 정책과 분석 근거

- [x] 2.1 코드·최종 마이그레이션·기존 테스트를 대조해 14개 capability와 요구사항·WHEN/THEN을 작성한다. OpenSpec strict validation으로 확인한다.
- [x] 2.2 요구사항별 구현·테스트 연결과 automated/source-reviewed를 기록한다. 누락 경로·중복 ID·시나리오를 spec:check로 검사한다.
- [x] 2.3 기존 docs에 이력 경계를 붙이고 정책 질문·미지원·소스 불일치·통합 검증 공백을 known-gaps에 기록한다. 기존 문서 본문과 앱 동작 보존을 diff로 확인한다.

## 3. 검증 장치

- [x] 3.1 spec:index/context/check/changed를 구현하고 정상·근거 삭제·중복 ID·미분류·경로 탈출·변경 누락 회귀 9개를 통과시킨다.
- [x] 3.2 전체 로컬 검증과 PR/preview/main CI를 추가한다. 외부 자격 대신 fixture 값을 사용하고 실제 worker·DB 적용이 포함되지 않는지 확인한다.
- [x] 3.3 Node 24에서 verify:local과 CI와 같은 비밀 값 없는 실행을 확인한다. 결과와 한계를 baseline-audit에 기록한다.

## 4. 통합 확인

- [x] 4.1 delta 정책 연결·소스 인덱스·형식·앱/SQL 무변경을 검증한다. 최종 diff와 spec:check 결과를 기록한다.

## Workflow follow-up

- 모든 구현·검증이 끝나면 establish-policy-management를 archive해 현재 specs를 생성한다.
- archive 후 strict validation과 근거 연결 검사를 다시 실행한다.
- 원격 커밋·푸시·branch protection·운영 배포는 별도 사용자 요청 범위다.
