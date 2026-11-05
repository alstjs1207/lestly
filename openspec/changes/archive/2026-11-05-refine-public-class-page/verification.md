# Verification — 2026-11-05

## Scope
원본 `/Users/msyu/study/lestly`, preview 브랜치에서 직접 작업했다. 별도 worktree/clone을 만들지 않았다. 공개 UI·관리자 안내·공유 메타만 변경하며 DB 마이그레이션이나 기존 클래스/예약/상담 데이터 변경은 없다.

## Local
- Node 24.22.1, `npm run verify:local`: exit 0. 명세/도구 10건, 단위 240건, 격리 SQL 281건, 타입/빌드, SSR 7종 모두 통과했다.
- 확장한 `tests/consultations-ssr.mjs`: 하단 단일 상담 CTA, 정원/일정 부재, 설정 누락 비활성 상태, 커버·커리큘럼·강사 선택 콘텐츠, 안전한 이미지 메타·설명 fallback, ACTIVE/공개 조건별 관리자 링크, 기존 커버 보존·미리보기를 검증했다.
- `npm run spec:changed -- 0d631ed`, `git diff --check`: 통과.

## Browser
- 로컬 공개 페이지에서 390px와 320px 모바일 가로 넘침 없음. 커버 없는 상단 높이 모바일 180px/PC 220px, PC 단독 강사 영역 전체 폭을 확인했다.
- 하단은 상담 신청만 표시하고 단일 Dialog를 연다. Dialog z-index 50 > footer 40이다. 320×440의 낮은 화면에서는 모달 내부 스크롤과 입력 후 제출 버튼 활성화를 확인했다. 실제 상담 제출·외부 푸시는 실행하지 않았다.
- 테스트 관리자로 기존 새 클래스 폼에 접근해 커버 업로드와 제목/부제목 변경이 모바일/PC 두 미리보기에 반영되는 것을 확인했다. 클래스 저장 없이 reload하여 검토용 입력이 폐기된 것을 확인했다.
- 커버 없는 페이지의 OG/Twitter/canonical 및 부제목·상세 설명 조합을 확인했다. 실제 카카오/SNS 서비스의 캐시 갱신은 검증 범위가 아니다.
- 로그·이미지는 `/Users/msyu/study/output/lestly-public-page-20261105/`에 보존했다.

## Preview
- 구현 커밋 `c961ef92de7009b48d1ee0567b9c78e5cd431ac8`을 origin/preview에 푸시하고 원격 SHA를 확인했다. main은 `93f4ee1e1ca148404f08b744763cc4f146649b49`로 유지됐다.
- Vercel `dpl_Dafta9fL2zvMELY6ErcGJVkxx6oH`: READY, aliasAssigned=true, `lestly.vercel.app` 연결 확인.
- GitHub CI [41988300954](https://github.com/alstjs1207/lestly/actions/runs/41988300954): completed/success.
- 실제 `/class/art_mask`: HTTP 200, 390px 가로 넘침 없음, 하단 상담 버튼만 표시하고 정원·일정 문구 없음. 기존 단일 상담 Dialog가 열리고 빈 입력 제출은 비활성이다. 실제 접수는 실행하지 않았다.
- query를 붙여 접근해도 canonical/og:url은 `https://lestly.vercel.app/class/art_mask`로 표시된다. OG 설명은 기존 부제목과 상세 설명을 반영한다.
- preview 관리자 새 클래스 폼에서 기존 커버 입력 필드와 공개 조건 안내가 표시되는 것을 확인했다. 작성·저장은 실행하지 않았다.
- 이번 작업의 로컬 서버 PID 53420을 종료했다. 원본 체크아웃은 유지하며 별도 작업용 폴더는 없다.
- 이 기록의 archive 커밋은 구현 코드와 동일한 상태로 preview에 반영하고 최종 배포 완료를 확인한다.
