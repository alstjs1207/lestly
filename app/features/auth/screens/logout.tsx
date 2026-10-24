import type { Route } from "./+types/logout";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";
import {
  clearPushDeviceCookie,
  getPushDeviceId,
} from "~/features/notifications/push/device.server";
import { removePushDevice } from "~/features/notifications/push/store.server";

export function loader() {
  return redirect("/");
}

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client, headers] = makeServerClient(request);
  const deviceId = await getPushDeviceId(request);
  // Detach the device before ending the session. Fail closed if cleanup fails.
  if (deviceId) await removePushDevice(deviceId);
  await clearPushDeviceCookie(headers);
  await client.auth.signOut();
  return redirect("/", { headers });
}
