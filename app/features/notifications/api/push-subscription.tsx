import type { Route } from "./+types/push-subscription";

import { data } from "react-router";

import { requireSameOrigin } from "~/core/lib/guards.server";
import { RequestBodyError, readBoundedJson } from "~/core/lib/request-body";
import makeServerClient from "~/core/lib/supa-client.server";
import { requireAdminRole } from "~/features/admin/guards.server";

import { getPushConfig } from "../push/config.server";
import { ensurePushDeviceId, getPushDeviceId } from "../push/device.server";
import {
  hasPushSubscription,
  removePushDevice,
  savePushSubscription,
} from "../push/store.server";
import { pushSubscriptionSchema } from "../push/validation";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const { organizationId, profileId } = await requireAdminRole(client);
  headers.set("Cache-Control", "no-store");
  const config = getPushConfig();
  const deviceId = await getPushDeviceId(request);
  return data(
    {
      configured: !!config,
      publicKey: config?.publicKey ?? null,
      subscribed:
        !!deviceId &&
        (await hasPushSubscription(organizationId, profileId, deviceId)),
    },
    { headers },
  );
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST" && request.method !== "DELETE")
    return data(null, { status: 405, headers: { Allow: "POST, DELETE" } });
  requireSameOrigin(request);
  const [client, headers] = makeServerClient(request);
  const { organizationId, profileId } = await requireAdminRole(client);
  headers.set("Cache-Control", "no-store");
  if (request.method === "DELETE") {
    const deviceId = await getPushDeviceId(request);
    if (deviceId) await removePushDevice(deviceId);
    return data({ success: true }, { headers });
  }
  if (!getPushConfig())
    return data(
      { error: "푸시 알림 준비 중입니다." },
      { status: 503, headers },
    );
  let body: unknown;
  try {
    body = await readBoundedJson(request);
  } catch (error) {
    if (error instanceof RequestBodyError)
      return data({ error: error.message }, { status: error.status, headers });
    throw error;
  }
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success)
    return data(
      { error: "기기 알림 정보를 확인해 주세요." },
      { status: 400, headers },
    );
  const deviceId = await ensurePushDeviceId(request, headers);
  try {
    await savePushSubscription(
      organizationId,
      profileId,
      deviceId,
      parsed.data,
    );
  } catch {
    // Database errors can include subscription credentials in bound parameters.
    return data(
      { error: "기기에 알림을 연결하지 못했습니다. 다시 시도해 주세요." },
      { status: 500, headers },
    );
  }
  return data({ success: true }, { headers });
}
