import type { Route } from "./+types/logout";

import { redirect } from "react-router";

import { requireMethod } from "~/core/lib/guards.server";
import makeServerClient from "~/core/lib/supa-client.server";

export function loader() {
  return redirect("/");
}

export async function action({ request }: Route.ActionArgs) {
  requireMethod("POST")(request);
  const [client, headers] = makeServerClient(request);
  await client.auth.signOut();
  return redirect("/", { headers });
}
