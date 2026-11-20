// FO-2 (contracts §2.1, §7; AG-2-84, -83, -8a): every door's one path, in its own transaction: receipt first (a repeat
// post is one lead), person, lead, attribution, the message as the first INTERNAL note (#1742 m12), consent through
// ConsentPort (FO_PERSON), receipt CREATED, one audit line, `lead.created` last. A repeat enquiry is a new lead and
// person, flagged as a possible match (same email or readable phone), never linked or merged (AG02-D6, AG-2-84).
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { Channel, ConsentPort, Purpose } from "../../../../ports/consent.ts";
import { EVENT, LeadEventPayload } from "../../../../ports/events.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { conflict, notFound, written, type Tx } from "./common.ts";
import { NO_RULE, placeNewLead } from "../assignment/rules.ts";

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
  ownerStaffId?: string | null;   // the adder (AG-2-4 rule 8); none for a form lead, except a one-user firm's one user (X-4)
  actor: string;
  payloadHash: string;
};
export type ArrivalOut = { leadId: string | null; personId: string | null; created: boolean };

/** The possible match: the newest other person of the firm with the same email or the same readable phone. */
export async function possibleMatch(tx: Tx | PrismaClient, firmId: string, p: ArrivalIn["person"], except?: string): Promise<string | null> {
  const or = [...(p.email ? [{ email: p.email }] : []), ...(p.phone?.readable ? [{ phone: p.phone.phone, phoneReadable: true }] : [])];
  if (!or.length) return null;
  const m = await tx.foPerson.findFirst({ where: firmScope(firmId, { OR: or, ...(except ? { id: { not: except } } : {}) }), orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true } });
  return m?.id ?? null;
}

export async function arrive(tx: Tx, a: ArrivalIn, ports: { audit: AuditPort<Tx>; consent: ConsentPort<Tx> }): Promise<ArrivalOut> {
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
    await ports.audit.record(tx, { firmId, actor: a.actor, action: "booking.arrived", entity: "fo_person", entityKey: personId, summary: "A booking arrived for a person with an open prospect: no new lead.", detail: { door: a.door, receiptId: receipt.id, consent: !!a.consent } });
    return { leadId: null, personId, created: true };
  }

  let personId: string, match: string | null = null;
  if (a.existingPersonId) {
    personId = (await tx.foPerson.findFirst({ where: firmScope(firmId, { id: a.existingPersonId }), select: { id: true } }))?.id ?? notFound("person");
  } else {
    // Two first enquiries with one email or phone are serialised here, so the later one sees the earlier (Devin, #1813).
    for (const k of [a.person.email, a.person.phone?.readable ? a.person.phone.phone : null].filter(Boolean).sort()) await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`fo_sales_match:${firmId}:${k}`}, 0))`;
    match = await possibleMatch(tx, firmId, a.person);
    personId = randomUUID();
    await tx.foPerson.create({ data: { id: personId, firmId, givenNames: a.person.givenNames, familyName: a.person.familyName, email: a.person.email, phone: a.person.phone?.phone ?? null, phoneReadable: a.person.phone?.readable ?? true, createdBy: a.actor } });
  }
  let owner = a.ownerStaffId ?? null;
  if (owner === null) {
    const active = await tx.platformStaff.findMany({ where: firmScope(firmId, { status: "ACTIVE" as const }), select: { id: true }, take: 2 });
    if (active.length === 1) owner = active[0].id;   // X-4: a one-user firm's one user owns every lead
  }
  // FO-10 (AG-2-13a): no owner yet → the firm's assignment rule, else Unassigned leads; the audit line names the rule.
  const placed = owner === null ? await placeNewLead(tx, firmId, a.door, a.interestedInServiceId ?? null) : NO_RULE;
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
    summary: `Lead ${lead.number} arrived by ${a.door === "WEB_FORM" ? "the web form" : a.door === "BOOKING" ? "a booking" : "hand"}${match ? ", flagged as a possible match" : ""}${placed.ruleId ? (placed.ownerStaffId ? `, assigned to staff ${placed.ownerStaffId} by ${placed.strategy === "OWNER" ? "the default owner rule" : "round robin"}` : `, left in Unassigned leads: ${placed.fallback === "OWNER_INACTIVE" ? "the rule's person is not active or cannot work leads" : "no one in the rule's turn is active"}`) : ""}.`,
    detail: { door: a.door, personId, ownerStaffId: owner, possibleMatchPersonId: match, consent: !!a.consent, ...(placed.ruleId ? { assignmentRuleId: placed.ruleId, assignmentStrategy: placed.strategy, assignmentFallback: placed.fallback } : {}) },
    event: { type: EVENT.LEAD_CREATED, subjectId: lead.id, payload: LeadEventPayload.parse({ leadId: lead.id, personId, door: a.door, state: "OPEN", ownerStaffId: owner, possibleMatchPersonId: match }) },
  });
  return { leadId: lead.id, personId, created: true };
}
