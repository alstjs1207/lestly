/**
 * Notification Bell Component
 *
 * Displays a bell icon with unread count badge in the admin header.
 * Shows a dropdown with recent notifications when clicked.
 */
import { BellIcon } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "~/core/components/ui/badge";
import { Button } from "~/core/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/core/components/ui/dropdown-menu";
import { cn } from "~/core/lib/utils";

import {
  useInAppNotifications,
  type InAppNotification,
} from "../hooks/use-in-app-notifications";

interface NotificationBellProps {
  organizationId: string;
}

export function NotificationBell({ organizationId }: NotificationBellProps) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useInAppNotifications(organizationId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <BellIcon className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
          <span className="sr-only">알림</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">알림</DropdownMenuLabel>
          {unreadCount > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={(e) => {
                e.preventDefault();
                markAllAsRead();
              }}
            >
              전체 읽음
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            알림이 없습니다
          </div>
        ) : (
          <>
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.in_app_notification_id}
                notification={notification}
                onRead={() => markAsRead(notification.in_app_notification_id)}
              />
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/notifications"
            className="justify-center text-sm text-muted-foreground"
          >
            전체 보기
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface NotificationItemProps {
  notification: InAppNotification;
  onRead: () => void;
}

function NotificationItem({ notification, onRead }: NotificationItemProps) {
  return (
    <DropdownMenuItem
      className="flex flex-col items-start gap-1 cursor-pointer"
      onClick={() => {
        if (!notification.is_read) {
          onRead();
        }
      }}
    >
      <div className="flex w-full items-start gap-2">
        <span
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            notification.is_read ? "bg-transparent" : "bg-blue-500"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{notification.message}</p>
          <p className="text-xs text-muted-foreground">
            {formatRelativeTime(notification.created_at)}
          </p>
        </div>
      </div>
    </DropdownMenuItem>
  );
}

/**
 * Format relative time (e.g., "방금 전", "5분 전", "1시간 전")
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;

  return date.toLocaleDateString("ko-KR");
}

export default NotificationBell;
