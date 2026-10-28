import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Input } from "~/core/components/ui/input";
import {
  MAX_STUDENT_TYPES,
  parseStudentTypePolicy,
} from "~/features/organizations/student-type-policy";
import type { StudentTypeOption } from "~/features/organizations/student-types";

export function StudentTypeSettings({ types }: { types: StudentTypeOption[] }) {
  const [rows, setRows] = useState(types);
  const [expected, setExpected] = useState(types);
  const [localError, setLocalError] = useState("");
  const fetcher = useFetcher<{ success: boolean; error: string | null }>();
  const reload = useFetcher<{
    studentTypes?: StudentTypeOption[];
    error?: string;
  }>();
  const handled = useRef(fetcher.data);
  const dismissedError = useRef(fetcher.data);
  const handledReload = useRef(reload.data);
  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data?.success &&
      handled.current !== fetcher.data
    ) {
      handled.current = fetcher.data;
      setRows(types);
      setExpected(types);
    }
    if (
      reload.state === "idle" &&
      reload.data !== handledReload.current &&
      reload.data?.studentTypes
    ) {
      handledReload.current = reload.data;
      dismissedError.current = fetcher.data;
      setLocalError("");
      setRows(reload.data.studentTypes);
      setExpected(reload.data.studentTypes);
    }
  }, [types, fetcher.data, fetcher.state, reload.data, reload.state]);
  const busy = fetcher.state !== "idle" || reload.state !== "idle";
  const serverError =
    dismissedError.current === fetcher.data ? null : fetcher.data?.error;
  const ordered = rows.map((type, sort_order) => ({ ...type, sort_order }));
  const dirty = JSON.stringify(ordered) !== JSON.stringify(expected);
  const change = (code: string, values: Partial<StudentTypeOption>) => {
    setRows((current) =>
      current.map((type) =>
        type.code === code ? { ...type, ...values } : type,
      ),
    );
    setLocalError("");
  };
  const move = (index: number, offset: number) => {
    setRows((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>수강생 유형</CardTitle>
        <CardDescription>
          우리 조직에서 사용할 수강생 분류와 기본값을 관리합니다. 순서는 등록
          화면과 목록 필터에 적용됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            const parsed = parseStudentTypePolicy({ types: ordered, expected });
            if (!parsed.success) {
              setLocalError(parsed.error.issues[0].message);
              return;
            }
            setLocalError("");
            void fetcher.submit(parsed.data, {
              method: "post",
              action: "/api/admin/student-types",
              encType: "application/json",
            });
          }}
        >
          <fieldset disabled={busy} className="min-w-0 space-y-3">
            <p className="text-muted-foreground text-sm">
              사용 중인 유형을 최소 1개 유지하고, 그중 기본 유형을 1개 선택해
              주세요. 기본 유형을 중지하려면 먼저 다른 기본값을 선택하세요.
            </p>
            {rows.map((type, index) => (
              <div
                key={type.code}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 basis-full sm:min-w-40 sm:flex-1 sm:basis-auto">
                  <label
                    htmlFor={`type-label-${type.code}`}
                    className="sr-only"
                  >
                    {index + 1}번 유형 이름
                  </label>
                  <Input
                    id={`type-label-${type.code}`}
                    value={type.label}
                    required
                    maxLength={80}
                    placeholder="유형 이름"
                    onChange={(event) =>
                      change(type.code, { label: event.target.value })
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`${type.label || `${index + 1}번 유형`} 사용`}
                    checked={type.is_active}
                    disabled={type.is_default}
                    onChange={(event) =>
                      change(type.code, { is_active: event.target.checked })
                    }
                  />
                  사용
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    aria-label={`${type.label || `${index + 1}번 유형`} 기본값`}
                    name="default-student-type"
                    checked={type.is_default}
                    disabled={!type.is_active}
                    onChange={() =>
                      setRows((current) =>
                        current.map((row) => ({
                          ...row,
                          is_default: row.code === type.code,
                        })),
                      )
                    }
                  />
                  기본값
                </label>
                <div className="ml-auto flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label={`${type.label || `${index + 1}번 유형`} 위로 이동`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUpIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    aria-label={`${type.label || `${index + 1}번 유형`} 아래로 이동`}
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDownIcon className="size-4" />
                  </Button>
                  {!expected.some((saved) => saved.code === type.code) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={`${type.label || `${index + 1}번 유형`} 추가 취소`}
                      disabled={type.is_default}
                      onClick={() =>
                        setRows((current) =>
                          current.filter((row) => row.code !== type.code),
                        )
                      }
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              저장된 유형은 삭제하지 않고 ‘사용’을 해제합니다. 기존 수강생의
              분류와 이력은 유지되며, 새 등록에서는 선택할 수 없습니다. 이름
              변경은 기존 수강생의 표시에도 반영됩니다.
            </p>
            {rows.length >= MAX_STUDENT_TYPES && (
              <p className="text-muted-foreground text-xs">
                유형은 최대 {MAX_STUDENT_TYPES}개까지 관리할 수 있습니다.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={rows.length >= MAX_STUDENT_TYPES}
              onClick={() =>
                setRows((current) => [
                  ...current,
                  {
                    code: `TYPE_${crypto.randomUUID()}`,
                    label: "",
                    is_active: true,
                    is_default: false,
                    sort_order: current.length,
                  },
                ])
              }
            >
              <PlusIcon className="mr-2 size-4" />
              유형 추가
            </Button>
          </fieldset>
          {(localError || reload.data?.error || serverError) && (
            <p role="alert" className="text-destructive text-sm">
              {localError || reload.data?.error || serverError}
            </p>
          )}
          {fetcher.data?.success && !dirty && (
            <p role="status" className="text-sm">
              유형 설정을 저장했습니다.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {serverError && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (
                    !dirty ||
                    window.confirm(
                      "입력한 변경을 버리고 최신 목록을 불러올까요?",
                    )
                  ) {
                    void reload.load("/api/admin/student-types");
                  }
                }}
              >
                최신 목록 불러오기
              </Button>
            )}
            <Button type="submit" disabled={busy || !dirty}>
              {busy ? "저장 중..." : "유형 설정 저장"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
