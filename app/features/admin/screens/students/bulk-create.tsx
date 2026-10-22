import type {
  BulkStudentActionData,
  BulkStudentRow,
} from "../../lib/student-bulk";
import type { Route } from "./+types/bulk-create";

import { ChevronLeftIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "~/core/components/ui/alert";
import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import { Label } from "~/core/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/core/components/ui/table";
import { Textarea } from "~/core/components/ui/textarea";
import makeServerClient from "~/core/lib/supa-client.server";

import { requireAdminRole } from "../../guards.server";
import {
  MAX_BULK_STUDENTS,
  parseBulkStudents,
  parseStudentClipboard,
  studentTypeLabels,
} from "../../lib/student-bulk";

type EditableRow = BulkStudentRow & { saved?: boolean; error?: string };
const emptyRow = (id: string): EditableRow => ({
  id,
  name: "",
  phone: "",
  region: "",
  type: "EXAMINEE",
});
const hasInput = (row: EditableRow) =>
  Boolean(row.name.trim() || row.phone.trim() || row.region.trim());

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  await requireAdminRole(client);
  return null;
}

export default function StudentBulkCreateScreen() {
  const fetcher = useFetcher<BulkStudentActionData>();
  const busy = fetcher.state !== "idle";
  const nextId = useRef(3);
  const [rows, setRows] = useState<EditableRow[]>(
    [0, 1, 2].map((id) => emptyRow(String(id))),
  );
  const [clipboard, setClipboard] = useState("");
  const [message, setMessage] = useState("");
  const pending = rows.filter((row) => !row.saved && hasInput(row));
  const savedCount = rows.filter((row) => row.saved).length;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const result = fetcher.data;
    setRows((current) =>
      current.map((row) => {
        const status = result.results?.find((item) => item.id === row.id);
        return status
          ? { ...row, saved: status.success, error: status.error }
          : row;
      }),
    );
    setMessage(
      result.error ??
        (result.results?.some((row) => !row.success)
          ? "일부 수강생을 등록하지 못했습니다. 오류를 확인한 뒤 다시 등록해 주세요. 완료된 행은 다시 등록되지 않습니다."
          : ""),
    );
  }, [fetcher.data, fetcher.state]);

  const updateRow = (
    id: string,
    field: keyof BulkStudentRow,
    value: string,
  ) => {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, [field]: value, error: undefined } : row,
      ),
    );
  };

  const pasteRows = () => {
    try {
      const pasted = parseStudentClipboard(clipboard);
      if (!pasted.length) {
        setMessage("붙여넣을 명단을 입력해 주세요.");
        return;
      }
      const existing = rows.filter((row) => row.saved || hasInput(row));
      if (existing.length + pasted.length > MAX_BULK_STUDENTS) {
        setMessage(`한 번에 ${MAX_BULK_STUDENTS}명까지 입력할 수 있습니다.`);
        return;
      }
      setRows([
        ...existing,
        ...pasted.map((row) => ({ ...row, id: String(nextId.current++) })),
      ]);
      setClipboard("");
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "붙여넣은 명단을 확인해 주세요.",
      );
    }
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const parsed = parseBulkStudents(pending);
    if (!parsed.success) {
      setMessage(
        parsed.error.issues.find((issue) => !issue.path.length)?.message ??
          "입력 오류를 수정한 후 다시 등록해 주세요.",
      );
      setRows((current) =>
        current.map((row) => ({
          ...row,
          error:
            parsed.error.issues
              .filter((issue) => pending[Number(issue.path[0])]?.id === row.id)
              .map((issue) => issue.message)
              .join(" ") || undefined,
        })),
      );
      return;
    }
    setMessage("");
    setRows((current) => current.map((row) => ({ ...row, error: undefined })));
    void fetcher.submit(
      { students: JSON.stringify(parsed.data) },
      { method: "post", action: "/api/admin/students/bulk-create" },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/students" aria-label="수강생 목록으로 돌아가기">
            <ChevronLeftIcon className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold md:text-2xl">수강생 일괄 등록</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            필수 정보만 입력해 한 번에 최대 {MAX_BULK_STUDENTS}명을 등록하세요.
          </p>
        </div>
      </div>

      {savedCount > 0 && (
        <Alert role="status">
          <AlertTitle>{savedCount}명 등록 완료</AlertTitle>
          <AlertDescription>
            등록된 수강생은 목록에서 확인하고 초대 링크를 전달할 수 있습니다.
          </AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>명단을 확인해 주세요</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={submit}>
        <fieldset disabled={busy} className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>엑셀 명단 붙여넣기</CardTitle>
              <CardDescription>
                엑셀이나 구글 시트에서 이름 · 전화번호 · 지역 · 유형 순서로 셀을
                복사하세요. 유형을 생략하면 입시생으로 등록됩니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="student-clipboard">복사한 명단</Label>
              <Textarea
                id="student-clipboard"
                value={clipboard}
                onChange={(event) => setClipboard(event.target.value)}
                rows={3}
                placeholder={
                  "홍길동\t010-1234-5678\t서울\t입시생\n김하나\t010-9876-5432\t경기\t성인"
                }
              />
              <Button type="button" variant="outline" onClick={pasteRows}>
                명단에 추가
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>등록할 명단</CardTitle>
              <CardDescription>
                이름·전화번호·지역·유형은 필수입니다. 빈 행은 제외되며, 수업
                기간은 등록일부터 1년으로 자동 설정됩니다. 추가 정보는 등록 후
                수정할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">번호</TableHead>
                    <TableHead>이름 *</TableHead>
                    <TableHead>전화번호 *</TableHead>
                    <TableHead>지역 *</TableHead>
                    <TableHead>유형 *</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>
                      <span className="sr-only">행 삭제</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={row.id}>
                      <TableCell>{index + 1}</TableCell>
                      {(["name", "phone", "region"] as const).map((field) => (
                        <TableCell key={field} className="align-top">
                          <Input
                            aria-label={`${index + 1}번 ${field === "name" ? "이름" : field === "phone" ? "전화번호" : "지역"}`}
                            type={field === "phone" ? "tel" : "text"}
                            value={row[field]}
                            onChange={(event) =>
                              updateRow(row.id, field, event.target.value)
                            }
                            disabled={row.saved}
                            aria-invalid={Boolean(row.error)}
                            aria-describedby={
                              row.error ? `row-error-${row.id}` : undefined
                            }
                            className={
                              field === "phone" ? "min-w-40" : "min-w-24"
                            }
                          />
                        </TableCell>
                      ))}
                      <TableCell className="align-top">
                        <select
                          aria-label={`${index + 1}번 유형`}
                          value={row.type}
                          onChange={(event) =>
                            updateRow(row.id, "type", event.target.value)
                          }
                          disabled={row.saved}
                          className="border-input bg-background h-9 min-w-24 rounded-md border px-2 text-sm"
                          aria-invalid={Boolean(row.error)}
                        >
                          {!Object.hasOwn(studentTypeLabels, row.type) && (
                            <option value={row.type}>{row.type}</option>
                          )}
                          {Object.entries(studentTypeLabels).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </TableCell>
                      <TableCell className="max-w-56 min-w-24 whitespace-normal">
                        {row.saved ? (
                          <span className="text-primary font-medium">
                            등록 완료
                          </span>
                        ) : row.error ? (
                          <p
                            id={`row-error-${row.id}`}
                            className="text-destructive text-xs"
                            role="alert"
                          >
                            {row.error}
                          </p>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {hasInput(row) ? "등록 대기" : "빈 행"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={row.saved}
                          aria-label={`${index + 1}번 행 삭제`}
                          onClick={() =>
                            setRows((current) =>
                              current.filter((item) => item.id !== row.id),
                            )
                          }
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Button
                type="button"
                variant="outline"
                disabled={rows.length >= MAX_BULK_STUDENTS}
                onClick={() =>
                  setRows((current) => [
                    ...current,
                    emptyRow(String(nextId.current++)),
                  ])
                }
              >
                <PlusIcon className="mr-1 size-4" />행 추가
              </Button>
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="outline" asChild>
              <Link to="/admin/students">수강생 목록</Link>
            </Button>
            <Button type="submit" disabled={busy || !pending.length}>
              {busy ? "등록 중..." : `${pending.length}명 일괄 등록`}
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
