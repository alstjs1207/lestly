import { useState, useRef } from "react";
import { useFetcher } from "react-router";
import { PlusIcon, TrashIcon, UploadIcon, XIcon } from "lucide-react";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Textarea } from "~/core/components/ui/textarea";

interface InstructorFormProps {
  mode: "create" | "edit";
  defaultValues?: {
    instructor_id?: number;
    name?: string;
    info?: string;
    photo_url?: string;
    career?: string[];
    sns?: { instagram?: string; youtube?: string };
  };
}

export default function InstructorForm({ mode, defaultValues }: InstructorFormProps) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 경력 동적 필드
  const [career, setCareer] = useState<string[]>(defaultValues?.career || []);

  // 프로필 사진 상태
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    defaultValues?.photo_url || null
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    setPhotoFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const actionUrl =
    mode === "create"
      ? "/api/admin/instructors/create"
      : `/api/admin/instructors/${defaultValues?.instructor_id}/update`;

  const addCareer = () => {
    setCareer([...career, ""]);
  };

  const removeCareer = (index: number) => {
    setCareer(career.filter((_, i) => i !== index));
  };

  const updateCareer = (index: number, value: string) => {
    const updated = [...career];
    updated[index] = value;
    setCareer(updated);
  };

  return (
    <fetcher.Form method="post" action={actionUrl} encType="multipart/form-data" className="space-y-6">
      <input type="hidden" name="career" value={JSON.stringify(career)} />
      {/* 기존 프로필 사진 URL (수정 모드에서 이미지 변경 없을 때) */}
      {defaultValues?.photo_url && !photoFile && photoPreview && (
        <input type="hidden" name="existing_photo_url" value={defaultValues.photo_url} />
      )}

      {/* 기본 정보 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">기본 정보</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">강사명 *</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={defaultValues?.name}
              placeholder="강사 이름을 입력하세요"
            />
          </div>

          <div className="space-y-2">
            <Label>프로필 사진</Label>
            {photoPreview ? (
              <div className="relative inline-block">
                <img
                  src={photoPreview}
                  alt="프로필 사진 미리보기"
                  className="w-32 h-32 rounded-full border object-cover cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-1 -right-1 h-6 w-6"
                  onClick={handleRemovePhoto}
                >
                  <XIcon className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div
                className="w-32 h-32 border-2 border-dashed border-muted-foreground/25 rounded-full flex flex-col items-center justify-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon className="h-6 w-6 text-muted-foreground/50" />
                <p className="mt-1 text-xs text-muted-foreground">업로드</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="info">강사 소개</Label>
            <Textarea
              id="info"
              name="info"
              defaultValue={defaultValues?.info}
              placeholder="강사에 대한 간단한 소개를 입력하세요"
              rows={3}
            />
          </div>
        </div>
      </div>

      {/* 경력 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="text-lg font-semibold">경력</h3>
          <Button type="button" variant="outline" size="sm" onClick={addCareer}>
            <PlusIcon className="w-4 h-4 mr-1" />
            추가
          </Button>
        </div>
        {career.length === 0 ? (
          <p className="text-sm text-muted-foreground">등록된 경력이 없습니다.</p>
        ) : (
          career.map((item, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={item}
                onChange={(e) => updateCareer(index, e.target.value)}
                placeholder="예: 10년 경력 캘리그라피 강사"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeCareer(index)}
              >
                <TrashIcon className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* SNS */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">SNS</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sns_instagram">Instagram URL</Label>
            <Input
              id="sns_instagram"
              name="sns_instagram"
              defaultValue={defaultValues?.sns?.instagram}
              placeholder="https://instagram.com/..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sns_youtube">YouTube URL</Label>
            <Input
              id="sns_youtube"
              name="sns_youtube"
              defaultValue={defaultValues?.sns?.youtube}
              placeholder="https://youtube.com/..."
            />
          </div>
        </div>
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
              ? "강사 등록"
              : "수정 완료"}
        </Button>
      </div>
    </fetcher.Form>
  );
}
