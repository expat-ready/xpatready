// FO-5d (1) (BACKLOG row FO-5d; AG-5-68, AG-5-21, AG05-D2(6), AG05-D4(7)(8); R1.55 W3 "a decline kept with its reason"): one
// decline, from the client's public door (./door.ts, with their own reason) or from the provider's `declined` event
// (./service.ts, with none). Called inside the caller's transaction, after the request's row lock, on a live request and a
// signer who has neither signed nor declined (the caller checked both under that lock).
//   * One decline declines all (AG05-D2(6)): the signer's `declined_at` and `decline_reason` are written once (the database
//     holds the reason only beside `declined_at`, and never changes either after: 20261125150000_front-office-signing__fo5d_decline_reason); the
//     request is DECLINED and ended, so every link of it is dead; signatures already given stay in the history; nobody else
//     is emailed.
//   * The agreement (a retainer or a consultation agreement, both fo_retainer rows): while it still shows this request's
//     version, SENT or VIEWED becomes DECLINED and that version ends (DECLINED). After the client signed only the firm's
//     signer can decline (through the provider): FO-5's states move CLIENT_SIGNED only to SIGNED, WITHDRAWN or
//     SIGNED_OFFLINE, so it ends WITHDRAWN with that reason (as FO-3c's own handler does).
//   * A client's decline of a retainer tells the prospect's owner, or the representative when there is none, by one "needs
//     you" item (AG-5-68 r4; kind `retainer-declined`, item `retainer`); a consultation agreement, another document or the
//     firm's own signer declining tells nobody (r6).
//   * One audit line for the request and one for the agreement, in this transaction; the reason is kept on the signer and
//     shown on the agreement's signing state, never copied into an audit line or an event (the booking's cancel reason rule).
// The provider's envelope is cancelled by the caller after the commit (the door's decline; the provider's own decline has
// ended it already). Every word is Sample. Legal points: Unconfirmed: no counsel.
import type { Prisma } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import { NOTIFICATION_KIND, type NotificationPort } from "../../../../ports/notifications.ts";
import { withFirm } from "../../platform/firm-scope.ts";

type Tx = Prisma.TransactionClient;
/** The reason's limit after trimming (AG05-D4(7)), in characters (code points, as the database's char_length counts). */
export const DECLINE_REASON_MAX = 500;
/** Review rounds 1-2 (break m2-m5, round 2 Major and m10): control characters except tab, line feed and carriage return
 *  (a NUL included), the zero-width space, the byte-order mark and the bidi overrides (U+202A-202E) are removed; joiners
 *  and direction marks that carry meaning (ZWJ, ZWNJ, LRM, RLM, U+2060-2069) are kept, so the client's words stay word for
 *  word; then every kind of whitespace is trimmed from both ends. Text that is only marks and whitespace is no reason.
 *  The database's check (20261125150000) holds the same rule. Counted in characters, never cut mid-character. */
export function cleanReason(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  const t = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u202A-\u202E\uFEFF]/g, "").replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, "");
  return t.replace(/[\u200C-\u200F\u2060-\u2069\s\u00A0]/g, "") ? t : null;
}
export const reasonLength = (t: string) => [...t].length;
export const FIRM_DECLINED_AFTER_CLIENT = "The firm's signer declined to sign after the client signed.";

export type DeclineInput = {
  firmId: string;
  request: { id: string; documentKind: string; documentId: string; documentVersion: number; status: string };
  signer: { id: string; role: string };
  /** Trimmed, 1-500 characters, or null (none given, or the provider's event). */
  reason: string | null;
  actor: string;
  audit: AuditPort<Tx>;
  now: Date;
  notifications?: NotificationPort<Tx> | null;
};

/** Applies one decline (see the file's head). Answers what the agreement became, or null when it shows another version. */
export async function applyDecline(tx: Tx, d: DeclineInput): Promise<{ agreement: "DECLINED" | "WITHDRAWN" | null }> {
  const { firmId, request: q, signer: s, now } = d;
  const clean = cleanReason(d.reason), reason = clean ? [...clean].slice(0, DECLINE_REASON_MAX).join("") : null;
  await tx.foSigner.update({ where: { id: s.id }, data: { declinedAt: now, declineReason: reason } });
  await tx.foSignatureRequest.update({ where: { id: q.id }, data: { status: "DECLINED", endedAt: now } });
  const who = s.role === "CLIENT" ? "client" : "representative";
  await d.audit.record(tx, { firmId, actor: d.actor, action: "signing.declined", entity: "fo_signature_request", entityKey: q.id,
    summary: `Declined by the ${who}${reason ? ", with a reason" : ""}: the signing request ended for everyone`,
    detail: { requestId: q.id, documentKind: q.documentKind, documentId: q.documentId, version: q.documentVersion, signerId: s.id, signerRole: s.role, withReason: !!reason },
    before: { status: q.status }, after: { status: "DECLINED", withReason: !!reason } });
  if (q.documentKind !== "RETAINER" && q.documentKind !== "CONSULTATION") return { agreement: null };

  const [r] = await tx.$queryRaw<{ id: string; kind: string; status: string; current_version: number; prospect_id: string | null; representative_staff_id: string }[]>`
    select id::text, kind::text, status::text, current_version, prospect_id::text, representative_staff_id::text from fo_retainer
    where firm_id = ${firmId}::uuid and id = ${q.documentId}::uuid for update`;
  if (!r || r.current_version !== q.documentVersion || !["SENT", "VIEWED", "CLIENT_SIGNED"].includes(r.status)) return { agreement: null };
  const after = r.status === "CLIENT_SIGNED" ? "WITHDRAWN" as const : "DECLINED" as const;
  await tx.foRetainerVersion.updateMany({ where: { firmId, retainerId: r.id, n: r.current_version, endedAt: null }, data: { endedAt: now, endReason: after } });
  await tx.foRetainer.update({ where: { id: r.id }, data: after === "WITHDRAWN" ? { status: "WITHDRAWN", withdrawnAt: now, withdrawnBy: d.actor, withdrawnReason: FIRM_DECLINED_AFTER_CLIENT } : { status: "DECLINED" } });
  const what = r.kind === "RETAINER" ? "Retainer" : "Consultation agreement";
  await d.audit.record(tx, { firmId, actor: d.actor, action: r.kind === "RETAINER" ? "retainer.declined" : "consultation_agreement.declined", entity: "fo_retainer", entityKey: r.id,
    summary: after === "DECLINED" ? `${what} declined by the ${who} (version ${r.current_version})${reason ? ", with a reason" : ""}` : `${what} withdrawn: ${FIRM_DECLINED_AFTER_CLIENT}`,
    detail: { retainerId: r.id, requestId: q.id, version: r.current_version, signerRole: s.role, withReason: !!reason },
    before: { status: r.status }, after: { status: after, withReason: !!reason } });

  // Only a client's decline of a retainer tells anyone (AG-5-68 r4, r6): the firm's own signer declining is the firm's act.
  if (r.kind === "RETAINER" && after === "DECLINED" && s.role === "CLIENT" && d.notifications) {
    const owner = r.prospect_id ? (await tx.foProspect.findFirst({ where: { firmId, id: r.prospect_id }, select: { ownerStaffId: true } }))?.ownerStaffId ?? null : null;
    const to = owner ?? r.representative_staff_id;
    await withFirm(firmId, () => d.notifications!.notify(tx, { staffId: to }, NOTIFICATION_KIND.RETAINER_DECLINED, { kind: "retainer", id: r.id }));
  }
  return { agreement: after };
}
