// Push-only worker: authenticated HTML and APIs are never cached.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    const parsed = event.data?.json();
    payload = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    /* Show a generic visible notification. */
  }
  event.waitUntil(
    self.registration.showNotification(
      typeof payload.title === "string"
        ? payload.title.slice(0, 80)
        : "Lestly 새 알림",
      {
        body:
          typeof payload.body === "string"
            ? payload.body.slice(0, 240)
            : "수업 일정에 새로운 알림이 있습니다.",
        icon: "/pwa-icon-192.png",
        badge: "/pwa-icon-192.png",
        tag:
          typeof payload.tag === "string"
            ? payload.tag.slice(0, 100)
            : "lestly-schedule",
      },
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Always open our authenticated schedule screen, never a payload-supplied URL.
  const target = new URL("/admin/schedules", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        const url = new URL(client.url);
        if (
          url.origin === self.location.origin &&
          url.pathname.startsWith("/admin")
        ) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
