import type { Route } from "./+types/public.layout";

import { Outlet, redirect } from "react-router";

import makeServerClient from "../lib/supa-client.server";
import { isAdmin } from "~/features/admin/guards.server";

export async function loader({ request }: Route.LoaderArgs) {
  const [client] = makeServerClient(request);
  const {
    data: { user },
  } = await client.auth.getUser();

  if (user) {
    // Check if signup is complete for admin users
    const { data: profile } = await client
      .from("profiles")
      .select("is_signup_complete")
      .eq("profile_id", user.id)
      .single();

    if (profile && !profile.is_signup_complete) {
      // Signup not complete, redirect to profile setup
      throw redirect("/admin/signup/profile");
    }

    // Redirect based on user role
    const adminUser = await isAdmin(client);
    const redirectTo = adminUser ? "/admin" : "/dashboard";
    throw redirect(redirectTo);
  }

  // Return an empty object to avoid the "Cannot read properties of undefined" error
  return {};
}

export default function PublicLayout() {
  return <Outlet />;
}
