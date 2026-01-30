/**
 * Application Routes Configuration
 * 
 * This file defines all routes for the application using React Router's
 * file-based routing system. Routes are organized by feature and access level.
 * 
 * The structure uses layouts for shared UI elements and prefixes for route grouping.
 * This approach creates a hierarchical routing system that's both maintainable and scalable.
 */
import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  route("/robots.txt", "core/screens/robots.ts"),
  route("/sitemap.xml", "core/screens/sitemap.ts"),
  ...prefix("/debug", [
    // You should delete this in production.
    route("/sentry", "debug/sentry.tsx"),
    route("/analytics", "debug/analytics.tsx"),
  ]),
  // API Routes. Routes that export actions and loaders but no UI.
  ...prefix("/api", [
    route("/consult-request", "features/class/api/consult-request.tsx"),
    ...prefix("/settings", [
      route("/theme", "features/settings/api/set-theme.tsx"),
      route("/locale", "features/settings/api/set-locale.tsx"),
    ]),
    ...prefix("/users", [
      index("features/users/api/delete-account.tsx"),
      route("/password", "features/users/api/change-password.tsx"),
      route("/email", "features/users/api/change-email.tsx"),
      route("/profile", "features/users/api/edit-profile.tsx"),
      route("/providers", "features/users/api/connect-provider.tsx"),
      route(
        "/providers/:provider",
        "features/users/api/disconnect-provider.tsx",
      ),
    ]),
    ...prefix("/cron", [
      route("/mailer", "features/cron/api/mailer.tsx"),
      route("/alimtalk", "features/notifications/api/alimtalk-cron.tsx"),
      route("/email", "features/notifications/api/email-cron.tsx"),
    ]),
    ...prefix("/notifications", [
      index("features/notifications/api/in-app-notifications.tsx"),
      route("/test-send", "features/notifications/api/test-send.tsx"),
    ]),
  ]),

  // Redirect root to login page
  index("core/screens/redirect-to-login.tsx"),

  // 공개 클래스 소개 페이지 (로그인 없이 접근 가능)
  route("/class/:slug", "features/class/screens/class-detail.tsx"),

  // Full-screen auth routes (without navigation bar)
  layout("core/layouts/public.layout.tsx", { id: "public-fullscreen" }, [
    route("/login", "features/auth/screens/login.tsx"),
    route("/admin/signup", "features/auth/screens/admin-signup.tsx"),
    route("/admin/signup/verify", "features/auth/screens/admin-signup-verify.tsx"),
  ]),

  // Admin signup flow (requires authentication, no layout redirect)
  route("/admin/signup/profile", "features/auth/screens/admin-signup-profile.tsx"),
  route("/admin/signup/organization", "features/auth/screens/admin-organization-setup.tsx"),

  layout("core/layouts/navigation.layout.tsx", [
    route("/auth/confirm", "features/auth/screens/confirm.tsx"),
    // index("features/home/screens/home.tsx"),
    route("/error", "core/screens/error.tsx"),
    layout("core/layouts/public.layout.tsx", [
      // Routes that should only be visible to unauthenticated users.
      // route("/join", "features/auth/screens/join.tsx"),
      ...prefix("/auth", [
        route("/api/resend", "features/auth/api/resend.tsx"),
        route(
          "/forgot-password/reset",
          "features/auth/screens/forgot-password.tsx",
        ),
        route("/magic-link", "features/auth/screens/magic-link.tsx"),
        ...prefix("/otp", [
          route("/start", "features/auth/screens/otp/start.tsx"),
          route("/complete", "features/auth/screens/otp/complete.tsx"),
        ]),
        ...prefix("/social", [
          route("/start/:provider", "features/auth/screens/social/start.tsx"),
          route(
            "/complete/:provider",
            "features/auth/screens/social/complete.tsx",
          ),
        ]),
      ]),
    ]),
    layout("core/layouts/private.layout.tsx", { id: "private-auth" }, [
      ...prefix("/auth", [
        route(
          "/forgot-password/create",
          "features/auth/screens/new-password.tsx",
        ),
        route("/email-verified", "features/auth/screens/email-verified.tsx"),
        route("/set-password", "features/auth/screens/set-password.tsx"),
      ]),
      // Routes that should only be visible to authenticated users.
      route("/logout", "features/auth/screens/logout.tsx"),
    ]),
    route("/contact", "features/contact/screens/contact-us.tsx"),
    ...prefix("/payments", [
      route("/checkout", "features/payments/screens/checkout.tsx"),
      layout("core/layouts/private.layout.tsx", { id: "private-payments" }, [
        route("/success", "features/payments/screens/success.tsx"),
        route("/failure", "features/payments/screens/failure.tsx"),
      ]),
    ]),
  ]),

  layout("core/layouts/private.layout.tsx", { id: "private-dashboard" }, [
    layout("features/users/layouts/dashboard.layout.tsx", [
      ...prefix("/dashboard", [
        index("features/users/screens/dashboard.tsx"),
        route("/payments", "features/payments/screens/payments.tsx"),
      ]),
      route("/account", "features/users/screens/account.tsx"),
    ]),
  ]),

  // Admin Backoffice Routes
  layout("core/layouts/private.layout.tsx", { id: "private-admin" }, [
    layout("features/admin/layouts/admin.layout.tsx", [
      ...prefix("/admin", [
        index("features/admin/screens/dashboard.tsx"),
        route("/today", "features/admin/screens/today.tsx"),
        ...prefix("/students", [
          index("features/admin/screens/students/list.tsx"),
          route("/new", "features/admin/screens/students/create.tsx"),
          route("/:studentId", "features/admin/screens/students/detail.tsx"),
          route("/:studentId/edit", "features/admin/screens/students/edit.tsx"),
        ]),
        ...prefix("/schedules", [
          index("features/admin/screens/schedules/calendar.tsx"),
          route("/list", "features/admin/screens/schedules/list.tsx"),
          route("/new", "features/admin/screens/schedules/create.tsx"),
          route("/:scheduleId/edit", "features/admin/screens/schedules/edit.tsx"),
        ]),
        ...prefix("/programs", [
          index("features/admin/screens/programs/list.tsx"),
          route("/new", "features/admin/screens/programs/create.tsx"),
          route("/:programId", "features/admin/screens/programs/detail.tsx"),
          route("/:programId/edit", "features/admin/screens/programs/edit.tsx"),
        ]),
        ...prefix("/instructors", [
          index("features/admin/screens/instructors/list.tsx"),
          route("/new", "features/admin/screens/instructors/create.tsx"),
          route("/:instructorId/edit", "features/admin/screens/instructors/edit.tsx"),
        ]),
        ...prefix("/notifications", [
          index("features/notifications/screens/list.tsx"),
          route("/templates", "features/notifications/screens/templates.tsx"),
          route("/:notificationId", "features/notifications/screens/detail.tsx"),
        ]),
        route("/organization", "features/admin/screens/organization.tsx"),
        route("/settings", "features/admin/screens/settings.tsx"),
        route("/account", "features/admin/screens/account.tsx"),
      ]),
    ]),
  ]),

  // Super Admin Routes
  layout("core/layouts/private.layout.tsx", { id: "private-super-admin" }, [
    layout("features/super-admin/layouts/super-admin.layout.tsx", [
      ...prefix("/super-admin", [
        index("features/super-admin/screens/dashboard.tsx"),
        route("/templates", "features/super-admin/screens/templates.tsx"),
        route("/org/:orgId", "features/super-admin/screens/org-dashboard.tsx"),
      ]),
    ]),
  ]),

  // Admin API Routes
  ...prefix("/api/admin", [
    ...prefix("/students", [
      route("/create", "features/admin/api/students/create.tsx"),
      route("/:studentId/update", "features/admin/api/students/update.tsx"),
      route("/:studentId/graduate", "features/admin/api/students/graduate.tsx"),
      route("/:studentId/delete", "features/admin/api/students/delete.tsx"),
      route("/:studentId/invite", "features/admin/api/students/invite.tsx"),
    ]),
    ...prefix("/schedules", [
      route("/create", "features/admin/api/schedules/create.tsx"),
      route("/:scheduleId/update", "features/admin/api/schedules/update.tsx"),
      route("/:scheduleId/delete", "features/admin/api/schedules/delete.tsx"),
    ]),
    ...prefix("/programs", [
      route("/create", "features/admin/api/programs/create.tsx"),
      route("/:programId/update", "features/admin/api/programs/update.tsx"),
      route("/:programId/delete", "features/admin/api/programs/delete.tsx"),
    ]),
    ...prefix("/instructors", [
      route("/create", "features/admin/api/instructors/create.tsx"),
      route("/:instructorId/update", "features/admin/api/instructors/update.tsx"),
      route("/:instructorId/delete", "features/admin/api/instructors/delete.tsx"),
    ]),
    route("/settings", "features/admin/api/settings/update.tsx"),
    route("/organization", "features/admin/api/organization/update.tsx"),
  ]),

  // Student Schedule Routes
  layout("core/layouts/private.layout.tsx", { id: "private-schedules" }, [
    layout("features/users/layouts/dashboard.layout.tsx", { id: "dashboard-schedules" }, [
      ...prefix("/my-schedules", [
        index("features/schedules/screens/calendar.tsx"),
        route("/list", "features/schedules/screens/my-schedules.tsx"),
      ]),
    ]),
  ]),

  // Student Schedule API Routes
  ...prefix("/api/schedules", [
    route("/create", "features/schedules/api/create-schedule.tsx"),
    route("/:scheduleId/delete", "features/schedules/api/delete-schedule.tsx"),
  ]),

  ...prefix("/legal", [route("/:slug", "features/legal/screens/policy.tsx")]),
] satisfies RouteConfig;
