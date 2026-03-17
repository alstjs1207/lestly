import { useFetcher } from "react-router";
import { useEffect, useState } from "react";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/core/components/ui/select";
import { Checkbox } from "~/core/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { DURATION_OPTIONS, generateTimeSlots } from "~/features/schedules/utils/student-schedule-rules";

interface Student {
  profile_id: string;
  name: string;
  color: string | null;
}

interface Program {
  program_id: number;
  title: string;
  subtitle: string | null;
}

interface ScheduleFormProps {
  mode: "create" | "edit";
  students: Student[];
  programs?: Program[];
  defaultValues?: {
    schedule_id?: number;
    student_id?: string;
    program_id?: number;
    date?: string;
    start_time?: string;
    duration?: string;
    is_recurring?: boolean;
  };
}

export default function ScheduleForm({
  mode,
  students,
  programs = [],
  defaultValues,
}: ScheduleFormProps) {
  const fetcher = useFetcher<{ success: boolean; error?: string }>();
  const isSubmitting = fetcher.state !== "idle";
  const [isRecurring, setIsRecurring] = useState(defaultValues?.is_recurring || false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [selectedTime, setSelectedTime] = useState(defaultValues?.start_time || "");

  const allSelected = students.length > 0 && selectedStudents.size === students.length;

  function toggleStudent(id: string) {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(students.map((s) => s.profile_id)));
    }
  }

  useEffect(() => {
    if (fetcher.data && !fetcher.data.success && fetcher.data.error) {
      setErrorMessage(fetcher.data.error);
    }
  }, [fetcher.data]);

  const actionUrl =
    mode === "create"
      ? "/api/admin/schedules/create"
      : `/api/admin/schedules/${defaultValues?.schedule_id}/update`;

  const timeSlots = generateTimeSlots(30);

  return (
    <>
    <fetcher.Form method="post" action={actionUrl} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {mode === "create" ? (
          <div className="space-y-2 md:col-span-2">
            <Label>수강생 * {selectedStudents.size > 0 && <span className="text-muted-foreground text-xs font-normal">({selectedStudents.size}명 선택됨)</span>}</Label>
            <div className="rounded-md border p-3 space-y-2 max-h-48 overflow-y-auto">
              <div className="flex items-center space-x-2 pb-2 border-b">
                <Checkbox
                  id="select-all"
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                />
                <label htmlFor="select-all" className="text-sm font-medium">전체 선택</label>
              </div>
              {students.map((student) => (
                <div key={student.profile_id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`student-${student.profile_id}`}
                    checked={selectedStudents.has(student.profile_id)}
                    onCheckedChange={() => toggleStudent(student.profile_id)}
                  />
                  <label htmlFor={`student-${student.profile_id}`} className="flex items-center gap-2 text-sm">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: student.color || "#3B82F6" }}
                    />
                    {student.name}
                  </label>
                </div>
              ))}
            </div>
            {selectedStudents.size === 0 && (
              <p className="text-xs text-destructive">수강생을 1명 이상 선택해주세요.</p>
            )}
            {Array.from(selectedStudents).map((id) => (
              <input key={id} type="hidden" name="student_ids" value={id} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="student_id">수강생 *</Label>
            <Select
              name="student_id"
              defaultValue={defaultValues?.student_id}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="수강생 선택" />
              </SelectTrigger>
              <SelectContent>
                {students.map((student) => (
                  <SelectItem key={student.profile_id} value={student.profile_id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: student.color || "#3B82F6" }}
                      />
                      {student.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {programs.length > 1 ? (
          <div className="space-y-2">
            <Label htmlFor="program_id">클래스 *</Label>
            <Select
              name="program_id"
              defaultValue={defaultValues?.program_id?.toString()}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="클래스 선택" />
              </SelectTrigger>
              <SelectContent>
                {programs.map((program) => (
                  <SelectItem key={program.program_id} value={program.program_id.toString()}>
                    <div>
                      {program.title}
                      {program.subtitle && (
                        <span className="text-muted-foreground ml-2 text-xs">
                          {program.subtitle}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : programs.length === 1 ? (
          <input type="hidden" name="program_id" value={programs[0].program_id.toString()} />
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="date">날짜 *</Label>
          <Input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={defaultValues?.date}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>시작 시간 *</Label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
            {timeSlots.map((slot) => (
              <Button
                key={slot.value}
                type="button"
                variant={selectedTime === slot.value ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedTime(slot.value)}
              >
                {slot.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            시작 시간: 09:00 ~ 20:00
          </p>
          <input type="hidden" name="start_time" value={selectedTime} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="duration">수업 타임 *</Label>
          <Select name="duration" defaultValue={defaultValues?.duration || "1"} required>
            <SelectTrigger>
              <SelectValue placeholder="타임 선택" />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            1타임 = 3시간 (최대 3타임, 9시간)
          </p>
        </div>

        <div className="space-y-2">
          <Label>반복 옵션</Label>
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="is_recurring"
              checked={isRecurring}
              onCheckedChange={(checked) => setIsRecurring(checked as boolean)}
            />
            <label
              htmlFor="is_recurring"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              매주 반복 등록
            </label>
          </div>
          {isRecurring && (
            <p className="text-xs text-muted-foreground">
              수강생의 수업 종료일까지 매주 같은 요일에 등록됩니다.
            </p>
          )}
          <input
            type="hidden"
            name="is_recurring"
            value={isRecurring ? "true" : "false"}
          />
        </div>
      </div>

      {mode === "edit" && (
        <div className="space-y-2">
          <Label>수정 범위</Label>
          <div className="flex flex-col gap-2 md:flex-row md:gap-4">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="update_single"
                name="update_scope"
                value="single"
                defaultChecked
              />
              <label htmlFor="update_single" className="text-sm">
                선택한 일정만 수정
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="update_future"
                name="update_scope"
                value="future"
              />
              <label htmlFor="update_future" className="text-sm">
                이후 일정 일괄 수정
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          취소
        </Button>
        <Button type="submit" disabled={isSubmitting || (mode === "create" && selectedStudents.size === 0) || !selectedTime}>
          {isSubmitting
            ? "저장 중..."
            : mode === "create"
              ? "일정 등록"
              : "수정 완료"}
        </Button>
      </div>
    </fetcher.Form>

      <Dialog open={!!errorMessage} onOpenChange={() => setErrorMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>등록 실패</DialogTitle>
            <DialogDescription>{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorMessage(null)}>확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
