import type { Route } from "./+types/booking-availability";

import { data } from "react-router";

import makeServerClient, {
  getSessionUser,
} from "~/core/lib/supa-client.server";
import { getUserProfile } from "~/features/users/queries";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  headers.set("Cache-Control", "private, no-store");
  const user = await getSessionUser(client);
  if (!user) throw new Response(null, { status: 401, headers });
  const profile = await getUserProfile(client, { userId: user.id });
  if (!profile) throw new Response(null, { status: 403, headers });
  const { data: member, error } = await client
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profile.profile_id)
    .eq("role", "STUDENT")
    .eq("state", "NORMAL")
    .single();
  if (error || !member) throw new Response(null, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? "";
  const hours = Number(params.get("hours"));
  const key = `${date}:${hours}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || ![3, 6, 9].includes(hours))
    return data({ key, slots: null }, { status: 400, headers });
  const { data: slots, error: availabilityError } = await client.rpc(
    "get_student_booking_availability",
    { p_organization_id: member.organization_id, p_date: date, p_hours: hours },
  );
  // A rolling deployment can still book safely through the existing INSERT guard.
  if (availabilityError) {
    if (["PGRST202", "42883"].includes(availabilityError.code))
      return data({ key, slots: null }, { headers });
    return data({ key, slots: null }, { status: 400, headers });
  }
  return data({ key, slots }, { headers });
}
