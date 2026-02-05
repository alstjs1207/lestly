import { useCallback, useMemo, useRef, useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isBefore,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  format,
} from "date-fns";
import { cn } from "~/core/lib/utils";
import { canStudentRegisterSchedule } from "~/features/schedules/utils/student-schedule-rules";

interface CalendarEvent {
  id: string;
  start: string | Date;
  end: string | Date;
}

interface MobileMonthGridProps {
  events: CalendarEvent[];
  selectedDate: Date;
  displayedMonth: Date;
  onDateSelect: (date: Date) => void;
  onMonthChange: (direction: -1 | 1) => void;
  eventColorsByDate?: Map<string, string[]>;
  disableDateRestrictions?: boolean;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const SWIPE_THRESHOLD = 50;

function getMonthDays(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];
  let current = start;
  while (current <= end) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

export function MobileMonthGrid({
  events,
  selectedDate,
  displayedMonth,
  onDateSelect,
  onMonthChange,
  eventColorsByDate,
  disableDateRestrictions,
}: MobileMonthGridProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchLockedRef = useRef<"horizontal" | "vertical" | null>(null);

  const days = useMemo(() => getMonthDays(displayedMonth), [displayedMonth]);

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

    if (!touchLockedRef.current) {
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        touchLockedRef.current =
          Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
      }
      return;
    }

    if (touchLockedRef.current === "vertical") return;

    e.preventDefault();
    setSwipeOffset(dx);
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current || isAnimating) return;

    if (touchLockedRef.current === "horizontal") {
      if (swipeOffset > SWIPE_THRESHOLD) {
        animateAndChange(-1); // swipe right → prev month
      } else if (swipeOffset < -SWIPE_THRESHOLD) {
        animateAndChange(1); // swipe left → next month
      } else {
        setSwipeOffset(0);
      }
    } else {
      setSwipeOffset(0);
    }

    touchStartRef.current = null;
    touchLockedRef.current = null;
  };

  const animateAndChange = (direction: -1 | 1) => {
    setIsAnimating(true);
    setSwipeOffset(direction === 1 ? -window.innerWidth : window.innerWidth);

    setTimeout(() => {
      onMonthChange(direction);
      setSwipeOffset(0);
      setIsAnimating(false);
    }, 200);
  };

  return (
    <div
      className="overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isAnimating ? "transform 200ms ease-out" : "none",
        }}
      >
        {/* Day labels */}
        <div className="grid grid-cols-7 text-center text-[0.6875rem] font-medium tracking-wider text-muted-foreground mb-1 px-2">
          {DAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn(
                "py-1",
                i === 0 && "text-red-400",
                i === 6 && "text-blue-400",
              )}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Date grid */}
        <div className="grid grid-cols-7 px-2">
          {days.map((date) => {
            const today = isToday(date);
            const selected = isSameDay(date, selectedDate);
            const inMonth = isSameMonth(date, displayedMonth);
            const count = getEventCount(date);
            const isSun = date.getDay() === 0;
            const isSat = date.getDay() === 6;
            const isPast = isBefore(date, startOfDay(new Date()));
            const disabled = disableDateRestrictions
              ? !inMonth
              : !inMonth || isPast || !canStudentRegisterSchedule(date);

            return (
              <button
                key={date.toISOString()}
                type="button"
                className="flex flex-col items-center py-1.5 gap-0.5"
                onClick={() => onDateSelect(date)}
              >
                <div
                  className={cn(
                    "w-9 h-9 flex items-center justify-center rounded-full text-sm transition-all duration-200",
                    disabled && !selected && "text-muted-foreground/40",
                    inMonth && selected && "bg-primary text-primary-foreground font-semibold shadow-sm shadow-primary/25",
                    inMonth && !selected && today && "ring-2 ring-primary font-semibold",
                    inMonth && !selected && !today && !disabled && "hover:bg-muted active:bg-muted",
                    inMonth && !selected && !today && !disabled && isSun && "text-red-400",
                    inMonth && !selected && !today && !disabled && isSat && "text-blue-400",
                  )}
                >
                  {format(date, "d")}
                </div>
                <div className="flex flex-wrap justify-center gap-0.5 min-h-1">
                  {inMonth &&
                    (() => {
                      const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                      const colors = eventColorsByDate?.get(dateKey);
                      if (colors && colors.length > 0) {
                        const uniqueColors = [...new Set(colors)];
                        return uniqueColors.map((color, i) => (
                          <div
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                        ));
                      }
                      return Array.from({ length: count }).map((_, i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-primary/80"
                        />
                      ));
                    })()}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
