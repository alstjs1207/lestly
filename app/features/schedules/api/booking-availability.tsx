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

import { isBookingDateInWindow } from "../../app-settings/booking-window";
import { getProgramBookingPolicy } from "../../programs/booking-policy.server";
import { getStudentBookingOrganization } from "../utils/booking-organization.server";
import { toKSTDateString } from "../utils/kst";
import { parseDateString } from "../utils/student-schedule-rules";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  headers.set("Cache-Control", "private, no-store");
  const user = await getSessionUser(client);
  if (!user) throw new Response(null, { status: 401, headers });
  const profile = await getUserProfile(client, { userId: user.id });
  if (!profile) throw new Response(null, { status: 403, headers });
  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? "";
  const minutes = params.has("minutes")
    ? Number(params.get("minutes"))
    : Number(params.get("hours")) * 60;
  const hours = minutes / 60;
  const programId = Number(params.get("program_id"));
  const organizationId = await getStudentBookingOrganization(client, {
    profileId: profile.profile_id,
    programId,
  });
  if (!organizationId) throw new Response(null, { status: 403, headers });
  const key = `${programId}:${date}:${hours}`;
  let bookingPolicy;
  try {
    ({ policy: bookingPolicy } = await getProgramBookingPolicy(client, {
      organizationId,
      programId,
    }));
  } catch (error) {
    if (
      !["schedule_program_required", "schedule_program_not_eligible"].includes(
        (error as Error).message,
      )
    )
      throw error;
    return data(
      { key, slots: null, error: "예약할 활성 클래스를 선택해 주세요." },
      { status: 400, headers },
    );
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(minutes) ||
    !bookingPolicy.durationMinutes.includes(minutes) ||
    toKSTDateString(parseDateString(date)) !== date
  )
    return data({ key, slots: null, bookingPolicy }, { status: 400, headers });
  const [disabledTimes, disabledDays] = await Promise.all([
    getDisabledBookingTimes(client, { organizationId }),
    getDisabledBookingDays(client, { organizationId }),
  ]);
  // Still return the newest policy when a previously open date has closed,
  // so open booking panels can explain the updated range and block submission.
  if (!isBookingDateInWindow(date, bookingPolicy.bookingWindow, new Date()))
    return data(
      { key, slots: [], disabledTimes, disabledDays, bookingPolicy },
      { headers },
    );
  const { data: slots, error: availabilityError } = await client.rpc(
    "get_student_program_booking_availability",
    {
      p_organization_id: organizationId,
      p_program_id: programId,
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
