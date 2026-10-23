import type { Route } from "./+types/calendar";

import { StudentSchedulesView } from "../components/student-schedules-view";
import { loadStudentCalendar } from "../utils/student-calendar.server";

export const meta: Route.MetaFunction = () => [
  { title: `나의 일정 | ${import.meta.env.VITE_APP_NAME}` },
];
export async function loader({ request }: Route.LoaderArgs) {
  return loadStudentCalendar(request);
}
export default function StudentCalendarScreen({
  loaderData,
}: Route.ComponentProps) {
  return <StudentSchedulesView data={loaderData} />;
}
