import { Skeleton } from "~/core/components/ui/skeleton";

export function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header toolbar skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="h-9 w-16" />
        </div>
        <Skeleton className="h-7 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-12" />
          <Skeleton className="h-9 w-12" />
          <Skeleton className="h-9 w-12" />
        </div>
      </div>

      {/* Calendar grid skeleton */}
      <div className="rounded-lg border">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="p-3 text-center">
              <Skeleton className="mx-auto h-4 w-8" />
            </div>
          ))}
        </div>

        {/* Calendar cells - 5 weeks */}
        {Array.from({ length: 5 }).map((_, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7">
            {Array.from({ length: 7 }).map((_, dayIndex) => (
              <div
                key={dayIndex}
                className="min-h-[100px] border-b border-r p-2 last:border-r-0"
              >
                <Skeleton className="mb-2 h-5 w-5 rounded-full" />
                {weekIndex % 2 === 0 && dayIndex % 3 === 0 && (
                  <Skeleton className="mb-1 h-5 w-full" />
                )}
                {weekIndex % 3 === 1 && dayIndex % 2 === 0 && (
                  <Skeleton className="h-5 w-3/4" />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
