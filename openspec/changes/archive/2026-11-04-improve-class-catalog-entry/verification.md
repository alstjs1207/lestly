# 검증 기록 — 2026-11-04

## 범위와 기준

- 작업 경로: `/Users/msyu/study/lestly`, preview `2a787d1` 기준의 미커밋 변경.
- Node 24.22.1에서 검증했다. 원본 저장소를 재사용했으며 worktree·clone은 만들지 않았다.
- 고객 DB 접속·시험 데이터·0041 실제 적용·커밋·푸시·배포는 수행하지 않았다.

## 실행 결과

| 검사 | 결과 |
| --- | --- |
| `npm run verify:local` | 최종 전체 실행 exit 0 |
| `test:unit` | 222개 통과, 실패 0 |
| `test:db` | PGlite 272개 통과, 기존 booking lifecycle 132개 포함 |
| `typecheck`, `build`, `test:ssr` | 타입·빌드·SSR 6종 통과 |
| `test:spec-tools` | 최종 신규 파일 분류 보완 후 10개 통과 |
| `spec:check`, `spec:changed -- HEAD` | 통과; 영향 영역 catalog·platform |
| `openspec validate improve-class-catalog-entry --strict` | 통과 |
| Prettier와 `git diff --check` | 수정 코드/테스트 형식 확인 |

## 단위와 DB 회귀

- `catalog-form.test.ts`: DRAFT/ACTIVE/ARCHIVED 모두 비공개·빈 슬러그 허용, 공개·누락/공백 슬러그 거절, 유효 공개 슬러그와 강사 미지정 허용, 공개 해제 시 기존 슬러그 유지.
- `catalog-entry.test.ts`: 실제 강사 생성 action의 모달 JSON·일반 redirect, 세션 조직 사용, 권한 거절·입력 오류·계정 범위 오류·저장 오류 검증. VM 객체 prototype 차이는 개별 응답 값 검사로 해결했다.
- `sql/checks/catalog-entry.mjs`: 0041의 NOT VALID 설치 시 기존 공개/빈 슬러그와 예약·출결을 변경하지 않음, 새 공개 저장과 공개 전환의 누락/공백/탭 거절, 복수 비공개 null 허용, 조직·공개 여부를 넘는 전역 중복 방지와 기존 대소문자 정책 보존, 강사 없는 활성 클래스의 실제 예약 INSERT 및 강사 해제 후 기존 예약 보존.
- `service-generalization-ssr.mjs`: 비공개 입력의 required 해제, 공개 required와 기존 슬러그, 미지정·강사 추가 렌더링. Radix Select의 초기 서버 렌더링에도 미지정/선택 강사명을 명시했다.
- 새 `inline-instructor-dialog.tsx`와 migration 0041을 catalog 영역에 명시적으로 등록하고 도구 회귀에 분류 검사를 추가했다.

## 브라우저 검증

`ego-browser`와 실제 ProgramForm/InlineInstructorDialog, React Router createMemoryRouter/useFetcher를 사용했다. 액션·loader만 브라우저 메모리에서 처리하므로 고객 API·파일 업로드·강사/클래스 저장을 호출하지 않았다.

- 생성 폼에서 클래스명·부제목·소개·시간·추가 길이·가격·커리큘럼과 실제 선택 File 객체를 준비했다.
- 공개 토글 왕복에서 required 상태와 기존 슬러그 유지 확인.
- 모달 폼과 부모 클래스 폼이 sibling이며 중첩 form 0개 확인.
- 모달 취소 후 부모 입력/선택 유지, 요청 0회 확인.
- Enter로 모달만 제출하고 실패 응답 후 이름·소개와 부모 입력·파일 유지 확인.
- 재시도 중 duplicate requestSubmit과 Escape에도 중복 생성/닫기 없이 처리되며, 실패 1회+성공 1회 요청에서 생성 1명·부모 클래스 제출 0회·새 강사 자동 선택을 확인.
- 원본 File 객체 identity까지 유지하고 미지정으로 되돌리는 조작 확인.
- 최종 컴포넌트의 수정 폼에서도 기존 강사 7에서 새 강사 2000 자동 선택, 입력·File identity·기존 슬러그 유지, 부모 제출 0회를 확인.
- 실제 빌드 CSS를 사용해 데스크톱과 375×812 모바일 모달 배치·버튼·입력을 확인했다. 초기 테스트 fixture의 누락 CSS를 보완했으며 이는 제품 소스 문제가 아니었다.
- 테스트 TaskSpace를 종료하고 직접 생성한 `/private/tmp/lestly-catalog-ui-Gnb1d1`의 HTML과 경로 포인터를 제거했다.

증거는 `/Users/msyu/study/output/lestly-catalog-entry-20261104/`의 verify-local.log, modal-preservation.json, edit-preservation.json, modal-mobile-layout.json과 화면 이미지에 보존한다.

## 적용 안내

`0041_public_program_slug.sql`을 먼저 적용한 뒤 새 앱을 배포한다. 이번 구현에는 실제 DB 적용과 배포가 포함되지 않는다. 기존 링크·전역 slug UNIQUE·강사 nullable·조직 FK·예약은 유지한다.

Archive 후 현재 catalog 명세와 delta 본문 일치, `spec:check`, `spec:changed -- HEAD`, 변경 파일 공백 검사를 모두 확인했다.
