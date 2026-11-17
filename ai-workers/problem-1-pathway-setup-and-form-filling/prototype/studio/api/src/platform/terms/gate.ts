// PF-5t part 1 (checklist row 100; Lead B's brief rev 16.61): the guard's one question to the terms service, kept apart
// so guard.ts needs no import of the service (and so of core.ts). The guard asks it after sign-in, once per request.
import { problem, type StaffContext } from "../identity/keys.ts";

export const TERMS_GATE = "platform:terms-gate";
export interface TermsGate {
  /** True when the person has a current terms version they must accept before anything else (TERMS_PENDING). */
  mustAccept(staff: StaffContext): Promise<boolean>;
}

/** The routes a person with pending terms can still call (method and declared path, as the guard reads them from the
 *  route's own metadata, so letter case or a trailing slash in the request cannot widen it): who am I, the terms
 *  themselves and sign-out. Everything else under the guard answers 428 TERMS_PENDING. */
export const TERMS_OPEN_ROUTES: ReadonlySet<string> = new Set([
  "GET /api/platform/me",
  "GET /api/platform/me/terms",
  "POST /api/platform/me/terms/accept",
  "POST /api/platform/session/sign-out",
]);
export const TERMS_PENDING = "Please accept the updated terms to continue.";
/** The guard's answer while terms are pending: 428 TERMS_PENDING. */
export const termsPending = (): never => problem(428, "Accept the updated terms", TERMS_PENDING, { code: "TERMS_PENDING" });
