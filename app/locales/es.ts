import type { Translation } from "./types";

const es: Translation = {
  home: {
    title: "Lestly",
    subtitle: "Es hora de construir!",
  },
  navigation: {
    en: "Ingles",
    kr: "Coreano",
    es: "Espanol",
  },
  superAdmin: {
    title: "Panel de Super Administrador",
    description: "Estadisticas del servicio y gestion de organizaciones",
    global: "Global",
    dashboard: "Panel",
    organizations: "Organizaciones",
    noOrganizations: "Sin organizaciones",
    stats: {
      totalOrganizations: "Total de Organizaciones",
      totalMembers: "Total de Miembros",
      totalSchedules: "Total de Horarios",
      avgMembers: "Promedio de Miembros",
      registeredOrganizations: "Organizaciones registradas",
      acrossAllOrganizations: "En todas las organizaciones",
      allTimeSchedules: "Horarios totales",
      perOrganization: "Por organizacion",
    },
    table: {
      name: "Nombre",
      description: "Descripcion",
      members: "Miembros",
      schedules: "Horarios",
      created: "Creado",
      selectToManage: "Seleccione una organizacion para gestionar sus datos",
      noOrganizationsFound: "No se encontraron organizaciones",
    },
    orgDashboard: {
      backToList: "Volver a la lista",
      organizationDashboard: "Panel de organizacion",
      totalStudents: "Total de Estudiantes",
      activeStudents: "Estudiantes Activos",
      graduated: "Graduados",
      todaysClasses: "Clases de Hoy",
      allStudents: "Todos los estudiantes",
      currentlyEnrolled: "Actualmente inscritos",
      completedProgram: "Programa completado",
      scheduledToday: "Programado para hoy",
      thisMonthSchedule: "Horario de Este Mes",
    },
    user: {
      logout: "Cerrar sesion",
    },
  },
};

export default es;
