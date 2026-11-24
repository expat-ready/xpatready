// PF-6 part 2a (concept pf-6-staff r2 §3, §4, §6): the shapes the staff screens read from PF-4/PF-4b/PF-6r's routes,
// parsed at the edge, and the six starter roles in SA-06 Appendix C's plain words. No imports from the app, so a test
// reads it in Node. The screens show what the API answers; the server decides every rule.
import { z } from "zod";

/** `booked`: the limit is a lower plan booked for the renewal, named in `plan` (QA-774). */
export const Seats = z.object({ used: z.number(), limit: z.number(), plan: z.string().nullable(), booked: z.boolean().optional(), line: z.string() });
export const StaffRow = z.object({
  id: z.string(), displayName: z.string(), email: z.string(), roles: z.array(z.string()), status: z.string(),
  twoStep: z.object({ method: z.string().nullable() }).passthrough().nullable(), lastSignInAt: z.string().nullable(), licensed: z.boolean(),
});
export type StaffRow = z.infer<typeof StaffRow>;
export const StaffList = z.object({ staff: z.array(StaffRow), seats: Seats });
export const Person = StaffRow.extend({ deactivationReason: z.string().nullable() });
export const Invitation = z.object({ id: z.string(), email: z.string(), roles: z.array(z.string()), status: z.string(), createdAt: z.string(), expiresAt: z.string() });
export type Invitation = z.infer<typeof Invitation>;
export const Invitations = z.object({ invitations: z.array(Invitation) });
export const RoleKey = z.object({ key: z.string(), class: z.enum(["GENERAL", "MONEY", "LICENCE"]), scope: z.string() });
export const Role = z.object({ role: z.string(), keys: z.array(RoleKey), moneyKeys: z.number(), licenceKeys: z.number() });
export type Role = z.infer<typeof Role>;
export const Roles = z.object({ roles: z.array(Role) });

/** SA-06 Appendix C, "Shape" column, in plain words (concept §4: never AG-01's older example line, never a key). */
export const ROLE_WORDS: Record<string, { label: string; can: string; cannot: string }> = {
  OWNER: { label: "Owner", can: "Everything, including the Owner-only actions: cancel the plan, connect the payment account, the firm profile, the firm data export, support access, switching AI", cannot: "Nothing is held back" },
  ADMIN: { label: "Admin", can: "Staff, roles, settings and billing payments; everything else except the Owner-only actions", cannot: "Owner-only actions; case and form sign-off and reopen; plan upgrade, downgrade and billing details; legal settings" },
  CASE_MANAGER: { label: "Case Manager", can: "All case work, including approvals, assigning, exports and dashboards", cannot: "Staff, roles, settings or billing set-up" },
  CASE_OFFICER: { label: "Case Officer", can: "Day-to-day work on cases, clients, prospects, documents, notes, tasks and forms; passes critical warnings", cannot: "Other approvals, settings or exports" },
  BILLING_FINANCE: { label: "Billing and finance", can: "Billing work, billing views and financial reports, time entries, reminders; reads notes", cannot: "Case work" },
  READ_ONLY: { label: "Read only", can: "View, list and open records; their own reports and time entries", cannot: "Change anything" },
};
export const roleLabel = (r: string) => ROLE_WORDS[r]?.label ?? r;
/** The one always-visible line under a role choice (AG-1-69). */
export const roleLine = (roles: readonly string[]) => roles.map((r) => `${roleLabel(r)}: ${ROLE_WORDS[r]?.can ?? ""} · not: ${ROLE_WORDS[r]?.cannot ?? ""}`).join("; ");
/** A permission key in words (agent/billing-report:view → "Billing report: view"); shown only in the money and licence groups. */
export const keyWords = (k: string) => { const [noun, verb] = k.replace(/^agent\//, "").split(":"); const n = noun.replace(/-/g, " "); return `${n.charAt(0).toUpperCase()}${n.slice(1)}: ${(verb ?? "").replace(/[-.]/g, " ")}`; };

/** The roles a person may give: those whose every key they hold (SA-6-29), Owner only by an Owner and never at invite
 *  (BR-1). The server checks the same and its refusal is shown word for word; this only keeps the picker honest. */
export function givable(roles: readonly Role[], me: { roles: readonly string[]; keys: readonly string[] }, atInvite: boolean) {
  const held = new Set(me.keys);
  return roles.filter((r) => (r.role === "OWNER" ? !atInvite && me.roles.includes("OWNER") : r.keys.every((k) => held.has(k.key)))).map((r) => r.role);
}
/** The money keys the added roles bring, counted once (as PF-6m's audit line counts them). */
export function moneyKeysAdded(roles: readonly Role[], added: readonly string[]) {
  return new Set(roles.filter((r) => added.includes(r.role)).flatMap((r) => r.keys.filter((k) => k.class === "MONEY").map((k) => k.key))).size;
}
export const moneyLine = (name: string, n: number) => `This gives ${name} ${n} money ${n === 1 ? "permission" : "permissions"}.`;
export const STATUS_WORDS: Record<string, string> = { ACTIVE: "Active", SUSPENDED: "Suspended", DEACTIVATED: "Inactive", PENDING: "Invited", EXPIRED: "Invitation expired" };
export const shownName = (s: { displayName: string; status: string }) => (s.status === "DEACTIVATED" ? `(Inactive) ${s.displayName}` : s.displayName);
