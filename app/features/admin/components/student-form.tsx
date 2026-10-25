import { AlertCircleIcon } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "~/core/components/ui/alert";
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
import { Textarea } from "~/core/components/ui/textarea";

import { addYearsToDateString } from "../lib/student-class-dates";

interface StudentFormProps {
  mode: "create" | "edit";
  defaultValues?: {
    profile_id?: string;
    email?: string;
    name?: string;
    type?: string;
    region?: string;
    birth_date?: string;
    description?: string;
    class_start_date?: string;
    class_end_date?: string;
    phone?: string;
    parent_name?: string;
    parent_phone?: string;
    color?: string;
  };
}

type StudentFormField =
  | "name"
  | "phone"
  | "email"
  | "type"
  | "region"
  | "birth_date"
  | "class_start_date"
  | "class_end_date"
  | "color";

type StudentFormActionData = {
  success: false;
  error?: string;
  confirmation?: { token: string; cancel_count: number };
  fieldErrors?: Partial<Record<StudentFormField, string[]>>;
};

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return (
    <p
      className="text-destructive flex items-start gap-1.5 text-xs"
      role="alert"
    >
      <AlertCircleIcon
        className="mt-0.5 size-3.5 shrink-0"
        aria-hidden="true"
      />
      {errors[0]}
    </p>
  );
}

export default function StudentForm({ mode, defaultValues }: StudentFormProps) {
  const fetcher = useFetcher<StudentFormActionData>();
  const isSubmitting = fetcher.state !== "idle";
  const [classEndDate, setClassEndDate] = useState(
    defaultValues?.class_end_date || "",
  );
  const [isClassEndDateManual, setIsClassEndDateManual] = useState(
    mode === "edit",
  );
  const [color, setColor] = useState(defaultValues?.color || "#3B82F6");

  const randomizeColor = () => {
    const hex =
      "#" +
      Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    setColor(hex);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const startDate = e.target.value;
    if (startDate && !isClassEndDateManual) {
      setClassEndDate(addYearsToDateString(startDate));
    }
  };

  const actionUrl =
    mode === "create"
      ? "/api/admin/students/create"
      : `/api/admin/students/${defaultValues?.profile_id}/update`;

  return (
    <fetcher.Form method="post" action={actionUrl} className="space-y-6">
      {fetcher.data?.error && !fetcher.data.confirmation && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>저장하지 못했습니다</AlertTitle>
          <AlertDescription>{fetcher.data.error}</AlertDescription>
        </Alert>
      )}

      {fetcher.data?.confirmation && (
        <>
          <input
            type="hidden"
            name="lifecycle_confirmation"
            value={fetcher.data.confirmation.token}
          />
          <Alert>
            <AlertTitle>예약 자동 취소 확인</AlertTitle>
            <AlertDescription>
              예정 예약 {fetcher.data.confirmation.cancel_count}건이 취소됩니다.
              완료된 수업은 유지됩니다. 아래 ‘확인하고 저장’을 누르면 변경과
              취소를 함께 처리합니다.
            </AlertDescription>
          </Alert>
        </>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">이름 *</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={defaultValues?.name}
            placeholder="수강생 이름"
            aria-invalid={Boolean(fetcher.data?.fieldErrors?.name?.length)}
          />
          <FieldError errors={fetcher.data?.fieldErrors?.name} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">전화번호 *</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            required
            defaultValue={defaultValues?.phone}
            placeholder="010-1234-5678"
            autoComplete="tel"
            aria-invalid={Boolean(fetcher.data?.fieldErrors?.phone?.length)}
          />
          <FieldError errors={fetcher.data?.fieldErrors?.phone} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">
            이메일 <span className="text-muted-foreground text-xs">(선택)</span>
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={defaultValues?.email}
            placeholder="student@example.com"
            aria-invalid={Boolean(fetcher.data?.fieldErrors?.email?.length)}
          />
          <FieldError errors={fetcher.data?.fieldErrors?.email} />
          <p className="text-muted-foreground text-xs">
            선택 연락처입니다. 이메일 없이 등록할 수 있으며, 등록 후 초대 링크를
            복사해 카카오톡으로 전달하면 카카오 계정이 연결됩니다. 첫 연결 시
            카카오에서 인증된 이메일을 제공하면 빈 이메일 항목을 자동으로
            채웁니다.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">유형 *</Label>
          <Select
            name="type"
            defaultValue={defaultValues?.type || "EXAMINEE"}
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="유형 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EXAMINEE">입시생</SelectItem>
              <SelectItem value="DROPPER">재수생</SelectItem>
              <SelectItem value="ADULT">성인</SelectItem>
            </SelectContent>
          </Select>
          <FieldError errors={fetcher.data?.fieldErrors?.type} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="region">지역 *</Label>
          <Input
            id="region"
            name="region"
            required
            defaultValue={defaultValues?.region}
            placeholder="서울, 경기 등"
            aria-invalid={Boolean(fetcher.data?.fieldErrors?.region?.length)}
          />
          <FieldError errors={fetcher.data?.fieldErrors?.region} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="birth_date">생년월일</Label>
          <Input
            id="birth_date"
            name="birth_date"
            type="date"
            defaultValue={defaultValues?.birth_date}
            aria-invalid={Boolean(
              fetcher.data?.fieldErrors?.birth_date?.length,
            )}
          />
          <FieldError errors={fetcher.data?.fieldErrors?.birth_date} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="class_start_date">
            수업 시작일{" "}
            <span className="text-muted-foreground text-xs">(선택)</span>
          </Label>
          <Input
            id="class_start_date"
            name="class_start_date"
            type="date"
            defaultValue={defaultValues?.class_start_date}
            onChange={handleStartDateChange}
            aria-invalid={Boolean(
              fetcher.data?.fieldErrors?.class_start_date?.length,
            )}
          />
          <FieldError errors={fetcher.data?.fieldErrors?.class_start_date} />
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
            value={classEndDate}
            onChange={(e) => {
              setClassEndDate(e.target.value);
              setIsClassEndDateManual(Boolean(e.target.value));
            }}
            aria-invalid={Boolean(
              fetcher.data?.fieldErrors?.class_end_date?.length,
            )}
          />
          <FieldError errors={fetcher.data?.fieldErrors?.class_end_date} />
          <p className="text-muted-foreground text-xs">
            미입력 시 등록일과 등록일 기준 1년 후 날짜로 자동 저장됩니다.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="parent_name">학부모 이름</Label>
          <Input
            id="parent_name"
            name="parent_name"
            defaultValue={defaultValues?.parent_name}
            placeholder="학부모 이름"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="parent_phone">학부모 전화번호</Label>
          <Input
            id="parent_phone"
            name="parent_phone"
            type="tel"
            defaultValue={defaultValues?.parent_phone}
            placeholder="010-1234-5678"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="color">캘린더 색상</Label>
          <div className="flex items-center gap-2">
            <Input
              id="color"
              name="color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-20"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={randomizeColor}
            >
              랜덤
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">설명</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={defaultValues?.description}
          placeholder="수강생에 대한 메모나 설명을 입력하세요"
          rows={4}
        />
      </div>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => history.back()}>
          취소
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "저장 중..."
            : mode === "create"
              ? "수강생 등록"
              : fetcher.data?.confirmation
                ? "확인하고 저장"
                : "수정 완료"}
        </Button>
      </div>
    </fetcher.Form>
  );
}
