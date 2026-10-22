import type { Route } from "./+types/consult-request";

import { data } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";

/** Temporarily disabled by product decision; reactivation requires abuse controls. */
export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);
  return data(
    { error: "상담 신청은 현재 일시 중단되었습니다." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
