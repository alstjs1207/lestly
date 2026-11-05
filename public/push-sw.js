// Push-only worker: authenticated HTML and APIs are never cached.
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
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
        data: {
          url:
            typeof payload.url === "string" &&
            /^\/admin\/consultations\/[1-9]\d*$/.test(payload.url)
              ? payload.url
              : "/admin/schedules",
        },
      },
    ),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Accept only our exact authenticated routes; never an arbitrary payload URL.
  const path = event.notification.data?.url;
  const target = new URL(
    typeof path === "string" && /^\/admin\/consultations\/[1-9]\d*$/.test(path)
      ? path
      : "/admin/schedules",
    self.location.origin,
  ).href;
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
