import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

interface StudentCalendarInnerProps {
  events: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    extendedProps: {
      scheduleId: number;
      programTitle: string | null;
    };
  }>;
  allowedStartDate: string;
  allowedEndDate: string;
  onDateClick: (arg: { date: Date }) => void;
  onEventClick: (arg: {
    event: {
      id: string;
      title: string;
      start: Date | null;
      end: Date | null;
      extendedProps: Record<string, unknown>;
    };
  }) => void;
}

export default function StudentCalendarInner({
  events,
  allowedStartDate,
  allowedEndDate,
  onDateClick,
  onEventClick,
}: StudentCalendarInnerProps) {
  return (
    <>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek",
        }}
        events={events}
        dateClick={onDateClick}
        eventClick={onEventClick}
        locale="ko"
        buttonText={{
          today: "오늘",
          month: "월",
          week: "주",
        }}
        validRange={{
          start: allowedStartDate,
          end: allowedEndDate,
        }}
        allDaySlot={false}
        slotMinTime="09:00:00"
        slotMaxTime="23:00:00"
        slotDuration="00:30:00"
        height="auto"
        dayMaxEvents={3}
        eventTimeFormat={{
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }}
      />
      <style>{`
        .fc {
          --fc-border-color: oklch(0.922 0 0);
          --fc-button-bg-color: var(--primary);
          --fc-button-border-color: var(--primary);
          --fc-button-hover-bg-color: oklch(0.205 0 0 / 0.9);
          --fc-button-hover-border-color: oklch(0.205 0 0 / 0.9);
          --fc-button-active-bg-color: oklch(0.205 0 0 / 0.8);
          --fc-button-active-border-color: oklch(0.205 0 0 / 0.8);
          --fc-today-bg-color: oklch(0.97 0 0);
        }
        .dark .fc {
          --fc-border-color: oklch(1 0 0 / 10%);
          --fc-button-bg-color: oklch(0.35 0 0);
          --fc-button-border-color: oklch(0.4 0 0);
          --fc-button-hover-bg-color: oklch(0.4 0 0);
          --fc-button-hover-border-color: oklch(0.45 0 0);
          --fc-button-active-bg-color: oklch(0.45 0 0);
          --fc-button-active-border-color: oklch(0.5 0 0);
          --fc-today-bg-color: oklch(0.269 0 0);
          --fc-button-text-color: oklch(0.985 0 0);
        }
        .fc-toolbar-title {
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.025em;
        }
        .fc-button {
          font-size: 0.875rem;
          padding: 0.375rem 0.75rem;
          border-radius: 0.5rem !important;
        }
        /* Column header */
        .fc-col-header-cell-cushion {
          text-transform: uppercase;
          font-size: 0.75rem;
          font-weight: 500;
          letter-spacing: 0.05em;
          color: oklch(0.556 0 0) !important;
        }
        .dark .fc-col-header-cell-cushion {
          color: oklch(0.708 0 0) !important;
        }
        .fc-col-header-cell {
          background-color: oklch(0.97 0 0) !important;
        }
        .fc-col-header {
          background-color: oklch(0.97 0 0) !important;
        }
        .fc-scrollgrid-section-header th {
          background-color: oklch(0.97 0 0) !important;
        }
        .dark .fc-col-header-cell,
        .dark .fc-col-header,
        .dark .fc-scrollgrid-section-header th {
          background-color: oklch(0.269 0 0) !important;
        }
        /* Date numbers */
        .fc-daygrid-day-number {
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 0.875rem;
          white-space: nowrap;
          color: var(--foreground) !important;
          text-decoration: none !important;
        }
        .fc-day-today .fc-daygrid-day-number {
          background-color: oklch(0.205 0 0) !important;
          color: oklch(0.985 0 0) !important;
          font-weight: 600;
        }
        .dark .fc-day-today .fc-daygrid-day-number {
          background-color: oklch(0.488 0.243 264.376) !important;
          color: oklch(0.985 0 0) !important;
        }
        /* Cells */
        .fc-daygrid-day {
          border: 1px solid oklch(0.922 0 0) !important;
          min-height: 100px;
          cursor: pointer;
          transition: box-shadow 0.2s;
        }
        .dark .fc-daygrid-day {
          border-color: oklch(1 0 0 / 10%) !important;
        }
        .fc-daygrid-day:hover {
          box-shadow: inset 0 0 0 2px oklch(0.922 0 0);
        }
        .dark .fc-daygrid-day:hover {
          box-shadow: inset 0 0 0 2px oklch(1 0 0 / 15%);
        }
        .fc-daygrid-day-frame {
          padding: 8px;
          min-height: 100px;
        }
        .fc-daygrid-day-top {
          padding: 4px;
        }
        /* Events */
        .fc-daygrid-event,
        .fc-timegrid-event {
          background-color: oklch(0.488 0.243 264.376 / 0.12) !important;
          border: none !important;
          border-left: 3px solid oklch(0.488 0.243 264.376) !important;
          border-radius: 0.375rem !important;
          box-shadow: 0 1px 2px oklch(0 0 0 / 0.05);
          transition: transform 0.15s, box-shadow 0.15s;
          color: oklch(0.205 0 0) !important;
        }
        .dark .fc-daygrid-event,
        .dark .fc-timegrid-event {
          background-color: oklch(0.488 0.243 264.376 / 0.2) !important;
          border-left-color: oklch(0.6 0.25 264.376) !important;
          color: oklch(0.985 0 0) !important;
        }
        .fc-daygrid-event:hover,
        .fc-timegrid-event:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px oklch(0 0 0 / 0.08);
        }
        .fc-event-title,
        .fc-event-time {
          color: inherit !important;
        }
        .fc-daygrid-dot-event {
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          padding: 4px 6px !important;
          gap: 1px !important;
        }
        .fc-daygrid-dot-event .fc-daygrid-event-dot {
          display: none !important;
        }
        .fc-daygrid-dot-event .fc-event-time {
          font-size: 0.7rem;
          opacity: 0.75;
          white-space: nowrap !important;
          order: -1;
        }
        .fc-daygrid-dot-event .fc-event-title {
          font-weight: 600;
          font-size: 0.75rem;
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: unset !important;
          word-break: break-all !important;
        }
        /* TimeGrid (weekly view) */
        .fc-timegrid-slot {
          height: 48px !important;
          border-bottom: 1px solid oklch(0.922 0 0 / 0.5) !important;
        }
        .dark .fc-timegrid-slot {
          border-bottom-color: oklch(1 0 0 / 6%) !important;
        }
        .fc-timegrid-slot-minor {
          border-bottom-style: dotted !important;
        }
        .fc-timegrid-slot-label-cushion {
          font-size: 0.75rem;
          color: oklch(0.556 0 0) !important;
          padding-right: 12px !important;
        }
        .dark .fc-timegrid-slot-label-cushion {
          color: oklch(0.708 0 0) !important;
        }
        .fc-timegrid-col {
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .fc-timegrid-col:hover {
          background-color: oklch(0.97 0 0 / 0.5);
        }
        .dark .fc-timegrid-col:hover {
          background-color: oklch(1 0 0 / 3%);
        }
        .fc-timegrid-event .fc-event-main {
          padding: 6px 8px !important;
        }
        .fc-timegrid-event .fc-event-time {
          font-size: 0.75rem;
          font-weight: 500;
          opacity: 0.8;
          color: oklch(0.205 0 0) !important;
        }
        .dark .fc-timegrid-event .fc-event-time {
          color: oklch(0.985 0 0) !important;
        }
        .fc-timegrid-event .fc-event-title {
          font-size: 0.8125rem;
          font-weight: 600;
          color: oklch(0.205 0 0) !important;
        }
        .dark .fc-timegrid-event .fc-event-title {
          color: oklch(0.985 0 0) !important;
        }
        .fc-timegrid-now-indicator-line {
          border-color: oklch(0.577 0.245 27.325) !important;
          border-width: 2px !important;
        }
        .fc-timegrid-now-indicator-arrow {
          border-color: oklch(0.577 0.245 27.325) !important;
        }
        .fc-timegrid-axis {
          width: 60px !important;
        }
        /* Outer table */
        .fc-scrollgrid {
          border: none !important;
          border-radius: 0.75rem;
          overflow: hidden;
        }
        .fc-scrollgrid td,
        .fc-scrollgrid th {
          border: 1px solid oklch(0.922 0 0) !important;
        }
        .dark .fc-scrollgrid td,
        .dark .fc-scrollgrid th {
          border-color: oklch(1 0 0 / 10%) !important;
        }
        /* More link */
        .fc-more-link {
          color: var(--primary);
          font-weight: 500;
        }
        .fc-more-link:hover {
          opacity: 0.8;
        }
      `}</style>
    </>
  );
}
