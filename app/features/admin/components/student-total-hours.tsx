import { Suspense } from "react";
import { Await, useLocation } from "react-router";

export function StudentTotalHours({
  totals,
  studentId,
}: {
  totals: Promise<Record<string, number>>;
  studentId: string;
}) {
  const location = useLocation();
  return (
    <Suspense
      key={`${location.key}:${studentId}`}
      fallback={
        <span className="text-muted-foreground" role="status" aria-busy="true">
          계산 중…
        </span>
      }
    >
      <Await
        resolve={totals}
        errorElement={
          <span
            className="text-muted-foreground"
            title="수강 시간을 불러오지 못했습니다."
          >
            확인 불가
          </span>
        }
      >
        {(hours: Record<string, number>) => (
          <span>{Math.round((hours[studentId] ?? 0) * 10) / 10}시간</span>
        )}
      </Await>
    </Suspense>
  );
}
