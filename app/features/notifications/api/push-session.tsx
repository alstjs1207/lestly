import type { Route } from "./+types/push-session";

import { data } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient, { getAuthUser } from "~/core/lib/supa-client.server";

import { getPushDeviceId } from "../push/device.server";
import { removeStalePushDevice } from "../push/store.server";

// Reconcile a shared device after account switches or session expiry, including
// navigation from an admin account to a student/anonymous screen.
export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const deviceId = await getPushDeviceId(request);
  if (!deviceId)
    return data(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  const [client, headers] = makeServerClient(request);
  const user = await getAuthUser(client);
  await removeStalePushDevice(deviceId, user?.id ?? null);
  headers.set("Cache-Control", "no-store");
  return data({ success: true }, { headers });
}
