import { PlusIcon, TrashIcon, UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Checkbox } from "~/core/components/ui/checkbox";
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

interface CurriculumItem {
  session: number;
  title: string;
  description?: string;
}

interface Instructor {
  instructor_id: number;
  name: string;
}

interface ProgramFormProps {
  mode: "create" | "edit";
  instructors?: Instructor[];
  defaultValues?: {
    program_id?: number;
    instructor_id?: number;
    title?: string;
    subtitle?: string;
    description?: string;
    status?: string;
    level?: string;
    price?: number;
    slug?: string;
    cover_image_url?: string;
    location_type?: string;
    location_address?: string;
    duration_minutes?: number;
    total_sessions?: number;
    curriculum?: CurriculumItem[];
    max_capacity?: number;
    is_public?: boolean;
  };
}

export default function ProgramForm({
  mode,
  instructors = [],
  defaultValues,
}: ProgramFormProps) {
  const fetcher = useFetcher<{ error?: string }>();
  const isSubmitting = fetcher.state !== "idle";
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 커리큘럼 동적 필드 상태
  const [curriculum, setCurriculum] = useState<CurriculumItem[]>(
    defaultValues?.curriculum || [],
  );

  // 커버 이미지 상태
  const [coverImagePreview, setCoverImagePreview] = useState<string | null>(
    defaultValues?.cover_image_url || null,
  );
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCoverImageFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setCoverImagePreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setCoverImagePreview(null);
    setCoverImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const actionUrl =
    mode === "create"
      ? "/api/admin/programs/create"
      : `/api/admin/programs/${defaultValues?.program_id}/update`;

  // 커리큘럼 추가/삭제
  const addCurriculum = () => {
    setCurriculum([
      ...curriculum,
      { session: curriculum.length + 1, title: "", description: "" },
    ]);
  };
  const removeCurriculum = (index: number) => {
    setCurriculum(curriculum.filter((_, i) => i !== index));
  };
  const updateCurriculum = (
    index: number,
    field: keyof CurriculumItem,
    value: string | number,
  ) => {
    const updated = [...curriculum];
    updated[index] = { ...updated[index], [field]: value };
    setCurriculum(updated);
  };

  return (
    <fetcher.Form
      method="post"
      action={actionUrl}
      encType="multipart/form-data"
      className="space-y-8"
    >
      {fetcher.data?.error && (
        <p
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm"
          role="alert"
        >
          {fetcher.data.error}
        </p>
      )}
      {/* JSONB 필드를 hidden input으로 전송 */}
      <input
        type="hidden"
        name="curriculum"
        value={JSON.stringify(curriculum)}
      />
      {/* 기존 커버 이미지 URL (수정 모드에서 이미지 변경 없을 때) */}
      {defaultValues?.cover_image_url && !coverImageFile && (
        <input
          type="hidden"
          name="existing_cover_image_url"
          value={defaultValues.cover_image_url}
        />
      )}

      {/* 기본 정보 섹션 */}
      <div className="space-y-4">
        <h3 className="border-b pb-2 text-lg font-semibold">기본 정보</h3>
        <div className="grid gap-4 md:grid-cols-2">
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
            <Label htmlFor="slug">URL 슬러그 *</Label>
            <Input
              id="slug"
              name="slug"
              required
              defaultValue={defaultValues?.slug}
              placeholder="calligraphy-beginner"
            />
            <p className="text-muted-foreground text-xs">
              공개 URL: /class/[슬러그]
            </p>
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
            <Label htmlFor="status">상태 *</Label>
            <Select
              name="status"
              defaultValue={defaultValues?.status || "DRAFT"}
              required
            >
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
            <Label htmlFor="instructor_id">담당 강사</Label>
            <Select
              name="instructor_id"
              defaultValue={defaultValues?.instructor_id?.toString() || ""}
            >
              <SelectTrigger>
                <SelectValue placeholder="강사 선택" />
              </SelectTrigger>
              <SelectContent>
                {instructors.map((instructor) => (
                  <SelectItem
                    key={instructor.instructor_id}
                    value={instructor.instructor_id.toString()}
                  >
                    {instructor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 space-y-2">
            <Checkbox
              id="is_public"
              name="is_public"
              defaultChecked={defaultValues?.is_public}
            />
            <Label htmlFor="is_public" className="cursor-pointer">
              공개 페이지로 게시 (외부 사용자 접근 가능)
            </Label>
          </div>
        </div>
      </div>

      {/* 커버 이미지 섹션 */}
      <div className="space-y-4">
        <h3 className="border-b pb-2 text-lg font-semibold">커버 이미지</h3>
        <div className="space-y-4">
          {coverImagePreview ? (
            <div className="relative inline-block">
              <img
                src={coverImagePreview}
                alt="커버 이미지 미리보기"
                className="max-h-64 max-w-md rounded-lg border object-cover"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2"
                onClick={handleRemoveImage}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div
              className="border-muted-foreground/25 hover:border-muted-foreground/50 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon className="text-muted-foreground/50 mx-auto h-12 w-12" />
              <p className="text-muted-foreground mt-2 text-sm">
                클릭하여 이미지를 업로드하세요
              </p>
              <p className="text-muted-foreground/75 text-xs">
                JPG, PNG, WebP (최대 5MB)
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            name="cover_image"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      {/* 수업 정보 섹션 */}
      <div className="space-y-4">
        <h3 className="border-b pb-2 text-lg font-semibold">수업 정보</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="location_type">수업 형태</Label>
            <Select
              name="location_type"
              defaultValue={defaultValues?.location_type || "offline"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="offline">오프라인</SelectItem>
                <SelectItem value="online">온라인</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration_minutes">1회 수업 시간 (분)</Label>
            <Input
              id="duration_minutes"
              name="duration_minutes"
              type="number"
              min="30"
              step="30"
              defaultValue={defaultValues?.duration_minutes || 120}
              aria-describedby="program-duration-help"
            />
            <p
              id="program-duration-help"
              className="text-muted-foreground text-xs"
            >
              클래스 소개용 시간입니다. 예약 가능한 수업 길이는 조직의 예약 시간
              규칙에서 별도로 설정합니다.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="total_sessions">총 회차</Label>
            <Input
              id="total_sessions"
              name="total_sessions"
              type="number"
              min="1"
              defaultValue={defaultValues?.total_sessions || 4}
              aria-describedby="program-sessions-help"
            />
            <p
              id="program-sessions-help"
              className="text-muted-foreground text-xs"
            >
              클래스 소개용 회차입니다. 반복 예약은 이 횟수가 아닌 수강생의 수강
              종료일까지 생성됩니다.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_capacity">모집 정원</Label>
            <Input
              id="max_capacity"
              name="max_capacity"
              type="number"
              min="1"
              defaultValue={defaultValues?.max_capacity}
              placeholder="5"
              aria-describedby="program-capacity-help"
            />
            <p
              id="program-capacity-help"
              className="text-muted-foreground text-xs"
            >
              클래스 소개용 모집 인원입니다. 실제 예약 인원은 조직 전체 동시
              수강 인원 설정으로 제한합니다.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">가격 (원)</Label>
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
          <Label htmlFor="location_address">수업 장소 (오프라인)</Label>
          <Input
            id="location_address"
            name="location_address"
            defaultValue={defaultValues?.location_address}
            placeholder="서울시 강남구 테헤란로 123, 4층"
          />
        </div>
      </div>

      {/* 클래스 소개 섹션 */}
      <div className="space-y-4">
        <h3 className="border-b pb-2 text-lg font-semibold">클래스 설명</h3>
        <div className="space-y-2">
          <Label htmlFor="description">상세 설명</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={defaultValues?.description}
            placeholder="클래스에 대한 상세 설명을 입력하세요"
            rows={4}
          />
        </div>
      </div>

      {/* 커리큘럼 섹션 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-lg font-semibold">커리큘럼</h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addCurriculum}
          >
            <PlusIcon className="mr-1 h-4 w-4" />
            회차 추가
          </Button>
        </div>
        {curriculum.map((item, index) => (
          <div
            key={index}
            className="grid gap-4 rounded-lg border p-4 md:grid-cols-4"
          >
            <div className="space-y-2">
              <Label>{item.session}회차</Label>
              <Input
                value={item.title}
                onChange={(e) =>
                  updateCurriculum(index, "title", e.target.value)
                }
                placeholder="회차 제목"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>설명</Label>
              <Input
                value={item.description || ""}
                onChange={(e) =>
                  updateCurriculum(index, "description", e.target.value)
                }
                placeholder="상세 설명 (선택)"
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeCurriculum(index)}
              >
                <TrashIcon className="text-destructive h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* 제출 버튼 */}
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
