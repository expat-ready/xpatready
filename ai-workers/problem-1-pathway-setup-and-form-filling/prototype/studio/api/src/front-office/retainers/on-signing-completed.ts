// FO-6 part 3 (contracts §7 §2.6; rows rev 16.16): the retainers module's answer to `signing.completed`. A retainer's
// completion makes its prospect WON (E_SIGNED) once, through the one win (sales/prospects.ts `winProspect`), in the
// completion's own transaction; a prospect already won (a second completion, a paper sign, a Convert) gets nothing; a
// consultation agreement never makes a client. The signing service calls it before it writes the event row, so the
// event stays the last write of the transaction (contracts §0.5).
import type { AuditPort } from "../../../../ports/audit.ts";
import type { SigningCompletedPayload } from "../../../../ports/events/signing.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import type { Tx } from "../sales/common.ts";
import { winProspect } from "../sales/prospects.ts";

export const SIGNING_ACTOR = "system:signing-webhook";

/** True when this completion made the prospect WON. `firmKey` is the firm's key (prospect.won carries it). */
export async function onSigningCompleted(tx: Tx, audit: AuditPort<Tx>, firm: { id: string; key: string }, ev: SigningCompletedPayload, at: Date): Promise<boolean> {
  if (ev.documentKind !== "RETAINER" || !ev.prospectId) return false;
  // The win is the representative's act on our server (stage move's actor); the audit line names the webhook door.
  const ctx: StaffContext = { staffId: ev.representativeStaffId, firmId: firm.id, firmKey: firm.key, roles: [], keys: [], duties: [], authTime: 0, via: "local" };
  const prospectId = ev.prospectId;
  const won = await winProspect(tx, ctx, prospectId, { via: "E_SIGNED", at, retainerId: ev.retainerId, audit: (p) =>
    audit.record(tx, { firmId: firm.id, actor: SIGNING_ACTOR, action: "prospect.won", entity: "fo_prospect", entityKey: prospectId, summary: "Won: retainer signed electronically",
      detail: { prospectId, wonVia: "E_SIGNED", retainerId: ev.retainerId, requestId: ev.requestId },
      before: { stageKind: p.kind, stage: p.key, wonVia: p.won_via }, after: { stageKind: "WON", wonVia: "E_SIGNED", retainerId: ev.retainerId } }) });
  return won !== null;
}
