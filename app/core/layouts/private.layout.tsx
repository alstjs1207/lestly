import type { Route } from "./+types/private.layout";

import { Outlet, redirect } from "react-router";

import makeServerClient from "../lib/supa-client.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    const url = new URL(request.url);
    // /admin 또는 /super-admin 경로에서 세션 만료 시 redirect 파라미터 추가
    const isAdminPath =
      url.pathname.startsWith("/admin") ||
      url.pathname.startsWith("/super-admin");
    const redirectParam = isAdminPath
      ? `?redirect=${encodeURIComponent(url.pathname)}`
      : "";
    throw redirect(`/login${redirectParam}`);
  }

  // Return an empty object to avoid the "Cannot read properties of undefined" error
  return {};
}

export default function PrivateLayout() {
  return <Outlet />;
}
