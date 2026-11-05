import { useState } from "react";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";

import { addMonthsToDateString } from "../lib/student-class-dates";

export default function StudentCourseDates({
  creating,
  startDate = "",
  endDate = "",
  errors,
}: {
  creating: boolean;
  startDate?: string;
  endDate?: string;
  errors?: { class_start_date?: string[]; class_end_date?: string[] };
}) {
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="class_start_date">
          수업 시작일{" "}
          <span className="text-muted-foreground text-xs">(선택)</span>
        </Label>
        <Input
          id="class_start_date"
          name="class_start_date"
          type="date"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          aria-invalid={Boolean(errors?.class_start_date?.length)}
          aria-describedby="course-start-help"
        />
        {errors?.class_start_date?.[0] && (
          <p role="alert" className="text-destructive text-xs">
            {errors.class_start_date[0]}
          </p>
        )}
        <p id="course-start-help" className="text-muted-foreground text-xs">
          {creating
            ? "미입력 시 오늘 날짜로 저장됩니다."
            : "시작일이 없으면 새 예약을 등록할 수 없습니다."}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="class_end_date">
          수업 종료일{" "}
          <span className="text-muted-foreground text-xs">(선택)</span>
        </Label>
        <Input
          id="class_end_date"
          name="class_end_date"
          type="date"
          value={end}
          min={start || undefined}
          required={creating || Boolean(start)}
          onChange={(event) => setEnd(event.target.value)}
          aria-invalid={Boolean(errors?.class_end_date?.length)}
          aria-describedby="course-end-help"
        />
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="수강 기간 선택"
        >
          {[1, 3, 6, 12].map((months) => (
            <Button
              key={months}
              type="button"
              variant="outline"
              size="sm"
              disabled={!start}
              onClick={() => setEnd(addMonthsToDateString(start, months))}
            >
              {months === 12 ? "1년" : `${months}개월`}
            </Button>
          ))}
        </div>
        {errors?.class_end_date?.[0] && (
          <p role="alert" className="text-destructive text-xs">
            {errors.class_end_date[0]}
          </p>
        )}
        <p id="course-end-help" className="text-muted-foreground text-xs">
          {creating
            ? "종료일을 직접 입력하거나 시작일 입력 후 기간을 선택해 주세요. 종료일은 자동 저장되지 않습니다."
            : "시작일을 입력하면 종료일도 입력해야 합니다. 시작일 입력 후 기간 버튼을 사용할 수 있습니다."}
        </p>
      </div>
    </>
  );
}
