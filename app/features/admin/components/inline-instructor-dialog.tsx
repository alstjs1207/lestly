import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
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
import { Textarea } from "~/core/components/ui/textarea";

type CreatedInstructor = { instructor_id: number; name: string };
type InstructorResult =
  | { success: true; instructor: CreatedInstructor }
  | { error: string };

export default function InlineInstructorDialog({
  onCreated,
  onOpenChange,
  onCloseAutoFocus,
}: {
  onCreated: (instructor: CreatedInstructor) => void;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: () => void;
}) {
  const fetcher = useFetcher<InstructorResult>();
  const busy = fetcher.state !== "idle";
  const handled = useRef<InstructorResult | undefined>(undefined);
  useEffect(() => {
    if (
      busy ||
      !fetcher.data ||
      !("success" in fetcher.data) ||
      handled.current === fetcher.data
    )
      return;
    handled.current = fetcher.data;
    onCreated(fetcher.data.instructor);
    onOpenChange(false);
  }, [busy, fetcher.data, onCreated, onOpenChange]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy) onOpenChange(open);
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseAutoFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>강사 추가</DialogTitle>
          <DialogDescription>
            클래스 입력은 유지됩니다. 사진·경력·알림 계정은 강사 관리에서 추가할
            수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <fetcher.Form
          method="post"
          action="/api/admin/instructors/create"
          className="space-y-4"
          onSubmit={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <input type="hidden" name="response_mode" value="inline" />
          {fetcher.data && "error" in fetcher.data && (
            <p role="alert" className="text-destructive text-sm">
              {fetcher.data.error}
            </p>
          )}
          <fieldset disabled={busy} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inline-instructor-name">강사명 *</Label>
              <Input
                id="inline-instructor-name"
                name="name"
                required
                placeholder="강사 이름"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inline-instructor-info">소개 (선택)</Label>
              <Textarea
                id="inline-instructor-info"
                name="info"
                rows={3}
                placeholder="강사 소개"
              />
            </div>
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "추가 중..." : "추가하고 선택"}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}
