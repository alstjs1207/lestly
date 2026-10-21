import { CheckIcon, ClipboardIcon } from "lucide-react";
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
} from "~/core/components/ui/dialog";
import { Input } from "~/core/components/ui/input";

import { STUDENT_INVITE_TTL_DAYS } from "../lib/student-invite";

export default function StudentInviteDialog({
  student,
  onClose,
}: {
  student: { id: string; name: string };
  onClose: () => void;
}) {
  const fetcher = useFetcher<{
    success: boolean;
    error?: string;
    inviteUrl?: string;
    expiresAt?: string;
  }>();
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const [copyError, setCopyError] = useState(false);
  const inviteUrl = fetcher.data?.success ? fetcher.data.inviteUrl : undefined;
  const busy = fetcher.state !== "idle";
  const message = `${student.name}님, Lestly 수강생 초대 링크입니다.\n아래 링크에서 이메일 없이 카카오 로그인으로 수강 정보를 연결해 주세요.\n${inviteUrl}\n본인만 사용해 주세요. ${STUDENT_INVITE_TTL_DAYS}일 동안 유효하며 한 번만 사용할 수 있습니다.`;

  async function copy(kind: "link" | "message") {
    if (!inviteUrl) return;
    setCopied(null);
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(
        kind === "link" ? inviteUrl : message,
      );
      setCopied(kind);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>수강생 초대 링크</DialogTitle>
          <DialogDescription>
            링크나 안내 문구를 복사해 {student.name} 수강생에게 카카오톡으로
            직접 전달하세요. 이메일은 필요하지 않습니다. 링크는{" "}
            {STUDENT_INVITE_TTL_DAYS}일 동안 유효하며 한 번만 사용할 수
            있습니다.
          </DialogDescription>
        </DialogHeader>
        {fetcher.data?.success === false && (
          <p className="text-destructive text-sm" role="alert">
            {fetcher.data.error}
          </p>
        )}
        {inviteUrl && (
          <div className="space-y-3">
            <Input
              aria-label="수강생 초대 링크"
              readOnly
              value={inviteUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => copy("link")}
              >
                {copied === "link" ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <ClipboardIcon className="size-4" />
                )}
                링크 복사
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => copy("message")}
              >
                {copied === "message" ? (
                  <CheckIcon className="size-4" />
                ) : (
                  <ClipboardIcon className="size-4" />
                )}
                카톡 안내 문구 복사
              </Button>
            </div>
            {copied && (
              <p role="status" className="text-sm text-green-600">
                복사했습니다. 수강생과의 카카오톡 대화에 붙여넣어 주세요.
              </p>
            )}
            {copyError && (
              <p role="alert" className="text-destructive text-sm">
                복사하지 못했습니다. 위 링크를 선택해 직접 복사해 주세요.
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              만료:{" "}
              {new Date(fetcher.data!.expiresAt!).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}{" "}
              (한국 시간). 새 링크를 만들면 이전 링크는 사용할 수 없습니다. 해당
              수강생에게만 전달해 주세요.
            </p>
          </div>
        )}
        <DialogFooter>
          <fetcher.Form
            method="post"
            action={`/api/admin/students/${student.id}/invite`}
            onSubmit={() => {
              setCopied(null);
              setCopyError(false);
            }}
          >
            <Button type="submit" disabled={busy}>
              {busy
                ? "생성 중..."
                : inviteUrl
                  ? "새 링크 만들기"
                  : "링크 만들기"}
            </Button>
          </fetcher.Form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
