# Verification

- `npm run verify:local` exit 0: 명세, spec-tools 10개, 단위 243개, PGlite SQL 289개, 타입·빌드·SSR 7종 통과. 로그는 `/Users/msyu/study/output/lestly-hide-admin-ui-20261106/verify-local.log`에 보존했다.
- built-route SSR: 클래스 생성의 공개 UI 미노출과 비공개 기본값, 공개 클래스의 기존 slug/is_public hidden 값 보존, 수정 화면의 기존 커버·공개 값 보존, 모든 클래스 상태에서 상세 공개 카드 미노출과 운영 정보 유지 확인.
- 기존 공개 소개/상담 접수·상담 상세/삭제·강사/커버·수강/예약 SSR와 DB 권한 회귀도 통과했다. 실제 DB 쓰기·고객 상담 삭제·푸시/유료 메시지 발송은 하지 않았다.
- 소스 검토: 상담 sidebar 항목과 bell 전체 보기 제거. 상담 bell 항목은 읽음 처리·텍스트를 유지하며 Link로 감싸지 않는다. 일반 알림 이력 링크는 유지한다.
- `npm run spec:changed -- 15ec109` 통과. main specs에 변경을 이미 반영했으므로 archive는 `--skip-specs`로 수행한다.
- 원본 `/Users/msyu/study/lestly`의 preview checkout을 재사용했다. 별도 worktree/clone/임시 서버 생성 없음. 배포 후 브라우저 확인 증거는 같은 output 폴더에 별도로 보존한다.
- 관리자 진입 UI만 숨긴다. 직접 관리자 경로·공개 링크·상담 접수·종 알림·즉시 기기 푸시·보안 경계와 기존 데이터는 유지한다. 미확정 제품 정책 없음.
