import type { Route } from "./+types/push-cron";

import { data } from "react-router";

import { isWorkerAuthorized } from "~/core/lib/worker-auth.server";

import { dispatchPushQueue } from "../push/dispatch.server";

export async function action({ request }: Route.ActionArgs) {
  if (
    request.method !== "POST" ||
    !isWorkerAuthorized(request, process.env.CRON_SECRET)
  )
    return data(null, { status: 401 });
  try {
    const result = await dispatchPushQueue();
    return data(result, { status: result.configured ? 200 : 503 });
  } catch {
    return data({ error: "Push queue processing failed" }, { status: 500 });
  }
}
