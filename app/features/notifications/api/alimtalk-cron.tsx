/**
 * AlimTalk Cron Processing API Endpoint
 *
 * This endpoint is called by a cron job every 5 minutes to:
 * 1. Process scheduled batch sends (ADM_BOOK/CANCEL templates)
 * 2. Check and send reminders (SYS_REMIND_STUDENT template)
 */
import type { Route } from "./+types/alimtalk-cron";

import * as Sentry from "@sentry/node";
import { data } from "react-router";

import adminClient from "~/core/lib/supa-admin-client.server";

const SUPABASE_FUNCTIONS_URL = process.env.SUPABASE_URL?.replace(
  ".supabase.co",
  ".supabase.co/functions/v1"
);

/**
 * API endpoint action handler for processing AlimTalk queue
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
  const now = new Date();

  try {
    // ==========================================
    // PART 1: Batch sends (ADM_BOOK/CANCEL)
    // Process notifications with scheduled_send_at <= NOW()
    // ==========================================
    const { data: pendingBatchMessages } = await adminClient
      .from("notifications")
      .select("notification_id")
      .eq("type", "ALIMTALK")
      .eq("alimtalk_status", "PENDING")
      .not("scheduled_send_at", "is", null)
      .lte("scheduled_send_at", now.toISOString())
      .limit(50);

    for (const msg of pendingBatchMessages || []) {
      await invokeSendAlimtalk(msg.notification_id);
      processedCount++;
    }

    // ==========================================
    // PART 2: Reminders (SYS_REMIND_STUDENT)
    // Check schedules where start_time - hours_before is within 5 min window
    // ==========================================

    // Get reminder template settings for all organizations
    const { data: reminderSettings } = await adminClient
      .from("super_templates")
      .select(
        `
        super_template_id,
        kakao_template_code,
        default_hours_before,
        organization_templates(
          organization_id,
          status,
          hours_before
        )
      `
      )
      .eq("type", "SYS_REMIND_STUDENT")
      .eq("status", "ACTIVE");

    for (const setting of reminderSettings || []) {
      // Process each organization's reminder settings
      for (const orgTemplate of setting.organization_templates || []) {
        if (orgTemplate.status !== "ACTIVE") continue;

        const hoursBeforeMs =
          (orgTemplate.hours_before || setting.default_hours_before || 24) *
          60 *
          60 *
          1000;

        // Target time range: NOW + hours_before ~ NOW + hours_before + 5min
        const targetStartMin = new Date(now.getTime() + hoursBeforeMs);
        const targetStartMax = new Date(
          now.getTime() + hoursBeforeMs + 5 * 60 * 1000
        );

        // Find schedules in the reminder window
        const { data: schedules } = await adminClient
          .from("schedules")
          .select(
            `
            schedule_id,
            organization_id,
            program_id,
            student_id,
            start_time,
            programs(title),
            organizations(name)
          `
          )
          .eq("organization_id", orgTemplate.organization_id)
          .gte("start_time", targetStartMin.toISOString())
          .lt("start_time", targetStartMax.toISOString());

        for (const schedule of schedules || []) {
          // Get student info
          const { data: student } = await adminClient
            .from("profiles")
            .select("name, phone")
            .eq("profile_id", schedule.student_id)
            .single();

          if (!student?.phone) continue;

          // Check for duplicate reminder
          const { data: existing } = await adminClient
            .from("notifications")
            .select("notification_id")
            .eq("schedule_id", schedule.schedule_id)
            .eq("alimtalk_template_code", setting.kakao_template_code)
            .eq("reminder_generated", true)
            .maybeSingle();

          if (existing) continue; // Already sent

          // Get organization and program names
          const orgName =
            (schedule.organizations as { name: string })?.name || "";
          const programTitle =
            (schedule.programs as { title: string })?.title || "미지정";

          // Create reminder notification
          const { data: newNotification } = await adminClient
            .from("notifications")
            .insert({
              organization_id: schedule.organization_id,
              type: "ALIMTALK",
              alimtalk_status: "PENDING",
              alimtalk_template_code: setting.kakao_template_code,
              recipient_phone: student.phone,
              recipient_name: student.name,
              recipient_profile_id: schedule.student_id,
              schedule_id: schedule.schedule_id,
              program_id: schedule.program_id,
              alimtalk_variables: {
                organization_name: orgName,
                program_title: programTitle,
                schedule_datetime: formatDateTime(schedule.start_time),
                student_name: student.name,
              },
              reminder_generated: true,
              send_mode: "LIVE",
            })
            .select()
            .single();

          if (newNotification) {
            // Immediately invoke send function for reminders
            await invokeSendAlimtalk(newNotification.notification_id);
            processedCount++;
          }
        }
      }

      // Also check organizations without custom settings (use default)
      const orgsWithSettings = (setting.organization_templates || []).map(
        (ot) => ot.organization_id
      );

      const hoursBeforeMs =
        (setting.default_hours_before || 24) * 60 * 60 * 1000;
      const targetStartMin = new Date(now.getTime() + hoursBeforeMs);
      const targetStartMax = new Date(
        now.getTime() + hoursBeforeMs + 5 * 60 * 1000
      );

      // Find schedules for organizations without custom settings
      let query = adminClient
        .from("schedules")
        .select(
          `
          schedule_id,
          organization_id,
          program_id,
          student_id,
          start_time,
          programs(title),
          organizations(name)
        `
        )
        .gte("start_time", targetStartMin.toISOString())
        .lt("start_time", targetStartMax.toISOString());

      if (orgsWithSettings.length > 0) {
        // Exclude organizations that have custom settings
        query = query.not(
          "organization_id",
          "in",
          `(${orgsWithSettings.join(",")})`
        );
      }

      const { data: defaultSchedules } = await query;

      for (const schedule of defaultSchedules || []) {
        const { data: student } = await adminClient
          .from("profiles")
          .select("name, phone")
          .eq("profile_id", schedule.student_id)
          .single();

        if (!student?.phone) continue;

        const { data: existing } = await adminClient
          .from("notifications")
          .select("notification_id")
          .eq("schedule_id", schedule.schedule_id)
          .eq("alimtalk_template_code", setting.kakao_template_code)
          .eq("reminder_generated", true)
          .maybeSingle();

        if (existing) continue;

        const orgName =
          (schedule.organizations as { name: string })?.name || "";
        const programTitle =
          (schedule.programs as { title: string })?.title || "미지정";

        const { data: newNotification } = await adminClient
          .from("notifications")
          .insert({
            organization_id: schedule.organization_id,
            type: "ALIMTALK",
            alimtalk_status: "PENDING",
            alimtalk_template_code: setting.kakao_template_code,
            recipient_phone: student.phone,
            recipient_name: student.name,
            recipient_profile_id: schedule.student_id,
            schedule_id: schedule.schedule_id,
            program_id: schedule.program_id,
            alimtalk_variables: {
              organization_name: orgName,
              program_title: programTitle,
              schedule_datetime: formatDateTime(schedule.start_time),
              student_name: student.name,
            },
            reminder_generated: true,
            send_mode: "LIVE",
          })
          .select()
          .single();

        if (newNotification) {
          await invokeSendAlimtalk(newNotification.notification_id);
          processedCount++;
        }
      }
    }
  } catch (error) {
    Sentry.captureException(
      error instanceof Error ? error : new Error(String(error))
    );
  }

  return data({ processed: processedCount }, { status: 200 });
}

/**
 * Invoke the send-alimtalk Edge Function
 */
async function invokeSendAlimtalk(notificationId: number): Promise<void> {
  try {
    await fetch(`${SUPABASE_FUNCTIONS_URL}/send-alimtalk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ notification_id: notificationId }),
    });
  } catch (error) {
    Sentry.captureException(
      error instanceof Error ? error : new Error(String(error))
    );
  }
}

/**
 * Format datetime for template variables
 */
function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kstDate.toISOString().slice(0, 16).replace("T", " ");
}
