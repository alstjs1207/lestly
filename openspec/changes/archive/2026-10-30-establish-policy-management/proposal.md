# Proposal

## Why

Lestly의 정책·수정 전 감사·적용 이력이 섞여 AI가 매번 현재 동작을 다시 조사하고 오래된 설명을 따를 수 있다. preview 6647fb0의 코드·SQL·테스트를 대조해 현재 계약과 검증 공백을 구분하고 변경 관리와 자동 검증을 도입한다.

## What Changes

- 짧은 AGENTS.md와 기존 Cursor 지침의 단일 진입점을 작성한다.
- 전체 코드 경로를 명세 영역에 분류하고 요구사항 ID·구현·테스트 근거를 연결한다.
- OpenSpec 1.15.0과 Codex/Cursor 워크플로를 저장소에 고정한다.
- 명세·근거·소스 누락 검사 및 PR/브랜치 CI를 도입한다.
- 과거 문서를 이력으로 표시하고 미확정·미지원 동작을 별도 목록으로 보존한다.

## Capabilities

### New Capabilities

아래는 새로 문서화하는 capability이며 기존 앱 동작을 새로 구현한다는 뜻이 아니다.

- `identity`: 로그인·관리자 가입·초대·계정.
- `access-control`: 조직 권한·RLS·동일 출처·작업자 인증.
- `student-management`: 수강생 등록·유형·수강 기간·상태.
- `catalog`: 클래스·강사·공개 소개.
- `booking`: 학생 예약·정원·시간·취소.
- `recurring-schedules`: 관리자 반복·일괄 예약과 변경.
- `attendance`: 출결·취소·이력·복원.
- `organization-settings`: 영역별 독립 설정 저장.
- `notifications`: 알림톡·이메일·기기 푸시·인앱 알림.
- `learning`: 출석 기반 학습 기록·시간·로컬 회고.
- `public-service`: 상담 중단·문의·약관.
- `payments`: 결제 데모 경계와 내역.
- `platform`: 런타임·라우팅·SSR·마이그레이션 경계.
- `spec-governance`: 정책·소스·검증 연결과 변경 누락 검사.

### Modified Capabilities

없음. 기존 OpenSpec 명세가 없는 저장소의 최초 도입이다.

## Impact

문서·개발 도구·CI·개발 의존성이 변경된다. app 동작, 배포된 SQL, 고객 데이터, 운영 권한은 변경하지 않는다. 사용자 요청은 분석과 관리 체계 구현까지 포함하며 커밋·푸시·운영 배포는 포함하지 않는다.
