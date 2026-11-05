# Verification — 2026-11-05

## Local
- Node 24.22.1, `npm run verify:local`: exit 0. 단위 241건, 격리 SQL 286건, 타입·빌드·SSR 7종과 명세/도구 검사 통과.
- 실제 SQL의 공개 JSON 허용 목록, 추가 SNS/커리큘럼 키 제거, anon 테이블/컬럼 차단, authenticated 타 조직 원본 행 차단과 자기 조직 ADMIN/STUDENT 조회·수정 보존을 확인했다.
- 기존 FK 관계 성능 회귀는 관리자 조회의 명시적 관계를 유지하고 공개 조회의 새 RPC 계약을 검사하도록 갱신했다.
- 원본 `/Users/msyu/study/lestly`에서 preview 작업 중이며 별도 작업용 폴더는 아직 만들지 않았다.

## DB phase 44
- 0044 `b9f63ddc4961bf8798ceace0b2d61316fd71e106d3c669575752af7f738c9e40` 추가 적용·postflight 통과. `sql/operations/20261105_public_catalog_44_*.result.json` 참조.
- private 0600 백업 `20261105-public-catalog-44-before-1793868574974.json`을 검증했다. 기존 모든 public 데이터·cron·authenticated/service_role 권한·기타 RLS는 동일하다. 기존 상담 6건 해시 `123185c0fae68d2ba02ceb6145e0fd5df08e785e7f79733064048c719bc4a048` 유지.
- 익명 REST RPC로 art_mask/art-mask가 최소 클래스·강사 키만 반환하고 없는 slug는 null인 것을 확인했다. 공개 권한 회수 전이므로 이 단계에서는 원본 테이블 읽기가 남아 있다.

## Rollout condition
- 실제 운영 공개 페이지는 현재 HTTP 200이지만 push_profile_id를 포함한다. 0045를 먼저 적용하면 운영의 옛 SELECT * 조회가 실패한다.
- 운영 호환 패치는 조회 코드·타입 선언 2개 파일만으로 준비했고, 기존 운영 일정 조회와 소개 화면은 유지한다. patch: `/Users/msyu/study/output/lestly-public-catalog-security-20261105/main-compatibility.patch`.
- 현재 요청 범위 밖의 main 배포 승인을 질문했다. 답변 전에는 0045를 적용하지 않고 preview RPC 배포까지 진행한다.
