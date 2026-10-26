import type { Route } from "./+types/my-schedules";

import { StudentSchedulesView } from "../components/student-schedules-view";
import { loadStudentCalendar } from "../utils/student-calendar.server";

export const meta: Route.MetaFunction = () => [
  { title: `나의 일정 목록 | ${import.meta.env.VITE_APP_NAME}` },
];
export async function loader({ request }: Route.LoaderArgs) {
  return loadStudentCalendar(request, { list: true });
}
export default function MySchedulesScreen({
  loaderData,
}: Route.ComponentProps) {
  return <StudentSchedulesView data={loaderData} list />;
}
