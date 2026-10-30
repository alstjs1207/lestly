# Design

## Context

현재 앱은 feature별 React Router 경로, TypeScript 정책 helper, Supabase RPC/RLS/트리거를 조합한다. SQL은 0039까지 정의를 덮어쓰며 과거 함수 파일·Drizzle snapshot만으로 현재 계약을 판단할 수 없다. 동기는 proposal.md를 따른다.

## Goals / Non-Goals

**Goals:** 도메인별 현재 계약, 안정적인 요구사항 ID, 코드·회귀 연결, 전체 파일 분류, 필요한 문맥만 조회, 변경 누락 검사.

**Non-Goals:** 이번 작업에서 제품 정책을 새로 결정하거나 상담·결제·회차 차감 기능을 구현하지 않는다. 운영 DB·권한·원격 branch protection·브랜치를 바꾸지 않는다.

## Decisions

1. OpenSpec 1.15.0을 exact devDependency와 lockfile에 고정하고 생성된 Codex/Cursor workflow를 추적한다. 전역 설치 대신 저장소 npm script를 사용한다.
2. 14개 capability를 기존 기능 경계로 나누고 app/UI/SQL의 내부 이름은 명세 본문보다 policy-map에 둔다. 전체 docs 복사 대신 현재 동작을 행위 계약으로 재작성한다. 미확정·미지원·검증 공백은 known-gaps에 둔다.
3. policy-map은 요구사항별 sources/tests와 automated/source-reviewed를 명시한다. automated는 연결 테스트의 존재이며 시나리오별 커버리지나 실행 결과가 아니다. 초기에 테스트 없는 경로를 숨기지 않는다.
4. source-index는 first-party app·SQL·Edge·테스트·메일 템플릿·스크립트·실행 설정·공개 실행 자산을 열거한다. 의존성·생성 빌드·migration meta snapshot·운영 결과 JSON·이미지는 제외한다. 새 feature와 0040 이후 migration은 의도적인 분류가 필요하다.
5. check는 실제 파일 목록과 index, 요구사항/시나리오와 map을 대조한다. source-only 정책을 automated로 오기록하면 연결 테스트가 없을 때 실패한다. 의미적 일치는 AI 검토와 실행 회귀가 담당한다.
6. changed 검사는 PR의 base SHA 대비 동작 파일 변경 영역마다 명세 수정 또는 요구사항 ID가 적힌 OpenSpec change 문서를 요구한다. 단순 ID 언급의 충분성은 리뷰 대상이며 이 검사는 정책 승인 자동화가 아니다.
7. verify:local은 Node 24·명세·checker 테스트·단위·PGlite·타입·빌드·SSR 6종을 실행한다. 실제 DB·로그인 E2E·외부 발송은 실행하지 않는다. VERCEL 표시를 비워 배포 전용 worker 검사가 실제 DB에 접근하지 않게 한다.
8. 과거 docs는 삭제하지 않고 이력 배너와 새 기준 경로를 붙인다. 오래된 Cursor의 모든 페이지 export 강제·임의 Supabase 폴더 규칙은 현재 구조와 다르므로 AGENTS 진입점으로 대체한다.

## Risks / Trade-offs

- 잘못된 기존 동작을 정상화할 위험 → 미확정 목록과 baseline 근거를 유지하고 새 제품 판단과 구분한다.
- 파일 연결만으로 테스트가 완전해 보일 위험 → 상태 정의·테스트 공백·실행 요약을 분리한다.
- 분류 규칙 유지 비용 → 새 feature·migration은 실패하여 의도적인 소유 명세를 지정하게 한다.
- CI만으로 병합 차단이 보장되지 않음 → 원격 required status 미설정 상태를 안내한다.
- 과거 SQL 함수와 최신 정의 차이 → 전체 migration 순서와 최종 PGlite 실행을 기준으로 분석한다.

## Migration Plan

기존 앱·SQL을 유지한 채 관리 파일과 devDependency를 추가하고 로컬 전체 검증 후 초기 change를 archive한다. 되돌리기는 관리 파일·의존성·CI 변경을 되돌리면 되며 고객 DB 복구는 필요 없다. 원격 커밋·푸시는 사용자 요청 시 별도 수행한다.
