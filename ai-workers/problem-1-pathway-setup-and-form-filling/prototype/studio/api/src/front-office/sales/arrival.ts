// FO-2 (contracts §2.1, §7; AG-2-84, -83, -8a): every door's one path, in its own transaction: receipt first (a repeat
// post is one lead), person, lead, attribution, the message as the first INTERNAL note (#1742 m12), consent through
// ConsentPort (FO_PERSON), receipt CREATED, one audit line, `lead.created` last. A repeat enquiry is a new lead and
// person, flagged as a possible match (same email or readable phone), never linked or merged (AG02-D6, AG-2-84).
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { Channel, ConsentPort, Purpose } from "../../../../ports/consent.ts";
import { EVENT, LeadEventPayload } from "../../../../ports/events.ts";
import { currentFirm, firmScope, withFirm } from "../../platform/firm-scope.ts";
import { NOTIFICATION_KIND, type NotificationPort } from "../../../../ports/notifications.ts";
import { conflict, notFound, UUID, written, type Tx } from "./common.ts";
import { eligible, NO_RULE, placeNewLead, type Placement } from "../assignment/place.ts";
import { notePairs } from "../duplicates/merge/review.ts";
import { logPort } from "../../platform/observability/log.ts";
import { livePersonId } from "../duplicates/merge/follow.ts";

export type Attribution = Partial<Record<"utmSource" | "utmMedium" | "utmCampaign" | "utmTerm" | "utmContent" | "clickId" | "landingPage" | "referrerUrl", string>>
  & { clickIdKind?: "GCLID" | "FBCLID" | "MSCLKID" | "TTCLID" | "OTHER" };

export type ArrivalIn = {
  firmId: string;
  door: "WEB_FORM" | "MANUAL" | "BOOKING";
  intakeKey: string;   // form:<web form id>:<submission id>, manual:<request id> or booking:<booking id> (checked)
  webFormId?: string;
  person: { givenNames: string | null; familyName: string | null; email: string | null; phone: { phone: string; readable: boolean } | null };
  source: string;
  sourceDetail?: string | null;
  interestedInServiceId?: string | null;
  message?: string | null;
  attribution?: Attribution | null;
  consent?: { wordingId: string; channel: Channel; purpose: Purpose; locale: string; givenAt?: Date } | null;   // the form's own wording; none unticked
  /** FO-2 part 3b (AG-2-84 rule 8): a booking by a person who has an open prospect makes no person and no lead; the
   *  receipt is ON_OPEN_PROSPECT and names this person, and any consent is recorded for them. BOOKING door only. */
  onOpenProspectPersonId?: string;
  ipHash?: string | null;
  existingPersonId?: string;   // Add a lead for a person already on file (the known-person check): no new person
  addedAsNew?: boolean;   // FO-9b part 2: Add a lead's "Add as new" (confirmedNew): the new person's pairs are written Kept separate
  ownerStaffId?: string | null;   // the adder (AG-2-4 rule 8); none for a form lead, except a one-user firm's one user (X-4)
  /** FO-10 part 2 (AG-2-85 rule 1(b)): the host of the booking that brought the person; BOOKING door only. */
  bookingHostStaffId?: string;
  actor: string;
  payloadHash: string;
};
export type ArrivalOut = { leadId: string | null; personId: string | null; created: boolean };

/** The possible match: the newest other live person of the firm (never a merged-away record, FO-9b M3) with the same email or the same readable phone. */
export async function possibleMatch(tx: Tx | PrismaClient, firmId: string, p: ArrivalIn["person"], except?: string): Promise<string | null> {
  const or = [...(p.email ? [{ email: p.email }] : []), ...(p.phone?.readable ? [{ phone: p.phone.phone, phoneReadable: true }] : [])];
  if (!or.length) return null;
  const m = await tx.foPerson.findFirst({ where: firmScope(firmId, { OR: or, mergedIntoId: null, ...(except ? { id: { not: except } } : {}) }), orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true } });
  if (!m) return null;
  // FO-9b (break m1): the match is share-locked and read again, so a merge in flight is waited for and a record it just
  // merged away is never flagged (it would be refused at commit); a tombstone falls back to the next match.
  const [still] = await tx.$queryRaw<{ id: string }[]>`select "id"::text as id from "fo_person" where "firm_id" = ${firmScope(firmId).firmId}::uuid and "id" = ${m.id}::uuid and "merged_into_id" is null for key share`;
  return still ? still.id : possibleMatch(tx, firmId, p, except);
}

/** How the owner was set, for the lead's arrival line (the timeline shows it). */
function placedWords(p: Placement, fact: "BOOKING_HOST" | "HOST_INACTIVE" | null, owner: string | null): string {
  if (fact === "BOOKING_HOST") return `, owned by the booking's host, staff ${owner}`;
  if (fact === "HOST_INACTIVE") return ", left in Unassigned leads: the booking's host is not active or cannot work leads";
  if (!p.ruleId) return "";
  if (p.ownerStaffId) return `, assigned to staff ${p.ownerStaffId} by ${p.strategy === "OWNER" ? "the default owner rule" : "round robin"}`;
  return `, left in Unassigned leads: ${p.fallback === "OWNER_INACTIVE" ? "the rule's person is not active or cannot work leads" : p.fallback === "POSSIBLE_MATCH" ? "a possible match waits for a person" : "no one in the rule's turn is active"}`;
}

export async function arrive(tx: Tx, a: ArrivalIn, ports: { audit: AuditPort<Tx>; consent: ConsentPort<Tx>; notifications?: NotificationPort<Tx> | null }): Promise<ArrivalOut> {
  const firmId = firmScope(a.firmId).firmId;
  // The receipt first (AG-2-84 rule 3). A second post with the same key waits on the unique key until the first commits,
  // then finds its receipt and makes nothing.
  const made = await tx.foArrivalReceipt.createMany({ data: [{ firmId, door: a.door, webFormId: a.webFormId ?? null, intakeKey: a.intakeKey, payloadHash: a.payloadHash, ipHash: a.ipHash ?? null }], skipDuplicates: true });
  const receipt = await tx.foArrivalReceipt.findUniqueOrThrow({ where: { firmId_door_intakeKey: { firmId, door: a.door, intakeKey: a.intakeKey } } });
  // A hand-added request id used twice at once with other details is refused here too, after the key serialised them (Devin).
  if (made.count === 0 && a.door === "MANUAL" && receipt.payloadHash !== a.payloadHash) return conflict("This request was already used with other details. Start a new Add.", "REQUEST_REUSED");
  if (made.count === 0) return { leadId: receipt.leadId, personId: receipt.personId, created: false };

  /** The consent's source follows the door: a booking's tick is BOOKING_FORM, never WEB_FORM (FO-2 part 3b). */
  const recordConsent = async (personId: string) => {
    if (!a.consent) return;
    await ports.consent.record(tx, {
      firmId, subject: { kind: "FO_PERSON", id: personId }, channel: a.consent.channel, purpose: a.consent.purpose, wordingId: a.consent.wordingId,
      source: a.door === "BOOKING" ? "BOOKING_FORM" : a.door === "MANUAL" ? "STAFF_RECORDED" : "WEB_FORM", sourceRef: `fo_arrival_receipt:${receipt.id}`, locale: a.consent.locale,
      ...(a.ipHash ? { ipHash: a.ipHash } : {}), ...(a.consent.givenAt ? { givenAt: a.consent.givenAt } : {}),
      jurisdiction: "CA", recordedKind: "SELF_SERVICE", recordedBy: a.actor,
    });
  };
  if (a.onOpenProspectPersonId) {
    if (a.door !== "BOOKING") throw new Error("arrive: only a booking arrives on an open prospect");
    const personId = (await tx.foPerson.findFirst({ where: firmScope(firmId, { id: a.onOpenProspectPersonId }), select: { id: true } }))?.id ?? notFound("person");
    await recordConsent(personId);
    await tx.foArrivalReceipt.update({ where: { id: receipt.id }, data: { outcome: "ON_OPEN_PROSPECT", completedAt: new Date(), personId } });
    // The booking goes on the person's record (AG-2-84 rule 8): one audit line, ids only.
    await ports.audit.record(tx, { firmId, actor: a.actor, action: "booking.arrived", entity: "fo_person", entityKey: personId, summary: "A booking arrived for a person with an open prospect: no new lead.", detail: { door: a.door, receiptId: receipt.id, consent: !!a.consent },
      before: null, after: { outcome: "ON_OPEN_PROSPECT", personId, door: a.door, consent: !!a.consent } });
    return { leadId: null, personId, created: true };
  }

  let personId: string, match: string | null = null;
  if (a.existingPersonId) {
    personId = (await livePersonId(tx, firmId, a.existingPersonId)) ?? notFound("person");   // FO-9b M3: a merged-away id → its survivor
  } else {
    // Two first enquiries with one email or phone are serialised here, so the later one sees the earlier (Devin, #1813).
    for (const k of [a.person.email, a.person.phone?.readable ? a.person.phone.phone : null].filter(Boolean).sort()) await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`fo_sales_match:${firmId}:${k}`}, 0))`;
    match = await possibleMatch(tx, firmId, a.person);
    personId = randomUUID();
    await tx.foPerson.create({ data: { id: personId, firmId, givenNames: a.person.givenNames, familyName: a.person.familyName, email: a.person.email, phone: a.person.phone?.phone ?? null, phoneReadable: a.person.phone?.readable ?? true, createdBy: a.actor } });
    // FO-9b part 2 (concept M8): the new person's pairs go on the duplicate review list; a failure never refuses the arrival.
    await tx.$executeRaw`savepoint fo_dup_pairs`; try { await notePairs(tx, firmId, personId, a.addedAsNew ? { by: a.actor } : null); await tx.$executeRaw`release savepoint fo_dup_pairs`; } catch (e) { await tx.$executeRaw`rollback to savepoint fo_dup_pairs`; logPort.error("fo9b_note_pairs_failed", e); }
  }
  let owner = a.ownerStaffId ?? null, fact: "BOOKING_HOST" | "HOST_INACTIVE" | null = null;
  // FO-10 part 2 (AG-2-85 rules 1(b), 18): a lead born from a one-to-one booking is its host's, whatever any rule says;
  // a host no longer active gives no owner and no rule applies (every booking has one host, fo_booking.staff_id).
  if (owner === null && a.door === "BOOKING" && a.bookingHostStaffId) {
    // The host must be able to work the lead (break M2 on FO-10 part 2): active with the sales key, as every rule asks;
    // else no owner, and the lead waits in Unassigned leads where someone who can work it sees it.
    const [host] = UUID.test(a.bookingHostStaffId) ? await eligible(tx, firmId, [a.bookingHostStaffId.toLowerCase()]) : [];
    owner = host ?? null;
    fact = host ? "BOOKING_HOST" : "HOST_INACTIVE";
  }
  if (owner === null) {
    const active = await tx.platformStaff.findMany({ where: firmScope(firmId, { status: "ACTIVE" as const }), select: { id: true }, take: 2 });
    if (active.length === 1) { owner = active[0].id; fact = null; }   // X-4: a one-user firm's one user owns every lead (and the line says so, review m1)
  }
  // FO-10 (AG-2-13a): no owner yet → the firm's assignment rule, else Unassigned leads; the audit line names the rule.
  // A possible match is placed by no rule (FO-10 part 2, AG-2-85 rule 10): it waits for a person.
  const placed = owner === null && fact !== "HOST_INACTIVE" ? await placeNewLead(tx, firmId, a.door, a.interestedInServiceId ?? null, { possibleMatch: match !== null }) : NO_RULE;
  owner ??= placed.ownerStaffId;
  const lead = await tx.foLead.create({
    data: { firmId, personId, door: a.door, source: a.source, sourceDetail: a.sourceDetail ?? null, interestedInServiceId: a.interestedInServiceId ?? null, ownerStaffId: owner, possibleMatchPersonId: match, createdBy: a.actor },
    select: { id: true, number: true },
  });
  if (a.attribution) await tx.foLeadAttribution.create({ data: { firmId, leadId: lead.id, ...a.attribution } });
  if (a.message) await tx.foNote.create({ data: { firmId, personId, leadId: lead.id, visibility: "INTERNAL", text: a.message, byActor: a.actor } });
  await recordConsent(personId);
  await tx.foArrivalReceipt.update({ where: { id: receipt.id }, data: { outcome: "CREATED", completedAt: new Date(), leadId: lead.id, personId } });
  await written(tx, ports.audit, {
    firmId, actor: a.actor, action: EVENT.LEAD_CREATED, entityKey: lead.id,
    summary: `Lead ${lead.number} arrived by ${a.door === "WEB_FORM" ? "the web form" : a.door === "BOOKING" ? "a booking" : "hand"}${match ? ", flagged as a possible match" : ""}${placedWords(placed, fact, owner)}.`,
    detail: { door: a.door, personId, ownerStaffId: owner, possibleMatchPersonId: match, consent: !!a.consent, ...(fact ? { ownerFact: fact } : {}), ...(placed.ruleId ? { assignmentRuleId: placed.ruleId, assignmentStrategy: placed.strategy, assignmentFallback: placed.fallback } : {}) },
    // R1.8 (QA-594, P-687): the lead's values in full, its new person's name and contact included; the message stays in fo_note.
    before: null, after: { personId, door: a.door, source: a.source, sourceDetail: a.sourceDetail ?? null, interestedInServiceId: a.interestedInServiceId ?? null, ownerStaffId: owner, possibleMatchPersonId: match,
      ...(a.existingPersonId ? {} : { givenNames: a.person.givenNames, familyName: a.person.familyName, email: a.person.email, phone: a.person.phone?.phone ?? null }) },
    event: { type: EVENT.LEAD_CREATED, subjectId: lead.id, payload: LeadEventPayload.parse({ leadId: lead.id, personId, door: a.door, state: "OPEN", ownerStaffId: owner, possibleMatchPersonId: match }) },
  });
  // PF-18n part 2 (AG-16-10 test 1, AG-10-29a): the person the lead was handed to (the firm's rule, a one-user firm's one
  // user; a booking's host only once the booking door passes the port: booking/runtime-ports.ts passes none yet, a
  // follow-up for the booking module) is told, in this transaction; an adder who owns their own lead (a.ownerStaffId) is not.
  if (owner && !a.ownerStaffId) await tellAssigned(tx, ports.notifications, firmId, owner, lead.id);
  return { leadId: lead.id, personId, created: true };
}

/** PF-18n part 2: one lead-assigned notification to `staffId` for this lead, inside the caller's transaction and in the
 *  lead's own firm (NotificationPort writes in the firm in scope; a door or test with none in scope gets the lead's). The
 *  port asks the person's In-app switch and skips a person who is not this firm's active staff. No port: nobody is told. */
export async function tellAssigned(tx: Tx, port: NotificationPort<Tx> | null | undefined, firmId: string, staffId: string, leadId: string): Promise<void> {
  if (!port) return;
  // Never a silent switch of firm (review m6): inside another firm's scope this is a fault, refused before anything is written.
  const inScope = currentFirm();
  if (inScope !== undefined && inScope !== firmId) throw new Error("tellAssigned: called in another firm's scope");
  await withFirm(firmId, () => port.notify(tx, { staffId }, NOTIFICATION_KIND.LEAD_ASSIGNED, { kind: "lead", id: leadId }));
}
