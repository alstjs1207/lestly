# Design

get_public_program_by_slug(text)는 STABLE SECURITY DEFINER, 빈 search_path, 스키마가 명시된 참조와 ACTIVE/is_public/정확한 slug 조건으로 최소 JSON을 반환한다. 함수 PUBLIC 기본 실행은 회수하고 anon/authenticated/service_role만 허용한다. instructor 조인은 조직 일치를 확인하고 SNS·커리큘럼 내부 키도 허용 목록으로 재구성한다. 원본 DB 행을 JSON 전체로 직렬화하지 않는다.

기존 공개 RLS를 제거해 authenticated 외부 조직 사용자도 테이블 전체 행을 읽지 못하게 한다. anon의 테이블 및 잔존 컬럼 SELECT를 회수한다. 자기 조직 관리/학생/종료 이력 정책과 쓰기 권한은 보존한다. DB 타입에는 RPC 계약을 추가한다.

순서: 0044 추가 → preview RPC 배포 → 운영의 최소 조회 호환 패치 배포(별도 승인) → 0045 권한 회수. 적용 도구는 0045 전에 실제 운영 공개 페이지가 200이고 내부 필드를 포함하지 않는지 확인하여 옛 운영 조회를 실수로 깨뜨리지 않는다. 전체 public 데이터 백업·트랜잭션 전후 해시·기존 auth/service grants·비공개 RLS·cron 동일성을 검증한다.
