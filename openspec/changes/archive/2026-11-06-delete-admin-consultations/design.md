# Design

같은 상세 route의 POST action을 intent=update/delete로 구분한다. 기존 저장 form의 intent 누락은 update로 유지하고 delete에는 confirmDelete=yes를 요구한다. 클라이언트와 RLS 양쪽에서 조직/타입을 제한한다. 삭제 성공은 303으로 목록에 이동하고 실패는 개인정보 없는 메시지로 표시한다. 저장·삭제 중 중복 조작을 막고 확인 취소는 데이터를 바꾸지 않는다.

notifications를 실제 삭제하며 기존 FK의 CASCADE로 종 알림·push_events·push_deliveries를 함께 정리한다. 구독 기기·다른 상담·예약/발송 이력은 유지한다. 이미 기기에 전달한 푸시를 회수하는 기능은 추가하지 않는다.

consult_submission_keys는 notification_id를 nullable/ON DELETE SET NULL로 바꿔 개인정보 원문 없이 UUID·HMAC 해시·기존 expiry를 보존한다. findAcceptedConsultation은 알림 ID 대신 성공 키 존재를 확인한다. 삭제 후 동일 성공 요청의 재전송은 성공 응답만 하고 상담/알림을 다시 생성하지 않는다. 기존 SQL도 tombstone이 존재하면 INSERT 전 반환하므로 경합 시에도 삭제한 요청을 복원하지 않는다.

앱 action/DB 격리 검증과 실제 DB 적용 시 전체 public 데이터 백업·전후 비교를 수행한다. 실제 고객 상담은 검증을 위해 삭제하지 않는다.
