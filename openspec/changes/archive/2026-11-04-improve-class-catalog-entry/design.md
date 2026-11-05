# Design

## Context

프로그램 폼의 슬러그는 HTML에서 항상 required지만 parseProgramForm과 DB는 null을 허용한다. 담당 강사는 전 계층 선택이며 DB는 조직 범위 FK를 유지한다. 강사 생성 API는 성공 시 목록으로 redirect하고, 클래스 폼에는 커리큘럼·파일 상태가 있어 화면 이동 시 보존할 수 없다.

## Goals / Non-Goals

현재 클래스 폼을 유지한 채 조건부 공개 검증과 강사 추가를 제공한다. 슬러그 정규화·대소문자 변경·중복 검사 API·계정 연결·알림 정책·기존 데이터 보정은 범위 밖이다.

## Decisions

- 공개 체크박스를 controlled state로 바꾸고 슬러그 입력을 DOM에 유지하면서 비공개 시 숨긴다. required는 공개 상태를 따른다. 해제 시 기존 입력을 지우지 않는다.
- 강사 Select에 미지정을 제공하고 실제 제출값은 별도 hidden input으로 빈 문자열/ID를 보낸다. 기존 서버 nullable 숫자 처리를 재사용한다.
- 별도의 모달 fetcher를 사용하고 모달 컴포넌트는 클래스 form의 sibling으로 렌더링한다. portal의 React 이벤트 버블링으로 클래스 form이 함께 제출되거나 중첩 form이 생성되는 문제를 피한다.
- 기존 강사 생성 API의 response_mode=inline만 JSON 성공 응답을 반환한다. 조직은 세션 관리자 guard에서 결정하며 제출된 조직 ID를 신뢰하지 않는다. 일반 강사 생성의 redirect·검증은 유지한다.
- 모달은 이름·선택 소개만 받는다. 사진·경력·SNS·알림 계정은 기존 강사 관리에서 보완한다. 생성한 ID를 목록과 선택 state에 반영하고 loader 재검증 목록과 ID로 병합한다. 부모 form과 파일 input을 재마운트하지 않는다.
- 0041 migration의 공개 슬러그 CHECK는 NOT VALID로 추가하여 기존 행을 수정·스캔하지 않으면서 신규 INSERT/UPDATE의 누락을 차단한다. 기존 slug UNIQUE와 강사 nullable/조직 FK는 유지한다.

## Risks / Trade-offs

- 모달 submit/Enter가 부모 form으로 전달될 위험 → sibling 구조와 브라우저 회귀에서 클래스 제출 횟수 0 확인.
- 실패 응답 이후 이전 성공을 다시 처리할 위험 → 모달 생명주기와 처리한 응답 추적으로 자동 선택을 한 번만 수행.
- 공개 토글 시 슬러그·커버 파일 손실 → input을 마운트한 채 유지하고 파일을 포함한 실제 브라우저 왕복 검증.
- 기존 공개/빈 슬러그 데이터 → migration은 보존하고 이후 수정 시 슬러그 보완 또는 비공개 전환을 요구한다.

## Migration Plan

0041을 먼저 적용한 뒤 새 앱을 배포한다. 이번 요청에서는 소스·로컬 검증만 수행한다. rollback은 새 CHECK 제거와 앱 rollback이며 고객 행 변경은 필요하지 않다.
