// PF-4s (SA-7-1, SA-7-11, SA-7-14; SA-6-4, BR-4): every route under /api/system/ is our own staff's, and declares what it
// needs. The system guard (guard.ts) refuses anything it was not given (default deny). A route declares one of:
//   @SystemKeys("system/firm:read", …)  the signed-in ExpatReady staff member must hold every key named;
//   @AnySystemStaff("why")              any signed-in ExpatReady staff member (their own identity);
//   @SystemSignIn("why")                no session yet: the sign-in door itself (the local stand-in only).
// A route under /api/system/ with none of these stops the start-up with its name, as does one of these on any other path.
// These routes accept system/* keys only; firm routes accept agent/* keys only (identity/keys.ts): the two never mix.
// @SystemReason() marks a route whose call must carry a written reason (`reason` in the body); it lands on the audit line.
import { SetMetadata } from "@nestjs/common";
import { unauthorized } from "../identity/keys.ts";

export const SYSTEM_ACCESS = "platform:system-access";
export type SystemAccess = { kind: "keys"; keys: string[] } | { kind: "any-staff"; why: string } | { kind: "sign-in"; why: string };

/** The paths the system guard owns, in any letter case (Express routes ignore case). A match of its own, apart from the
 *  firm guard's (identity/keys.ts PLATFORM_PATH). */
export const SYSTEM_PATH = /^\/api\/system(\/|$)/i;
export const SYSTEM_KEY = /^system\/[a-z][a-z0-9-]*:[a-z][a-z0-9.-]*$/;

const declare = (a: SystemAccess) => SetMetadata(SYSTEM_ACCESS, a);
export const SystemKeys = (...keys: string[]) => {
  if (!keys.length) throw new Error("SystemKeys: name at least one key (or use AnySystemStaff with a reason)");
  const other = keys.filter((k) => !SYSTEM_KEY.test(k));
  if (other.length) throw new Error(`SystemKeys: our own staff's routes accept only system/* keys (SA-6-4): ${other.join(", ")}`);
  return declare({ kind: "keys", keys });
};
export const AnySystemStaff = (why: string) => declare({ kind: "any-staff", why });
export const SystemSignIn = (why: string) => declare({ kind: "sign-in", why });

export const SYSTEM_REASON = "platform:system-reason";
export const SystemReason = () => SetMetadata(SYSTEM_REASON, true);
/** A reason's length (Sample: no requirement gives one). */
export const REASON_MAX = 500;

/** The six fixed staff roles (SA7-D8: codes and final display names; seeded by the migration, read from there). */
export const SYSTEM_ROLES = Object.freeze({
  "platform-owner": "Platform Owner", "platform-admin": "Admin", "platform-support": "Support",
  "platform-billing-ops": "Billing", "platform-content-publisher": "Content publisher", "platform-auditor": "Auditor",
} as const);
export type SystemRole = keyof typeof SYSTEM_ROLES;

/** What the system guard puts on the request (req.systemStaff). It has no firm, by design (SA-7-1). */
export type SystemStaffContext = { staffId: string; name: string; email: string; roles: string[]; keys: string[]; authTime: number; via: "local" | "cognito" };
export const systemStaffOf = (req: { systemStaff?: SystemStaffContext }): SystemStaffContext => {
  if (!req.systemStaff) return unauthorized("Sign in first: this needs an ExpatReady staff member's session (a bearer token).");
  return req.systemStaff;
};
