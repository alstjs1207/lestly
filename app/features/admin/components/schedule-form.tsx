import { CalendarDaysIcon, Clock3Icon, UsersIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Checkbox } from "~/core/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/core/components/ui/select";
import {
  DURATION_OPTIONS,
  generateTimeSlots,
} from "~/features/schedules/utils/student-schedule-rules";

interface Student {
  profile_id: string;
  name: string;
  color: string | null;
  phone: string | null;
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
  const [isRecurring, setIsRecurring] = useState(
    defaultValues?.is_recurring || false,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(
    new Set(defaultValues?.student_id ? [defaultValues.student_id] : []),
  );
  const [selectedTime, setSelectedTime] = useState(
    defaultValues?.start_time || "",
  );
  const [selectedDate, setSelectedDate] = useState(defaultValues?.date || "");
  const [selectedDuration, setSelectedDuration] = useState(
    defaultValues?.duration || "1",
  );
  const [selectedProgramId, setSelectedProgramId] = useState(
    defaultValues?.program_id?.toString() ||
      (programs.length === 1 ? programs[0].program_id.toString() : ""),
  );
  const [studentQuery, setStudentQuery] = useState("");
  const [hasTouchedStudents, setHasTouchedStudents] = useState(false);

  const allSelected =
    students.length > 0 && selectedStudents.size === students.length;
  const normalizedStudentQuery = studentQuery.trim().toLocaleLowerCase("ko-KR");
  const digitStudentQuery = studentQuery.replace(/\D/g, "");
  const visibleStudents = students.filter(
    (student) =>
      student.name
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedStudentQuery) ||
      (digitStudentQuery.length > 0 &&
        student.phone?.replace(/\D/g, "").includes(digitStudentQuery)),
  );

  function toggleStudent(id: string) {
    setHasTouchedStudents(true);
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setHasTouchedStudents(true);
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
  const quickTimeSlots = timeSlots.filter((slot) => slot.value.endsWith(":00"));
  const selectedStudentNames = useMemo(
    () =>
      students
        .filter((student) => selectedStudents.has(student.profile_id))
        .map((student) => student.name),
    [selectedStudents, students],
  );
  const selectedProgram = programs.find(
    (program) => program.program_id.toString() === selectedProgramId,
  );
  const selectedDurationLabel = DURATION_OPTIONS.find(
    (option) => option.value === selectedDuration,
  )?.label;
  const dateLabel = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
      })
    : "날짜 미선택";
  const studentLabel =
    selectedStudentNames.length === 0
      ? "수강생 미선택"
      : selectedStudentNames.length === 1
        ? selectedStudentNames[0]
        : `${selectedStudentNames[0]} 외 ${selectedStudentNames.length - 1}명`;

  return (
    <>
      <fetcher.Form
        method="post"
        action={actionUrl}
        className="space-y-6 pb-36 md:pb-0"
      >
        <div className="grid gap-6 md:grid-cols-2">
          {mode === "create" ? (
            <div className="space-y-2 md:col-span-2">
              <Label>
                수강생 *{" "}
                {selectedStudents.size > 0 && (
                  <span className="text-muted-foreground text-xs font-normal">
                    ({selectedStudents.size}명 선택됨)
                  </span>
                )}
              </Label>
              <Input
                type="search"
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder="수강생 이름 또는 전화번호 검색"
                className="h-11 md:max-w-72"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={allSelected ? "default" : "outline"}
                  size="sm"
                  onClick={toggleAll}
                  className="min-h-11 md:min-h-8"
                >
                  전체 선택
                </Button>
                {visibleStudents.map((student) => (
                  <Button
                    key={student.profile_id}
                    type="button"
                    variant={
                      selectedStudents.has(student.profile_id)
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => toggleStudent(student.profile_id)}
                    className="flex min-h-11 items-center gap-1.5 md:min-h-8"
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full ring-1 ring-black/15 dark:ring-white/30"
                      style={{ backgroundColor: student.color || "#3B82F6" }}
                    />
                    <span>{student.name}</span>
                    {student.phone && (
                      <span className="text-muted-foreground text-xs font-normal">
                        {student.phone}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
              {visibleStudents.length === 0 && (
                <p className="text-muted-foreground text-sm">
                  검색 결과가 없습니다.
                </p>
              )}
              {selectedStudents.size === 0 && (
                <p
                  className={
                    hasTouchedStudents
                      ? "text-destructive text-xs"
                      : "text-muted-foreground text-xs"
                  }
                >
                  {hasTouchedStudents
                    ? "수강생을 1명 이상 선택해주세요."
                    : "일정을 등록할 수강생을 선택하세요."}
                </p>
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
                <SelectTrigger className="h-11 w-full md:h-9">
                  <SelectValue placeholder="수강생 선택" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((student) => (
                    <SelectItem
                      key={student.profile_id}
                      value={student.profile_id}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: student.color || "#3B82F6",
                          }}
                        />
                        <span>{student.name}</span>
                        {student.phone && (
                          <span className="text-muted-foreground ml-1 text-xs">
                            {student.phone}
                          </span>
                        )}
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
                value={selectedProgramId}
                onValueChange={setSelectedProgramId}
                required
              >
                <SelectTrigger className="h-11 w-full md:h-9">
                  <SelectValue placeholder="클래스 선택" />
                </SelectTrigger>
                <SelectContent>
                  {programs.map((program) => (
                    <SelectItem
                      key={program.program_id}
                      value={program.program_id.toString()}
                    >
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
            <input
              type="hidden"
              name="program_id"
              value={programs[0].program_id.toString()}
            />
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="date">날짜 *</Label>
            <Input
              id="date"
              name="date"
              type="date"
              required
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>시작 시간 *</Label>
            <div className="space-y-3 md:hidden">
              <div>
                <p className="text-muted-foreground mb-2 text-xs font-medium">
                  빠른 시간 선택
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {quickTimeSlots.map((slot) => (
                    <Button
                      key={slot.value}
                      type="button"
                      variant={
                        selectedTime === slot.value ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSelectedTime(slot.value)}
                      className="min-h-11 px-2 tabular-nums"
                    >
                      {slot.label}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-muted-foreground text-center text-xs">또는</p>
              <Select value={selectedTime} onValueChange={setSelectedTime}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="30분 단위 전체 시간 보기" />
                </SelectTrigger>
                <SelectContent>
                  {timeSlots.map((slot) => (
                    <SelectItem key={slot.value} value={slot.value}>
                      {slot.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="hidden grid-cols-8 gap-2 md:grid">
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
            <p className="text-muted-foreground text-xs">
              시작 시간: 09:00 ~ 20:00
            </p>
            <input type="hidden" name="start_time" value={selectedTime} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration">수업 타임 *</Label>
            <Select
              name="duration"
              value={selectedDuration}
              onValueChange={setSelectedDuration}
              required
            >
              <SelectTrigger className="h-11 w-full md:h-9">
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
            <p className="text-muted-foreground text-xs">
              1타임 = 3시간 (최대 3타임, 9시간)
            </p>
          </div>

          <div className="space-y-2">
            <Label>반복 옵션</Label>
            <div className="flex min-h-11 items-center space-x-3 rounded-md border px-3">
              <Checkbox
                id="is_recurring"
                checked={isRecurring}
                onCheckedChange={(checked) =>
                  setIsRecurring(checked as boolean)
                }
              />
              <label
                htmlFor="is_recurring"
                className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                매주 반복 등록
              </label>
            </div>
            {isRecurring && (
              <p className="text-muted-foreground text-xs">
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

        <div className="bg-card/95 fixed inset-x-0 bottom-16 z-30 border-t px-4 py-3 backdrop-blur md:static md:flex md:justify-end md:gap-3 md:border-0 md:bg-transparent md:p-0">
          <div className="mb-3 min-w-0 md:hidden">
            <div className="text-muted-foreground flex items-center gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-1">
                <UsersIcon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{studentLabel}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <CalendarDaysIcon className="size-3.5" aria-hidden="true" />
                {dateLabel}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-sm font-semibold">
              <Clock3Icon className="text-primary size-4" aria-hidden="true" />
              <span>{selectedTime || "시간 미선택"}</span>
              {selectedDurationLabel && <span>· {selectedDurationLabel}</span>}
              {selectedProgram && (
                <span className="text-muted-foreground truncate font-normal">
                  · {selectedProgram.title}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 md:flex md:gap-3">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => history.back()}
            >
              취소
            </Button>
            <Button
              type="submit"
              className="min-h-11"
              disabled={
                isSubmitting ||
                (mode === "create" && selectedStudents.size === 0) ||
                !selectedTime ||
                !selectedDate
              }
            >
              {isSubmitting
                ? "저장 중..."
                : mode === "create"
                  ? selectedStudents.size > 1
                    ? `${selectedStudents.size}명 일정 등록`
                    : "일정 등록"
                  : "수정 완료"}
            </Button>
          </div>
        </div>
      </fetcher.Form>

      <Dialog open={!!errorMessage} onOpenChange={() => setErrorMessage(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "등록 실패" : "수정 실패"}
            </DialogTitle>
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
