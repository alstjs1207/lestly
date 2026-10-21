import {
  CalendarPlusIcon,
  CheckIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  UserPlusIcon,
} from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/core/components/ui/card";
import { Progress } from "~/core/components/ui/progress";
import { cn } from "~/core/lib/utils";

interface AdminSetupChecklistProps {
  hasStudent: boolean;
  hasProgram: boolean;
  hasSchedule: boolean;
}

export function AdminSetupChecklist({
  hasStudent,
  hasProgram,
  hasSchedule,
}: AdminSetupChecklistProps) {
  const steps = [
    {
      title: "첫 수강생 등록",
      description: "이름과 전화번호만으로 바로 시작할 수 있어요.",
      to: "/admin/students/new",
      icon: UserPlusIcon,
      complete: hasStudent,
    },
    {
      title: "클래스 만들기",
      description: "수업 이름과 기본 정보를 설정하세요.",
      to: "/admin/programs/new",
      icon: GraduationCapIcon,
      complete: hasProgram,
    },
    {
      title: "첫 일정 등록",
      description: "수강생과 시간을 선택하면 준비가 끝납니다.",
      to: "/admin/schedules/new",
      icon: CalendarPlusIcon,
      complete: hasSchedule,
    },
  ];
  const completedCount = steps.filter((step) => step.complete).length;

  if (completedCount === steps.length) return null;

  return (
    <Card className="border-primary/20 overflow-hidden">
      <CardHeader className="gap-3 bg-gradient-to-r from-orange-50/80 to-transparent dark:from-orange-950/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">Lestly 시작하기</CardTitle>
            <CardDescription className="mt-1">
              세 단계만 완료하면 바로 수업을 운영할 수 있습니다.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0 rounded-full">
            {completedCount}/{steps.length} 완료
          </Badge>
        </div>
        <Progress
          value={(completedCount / steps.length) * 100}
          aria-label={`초기 설정 ${completedCount}/${steps.length} 완료`}
        />
      </CardHeader>
      <CardContent className="divide-y px-0">
        {steps.map((step) => (
          <Link
            key={step.to}
            to={step.to}
            className={cn(
              "hover:bg-muted/50 flex min-h-16 items-center gap-3 px-5 py-3 transition-colors",
              step.complete && "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "bg-muted flex size-9 shrink-0 items-center justify-center rounded-full",
                step.complete && "bg-success text-success-foreground",
              )}
            >
              {step.complete ? (
                <CheckIcon className="size-4" aria-hidden="true" />
              ) : (
                <step.icon className="size-4" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block text-sm font-semibold",
                  step.complete && "line-through",
                )}
              >
                {step.title}
              </span>
              <span className="text-muted-foreground mt-0.5 block text-xs">
                {step.complete ? "완료되었습니다." : step.description}
              </span>
            </span>
            <ChevronRightIcon
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
