// FO-2 (contracts §2.1, §7; AG-2-4, -13c, -80, -84, -86): staff leads, firm-scoped (404), visibility by common.ts; a change
// is one transaction: the row under its lock, one audit line, the outbox row last.
import { Inject, Injectable } from "@nestjs/common";
import type { FoLeadState, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { EVENT, LeadEventPayload, type EventName } from "../../../../ports/events.ts";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import type { FirmCalendar } from "../../platform/complaints/business-days.ts";
import { forbidden, type StaffContext } from "../../platform/identity/keys.ts";
import { BUSINESS_HOURS, CLOSED_DAYS, readSetting, TIME_ZONE } from "../../platform/settings.ts";
import { arrive, possibleMatch } from "./arrival.ts";
import { actorOf, conflict, email, notFound, phone, sees, text, unprocessable, UUID, visibilityOf, written, type Tx } from "./common.ts";
import { openMinutes } from "./open-minutes.ts";
import { SALES_PORTS, type SalesPorts } from "./public.ts";

export const VIEWS = ["unassigned", "mine", "all", "closed"] as const;
type View = (typeof VIEWS)[number];
type Staff = { id: string; displayName: string; status: string };
const nameOf = (p: { givenNames: string | null; familyName: string | null }) => [p.givenNames, p.familyName].filter(Boolean).join(" ") || "(no name)";
/** BR-4: a deactivated owner shows "(Inactive) Name" and their open leads count as Unassigned. */
const ownerLabel = (s: Staff | undefined) => (s ? `${s.status === "ACTIVE" ? "" : "(Inactive) "}${s.displayName}` : null);

@Injectable()
export class Leads {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(SALES_PORTS) private readonly ports: SalesPorts) {}

  private async staffOf(firmId: string): Promise<Map<string, Staff>> {
    const rows = await this.db.platformStaff.findMany({ where: firmScope(firmId), select: { id: true, displayName: true, status: true } });
    return new Map(rows.map((s) => [s.id, s]));
  }

  /** Unassigned leads (open, no active owner, oldest first), Mine, All open, Closed; each open row with the time it has
   *  waited in the firm's open hours (BR-4, AG-2-13c rule 6), worked out here. */
  async list(ctx: StaffContext, view: unknown) {
    const v = (VIEWS as readonly string[]).includes(String(view ?? "all")) ? (String(view ?? "all") as View) : unprocessable("Choose a view: unassigned, mine, all or closed.", { view: "Unknown view." });
    const vis = await visibilityOf(this.db, ctx);
    if (v === "unassigned" && !vis.seesUnassigned) return forbidden("Unassigned leads are seen by people who may see all leads or assign them.", "MISSING_PERMISSION");
    const staff = await this.staffOf(ctx.firmId);
    const inactive = [...staff.values()].filter((s) => s.status !== "ACTIVE").map((s) => s.id);
    const state: FoLeadState = v === "closed" ? "CLOSED" : "OPEN";
    const where = v === "unassigned" ? { state, OR: [{ ownerStaffId: null }, { ownerStaffId: { in: inactive } }] }
      : v === "mine" ? { state, ownerStaffId: ctx.staffId }
      : vis.seesAll ? { state } : { state, OR: [{ ownerStaffId: ctx.staffId }, ...(vis.seesUnassigned ? [{ ownerStaffId: null }, { ownerStaffId: { in: inactive } }] : [])] };   // in the query, before the page cap (review m5)
    const rows = await this.db.foLead.findMany({
      where: firmScope(ctx.firmId, where), orderBy: v === "unassigned" ? [{ arrivedAt: "asc" }, { id: "asc" }] : [{ arrivedAt: "desc" }, { id: "asc" }], take: 500,
      include: { person: { select: { givenNames: true, familyName: true, phoneReadable: true } }, interestedIn: { select: { label: true } } },
    });
    const unowned = (o: string | null) => o === null || inactive.includes(o);
    const cal: FirmCalendar = { zone: await readSetting(this.db, ctx.firmId, TIME_ZONE.key), hours: await readSetting(this.db, ctx.firmId, BUSINESS_HOURS.key), closedDays: await readSetting(this.db, ctx.firmId, CLOSED_DAYS.key) };
    const now = new Date(this.ports.now?.() ?? Date.now());
    return rows.filter((l) => v === "unassigned" || sees(vis, ctx, unowned(l.ownerStaffId) ? null : l.ownerStaffId)).map((l) => ({
      id: l.id, number: l.number, name: nameOf(l.person), state: l.state, source: l.source, interestedIn: l.interestedIn?.label ?? null,
      ownerStaffId: l.ownerStaffId, owner: ownerLabel(l.ownerStaffId ? staff.get(l.ownerStaffId) : undefined), arrivedAt: l.arrivedAt,
      possibleMatch: l.possibleMatchPersonId !== null, fixNumber: !l.person.phoneReadable,
      waitedOpenMinutes: l.state === "OPEN" ? openMinutes(l.arrivedAt, now, cal) : null,
    }));
  }

  /** Who a lead can be assigned to (Lead B on #1813): active staff holding agent/prospect:edit, listed only for a viewer
   *  who may assign; oneUser when the firm has exactly one active staff member (X-4: Take it and Assign are hidden). */
  async assignees(ctx: StaffContext) {
    const active = await this.db.platformStaff.findMany({ where: firmScope(ctx.firmId, { status: "ACTIVE" as const }), select: { id: true, displayName: true }, orderBy: [{ displayName: "asc" }, { id: "asc" }] });
    if (!ctx.keys.includes("agent/prospect:assign")) return { oneUser: active.length === 1, assignees: [] };
    const editors = await this.editors(this.db, ctx.firmId);
    return { oneUser: active.length === 1, assignees: active.filter((a) => editors.has(a.id)).map((a) => ({ staffId: a.id, displayName: a.displayName })) };
  }

  /** The firm's staff whose live roles hold agent/prospect:edit (the people who can work a lead). */
  private async editors(db: Tx | PrismaClient, firmId: string): Promise<Set<string>> {
    const rows = await db.$queryRaw<{ staff_id: string }[]>`select distinct g.staff_id::text from platform_role_grant g join platform_role_permission p on p.role = g.role
      where g.firm_id = ${firmScope(firmId).firmId}::uuid and g.ended_at is null and p.permission_key = 'agent/prospect:edit'`;
    return new Set(rows.map((r) => r.staff_id));
  }

  /** One lead, if the viewer sees it (404 otherwise, the same as another firm's). The possible-match line names only a
   *  person the viewer may see (BR-2, AG-2-94 §12). */
  async read(ctx: StaffContext, id: string) {
    const { lead, vis, staff } = await this.visible(ctx, id);
    let possibleMatch: { personId: string | null; line: string } | null = null;
    if (lead.possibleMatchPersonId) {
      const other = await this.db.foPerson.findFirst({ where: firmScope(ctx.firmId, { id: lead.possibleMatchPersonId }), include: { leads: { select: { number: true, ownerStaffId: true, state: true } } } });
      const seen = other?.leads.find((l) => sees(vis, ctx, l.ownerStaffId && staff.get(l.ownerStaffId)?.status === "ACTIVE" ? l.ownerStaffId : null));
      possibleMatch = other && seen ? { personId: other.id, line: `Possible match: ${nameOf(other)} (${seen.number})` } : { personId: null, line: "Possible match with a person you cannot see" };
    }
    return {
      id: lead.id, number: lead.number, label: "Lead", state: lead.state, door: lead.door, source: lead.source, sourceDetail: lead.sourceDetail,
      interestedIn: lead.interestedIn?.label ?? null, ownerStaffId: lead.ownerStaffId, owner: ownerLabel(lead.ownerStaffId ? staff.get(lead.ownerStaffId) : undefined),
      arrivedAt: lead.arrivedAt, firstResponseAt: lead.firstResponseAt, closeReason: lead.closeReason?.label ?? null, closeNote: lead.closeNote, closedAt: lead.closedAt,
      person: { id: lead.person.id, givenNames: lead.person.givenNames, familyName: lead.person.familyName, email: lead.person.email, phone: lead.person.phone, fixNumber: !lead.person.phoneReadable },
      possibleMatch, attribution: lead.attribution ? Object.fromEntries(Object.entries(lead.attribution).filter(([k, x]) => x !== null && !["firmId", "leadId", "createdAt"].includes(k))) : null,
    };
  }

  private async visible(ctx: StaffContext, id: string) {
    if (typeof id !== "string" || !UUID.test(id)) return notFound();
    const [lead, vis, staff] = await Promise.all([
      this.db.foLead.findFirst({ where: firmScope(ctx.firmId, { id }), include: { person: true, interestedIn: { select: { label: true } }, closeReason: { select: { label: true } }, attribution: true } }),
      visibilityOf(this.db, ctx), this.staffOf(ctx.firmId),
    ]);
    if (!lead) return notFound();
    const active = lead.ownerStaffId && staff.get(lead.ownerStaffId)?.status === "ACTIVE" ? lead.ownerStaffId : null;
    if (!sees(vis, ctx, active)) return notFound();
    return { lead, vis, staff };
  }

  /** Take it (AG-2-86): only an open lead with no active owner; someone who took it first wins, and the second hears who. */
  take(ctx: StaffContext, id: string) {
    return this.change(ctx, id, EVENT.LEAD_TAKEN, EVENT.LEAD_TAKEN, async (tx, l, staff) => {
      const owner = l.owner_staff_id ? staff.get(l.owner_staff_id) : undefined;
      if (owner?.status === "ACTIVE") return conflict(`${owner.displayName} already has this lead.`, "ALREADY_TAKEN", { ownerStaffId: owner.id });
      if (l.state !== "OPEN") return conflict("Only an open lead can be taken.");
      await tx.foLead.update({ where: { id }, data: { ownerStaffId: ctx.staffId } });
      return { owner: ctx.staffId, summary: "took the lead" };
    });
  }

  /** Add a lead by hand (AG-2-4): checks for a known person first (409 KNOWN_PERSON with the matches the adder may see,
   *  unless the request picks one, `personId`, or says it is someone new, `confirmedNew`); the adder owns it (rule 8). */
  async add(ctx: StaffContext, b: Record<string, unknown>) {
    const requestId = typeof b.requestId === "string" && UUID.test(b.requestId) ? b.requestId.toLowerCase() : unprocessable("requestId: a uuid the screen makes once per Add.", { requestId: "Missing." });
    const person = {
      givenNames: text(b.givenNames, { field: "givenNames", what: "First name", max: 100, required: b.personId === undefined }),
      familyName: text(b.familyName, { field: "familyName", what: "Last name", max: 100 }), email: email(b.email), phone: phone(b.phone),
    };
    const source = text(b.source, { field: "source", what: "Source", max: 60 }) ?? "MANUAL";
    const message = text(b.note, { field: "note", what: "Note", max: 5000, multiline: true });
    const interestedInServiceId = await this.service(ctx.firmId, b.interestedIn);
    let existingPersonId: string | undefined;
    if (b.personId !== undefined) existingPersonId = typeof b.personId === "string" && UUID.test(b.personId) ? b.personId.toLowerCase() : notFound("person");
    else {
      if (!person.email && !person.phone) unprocessable("Add an email or a phone number.", { email: "Add an email or a phone number." });
      const match = b.confirmedNew === true ? null : await possibleMatch(this.db, ctx.firmId, person);
      if (match) {
        const [vis, leads, p] = await Promise.all([visibilityOf(this.db, ctx), this.db.foLead.findMany({ where: firmScope(ctx.firmId, { personId: match }), select: { number: true, ownerStaffId: true }, orderBy: { arrivedAt: "desc" } }), this.db.foPerson.findFirstOrThrow({ where: firmScope(ctx.firmId, { id: match }) })]);
        const seen = leads.find((l) => sees(vis, ctx, l.ownerStaffId));
        return conflict("This person may already be on file. Pick them, or say it is someone new.", "KNOWN_PERSON", {
          matches: [seen ? { personId: match, name: nameOf(p), lead: seen.number } : { personId: null, name: "A person you cannot see" }],
        });
      }
    }
    const out = await this.db.$transaction((tx) => arrive(tx, {
      firmId: ctx.firmId, door: "MANUAL", intakeKey: `manual:${requestId}`, person, existingPersonId, source, interestedInServiceId, message, ownerStaffId: ctx.staffId,
      actor: actorOf(ctx), payloadHash: createHash("sha256").update(JSON.stringify([person, existingPersonId, source, interestedInServiceId, message])).digest("hex"),
    }, this.ports));
    return this.read(ctx, out.leadId!);
  }

  private async service(firmId: string, v: unknown): Promise<string | null> {
    if (v === undefined || v === null || v === "") return null;
    const s = typeof v === "string" && UUID.test(v) ? await this.db.foService.findFirst({ where: firmScope(firmId, { id: v, active: true }), select: { id: true } }) : null;
    return s?.id ?? unprocessable("Choose what they are interested in from the list.", { interestedIn: "Choose from the list." });
  }

  /** Assign to… (AG-2-13c): an open lead to an active staff member of the firm who can work leads (agent/prospect:edit). */
  assign(ctx: StaffContext, id: string, b: Record<string, unknown>) {
    return this.change(ctx, id, "lead.assigned", EVENT.LEAD_TAKEN, async (tx, l, staff) => {
      const to = typeof b.staffId === "string" ? staff.get(b.staffId.toLowerCase()) : undefined;
      if (!to || to.status !== "ACTIVE" || !(await this.editors(tx, ctx.firmId)).has(to.id)) return unprocessable("Choose an active person of your firm who works leads.", { staffId: "Choose a person from the list." });
      if (l.state !== "OPEN") return conflict("Only an open lead can be assigned.");
      if (l.owner_staff_id === to.id) return conflict(`${to.displayName} already has this lead.`, "ALREADY_TAKEN", { ownerStaffId: to.id });
      await tx.foLead.update({ where: { id }, data: { ownerStaffId: to.id } });
      return { owner: to.id, summary: `assigned the lead to staff ${to.id}` };
    });
  }

  /** Close a lead with a reason from the firm's list (AG-2-80 rules 2-3; a system reason is set only by the system). */
  close(ctx: StaffContext, id: string, b: Record<string, unknown>) {
    return this.change(ctx, id, EVENT.LEAD_CLOSED, EVENT.LEAD_CLOSED, async (tx, l) => {
      const reason = typeof b.reasonId === "string" && UUID.test(b.reasonId)
        ? await tx.foReason.findFirst({ where: firmScope(ctx.firmId, { id: b.reasonId, kind: "LEAD_CLOSE" as const, active: true, isSystem: false }) }) : null;
      if (!reason) return unprocessable("Choose why you are closing it.", { reasonId: "Choose why you are closing it." });
      const note = text(b.note, { field: "note", what: "Note", max: 2000, multiline: true });
      if (l.state !== "OPEN") return conflict(l.state === "CLOSED" ? "This lead is already closed." : "An engaged lead stays engaged (AG-2-80 rule 5).");
      await tx.foLead.update({ where: { id }, data: { state: "CLOSED", closeReasonId: reason.id, closeReasonKind: "LEAD_CLOSE", closeNote: note, closedAt: new Date(), closedBy: actorOf(ctx) } });
      return { owner: l.owner_staff_id, summary: `closed the lead (${reason.key})`, reasonKey: reason.key, state: "CLOSED" as const };
    });
  }

  /** Reopen a closed lead with a reason (AG-2-80): open again with its owner; the reason is kept as an INTERNAL note. */
  reopen(ctx: StaffContext, id: string, b: Record<string, unknown>) {
    return this.change(ctx, id, EVENT.LEAD_REOPENED, EVENT.LEAD_REOPENED, async (tx, l) => {
      const why = text(b.reason, { field: "reason", what: "Reason", max: 2000, required: true, multiline: true })!;
      if (l.state !== "CLOSED") return conflict("Only a closed lead can be reopened.");
      await tx.foLead.update({ where: { id }, data: { state: "OPEN", closeReasonId: null, closeReasonKind: null, closeNote: null, closedAt: null, closedBy: null } });
      await tx.foNote.create({ data: { firmId: ctx.firmId, personId: l.person_id, leadId: id, visibility: "INTERNAL", text: `Reopened: ${why}`, byActor: actorOf(ctx) } });
      return { owner: l.owner_staff_id, summary: "reopened the lead", state: "OPEN" as const };
    });
  }

  /** One lead change: the row locked, then seen (404, or 409 naming the owner), the change, audit, outbox row last. */
  private async change(ctx: StaffContext, id: string, action: string, type: EventName,
    fn: (tx: Tx, l: { state: FoLeadState; owner_staff_id: string | null; person_id: string; door: "WEB_FORM" | "MANUAL" | "BOOKING"; number: string }, staff: Map<string, Staff>) =>
      Promise<{ owner: string | null; summary: string; reasonKey?: string; state?: FoLeadState }>) {
    if (typeof id !== "string" || !UUID.test(id)) return notFound();
    const [staff, vis] = await Promise.all([this.staffOf(ctx.firmId), visibilityOf(this.db, ctx)]);
    const activeOf = (o: string | null) => (o && staff.get(o)?.status === "ACTIVE" ? o : null);
    id = id.toLowerCase();
    await this.db.$transaction(async (tx) => {
      const [l] = await tx.$queryRaw<{ state: FoLeadState; owner_staff_id: string | null; person_id: string; door: "WEB_FORM" | "MANUAL" | "BOOKING"; number: string }[]>`
        select state, owner_staff_id::text, person_id::text, door, number from fo_lead where firm_id = ${ctx.firmId}::uuid and id = ${id}::uuid for update`;
      // Seen under the lock: a change never lands on a lead the person may not see (break M2). Someone who could see it
      // unowned (Unassigned leads) hears who got there first, whatever the timing (AG-2-86 rule 3, Lead B); else 404.
      const owner = l?.owner_staff_id ? staff.get(l.owner_staff_id) : undefined;
      if (!l) return notFound();
      if (!sees(vis, ctx, activeOf(l.owner_staff_id))) return vis.seesUnassigned && owner?.status === "ACTIVE" ? conflict(`${owner.displayName} already has this lead.`, "ALREADY_TAKEN", { ownerStaffId: owner.id }) : notFound();
      const r = await fn(tx, l, staff);
      await written(tx, this.ports.audit, {
        firmId: ctx.firmId, actor: actorOf(ctx), action, entityKey: id, summary: `Staff ${ctx.staffId} ${r.summary}: ${l.number}.`,
        detail: { ownerStaffId: r.owner, previousOwnerStaffId: l.owner_staff_id, ...(r.reasonKey ? { reasonKey: r.reasonKey } : {}) },
        event: { type, subjectId: id, payload: LeadEventPayload.parse({ leadId: id, personId: l.person_id, door: l.door, state: r.state ?? l.state, ownerStaffId: r.owner, ...(r.reasonKey ? { reasonKey: r.reasonKey } : {}) }) },
      });
    });
    return this.read(ctx, id);
  }
}
