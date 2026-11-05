# Design

상담 outbox는 저장·종 아이콘·기기 대상 기록의 원자성을 위해 유지한다. 이름/전화/문의·메모 등 기존 상담 행은 수정하지 않는다. 상담 delivery는 접수 요청의 notificationId scope에서 CONSULT_PENDING/attempts=0인 새 기기만 claim한다. 10개씩 배치를 끝까지 처리하며 이미 시도한 기기는 다시 가져가지 않는다. CONSULT_SENDING의 만료 lease도 재처리하지 않는다. 네트워크/서비스 오류는 FAILED로 종료하고 설정 미비·중단 시 미시도 기기도 실패 사유를 기록한다. 발송 성공 뒤 상태 저장 실패로 남은 in-flight 상태는 재발송하지 않는다.

scope 없는 공통 정기 worker와 예약 scope는 CONSULT_REQUEST를 제외한다. 기존 예약의 PENDING/SENDING·lease·claim token·재시도 계약은 유지한다. 수신 기기의 권한·구독/연결 상태·허용 endpoint 검사와 상담 상세로의 안전한 이동도 유지한다.

0043은 consult-push-retry-job만 unschedule한다. 실제 적용 스크립트는 정확한 Supabase 프로젝트/이전 migration hash를 확인하고 public 전체 행·cron 설정·이번 상담 재시도 URL을 0600 백업 후 트랜잭션에서 제거한다. lestly_consult_push_app_url 값이 이번에 추가한 https://lestly.vercel.app와 같을 때만 삭제한다. 기존 예약 job과 나머지 job·public 데이터는 전후 동일해야 한다. Vercel/DB의 상담 bypass key는 생성된 적이 없고 새로 생성하지 않는다. HMAC·기존 VAPID/CRON_SECRET은 이력 보안·즉시 푸시·예약 처리에 필요하므로 유지한다.

구형 배포도 CONSULT_PENDING/SENDING을 사용하는 호환성은 유지한다. Vercel 로그인 보호 설정은 바꾸지 않으며 기존 로그인 브라우저로 배포 화면/API를 검증한다. 실제 사람에게 시험 푸시를 보내거나 합성 상담을 남기지 않는다.
