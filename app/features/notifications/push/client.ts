const subscriptionUrl = "/api/notifications/push-subscription";
const preferenceKey = "lestly.push.enabled";
export const pushSettingsChangedEvent = "lestly:push-settings-changed";

export type PushSettings = {
  configured: boolean;
  publicKey: string | null;
  subscribed: boolean;
};

export function pushSupport(): "supported" | "install" | "unsupported" {
  if (!window.isSecureContext) return "unsupported";
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  if (ios && !standalone) return "install";
  return "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
    ? "supported"
    : "unsupported";
}

export async function getPushSettings(): Promise<PushSettings> {
  const response = await fetch(subscriptionUrl, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok || response.redirected)
    throw new Error("알림 설정을 불러오지 못했습니다.");
  return response.json();
}

function applicationServerKey(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function hasCurrentKey(subscription: PushSubscription, publicKey: string) {
  const actual = subscription.options.applicationServerKey;
  const expected = applicationServerKey(publicKey);
  return (
    !!actual &&
    new Uint8Array(actual).length === expected.length &&
    new Uint8Array(actual).every((value, index) => value === expected[index])
  );
}

async function saveSubscription(subscription: PushSubscription) {
  const response = await fetch(subscriptionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok || response.redirected)
    throw new Error("기기에 알림을 연결하지 못했습니다. 다시 시도해 주세요.");
}

export async function getDeviceSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration?.pushManager.getSubscription() ?? null;
}

export async function syncExistingPushSubscription() {
  if (pushSupport() !== "supported") return;
  try {
    if (localStorage.getItem(preferenceKey) === "false") return;
  } catch {
    /* Storage can be unavailable. */
  }
  if (Notification.permission !== "granted") return;
  const subscription = await getDeviceSubscription();
  if (!subscription) return;
  const settings = await getPushSettings();
  if (settings.publicKey && hasCurrentKey(subscription, settings.publicKey))
    await saveSubscription(subscription);
}

export async function isDevicePushEnabled(settings: PushSettings) {
  if (
    !settings.subscribed ||
    !settings.publicKey ||
    Notification.permission !== "granted"
  )
    return false;
  const subscription = await getDeviceSubscription();
  return !!subscription && hasCurrentKey(subscription, settings.publicKey);
}

export async function enableDevicePush(publicKey: string) {
  // This is the first await in the click handler: iOS requires a user gesture.
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("기기 설정에서 Lestly의 알림을 허용해 주세요.");
  const registration = await navigator.serviceWorker.register("/push-sw.js", {
    scope: "/",
  });
  await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !hasCurrentKey(subscription, publicKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(publicKey),
  });
  await saveSubscription(subscription);
  try {
    localStorage.setItem(preferenceKey, "true");
  } catch {
    /* Optional preference cache. */
  }
}

export async function disableDevicePush() {
  const response = await fetch(subscriptionUrl, { method: "DELETE" });
  if (!response.ok || response.redirected)
    throw new Error("알림을 끄지 못했습니다. 다시 시도해 주세요.");
  try {
    localStorage.setItem(preferenceKey, "false");
  } catch {
    /* Optional preference cache. */
  }
  const subscription = await getDeviceSubscription();
  await subscription?.unsubscribe();
}
