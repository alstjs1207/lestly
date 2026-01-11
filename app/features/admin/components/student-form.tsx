import { useState } from "react";
import { useFetcher } from "react-router";

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

interface StudentFormProps {
  mode: "create" | "edit";
  defaultValues?: {
    profile_id?: string;
    email?: string;
    name?: string;
    state?: string;
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

export default function StudentForm({ mode, defaultValues }: StudentFormProps) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const [classEndDate, setClassEndDate] = useState(defaultValues?.class_end_date || "");

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const startDate = e.target.value;
    if (startDate && !classEndDate) {
      // Auto-fill end date to 1 year after start date
      const date = new Date(startDate);
      date.setFullYear(date.getFullYear() + 1);
      const endDateStr = date.toISOString().split("T")[0];
      setClassEndDate(endDateStr);
    }
  };

  const actionUrl =
    mode === "create"
      ? "/api/admin/students/create"
      : `/api/admin/students/${defaultValues?.profile_id}/update`;

  return (
    <fetcher.Form method="post" action={actionUrl} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">이메일 {mode === "create" && "*"}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required={mode === "create"}
            disabled={mode === "edit"}
            defaultValue={defaultValues?.email}
            placeholder="student@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">이름 *</Label>
          <Input
            id="name"
            name="name"
            required
            defaultValue={defaultValues?.name}
            placeholder="수강생 이름"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type">유형 *</Label>
          <Select name="type" defaultValue={defaultValues?.type || ""} required>
            <SelectTrigger>
              <SelectValue placeholder="유형 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EXAMINEE">입시생</SelectItem>
              <SelectItem value="DROPPER">재수생</SelectItem>
              <SelectItem value="ADULT">성인</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "edit" && (
          <div className="space-y-2">
            <Label htmlFor="state">상태</Label>
            <Select name="state" defaultValue={defaultValues?.state || "NORMAL"}>
              <SelectTrigger>
                <SelectValue placeholder="상태 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NORMAL">정상</SelectItem>
                <SelectItem value="GRADUATE">졸업</SelectItem>
                <SelectItem value="DELETED">탈퇴</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="region">지역 *</Label>
          <Input
            id="region"
            name="region"
            required
            defaultValue={defaultValues?.region}
            placeholder="서울, 경기 등"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="birth_date">생년월일 *</Label>
          <Input
            id="birth_date"
            name="birth_date"
            type="date"
            required
            defaultValue={defaultValues?.birth_date}
          />
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
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="class_start_date">수업 시작일 *</Label>
          <Input
            id="class_start_date"
            name="class_start_date"
            type="date"
            required
            defaultValue={defaultValues?.class_start_date}
            onChange={handleStartDateChange}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="class_end_date">수업 종료일 *</Label>
          <Input
            id="class_end_date"
            name="class_end_date"
            type="date"
            required
            value={classEndDate}
            onChange={(e) => setClassEndDate(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            수업 시작일 입력 시 자동으로 1년 후로 설정됩니다.
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
          <Input
            id="color"
            name="color"
            type="color"
            defaultValue={defaultValues?.color || "#3B82F6"}
            className="h-10 w-20"
          />
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
              : "수정 완료"}
        </Button>
      </div>
    </fetcher.Form>
  );
}
