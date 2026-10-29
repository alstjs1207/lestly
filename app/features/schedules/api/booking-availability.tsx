import type { Route } from "./+types/booking-availability";

import { data } from "react-router";

import makeServerClient, {
  getSessionUser,
} from "~/core/lib/supa-client.server";
import {
  getDisabledBookingDays,
  getDisabledBookingTimes,
} from "~/features/app-settings/queries";
import { getUserProfile } from "~/features/users/queries";

import { getBookingPolicy } from "../../app-settings/booking-policy.server";
import { isBookingDateInWindow } from "../../app-settings/booking-window";
import { toKSTDateString } from "../utils/kst";
import { parseDateString } from "../utils/student-schedule-rules";

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
  const minutes = params.has("minutes")
    ? Number(params.get("minutes"))
    : Number(params.get("hours")) * 60;
  const hours = minutes / 60;
  const bookingPolicy = await getBookingPolicy(client, {
    organizationId: member.organization_id,
  });
  const key = `${date}:${hours}`;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(minutes) ||
    !bookingPolicy.durationMinutes.includes(minutes) ||
    toKSTDateString(parseDateString(date)) !== date
  )
    return data({ key, slots: null, bookingPolicy }, { status: 400, headers });
  const [disabledTimes, disabledDays] = await Promise.all([
    getDisabledBookingTimes(client, { organizationId: member.organization_id }),
    getDisabledBookingDays(client, { organizationId: member.organization_id }),
  ]);
  // Still return the newest policy when a previously open date has closed,
  // so open booking panels can explain the updated range and block submission.
  if (!isBookingDateInWindow(date, bookingPolicy.bookingWindow, new Date()))
    return data(
      { key, slots: [], disabledTimes, disabledDays, bookingPolicy },
      { headers },
    );
  const { data: slots, error: availabilityError } = await client.rpc(
    "get_student_booking_availability_minutes",
    {
      p_organization_id: member.organization_id,
      p_date: date,
      p_minutes: minutes,
    },
  );
  if (availabilityError)
    return data(
      { key, slots: null, disabledTimes, disabledDays, bookingPolicy },
      { status: 400, headers },
    );
  return data(
    { key, slots, disabledTimes, disabledDays, bookingPolicy },
    { headers },
  );
}
