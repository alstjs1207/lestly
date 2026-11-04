# Preview 배포 기록 — 2026-11-04

사용자가 앞선 README·Cursor 정리와 수강 기간 변경 전체를 preview에 푸시하고 개발서버 배포 및 실제 DB 마이그레이션 적용을 요청했다. 이전 verification.md의 미배포 기록은 그 시점의 상태로 보존한다.

## 준비와 검증

- 원본 `/Users/msyu/study/lestly`를 재사용했다. 별도 worktree·clone을 만들지 않았다.
- 로컬 main의 문서 커밋 `1804138`을 preview에 `0cd3be2`로 cherry-pick했다. 사용자 변경을 임시 stash로 보존한 뒤 복원했고 생성한 stash는 남기지 않았다.
- 원격 preview 기준은 `dab63323daec396ddfd18063be7c3d4c5f29ee17`이다. main 원격은 변경하지 않는다.
- Node 24.22.1에서 `npm run verify:local` 전체 통과: 도구 10개, 단위 219개, PGlite 268개, 타입·빌드·SSR 6종. 배포 전 `spec:check`와 `spec:changed -- origin/preview`도 통과했다.

## DB 적용

PLAT-003·STU-004·BOOK-001·SER-004의 실제 적용은 `sql/operations/20261104_apply_student_course_dates.mjs`를 사용했다. 사전 조회는 읽기 전용이며 실제 적용은 `--apply`로 요청 범위 안에서 수행했다.

- Supabase project: `smbpzlzbvplhtpqggrjf`.
- migration: `0040_student_course_dates`, SHA-256 `1558c59e2800074012cc411d8e86e43e8956c3929dfca7795cc3dc10882ebbe1`.
- 선행 0028~0039 마이그레이션 hash 및 변경 대상 기존 함수 본문을 로컬 기준과 대조했다.
- 한 트랜잭션에서 advisory/table lock, 비공개 백업 생성과 재읽기·0600 권한 확인, SQL·ledger 등록, 전체 public 데이터 지문·칼럼·RLS·기존 트리거·비대상 함수·대상 함수 권한 보존을 검사하고 커밋했다.
- 백업: `.vercel/backups/20261104-student-course-dates-before-1793787738465.json` (Git 제외).
- 기존 예약 1,112건, 수강생 29명 포함 모든 public 데이터 불변. 기존 수강생 중 시작일·종료일 미등록은 각 0명. 날짜 backfill이나 고객 시험 예약은 생성하지 않았다.
- 실행 증거: `sql/operations/20261104_student_course_dates_{preflight,apply,postflight}.result.json`.

## 배포 증거 위치

전체 빌드 로그와 원격 배포 상태는 `/Users/msyu/study/output/lestly-course-dates-preview-20261104/`에 보존한다. 최종 preview 원격 커밋·Vercel Ready 상태와 HTTP/화면 확인은 완료 보고와 해당 폴더의 deployment-summary.json을 따른다.
