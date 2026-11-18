// PF-0p (rows rev 16; P-600: the interim AuditPort adapter is OK), AUD-1b (R1.8 part 2; SA-11-2, AG-13-40, P-607 (3)):
// AuditPort over audit_event. audit_event.workspace_id is required; platform and front-office rows belong to no demo
// workspace, so their lines carry the platform's own audit workspace (key "platform-audit", the same row PF-4 uses): the
// demo reset deletes the demo workspace's lines only, so it never deletes these (P-571 (1)). AUD-1b: each line also
// carries firm_id (the entry's), case_id (the entry's), actor_type (the actor word's, which the insert trigger checks),
// correlation_id and support_session_id (the request's or job's, context.ts); detail.firmId stays until a later row drops
// it. A line never lands on another firm's trail: an entry whose firm is not the request's or job's firm is refused.
// Fail-closed (P-607 (3), a recorded departure from SA-11-7, SA-11 BR-5 and NFR5-08: no durable retry, the change does
// not commit; Unconfirmed: no counsel): every failure raises one audit_write_failed alert with ids only and is thrown,
// so the caller's transaction rolls the change back. One try: inside PostgreSQL a failed statement aborts the
// transaction, so a retry there could never succeed.
import type { Prisma } from "@prisma/client";
import { AuditEntry, type AuditPort } from "../../../../ports/audit.ts";
import { writeAuditWithAlarm } from "../observability/alerts.ts";
import { actorTypeOfWord, auditContext } from "./context.ts";

type Tx = Prisma.TransactionClient;
export const PLATFORM_AUDIT_WORKSPACE = "platform-audit";

/** The platform's audit workspace row, made on first use inside the caller's transaction. INSERT … ON CONFLICT DO NOTHING
 *  (createMany with skipDuplicates; Prisma's upsert is not ON CONFLICT here, review M1): a second first writer waits for
 *  the first's commit and then reads its row, instead of failing on the unique key; if the first rolls back, the second's
 *  insert goes ahead. No cache, so a rolled-back first write leaves no stale id. */
export async function platformAuditWorkspaceId(tx: Tx): Promise<string> {
  const found = await tx.workspace.findUnique({ where: { key: PLATFORM_AUDIT_WORKSPACE }, select: { id: true } });
  if (found) return found.id;
  await tx.workspace.createMany({ data: [{ key: PLATFORM_AUDIT_WORKSPACE, label: "Platform audit lines (firm staff, roles, settings; never reset)" }], skipDuplicates: true });
  return (await tx.workspace.findUniqueOrThrow({ where: { key: PLATFORM_AUDIT_WORKSPACE }, select: { id: true } })).id;
}

/** A line the adapter refuses to write (another firm's trail, an actor acting as a type its word does not have). */
export class AuditRefused extends Error { constructor(m: string) { super(m); this.name = "AuditRefused"; } }

const idOf = (v: unknown) => (typeof v === "string" ? v : undefined);

export class AuditEventAdapter implements AuditPort<Tx> {
  async record(tx: Tx, entry: AuditEntry): Promise<void> {
    const raw = (entry ?? {}) as Partial<Record<"firmId" | "entity" | "entityKey", unknown>>;
    // The alarm's ids (read by writeAuditWithAlarm after a failure): the firm is the request's or job's own when it has one,
    // so a refused line for another firm never spends that other firm's alert (breaker m4).
    const ids = { firmId: idOf(raw.firmId), entity: idOf(raw.entity), entityKey: idOf(raw.entityKey) };
    await writeAuditWithAlarm(async () => {
      const ctx = auditContext();
      if (ctx?.firmId) ids.firmId = ctx.firmId;
      const e = AuditEntry.parse(entry), firmId = e.firmId.toLowerCase();
      if (ctx?.firmId && ctx.firmId !== firmId) throw new AuditRefused(`audit line refused: the line names firm ${firmId}, but this request or job acts for firm ${ctx.firmId} (a line never lands on another firm's trail)`);
      const actorType = actorTypeOfWord(e.actor);
      // OUR_STAFF has no actor word yet (PF-4s): in a request our staff make, no line is written at all, so none is ever
      // written as FIRM_STAFF or under another word (breaker M1). In a signed-in request the line's actor is the request's
      // own, exactly: never another person, a system: or a seed: word (review M1; no caller on main writes one there).
      if (ctx?.actorType === "OUR_STAFF") throw new AuditRefused(`audit line refused: this request is our staff's (OUR_STAFF), which has no actor word until PF-4s`);
      if (ctx?.actor && e.actor !== ctx.actor) throw new AuditRefused(`audit line refused: the line names ${e.actor}, but this request is ${ctx.actor}'s`);
      const workspaceId = await platformAuditWorkspaceId(tx);
      await tx.auditEvent.create({
        data: { workspaceId, firmId, caseId: e.caseId?.toLowerCase() ?? null, actorType, correlationId: ctx?.correlationId ?? null, supportSessionId: ctx?.supportSessionId ?? null,
          actor: e.actor, action: e.action, entity: e.entity, entityKey: e.entityKey, summary: e.summary, detail: { ...e.detail, firmId } as Prisma.InputJsonValue },
      });
    }, ids, { attempts: 1 });
  }
}

/** The one instance modules use (`auditEvent.record(tx, …)`). */
export const auditEvent: AuditPort<Tx> = new AuditEventAdapter();
