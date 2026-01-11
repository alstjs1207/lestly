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

interface ProgramFormProps {
  mode: "create" | "edit";
  defaultValues?: {
    program_id?: number;
    title?: string;
    subtitle?: string;
    description?: string;
    instructor_name?: string;
    instructor_info?: string;
    status?: string;
    level?: string;
    price?: number;
  };
}

export default function ProgramForm({ mode, defaultValues }: ProgramFormProps) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  const actionUrl =
    mode === "create"
      ? "/api/admin/programs/create"
      : `/api/admin/programs/${defaultValues?.program_id}/update`;

  return (
    <fetcher.Form method="post" action={actionUrl} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">클래스명 *</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={defaultValues?.title}
            placeholder="클래스 이름을 입력하세요"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">상태 *</Label>
          <Select name="status" defaultValue={defaultValues?.status || "DRAFT"} required>
            <SelectTrigger>
              <SelectValue placeholder="상태 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">초안</SelectItem>
              <SelectItem value="ACTIVE">활성</SelectItem>
              <SelectItem value="ARCHIVED">보관됨</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="subtitle">부제목</Label>
          <Input
            id="subtitle"
            name="subtitle"
            defaultValue={defaultValues?.subtitle}
            placeholder="클래스 부제목 (선택)"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="instructor_name">강사명</Label>
          <Input
            id="instructor_name"
            name="instructor_name"
            defaultValue={defaultValues?.instructor_name}
            placeholder="강사 이름"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="level">난이도</Label>
          <Select name="level" defaultValue={defaultValues?.level || ""}>
            <SelectTrigger>
              <SelectValue placeholder="난이도 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BEGINNER">초급</SelectItem>
              <SelectItem value="INTERMEDIATE">중급</SelectItem>
              <SelectItem value="ADVANCED">고급</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">가격</Label>
          <Input
            id="price"
            name="price"
            type="number"
            min="0"
            step="1000"
            defaultValue={defaultValues?.price}
            placeholder="0"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="instructor_info">강사 소개</Label>
        <Textarea
          id="instructor_info"
          name="instructor_info"
          defaultValue={defaultValues?.instructor_info}
          placeholder="강사에 대한 소개를 입력하세요"
          rows={3}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">클래스 설명</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={defaultValues?.description}
          placeholder="클래스에 대한 상세 설명을 입력하세요"
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
              ? "클래스 등록"
              : "수정 완료"}
        </Button>
      </div>
    </fetcher.Form>
  );
}
