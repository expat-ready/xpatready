// PF-21b part 2 (map row 85; SA-11 §3.5, SA-11-40, SA7-D74 (a), SA2-D25, BR-12; brief design/briefs/track-b/PF-21b-2.md):
// our console's legal holds. Only ExpatReady staff holding system/compliance:legal-hold (the Platform Owner, seeded by the
// migration) list, place and release them; every other person, a firm's staff included, gets 403 (the system guard first,
// this service again). The firm a hold covers is the one our staff name: these calls have no firm session, and the
// database refuses them inside one (the definers' system-only check). Place and release each write one line to the held
// firm's trail through AuditPort, in the same transaction (a line that cannot be written rolls the change back, P-607).
// AUD-3a: that line's actor is the staff member's own word, `ourstaff:<id>` (OUR_STAFF), the request's actor; with no
// staff member (the port contract's harness, outside any request) it stays `system:platform.register.legal-hold`. The
// staff member's id stays in its detail too. PF-4s's guard also writes its own line naming the person, the route and the
// reason. The hold's own `by` column keeps its `staff:<id>` form (the port's shape; a later row's). Legal reading
// Unconfirmed: no counsel.
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AuditPort } from "../../../../../ports/audit.ts";
import { FirmId } from "../../../../../ports/audit.ts";
import { LegalHoldCategory, LegalHoldRefused, LEGAL_HOLD_LOCK, legalHoldLockKey, PlaceHoldInput, ReleaseHoldInput, type HoldScope } from "../../../../../ports/legal-hold.ts";
import { Db } from "../../../core.ts";
import { auditEvent } from "../../audit/audit-event.ts";
import { FIELD_ERROR_STATUS, fieldsOf } from "../../http/input.ts";
import { forbidden, problem } from "../../identity/keys.ts";
import { scopeOf, type HoldRow } from "./adapter.ts";
import { firmNames, staffNames } from "../names.ts";

type Tx = Prisma.TransactionClient;
/** SA-07 Appendix A "Place and release legal holds" (Platform Owner only). */
export const LEGAL_HOLD_KEY = "system/compliance:legal-hold";
/** The audit line's actor outside a staff member's request (see the header). */
export const LEGAL_HOLD_ACTOR = "system:platform.register.legal-hold";
/** AUD-3a: the line's actor, our staff member's own word when there is one. */
const actorOf = (staffId?: string) => (staffId ? `ourstaff:${staffId}` : LEGAL_HOLD_ACTOR);
/** The audit port the service writes through (a test gives its own). */
export const LEGAL_HOLD_AUDIT = Symbol("LegalHolds.audit");

/** The caller: PF-4s's SystemStaffContext, or a stand-in with the same two fields. */
export type HoldCaller = { staffId: string; keys: readonly string[] };
export type HoldView = { id: string; firmId: string; scope: HoldScope; reason: string; placedBy: string; placedAt: string; active: boolean; releasedBy: string | null; releasedAt: string | null; releaseReason: string | null };

/** A reason: ordinary text, 1-500 characters; control characters (C0, C1) and the invisible direction marks that can
 *  reorder what a person reads (U+200E, U+200F, U+202A-U+202E, U+2066-U+2069) are refused (break m4). */
const Reason = z.string().trim().min(1, "Give the reason.").max(500, "At most 500 characters.")
  .refine((r) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(r), "Write the reason as ordinary text.");
const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a uuid");
/** A date-range end as a person means it (review M3, break M2): a calendar date (YYYY-MM-DD) is the whole day in UTC, so
 *  `from` is that day's first moment and `to` its last; a full time must carry its zone (Z or an offset). Nothing else
 *  (null, a number, true) is a date. Years 1900-9999 only. */
const RangeEnd = (end: "from" | "to") => z.union([z.iso.date(), z.iso.datetime({ offset: true })], { error: "A date (YYYY-MM-DD) or a time with its zone." })
  .transform((v) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${end === "from" ? "00:00:00.000" : "23:59:59.999"}Z` : v))
  .refine((d) => !Number.isNaN(d.getTime()) && d.getUTCFullYear() >= 1900 && d.getUTCFullYear() <= 9999, "A date between the years 1900 and 9999.");
const ScopeBody = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("FIRM") }),
  z.strictObject({ kind: z.literal("CASE"), id: Uuid }),
  z.strictObject({ kind: z.literal("PERSON"), id: Uuid }),
  z.strictObject({ kind: z.literal("CATEGORY"), category: LegalHoldCategory }),
  z.strictObject({ kind: z.literal("DATE_RANGE"), from: RangeEnd("from"), to: RangeEnd("to") }),
]).refine((s) => s.kind !== "DATE_RANGE" || s.from.getTime() <= s.to.getTime(), { message: "The range ends on or after its start.", path: ["to"] });
const PlaceBody = z.strictObject({ firmId: FirmId, scope: ScopeBody, reason: Reason });
const ReleaseBody = z.strictObject({ reason: Reason });
/** The list's page: at most LIST_MAX holds; `truncated` says more match (break M1, review M2). */
export const LIST_MAX = 500;
const ListQuery = z.strictObject({ firm: FirmId.optional(), state: z.enum(["active", "released", "all"]).optional(), limit: z.coerce.number().int().min(1).max(LIST_MAX).optional() });
/** A transaction that waits behind an open deleter (rule 3) may wait longer than Prisma's 5-second default (break m2). */
const TX = { maxWait: 10_000, timeout: 60_000 } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fields(e: z.ZodError): never { return problem(FIELD_ERROR_STATUS, "Check the highlighted fields", "Some fields need a change.", { code: "LEGAL_HOLD_FIELDS", fields: fieldsOf(e) }); }
const notFound = (): never => problem(404, "Not found", "No such legal hold.", { code: "NOT_FOUND" });
/** A hold's values as the firm's Activity log shows them (QA-594: before and after, in full). */
const valuesOf = (s: HoldScope, reason: string, placedBy: string) => ({ scope: s.kind, target: s.kind === "CASE" || s.kind === "PERSON" ? s.id.toLowerCase() : null,
  category: s.kind === "CATEGORY" ? s.category : null, from: s.kind === "DATE_RANGE" ? s.from.toISOString() : null, to: s.kind === "DATE_RANGE" ? s.to.toISOString() : null, reason, placedBy });
const words = (s: HoldScope) => s.kind === "FIRM" ? "all of the firm's data" : s.kind === "CASE" ? `case ${s.id}` : s.kind === "PERSON" ? `person record ${s.id}` : s.kind === "CATEGORY" ? `the data category ${s.category}` : `records dated ${s.from.toISOString().slice(0, 10)} to ${s.to.toISOString().slice(0, 10)}`;

@Injectable()
export class LegalHolds {
  constructor(@Inject(Db) private readonly db: PrismaClient, @Inject(LEGAL_HOLD_AUDIT) private readonly audit: AuditPort<Tx> = auditEvent) {}

  private allowed(c: HoldCaller) {
    if (!c || !c.keys.includes(LEGAL_HOLD_KEY)) forbidden("Only ExpatReady's Platform Owner places, releases or reads legal holds.", "MISSING_PERMISSION");
  }

  /** POST /api/system/register/holds { firmId, scope, reason }: 201 with the hold. */
  async place(c: HoldCaller, body: unknown): Promise<HoldView> {
    this.allowed(c);
    const p = PlaceBody.safeParse(body ?? {});
    if (!p.success) fields(p.error);
    const { holdId } = await this.placeAs(`staff:${c.staffId}`, { firmId: p.data.firmId, scope: p.data.scope, reason: p.data.reason }, undefined, c.staffId).catch((e) => {
      if (e instanceof LegalHoldRefused) problem(404, "Not found", "No such firm.", { code: "FIRM_NOT_FOUND" });
      throw e;
    });
    return this.one(holdId);
  }

  /** POST /api/system/register/holds/:id/release { reason }: 200 with the released hold; 409 when it is already released. */
  async release(c: HoldCaller, id: string, body: unknown): Promise<HoldView> {
    this.allowed(c);
    if (!UUID.test(id)) notFound();
    const p = ReleaseBody.safeParse(body ?? {});
    if (!p.success) fields(p.error);
    await this.releaseAs({ holdId: id, by: `staff:${c.staffId}`, reason: p.data.reason }, undefined, c.staffId).catch((e) => {
      if (e instanceof LegalHoldRefused && e.code === "NOT_FOUND") notFound();
      if (e instanceof LegalHoldRefused) problem(409, "Already released", "This hold is already released; nothing was changed.", { code: "ALREADY_RELEASED" });
      throw e;
    });
    return this.one(id.toLowerCase());
  }

  /** GET /api/system/register/holds?firm=&state=active|released|all (default all)&limit= (1-500, default 500): newest
   *  first, filtered in the database; `truncated` is true when more holds match than were shown. */
  async list(c: HoldCaller, query: unknown): Promise<{ holds: (HoldView & { firmName: string | null; placedByName: string | null; releasedByName: string | null })[]; truncated: boolean }> {
    this.allowed(c);
    const q = ListQuery.safeParse(query ?? {});
    if (!q.success) fields(q.error);
    const state = q.data.state ?? "all", limit = q.data.limit ?? LIST_MAX;
    const rows = await this.rows({ firm: q.data.firm ?? null, active: state === "all" ? null : state === "active", id: null, limit: limit + 1 });
    const shown = rows.slice(0, limit);
    // PF-21rs R0: each hold's firm and our staff by name, for our console.
    const firms = await firmNames(this.db, shown.map((h) => h.firmId)), people = await staffNames(this.db, shown.flatMap((h) => [h.placedBy, h.releasedBy]));
    return { holds: shown.map((h) => ({ ...h, firmName: firms.get(h.firmId) ?? null, placedByName: people.get(h.placedBy) ?? null, releasedByName: h.releasedBy ? people.get(h.releasedBy) ?? null : null })), truncated: rows.length > limit };
  }

  /** Places a hold in its own transaction under the firm's exclusive hold lock; `during` runs once the lock is held, before
   *  the commit (the port contract's harness). Refused with LegalHoldRefused("NOT_FOUND") for a firm that does not exist. */
  async placeAs(by: string, input: Omit<PlaceHoldInput, "by">, during?: () => Promise<void>, staffId?: string): Promise<{ holdId: string }> {
    const p = PlaceHoldInput.parse({ ...input, by }), firm = p.firmId.toLowerCase(), s = p.scope;
    return this.db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(LEGAL_HOLD_LOCK.exclusive, legalHoldLockKey(firm));
      await during?.();
      let row: { id: string; placed_at: Date };
      try {
        [row] = await tx.$queryRaw<{ id: string; placed_at: Date }[]>`SELECT id::text AS id, placed_at FROM plat_legal_hold_place(${firm}::uuid, ${s.kind},
          ${s.kind === "CASE" || s.kind === "PERSON" ? s.id.toLowerCase() : null}::uuid, ${s.kind === "CATEGORY" ? s.category : null},
          ${s.kind === "DATE_RANGE" ? s.from : null}::timestamptz, ${s.kind === "DATE_RANGE" ? s.to : null}::timestamptz, ${p.reason}, ${p.by})`;
      } catch (e) {
        if (/plat_legal_hold_placed: no such firm/.test(String(e))) throw new LegalHoldRefused("NOT_FOUND", "No such firm.");
        throw e;
      }
      await this.audit.record(tx, { firmId: firm, actor: actorOf(staffId), action: "platform.legal_hold.placed", entity: "plat_legal_hold", entityKey: row.id,
        summary: `ExpatReady placed a legal hold on ${words(s)}: nothing it covers can be deleted until the hold is released.`,
        detail: { scope: s.kind, by: p.by, ...(staffId ? { staffId } : {}) }, before: null, after: { ...valuesOf(s, p.reason, p.by), active: true, placedAt: row.placed_at.toISOString() } });
      return { holdId: row.id };
    }, TX);
  }

  /** Releases a hold in its own transaction under its firm's exclusive lock (`during` as for placeAs). A second release,
   *  also one that waited for a parallel first, is refused (ALREADY_RELEASED) and changes nothing. */
  async releaseAs(input: ReleaseHoldInput, during?: () => Promise<void>, staffId?: string): Promise<void> {
    const r = ReleaseHoldInput.parse(input), id = r.holdId.toLowerCase();
    await this.db.$transaction(async (tx) => {
      const [{ firm }] = await tx.$queryRaw<{ firm: string | null }[]>`SELECT plat_legal_hold_firm(${id}::uuid)::text AS firm`;
      if (!firm) throw new LegalHoldRefused("NOT_FOUND", "No such hold.");
      await tx.$executeRawUnsafe(LEGAL_HOLD_LOCK.exclusive, legalHoldLockKey(firm));
      await during?.();
      const [{ out }] = await tx.$queryRaw<{ out: string }[]>`SELECT plat_legal_hold_release(${id}::uuid, ${r.by}, ${r.reason}) AS out`;
      if (out === "ALREADY_RELEASED") throw new LegalHoldRefused("ALREADY_RELEASED", "This hold is already released.");
      if (out !== "RELEASED") throw new LegalHoldRefused("NOT_FOUND", "No such hold.");
      const [h] = await this.rows({ firm, active: false, id, limit: 1 }, tx);
      if (!h) throw new LegalHoldRefused("NOT_FOUND", "No such hold.");
      const held = valuesOf(h.scope, h.reason, h.placedBy);
      await this.audit.record(tx, { firmId: firm, actor: actorOf(staffId), action: "platform.legal_hold.released", entity: "plat_legal_hold", entityKey: id,
        summary: `ExpatReady released its legal hold on ${words(h.scope)} (placed ${h.placedAt.slice(0, 10)}): what it covered can be deleted again under the usual keep periods.`,
        detail: { by: r.by, ...(staffId ? { staffId } : {}) },
        before: { ...held, active: true, releasedBy: null, releaseReason: null, releasedAt: null },
        after: { ...held, active: false, releasedBy: r.by, releaseReason: r.reason, releasedAt: h.releasedAt } });
    }, TX);
  }

  private async rows(f: { firm: string | null; active: boolean | null; id: string | null; limit: number }, tx: Pick<PrismaClient, "$queryRaw"> = this.db): Promise<HoldView[]> {
    const rows = await tx.$queryRaw<(HoldRow & { firm_id: string; released_by: string | null; released_at: Date | null; release_reason: string | null })[]>`
      SELECT l.id::text AS id, l.firm_id::text AS firm_id, l.scope_kind, l.target_id::text AS target_id, l.category, l.range_from, l.range_to, l.reason,
             l.placed_by, l.placed_at, l.released_by, l.released_at, l.release_reason
        FROM plat_legal_hold_list(${f.firm}::uuid, ${f.active}::boolean, ${f.id}::uuid, ${f.limit}::int) l`;
    return rows.map((r) => ({ id: r.id, firmId: r.firm_id, scope: scopeOf(r), reason: r.reason, placedBy: r.placed_by, placedAt: r.placed_at.toISOString(), active: r.released_at === null,
      releasedBy: r.released_by, releasedAt: r.released_at?.toISOString() ?? null, releaseReason: r.release_reason }));
  }
  /** One hold by its id (never looked up in a capped list: break M1). */
  private async one(id: string): Promise<HoldView> {
    const [hit] = await this.rows({ firm: null, active: null, id, limit: 1 });
    return hit ?? notFound();
  }
}
