/**
 * Email Notification Cron Processing API Endpoint
 *
 * This endpoint is called by a cron job every 5 minutes to:
 * 1. Process pending email notifications
 * 2. Send emails using Resend
 * 3. Update notification status
 *
 * NOTE: After running the 0014_email_notifications.sql migration,
 * regenerate types with: npx supabase gen types typescript
 */
import type { Route } from "./+types/email-cron";

import * as Sentry from "@sentry/node";
import { data } from "react-router";
import NotificationEmail from "transactional-emails/emails/notification";

import resendClient from "~/core/lib/resend-client.server";
import adminClient from "~/core/lib/supa-admin-client.server";

/**
 * Email subject templates by notification type
 */
const EMAIL_SUBJECTS: Record<string, (vars: Record<string, string>) => string> =
  {
    STD_BOOK_ADMIN: (vars) =>
      `[수업 예약] ${vars.student_name || "수강생"}님이 예약하였습니다`,
    STD_CANCEL_ADMIN: (vars) =>
      `[수업 취소] ${vars.student_name || "수강생"}님이 취소하였습니다`,
    ADM_BOOK_STUDENT: (vars) =>
      `[수업 예약 안내] ${vars.program_title || ""} 클래스가 예약되었습니다`,
    ADM_CANCEL_STUDENT: (vars) =>
      `[수업 취소 안내] ${vars.program_title || ""} 클래스가 취소되었습니다`,
    SYS_REMIND_STUDENT: (vars) =>
      `[수업 리마인더] ${vars.program_title || "수업"} 안내`,
  };

/**
 * Notification with email fields (will be available after migration)
 */
interface PendingEmailNotification {
  notification_id: number;
  recipient_email: string | null;
  recipient_name: string | null;
  alimtalk_template_code: string | null;
  alimtalk_variables: Record<string, string> | null;
  scheduled_send_at: string | null;
  organization_id: string;
}

/**
 * Helper to update notification email status
 * Uses type assertion to work around missing columns in generated types
 */
async function updateEmailStatus(
  notificationId: number,
  status: "PENDING" | "SENT" | "FAILED" | "SKIPPED",
  extra?: { email_sent_at?: string; email_error_message?: string },
) {
  const updateData = {
    email_status: status,
    ...extra,
  };

  await (
    adminClient.from("notifications") as unknown as {
      update: (data: typeof updateData) => {
        eq: (col: string, val: number) => Promise<unknown>;
      };
    }
  )
    .update(updateData)
    .eq("notification_id", notificationId);
}

/**
 * API endpoint action handler for processing email notifications
 */
export async function action({ request }: Route.ActionArgs) {
  // Security check: Verify this is a POST request with the correct secret
  if (
    request.method !== "POST" ||
    request.headers.get("Authorization") !== process.env.CRON_SECRET
  ) {
    return data(null, { status: 401 });
  }

  let processedCount = 0;
  let sentCount = 0;
  let failedCount = 0;

  try {
    // ==========================================
    // PART 1: Query pending email notifications
    // Note: recipient_email and email_status are new columns from 0014_email_notifications.sql
    // ==========================================
    // Note: 이메일은 scheduled_send_at과 무관하게 즉시 발송
    // 알림톡만 배치 발송 시간을 적용하고, 이메일은 모든 PENDING 상태를 즉시 처리
    const { data: pendingEmails, error: queryError } = (await adminClient
      .from("notifications")
      .select(
        `
        notification_id,
        recipient_email,
        recipient_name,
        alimtalk_template_code,
        alimtalk_variables,
        scheduled_send_at,
        organization_id,
        organizations(name)
      `,
      )
      .eq("type", "ALIMTALK")
      .eq("email_status" as never, "PENDING")
      .limit(50)) as unknown as {
      data: PendingEmailNotification[] | null;
      error: Error | null;
    };

    if (queryError) {
      Sentry.captureException(queryError);
      return data({ error: "Query failed" }, { status: 500 });
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return data({ processed: 0, sent: 0, failed: 0 }, { status: 200 });
    }

    // ==========================================
    // PART 2: Get template content mapping
    // ==========================================
    const templateCodes = [
      ...new Set(
        pendingEmails.map((e) => e.alimtalk_template_code).filter(Boolean),
      ),
    ] as string[];

    const { data: templates, error: templateError } = await adminClient
      .from("super_templates")
      .select("kakao_template_code, type, content, name")
      .in("kakao_template_code", templateCodes);

    if (templateError) {
      Sentry.captureException(templateError);
      return data({ error: "Template query failed" }, { status: 500 });
    }

    const templateMap = new Map(
      templates?.map((t) => [t.kakao_template_code, t]) || [],
    );

    // ==========================================
    // PART 3: Process each email notification
    // ==========================================
    for (const notification of pendingEmails) {
      processedCount++;

      // Skip if no email address
      if (!notification.recipient_email) {
        await updateEmailStatus(notification.notification_id, "SKIPPED", {
          email_error_message: "No email address",
        });
        continue;
      }

      // Get template
      const template = templateMap.get(
        notification.alimtalk_template_code || "",
      );
      if (!template) {
        await updateEmailStatus(notification.notification_id, "FAILED", {
          email_error_message: "Template not found",
        });
        failedCount++;
        continue;
      }

      // Skip SYS_CONSULT_ADMIN (no email for consultation requests)
      if (template.type === "SYS_CONSULT_ADMIN") {
        await updateEmailStatus(notification.notification_id, "SKIPPED", {
          email_error_message: "Consultation requests do not support email",
        });
        continue;
      }

      try {
        // Replace variables in content
        const variables = (notification.alimtalk_variables || {}) as Record<
          string,
          string
        >;
        let emailContent = template.content;

        // Replace #{variable_name} with actual values
        for (const [key, value] of Object.entries(variables)) {
          emailContent = emailContent.replace(
            new RegExp(`#\\{${key}\\}`, "g"),
            value || "",
          );
        }

        // Generate email subject
        const subjectGenerator = EMAIL_SUBJECTS[template.type];
        const emailSubject = subjectGenerator
          ? subjectGenerator(variables)
          : `[${template.name}] 알림`;

        // Send email
        const { error: sendError } = await resendClient.emails.send({
          from: "Lestly <hello@mail.lestly.io>",
          to: [notification.recipient_email],
          subject: emailSubject,
          react: NotificationEmail({
            title: emailSubject,
            content: emailContent,
          }),
        });

        if (sendError) {
          await updateEmailStatus(notification.notification_id, "FAILED", {
            email_error_message: sendError.message || "Send failed",
          });
          failedCount++;
          Sentry.captureException(sendError);
        } else {
          await updateEmailStatus(notification.notification_id, "SENT", {
            email_sent_at: new Date().toISOString(),
          });
          sentCount++;
        }
      } catch (error) {
        await updateEmailStatus(notification.notification_id, "FAILED", {
          email_error_message:
            error instanceof Error ? error.message : "Unknown error",
        });
        failedCount++;
        Sentry.captureException(error);
      }
    }
  } catch (error) {
    Sentry.captureException(
      error instanceof Error ? error : new Error(String(error)),
    );
    return data({ error: "Processing failed" }, { status: 500 });
  }

  return data(
    { processed: processedCount, sent: sentCount, failed: failedCount },
    { status: 200 },
  );
}
