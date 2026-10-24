import { randomUUID } from "node:crypto";
import { createCookie } from "react-router";

const deviceCookie = createCookie("lestly_push_device", {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
});

export async function getPushDeviceId(
  request: Request,
): Promise<string | null> {
  let value: unknown;
  try {
    value = await deviceCookie.parse(request.headers.get("Cookie"));
  } catch {
    return null;
  }
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : null;
}

export async function ensurePushDeviceId(request: Request, headers: Headers) {
  const deviceId = (await getPushDeviceId(request)) ?? randomUUID();
  headers.append("Set-Cookie", await deviceCookie.serialize(deviceId));
  return deviceId;
}

export async function clearPushDeviceCookie(headers: Headers) {
  headers.append("Set-Cookie", await deviceCookie.serialize("", { maxAge: 0 }));
}
