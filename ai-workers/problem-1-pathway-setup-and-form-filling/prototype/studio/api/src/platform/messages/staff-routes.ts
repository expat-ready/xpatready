// PF-19b part 3 (R1.48; needed by J-48): the staff read of one record's messages, GET /api/platform/messages
// ?subjectKind=&subjectId=[&cursor=], 50 a page, newest first. Each message: its purpose, class, channel, the address
// masked to its first letter and domain, its state and reason, its events with times, and the from-name (the firm's).
// The body is never read or returned (transactional bodies stay sealed, PF-19e): nothing here opens the stored file.
// Who sees it is the subject's own rule, with no new key: a lead (LEAD) or a front-office person (FO_PERSON) through
// agent/prospect:show and the leads' own-or-all rule (front-office/sales/common.ts visibilityOf, sees); a case party
// (CASE_PARTY) through agent/case:show and a case of the viewer's firm. Another firm's subject, one the person may not
// see, a kind not offered here, or a missing key all answer the same 404.
import { Controller, Get, Inject, Injectable, Query, Req } from "@nestjs/common";
import { Db } from "../../core.ts";
import { sees, visibilityOf } from "../../front-office/sales/common.ts";
import { firmScope } from "../firm-scope.ts";
import { AnyStaff, problem, staffOf, type StaffContext } from "../identity/keys.ts";
import { parseInput, query } from "../http/input.ts";

export const PAGE = 50;
export const SUBJECT_KINDS = ["LEAD", "FO_PERSON", "CASE_PARTY"] as const;
type SubjectKind = (typeof SUBJECT_KINDS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURSOR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
/** The one answer for a subject that is not there for this person (another firm's, not theirs to see, or no key). */
export const NOT_FOUND = "No such record in your firm.";
const notFound = (): never => problem(404, "Not found", NOT_FOUND, { code: "NOT_FOUND" });

/** The address as the panel shows it: an email's first letter and its domain (j…@example.com); a phone's first and last
 *  two characters. Never the whole address. */
export function maskAddress(channel: string, address: string): string {
  if (channel === "EMAIL") { const at = address.lastIndexOf("@"); return at > 0 ? `${address[0]}…${address.slice(at)}` : "…"; }
  return address.length > 4 ? `${address[0]}…${address.slice(-2)}` : "…";
}
/** What the message was for: its template's key, else the head of its sending key (MailPort's `mail:<job key>`). */
export function purposeOf(templateKey: string | null | undefined, idempotencyKey: string | null): string | null {
  if (templateKey) return templateKey;
  const head = /^(?:mail:)?([a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)[.:]/.exec(idempotencyKey ?? "")?.[1];
  return head ?? null;
}

@Injectable()
export class StaffMessages {
  constructor(@Inject(Db) private readonly db: Db) {}

  /** The outbox subject (kind and id) behind what the caller named, if the caller may see it; else the 404. */
  private async subject(ctx: StaffContext, kind: SubjectKind, id: string): Promise<{ kind: "FO_PERSON" | "CASE_PARTY"; id: string }> {
    if (kind === "LEAD" || kind === "FO_PERSON") {
      if (!ctx.keys.includes("agent/prospect:show")) return notFound();
      const vis = await visibilityOf(this.db, ctx);
      const active = new Set((await this.db.platformStaff.findMany({ where: firmScope(ctx.firmId, { status: "ACTIVE" as const }), select: { id: true } })).map((s) => s.id));
      const ownerSeen = (owner: string | null) => sees(vis, ctx, owner && active.has(owner) ? owner : null);
      if (kind === "LEAD") {
        const lead = await this.db.foLead.findFirst({ where: firmScope(ctx.firmId, { id }), select: { personId: true, ownerStaffId: true } });
        if (!lead || !ownerSeen(lead.ownerStaffId)) return notFound();
        return { kind: "FO_PERSON", id: lead.personId };
      }
      // A person is seen when one of their leads is (all, the viewer's own, or an unassigned one they may see).
      const person = await this.db.foPerson.findFirst({ where: firmScope(ctx.firmId, { id }), select: { id: true, leads: { select: { ownerStaffId: true } } } });
      if (!person || !(vis.seesAll || person.leads.some((l) => ownerSeen(l.ownerStaffId)))) return notFound();
      return { kind: "FO_PERSON", id: person.id };
    }
    if (!ctx.keys.includes("agent/case:show")) return notFound();
    const part = await this.db.caseParticipant.findFirst({ where: { subjectId: id, case: { firmKey: ctx.firmKey } }, select: { subjectId: true } });
    if (!part) return notFound();
    return { kind: "CASE_PARTY", id: part.subjectId };
  }

  async list(ctx: StaffContext, q: { subjectKind?: string; subjectId?: string; cursor?: string }) {
    const kind = SUBJECT_KINDS.find((k) => k === q.subjectKind);
    if (!kind || typeof q.subjectId !== "string" || !UUID.test(q.subjectId)) return notFound();
    const c = q.cursor === undefined ? null : CURSOR.exec(q.cursor);
    if (q.cursor !== undefined && (!c || Number.isNaN(Date.parse(c[1])) || Number(c[1].slice(0, 4)) < 2000 || new Date(c[1]).toISOString() !== c[1].toUpperCase())) return problem(400, "Check the page", "cursor: the nextCursor of the page before.", { code: "BAD_CURSOR" });
    const s = await this.subject(ctx, kind, q.subjectId.toLowerCase());
    const before = c ? { OR: [{ createdAt: { lt: new Date(c[1]) } }, { createdAt: new Date(c[1]), id: { lt: c[2].toLowerCase() } }] } : {};
    const [rows, firm] = await Promise.all([
      this.db.msgOutbox.findMany({
        where: firmScope(ctx.firmId, { audience: "FIRM" as const, subjectKind: s.kind, subjectId: s.id, ...before }),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: PAGE + 1,
        select: {
          id: true, class: true, channel: true, address: true, state: true, stateReason: true, idempotencyKey: true, createdAt: true, sentAt: true,
          templateVersion: { select: { template: { select: { key: true } } } },
          events: { where: { firmId: firmScope(ctx.firmId).firmId }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], select: { kind: true, occurredAt: true } },
        },
      }),
      this.db.platformFirm.findUnique({ where: { id: firmScope(ctx.firmId).firmId }, select: { operatingName: true } }),
    ]);
    const page = rows.slice(0, PAGE), last = page.at(-1);
    return {
      messages: page.map((r) => ({
        id: r.id, purpose: purposeOf(r.templateVersion?.template.key, r.idempotencyKey), class: r.class, channel: r.channel,
        address: maskAddress(r.channel, r.address), state: r.state, stateReason: r.stateReason, fromName: firm?.operatingName ?? null,
        createdAt: r.createdAt.toISOString(), sentAt: r.sentAt?.toISOString() ?? null,
        events: r.events.map((e) => ({ kind: e.kind, at: e.occurredAt.toISOString() })),
      })),
      nextCursor: rows.length > PAGE && last ? `${last.createdAt.toISOString()}_${last.id}` : null,
    };
  }
}

const one = (v: unknown): string | undefined => (v === undefined ? undefined : typeof v === "string" ? v : "\u0000");

@Controller("api/platform")
export class StaffMessagesController {
  constructor(@Inject(StaffMessages) private readonly x: StaffMessages) {}
  @Get("messages") @AnyStaff("the subject's own rule, checked by the service: agent/prospect:show with own-or-all for a lead or person, agent/case:show for a case party")
  list(@Req() r: { platform?: StaffContext }, @Query() q: Record<string, unknown>) { parseInput(query("subjectKind", "subjectId", "cursor"), q); return this.x.list(staffOf(r), { subjectKind: one(q.subjectKind), subjectId: one(q.subjectId), cursor: one(q.cursor) }); }
}
