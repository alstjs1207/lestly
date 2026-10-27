import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOKING_WEEKDAYS,
  disabledBookingDaysFromForm,
  isBookingDayDisabled,
  parseDisabledBookingDays,
} from "../app/features/app-settings/booking-days.ts";
import { desktopBookingSlots } from "../app/features/schedules/utils/desktop-booking.ts";
import { bookingDateReason } from "../app/features/schedules/utils/student-booking.ts";

const course = { classStartDate: null, classEndDate: null };
const now = new Date("2026-10-23T00:00:00Z");

test("weekday settings support none, all and deduplicated selections; malformed input fails closed", () => {
  const form = new FormData();
  assert.throws(() => disabledBookingDaysFromForm(form));
  form.set("booking_days_present", "1");
  assert.deepEqual(disabledBookingDaysFromForm(form), []);
  for (const day of ["0", "6", "0"]) form.append("disabled_weekdays", day);
  assert.deepEqual(disabledBookingDaysFromForm(form), [6, 0]);
  assert.deepEqual(parseDisabledBookingDays([0, 6, 1, 0]), [1, 6, 0]);
  assert.equal(
    parseDisabledBookingDays(BOOKING_WEEKDAYS.map((day) => day.value)).length,
    7,
  );
  for (const value of [null, {}, "0", ["0"], [-1], [7], [0.5], [NaN], [true]])
    assert.throws(() => parseDisabledBookingDays(value));
  for (const value of ["7", "-1", "01", "1.0", "", " "]) {
    form.set("disabled_weekdays", value);
    assert.throws(() => disabledBookingDaysFromForm(form));
  }
});

test("Korean civil weekdays apply at midnight and across month/year boundaries in every host timezone", () => {
  assert.equal(isBookingDayDisabled("2026-10-25", [0]), true);
  assert.equal(isBookingDayDisabled("2026-10-26", [0]), false);
  assert.equal(isBookingDayDisabled("2027-01-01", [5]), true);
  assert.equal(isBookingDayDisabled("2028-02-29", [2]), true);
  assert.equal(bookingDateReason("2026-10-24", course, now), null);
  assert.match(
    bookingDateReason(
      "2026-10-24",
      { ...course, disabledBookingDays: [6, 0] },
      now,
    )!,
    /휴무일/,
  );
  // At Sunday midnight KST the UTC date is still Saturday.
  assert.match(
    bookingDateReason(
      "2026-10-25",
      { ...course, disabledBookingDays: [0] },
      new Date("2026-10-24T15:00:00Z"),
    )!,
    /휴무일/,
  );
});

test("current availability blocks every duration on a closed day even without RPC slots; stale responses stay isolated", () => {
  for (const hours of [3, 6, 9]) {
    const slots = desktopBookingSlots("2026-10-24", hours, course, [], now, {
      key: `2026-10-24:${hours}`,
      slots: null,
      disabledDays: [6],
    });
    assert.equal(slots.length, 23);
    assert.ok(slots.every((slot) => slot.reason?.includes("휴무일")));
  }
  const stale = { key: "2026-10-24:3", slots: null, disabledDays: [0, 6] };
  assert.ok(
    desktopBookingSlots("2026-10-25", 3, course, [], now, stale).every(
      (slot) => slot.reason === null,
    ),
  );
  assert.ok(
    desktopBookingSlots("2026-10-24", 6, course, [], now, stale).every(
      (slot) => slot.reason === null,
    ),
  );
  const sqlOnly = desktopBookingSlots("2026-10-24", 3, course, [], now, {
    key: "2026-10-24:3",
    slots: [
      {
        start_time: "2026-10-24T09:00:00+09:00",
        available: false,
        reason: "day_disabled",
      },
    ],
  });
  assert.match(sqlOnly[0].reason!, /휴무일/);
});
