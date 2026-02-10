import type { DateClickArg } from "@fullcalendar/interaction";
import type { DatesSetArg, EventClickArg, EventContentArg, EventMountArg } from "@fullcalendar/core";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useNavigate } from "react-router";
import { useIsMobile } from "~/core/hooks/use-mobile";

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

interface AdminCalendarInnerProps {
  events: CalendarEvent[];
  initialView?: "dayGridMonth" | "timeGridWeek" | "timeGridDay";
  onDateClick?: (date: Date) => void;
  onEventClick?: (scheduleId: number) => void;
  onDatesSet?: (dateInfo: DatesSetArg) => void;
}

export default function AdminCalendarInner({
  events,
  initialView = "dayGridMonth",
  onDateClick,
  onEventClick,
  onDatesSet,
}: AdminCalendarInnerProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const handleDateClick = (arg: DateClickArg) => {
    if (onDateClick) {
      onDateClick(arg.date);
    } else {
      const year = arg.date.getFullYear();
      const month = String(arg.date.getMonth() + 1).padStart(2, "0");
      const day = String(arg.date.getDate()).padStart(2, "0");
      const dateStr = `${year}-${month}-${day}`;
      navigate(`/admin/schedules/new?date=${dateStr}`);
    }
  };

  const handleEventClick = (arg: EventClickArg) => {
    const scheduleId = arg.event.extendedProps.scheduleId as number;
    if (onEventClick) {
      onEventClick(scheduleId);
    } else {
      navigate(`/admin/schedules/${scheduleId}/edit`);
    }
  };

  const renderEventContent = (eventInfo: EventContentArg) => {
    const { studentName, programName, studentColor } = eventInfo.event.extendedProps;
    const isMonthView = eventInfo.view.type === "dayGridMonth";
    const timeText = eventInfo.timeText;
    const dotColor = studentColor || "#3B82F6";

    if (isMonthView) {
      if (isMobile) {
        return (
          <div className="fc-event-main-frame overflow-hidden flex items-center gap-1 px-0.5">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: dotColor }}
            />
            <span className="fc-event-time text-xs whitespace-nowrap">{timeText}</span>
          </div>
        );
      }
      return (
        <div className="fc-event-main-frame overflow-hidden flex items-center gap-1 px-1">
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: dotColor }}
          />
          <span className="fc-event-time text-xs">{timeText}</span>
          <span className="fc-event-title truncate text-xs">
            {studentName || eventInfo.event.title}
          </span>
        </div>
      );
    }

    return (
      <div className="fc-event-main-frame p-1">
        <div className="flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: dotColor }}
          />
          <span className="fc-event-time text-xs">{timeText}</span>
        </div>
        <div className="fc-event-title-container">
          <div className="fc-event-title fc-sticky text-sm font-medium">
            {studentName || eventInfo.event.title}
            {programName && (
              <span className="opacity-70 font-normal ml-1">({programName})</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleEventDidMount = (info: EventMountArg) => {
    const { studentName, programName } = info.event.extendedProps;
    const start = info.event.start;
    const end = info.event.end;

    const timeStr = start && end
      ? `${start.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`
      : "";

    const tooltipText = programName
      ? `${studentName} (${programName})\n${timeStr}`
      : `${studentName}\n${timeStr}`;

    info.el.setAttribute("title", tooltipText);
  };

  return (
    <>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={isMobile ? "dayGridMonth" : initialView}
        headerToolbar={
          isMobile
            ? { left: "prev,next,today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }
            : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay" }
        }
        events={events}
        dateClick={handleDateClick}
        eventClick={handleEventClick}
        eventContent={renderEventContent}
        eventDidMount={handleEventDidMount}
        datesSet={onDatesSet}
        locale="ko"
        buttonText={{
          today: "오늘",
          month: "월",
          week: "주",
          day: "일",
        }}
        allDaySlot={false}
        slotMinTime="09:00:00"
        slotMaxTime="23:00:00"
        slotDuration="00:30:00"
        height="auto"
        dayMaxEvents={isMobile ? 2 : 3}
        eventTimeFormat={{
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }}
      />
      <style>{`
        /* FC Variables — Light */
        .admin-calendar .fc {
          --fc-border-color: oklch(0.922 0 0);
          --fc-button-bg-color: var(--primary);
          --fc-button-border-color: var(--primary);
          --fc-button-hover-bg-color: oklch(0.205 0 0 / 0.9);
          --fc-button-hover-border-color: oklch(0.205 0 0 / 0.9);
          --fc-button-active-bg-color: oklch(0.205 0 0 / 0.8);
          --fc-button-active-border-color: oklch(0.205 0 0 / 0.8);
          --fc-today-bg-color: oklch(0.97 0 0);
        }
        /* FC Variables — Dark */
        .dark .admin-calendar .fc {
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
        /* Toolbar */
        .admin-calendar .fc-toolbar-title {
          font-size: 1.25rem;
          font-weight: 700;
          letter-spacing: -0.025em;
        }
        .admin-calendar .fc-button {
          font-size: 0.875rem;
          padding: 0.375rem 0.75rem;
          border-radius: 0.5rem !important;
        }
        /* Column header */
        .admin-calendar .fc-col-header-cell-cushion {
          text-transform: uppercase;
          font-size: 0.75rem;
          font-weight: 500;
          letter-spacing: 0.05em;
          color: oklch(0.556 0 0) !important;
        }
        .dark .admin-calendar .fc-col-header-cell-cushion {
          color: oklch(0.708 0 0) !important;
        }
        .admin-calendar .fc-col-header-cell {
          background-color: oklch(0.97 0 0) !important;
        }
        .admin-calendar .fc-col-header {
          background-color: oklch(0.97 0 0) !important;
        }
        .admin-calendar .fc-scrollgrid-section-header th {
          background-color: oklch(0.97 0 0) !important;
        }
        .dark .admin-calendar .fc-col-header-cell,
        .dark .admin-calendar .fc-col-header,
        .dark .admin-calendar .fc-scrollgrid-section-header th {
          background-color: oklch(0.269 0 0) !important;
        }
        /* Date numbers — pill shape */
        .admin-calendar .fc-daygrid-day-number {
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
        .admin-calendar .fc-day-today .fc-daygrid-day-number {
          background-color: oklch(0.205 0 0) !important;
          color: oklch(0.985 0 0) !important;
          font-weight: 600;
        }
        .dark .admin-calendar .fc-day-today .fc-daygrid-day-number {
          background-color: oklch(0.488 0.243 264.376) !important;
          color: oklch(0.985 0 0) !important;
        }
        /* Cells */
        .admin-calendar .fc-daygrid-day {
          border: 1px solid oklch(0.922 0 0) !important;
          min-height: 100px;
          cursor: pointer;
          transition: box-shadow 0.2s;
        }
        .dark .admin-calendar .fc-daygrid-day {
          border-color: oklch(1 0 0 / 10%) !important;
        }
        .admin-calendar .fc-daygrid-day:hover {
          box-shadow: inset 0 0 0 2px oklch(0.922 0 0);
        }
        .dark .admin-calendar .fc-daygrid-day:hover {
          box-shadow: inset 0 0 0 2px oklch(1 0 0 / 15%);
        }
        .admin-calendar .fc-daygrid-day-frame {
          padding: 8px;
          min-height: 100px;
        }
        .admin-calendar .fc-daygrid-day-top {
          padding: 4px;
        }
        /* Events — layout/interaction only, colors kept from studentColor */
        .admin-calendar .fc-daygrid-event,
        .admin-calendar .fc-timegrid-event {
          border-radius: 0.375rem !important;
          box-shadow: 0 1px 2px oklch(0 0 0 / 0.05);
          transition: transform 0.15s, box-shadow 0.15s;
          cursor: pointer;
        }
        .admin-calendar .fc-daygrid-event:hover,
        .admin-calendar .fc-timegrid-event:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px oklch(0 0 0 / 0.08);
        }
        /* TimeGrid */
        .admin-calendar .fc-timegrid-slot {
          height: 48px !important;
          border-bottom: 1px solid oklch(0.922 0 0 / 0.5) !important;
        }
        .dark .admin-calendar .fc-timegrid-slot {
          border-bottom-color: oklch(1 0 0 / 6%) !important;
        }
        .admin-calendar .fc-timegrid-slot-minor {
          border-bottom-style: dotted !important;
        }
        .admin-calendar .fc-timegrid-slot-label-cushion {
          font-size: 0.75rem;
          color: oklch(0.556 0 0) !important;
          padding-right: 12px !important;
        }
        .dark .admin-calendar .fc-timegrid-slot-label-cushion {
          color: oklch(0.708 0 0) !important;
        }
        .admin-calendar .fc-timegrid-col {
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .admin-calendar .fc-timegrid-col:hover {
          background-color: oklch(0.97 0 0 / 0.5);
        }
        .dark .admin-calendar .fc-timegrid-col:hover {
          background-color: oklch(1 0 0 / 3%);
        }
        .admin-calendar .fc-timegrid-event .fc-event-main {
          padding: 6px 8px !important;
        }
        .admin-calendar .fc-timegrid-now-indicator-line {
          border-color: oklch(0.577 0.245 27.325) !important;
          border-width: 2px !important;
        }
        .admin-calendar .fc-timegrid-now-indicator-arrow {
          border-color: oklch(0.577 0.245 27.325) !important;
        }
        .admin-calendar .fc-timegrid-axis {
          width: 60px !important;
        }
        /* Outer table */
        .admin-calendar .fc-scrollgrid {
          border: none !important;
          border-radius: 0.75rem;
          overflow: hidden;
        }
        .admin-calendar .fc-scrollgrid td,
        .admin-calendar .fc-scrollgrid th {
          border: 1px solid oklch(0.922 0 0) !important;
        }
        .dark .admin-calendar .fc-scrollgrid td,
        .dark .admin-calendar .fc-scrollgrid th {
          border-color: oklch(1 0 0 / 10%) !important;
        }
        /* More link */
        .admin-calendar .fc-more-link {
          color: var(--primary);
          font-weight: 500;
        }
        .admin-calendar .fc-more-link:hover {
          opacity: 0.8;
        }
        /* Mobile responsive styles */
        @media (max-width: 767px) {
          .admin-calendar .fc-toolbar-title {
            font-size: 1rem;
          }
          .admin-calendar .fc-button {
            font-size: 0.75rem;
            padding: 0.25rem 0.5rem;
          }
          .admin-calendar .fc-daygrid-day {
            min-height: 60px;
          }
          .admin-calendar .fc-daygrid-day-frame {
            padding: 2px;
            min-height: 60px;
          }
          .admin-calendar .fc-daygrid-day-top {
            padding: 2px;
          }
          .admin-calendar .fc-col-header-cell-cushion {
            font-size: 0.75rem;
            padding: 4px 2px;
          }
          .admin-calendar .fc-daygrid-event {
            font-size: 0.65rem;
          }
          .admin-calendar .fc-daygrid-day-number {
            font-size: 0.75rem;
          }
        }
      `}</style>
    </>
  );
}
