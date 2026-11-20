// FO-2 part 4 (contracts §2.1; AG-2-37a, AG-2-26 rule 7; concept fo-4-sales r2 BR-6): Log a call and Add a note, on a
// lead or a prospect. A logged call is the first response of every OPEN lead of that person that has none yet (AG-2-37a
// rule 5, BR-6), set once each under those leads' row locks (taken in id order); a call never moves a stage. Each write is one transaction: the row locked and seen again (404 as the read), the call
// or note, one audit line through AuditPort with a typed actor. No outbox row: nothing downstream reads calls yet.
import { Inject, Injectable } from "@nestjs/common";
import type { FoCallDirection, FoCallOutcome, PrismaClient } from "@prisma/client";
import { EVENT } from "../../../../ports/events.ts";
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
type Target = { leadId: string; prospectId: string | null; personId: string; number: string; entity: "fo_lead" | "fo_prospect"; arrivedAt: Date };
/** An ISO 8601 time with its offset (`Z` or `+05:30`): never a local time read in the server's zone (review m2). */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

@Injectable()
export class Activity {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts) {}

  /** The record, seen again under its locks (404 as its read: a lead as the leads read sees it, a prospect as the
   *  prospects read). A prospect is locked first; then every lead of the person, in id order (one order for every call,
   *  so two calls on two leads of one person never deadlock). Returns the context and the person's OPEN leads that
   *  have no first response yet (AG-2-37a rule 5). */
  private async locked(tx: Tx, ctx: StaffContext, s: Subject) {
    if (typeof s.id !== "string" || !UUID.test(s.id)) return notFound(s.kind);
    const id = s.id.toLowerCase();
    const vis = await visibilityOf(tx, ctx);
    let personId: string, prospect: { id: string; number: string; leadId: string } | null = null;
    if (s.kind === "prospect") {
      const [p] = await tx.$queryRaw<{ id: string; number: string; lead_id: string; owner_staff_id: string | null; person_id: string }[]>`
        select id::text, number, lead_id::text, owner_staff_id::text, coalesce(subject_person_id, primary_contact_person_id)::text as person_id
          from fo_prospect where firm_id = ${ctx.firmId}::uuid and id = ${id}::uuid for update`;
      if (!p || !(vis.seesAll || p.owner_staff_id === ctx.staffId)) return notFound("prospect");
      prospect = { id: p.id, number: p.number, leadId: p.lead_id };
      personId = p.person_id;
    } else {
      const [l] = await tx.$queryRaw<{ person_id: string }[]>`select person_id::text from fo_lead where firm_id = ${ctx.firmId}::uuid and id = ${id}::uuid`;
      if (!l) return notFound("lead");
      personId = l.person_id;
    }
    const leads = await tx.$queryRaw<{ id: string; number: string; state: string; owner_staff_id: string | null; person_id: string; first_response_at: Date | null; arrived_at: Date }[]>`
      select id::text, number, state::text, owner_staff_id::text, person_id::text, first_response_at, arrived_at from fo_lead
       where firm_id = ${ctx.firmId}::uuid and (person_id = ${personId}::uuid or id = ${prospect?.leadId ?? id}::uuid) order by id for update`;
    const context = leads.find((l) => l.id === (prospect?.leadId ?? id));
    if (!context || (!prospect && context.person_id !== personId)) return notFound(s.kind);   // a lead's person never changes; moved meanwhile = changed
    if (!prospect) {
      const owner = context.owner_staff_id ? await tx.platformStaff.findFirst({ where: firmScope(ctx.firmId, { id: context.owner_staff_id }), select: { status: true } }) : null;
      if (!sees(vis, ctx, owner?.status === "ACTIVE" ? context.owner_staff_id : null)) return notFound("lead");
    }
    // The person's OPEN leads with no first response, each with whether the caller may see it (review R1: only those are named).
    const owners = new Map((await tx.platformStaff.findMany({ where: firmScope(ctx.firmId, { id: { in: leads.map((l) => l.owner_staff_id).filter((o): o is string => !!o) } }), select: { id: true, status: true } })).map((x) => [x.id, x.status]));
    const unanswered = leads.filter((l) => l.person_id === personId && l.state === "OPEN" && l.first_response_at === null)
      .map((l) => ({ id: l.id, arrivedAt: l.arrived_at, seen: sees(vis, ctx, l.owner_staff_id && owners.get(l.owner_staff_id) === "ACTIVE" ? l.owner_staff_id : null) }));
    const t: Target = prospect
      ? { leadId: context.id, prospectId: prospect.id, personId, number: prospect.number, entity: "fo_prospect", arrivedAt: context.arrived_at }
      : { leadId: context.id, prospectId: null, personId: context.person_id, number: context.number, entity: "fo_lead", arrivedAt: context.arrived_at };
    return { t, unanswered };
  }

  /** Log a call (AG-2-37a): direction IN or OUT, one of the seven outcomes, `when` (ISO 8601 with its offset; defaults
   *  to now; never in the future, never before the lead arrived), optional seconds and notes. The call is the first
   *  response of every OPEN lead of the person that has none and had arrived by then (rule 5, review R2): an ENGAGED or
   *  CLOSED lead, or one already answered, keeps what it has. The answer names those the caller may see
   *  (`firstResponseFor`) and counts the rest (`firstResponseOthers`). The stage never moves (rule 7). */
  async logCall(ctx: StaffContext, s: Subject, b: Record<string, unknown>) {
    const direction = (DIRECTIONS as readonly unknown[]).includes(b.direction ?? "OUT") ? ((b.direction ?? "OUT") as FoCallDirection) : bad("direction: IN or OUT.", "direction");
    const outcome = (OUTCOMES as readonly unknown[]).includes(b.outcome) ? (b.outcome as FoCallOutcome) : bad(`outcome: one of ${OUTCOMES.join(", ")}.`, "outcome");
    const now = Date.now();
    const when = b.when === undefined || b.when === null || b.when === "" ? new Date(now) : typeof b.when === "string" && ISO.test(b.when) && !Number.isNaN(Date.parse(b.when)) ? new Date(b.when) : bad("when: a date and time with its offset, e.g. 2026-11-18T09:20:00-05:00.", "when");
    if (when.getTime() > now + AHEAD_MS) bad("when: a call cannot be logged in the future.", "when");
    if (when.getTime() < EARLIEST) bad("when: a date and time after 2000.", "when");
    const seconds = b.seconds === undefined || b.seconds === null ? 0 : Number.isInteger(b.seconds) && (b.seconds as number) >= 0 && (b.seconds as number) <= 86_400 ? (b.seconds as number) : bad("seconds: a whole number from 0 to 86400.", "seconds");
    const notes = text(b.notes, { field: "notes", what: "Notes", max: 5000, multiline: true });
    return this.db.$transaction(async (tx) => {
      const { t, unanswered: open } = await this.locked(tx, ctx, s);
      // Never before the lead arrived (review m1: a first response before arrival makes the open minutes negative).
      if (when.getTime() < t.arrivedAt.getTime() - 60_000) bad("when: the call cannot be before the lead arrived.", "when");
      // Only leads that had arrived by the call's time (review R2): a backdated call never answers a later lead.
      const answered = open.filter((l) => l.arrivedAt.getTime() <= when.getTime() + 60_000);
      const unanswered = answered.map((l) => l.id);
      const call = await tx.foCall.create({ data: { firmId: ctx.firmId, personId: t.personId, leadId: t.prospectId ? null : t.leadId, prospectId: t.prospectId, direction, outcome, seconds, notes, startedAt: when, byActor: actorOf(ctx) } });
      if (unanswered.length) {
        const n = await tx.foLead.updateMany({ where: firmScope(ctx.firmId, { id: { in: unanswered }, state: "OPEN" as const, firstResponseAt: null }), data: { firstResponseAt: when, firstResponseBy: actorOf(ctx), firstResponseKind: "CALL" } });
        if (n.count !== unanswered.length) problem(409, "Not possible now", "A lead of this person changed at the same time. Reload it.", { code: "CHANGED" });
      }
      const first = unanswered.includes(t.leadId);
      const summary = `Staff ${ctx.staffId} logged a${direction === "IN" ? "n incoming" : "n outgoing"} call (${outcome}) on ${t.number}${unanswered.length ? `; the first response of ${unanswered.length} open lead${unanswered.length === 1 ? "" : "s"}` : ""}.`;
      const detail = { callId: call.id, direction, outcome, seconds, startedAt: when.toISOString(), firstResponse: first, firstResponseLeadIds: unanswered.slice(0, 50), leadId: t.leadId };
      // The call's own values (R1.8, QA-594); its free-text notes stay in fo_call only (FO-2p4: no free text in the trail).
      const after = { personId: t.personId, direction, outcome, seconds, startedAt: when.toISOString(), notesLength: notes ? [...notes].length : 0 };
      // Each entity named literally (check_case_feed reads AuditPort writes and accepts no dynamic entity).
      if (t.prospectId) await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: EVENT.CALL_LOGGED, entity: "fo_prospect", entityKey: t.prospectId, summary, detail, before: null, after });
      else await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: EVENT.CALL_LOGGED, entity: "fo_lead", entityKey: t.leadId, summary, detail, before: null, after });
      // The answer names only leads the caller may see (review R1, AG-2-64); others are a count. The audit line keeps all ids.
      const seen = answered.filter((l) => l.seen).map((l) => l.id);
      return { id: call.id, direction, outcome, seconds, notes, startedAt: when, firstResponse: first, firstResponseFor: seen, firstResponseOthers: unanswered.length - seen.length };
    });
  }

  /** Add a note (contracts §2.1): INTERNAL only (staff), one to 5000 characters, on the lead or the prospect. */
  async addNote(ctx: StaffContext, s: Subject, b: Record<string, unknown>) {
    if (b.visibility !== undefined && b.visibility !== "INTERNAL") bad("visibility: INTERNAL only (a note for the client is not built).", "visibility");
    const body = text(b.text, { field: "text", what: "Note", max: 5000, required: true, multiline: true })!;
    return this.db.$transaction(async (tx) => {
      const { t } = await this.locked(tx, ctx, s);
      const note = await tx.foNote.create({ data: { firmId: ctx.firmId, personId: t.personId, leadId: t.prospectId ? null : t.leadId, prospectId: t.prospectId, visibility: "INTERNAL", text: body, byActor: actorOf(ctx) } });
      // The note's words stay in fo_note; the audit line carries ids and the length only (no free text in the trail).
      const summary = `Staff ${ctx.staffId} added a note on ${t.number}.`, detail = { noteId: note.id, length: [...body].length };
      if (t.prospectId) await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: EVENT.NOTE_ADDED, entity: "fo_prospect", entityKey: t.prospectId, summary, detail, before: null, after: { personId: t.personId, visibility: "INTERNAL", length: detail.length } });
      else await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: actorOf(ctx), action: EVENT.NOTE_ADDED, entity: "fo_lead", entityKey: t.leadId, summary, detail, before: null, after: { personId: t.personId, visibility: "INTERNAL", length: detail.length } });
      return { id: note.id, visibility: "INTERNAL" as const, text: body, createdAt: note.createdAt };
    });
  }
}
