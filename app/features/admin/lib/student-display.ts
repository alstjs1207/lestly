const koreanTimeZone = "Asia/Seoul";
export function studentScheduleDay(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: koreanTimeZone,
    weekday: "short",
  }).format(date);
}
export function studentScheduleDate(
  date: Date,
  month: "short" | "long" = "short",
) {
  return date.toLocaleDateString("ko-KR", {
    timeZone: koreanTimeZone,
    month,
    day: "numeric",
  });
}
export function studentScheduleTime(date: Date) {
  return date.toLocaleTimeString("ko-KR", {
    timeZone: koreanTimeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}
export function studentAge(birthDate: string, now = new Date()) {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: koreanTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) =>
    Number(date.find((part) => part.type === type)?.value);
  const [year, month, day] = birthDate.split("-").map(Number);
  return (
    value("year") -
    year -
    (value("month") < month || (value("month") === month && value("day") < day)
      ? 1
      : 0)
  );
}
