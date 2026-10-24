import { PlusIcon, TrashIcon, UploadIcon, XIcon } from "lucide-react";
import { useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import { Textarea } from "~/core/components/ui/textarea";

interface InstructorFormProps {
  mode: "create" | "edit";
  pushAccounts: { profile_id: string; name: string }[];
  defaultValues?: {
    instructor_id?: number;
    name?: string;
    push_profile_id?: string;
    info?: string;
    photo_url?: string;
    career?: string[];
    sns?: { instagram?: string; youtube?: string };
  };
}

export default function InstructorForm({
  mode,
  pushAccounts,
  defaultValues,
}: InstructorFormProps) {
  const fetcher = useFetcher<{ error?: string }>();
  const isSubmitting = fetcher.state !== "idle";
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 경력 동적 필드
  const [career, setCareer] = useState<string[]>(defaultValues?.career || []);

  // 프로필 사진 상태
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    defaultValues?.photo_url || null,
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
    <fetcher.Form
      method="post"
      action={actionUrl}
      encType="multipart/form-data"
      className="space-y-6"
    >
      {fetcher.data?.error && (
        <p
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm"
          role="alert"
        >
          {fetcher.data.error}
        </p>
      )}
      <input type="hidden" name="career" value={JSON.stringify(career)} />
      {/* 기존 프로필 사진 URL (수정 모드에서 이미지 변경 없을 때) */}
      {defaultValues?.photo_url && !photoFile && photoPreview && (
        <input
          type="hidden"
          name="existing_photo_url"
          value={defaultValues.photo_url}
        />
      )}

      {/* 기본 정보 */}
      <div className="space-y-4">
        <h3 className="border-b pb-2 text-lg font-semibold">기본 정보</h3>
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
                  className="h-32 w-32 cursor-pointer rounded-full border object-cover"
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
                className="border-muted-foreground/25 hover:border-muted-foreground/50 flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-full border-2 border-dashed transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon className="text-muted-foreground/50 h-6 w-6" />
                <p className="text-muted-foreground mt-1 text-xs">업로드</p>
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
            <Label htmlFor="push_profile_id">예약·취소 알림을 받을 계정</Label>
            <select
              id="push_profile_id"
              name="push_profile_id"
              defaultValue={defaultValues?.push_profile_id ?? ""}
              className="border-input bg-background flex h-11 w-full rounded-md border px-3 text-sm"
            >
              <option value="">연결하지 않음</option>
              {defaultValues?.push_profile_id &&
                !pushAccounts.some(
                  (account) =>
                    account.profile_id === defaultValues.push_profile_id,
                ) && (
                  <option value={defaultValues.push_profile_id}>
                    현재 연결 계정 (연결 해제 또는 변경 필요)
                  </option>
                )}
              {pushAccounts.map((account) => (
                <option key={account.profile_id} value={account.profile_id}>
                  {account.name}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-sm">
              담당 강사가 사용하는 관리자 계정을 연결해 주세요. 해당 계정으로
              로그인한 기기의 계정 설정에서 푸시 알림을 켜면 수강생의 예약·취소
              알림을 받습니다.
            </p>
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
            <PlusIcon className="mr-1 h-4 w-4" />
            추가
          </Button>
        </div>
        {career.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            등록된 경력이 없습니다.
          </p>
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
                <TrashIcon className="text-destructive h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* SNS */}
      <div className="space-y-4">
        <h3 className="border-b pb-2 text-lg font-semibold">SNS</h3>
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
