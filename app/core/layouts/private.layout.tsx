import type { ShouldRevalidateFunctionArgs } from "react-router";

import type { Route } from "./+types/private.layout";

import { Outlet, redirect } from "react-router";

import makeServerClient, { getAuthUser } from "../lib/supa-client.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client, headers] = makeServerClient(request);
  const user = await getAuthUser(client);
  if (!user) {
    const url = new URL(request.url);
    // /admin 또는 /super-admin 경로에서 세션 만료 시 redirect 파라미터 추가
    const isAdminPath =
      url.pathname.startsWith("/admin") ||
      url.pathname.startsWith("/super-admin");
    const redirectParam = isAdminPath
      ? `?redirect=${encodeURIComponent(url.pathname)}`
      : "";
    throw redirect(`/login${redirectParam}`, { headers });
  }

  // Return an empty object to avoid the "Cannot read properties of undefined" error
  return {};
}

export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  const isAdminNavigation =
    currentUrl.pathname.startsWith("/admin") &&
    nextUrl.pathname.startsWith("/admin");

  if (isAdminNavigation && (!formMethod || formMethod === "GET")) {
    return false;
  }

  return defaultShouldRevalidate;
}

export default function PrivateLayout() {
  return <Outlet />;
}
