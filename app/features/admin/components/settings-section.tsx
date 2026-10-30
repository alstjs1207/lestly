import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";

import { Button } from "~/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "~/core/components/ui/card";
import type { SettingsSectionId } from "~/features/app-settings/settings-sections";

export function SettingsSection({
  id,
  section,
  title,
  description,
  scope,
  saveLabel,
  icon: Icon,
  children,
}: {
  id: string;
  section: SettingsSectionId;
  title: string;
  description: string;
  scope: string;
  saveLabel: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  const fetcher = useFetcher<{
    success: boolean;
    section?: SettingsSectionId;
    error?: string | null;
  }>();
  const [dismissed, setDismissed] = useState<typeof fetcher.data>();
  const busy = fetcher.state !== "idle";
  const result = !busy && fetcher.data !== dismissed ? fetcher.data : undefined;
  const hidePreviousFeedback = () => setDismissed(fetcher.data);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="bg-muted/25 border-b px-4 py-5 sm:px-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h2
                id={`${id}-title`}
                className="text-base font-semibold sm:text-lg"
              >
                {title}
              </h2>
            </div>
            <span className="text-muted-foreground bg-background rounded-full border px-2.5 py-1 text-xs">
              {scope}
            </span>
          </div>
          <CardDescription className="leading-relaxed">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <fetcher.Form
            method="post"
            action="/api/admin/settings"
            aria-label={`${title} 설정`}
            onSubmit={hidePreviousFeedback}
            onChangeCapture={hidePreviousFeedback}
            onClickCapture={(event) => {
              if (
                (event.target as HTMLElement).closest('button[type="button"]')
              )
                hidePreviousFeedback();
            }}
          >
            <input type="hidden" name="section" value={section} />
            <fieldset
              disabled={busy}
              aria-busy={busy}
              className="min-w-0 space-y-6 px-4 py-5 sm:px-6 sm:py-6"
            >
              {children}
            </fieldset>
            <div className="bg-muted/15 flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div aria-live="polite" className="min-w-0 text-sm">
                {result?.error ? (
                  <p role="alert" className="text-destructive">
                    {result.error}
                  </p>
                ) : result?.success ? (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"
                  >
                    <CheckCircle2Icon
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    {title}을 저장했습니다.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    이 영역의 설정만 저장됩니다.
                  </p>
                )}
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="min-h-11 shrink-0 sm:min-w-36"
              >
                {busy && (
                  <LoaderCircleIcon
                    className="mr-2 size-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {busy ? "저장 중..." : saveLabel}
              </Button>
            </div>
          </fetcher.Form>
        </CardContent>
      </Card>
    </section>
  );
}
