// PF-4: the audit lines of staff, roles, invitations and sessions. AUD-1m part 2b (PF-0a, Lead 94's ruling on #2289):
// each line goes through AuditPort.record (platform/audit/audit-event.ts) inside the caller's own transaction, fail-closed:
// a refused or failed line rolls the change back. The adapter writes the platform's own workspace row (key
// "platform-audit"), so the demo reset never deletes a platform line (P-571 (1); PF-3 review m3 / B-6); it fills firm_id,
// actor_type and correlation, keeps detail.firmId, and refuses a line naming another firm than the request's. The strict
// AuditEntry holds: ids and facts only in detail, so a free-text reason holding an email address is refused (the one
// behaviour change). R1.8 (QA-594, P-687): each line carries the row's before and after values in full (a licence
// number included, shown only to holders of the audit permission); never a secret.
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditEntry, AuditValues } from "../../../../ports/audit.ts";
import { auditEvent, platformAuditWorkspaceId as raceSafeWorkspaceId } from "../audit/audit-event.ts";

type Tx = Prisma.TransactionClient;
export const PLATFORM_AUDIT_WORKSPACE = "platform-audit";

/** The platform's audit workspace row: the race-safe maker of PF-0p (audit-event.ts, review M1; no cache), so two first
 *  writers in parallel never fail on the unique key (PF-6m break F2). */
export async function platformAuditWorkspaceId(db: PrismaClient | Tx): Promise<string> {
  return raceSafeWorkspaceId(db as Tx);
}

export type AuditLine = { firmId: string; firmKey: string; actor: string; action: string; entityKey: string; summary: string; detail: Record<string, unknown>;
  /** R1.8 (QA-594): the row's values before (null: a create) and after (null: a delete) the change. */
  before: AuditValues | null; after: AuditValues | null };

/** The fields both lines share: the firm's key leads the summary and stays in detail, as before. */
const lineOf = (l: AuditLine) => ({ firmId: l.firmId, actor: l.actor, action: l.action, entityKey: l.entityKey, summary: `Firm ${l.firmKey}: ${l.summary}`.slice(0, 600),
  detail: { firmKey: l.firmKey, ...l.detail } as AuditEntry["detail"] });

/** One audit line about a staff member (status, roles, licence record, sessions). */
export async function auditStaff(tx: Tx, l: AuditLine) {
  await auditEvent.record(tx, { entity: "platform_staff", ...lineOf(l), before: l.before, after: l.after });
}

/** One audit line about an invitation. */
export async function auditInvitation(tx: Tx, l: AuditLine) {
  await auditEvent.record(tx, { entity: "platform_invitation", ...lineOf(l), before: l.before, after: l.after });
}

/** The actor word of a staff member on audit lines and events (their staff id; the Sample staff's actor id is in detail). */
export const actorWord = (staffId: string) => `staff:${staffId}`;
