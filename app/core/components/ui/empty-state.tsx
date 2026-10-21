import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/core/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-4 text-center",
        compact ? "gap-2 py-8" : "gap-4 py-12",
        className,
      )}
    >
      <div
        className={cn(
          "bg-muted text-muted-foreground flex items-center justify-center rounded-full",
          compact ? "size-10" : "size-12",
        )}
      >
        <Icon className={compact ? "size-5" : "size-6"} aria-hidden="true" />
      </div>
      <div className="max-w-sm">
        <p className="font-medium">{title}</p>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
