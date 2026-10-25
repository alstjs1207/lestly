import type { Route } from "./+types/attendance";

import { data } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import { RequestBodyError, readBoundedJson } from "~/core/lib/request-body";
import makeServerClient from "~/core/lib/supa-client.server";
import { requireAdminRole } from "~/features/admin/guards.server";

import {
  attendanceDate,
  attendanceFailure,
  parseAttendanceChanges,
} from "../lib/attendance";
import { getAttendanceSchedules, saveAttendance } from "../queries.server";

export { default } from "../components/attendance-manager";

export const meta: Route.MetaFunction = () => [{ title: "출결 관리 | Lestly" }];

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const params = new URL(request.url).searchParams;
  let date: string;
  try {
    date = attendanceDate(params.get("date"));
  } catch {
    throw data({ error: "날짜를 확인해 주세요." }, { status: 400, headers });
  }
  const pageValue = Number(params.get("page") ?? 1);
  const page =
    Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue <= 10000
      ? pageValue
      : 1;
  const pendingOnly = params.get("view") === "pending";
  const now = new Date();
  const result = await getAttendanceSchedules(client, {
    organizationId,
    date,
    pendingOnly,
    page,
    now,
  });
  return data(
    { ...result, date, pendingOnly, page, now: now.toISOString() },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  let changes;
  try {
    changes = parseAttendanceChanges(await readBoundedJson(request, 32768));
  } catch (error) {
    return data(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "출결 정보를 확인해 주세요.",
      },
      {
        status: error instanceof RequestBodyError ? error.status : 400,
        headers,
      },
    );
  }
  try {
    const changed = await saveAttendance(client, organizationId, changes);
    return data({ success: true, changed, error: null }, { headers });
  } catch (error) {
    const failure = attendanceFailure(error);
    if (failure.status === 500)
      console.error("Failed to save attendance", error);
    return data(
      { success: false, error: failure.error },
      { status: failure.status, headers },
    );
  }
}
