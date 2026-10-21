import { fromKST, toKST } from "./kst.ts";

export function getKSTMonthRange(year: number, month: number) {
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new RangeError("Invalid calendar month");
  }

  return {
    startDate: fromKST(year, month - 1, 1),
    endDate: fromKST(year, month, 1),
  };
}

export function parseCalendarMonth(
  params: URLSearchParams,
  today = new Date(),
) {
  const now = toKST(today);
  const year = Number(params.get("year") ?? now.year);
  const month = Number(params.get("month") ?? now.month + 1);

  try {
    getKSTMonthRange(year, month);
  } catch {
    throw new Response("Invalid calendar month", { status: 400 });
  }

  return { year, month };
}
