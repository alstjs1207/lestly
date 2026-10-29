import { RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/core/components/ui/dialog";

type Props = { studentId: string; studentName: string; withdrawn: boolean };

export default function StudentRestoreDialog(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <RotateCcwIcon className="mr-2 h-4 w-4" />
          수강 재개
        </Button>
      </DialogTrigger>
      {open && <RestoreConfirmation {...props} />}
    </Dialog>
  );
}

function RestoreConfirmation({ studentId, studentName, withdrawn }: Props) {
  const fetcher = useFetcher<{ error?: string }>();
  const busy = fetcher.state !== "idle";
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>수강 재개</DialogTitle>
        <DialogDescription>
          {studentName} 수강생을 수강 중인 상태로 복귀하시겠습니까?
          {withdrawn && " 복귀 후 다시 로그인할 수 있습니다."} 취소된 예약은
          복구되지 않습니다. 기존 수강 기간은 유지되므로 필요한 경우 수정
          화면에서 변경해 주세요.
        </DialogDescription>
      </DialogHeader>
      {fetcher.data?.error && (
        <p className="text-destructive text-sm" role="alert">
          {fetcher.data.error}
        </p>
      )}
      <DialogFooter>
        <fetcher.Form
          method="post"
          action={`/api/admin/students/${studentId}/restore`}
        >
          <Button type="submit" disabled={busy}>
            {busy ? "처리 중..." : "확인하고 수강 재개"}
          </Button>
        </fetcher.Form>
      </DialogFooter>
    </DialogContent>
  );
}
