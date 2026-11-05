# Preview activation prerequisites

이 변경은 이전 reactivate-secure-consultations의 CAPTCHA 관련 활성화 조건을 대체한다. 공개 상담에는 Turnstile 키·도메인 등록·토큰이 필요하지 않다.

필요한 설정은 32자 이상 `CONSULT_RATE_LIMIT_SECRET`(또는 `SESSION_SECRET`), 기존 Web Push VAPID 3종과 CRON_SECRET이다. 실제 DB의 0042 백업/트랜잭션 적용, Vault `lestly_consult_push_app_url`과 cron secret 일치, preview 배포·실제 기기 검증 절차는 이전 deployment.md를 따른다. 기존 일반 문의 폼에서 사용 중인 CAPTCHA 환경변수는 삭제하지 않는다.

0042는 아직 적용하지 않은 상태에서 주석만 수정했으므로 실제 적용 시 현재 파일의 SHA256으로 원장/백업을 확인한다. 이 문서는 DB 적용·배포 성공 기록이 아니다. 실제 고객 데이터·원격 브랜치를 변경하지 않았다.

## 2026-11-05 사용자 승인에 따른 실제 적용

- Supabase 프로젝트 `smbpzlzbvplhtpqggrjf`에 0042를 적용했다. 비공개 0600 백업을 다시 읽어 검증한 뒤 단일 트랜잭션에서 DDL/원장을 기록했고 기존 public 전체 행 동일성을 확인했다. 기존 상담 6건, 프로필 36건, 예약 1,059건, 알림 이력 575건을 보존했다. 증거는 `sql/operations/20261105_consult_push_security_{preflight,apply}.result.json`이다. 백업 원문은 Git에 포함하지 않는다.
- Vercel `lestly`의 preview 브랜치 전용 sensitive `CONSULT_RATE_LIMIT_SECRET`을 생성했다. 운영 환경변수·기존 VAPID 키·운영 브랜치는 변경하지 않았다. stable preview 도메인은 `https://lestly.vercel.app`이고 프로젝트 도메인의 gitBranch가 preview임을 확인했다.
- 이번 커밋 직전 `verify:local`이 exit 0으로 완료됐다(단위 237, 격리 DB 281, SSR 7종, 타입/빌드/spec 검사).
- 푸시 재시도 URL 등록과 원격 배포의 최종 결과는 배포 후 후속 기록으로 남긴다. 위 원래 문단의 미적용 상태는 당시 이력이다.
