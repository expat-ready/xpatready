// PF-0p (rows rev 16; P-600: the interim AuditPort adapter is OK), AUD-1b (R1.8 part 2; SA-11-2, AG-13-40, P-607 (3)):
// AuditPort over audit_event. audit_event.workspace_id is required; platform and front-office rows belong to no demo
// workspace, so their lines carry the platform's own audit workspace (key "platform-audit", the same row PF-4 uses): the
// demo reset deletes the demo workspace's lines only, so it never deletes these (P-571 (1)). AUD-1b: each line also
// carries firm_id (the entry's), case_id (the entry's), actor_type (the actor word's, which the insert trigger checks),
// correlation_id and support_session_id (the request's or job's, context.ts); detail.firmId stays until a later row drops
// it. A line never lands on another firm's trail: an entry whose firm is not the request's or job's firm is refused.
// R1.8 (QA-594, P-687): an entry's before and after (personal values in full, secrets refused by the port) go into detail
// as `<field>_before` / `<field>_after`, the shape AUD-4's reader shows as "field: old → new", inside the line (so the
// hash chain, AUD-1c, covers them). R1.8 (QA-595): a case-side line's firm is its case's own firm (runtime_case.firm_id,
// else its firm key's platform firm), so the wall applies there too.
// Fail-closed (P-607 (3), a recorded departure from SA-11-7, SA-11 BR-5 and NFR5-08: no durable retry, the change does
// not commit; Unconfirmed: no counsel): every failure raises one audit_write_failed alert with ids only and is thrown,
// so the caller's transaction rolls the change back. One try: inside PostgreSQL a failed statement aborts the
// transaction, so a retry there could never succeed.
import type { Prisma } from "@prisma/client";
import { AuditEntry, CaseActor, CaseEntry, flattenValues, isCaseEntry, isOurStaffPlatformEntry, OUR_STAFF_PLATFORM_ENTITY, OurStaffPlatformEntry, ourStaffPlatformRefusal, type AuditPort } from "../../../../ports/audit.ts";
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
  async record(tx: Tx, entry: AuditEntry | CaseEntry | OurStaffPlatformEntry): Promise<void> {
    if (isCaseEntry(entry)) return this.recordCase(tx, entry);
    if (isOurStaffPlatformEntry(entry)) return this.recordOurStaffPlatform(tx, entry);
    const raw = (entry ?? {}) as Partial<Record<"firmId" | "entity" | "entityKey", unknown>>;
    // The alarm's ids (read by writeAuditWithAlarm after a failure): the firm is the request's or job's own when it has one,
    // so a refused line for another firm never spends that other firm's alert (breaker m4).
    const ids = { firmId: idOf(raw.firmId), entity: idOf(raw.entity), entityKey: idOf(raw.entityKey) };
    await writeAuditWithAlarm(async () => {
      const ctx = auditContext();
      if (ctx?.firmId) ids.firmId = ctx.firmId;
      const e = AuditEntry.parse(entry), firmId = e.firmId.toLowerCase();
      if (e.entity === OUR_STAFF_PLATFORM_ENTITY) throw new AuditRefused(`audit line refused: ${OUR_STAFF_PLATFORM_ENTITY} is the firm-less kind's entity (AUD-3c), never a firm's line`);
      if (ctx?.firmId && ctx.firmId !== firmId) throw new AuditRefused(`audit line refused: the line names firm ${firmId}, but this request or job acts for firm ${ctx.firmId} (a line never lands on another firm's trail)`);
      const actorType = actorTypeOfWord(e.actor);
      // AUD-3a: our staff's line is written under our staff's own word (ourstaff:<id>, OUR_STAFF) and only in our staff's
      // request: never as FIRM_STAFF or under another word (breaker M1), and that word never outside such a request. In a
      // signed-in request the line's actor is the request's own, exactly: never another person, a system: or a seed: word
      // (review M1; no caller on main writes one there).
      if ((ctx?.actorType === "OUR_STAFF") !== (actorType === "OUR_STAFF")) throw new AuditRefused(ctx?.actorType === "OUR_STAFF"
        ? `audit line refused: this request is our staff's (OUR_STAFF), so its line names them as ourstaff:<id>, not ${e.actor}`
        : `audit line refused: ${e.actor} is our staff's word, written only in a request our staff make`);
      if (ctx?.actor && e.actor !== ctx.actor) throw new AuditRefused(`audit line refused: the line names ${e.actor}, but this request is ${ctx.actor}'s`);
      const workspaceId = await platformAuditWorkspaceId(tx);
      await tx.auditEvent.create({
        data: { workspaceId, firmId, caseId: e.caseId?.toLowerCase() ?? null, actorType, correlationId: ctx?.correlationId ?? null, supportSessionId: ctx?.supportSessionId ?? null,
          actor: e.actor, action: e.action, entity: e.entity, entityKey: e.entityKey, summary: e.summary, detail: { ...e.detail, ...flattenValues(e.before, e.after), firmId } as Prisma.InputJsonValue },
      });
    }, ids, { attempts: 1 });
  }

  /** AUD-3c (Lead 10's ruling on #3040): our own staff's firm-less platform.bypass line. Its own narrow kind, never a
   *  case-side line (recordCase's refusal of our staff stays as AUD-3a wrote it): firm and case null, the platform audit
   *  workspace (never reset, P-571 (1)), OUR_STAFF, the request's correlation id. Refused (ports/audit.ts
   *  ourStaffPlatformRefusal): outside our staff's request, under any actor but the request's own, in a request or job
   *  that acts for a firm; the schema refuses any firm or case id, a workspace, another action or entity. One alert with
   *  ids only and the error thrown on any failure, one try (fail-closed, P-607 (3)). */
  private async recordOurStaffPlatform(tx: Tx, entry: OurStaffPlatformEntry): Promise<void> {
    const raw = (entry ?? {}) as Partial<Record<"entity" | "entityKey", unknown>>;
    await writeAuditWithAlarm(async () => {
      const e = OurStaffPlatformEntry.parse(entry), ctx = auditContext();
      const why = ourStaffPlatformRefusal(e, ctx);
      if (why) throw new AuditRefused(why);
      const workspaceId = await platformAuditWorkspaceId(tx);
      await tx.auditEvent.create({
        data: { workspaceId, firmId: null, caseId: null, actorType: "OUR_STAFF", correlationId: ctx?.correlationId ?? null, supportSessionId: ctx?.supportSessionId ?? null,
          actor: e.actor, action: e.action, entity: e.entity, entityKey: e.entityKey, summary: e.summary, detail: e.detail as Prisma.InputJsonValue },
      });
    }, { entity: idOf(raw.entity), entityKey: idOf(raw.entityKey) }, { attempts: 1 });
  }

  /** AUD-1m: one case-side or configuration line (core.ts's Audit.log), with the same rules: its workspace is the caller's
   *  (the demo workspace's lines stay the demo reset's, P-571 (1)); its firm (R1.8, QA-595) is the named case's own, else
   *  the request's or job's, null outside every one (a configuration line); a line whose case belongs to another firm than
   *  the request's or job's, or that names another firm than that, is refused; a named case that does not exist is refused
   *  (never guessed); no line in a request our staff make, and in a signed-in request only the request's own actor; one
   *  alert with ids only and the error thrown on any failure, one try. */
  private async recordCase(tx: Tx, entry: CaseEntry): Promise<void> {
    const raw = (entry ?? {}) as Partial<Record<"entity" | "entityKey", unknown>>;
    const ids = { firmId: undefined as string | undefined, entity: idOf(raw.entity), entityKey: idOf(raw.entityKey) ?? undefined };
    await writeAuditWithAlarm(async () => {
      const ctx = auditContext();
      if (ctx?.firmId) ids.firmId = ctx.firmId;
      // An actor word with no type is refused in the insert trigger's own words (AUD-1a, BR-3: never inferred), naming it.
      const word = (entry as { actor?: unknown })?.actor;
      if (!CaseActor.safeParse(word).success) throw new AuditRefused(`audit line refused: the actor word '${String(word).replace(/'/g, "''").slice(0, 200)}' has no actor type (staff:<id>, person:<id>, system:<door>, seed:<row> or a simulated person's id)`);
      const e = CaseEntry.parse(entry);
      // AUD-3a: a case-side line has no word for our staff (CaseActor), so our staff's request writes none there.
      if (ctx?.actorType === "OUR_STAFF") throw new AuditRefused(`audit line refused: this request is our staff's (OUR_STAFF); our staff write no case-side line`);
      if (ctx?.actor && e.actor !== ctx.actor) throw new AuditRefused(`audit line refused: the line names ${e.actor}, but this request is ${ctx.actor}'s`);
      const caseFirm = e.caseId ? await caseFirmOf(tx, e.caseId) : undefined;
      const named = e.firmId?.toLowerCase(), scope = ctx?.firmId?.toLowerCase();
      if (caseFirm && scope && caseFirm !== scope) throw new AuditRefused(`audit line refused: case ${e.caseId} belongs to firm ${caseFirm}, but this request or job acts for firm ${scope} (a line never lands on another firm's trail)`);
      const firmId = caseFirm ?? scope ?? named ?? null;
      if (named && named !== firmId) throw new AuditRefused(`audit line refused: the line names firm ${named}, but its ${caseFirm ? "case's" : "request's or job's"} firm is ${firmId ?? "none"} (a line never lands on another firm's trail)`);
      if (firmId) ids.firmId = firmId;
      await tx.auditEvent.create({
        data: { workspaceId: e.workspaceId, firmId, caseId: e.caseId?.toLowerCase() ?? null, actorType: actorTypeOfWord(e.actor), correlationId: ctx?.correlationId ?? null,
          supportSessionId: ctx?.supportSessionId ?? null, actor: e.actor, action: e.action, entity: e.entity, entityKey: e.entityKey, summary: e.summary,
          detail: e.detail === undefined ? undefined : (e.detail as Prisma.InputJsonValue), combinationId: e.combinationId ?? null },
      });
    }, ids, { attempts: 1 });
  }
}

/** R1.8 (QA-595): a case's own platform firm, read in the caller's transaction: runtime_case.firm_id, else its firm key's
 *  platform firm through CS-W1's one narrow lookup (it reads past PF-12's wall and returns only the id). A case id with no
 *  case is refused: a line about a case nobody can find never takes a firm by guess. A case whose firm key has no platform
 *  firm yet (a Sample firm before its seed) gives undefined: the request's or job's firm applies, as before. */
async function caseFirmOf(tx: Tx, caseId: string): Promise<string | undefined> {
  const rows = await tx.$queryRaw<{ firm: string | null }[]>`select coalesce(c.firm_id, case_lookup.case_firm_id_of_key(c.firm_key))::text as firm from runtime_case c where c.id = ${caseId}::uuid`;
  if (!rows.length) throw new AuditRefused(`audit line refused: the line names case ${caseId}, which does not exist`);
  return rows[0].firm?.toLowerCase() ?? undefined;
}

/** The one instance modules use (`auditEvent.record(tx, …)`). */
export const auditEvent: AuditPort<Tx> = new AuditEventAdapter();
