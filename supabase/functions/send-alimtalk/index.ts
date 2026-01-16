/**
 * Supabase Edge Function: send-alimtalk
 *
 * Sends Kakao AlimTalk messages via Solapi API.
 * Called by Cron job or directly for immediate sends.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SOLAPI_API_KEY = Deno.env.get("SOLAPI_API_KEY")!;
const SOLAPI_API_SECRET = Deno.env.get("SOLAPI_API_SECRET")!;
const SOLAPI_PFID = Deno.env.get("SOLAPI_PFID")!;
const SOLAPI_SENDER_PHONE = Deno.env.get("SOLAPI_SENDER_PHONE")!;

// In-app notification target template types
const IN_APP_NOTIFICATION_TYPES = [
  "STD_BOOK_ADMIN",
  "STD_CANCEL_ADMIN",
  "SYS_CONSULT_ADMIN",
];

// In-app notification message templates
const IN_APP_MESSAGE_TEMPLATES: Record<string, (vars: Record<string, string>) => string> = {
  STD_BOOK_ADMIN: (vars) => `${vars.student_name}님이 예약 하였습니다.`,
  STD_CANCEL_ADMIN: (vars) => `${vars.student_name}님이 취소 하였습니다.`,
  SYS_CONSULT_ADMIN: (vars) => `${vars.requester_name}님이 상담신청을 요청하였습니다.`,
};

interface AlimtalkPayload {
  notification_id: number;
  template_code?: string;
  recipient_phone?: string;
  variables?: Record<string, string>;
  send_mode?: "TEST" | "LIVE";
  is_immediate?: boolean;
}

Deno.serve(async (req) => {
  try {
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const payload: AlimtalkPayload = await req.json();

    const { notification_id } = payload;

    if (!notification_id) {
      return new Response(
        JSON.stringify({ error: "notification_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Update status to SENDING (for concurrent call prevention)
    const { data: notification, error: updateError } = await adminClient
      .from("notifications")
      .update({ alimtalk_status: "PENDING" }) // Keep PENDING until actual send
      .eq("notification_id", notification_id)
      .eq("alimtalk_status", "PENDING")
      .select(`
        *,
        organization:organizations(name)
      `)
      .single();

    if (updateError || !notification) {
      // Already processed or not found
      return new Response(
        JSON.stringify({ skipped: true, reason: "Already processed or not found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Get template info
    const { data: template } = await adminClient
      .from("super_templates")
      .select("type, kakao_template_code")
      .eq("kakao_template_code", notification.alimtalk_template_code)
      .single();

    // 3. Prepare Solapi request
    const isTestMode = notification.send_mode === "TEST";
    const variables = notification.alimtalk_variables as Record<string, string>;

    try {
      // 4. Send via Solapi API
      const result = await sendSolapiAlimtalk({
        to: notification.recipient_phone,
        templateId: notification.alimtalk_template_code,
        variables,
        isTest: isTestMode,
      });

      // 5. Update notification status to SENT
      await adminClient
        .from("notifications")
        .update({
          alimtalk_status: "SENT",
          alimtalk_message_id: result.messageId,
          alimtalk_sent_at: new Date().toISOString(),
        })
        .eq("notification_id", notification_id);

      // 6. Create in-app notification if applicable
      if (template && IN_APP_NOTIFICATION_TYPES.includes(template.type)) {
        const messageTemplate = IN_APP_MESSAGE_TEMPLATES[template.type];
        if (messageTemplate) {
          await adminClient.from("in_app_notifications").insert({
            organization_id: notification.organization_id,
            notification_id: notification_id,
            message: messageTemplate(variables),
            template_type: template.type,
          });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          notification_id,
          message_id: result.messageId,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (sendError: unknown) {
      // 7. Update notification status to FAILED
      const error = sendError as { code?: string; message?: string };
      await adminClient
        .from("notifications")
        .update({
          alimtalk_status: "FAILED",
          alimtalk_error_code: error.code || "UNKNOWN",
          alimtalk_error_message: error.message || "Unknown error",
        })
        .eq("notification_id", notification_id);

      return new Response(
        JSON.stringify({
          success: false,
          notification_id,
          error: error.message,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Send AlimTalk via Solapi API
 */
async function sendSolapiAlimtalk(params: {
  to: string;
  templateId: string;
  variables: Record<string, string>;
  isTest: boolean;
}): Promise<{ messageId: string }> {
  const { to, templateId, variables, isTest } = params;

  // Build message with variables replaced
  const timestamp = new Date().toISOString();
  const salt = crypto.randomUUID();

  // Generate HMAC signature for Solapi API
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SOLAPI_API_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = encoder.encode(timestamp + salt);
  const signature = await crypto.subtle.sign("HMAC", key, data);
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const body = {
    message: {
      to,
      from: SOLAPI_SENDER_PHONE,
      kakaoOptions: {
        pfId: SOLAPI_PFID,
        templateId,
        variables,
        ...(isTest && { disableSms: true }), // Disable SMS fallback in test mode
      },
    },
  };

  const response = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${timestamp}, salt=${salt}, signature=${signatureHex}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw {
      code: errorData.errorCode || "SOLAPI_ERROR",
      message: errorData.errorMessage || "Solapi API error",
    };
  }

  const result = await response.json();
  return { messageId: result.groupId || result.messageId || "unknown" };
}
