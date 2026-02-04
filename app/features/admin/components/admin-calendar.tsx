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

interface AdminCalendarProps {
  events: CalendarEvent[];
  initialView?: "dayGridMonth" | "timeGridWeek" | "timeGridDay";
  onDateClick?: (date: Date) => void;
  onEventClick?: (scheduleId: number) => void;
  onDatesSet?: (dateInfo: DatesSetArg) => void;
}

export default function AdminCalendar({
  events,
  initialView = "dayGridMonth",
  onDateClick,
  onEventClick,
  onDatesSet,
}: AdminCalendarProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const handleDateClick = (arg: DateClickArg) => {
    if (onDateClick) {
      onDateClick(arg.date);
    } else {
      // Default: navigate to create schedule with date
      // Use local date format to avoid timezone issues
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
      // Default: navigate to edit schedule
      navigate(`/admin/schedules/${scheduleId}/edit`);
    }
  };

  // Customize event content based on view
  const renderEventContent = (eventInfo: EventContentArg) => {
    const { studentName, programName, studentColor } = eventInfo.event.extendedProps;
    const isMonthView = eventInfo.view.type === "dayGridMonth";
    const timeText = eventInfo.timeText;
    const dotColor = studentColor || "#3B82F6";

    if (isMonthView) {
      // Month view: compact display
      if (isMobile) {
        // Mobile month: show only dot + time (no student name)
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
      // Desktop month: dot + time + student name
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

    // Week/Day view: show color dot + student name + class name
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

  // Add tooltip on event mount
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
    <div className="admin-calendar">
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
        .admin-calendar .fc {
          --fc-border-color: hsl(var(--border));
          --fc-button-bg-color: hsl(var(--primary));
          --fc-button-border-color: hsl(var(--primary));
          --fc-button-hover-bg-color: hsl(var(--primary) / 0.9);
          --fc-button-hover-border-color: hsl(var(--primary) / 0.9);
          --fc-button-active-bg-color: hsl(var(--primary) / 0.8);
          --fc-button-active-border-color: hsl(var(--primary) / 0.8);
          --fc-today-bg-color: hsl(var(--accent));
        }
        .admin-calendar .fc-toolbar-title {
          font-size: 1.25rem;
          font-weight: 600;
        }
        .admin-calendar .fc-button {
          font-size: 0.875rem;
          padding: 0.375rem 0.75rem;
        }
        .admin-calendar .fc-daygrid-day {
          border: 1px solid rgba(128, 128, 128, 0.4) !important;
          min-height: 100px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .admin-calendar .fc-daygrid-day:hover {
          background-color: rgba(128, 128, 128, 0.2);
        }
        .admin-calendar .fc-daygrid-day-frame {
          padding: 8px;
          min-height: 100px;
        }
        .admin-calendar .fc-daygrid-day-top {
          padding: 4px;
        }
        .admin-calendar .fc-scrollgrid {
          border: 1px solid rgba(128, 128, 128, 0.4) !important;
        }
        .admin-calendar .fc-scrollgrid td,
        .admin-calendar .fc-scrollgrid th {
          border: 1px solid rgba(128, 128, 128, 0.4) !important;
        }
        .admin-calendar .fc-col-header-cell-cushion,
        .admin-calendar .fc-daygrid-day-number {
          color: hsl(var(--foreground)) !important;
        }
        .admin-calendar .fc-col-header-cell {
          background-color: hsl(var(--muted)) !important;
        }
        .admin-calendar .fc-col-header {
          background-color: hsl(var(--muted)) !important;
        }
        .admin-calendar .fc-scrollgrid-section-header th {
          background-color: hsl(var(--muted)) !important;
        }
        .admin-calendar .fc-daygrid-event {
          cursor: pointer;
        }
        .admin-calendar .fc-timegrid-event {
          cursor: pointer;
        }
        /* More link styles */
        .admin-calendar .fc-more-link {
          color: hsl(var(--primary));
          font-weight: 500;
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
    </div>
  );
}
