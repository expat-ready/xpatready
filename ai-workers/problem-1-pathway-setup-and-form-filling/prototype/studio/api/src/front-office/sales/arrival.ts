// FO-2 (contracts §2.1, §7 §2.1; AG-2-84 the arrival path, AG-2-83 consent, AG-2-8a attribution): every door runs this
// one path inside its own transaction: the receipt first (its intake key makes a repeat post one lead), then the person,
// the lead, the lead's attribution (web form), the visitor's message as the lead's first INTERNAL note (#1742 review
// m12), the consent through the platform's ConsentPort (subject FO_PERSON; no front-office consent table, rows rev 14),
// the receipt marked CREATED, one audit line and the `lead.created` outbox row last.
// A repeat enquiry is a new lead and a new person record, even while a lead is open (AG02-D6); a person of the firm with
// the same email or the same readable phone is flagged as a possible match, never linked or merged (AG-2-84).
import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { Channel, ConsentPort, Purpose } from "../../../../ports/consent.ts";
import { EVENT, LeadEventPayload } from "../../../../ports/events.ts";
import { firmScope } from "../../platform/firm-scope.ts";
import { written, type Tx } from "./common.ts";

export type Attribution = Partial<Record<"utmSource" | "utmMedium" | "utmCampaign" | "utmTerm" | "utmContent" | "clickId" | "landingPage" | "referrerUrl", string>>
  & { clickIdKind?: "GCLID" | "FBCLID" | "MSCLKID" | "TTCLID" | "OTHER" };

export type ArrivalIn = {
  firmId: string;
  door: "WEB_FORM" | "MANUAL";
  /** `form:<web form id>:<submission id>` or `manual:<request id>` (the receipt's checked key). */
  intakeKey: string;
  webFormId?: string;
  person: { givenNames: string | null; familyName: string | null; email: string | null; phone: { phone: string; readable: boolean } | null };
  source: string;
  sourceDetail?: string | null;
  interestedInServiceId?: string | null;
  message?: string | null;
  attribution?: Attribution | null;
  /** The form's own wording (never text from the browser, AG-2-49 rule 6); absent when the tick was not ticked. */
  consent?: { wordingId: string; channel: Channel; purpose: Purpose; locale: string } | null;
  ipHash?: string | null;
  /** The owner: the adder for a lead added by hand (AG-2-4 rule 8); none (Unassigned) for a form lead, except in a
   *  one-user firm, whose one user owns every lead (X-4). */
  ownerStaffId?: string | null;
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
  if (made.count === 0) return { leadId: receipt.leadId, personId: receipt.personId, created: false };

  const match = await possibleMatch(tx, firmId, a.person);
  const personId = randomUUID();
  await tx.foPerson.create({ data: { id: personId, firmId, givenNames: a.person.givenNames, familyName: a.person.familyName, email: a.person.email, phone: a.person.phone?.phone ?? null, phoneReadable: a.person.phone?.readable ?? true, createdBy: a.actor } });
  let owner = a.ownerStaffId ?? null;
  if (owner === null) {
    const active = await tx.platformStaff.findMany({ where: firmScope(firmId, { status: "ACTIVE" as const }), select: { id: true }, take: 2 });
    if (active.length === 1) owner = active[0].id;   // X-4: a one-user firm's one user owns every lead
  }
  const lead = await tx.foLead.create({
    data: { firmId, personId, door: a.door, source: a.source, sourceDetail: a.sourceDetail ?? null, interestedInServiceId: a.interestedInServiceId ?? null, ownerStaffId: owner, possibleMatchPersonId: match, createdBy: a.actor },
    select: { id: true, number: true },
  });
  if (a.attribution) await tx.foLeadAttribution.create({ data: { firmId, leadId: lead.id, ...a.attribution } });
  if (a.message) await tx.foNote.create({ data: { firmId, personId, leadId: lead.id, visibility: "INTERNAL", text: a.message, byActor: a.actor } });
  if (a.consent) {
    await ports.consent.record(tx, {
      firmId, subject: { kind: "FO_PERSON", id: personId }, channel: a.consent.channel, purpose: a.consent.purpose, wordingId: a.consent.wordingId,
      source: "WEB_FORM", sourceRef: `fo_arrival_receipt:${receipt.id}`, locale: a.consent.locale, ...(a.ipHash ? { ipHash: a.ipHash } : {}),
      jurisdiction: "CA", recordedKind: "SELF_SERVICE", recordedBy: a.actor,
    });
  }
  await tx.foArrivalReceipt.update({ where: { id: receipt.id }, data: { outcome: "CREATED", completedAt: new Date(), leadId: lead.id, personId } });
  await written(tx, ports.audit, {
    firmId, actor: a.actor, action: "lead.created", entity: "fo_lead", entityKey: lead.id,
    summary: `Lead ${lead.number} arrived by ${a.door === "WEB_FORM" ? "the web form" : "hand"}${match ? ", flagged as a possible match" : ""}.`,
    detail: { door: a.door, personId, ownerStaffId: owner, possibleMatchPersonId: match, consent: !!a.consent },
    event: { type: EVENT.LEAD_CREATED, subjectId: lead.id, payload: LeadEventPayload.parse({ leadId: lead.id, personId, door: a.door, state: "OPEN", ownerStaffId: owner, possibleMatchPersonId: match }) },
  });
  return { leadId: lead.id, personId, created: true };
}
