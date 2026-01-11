import type { Translation } from "./types";

const ko: Translation = {
  home: {
    title: "Lestly: 레슬티",
    subtitle: "빌드하는 시간이야!",
  },
  navigation: {
    kr: "한국어",
    es: "스페인어",
    en: "영어",
  },
  superAdmin: {
    title: "슈퍼 관리자 대시보드",
    description: "서비스 전체 통계 및 조직 관리",
    global: "전체",
    dashboard: "대시보드",
    organizations: "조직 목록",
    noOrganizations: "조직 없음",
    stats: {
      totalOrganizations: "전체 조직 수",
      totalMembers: "전체 회원 수",
      totalSchedules: "전체 스케줄 수",
      avgMembers: "평균 회원 수",
      registeredOrganizations: "등록된 조직",
      acrossAllOrganizations: "모든 조직 합계",
      allTimeSchedules: "누적 스케줄",
      perOrganization: "조직당 평균",
    },
    table: {
      name: "이름",
      description: "설명",
      members: "회원",
      schedules: "스케줄",
      created: "생성일",
      selectToManage: "관리할 조직을 선택하세요",
      noOrganizationsFound: "등록된 조직이 없습니다",
    },
    orgDashboard: {
      backToList: "목록으로",
      organizationDashboard: "조직 대시보드",
      totalStudents: "전체 수강생",
      activeStudents: "정상 수강생",
      graduated: "졸업 수강생",
      todaysClasses: "오늘의 수업",
      allStudents: "전체 수강생",
      currentlyEnrolled: "현재 수강 중",
      completedProgram: "수료 완료",
      scheduledToday: "오늘 예정",
      thisMonthSchedule: "이번 달 스케줄",
    },
    user: {
      logout: "로그아웃",
    },
  },
};

export default ko;
