/**
 * In-App Notifications Hook with Supabase Realtime
 *
 * Provides real-time updates for in-app notifications.
 * Subscribes to INSERT and UPDATE events on in_app_notifications table.
 */
import { useCallback, useEffect, useState } from "react";
import { useFetcher, useLocation } from "react-router";

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
  organizationId: string,
  notificationsEnabled = true,
): UseInAppNotificationsReturn {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { pathname } = useLocation();
  const fetcher = useFetcher();
  const mutationFetcher = useFetcher();

  // Load initial data
  const loadNotifications = useCallback(() => {
    fetcher.load("/api/notifications");
  }, []);

  // Refresh on navigation too, including the redirect after deleting a consultation.
  useEffect(() => {
    setNotifications([]);
    setUnreadCount(0);
    loadNotifications();
  }, [organizationId, notificationsEnabled, pathname]);

  // Process fetcher data
  useEffect(() => {
    if (fetcher.data && "notifications" in fetcher.data) {
      setNotifications(fetcher.data.notifications || []);
      setUnreadCount(fetcher.data.unreadCount || 0);
      setIsLoading(false);
    } else if (fetcher.data) setIsLoading(false);
  }, [fetcher.data]);

  useEffect(() => {
    if (mutationFetcher.state === "idle" && mutationFetcher.data)
      loadNotifications();
  }, [mutationFetcher.state, mutationFetcher.data]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") loadNotifications();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);

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
              if (
                !notificationsEnabled &&
                newNotification.template_type !== "SYS_CONSULT_ADMIN"
              )
                return;
              loadNotifications();

              // OS notifications are delivered independently through Web Push.
            },
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
                    : n,
                ),
              );

              // The displayed list is capped at 9; the total must come from
              // the server, including unread rows outside that window.
              loadNotifications();
            },
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
  }, [organizationId, notificationsEnabled]);

  // Mark single notification as read
  const markAsRead = useCallback(async (id: number) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) =>
        n.in_app_notification_id === id ? { ...n, is_read: true } : n,
      ),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    // API call
    mutationFetcher.submit(
      { in_app_notification_id: id },
      {
        method: "PATCH",
        action: "/api/notifications",
        encType: "application/json",
      },
    );
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    // API call
    mutationFetcher.submit(
      {},
      {
        method: "POST",
        action: "/api/notifications",
        encType: "application/json",
      },
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
