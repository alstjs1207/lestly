import assert from "node:assert/strict";
import test from "node:test";

import { getStudentBookingOrganization } from "../app/features/schedules/utils/booking-organization.server.ts";

test("booking tenant is selected by class and verified against that tenant's NORMAL membership", async () => {
  const memberships = [
    {
      organization_id: "a",
      profile_id: "student",
      role: "STUDENT",
      state: "NORMAL",
    },
    {
      organization_id: "b",
      profile_id: "student",
      role: "STUDENT",
      state: "NORMAL",
    },
  ];
  const classes = [
    { program_id: 7, organization_id: "b" },
    { program_id: 8, organization_id: "foreign" },
  ];
  const client: any = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return query;
        },
        maybeSingle: async () => ({
          error: null,
          data:
            (table === "programs" ? classes : memberships).find((row) =>
              Object.entries(filters).every(
                ([key, value]) => (row as any)[key] === value,
              ),
            ) ?? null,
        }),
      };
      return query;
    },
  };
  assert.equal(
    await getStudentBookingOrganization(client, {
      profileId: "student",
      programId: 7,
    }),
    "b",
  );
  assert.equal(
    await getStudentBookingOrganization(client, {
      profileId: "student",
      programId: 8,
    }),
    null,
  );
  memberships[1].state = "GRADUATE";
  assert.equal(
    await getStudentBookingOrganization(client, {
      profileId: "student",
      programId: 7,
    }),
    null,
  );
  assert.equal(
    await getStudentBookingOrganization(client, {
      profileId: "other",
      programId: 7,
    }),
    null,
  );
  assert.equal(
    await getStudentBookingOrganization(client, {
      profileId: "student",
      programId: 0,
    }),
    null,
  );
});
