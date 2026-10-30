import {
  CalendarOffIcon,
  CalendarRangeIcon,
  Clock3Icon,
  Layers3Icon,
  Undo2Icon,
  UsersIcon,
} from "lucide-react";

import type { BookingPolicy } from "~/features/app-settings/booking-policy";
import type { StudentTypeOption } from "~/features/organizations/student-types";

import { BookingDaySettings } from "./booking-day-settings";
import {
  BookingPolicyFields,
  ClassDefaultsFields,
} from "./booking-policy-fields";
import { BookingWindowFields } from "./booking-window-fields";
import { CancellationPolicyFields } from "./cancellation-policy-fields";
import { SettingsSection } from "./settings-section";
import { StudentTypeSettings } from "./student-type-settings";

export interface SettingsValues {
  now: string;
  bookingPolicy: BookingPolicy;
  maxConcurrentStudents: number;
  disabledBookingTimes: string[];
  disabledBookingDays: number[];
  studentTypes: StudentTypeOption[];
}

export function SettingsView({ loaderData }: { loaderData: SettingsValues }) {
  const {
    bookingPolicy: policy,
    maxConcurrentStudents,
    disabledBookingTimes,
    disabledBookingDays,
  } = loaderData;
  const navigation = [
    { id: "class-defaults", label: "클래스 기본값", icon: Layers3Icon },
    { id: "booking-window", label: "예약 기간", icon: CalendarRangeIcon },
    { id: "booking-times", label: "예약 시간", icon: Clock3Icon },
    { id: "booking-days", label: "휴무 요일", icon: CalendarOffIcon },
    { id: "cancellation-policy", label: "취소 기한", icon: Undo2Icon },
    { id: "student-types", label: "수강생 유형", icon: UsersIcon },
  ];
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">설정</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
            필요한 영역에서 수정하고 따로 저장하세요. 다른 영역에 입력 중인
            내용은 유지됩니다.
          </p>
        </div>
        <nav aria-label="설정 영역 바로가기" className="flex flex-wrap gap-2">
          {navigation.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className="bg-card text-muted-foreground hover:text-foreground hover:border-primary/40 focus-visible:ring-ring inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </a>
          ))}
        </nav>
      </header>
      <div className="space-y-4">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide">
          클래스를 만들 때
        </h2>
        <SettingsSection
          id="class-defaults"
          section="class_defaults"
          title="새 클래스 기본값"
          description="클래스를 만들 때 채울 수업 길이와 정원을 정합니다."
          scope="새 클래스에만 적용"
          saveLabel="클래스 기본값 저장"
          icon={Layers3Icon}
        >
          <ClassDefaultsFields
            key={JSON.stringify([
              policy.durationMinutes,
              policy.defaultDurationMinutes,
              maxConcurrentStudents,
            ])}
            policy={policy}
            capacity={maxConcurrentStudents}
          />
        </SettingsSection>
      </div>
      <div className="space-y-5">
        <div>
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide">
            모든 클래스의 공통 예약 규칙
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            이미 등록된 예약의 시간과 출결은 그대로 유지됩니다.
          </p>
        </div>
        <SettingsSection
          id="booking-window"
          section="booking_window"
          title="예약 가능한 기간"
          description="수강생이 언제부터 어느 날짜까지 예약할 수 있는지 정합니다."
          scope="수강생 신규 예약"
          saveLabel="예약 기간 저장"
          icon={CalendarRangeIcon}
        >
          <BookingWindowFields
            key={JSON.stringify(policy.bookingWindow)}
            window={policy.bookingWindow}
            now={loaderData.now}
            busy={false}
          />
        </SettingsSection>
        <SettingsSection
          id="booking-times"
          section="booking_times"
          title="예약 시간과 접수 마감"
          description="예약 시작 시각·간격·접수 마감을 정하고, 시각별 신청 허용 여부를 선택합니다."
          scope="모든 클래스 공통"
          saveLabel="예약 시간 저장"
          icon={Clock3Icon}
        >
          <BookingPolicyFields
            key={JSON.stringify([
              policy.firstStart,
              policy.lastStart,
              policy.startIntervalMinutes,
              policy.leadMinutes,
              disabledBookingTimes,
            ])}
            policy={policy}
            disabledTimes={disabledBookingTimes}
            busy={false}
          />
        </SettingsSection>
        <SettingsSection
          id="booking-days"
          section="booking_days"
          title="휴무 요일"
          description="매주 수강생의 신규 예약을 받지 않을 요일을 정합니다."
          scope="수강생 신규 예약"
          saveLabel="휴무 요일 저장"
          icon={CalendarOffIcon}
        >
          <BookingDaySettings
            key={JSON.stringify(disabledBookingDays)}
            disabledDays={disabledBookingDays}
            busy={false}
          />
        </SettingsSection>
        <SettingsSection
          id="cancellation-policy"
          section="cancellation_policy"
          title="예약 취소 기한"
          description="새로 등록하는 예약에 적용할 취소 기한을 정합니다."
          scope="새 예약부터 적용"
          saveLabel="취소 기한 저장"
          icon={Undo2Icon}
        >
          <CancellationPolicyFields
            key={JSON.stringify(policy.cancellationPolicy)}
            policy={policy.cancellationPolicy}
            busy={false}
          />
        </SettingsSection>
      </div>
      <section
        id="student-types"
        aria-label="수강생 유형 설정"
        className="scroll-mt-24 space-y-4"
      >
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wide">
          수강생 관리
        </h2>
        <StudentTypeSettings types={loaderData.studentTypes} />
      </section>
    </div>
  );
}
