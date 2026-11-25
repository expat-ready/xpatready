// FO-2 part 4 (contracts §2.1; Lead 37's ruling: the front office owns the lead, prospect and client timeline): a read
// view over audit_event, module_event, fo_call and fo_note for one lead or prospect, in time order, in the one line
// shape `TimelineLine` (ports/events.ts; review D10). Seen as the lead's or prospect's own read sees it (404 otherwise).
// An outbox event is shown only when no audit line of the same subject has its name (most changes write both; the
// audit line says who). A note's words are staff-only (INTERNAL) and shown; nothing else carries free text.
import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { EVENT, TimelineLine } from "../../../../ports/events.ts";
import { Db } from "../../core.ts";
import { platformAuditWorkspaceId } from "../../platform/audit/audit-event.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { StaffContext } from "../../platform/identity/keys.ts";
import { Leads } from "./leads.ts";
import { Prospects } from "./prospects.ts";

/** How many lines one timeline returns at most (newest kept); the reader says when more exist. */
const MAX_LINES = 500;
const OUTCOME_WORDS: Record<string, string> = { CONNECTED: "connected", NO_ANSWER: "no answer", LEFT_VOICEMAIL: "left a voicemail", BUSY: "busy", WRONG_NUMBER: "wrong number", CALLBACK_REQUESTED: "callback requested", NOT_IN_SERVICE: "not in service" };

@Injectable()
export class Timeline {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(Leads) private readonly leads: Leads, @Inject(Prospects) private readonly prospects: Prospects) {}

  /** A lead's timeline: its arrival, take, assign, close, reopen and engage lines, its calls and notes. */
  async lead(ctx: StaffContext, id: string) {
    const l = await this.leads.read(ctx, id);   // 404 as the lead read: another firm's, or one the person may not see
    return this.lines(ctx, "fo_lead", l.id, { leadId: l.id });
  }

  /** A prospect's timeline: its engage, moves, lost, won and undo lines, its calls and notes. */
  async prospect(ctx: StaffContext, id: string) {
    const p = await this.prospects.read(ctx, id);
    return this.lines(ctx, "fo_prospect", p.id, { prospectId: p.id });
  }

  private async lines(ctx: StaffContext, entity: "fo_lead" | "fo_prospect", subjectId: string, own: { leadId?: string; prospectId?: string }) {
    const ws = await platformAuditWorkspaceId(this.db as never);
    const [audit, events, calls, notes] = await Promise.all([
      this.db.$queryRaw<{ id: string; at: Date; actor: string; action: string; summary: string }[]>`
        select id::text, at, actor, action, summary from audit_event
         where workspace_id = ${ws}::uuid and detail->>'firmId' = ${ctx.firmId.toLowerCase()} and entity = ${entity} and entity_key = ${subjectId}
           and action not in (${EVENT.CALL_LOGGED}, ${EVENT.NOTE_ADDED})
         order by at desc, id limit ${MAX_LINES + 1}`,
      this.db.moduleEvent.findMany({ where: { firmId: ctx.firmId, subjectId }, select: { id: true, type: true, occurredAt: true }, orderBy: { seq: "desc" }, take: MAX_LINES + 1 }),
      this.db.foCall.findMany({ where: firmScope(ctx.firmId, own), orderBy: [{ startedAt: "desc" }, { id: "asc" }], take: MAX_LINES + 1 }),
      this.db.foNote.findMany({ where: firmScope(ctx.firmId, own), orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: MAX_LINES + 1 }),
    ]);
    // A call's or note's own audit line is the CALL or NOTE line below, never a second line: left out in the query, so
    // the cap counts only lines shown (review m5). An outbox event is left out only when an audit line of the same name
    // was written with it (within 2 s: the same transaction), never just because the name occurs (review m4).
    const shown = audit;
    const audited = (type: string, at: Date) => audit.some((a) => a.action === type && Math.abs(a.at.getTime() - at.getTime()) <= 2000);
    const staffIds = [...new Set([...audit.map((a) => a.actor), ...calls.map((c) => c.byActor), ...notes.map((n) => n.byActor)].filter((a) => a.startsWith("staff:")).map((a) => a.slice(6)))];
    const names = new Map((await this.db.platformStaff.findMany({ where: firmScope(ctx.firmId, { id: { in: staffIds } }), select: { id: true, displayName: true } })).map((s) => [`staff:${s.id}`, s.displayName]));
    const nameOf = (actor: string | null) => (actor ? names.get(actor) ?? (actor.startsWith("system:") ? "The system" : null) : null);
    const all: TimelineLine[] = [
      ...shown.map((a) => ({ at: a.at.toISOString(), kind: "AUDIT" as const, type: a.action, actor: a.actor, actorName: nameOf(a.actor), summary: a.summary, refId: a.id })),
      ...events.filter((e) => !audited(e.type, e.occurredAt)).map((e) => ({ at: e.occurredAt.toISOString(), kind: "EVENT" as const, type: e.type, actor: null, actorName: null, summary: e.type, refId: e.id })),
      ...calls.map((c) => ({ at: c.startedAt.toISOString(), kind: "CALL" as const, type: "call", actor: c.byActor, actorName: nameOf(c.byActor),
        summary: `${c.direction === "IN" ? "Incoming" : "Outgoing"} call: ${OUTCOME_WORDS[c.outcome] ?? c.outcome}${c.seconds ? (c.seconds < 60 ? ` (${c.seconds} s)` : ` (${Math.round(c.seconds / 60)} min)`) : ""}${c.notes ? `. ${c.notes}` : ""}`, refId: c.id })),
      ...notes.map((n) => ({ at: n.createdAt.toISOString(), kind: "NOTE" as const, type: "note", actor: n.byActor, actorName: nameOf(n.byActor), summary: n.text, refId: n.id })),
    ].map((x) => TimelineLine.parse(x));
    // Oldest first; at the same moment an audit line comes before the call or note it records.
    const order = { AUDIT: 0, EVENT: 1, CALL: 2, NOTE: 3 } as const;
    all.sort((a, b) => a.at.localeCompare(b.at) || order[a.kind] - order[b.kind] || (a.refId ?? "").localeCompare(b.refId ?? ""));
    const more = all.length > MAX_LINES;
    return { lines: more ? all.slice(-MAX_LINES) : all, more };
  }
}
