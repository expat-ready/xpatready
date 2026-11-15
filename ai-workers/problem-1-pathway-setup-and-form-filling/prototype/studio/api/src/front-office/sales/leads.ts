// FO-2 part 1 (contracts §2.1, §7; AG-2-13c Unassigned leads, AG-2-84 match, AG-2-86 Take it): staff leads (part 2 adds
// Add a lead, Close, Reopen). Firm-scoped (another firm's id 404), visibility by common.ts; a change is one transaction:
// the lead row under its lock, one audit line through AuditPort, the outbox row last.
import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { FoLeadState, PrismaClient } from "@prisma/client";
import { EVENT, LeadEventPayload, type EventName } from "../../../../ports/events.ts";
import { Db } from "../../core.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { forbidden, type StaffContext } from "../../platform/identity/keys.ts";
import { actorOf, conflict, notFound, sees, unprocessable, UUID, visibilityOf, written, type Tx } from "./common.ts";
import { SALES_PORTS, type SalesPorts } from "./public.ts";

export const VIEWS = ["unassigned", "mine", "all"] as const;
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

  /** Unassigned leads (open, no active owner, oldest first), Mine, All open (part 2 adds Closed). */
  async list(ctx: StaffContext, view: unknown) {
    const v = (VIEWS as readonly string[]).includes(String(view ?? "all")) ? (String(view ?? "all") as View) : unprocessable("Choose a view: unassigned, mine or all.", { view: "Unknown view." });
    const vis = await visibilityOf(this.db, ctx);
    if (v === "unassigned" && !vis.seesUnassigned) return forbidden("Unassigned leads are seen by people who may see all leads or assign them.", "MISSING_PERMISSION");
    const staff = await this.staffOf(ctx.firmId);
    const inactive = [...staff.values()].filter((s) => s.status !== "ACTIVE").map((s) => s.id);
    const state: FoLeadState = "OPEN";
    const where = v === "unassigned" ? { state, OR: [{ ownerStaffId: null }, { ownerStaffId: { in: inactive } }] }
      : v === "mine" ? { state, ownerStaffId: ctx.staffId } : { state };
    const rows = await this.db.foLead.findMany({
      where: firmScope(ctx.firmId, where), orderBy: v === "unassigned" ? [{ arrivedAt: "asc" }, { id: "asc" }] : [{ arrivedAt: "desc" }, { id: "asc" }], take: 500,
      include: { person: { select: { givenNames: true, familyName: true, phoneReadable: true } }, interestedIn: { select: { label: true } } },
    });
    const unowned = (o: string | null) => o === null || inactive.includes(o);
    return rows.filter((l) => v === "unassigned" || sees(vis, ctx, unowned(l.ownerStaffId) ? null : l.ownerStaffId)).map((l) => ({
      id: l.id, number: l.number, name: nameOf(l.person), state: l.state, source: l.source, interestedIn: l.interestedIn?.label ?? null,
      ownerStaffId: l.ownerStaffId, owner: ownerLabel(l.ownerStaffId ? staff.get(l.ownerStaffId) : undefined), arrivedAt: l.arrivedAt,
      possibleMatch: l.possibleMatchPersonId !== null, fixNumber: !l.person.phoneReadable,
    }));
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
    return this.change(ctx, id, "lead.taken", EVENT.LEAD_TAKEN, async (tx, l, staff) => {
      const owner = l.owner_staff_id ? staff.get(l.owner_staff_id) : undefined;
      if (owner?.status === "ACTIVE") return conflict(`${owner.displayName} already has this lead.`, "ALREADY_TAKEN", { ownerStaffId: owner.id });
      if (l.state !== "OPEN") return conflict("Only an open lead can be taken.");
      await tx.foLead.update({ where: { id }, data: { ownerStaffId: ctx.staffId } });
      return { owner: ctx.staffId, summary: "took the lead" };
    });
  }

  /** Assign to… (AG-2-13c): an open lead to an active staff member of the firm. */
  assign(ctx: StaffContext, id: string, b: Record<string, unknown>) {
    return this.change(ctx, id, "lead.assigned", EVENT.LEAD_TAKEN, async (tx, l, staff) => {
      const to = typeof b.staffId === "string" ? staff.get(b.staffId.toLowerCase()) : undefined;
      if (!to || to.status !== "ACTIVE") return unprocessable("Choose an active person of your firm.", { staffId: "Choose an active person." });
      if (l.state !== "OPEN") return conflict("Only an open lead can be assigned.");
      if (l.owner_staff_id === to.id) return conflict(`${to.displayName} already has this lead.`, "ALREADY_TAKEN", { ownerStaffId: to.id });
      await tx.foLead.update({ where: { id }, data: { ownerStaffId: to.id } });
      return { owner: to.id, summary: `assigned the lead to staff ${to.id}` };
    });
  }

  /** One lead change: visible (404), the row locked and read again, the change, the audit line, the outbox row last. */
  private async change(ctx: StaffContext, id: string, action: string, type: EventName,
    fn: (tx: Tx, l: { state: FoLeadState; owner_staff_id: string | null; person_id: string; door: "WEB_FORM" | "MANUAL" | "BOOKING"; number: string }, staff: Map<string, Staff>) =>
      Promise<{ owner: string | null; summary: string }>) {
    const { staff } = await this.visible(ctx, id);
    id = id.toLowerCase();
    await this.db.$transaction(async (tx) => {
      const [l] = await tx.$queryRaw<{ state: FoLeadState; owner_staff_id: string | null; person_id: string; door: "WEB_FORM" | "MANUAL" | "BOOKING"; number: string }[]>`
        select state, owner_staff_id::text, person_id::text, door, number from fo_lead where firm_id = ${ctx.firmId}::uuid and id = ${id}::uuid for update`;
      if (!l) return notFound();
      const r = await fn(tx, l, staff);
      await written(tx, this.ports.audit, {
        firmId: ctx.firmId, actor: actorOf(ctx), action, entity: "fo_lead", entityKey: id, summary: `Staff ${ctx.staffId} ${r.summary}: ${l.number}.`,
        detail: { ownerStaffId: r.owner },
        event: { type, subjectId: id, payload: LeadEventPayload.parse({ leadId: id, personId: l.person_id, door: l.door, state: l.state, ownerStaffId: r.owner }) },
      });
    });
    // The viewer may no longer see it (assigned to someone else while "everyone sees all" is off): say it is done.
    return this.read(ctx, id).catch((e: unknown) => { if (e instanceof HttpException && e.getStatus() === 404) return { id, done: true }; throw e; });
  }
}
