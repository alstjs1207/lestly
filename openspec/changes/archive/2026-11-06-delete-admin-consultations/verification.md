# Verification

- `npm run verify:local` 통과: 명세/도구 10개, 단위 243개, 격리 SQL 289개, 타입·빌드·SSR 7종. 로그: `/private/tmp/lestly-consult-delete-verify.log`.
- 삭제 action은 확인 누락·외부 출처·인증 실패·잘못된 ID·DB 오류·삭제 대상 없음과 정상 303을 검증했다. 기존 상태/메모 저장도 유지된다.
- PGlite에서 익명/학생/외부·자격 해제 관리자 삭제 차단, 비상담 기록 보존, 관련 종/푸시만 cascade, 신청 키 tombstone과 재생성 차단을 확인했다.
- ego-browser TaskSpace 47에서 실제 상세 컴포넌트를 격리된 합성 loader/action으로 실행했다. 취소 후 요청 0건·메모 유지·dialog 닫힘, 확인 후 한 번의 delete intent와 목록 이동을 확인했다. 390px 화면에서 dialog 폭 358px·불투명도 1·가로 넘침 없음. 실제 DB 삭제/상담 접수/푸시 발송은 하지 않았다. 화면: `/Users/msyu/study/output/lestly-consult-delete-20261105/mobile-delete-dialog.png`.
- 0046 readonly preflight → `--apply` → readonly postflight 성공. 0600 백업을 검증하고 transaction에서 전체 public row fingerprint·cron·무관한 정책/권한이 동일함을 확인했다. 결과는 `sql/operations/20261105_consult_delete_{preflight,apply,postflight}.result.json`.
- 상담 7건 hash `f718e4f1d7b61786083c8f29f703bcdcb447110ed3cf754e4b3c116d630292e1` 유지. 예약 1059·프로필 36·전체 notifications 576·기존 push subscriptions 2 보존.
- 신규 FK는 nullable/SET NULL, 익명 DELETE 불가, 자기 조직 관리자 상담 전용 DELETE 정책 확인. 기존 main의 접수 SQL도 tombstone 재생성을 차단하며 새 조회 코드는 성공 응답을 보존한다.
- 구현 커밋 `7f2f4142317775390fc472c5bb862a2f34bae2f7`을 preview 검증 후 원격 main에 fast-forward했다. 별도로 분기된 기존 로컬 main 커밋 `1804138`은 손대지 않고 보존했다.
- preview Vercel `dpl_H5QufkjruMzFDBUMMBPdMVBVpsq2`, production `dpl_4Ls5PcxUcwmF5Pss9rPqNPZ4v5we` 모두 READY/aliasAssigned=true로 `lestly.vercel.app`/`lestly.io` 연결 확인.
- GitHub Actions preview `42066187537`, main `42066667762` 모두 success.
- 두 환경에서 실제 세션으로 목록200·공개 art_mask200, 삭제 확인 누락400·잘못된 ID404·다른 조직 상세404 확인. 확인을 갖춘 유효 고객 ID 삭제 요청은 보내지 않았다.
- 원본 `/Users/msyu/study/lestly` 재사용, 별도 worktree/clone 생성 없음. 이 작업 전용 UI fixture `.vercel/consult-delete-ui`와 임시 서버 PID87462를 정리했다. 스크린샷·검증 로그·합성 fixture 소스는 `/Users/msyu/study/output/lestly-consult-delete-20261105`에 보존했다. 무관한 worktree/프로세스/로컬 브랜치는 유지했다.
- 미확정 제품 정책 없음.
