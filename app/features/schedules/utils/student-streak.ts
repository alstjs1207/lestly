import { fromKST, toKST, toKSTDateString } from "./kst.ts";

/** Read newest schedules first and stop as soon as a missing KST day is found. */
export async function getCurrentScheduleStreak(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: { start_time: string }[] | null;
    error: unknown;
  }>,
  today = new Date(),
): Promise<number> {
  const now = toKST(today);
  const pageSize = 500;
  let streak = 0;
  let previousDate: string | undefined;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;

    for (const schedule of data ?? []) {
      const date = toKSTDateString(new Date(schedule.start_time));
      if (date === previousDate) continue;
      const expectedDate = toKSTDateString(
        fromKST(now.year, now.month, now.day - streak),
      );
      if (date !== expectedDate) return streak;
      previousDate = date;
      streak += 1;
    }

    if (!data || data.length < pageSize) return streak;
  }
}
