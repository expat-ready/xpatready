// FO-2 part 3b (QA-511, R1.28; ports/arrival.ts; AG-2-84 rule 8, AG-2-26 rules 6 and 8, AG-4-19): the real ArrivalPort.
// A public booking runs front office's one arrival path (`arrive`, door BOOKING, key `booking:<booking id>`) inside the
// booking's own transaction. A booker whose email is that of one person of the firm with an open prospect makes no new
// person or lead (receipt ON_OPEN_PROSPECT); that person's only open prospect moves forward to Consult with the cause
// BOOKING ("consult booked"), never backward, and several open prospects move none. With no tick, no consent row is
// written (QA-511); with one, it is recorded through ConsentPort with the firm's wording (source BOOKING_FORM).
import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import type { AuditPort } from "../../../../ports/audit.ts";
import { arrivalKey, ArrivalPerson, ArrivalResult, BookingArrival, type ArrivalPort, type ConsentWording } from "../../../../ports/arrival.ts";
import type { Channel, ConsentPort, Purpose } from "../../../../ports/consent.ts";
import { EVENT, ProspectMovePayload } from "../../../../ports/events.ts";
import type { z } from "zod";
import { ensureBookingWording, seedFirmFrontOffice } from "../firm-seed.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { arrive } from "./arrival.ts";
import { UUID, type Tx } from "./common.ts";

/** The lead's source for a booking arrival (AG-02 glossary: where a lead came from). */
export const BOOKING_SOURCE = "Booking page";
/** The public booking page's actor (as the booking service's own lines). */
const ACTOR = "system:booking-page";
/** A staff booking's move: the port is given no staff member, so the line names the booking door (the booking's own audit line names who booked). */
const STAFF_BOOKING = "system:staff-booking";
/** The booking tick is the marketing consent of AG-4-19 (no tick: no marketing consent, ports/arrival.ts). */
const WORDING = { channel: "EMAIL" as Channel, purpose: "MARKETING" as Purpose };

export class PrismaArrival implements ArrivalPort<Tx | PrismaClient> {
  constructor(private readonly ports: { audit: AuditPort<Tx>; consent: ConsentPort<Tx> }) {}

  async bookingArrived(txIn: Tx | PrismaClient, arrival: BookingArrival): Promise<ArrivalResult> {
    const tx = txIn as Tx;
    const a = BookingArrival.parse(arrival);
    const firmId = firmScope(a.firmId).firmId, key = arrivalKey(a.bookingId);
    const repeat = async () => {
      const r = await tx.foArrivalReceipt.findUnique({ where: { firmId_door_intakeKey: { firmId, door: "BOOKING", intakeKey: key } }, select: { personId: true, outcome: true } });
      if (!r?.personId) return null;
      return ArrivalResult.parse({ personId: r.personId, ...(r.outcome === "ON_OPEN_PROSPECT" ? await this.onlyOpen(tx, firmId, r.personId) : {}) });
    };
    const seen = await repeat();
    if (seen) return seen;   // idempotent by key: the same ids, nothing written
    await this.setup(tx, firmId);
    // The same locks arrive() takes, in its order (email and phone, sorted), so a booking and another door's arrival by one
    // person are serialised and never deadlock (break m1); arrive() takes them again (an advisory lock is re-entrant).
    for (const k of [a.person.email, a.person.phone ?? null].filter((x): x is string => !!x).sort()) await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`fo_sales_match:${firmId}:${k}`}, 0))`;
    // AG-2-84 rule 8: the people of the firm with this email who have an open prospect (stage kind ACTIVE, AG-2-26 rule
    // 12). The prospect rows are locked, so one marked lost meanwhile is seen as it is after that commit (break m2).
    // The rows are locked alone, then their stages read (review M1, as prospects.ts: a join re-checked after a lock wait
    // drops a row whose stage changed meanwhile).
    const locked = await tx.$queryRaw<{ id: string; person_id: string }[]>`
      select p.id::text, p.primary_contact_person_id::text as person_id from fo_prospect p
        join fo_person f on f.firm_id = p.firm_id and f.id = p.primary_contact_person_id
       where p.firm_id = ${firmId}::uuid and lower(f.email) = ${a.person.email} order by p.id for update of p`;
    const rows = locked.length ? await tx.$queryRaw<{ person_id: string }[]>`
      select p.primary_contact_person_id::text as person_id from fo_prospect p join fo_stage s on s.firm_id = p.firm_id and s.id = p.stage_id
       where p.firm_id = ${firmId}::uuid and p.id = any(${locked.map((l) => l.id)}::uuid[]) and s.kind = 'ACTIVE'` : [];
    const holders = [...new Set(rows.map((r) => r.person_id))].map((person_id) => ({ person_id }));
    let wording: { wordingId: string; channel: Channel; purpose: Purpose; locale: string; givenAt: Date } | null = null;
    if (a.consent) {
      // Only the firm's current booking wording (break m4): the booking side refuses an older one with 409 first.
      const current = await this.bookingConsentWording(tx, firmId);
      const w = current && current.wordingId.toLowerCase() === a.consent.wordingId.toLowerCase() ? await tx.msgConsentWording.findFirst({ where: firmScope(firmId, { id: current.wordingId, ...WORDING }), select: { id: true, locale: true } }) : null;
      if (!w) throw new Error("bookingArrived: the consent wording is not the firm's current booking wording");   // the booking side checked it; a mismatch is a fault
      wording = { wordingId: w.id, ...WORDING, locale: w.locale, givenAt: a.consent.givenAt };
    }
    const p = a.person;
    // FO-10 part 2 (AG-2-85 rule 1(b)): the booking row is written before its arrival, in this transaction; its one host owns the lead.
    const host = (await tx.$queryRaw<{ staff_id: string }[]>`select staff_id::text from fo_booking where firm_id = ${firmId}::uuid and id = ${a.bookingId}::uuid`)[0]?.staff_id;
    const out = await arrive(tx, {
      firmId, door: "BOOKING", intakeKey: key, source: BOOKING_SOURCE, ...(host ? { bookingHostStaffId: host } : {}),
      person: { givenNames: p.givenNames, familyName: p.familyName, email: p.email, phone: p.phone ? { phone: p.phone, readable: p.phoneReadable !== false } : null },
      consent: wording, actor: ACTOR, ...(holders.length === 1 ? { onOpenProspectPersonId: holders[0].person_id } : {}),
      payloadHash: createHash("sha256").update(JSON.stringify([p, a.consent?.wordingId ?? null])).digest("hex"),
    }, this.ports);
    if (!out.created) return (await repeat())!;   // a repeat that raced in on the receipt's key
    const prospectId = holders.length === 1 ? await this.moveToConsult(tx, firmId, holders[0].person_id) : undefined;
    if (holders.length === 1 && p.phone) await this.keepPhone(tx, firmId, holders[0].person_id, p.phone, p.phoneReadable !== false, prospectId);
    return ArrivalResult.parse({ personId: out.personId!, ...(prospectId ? { prospectId } : {}) });
  }

  /** A booking staff make for a person on file (AG-4-63): no arrival and no lead; the only open prospect moves forward.
   *  Null for a person not of this firm. Idempotent: the move is forward only, so a repeat moves nothing. */
  async bookingForPerson(txIn: Tx | PrismaClient, b: { firmId: string; personId: string; bookingId: string }) {
    const tx = txIn as Tx;
    const firmId = firmScope(b.firmId).firmId;
    if (!UUID.test(b.personId)) return null;   // a strict uuid (break m7), as the read, never a database error
    const person = await tx.foPerson.findFirst({ where: firmScope(firmId, { id: b.personId.toLowerCase() }), select: { id: true } });
    if (!person) return null;
    const prospectId = await this.moveToConsult(tx, firmId, person.id, STAFF_BOOKING);
    return prospectId ? { prospectId } : {};
  }

  /** The firm's booking consent sentence: its newest published EMAIL marketing wording (PF-19a), or null (no tick). */
  async bookingConsentWording(db: Tx | PrismaClient, firmId: string): Promise<ConsentWording | null> {
    const id = firmScope(firmId).firmId;
    const read = () => db.msgConsentWording.findFirst({ where: firmScope(id, WORDING), orderBy: [{ publishedAt: "desc" }, { version: "desc" }], select: { id: true, text: true } });
    let w = await read();
    if (!w) {
      // A firm with no wording yet (seeded before part 3b, or never) gets the Sample one, once (Lead B's ruling on #2196).
      if ("$transaction" in db) await db.$transaction((tx) => ensureBookingWording(tx, id, undefined, this.ports.consent));
      else await ensureBookingWording(db, id, undefined, this.ports.consent);
      w = await read();
    }
    return w ? { wordingId: w.id, text: w.text } : null;
  }

  /** The person's contact for the booking's messages, or null when not a person of the firm or without an email. A
   *  missing name part is empty; an unreadable phone is left out. */
  async contactOf(db: Tx | PrismaClient, firmId: string, personId: string): Promise<z.output<typeof ArrivalPerson> | null> {
    if (!UUID.test(personId)) return null;
    const f = await db.foPerson.findFirst({ where: firmScope(firmId, { id: personId.toLowerCase() }), select: { givenNames: true, familyName: true, email: true, phone: true, phoneReadable: true } });
    if (!f) return null;
    // The port's person always has an email (review m2): a person on file without one has no contact the booking's
    // messages could use, so null (the staff booking then answers 404; question on the PR).
    if (!f.email) return null;
    const c: z.input<typeof ArrivalPerson> = { givenNames: f.givenNames ?? "", familyName: f.familyName ?? "", email: f.email, ...(f.phone && f.phoneReadable ? { phone: f.phone } : {}) };
    return c as z.output<typeof ArrivalPerson>;
  }

  /** The phone a booker on file typed (AG-2-10 rule 3; break M1): an empty phone on the person is filled with it; one
   *  on file that differs is never overwritten, the typed number is kept as an INTERNAL note on the prospect instead,
   *  so the host calls the number given. The number is personal data: it stays in fo_person / fo_note, never an audit line. */
  private async keepPhone(tx: Tx, firmId: string, personId: string, phone: string, readable: boolean, prospectId?: string) {
    const f = await tx.foPerson.findFirst({ where: firmScope(firmId, { id: personId }), select: { phone: true, phoneE164: true } });
    if (!f) return;
    // FO-9b: an unreadable number fills an empty phone flagged "Fix number" (P-747), as the other doors keep it.
    if (!f.phone) { await tx.foPerson.update({ where: { id: personId }, data: { phone, phoneReadable: readable } }); return; }
    if ((f.phoneE164 ?? f.phone) === phone) return;
    await tx.foNote.create({ data: { firmId, personId, prospectId: prospectId ?? null, visibility: "INTERNAL", text: `The booking gave the phone number ${phone} (the one on file was kept).`, byActor: ACTOR } });
  }

  /** FO-1a's seed, once, when the firm has no sales setup row yet (as FO-1p's port does): a booking firm whose front
   *  office was never seeded (the demo reset seeds none before FO-2 part 5) gets it in the booking's transaction. A
   *  firm FO-1a seeds none for (DELETED, ABANDONED) fails the booking, never half an arrival. */
  private async setup(tx: Tx, firmId: string): Promise<void> {
    const has = async () => !!(await tx.foSalesSetup.findFirst({ where: firmScope(firmId), select: { firmId: true } }));
    if (await has()) return;
    await seedFirmFrontOffice(tx, firmId);
    if (!(await has())) throw new Error("bookingArrived: this firm has no front office");
  }

  /** The person's open prospects (ACTIVE), as a repeat reads them: the only one, or none when several. */
  private async onlyOpen(tx: Tx, firmId: string, personId: string): Promise<{ prospectId?: string }> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      select p.id::text from fo_prospect p join fo_stage s on s.firm_id = p.firm_id and s.id = p.stage_id
       where p.firm_id = ${firmId}::uuid and p.primary_contact_person_id = ${personId}::uuid and s.kind = 'ACTIVE'`;
    return rows.length === 1 ? { prospectId: rows[0].id } : {};
  }

  /** AG-2-26 rules 6 and 8: the person's only open prospect moves forward to its pipeline's CONSULT stage with the cause
   *  BOOKING, once; one already at or past Consult stays; several open prospects move none. Locked in id order. */
  private async moveToConsult(tx: Tx, firmId: string, personId: string, actor = ACTOR): Promise<string | undefined> {
    // The person's prospects locked alone, in id order, then read with their stages (review M1): a staff move committed
    // while this waited is seen as it is now, so "only open prospect" is counted on the rows as they stand.
    const ids = (await tx.$queryRaw<{ id: string }[]>`
      select id::text from fo_prospect where firm_id = ${firmId}::uuid and primary_contact_person_id = ${personId}::uuid order by id for update`).map((r) => r.id);
    const open = ids.length ? await tx.$queryRaw<{ id: string; number: string; type: "INDIVIDUAL" | "CORPORATE"; lead_id: string; owner_staff_id: string | null; stage_id: string; key: string; sort_order: number }[]>`
      select p.id::text, p.number, p.type, p.lead_id::text, p.owner_staff_id::text, p.stage_id::text, s.key, s.sort_order
        from fo_prospect p join fo_stage s on s.firm_id = p.firm_id and s.id = p.stage_id
       where p.firm_id = ${firmId}::uuid and p.id = any(${ids}::uuid[]) and s.kind = 'ACTIVE' order by p.id` : [];
    if (open.length !== 1) return undefined;
    const p = open[0];
    const consult = await tx.foStage.findFirst({ where: firmScope(firmId, { pipeline: p.type, key: "CONSULT", active: true }), select: { id: true, key: true, sortOrder: true } });
    if (!consult || p.sort_order >= consult.sortOrder) return p.id;   // already at or past Consult: never backward
    const last = await tx.foStageMove.findFirst({ where: firmScope(firmId, { prospectId: p.id }), orderBy: { seq: "desc" }, select: { toStageId: true } });
    await tx.foProspect.update({ where: { id: p.id }, data: { stageId: consult.id } });
    await tx.foStageMove.create({ data: { firmId, prospectId: p.id, fromStageId: last?.toStageId ?? null, toStageId: consult.id, cause: "BOOKING", byActor: actor } });
    await this.ports.audit.record(tx, { firmId, actor, action: EVENT.PROSPECT_STAGE_MOVED, entity: "fo_prospect", entityKey: p.id, summary: `Consult booked: ${p.number} moved from ${p.key} to ${consult.key}.`, detail: { fromStageKey: p.key, toStageKey: consult.key, cause: "BOOKING" },
      before: { stage: p.key }, after: { stage: consult.key } });
    await tx.moduleEvent.create({ data: { firmId, type: EVENT.PROSPECT_STAGE_MOVED, subjectId: p.id, payload: ProspectMovePayload.parse({ prospectId: p.id, leadId: p.lead_id, type: p.type, fromStageKey: p.key, stageKey: consult.key, ownerStaffId: p.owner_staff_id, cause: "BOOKING" }) } });
    return p.id;
  }
}
