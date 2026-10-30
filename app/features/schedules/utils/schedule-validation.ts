export interface ScheduleCandidate {
  studentId: string;
  startTime: Date;
  endTime: Date;
}

export interface ExistingScheduleInterval extends ScheduleCandidate {
  scheduleId: number;
  programId?: number;
}

export interface ScheduleOccurrence {
  scheduleId: number;
  startTime: Date;
  endTime: Date;
}

export interface ShiftedScheduleOccurrence extends ScheduleCandidate {
  scheduleId: number;
}

export type ScheduleBatchValidationResult = {
  allowed: boolean;
  reason: "capacity" | "student_conflict" | "invalid_interval" | null;
  currentCount: number;
  maxCount: number;
  candidate: ScheduleCandidate | null;
};

export function schedulesOverlap(
  left: Pick<ScheduleCandidate, "startTime" | "endTime">,
  right: Pick<ScheduleCandidate, "startTime" | "endTime">,
): boolean {
  return left.startTime < right.endTime && left.endTime > right.startTime;
}

/** Peak occupancy on the half-open candidate interval; touching ends share no seat. */
export function peakConcurrentCount(
  candidate: Pick<ScheduleCandidate, "startTime" | "endTime">,
  intervals: Pick<ScheduleCandidate, "startTime" | "endTime">[],
): number {
  const events = new Map<number, number>();
  for (const row of intervals) {
    if (!schedulesOverlap(candidate, row)) continue;
    const start = Math.max(+row.startTime, +candidate.startTime);
    const end = Math.min(+row.endTime, +candidate.endTime);
    events.set(start, (events.get(start) ?? 0) + 1);
    events.set(end, (events.get(end) ?? 0) - 1);
  }
  let current = 0,
    peak = 0;
  for (const [, delta] of [...events].sort(([a], [b]) => a - b)) {
    current += delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

/**
 * Shift a recurring series relative to the edited occurrence while preserving
 * the spacing between every occurrence. All shifted rows use the newly selected
 * duration and student.
 */
export function shiftScheduleOccurrences(
  occurrences: ScheduleOccurrence[],
  {
    originalAnchorStart,
    nextAnchorStart,
    nextAnchorEnd,
    studentId,
  }: {
    originalAnchorStart: Date;
    nextAnchorStart: Date;
    nextAnchorEnd: Date;
    studentId: string;
  },
): ShiftedScheduleOccurrence[] {
  const shiftMs = nextAnchorStart.getTime() - originalAnchorStart.getTime();
  const durationMs = nextAnchorEnd.getTime() - nextAnchorStart.getTime();

  return occurrences.map((occurrence) => {
    const startTime = new Date(occurrence.startTime.getTime() + shiftMs);
    return {
      scheduleId: occurrence.scheduleId,
      studentId,
      startTime,
      endTime: new Date(startTime.getTime() + durationMs),
    };
  });
}

/**
 * Validate a batch in order, including candidates already accepted from the
 * same request. This prevents a multi-student or recurring request from
 * bypassing capacity/conflict checks between its own rows.
 */
export function validateScheduleCandidatesAgainstExisting(
  candidates: ScheduleCandidate[],
  existingSchedules: ExistingScheduleInterval[],
  maxCount: number,
  programId?: number,
): ScheduleBatchValidationResult {
  const acceptedCandidates: ScheduleCandidate[] = [];

  for (const candidate of candidates) {
    if (
      Number.isNaN(candidate.startTime.getTime()) ||
      Number.isNaN(candidate.endTime.getTime()) ||
      candidate.endTime <= candidate.startTime
    ) {
      return {
        allowed: false,
        reason: "invalid_interval",
        currentCount: 0,
        maxCount,
        candidate,
      };
    }

    const overlappingSchedules = [
      ...existingSchedules,
      ...acceptedCandidates.map((accepted, index) => ({
        ...accepted,
        scheduleId: -(index + 1),
        programId,
      })),
    ].filter((schedule) => schedulesOverlap(schedule, candidate));

    if (
      overlappingSchedules.some(
        (schedule) => schedule.studentId === candidate.studentId,
      )
    ) {
      return {
        allowed: false,
        reason: "student_conflict",
        currentCount: overlappingSchedules.length,
        maxCount,
        candidate,
      };
    }

    const peakCount = peakConcurrentCount(
      candidate,
      overlappingSchedules.filter(
        (row) => programId === undefined || row.programId === programId,
      ),
    );
    if (peakCount >= maxCount) {
      return {
        allowed: false,
        reason: "capacity",
        currentCount: peakCount,
        maxCount,
        candidate,
      };
    }

    acceptedCandidates.push(candidate);
  }

  return {
    allowed: true,
    reason: null,
    currentCount: 0,
    maxCount,
    candidate: null,
  };
}
