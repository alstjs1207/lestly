-- 공개 프로그램에 연결된 강사는 비로그인 사용자도 조회 가능
-- 클래스 소개 페이지(/class/:slug)에서 강사 정보를 표시하기 위함
-- 직접적인 강사 목록 조회는 여전히 차단됨 (공개 프로그램에 연결된 강사만 노출)

CREATE POLICY "public-program-instructor-select-policy" ON "instructors"
AS PERMISSIVE FOR SELECT TO "anon", "authenticated"
USING (
  EXISTS (
    SELECT 1 FROM programs
    WHERE programs.instructor_id = instructors.instructor_id
    AND programs.is_public = true
    AND programs.status = 'ACTIVE'
  )
);
