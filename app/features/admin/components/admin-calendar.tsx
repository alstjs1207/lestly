import type { DatesSetArg } from "@fullcalendar/core";

import type { BookingPolicy } from "../../app-settings/booking-policy";

import { Suspense, lazy } from "react";

import { CalendarSkeleton } from "~/core/components/calendar-skeleton";

// Lazy load the calendar implementation
const AdminCalendarInner = lazy(() => import("./admin-calendar-inner"));

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  extendedProps?: {
    studentId: string;
    scheduleId: number;
    programId?: number | null;
    studentName?: string;
    programName?: string | null;
    studentColor?: string;
  };
}

interface AdminCalendarProps {
  events: CalendarEvent[];
  initialView?: "dayGridMonth" | "timeGridWeek" | "timeGridDay";
  initialDate?: string;
  bookingPolicy?: BookingPolicy;
  onDateClick?: (date: Date) => void;
  onEventClick?: (scheduleId: number) => void;
  onDatesSet?: (dateInfo: DatesSetArg) => void;
  onDaySelect?: (date: Date) => void;
  selectedDate?: Date | null;
}

export default function AdminCalendar(props: AdminCalendarProps) {
  return (
    <div className="admin-calendar">
      <Suspense fallback={<CalendarSkeleton />}>
        <AdminCalendarInner {...props} />
      </Suspense>
    </div>
  );
}
