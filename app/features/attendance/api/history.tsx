import type { Route } from "./+types/history";

import { data } from "react-router";

import makeServerClient from "~/core/lib/supa-client.server";
import { requireAdminRole } from "~/features/admin/guards.server";

import { getAttendanceHistory } from "../queries.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId } = await requireAdminRole(client);
  const id = Number(params.scheduleId);
  if (!/^[1-9]\d*$/.test(params.scheduleId) || !Number.isSafeInteger(id))
    return data(
      { events: [], error: "수업을 확인해 주세요." },
      { status: 400, headers },
    );
  try {
    const events = await getAttendanceHistory(client, organizationId, id);
    return data({ events }, { headers });
  } catch (error) {
    console.error("Failed to load attendance history", error);
    return data(
      {
        events: [],
        error: "이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500, headers },
    );
  }
}
