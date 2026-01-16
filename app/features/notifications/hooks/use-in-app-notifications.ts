/**
 * In-App Notifications Hook with Supabase Realtime
 *
 * Provides real-time updates for in-app notifications.
 * Subscribes to INSERT and UPDATE events on in_app_notifications table.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

export interface InAppNotification {
  in_app_notification_id: number;
  message: string;
  template_type: string;
  is_read: boolean;
  created_at: string;
  notification_id: number | null;
}

interface UseInAppNotificationsReturn {
  notifications: InAppNotification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => void;
}

export function useInAppNotifications(
  organizationId: string
): UseInAppNotificationsReturn {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const fetcher = useFetcher();
  const hasLoadedRef = useRef(false);

  // Load initial data
  const loadNotifications = useCallback(() => {
    fetcher.load("/api/notifications");
  }, []);

  // Initial load (only once)
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    loadNotifications();
  }, []);

  // Process fetcher data
  useEffect(() => {
    if (fetcher.data) {
      setNotifications(fetcher.data.notifications || []);
      setUnreadCount(fetcher.data.unreadCount || 0);
      setIsLoading(false);
    }
  }, [fetcher.data]);

  // Realtime subscription
  useEffect(() => {
    if (!organizationId) return;

    let isMounted = true;

    const setupRealtime = async () => {
      try {
        const { getSupabaseBrowserClient } = await import(
          "~/core/lib/supa-browser-client"
        );
        const supabase = await getSupabaseBrowserClient();

        const channel = supabase
          .channel(`in-app-notifications:${organizationId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "in_app_notifications",
              filter: `organization_id=eq.${organizationId}`,
            },
            (payload) => {
              if (!isMounted) return;

              const newNotification = payload.new as InAppNotification;
              setNotifications((prev) =>
                [newNotification, ...prev].slice(0, 9)
              );
              setUnreadCount((prev) => prev + 1);

              // Optional: Browser notification
              showBrowserNotification(newNotification.message);
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "in_app_notifications",
              filter: `organization_id=eq.${organizationId}`,
            },
            (payload) => {
              if (!isMounted) return;

              const updatedNotification = payload.new as InAppNotification;
              setNotifications((prev) =>
                prev.map((n) =>
                  n.in_app_notification_id ===
                  updatedNotification.in_app_notification_id
                    ? { ...n, ...updatedNotification }
                    : n
                )
              );

              // Recalculate unread count
              setNotifications((prev) => {
                const newUnreadCount = prev.filter((n) => !n.is_read).length;
                setUnreadCount(newUnreadCount);
                return prev;
              });
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } catch {
        // Silently fail if browser client not available (SSR)
      }
    };

    const cleanup = setupRealtime();

    return () => {
      isMounted = false;
      cleanup?.then((fn) => fn?.());
    };
  }, [organizationId]);

  // Mark single notification as read
  const markAsRead = useCallback(
    async (id: number) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          n.in_app_notification_id === id ? { ...n, is_read: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      // API call
      fetcher.submit(
        { in_app_notification_id: id },
        {
          method: "PATCH",
          action: "/api/notifications",
          encType: "application/json",
        }
      );
    },
    []
  );

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    // API call
    fetcher.submit(
      {},
      {
        method: "POST",
        action: "/api/notifications",
        encType: "application/json",
      }
    );
  }, []);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refresh: loadNotifications,
  };
}

/**
 * Show browser notification if permission granted
 */
function showBrowserNotification(message: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;

  if (Notification.permission === "granted") {
    new Notification("새 알림", {
      body: message,
      icon: "/icons/notification.png",
    });
  }
}

/**
 * Request browser notification permission
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return Notification.permission === "granted";
}
