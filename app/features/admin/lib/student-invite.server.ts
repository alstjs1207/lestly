import { createHash, randomBytes } from "node:crypto";

import { STUDENT_INVITE_TTL_DAYS } from "./student-invite.ts";

export { STUDENT_INVITE_TTL_DAYS };

export function createStudentInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function hashStudentInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getStudentInviteExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + STUDENT_INVITE_TTL_DAYS);
  return expiresAt;
}
