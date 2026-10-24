import { useEffect } from "react";
import { useLocation, useMatches } from "react-router";

import {
  pushSettingsChangedEvent,
  syncExistingPushSubscription,
} from "../push/client";

export function PushSessionSync() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const adminIdentity = matches
    .map(
      (match) =>
        (match.data as { pushIdentity?: string } | undefined)?.pushIdentity,
    )
    .find(Boolean);
  useEffect(() => {
    async function sync() {
      try {
        const result = await fetch("/api/notifications/push-session", {
          method: "POST",
        });
        if (result.ok && adminIdentity) {
          await syncExistingPushSubscription();
          window.dispatchEvent(new Event(pushSettingsChangedEvent));
        }
      } catch {
        /* Reconcile again on navigation or returning to the app. */
      }
    }
    void sync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [pathname, adminIdentity]);
  return null;
}
