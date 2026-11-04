# Preview 배포 기록 — 2026-11-04

사용자가 이번 클래스 관리 변경의 커밋·preview 푸시·개발서버 배포와 0041 실제 적용을 요청했다. verification.md의 미배포 기록은 구현 완료 시점의 상태로 보존한다.

## 범위와 로컬 검증

원본 `/Users/msyu/study/lestly`의 preview를 재사용했다. 원격 기준은 `2a787d1a8b09565f05fcfa2266de9be8103f74ee`, main은 `93f4ee1e1ca148404f08b744763cc4f146649b49`였다. 별도 worktree·clone을 생성하지 않는다.

Node 24.22.1의 `verify:local` 전체 실행과 `spec:check`, `spec:changed -- HEAD`를 확인했다. 단위 222개, PGlite 272개, 도구 10개, 타입·빌드·SSR 6종이며 실제 고객 기록을 시험 저장하지 않는다.

## DB 적용

CAT-001·CAT-004·PLAT-003의 적용은 `sql/operations/20261104_apply_catalog_entry.mjs`로 수행했다. 기본 실행은 읽기 전용이며 `--apply`는 선행 0028~0040 hash를 검증하고 한 트랜잭션에서 백업·적용·전후 비교한다.

- Supabase project: `smbpzlzbvplhtpqggrjf`.
- migration: `0041_public_program_slug`, SHA-256 `9be4248f64b411426a4b8d39589e8ef1a667ef388c0cd656d33bbedd126273db`.
- 백업: `.vercel/backups/20261104-catalog-entry-before-1793791326955.json`; 전체 public 행·기존 스키마·ledger를 0600 파일에 저장하고 재읽기·권한을 확인했다. Git에 포함하지 않는다.
- 새 공개 슬러그 CHECK만 추가하고 NOT VALID 상태와 정확한 식을 확인했다. 기존 행은 수정하지 않는다.
- 모든 public 테이블의 건수·행 지문, 함수·칼럼·RLS·인덱스·트리거·기존 제약이 적용 전후 동일한 것을 확인했다. 기존 예약 1,112건, 클래스 6개와 강사 3명을 보존했다.
- 공개 클래스 1개, 기존 공개/슬러그 누락은 0개였다. 고객 데이터 보정이나 시험 강사·클래스 생성은 수행하지 않았다.
- 증거: `sql/operations/20261104_catalog_entry_{preflight,apply,postflight}.result.json`.

## 배포 증거

최종 원격 commit, Vercel Preview 완료 상태, GitHub Actions와 실제 화면의 공개 토글·모달 열기/취소 확인은 `/Users/msyu/study/output/lestly-catalog-preview-20261104/deployment-summary.json` 및 같은 폴더의 로그·JSON을 따른다. 확인 과정에서 실제 강사·클래스는 저장하지 않는다.
