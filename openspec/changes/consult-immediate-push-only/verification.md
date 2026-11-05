# Verification

- 2026-11-05 Asia/Seoul, 원본 `/Users/msyu/study/lestly`, preview 기준 커밋 `826a488`의 변경 작업에서 검증했다. 별도 worktree/clone 없음.
- Node 24.22.1 `npm run verify:local` exit 0. spec-tools 10개, 단위 **240개**, 격리 PostgreSQL **281개**, 타입·production 빌드·SSR **7종** 통과.
- 상담 일시 오류는 FAILED로 종료하고 설정 미비 때 미시도 기기도 실패 기록으로 정리한다. 20개 기기를 여러 배치로 즉시 처리하고 저장 결과 불확실 시 재발송하거나 이미 저장된 상담을 실패로 바꾸지 않는 단위 회귀 통과.
- 실제 SQL을 실행하는 PGlite에서 일반 worker의 상담 제외, 같은 notification의 재claim 거절, 만료 상담 lease 재claim 거절, 수신 권한 회수 재검사와 기존 예약 재시도 계약을 검증했다.
- 0043 cron 정리 SQL을 별도 PGlite에서 실행해 상담 job만 제거하고 예약 job/이력을 유지하며 중복 실행도 안전함을 확인했다.
- 실제 DB 사전 점검·비공개 0600 백업 읽기 재검증·트랜잭션 적용 완료. migration `0043_consult_immediate_push_only` SHA256 `ac86fd50a491445b8a1dc6dc25ca944c2478176be121d69c7e269837799f92d4`.
- 기존 모든 public 행 동일. 상담 **6건** 전체 행 해시 `123185c0fae68d2ba02ceb6145e0fd5df08e785e7f79733064048c719bc4a048` 유지. 기존 예약/다른 cron도 동일하다. 상담 retry job/URL은 제거됐고 상담 bypass key는 없다.
- 실제 DB 결과: `sql/operations/20261105_consult_push_immediate_{preflight,apply,postflight}.result.json`. 백업 `20261105-consult-immediate-before-1793859796879.json`는 .vercel/backups에 비공개 보존하고 Git에 포함하지 않는다.
- Vercel 읽기 확인: all_except_custom_domains 보호 유지, 프로젝트 bypass credential 0개, 운영 배포 SHA `93f4ee1` 유지. 우회키 생성 API는 실행하지 않았다.
- 구형 미적용 우회키 proposal/SQL은 이번 정책으로 대체했고 이 채팅의 불필요한 .vercel/consult-preview-live.mjs도 제거했다. 기존 HMAC·VAPID·예약 cron secret은 유지한다.

## Deployment follow-up

기존 preview 첫 배포 `826a488`은 Ready와 CI 성공을 확인했다. 이번 즉시 푸시 정리 커밋의 원격 SHA·배포 Ready/alias·CI·실제 화면 검증 결과는 최종 .vercel/consult-immediate-deployment-verification.json 및 작업 완료 응답에 기록한다. 실제 사람에게 시험 푸시를 보내거나 시험 상담을 저장하지 않는다.
