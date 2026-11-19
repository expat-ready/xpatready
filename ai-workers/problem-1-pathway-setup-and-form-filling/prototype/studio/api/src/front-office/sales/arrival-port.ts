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
import { firmScope } from "../../platform/firm-scope.ts";
import { arrive } from "./arrival.ts";
import type { Tx } from "./common.ts";

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
    // The same lock arrive() takes for this email, so a booking and a form post by one person are serialised here too.
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`fo_sales_match:${firmId}:${a.person.email}`}, 0))`;
    // AG-2-84 rule 8: the people of the firm with this email who have an open prospect (stage kind ACTIVE, AG-2-26 rule 12).
    const holders = await tx.$queryRaw<{ person_id: string }[]>`
      select distinct p.primary_contact_person_id::text as person_id from fo_prospect p
        join fo_stage s on s.firm_id = p.firm_id and s.id = p.stage_id
        join fo_person f on f.firm_id = p.firm_id and f.id = p.primary_contact_person_id
       where p.firm_id = ${firmId}::uuid and s.kind = 'ACTIVE' and lower(f.email) = ${a.person.email}`;
    let wording: { wordingId: string; channel: Channel; purpose: Purpose; locale: string; givenAt: Date } | null = null;
    if (a.consent) {
      const w = await tx.msgConsentWording.findFirst({ where: firmScope(firmId, { id: a.consent.wordingId.toLowerCase(), ...WORDING }), select: { id: true, locale: true } });
      if (!w) throw new Error("bookingArrived: the consent wording is not the firm's booking wording");   // the booking side checked it; a mismatch is a fault
      wording = { wordingId: w.id, ...WORDING, locale: w.locale, givenAt: a.consent.givenAt };
    }
    const p = a.person;
    const out = await arrive(tx, {
      firmId, door: "BOOKING", intakeKey: key, source: BOOKING_SOURCE,
      person: { givenNames: p.givenNames, familyName: p.familyName, email: p.email, phone: p.phone ? { phone: p.phone, readable: true } : null },
      consent: wording, actor: ACTOR, ...(holders.length === 1 ? { onOpenProspectPersonId: holders[0].person_id } : {}),
      payloadHash: createHash("sha256").update(JSON.stringify([p, a.consent?.wordingId ?? null])).digest("hex"),
    }, this.ports);
    if (!out.created) return (await repeat())!;   // a repeat that raced in on the receipt's key
    const prospectId = holders.length === 1 ? await this.moveToConsult(tx, firmId, holders[0].person_id) : undefined;
    return ArrivalResult.parse({ personId: out.personId!, ...(prospectId ? { prospectId } : {}) });
  }

  /** A booking staff make for a person on file (AG-4-63): no arrival and no lead; the only open prospect moves forward.
   *  Null for a person not of this firm. Idempotent: the move is forward only, so a repeat moves nothing. */
  async bookingForPerson(txIn: Tx | PrismaClient, b: { firmId: string; personId: string; bookingId: string }) {
    const tx = txIn as Tx;
    const firmId = firmScope(b.firmId).firmId;
    if (!/^[0-9a-f-]{36}$/i.test(b.personId)) return null;
    const person = await tx.foPerson.findFirst({ where: firmScope(firmId, { id: b.personId.toLowerCase() }), select: { id: true } });
    if (!person) return null;
    const prospectId = await this.moveToConsult(tx, firmId, person.id, STAFF_BOOKING);
    return prospectId ? { prospectId } : {};
  }

  /** The firm's booking consent sentence: its newest published EMAIL marketing wording (PF-19a), or null (no tick). */
  async bookingConsentWording(db: Tx | PrismaClient, firmId: string): Promise<ConsentWording | null> {
    const w = await db.msgConsentWording.findFirst({ where: firmScope(firmId, WORDING), orderBy: [{ publishedAt: "desc" }, { version: "desc" }], select: { id: true, text: true } });
    return w ? { wordingId: w.id, text: w.text } : null;
  }

  /** The person's contact for the booking's messages, or null when not a person of the firm. A part the record lacks is
   *  empty (a hand-added lead may have a phone and no email); an unreadable phone is left out. */
  async contactOf(db: Tx | PrismaClient, firmId: string, personId: string): Promise<z.output<typeof ArrivalPerson> | null> {
    if (!/^[0-9a-f-]{36}$/i.test(personId)) return null;
    const f = await db.foPerson.findFirst({ where: firmScope(firmId, { id: personId.toLowerCase() }), select: { givenNames: true, familyName: true, email: true, phone: true, phoneReadable: true } });
    if (!f) return null;
    const c: z.input<typeof ArrivalPerson> = { givenNames: f.givenNames ?? "", familyName: f.familyName ?? "", email: f.email ?? "", ...(f.phone && f.phoneReadable ? { phone: f.phone } : {}) };
    return c as z.output<typeof ArrivalPerson>;
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
    const open = await tx.$queryRaw<{ id: string; number: string; type: "INDIVIDUAL" | "CORPORATE"; lead_id: string; owner_staff_id: string | null; stage_id: string; key: string; sort_order: number }[]>`
      select p.id::text, p.number, p.type, p.lead_id::text, p.owner_staff_id::text, p.stage_id::text, s.key, s.sort_order
        from fo_prospect p join fo_stage s on s.firm_id = p.firm_id and s.id = p.stage_id
       where p.firm_id = ${firmId}::uuid and p.primary_contact_person_id = ${personId}::uuid and s.kind = 'ACTIVE' order by p.id for update of p`;
    if (open.length !== 1) return undefined;
    const p = open[0];
    const consult = await tx.foStage.findFirst({ where: firmScope(firmId, { pipeline: p.type, key: "CONSULT", active: true }), select: { id: true, key: true, sortOrder: true } });
    if (!consult || p.sort_order >= consult.sortOrder) return p.id;   // already at or past Consult: never backward
    const last = await tx.foStageMove.findFirst({ where: firmScope(firmId, { prospectId: p.id }), orderBy: { seq: "desc" }, select: { toStageId: true } });
    await tx.foProspect.update({ where: { id: p.id }, data: { stageId: consult.id } });
    await tx.foStageMove.create({ data: { firmId, prospectId: p.id, fromStageId: last?.toStageId ?? null, toStageId: consult.id, cause: "BOOKING", byActor: actor } });
    await this.ports.audit.record(tx, { firmId, actor, action: EVENT.PROSPECT_STAGE_MOVED, entity: "fo_prospect", entityKey: p.id, summary: `Consult booked: ${p.number} moved from ${p.key} to ${consult.key}.`, detail: { fromStageKey: p.key, toStageKey: consult.key, cause: "BOOKING" } });
    await tx.moduleEvent.create({ data: { firmId, type: EVENT.PROSPECT_STAGE_MOVED, subjectId: p.id, payload: ProspectMovePayload.parse({ prospectId: p.id, leadId: p.lead_id, type: p.type, fromStageKey: p.key, stageKey: consult.key, ownerStaffId: p.owner_staff_id, cause: "BOOKING" }) } });
    return p.id;
  }
}
