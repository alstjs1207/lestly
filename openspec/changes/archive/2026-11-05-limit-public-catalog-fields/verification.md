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

## Rollout
- preview `6030362f656ee62907926e93fade5235aa11465d` 배포 Ready, CI 41997698748 success를 확인했다. 실제 공개 페이지는 200이고 내부 push_profile_id·가격 필드가 없으며 하단 상담 버튼은 유지된다.
- 기존 최소 운영 호환 패치는 로컬 codex/public-catalog-compat 브랜치에 보존하고 배포하지 않았다.
- 사용자가 preview → main 전체 병합·운영 배포를 명시 승인했다. main을 preview에 동기화하고, 전체 release 검증 후 preview를 main에 병합해 운영 배포한다. 운영의 새 공개 조회가 정상인 것을 확인한 뒤 0045를 적용한다.
- 원본 체크아웃을 계속 사용한다. 관리 worktree 생성은 응답 지연 후 취소됐고 attachment 및 git worktree 조회에서 신규 폴더가 없음을 확인했다.

## Full production release preparation
- 2026-11-05 사용자가 preview 변경 전체를 main에 병합해 운영 배포하도록 명시 승인했다. 기존 2개 제품 파일 한정 승인을 대체하는 최종 배포 범위다.
- main → preview 동기화는 충돌 없이 완료됐고 병합한 코드의 verify:local exit 0: 단위 241건·격리 SQL 286건·타입·빌드·SSR 7종 및 명세/도구 검사 통과.
- production 전용 CONSULT_RATE_LIMIT_SECRET을 sensitive 환경변수로 추가했다. 기존 preview HMAC과 production/preview 푸시·worker 설정은 유지했다. 환경변수 값은 기록하지 않았다.

## Production release and final lockdown
- 승인된 전체 preview를 main에 병합한 운영 커밋 `e215cb4343cae793ab7b49ea0b5e87aeacd42023`을 원격에 보존했다. 이전 최소 패치 후보 `7ebe2fa`는 main에 포함하지 않았다.
- 운영 Vercel `dpl_ED1jHZjNSahNmPezBaExKvhUZiL6` READY/aliasAssigned, lestly.io 연결; CI 41999671621 success. preview `fa3028d` Vercel `dpl_CGjiqpqvKjV2VsQkrDuC7D1jBuds` READY/aliasAssigned; CI 41999641888 success.
- 실제 운영 도메인의 새 공개 조회 전환을 확인한 뒤 0045 `867251dfe43306afcdfe634b77b5cc40b4e0624c183fd289c2cc31d5825aa1f8`을 백업·트랜잭션 적용하고 postflight를 통과했다. private 0600 백업은 `20261105-public-catalog-45-before-1793869805624.json`이다.
- 기존 public 행 전체·cron·authenticated/service_role 권한·비공개 조직 정책은 전후 동일했다. 기존 상담 6건의 해시도 유지됐다.
- 실제 anon 원본 programs/instructors 조회 차단, REST 내부 컬럼 조회 401, 최소 공개 RPC 200, 비공개 클래스 숨김을 확인했다.
- 실제 NORMAL STUDENT/ADMIN JWT 역할에서 자기 조직 클래스·강사 조회가 유지되고, 멤버십/예약 이력이 없는 타 조직 행은 0건이었다. 쓰기/실제 예약은 실행하지 않았다.
- 운영·preview /class/art_mask는 각각 200이며 내부 push_profile_id·가격 필드가 없고 상담 버튼/단일 Dialog가 유지된다. 양쪽 관리자 클래스·강사·상담 목록 200, 푸시 configured=true를 확인했다.
- 운영 상담 API의 거절 전용 검사: 잘못된 입력 400, 외부 Origin 403, 16KB 초과 본문 413. 실제 상담 접수·알림·푸시 발송은 0건이다.
- 검토용 helper는 결과 JSON과 함께 output에 보존한 뒤 .vercel의 임시 helper만 정리했다. 원본 체크아웃 /Users/msyu/study/lestly는 유지했고, 신규 worktree/clone은 없다.
- 아래 완료 기록 archive 커밋을 preview와 main 양쪽에 반영하고 최종 Ready/CI/원격 SHA를 별도 output JSON으로 확인한다. 제품 코드는 검증한 release와 동일하다.
