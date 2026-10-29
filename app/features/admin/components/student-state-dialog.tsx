import type { StudentChangeImpact } from "../lib/student-lifecycle.server";

import { CircleStopIcon, TrashIcon } from "lucide-react";
import { useEffect, useState } from "react";
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

type Props = {
  studentId: string;
  studentName: string;
  kind: "graduate" | "delete";
};
type Result = {
  impact?: StudentChangeImpact;
  confirmation?: StudentChangeImpact;
  error?: string;
};

export default function StudentStateDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const deleting = props.kind === "delete";
  const Icon = deleting ? TrashIcon : CircleStopIcon;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          aria-label={deleting ? "탈퇴 처리" : "수강 종료 처리"}
          variant={deleting ? "destructive" : "outline"}
        >
          <Icon className="mr-2 h-4 w-4" />
          <span>{deleting ? "탈퇴 처리" : "수강 종료 처리"}</span>
        </Button>
      </DialogTrigger>
      {open && <StudentStateConfirmation {...props} />}
    </Dialog>
  );
}

// Mount a fresh form on every open so old confirmation tokens are never reused.
function StudentStateConfirmation({ studentId, studentName, kind }: Props) {
  const lookup = useFetcher<Result>();
  const mutation = useFetcher<Result>();
  const endpoint = `/api/admin/students/${studentId}/${kind}`;
  const { load } = lookup;
  useEffect(() => {
    void load(endpoint);
  }, [load, endpoint]);
  const label = kind === "delete" ? "탈퇴" : "수강 종료";
  const impact = mutation.data?.confirmation ?? lookup.data?.impact;
  const busy = lookup.state !== "idle" || mutation.state !== "idle";
  const error = mutation.data?.error ?? lookup.data?.error;
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>수강생 {label} 처리</DialogTitle>
        <DialogDescription>
          {studentName} 수강생을 {label} 처리하시겠습니까?{" "}
          {kind === "delete"
            ? "탈퇴 후에는 로그인할 수 없습니다."
            : "이 운영 공간의 수강을 종료합니다. 특정 클래스만 수료하는 처리가 아니며, 새 수업을 예약할 수 없습니다."}
        </DialogDescription>
      </DialogHeader>
      {!impact && !error && <p role="status">취소할 예약 확인 중…</p>}
      {impact && (
        <p role="status">
          예정 예약 {impact.cancel_count}건이 자동 취소됩니다.
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      {impact?.in_progress && (
        <p className="text-destructive text-sm" role="alert">
          진행 중인 수업이 있습니다. 수업 종료 후 다시 처리해 주세요.
        </p>
      )}
      <DialogFooter>
        {!impact && error && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void load(endpoint)}
          >
            다시 조회
          </Button>
        )}
        <mutation.Form method="post" action={endpoint}>
          <input
            type="hidden"
            name="lifecycle_confirmation"
            value={impact?.token ?? ""}
          />
          <Button
            type="submit"
            variant={kind === "delete" ? "destructive" : "default"}
            disabled={busy || !impact || impact.in_progress}
          >
            {mutation.state !== "idle"
              ? "처리 중..."
              : `확인하고 ${label} 처리`}
          </Button>
        </mutation.Form>
      </DialogFooter>
    </DialogContent>
  );
}
