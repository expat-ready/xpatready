// PF-4b (contracts §7 §1.2; AG-1-42; BR-5): the step-up check. A change that needs "Confirm it's you" is allowed only
// when the session's sign-in (`auth_time`, on StaffContext.authTime; AWS: "auth_time The authentication time, in Unix
// time format, that your user completed authentication", read 15 Nov 2026) is at most 5 minutes old; otherwise 401
// STEP_UP_REQUIRED, so the screen sends the person to sign in again and back. The local stand-in's re-sign-in is
// POST /api/platform/session/local (PF-4).
import { problem, type StaffContext } from "../keys.ts";

export const STEP_UP_SECONDS = 5 * 60;
export const STEP_UP_WORDS = "Confirm it's you: sign in again, then try once more.";

export function requireStepUp(actor: Pick<StaffContext, "authTime">, nowMs: number, what: string): void {
  if (nowMs / 1000 - actor.authTime > STEP_UP_SECONDS) problem(401, "Confirm it's you", `${STEP_UP_WORDS} ${what.charAt(0).toUpperCase()}${what.slice(1)} needs a sign-in in the last 5 minutes.`, { code: "STEP_UP_REQUIRED" });
}
