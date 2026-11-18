// FO-2 part 4 (contracts §2.1; AG-2-37a, AG-2-26 rule 7; concept fo-4-sales r2 BR-6): Log a call and Add a note, on a
// lead or a prospect. The first logged call is the lead's first response, set once (BR-6), under the lead's row lock; a
// call never moves a stage. Each write is one transaction: the row locked and seen again (404 as the read), the call
// or note, one audit line through AuditPort with a typed actor. No outbox row: nothing downstream reads calls yet.
import { Inject, Injectable } from "@nestjs/common";
import type { FoCallDirection, FoCallOutcome, PrismaClient } from "@prisma/client";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { actorOf, notFound, sees, text, UUID, visibilityOf, type Tx } from "./common.ts";
import { SALES_PORTS, type SalesPorts } from "./public.ts";

/** AG-2-37a's seven outcomes, as the schema's FoCallOutcome. */
export const OUTCOMES = ["CONNECTED", "NO_ANSWER", "LEFT_VOICEMAIL", "BUSY", "WRONG_NUMBER", "CALLBACK_REQUESTED", "NOT_IN_SERVICE"] as const;
const DIRECTIONS = ["IN", "OUT"] as const;
/** How far ahead a call's time may be (clock drift between the screen and the server); a later time is refused. */
const AHEAD_MS = 5 * 60_000;
const EARLIEST = Date.parse("2000-01-01T00:00:00Z");
const bad = (detail: string, field: string) => problem(422, "Check the details", detail, { code: "INVALID", fields: { [field]: detail } });

type Subject = { kind: "lead"; id: string } | { kind: "prospect"; id: string };
type Target = { leadId: string; prospectId: string | null; personId: string; number: string; entity: "fo_lead" | "fo_prospect"; firstResponseAt: Date | null };

@Injectable()
export class Activity {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts) {}

  /** The lead (or the prospect and its lead) under the lead's row lock, seen again: a lead as the leads read sees it
   *  (own, all, or Unassigned with view.all or assign), a prospect as the prospects read (all, else own); 404 otherwise. */
  private async locked(tx: Tx, ctx: StaffContext, s: Subject): Promise<Target> {
    if (typeof s.id !== "string" || !UUID.test(s.id)) return notFound(s.kind);
    const id = s.id.toLowerCase();
    const vis = await visibilityOf(tx, ctx);
    let leadId = id, prospect: { id: string; number: string; personId: string; owner: string | null } | null = null;
    if (s.kind === "prospect") {
      const [p] = await tx.$queryRaw<{ id: string; number: string; lead_id: string; owner_staff_id: string | null; person_id: string }[]>`
        select id::text, number, lead_id::text, owner_staff_id::text, coalesce(subject_person_id, primary_contact_person_id)::text as person_id
          from fo_prospect where firm_id = ${ctx.firmId}::uuid and id = ${id}::uuid for update`;
      if (!p || !(vis.seesAll || p.owner_staff_id === ctx.staffId)) return notFound("prospect");
      prospect = { id: p.id, number: p.number, personId: p.person_id, owner: p.owner_staff_id };
      leadId = p.lead_id;
    }
    const [l] = await tx.$queryRaw<{ id: string; number: string; owner_staff_id: string | null; person_id: string; first_response_at: Date | null }[]>`
      select id::text, number, owner_staff_id::text, person_id::text, first_response_at from fo_lead where firm_id = ${ctx.firmId}::uuid and id = ${leadId}::uuid for update`;
    if (!l) return notFound(s.kind);
    if (!prospect) {
      const owner = l.owner_staff_id ? await tx.platformStaff.findFirst({ where: firmScope(ctx.firmId, { id: l.owner_staff_id }), select: { status: true } }) : null;
      if (!sees(vis, ctx, owner?.status === "ACTIVE" ? l.owner_staff_id : null)) return notFound("lead");
    }
    return prospect
      ? { leadId: l.id, prospectId: prospect.id, personId: prospect.personId, number: prospect.number, entity: "fo_prospect", firstResponseAt: l.first_response_at }
      : { leadId: l.id, prospectId: null, personId: l.person_id, number: l.number, entity: "fo_lead", firstResponseAt: l.first_response_at };
  }

  /** Log a call (AG-2-37a): direction IN or OUT, one of the seven outcomes, `when` (defaults to now; editable, never in
   *  the future, never before 2000), optional seconds and notes. The lead's first response is set by the first call
   *  logged, once (BR-6): a later call, or one logged on its prospect after, leaves it. The stage never moves. */
  async logCall(ctx: StaffContext, s: Subject, b: Record<string, unknown>) {
    const direction = (DIRECTIONS as readonly unknown[]).includes(b.direction ?? "OUT") ? ((b.direction ?? "OUT") as FoCallDirection) : bad("direction: IN or OUT.", "direction");
    const outcome = (OUTCOMES as readonly unknown[]).includes(b.outcome) ? (b.outcome as FoCallOutcome) : bad(`outcome: one of ${OUTCOMES.join(", ")}.`, "outcome");
    const now = Date.now();
    const when = b.when === undefined || b.when === null || b.when === "" ? new Date(now) : typeof b.when === "string" && !Number.isNaN(Date.parse(b.when)) ? new Date(b.when) : bad("when: a date and time.", "when");
    if (when.getTime() > now + AHEAD_MS) bad("when: a call cannot be logged in the future.", "when");
    if (when.getTime() < EARLIEST) bad("when: a date and time after 2000.", "when");
    const seconds = b.seconds === undefined || b.seconds === null ? 0 : Number.isInteger(b.seconds) && (b.seconds as number) >= 0 && (b.seconds as number) <= 86_400 ? (b.seconds as number) : bad("seconds: a whole number from 0 to 86400.", "seconds");
    const notes = text(b.notes, { field: "notes", what: "Notes", max: 5000, multiline: true });
    return this.db.$transaction(async (tx) => {
      const t = await this.locked(tx, ctx, s);
      const call = await tx.foCall.create({ data: { firmId: ctx.firmId, personId: t.personId, leadId: t.prospectId ? null : t.leadId, prospectId: t.prospectId, direction, outcome, seconds, notes, startedAt: when, byActor: actorOf(ctx) } });
      const first = t.firstResponseAt === null;
      if (first) {
        const n = await tx.foLead.updateMany({ where: firmScope(ctx.firmId, { id: t.leadId, firstResponseAt: null }), data: { firstResponseAt: when, firstResponseBy: actorOf(ctx), firstResponseKind: "CALL" } });
        if (n.count !== 1) problem(409, "Not possible now", "This lead changed at the same time. Reload it.", { code: "CHANGED" });
      }
      await this.ports.audit.record(tx, {
        firmId: ctx.firmId, actor: actorOf(ctx), action: "call.logged", entity: t.entity, entityKey: t.prospectId ?? t.leadId,
        summary: `Staff ${ctx.staffId} logged a${direction === "IN" ? "n incoming" : "n outgoing"} call (${outcome}) on ${t.number}${first ? "; the lead's first response" : ""}.`,
        detail: { callId: call.id, direction, outcome, seconds, startedAt: when.toISOString(), firstResponse: first, leadId: t.leadId },
      });
      return { id: call.id, direction, outcome, seconds, notes, startedAt: when, firstResponse: first };
    });
  }

  /** Add a note (contracts §2.1): INTERNAL only (staff), one to 5000 characters, on the lead or the prospect. */
  async addNote(ctx: StaffContext, s: Subject, b: Record<string, unknown>) {
    if (b.visibility !== undefined && b.visibility !== "INTERNAL") bad("visibility: INTERNAL only (a note for the client is not built).", "visibility");
    const body = text(b.text, { field: "text", what: "Note", max: 5000, required: true, multiline: true })!;
    return this.db.$transaction(async (tx) => {
      const t = await this.locked(tx, ctx, s);
      const note = await tx.foNote.create({ data: { firmId: ctx.firmId, personId: t.personId, leadId: t.prospectId ? null : t.leadId, prospectId: t.prospectId, visibility: "INTERNAL", text: body, byActor: actorOf(ctx) } });
      // The note's words stay in fo_note; the audit line carries ids and the length only (no free text in the trail).
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: "note.added", entity: t.entity, entityKey: t.prospectId ?? t.leadId, summary: `Staff ${ctx.staffId} added a note on ${t.number}.`, detail: { noteId: note.id, length: [...body].length } });
      return { id: note.id, visibility: "INTERNAL" as const, text: body, createdAt: note.createdAt };
    });
  }
}
