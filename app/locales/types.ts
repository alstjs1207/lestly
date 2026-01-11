export type Translation = {
  home: {
    title: string;
    subtitle: string;
  };
  navigation: {
    en: string;
    kr: string;
    es: string;
  };
  superAdmin: {
    title: string;
    description: string;
    global: string;
    dashboard: string;
    organizations: string;
    noOrganizations: string;
    stats: {
      totalOrganizations: string;
      totalMembers: string;
      totalSchedules: string;
      avgMembers: string;
      registeredOrganizations: string;
      acrossAllOrganizations: string;
      allTimeSchedules: string;
      perOrganization: string;
    };
    table: {
      name: string;
      description: string;
      members: string;
      schedules: string;
      created: string;
      selectToManage: string;
      noOrganizationsFound: string;
    };
    orgDashboard: {
      backToList: string;
      organizationDashboard: string;
      totalStudents: string;
      activeStudents: string;
      graduated: string;
      todaysClasses: string;
      allStudents: string;
      currentlyEnrolled: string;
      completedProgram: string;
      scheduledToday: string;
      thisMonthSchedule: string;
    };
    user: {
      logout: string;
    };
  };
};
