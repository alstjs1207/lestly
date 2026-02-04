import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  startOfWeek,
  addWeeks,
  addDays,
  isSameDay,
  isToday,
  format,
} from "date-fns";
import { cn } from "~/core/lib/utils";

interface CalendarEvent {
  id: string;
  start: string | Date;
  end: string | Date;
}

interface MobileWeekStripProps {
  events: CalendarEvent[];
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  onWeekChange?: (weekStart: Date) => void;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const SWIPE_THRESHOLD = 50;

function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 0 });
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function MobileWeekStrip({
  events,
  selectedDate,
  onDateSelect,
  onWeekChange,
}: MobileWeekStripProps) {
  const [weekStart, setWeekStart] = useState(() =>
    getWeekStart(selectedDate),
  );
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchLockedRef = useRef<"horizontal" | "vertical" | null>(null);

  const currentWeek = useMemo(() => getWeekDays(weekStart), [weekStart]);

  // Count events per date for dots
  const eventCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const event of events) {
      const d = new Date(event.start);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [events]);

  const getEventCount = useCallback(
    (date: Date) => {
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      return eventCountByDate.get(key) || 0;
    },
    [eventCountByDate],
  );

  const changeWeek = useCallback(
    (direction: -1 | 1) => {
      const newStart = addWeeks(weekStart, direction);
      setWeekStart(newStart);
      onWeekChange?.(newStart);
    },
    [weekStart, onWeekChange],
  );

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isAnimating) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    touchLockedRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || isAnimating) return;

    const dx = e.touches[0].clientX - touchStartRef.current.x;
    const dy = e.touches[0].clientY - touchStartRef.current.y;

    // Lock direction on first significant movement
    if (!touchLockedRef.current) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        touchLockedRef.current =
          Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      return;
    }

    if (touchLockedRef.current === "vertical") return;

    // Prevent vertical scrolling while swiping horizontally
    e.preventDefault();
    setSwipeOffset(dx);
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current || isAnimating) return;

    if (touchLockedRef.current === "horizontal") {
      if (swipeOffset > SWIPE_THRESHOLD) {
        // Swiped right -> previous week
        animateAndChangeWeek(-1);
      } else if (swipeOffset < -SWIPE_THRESHOLD) {
        // Swiped left -> next week
        animateAndChangeWeek(1);
      } else {
        // Snap back
        setSwipeOffset(0);
      }
    } else {
      setSwipeOffset(0);
    }

    touchStartRef.current = null;
    touchLockedRef.current = null;
  };

  const animateAndChangeWeek = (direction: -1 | 1) => {
    setIsAnimating(true);
    // Animate off-screen in the swipe direction
    setSwipeOffset(direction === 1 ? -window.innerWidth : window.innerWidth);

    setTimeout(() => {
      // Change week data, reset position instantly
      changeWeek(direction);
      setSwipeOffset(0);
      setIsAnimating(false);
    }, 200);
  };

  // When selectedDate changes externally, update weekStart if needed
  useEffect(() => {
    const newWeekStart = getWeekStart(selectedDate);
    if (!isSameDay(newWeekStart, weekStart)) {
      setWeekStart(newWeekStart);
      onWeekChange?.(newWeekStart);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  return (
    <div>
      {/* Day labels header */}
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground mb-1 px-2">
        {DAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={cn(
              i === 0 && "text-red-500",
              i === 6 && "text-blue-500",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Week dates with touch swipe */}
      <div
        className="overflow-hidden touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="grid grid-cols-7 px-2"
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: isAnimating ? "transform 200ms ease-out" : "none",
          }}
        >
          {currentWeek.map((date) => {
            const today = isToday(date);
            const selected = isSameDay(date, selectedDate);
            const count = getEventCount(date);
            const isSun = date.getDay() === 0;
            const isSat = date.getDay() === 6;

            return (
              <button
                key={date.toISOString()}
                type="button"
                className="flex flex-col items-center py-2 gap-1"
                onClick={() => onDateSelect(date)}
              >
                <div
                  className={cn(
                    "w-9 h-9 flex items-center justify-center rounded-full text-sm font-medium transition-colors",
                    selected && "bg-primary text-primary-foreground",
                    !selected && today && "ring-2 ring-primary",
                    !selected && !today && isSun && "text-red-500",
                    !selected && !today && isSat && "text-blue-500",
                  )}
                >
                  {format(date, "d")}
                </div>
                {/* Event dots */}
                <div className="flex gap-0.5 h-1.5">
                  {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-primary"
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
