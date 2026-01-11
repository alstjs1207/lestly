import type { Translation } from "./types";

const en: Translation = {
  home: {
    title: "Lestly",
    subtitle: "It's time to build!",
  },
  navigation: {
    en: "English",
    kr: "Korean",
    es: "Spanish",
  },
  superAdmin: {
    title: "Super Admin Dashboard",
    description: "Service-wide statistics and organization management",
    global: "Global",
    dashboard: "Dashboard",
    organizations: "Organizations",
    noOrganizations: "No organizations",
    stats: {
      totalOrganizations: "Total Organizations",
      totalMembers: "Total Members",
      totalSchedules: "Total Schedules",
      avgMembers: "Avg Members",
      registeredOrganizations: "Registered organizations",
      acrossAllOrganizations: "Across all organizations",
      allTimeSchedules: "All-time schedules",
      perOrganization: "Per organization",
    },
    table: {
      name: "Name",
      description: "Description",
      members: "Members",
      schedules: "Schedules",
      created: "Created",
      selectToManage: "Select an organization to manage its data",
      noOrganizationsFound: "No organizations found",
    },
    orgDashboard: {
      backToList: "Back to list",
      organizationDashboard: "Organization dashboard",
      totalStudents: "Total Students",
      activeStudents: "Active Students",
      graduated: "Graduated",
      todaysClasses: "Today's Classes",
      allStudents: "All students",
      currentlyEnrolled: "Currently enrolled",
      completedProgram: "Completed program",
      scheduledToday: "Scheduled today",
      thisMonthSchedule: "This Month's Schedule",
    },
    user: {
      logout: "Logout",
    },
  },
};

export default en;
