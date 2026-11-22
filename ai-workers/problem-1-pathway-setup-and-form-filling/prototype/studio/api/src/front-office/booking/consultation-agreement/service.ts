// FO-3c (BACKLOG row FO-3c; P-564, P-627 (7), P-628; AG-4-22; Code SOR/2022-128 s. 23, trace t8): the consultation
// agreement before the first consultation, API only, on SigningPort (FO-6) and FO-5's template store (kind CONSULTATION).
//   * A `booking.scheduled` event sends one filled agreement for signing: the client first, then the consultation's
//     licensed host (a host with no licence record → the firm's representative of record, and the read, the audit line
//     and the client's email say so). A reschedule or a repeat of the event sends none. Nothing here cancels a meeting.
//   * The agreement is an fo_retainer of kind CONSULTATION (FO-5's tables) whose version's merge values carry the
//     booking's id; its signing request, signers, receipts and evidence are FO-6's tables (#2038), written by their rules.
//   * The client opens their emailed link at our door (viewed, consent, then the provider's embedded link); the host
//     asks for theirs as staff, refused until the client has signed. The provider's verified event moves the request;
//     once all have signed the sealed copy and the audit file are stored, hashed, and the copy is emailed to the client
//     once (s. 23(3)).
//   * Every change writes one audit line in its transaction through AuditPort, and an outbox row is written last.
// Not here (FO-6's API part, not on main): the provider's webhook route (`signingEvent` below is what it calls), the
// email code before signing (P-564) and expiry. "Needs you" is this module's own read until NotificationPort has a kind
// for it. Every value is Sample. Every legal reading (s. 23 "signed", e-signature identity): Unconfirmed: no counsel.
import { HttpException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuditPort } from "../../../../../ports/audit.ts";
import type { ClockPort } from "../../../../../ports/clock.ts";
import { BookingEvent, EVENT } from "../../../../../ports/events.ts";
import type { FilesPort } from "../../../../../ports/files.ts";
import type { JobPort, JobRun } from "../../../../../ports/jobs.ts";
import type { MailPort } from "../../../../../ports/mail.ts";
import { withFirm } from "../../../platform/firm-scope.ts";
import { DUTY_KEYS, type StaffContext } from "../../../platform/identity/keys.ts";
import { DOCX, renderDocx } from "../../retainers/docx.ts";
import { SigningEnded, SigningNotFound, type SigningHookCall, type SigningHookEvent, type SigningPort } from "../../signing/port.ts";
import { wallLabel } from "../service.ts";
import { CODE_S23, s23Check } from "./items.ts";

type Tx = Prisma.TransactionClient;
/** This module's two events (the row's names). `ports/events.ts` is outside the row's touch list: J-104 moves them there. */
export const AGREEMENT_EVENT = { SENT: "consultation_agreement.sent", SIGNED: "consultation_agreement.signed" } as const;
export const REMINDER_JOB = "consultation_agreement.reminder", COPY_JOB = "consultation_agreement.signed_copy";
/** The merge value that ties an agreement to its booking (not a placeholder: a template naming it is refused by FO-5). */
export const BOOKING_ID = "booking.id";
/** Sample: the consent wording's version, the request's life (FO-6's 14 days) and the reminder's lead. */
export const CONSENT_TEXT_VERSION = "sign-electronically-v1", CONSENT_TEXT = "I agree to sign this consultation agreement electronically.";
const EXPIRES_DAYS = 14, DAY = 24 * 60 * 60_000;
/** P-564 (on by default): a one-time email code before signing. Sample: 10 minutes, the sixth wrong code locks 15 minutes
 *  (FO-6's fo_signer columns and check). The firm's switch to turn it off is FO-6's setting (not on main): always on here. */
const CODE_MINUTES = 10, CODE_TRIES = 6, LOCK_MINUTES = 15;
/** A checked code opens the signing link for 30 minutes (FO-6's signing session, Sample); after that a new code is asked
 *  (break R2-1: a forwarded link never signs on an old code). A new code at most once a minute per signer (R2-2). */
const CODE_SESSION_MS = 30 * 60_000, RESEND_GAP_MS = 60_000;
/** A code is unspent when it was sent after the last check (its send time is its expiry less its life). code_verified_at
 *  is never cleared: it is the last time the client checked a code, which the provider's "signed" needs (break R3-1). */
const unspent = (c: { codeExpiresAt: Date | null; codeVerifiedAt: Date | null }) =>
  !c.codeVerifiedAt || (!!c.codeExpiresAt && c.codeExpiresAt.getTime() - CODE_MINUTES * 60_000 > c.codeVerifiedAt.getTime());
/** The door's limiter keeps at most this many addresses (R2-3): the oldest go first. */
const DOOR_MAX_KEYS = 50_000;
/** The public door's limit per IP (contracts §0.6; Sample, sized as the booking door's token limit). */
const DOOR_PER_IP = 30, DOOR_WINDOW_MS = 10 * 60_000;
export const PRO_BONO = "No fee: this consultation is provided pro bono.";   // Sample wording
export const WORDS = { signed: "Agreement signed", unsigned: "Agreement not signed yet", none: "No agreement was sent" } as const;
const SYSTEM = "system:consultation-agreement";

export type AgreementPorts = { audit: AuditPort<Tx>; clock: ClockPort; mail: MailPort; jobs: JobPort; signing: SigningPort; files: FilesPort; publicBaseUrl: string; warn?: (m: string) => void };

const fail = (status: number, title: string, detail: string, code: string): never => { throw new HttpException({ type: `https://expatready.local/problems/${code.toLowerCase().replace(/_/g, "-")}`, title, status, detail, code }, status); };
/** The one answer for an agreement, booking or link that is not this firm's, not live or not there. */
const notFound = () => fail(404, "Not found", "This agreement or link is not available.", "NOT_FOUND");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const nameOf = (p: { givenNames: string | null; familyName: string | null }) => [p.givenNames, p.familyName].filter(Boolean).join(" ").trim();

export type SendResult = { sent: true; agreementId: string } | { sent: false; reason: "NOT_SCHEDULED" | "ALREADY_SENT" | "NO_AGREEMENT" | "NO_TEMPLATE" | "NO_LICENSED" | "NO_CLIENT_EMAIL" | "NO_BOOKING"; agreementId?: string };

export class ConsultationAgreementService {
  private readonly door = new Map<string, number[]>();
  private swept = 0;
  constructor(protected readonly db: PrismaClient, protected readonly ports: AgreementPorts) {}
  /** A rolling window per IP on the public door (review M3): over it → 429, nothing read. */
  private limit(ip: string) {
    const now = this.ports.clock.now().getTime(), key = ip.slice(0, 64), hits = (this.door.get(key) ?? []).filter((t) => t > now - DOOR_WINDOW_MS);
    if (hits.length >= DOOR_PER_IP) { this.door.set(key, hits); fail(429, "Too many tries", "Too many tries from here. Wait a few minutes and open the link again.", "TOO_MANY"); }
    this.door.delete(key); hits.push(now); this.door.set(key, hits);   // re-inserted: the map's order is oldest use first
    if (this.door.size > DOOR_MAX_KEYS && now - this.swept > 60_000) {   // at most one sweep a minute (R2-3)
      this.swept = now;
      for (const [k, v] of this.door) if (!v.some((t) => t > now - DOOR_WINDOW_MS)) this.door.delete(k);
    }
    for (const k of this.door.keys()) { if (this.door.size <= DOOR_MAX_KEYS) break; this.door.delete(k); }
  }

  /** The job workers. Call once at start-up. */
  async registerJobs() {
    await this.ports.jobs.handle(REMINDER_JOB, (j) => this.runReminder(j));
    await this.ports.jobs.handle(COPY_JOB, (j) => this.runSignedCopy(j));
  }
  private async safe(what: string, fn: () => Promise<unknown>) { try { await fn(); } catch (e) { (this.ports.warn ?? console.error)(`[fo-consultation-agreement] ${what} failed: ${String((e as Error)?.message ?? e).slice(0, 200)}`); } }

  // ------------------------------------------------------------------------------------------------ the subscriber
  /** A booking event (module_event's envelope). Scheduled → the agreement is sent, once per booking. Rescheduled → no new
   *  agreement; the 24-hour reminder follows the new time. Any other event changes nothing. At least once is safe. */
  async onBookingEvent(event: { type: string; firmId: string; payload: unknown }): Promise<SendResult | null> {
    if (event.type !== EVENT.BOOKING_SCHEDULED && event.type !== EVENT.BOOKING_RESCHEDULED) return null;
    const p = BookingEvent.parse(event.payload);
    if (event.type === EVENT.BOOKING_SCHEDULED) return this.send(event.firmId, p.bookingId);
    const a = await this.ofBooking(this.db, event.firmId, p.bookingId);
    if (a && a.status !== "SIGNED") await this.scheduleReminder(event.firmId, a.id, p.bookingId);
    return a ? { sent: false, reason: "ALREADY_SENT", agreementId: a.id } : { sent: false, reason: "NO_AGREEMENT" };
  }

  /** Every scheduled booking whose event was missed (no agreement yet, the meeting still ahead): made good by the next run.
   *  The first read crosses firms (the caller's own scope decides what it sees: PF-12); each send runs as its firm. */
  async catchUp(each: <T>(firmId: string, fn: () => Promise<T>) => Promise<T> = withFirm): Promise<{ sent: number; failed: number; sealed: number }> {
    const rows = await this.db.$queryRaw<{ firm_id: string; id: string }[]>`
      select b.firm_id::text, b.id::text from fo_booking b
       where b.status in ('SCHEDULED', 'RESCHEDULED') and b.starts_at > ${this.ports.clock.now()}
         -- only a booking that can be sent (its person has an email), so unsendable ones never fill the batch (break m6)
         and exists (select 1 from fo_person p where p.firm_id = b.firm_id and p.id = b.person_id and p.email is not null)
         -- and someone can sign for the firm, by signatory()'s rule (R2-4, R3-2: a firm with none never fills the batch)
         and (exists (select 1 from platform_staff s join platform_staff_credential c on c.firm_id = s.firm_id and c.staff_id = s.id where s.firm_id = b.firm_id and s.id = b.staff_id and s.status = 'ACTIVE')
              or exists (select 1 from platform_staff s join platform_staff_credential c on c.firm_id = s.firm_id and c.staff_id = s.id
                          where s.firm_id = b.firm_id and s.status = 'ACTIVE'
                            and (select count(distinct rp.permission_key) from platform_role_grant g join platform_role_permission rp on rp.role = g.role
                                  where g.firm_id = s.firm_id and g.staff_id = s.id and g.ended_at is null and rp.permission_key = any(${[...DUTY_KEYS.represent]})) = ${DUTY_KEYS.represent.length}))
         and exists (select 1 from fo_retainer_template t where t.firm_id = b.firm_id and t.kind = 'CONSULTATION' and t.active)
         and not exists (select 1 from fo_retainer_version v join fo_retainer r on r.firm_id = v.firm_id and r.id = v.retainer_id
                          where v.firm_id = b.firm_id and r.kind = 'CONSULTATION' and v.merge_values->>${BOOKING_ID} = b.id::text)
       order by b.starts_at limit 200`;
    const out = { sent: 0, failed: 0, sealed: 0 };
    // A seal that failed (every signer signed, no evidence) is tried again, and a signed copy whose job was lost is queued
    // again (its key sends it once) (review M2).
    const unsealed = await this.db.$queryRaw<{ firm_id: string; id: string; sealed: boolean }[]>`
      select q.firm_id::text, q.id::text, exists (select 1 from fo_signing_evidence e where e.firm_id = q.firm_id and e.request_id = q.id) as sealed
        from fo_signature_request q where q.document_kind = 'CONSULTATION' and (
          (q.status = 'CLIENT_SIGNED' and not exists (select 1 from fo_signer s where s.firm_id = q.firm_id and s.request_id = q.id and s.signed_at is null))
          or (q.status = 'SIGNED' and q.ended_at > ${new Date(this.ports.clock.now().getTime() - 7 * DAY)}))
       order by (q.status = 'CLIENT_SIGNED') desc, q.sent_at limit 200`;   // the stuck seals first (R2-4)
    for (const q of unsealed) {
      try {
        if (!q.sealed) { if (await each(q.firm_id, () => this.seal(q.firm_id, q.id))) out.sealed++; }
        else await each(q.firm_id, async () => { const d = await this.db.foSignatureRequest.findFirstOrThrow({ where: { firmId: q.firm_id, id: q.id } }); await this.queueCopy(q.firm_id, d.documentId, q.id); });
      } catch (e) { out.failed++; await this.safe(`catch-up of request ${q.id}`, () => { throw e; }); }
    }
    for (const r of rows) { try { if ((await each(r.firm_id, () => this.send(r.firm_id, r.id))).sent) out.sent++; } catch (e) { out.failed++; await this.safe(`catch-up of booking ${r.id}`, () => { throw e; }); } }
    return out;
  }

  private async ofBooking(q: Tx | PrismaClient, firmId: string, bookingId: string) {
    const rows = await q.$queryRaw<{ id: string; status: string }[]>`
      select r.id::text, r.status::text from fo_retainer r join fo_retainer_version v on v.firm_id = r.firm_id and v.retainer_id = r.id
       where r.firm_id = ${firmId}::uuid and r.kind = 'CONSULTATION' and v.merge_values->>${BOOKING_ID} = ${bookingId} order by r.created_at limit 1`;
    return rows[0] ?? null;
  }

  /** Who signs for the firm: the host when they hold a licence record, else the firm's representative of record (active,
   *  a licence record and the sign-off keys: FO-5's rule, BR-3), named first by name. */
  private async signatory(firmId: string, hostStaffId: string) {
    const host = await this.db.platformStaff.findFirst({ where: { firmId, id: hostStaffId, status: "ACTIVE" }, include: { credential: true } });
    if (host?.credential) return { staff: host, credential: host.credential, hostHasLicence: true };
    const keys = [...DUTY_KEYS.represent];
    const reps = await this.db.$queryRaw<{ id: string }[]>`
      select s.id::text from platform_staff s join platform_staff_credential c on c.firm_id = s.firm_id and c.staff_id = s.id
       where s.firm_id = ${firmId}::uuid and s.status = 'ACTIVE'
         and (select count(distinct rp.permission_key) from platform_role_grant g join platform_role_permission rp on rp.role = g.role
               where g.firm_id = s.firm_id and g.staff_id = s.id and g.ended_at is null and rp.permission_key = any(${keys})) = ${keys.length}
       order by s.display_name, s.id limit 1`;
    const rep = reps[0] ? await this.db.platformStaff.findFirst({ where: { firmId, id: reps[0].id }, include: { credential: true } }) : null;
    return rep?.credential ? { staff: rep, credential: rep.credential, hostHasLicence: false } : null;
  }

  // ------------------------------------------------------------------------------------------------------- send
  /** Sends the booking's agreement for signing, once. No active template, no licensed person or no client email: nothing
   *  is sent and the reason is answered (the booking stays as it is). */
  async send(firmId: string, bookingId: string): Promise<SendResult> {
    const b = UUID.test(bookingId) ? await this.db.foBooking.findFirst({ where: { firmId, id: bookingId }, include: { type: true } }) : null;
    if (!b || !b.personId) return { sent: false, reason: "NO_BOOKING" };
    if (b.status !== "SCHEDULED" && b.status !== "RESCHEDULED") return { sent: false, reason: "NOT_SCHEDULED" };
    const had = await this.ofBooking(this.db, firmId, b.id);
    if (had) return { sent: false, reason: "ALREADY_SENT", agreementId: had.id };
    const t = (await this.db.foRetainerTemplate.findMany({ where: { firmId, kind: "CONSULTATION", active: true }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 1 }))[0];
    if (!t) return { sent: false, reason: "NO_TEMPLATE" };
    const who = await this.signatory(firmId, b.staffId);
    if (!who) return { sent: false, reason: "NO_LICENSED" };
    const person = await this.db.foPerson.findFirst({ where: { firmId, id: b.personId } });
    if (!person?.email) return { sent: false, reason: "NO_CLIENT_EMAIL" };
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: firmId } });
    const now = this.ports.clock.now(), free = b.type.purpose === "FREE_CONSULT";
    // The fee: a free consultation prints the pro bono statement; no other type carries a price on main (not known → empty, shown missing).
    const values: Record<string, unknown> = {
      "client.name": nameOf(person) || null, "client.email": person.email, "client.phone": person.phone ?? null, "company.name": null,
      "signer.name": nameOf(person) || null, "signer.email": person.email,
      "representative.name": who.staff.displayName, "representative.licensing_body": who.credential.licensingBody, "representative.licence_number": who.credential.licenceNumber,
      "firm.name": firm.operatingName, "agreement.date": now.toISOString().slice(0, 10), "agreement.version": "1",
      fees: free ? [{ label: b.type.name, amount: PRO_BONO, when: "", due_on: null }] : [], "fees.total": free ? PRO_BONO : null,
      [BOOKING_ID]: b.id, "booking.host_staff_id": b.staffId, "booking.signatory_is_host": who.hostHasLicence,
    };
    const tpl = await this.ports.files.get(firmId, t.fileKey);
    if (!tpl) return { sent: false, reason: "NO_TEMPLATE" };
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) data[k] = v === null ? "" : k === "fees" ? (v as Record<string, unknown>[]).map((f) => ({ ...f, due_on: "", ...Object.fromEntries(Object.entries({ ...f, due_on: "" }).map(([x, y]) => [`fees.${x}`, y])) })) : v;
    // The client's link names its firm (an id, no secret) so the door reads as that firm (PF-12); only the whole token's sha256 is stored.
    const id = randomUUID(), requestId = randomUUID(), clientSigner = randomUUID(), firmSigner = randomUUID(), token = `${firmId.replace(/-/g, "").toLowerCase()}.${randomBytes(32).toString("base64url")}`;
    const bytes = await renderDocx(tpl.bytes, data);
    const file = await this.ports.files.put(firmId, `retainers/${id}/v1-${randomBytes(6).toString("hex")}.docx`, bytes, DOCX);
    const title = `Consultation agreement: ${b.type.name}`.slice(0, 200);
    const { providerDocumentId } = await this.ports.signing.send({ firmId, requestId, title, document: { bytes: new Uint8Array(bytes), contentType: DOCX },
      signers: [{ signerId: clientSigner, role: "CLIENT", name: nameOf(person) || "Client" }, { signerId: firmSigner, role: "FIRM", name: who.staff.displayName }] });
    const note = who.hostHasLicence ? null : `The consultation's host holds no licence record: the agreement is with the firm's representative of record, ${who.staff.displayName}.`;
    let raced: string | null = null;
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fo-consultation-agreement:${b.id}`}))`;
        const again = await this.ofBooking(tx, firmId, b.id);
        if (again) { raced = again.id; return; }
        await tx.foRetainer.create({ data: { id, firmId, kind: "CONSULTATION", prospectId: b.prospectId, subject: "PERSON", signerPersonId: person.id, representativeStaffId: who.staff.id, templateId: t.id, templateVersion: t.version, templateFileKey: t.fileKey, createdBy: SYSTEM } });
        const v = await tx.foRetainerVersion.create({ data: { firmId, retainerId: id, n: 1, mergeValues: values as Prisma.InputJsonValue, fileKey: file.key, originalSha256: file.sha256, createdBy: SYSTEM } });
        await tx.foRetainerVersion.update({ where: { id: v.id }, data: { sentAt: now } });
        await tx.foRetainer.update({ where: { id }, data: { status: "SENT" } });
        await tx.foSignatureRequest.create({ data: { id: requestId, firmId, documentKind: "CONSULTATION", documentId: id, documentVersionId: v.id, documentVersion: 1, provider: this.ports.signing.provider, providerDocumentId, sentBy: b.staffId, sentAt: now, expiresAt: new Date(now.getTime() + EXPIRES_DAYS * DAY) } });
        await tx.foSigner.create({ data: { id: clientSigner, firmId, requestId, role: "CLIENT", signOrder: 1, personId: person.id, linkTokenSha256: sha(token) } });
        await tx.foSigner.create({ data: { id: firmSigner, firmId, requestId, role: "FIRM", signOrder: 2, staffId: who.staff.id, linkTokenSha256: sha(randomBytes(32)) } });
        await this.ports.audit.record(tx, { firmId, actor: SYSTEM, action: AGREEMENT_EVENT.SENT, entity: "fo_retainer", entityKey: id,
          summary: `Consultation agreement sent for signing (${b.type.name}).${note ? ` ${note}` : ""}`, detail: { agreementId: id, bookingId: b.id, templateId: t.id, templateVersion: t.version, sha256: file.sha256, signatoryStaffId: who.staff.id, signatoryIsHost: who.hostHasLicence },
          before: null, after: { status: "SENT", bookingId: b.id, signerPersonId: person.id, signatoryStaffId: who.staff.id, signatoryIsHost: who.hostHasLicence, fileSha256: file.sha256 } });
        await tx.moduleEvent.create({ data: { firmId, type: AGREEMENT_EVENT.SENT, subjectId: id, occurredAt: now, payload: { agreementId: id, bookingId: b.id, personId: person.id, signatoryStaffId: who.staff.id, version: 1 } } });   // last (contracts §0.5)
      }, { maxWait: 10_000, timeout: 20_000 });
    } catch (e) { await this.safe("cancel of the unsent envelope", () => this.ports.signing.cancel(firmId, providerDocumentId)); throw e; }
    if (raced) { await this.safe("cancel of the second envelope", () => this.ports.signing.cancel(firmId, providerDocumentId)); return { sent: false, reason: "ALREADY_SENT", agreementId: raced }; }
    // After the commit (never thrown): the client's email with our link, and the 24-hour reminder.
    await this.safe("the client's email", () => this.ports.mail.send({ firmId, to: person.email!, replyTo: firm.contactEmail, class: "TRANSACTIONAL", person: { kind: "FO_PERSON", id: person.id }, idempotencyKey: `consultation-agreement:${id}:sent`, templateKey: "consultation_agreement.sent",
      subject: `Please sign your consultation agreement with ${firm.operatingName}`.slice(0, 200),
      text: `Hello ${person.givenNames ?? ""},\n\nBefore your ${b.type.name} with ${firm.operatingName} (${wallLabel(b.startsAt, b.bookerTimeZone)}), please read and sign the consultation agreement:\n${this.ports.publicBaseUrl}/sign/consultation-agreement#${token}\n\n${note ? `${note}\n\n` : ""}Your meeting stays booked whether or not you have signed yet.\n` }));
    await this.scheduleReminder(firmId, id, b.id);
    return { sent: true, agreementId: id };
  }

  private async scheduleReminder(firmId: string, agreementId: string, bookingId: string) {
    const b = await this.db.foBooking.findFirst({ where: { firmId, id: bookingId }, select: { startsAt: true, sequence: true } });
    if (!b) return;
    const at = new Date(b.startsAt.getTime() - DAY);
    if (at > this.ports.clock.now()) await this.safe("the 24-hour reminder", () => this.ports.jobs.schedule(REMINDER_JOB, at, { agreementId, bookingId, sequence: b.sequence }, { firmId, key: `consultation-agreement:${agreementId}:reminder:${b.sequence}` }));
  }

  /** 24 hours before the meeting, while unsigned: one reminder to the person who signs for the firm (the job's key is the
   *  email's key, so a second run sends none). A moved, cancelled or signed booking's reminder does nothing. */
  private async runReminder(job: JobRun) {
    const p = job.payload as { agreementId: string; bookingId: string; sequence: number }, firmId = job.firmId!;
    const r = await this.db.foRetainer.findFirst({ where: { firmId, id: p.agreementId, kind: "CONSULTATION" }, include: { representative: true } });
    const b = await this.db.foBooking.findFirst({ where: { firmId, id: p.bookingId }, include: { type: true } });
    if (!r || !b || b.sequence !== p.sequence || !["SCHEDULED", "RESCHEDULED"].includes(b.status) || !["SENT", "VIEWED", "CLIENT_SIGNED"].includes(r.status)) return;
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: firmId } });
    const turn = r.status === "CLIENT_SIGNED" ? "The client has signed: it now needs your signature." : "The client has not signed yet.";
    await this.ports.mail.send({ firmId, to: r.representative.email, replyTo: firm.contactEmail, class: "SERVICE", idempotencyKey: job.key, templateKey: "consultation_agreement.reminder",
      subject: `Agreement not signed yet: ${b.type.name} tomorrow`.slice(0, 200), text: `The consultation agreement for ${b.type.name} (${wallLabel(b.startsAt, b.bookerTimeZone)}) is not signed yet. ${turn}\n\nThe meeting stays booked.\n` });
  }

  // ------------------------------------------------------------------------------------------------------ reads
  /** Whether the agreement version's booking is still to happen (SCHEDULED or RESCHEDULED). */
  private async bookingActive(q: Tx | PrismaClient, firmId: string, versionId: string) {
    const rows = await q.$queryRaw<{ n: bigint }[]>`select count(*) as n from fo_retainer_version v join fo_booking b on b.firm_id = v.firm_id and b.id::text = v.merge_values->>${BOOKING_ID}
       where v.firm_id = ${firmId}::uuid and v.id = ${versionId}::uuid and b.status in ('SCHEDULED', 'RESCHEDULED')`;
    return Number(rows[0]?.n ?? 0) > 0;
  }
  private async view(firmId: string, r: { id: string; status: string; signerPersonId: string | null; representativeStaffId: string; createdAt: Date }) {
    const v = await this.db.foRetainerVersion.findFirst({ where: { firmId, retainerId: r.id, n: 1 } });
    const m = (v?.mergeValues ?? {}) as Record<string, unknown>;
    const req = await this.db.foSignatureRequest.findFirst({ where: { firmId, documentKind: "CONSULTATION", documentId: r.id }, include: { signers: true, evidence: true }, orderBy: { sentAt: "desc" } });
    const of = (role: string) => req?.signers.find((s) => s.role === role);
    const rep = await this.db.platformStaff.findFirst({ where: { firmId, id: r.representativeStaffId }, select: { displayName: true } });
    const isHost = m["booking.signatory_is_host"] !== false;
    return {
      id: r.id, bookingId: String(m[BOOKING_ID] ?? ""), personId: r.signerPersonId, status: r.status, signed: r.status === "SIGNED", words: r.status === "SIGNED" ? WORDS.signed : WORDS.unsigned,
      sentAt: v?.sentAt ?? null, clientSignedAt: of("CLIENT")?.signedAt ?? null, firmSignedAt: of("FIRM")?.signedAt ?? null,
      signatory: { staffId: r.representativeStaffId, name: rep?.displayName ?? null, isHost,
        note: isHost ? null : `The consultation's host holds no licence record: the agreement is with the firm's representative of record, ${rep?.displayName ?? ""}.` },
      signedCopy: req?.evidence ? { sha256: req.evidence.sealedSha256, storedAt: req.evidence.storedAt } : null,
      legalReading: CODE_S23.legalReading,
    };
  }
  private async mine(ctx: StaffContext, id: string) {
    const r = UUID.test(String(id)) ? await this.db.foRetainer.findFirst({ where: { firmId: ctx.firmId, id, kind: "CONSULTATION" } }) : null;
    return r ?? notFound();
  }
  /** One agreement of the person's firm (another firm's id: 404). */
  async read(ctx: StaffContext, id: string) { return this.view(ctx.firmId, await this.mine(ctx, id)); }

  /** The booking's line: "Agreement signed" or "Agreement not signed yet" (or that none was sent). Another firm's booking: 404. */
  async forBooking(ctx: StaffContext, bookingId: string) {
    const b = UUID.test(String(bookingId)) ? await this.db.foBooking.findFirst({ where: { firmId: ctx.firmId, id: bookingId }, select: { id: true } }) : null;
    if (!b) return notFound();
    const a = await this.ofBooking(this.db, ctx.firmId, b.id);
    return a ? this.read(ctx, a.id) : { id: null, bookingId: b.id, status: "NONE", signed: false, words: WORDS.none };
  }
  /** The person's agreements, newest first. Another firm's person: 404. */
  async forPerson(ctx: StaffContext, personId: string) {
    const p = UUID.test(String(personId)) ? await this.db.foPerson.findFirst({ where: { firmId: ctx.firmId, id: personId }, select: { id: true } }) : null;
    if (!p) return notFound();
    const rows = await this.db.foRetainer.findMany({ where: { firmId: ctx.firmId, kind: "CONSULTATION", signerPersonId: p.id }, orderBy: { createdAt: "desc" }, take: 50 });
    return { personId: p.id, agreements: await Promise.all(rows.map((r) => this.view(ctx.firmId, r))) };
  }
  /** "Needs you": one item per unsigned agreement the person signs for the firm (it goes when the agreement is signed or ended). */
  async needsYou(ctx: StaffContext) {
    // Only while the meeting is still to happen (break m5: a cancelled booking's item goes).
    const rows = await this.db.$queryRaw<{ id: string; status: string }[]>`
      select r.id::text, r.status::text from fo_retainer r join fo_retainer_version v on v.firm_id = r.firm_id and v.retainer_id = r.id and v.n = 1
        join fo_booking b on b.firm_id = r.firm_id and b.id::text = v.merge_values->>${BOOKING_ID}
       where r.firm_id = ${ctx.firmId}::uuid and r.kind = 'CONSULTATION' and r.representative_staff_id = ${ctx.staffId}::uuid
         and r.status in ('SENT', 'VIEWED', 'CLIENT_SIGNED') and b.status in ('SCHEDULED', 'RESCHEDULED')
       order by r.created_at limit 100`;
    return { items: rows.map((r) => ({ kind: "consultation-agreement-unsigned", agreementId: r.id, words: WORDS.unsigned, yourTurn: r.status === "CLIENT_SIGNED" })) };
  }
  /** The template panel and the booking settings: each consultation template's s. 23(2) list (never blocking), and the
   *  warning when the firm has no active consultation template (no agreement is sent then). */
  async templateCheck(ctx: StaffContext) {
    const ts = await this.db.foRetainerTemplate.findMany({ where: { firmId: ctx.firmId, kind: "CONSULTATION" }, orderBy: { name: "asc" } });
    return {
      source: CODE_S23, warning: ts.some((t) => t.active) ? null : "No active consultation agreement template: bookings are made without an agreement. Upload one in Templates.",
      templates: ts.map((t) => { const items = s23Check(t.placeholders); return { id: t.id, name: t.name, version: t.version, active: t.active, items, missing: items.filter((i) => i.state === "MISSING").map((i) => `${i.section}: ${i.label}`) }; }),
    };
  }

  // -------------------------------------------------------------------------------------------------- signing
  /** The provider's embedded link. The provider may have ended this signer's part before its event reached us (the client
   *  signed and reloads): that is a 409 "no longer open here", never a 500 (break M2). */
  private async providerLink(firmId: string, providerDocumentId: string, signerId: string) {
    try { return await this.ports.signing.embeddedLink(firmId, providerDocumentId, signerId); } catch (e) {
      if (e instanceof SigningEnded) return fail(409, "Not open", "This agreement is signed or no longer open for signing here. The firm will email you the signed copy.", "SIGNING_ENDED");
      if (e instanceof SigningNotFound) return notFound();
      throw e;
    }
  }
  /** The client's door (no sign-in; the emailed link's token). Records the first view; with `consent: true` records the
   *  consent and answers the provider's embedded link. A wrong, ended or signed link is the one not-found. */
  async open(token: unknown, body: { consent?: unknown; code?: unknown; resend?: unknown } = {}, ip = "unknown") {
    this.limit(ip);
    const m = typeof token === "string" ? /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})\.[A-Za-z0-9_-]{43}$/.exec(token) : null;
    if (!m) return notFound();
    const firm = m.slice(1, 6).join("-");
    return withFirm(firm, () => this.openAs(firm, token as string, body));
  }
  private async openAs(firm: string, token: string, body: { consent?: unknown; code?: unknown; resend?: unknown }) {
    const s0 = await this.db.foSigner.findFirst({ where: { firmId: firm, linkTokenSha256: sha(token), role: "CLIENT" }, include: { request: true } });
    if (!s0 || s0.request.documentKind !== "CONSULTATION" || !["SENT", "VIEWED"].includes(s0.request.status) || s0.signedAt || s0.declinedAt) return notFound();
    const firmId = s0.firmId, now = this.ports.clock.now(), consent = body.consent === true;
    // A cancelled or ended booking's agreement is not signed by its link (break m5): the one not-found.
    if (!(await this.bookingActive(this.db, firmId, s0.request.documentVersionId))) return notFound();
    const s = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select 1 from fo_signature_request where firm_id = ${firmId}::uuid and id = ${s0.requestId}::uuid for update`;
      const cur = await tx.foSigner.findFirstOrThrow({ where: { firmId, id: s0.id } });
      const data = { ...(cur.viewedAt ? {} : { viewedAt: now }), ...(consent && !cur.consentedAt ? { consentedAt: now, consentTextVersion: CONSENT_TEXT_VERSION } : {}) };
      if (!Object.keys(data).length) return cur;
      const next = await tx.foSigner.update({ where: { id: cur.id }, data });
      if (!cur.viewedAt) {
        await tx.foSignatureRequest.updateMany({ where: { firmId, id: s0.requestId, status: "SENT" }, data: { status: "VIEWED" } });
        await tx.foRetainer.updateMany({ where: { firmId, id: s0.request.documentId, status: "SENT" }, data: { status: "VIEWED" } });
      }
      const what = [cur.viewedAt ? null : "opened", data.consentedAt ? "consent to sign electronically recorded" : null].filter(Boolean).join("; ");
      await this.ports.audit.record(tx, { firmId, actor: SYSTEM, action: "consultation_agreement.opened", entity: "fo_retainer", entityKey: s0.request.documentId, summary: `Consultation agreement: ${what} (client).`,
        detail: { agreementId: s0.request.documentId, signerId: cur.id, consentTextVersion: data.consentedAt ? CONSENT_TEXT_VERSION : null }, before: { viewed: !!cur.viewedAt, consented: !!cur.consentedAt }, after: { viewed: true, consented: !!next.consentedAt } });
      return next;
    });
    const base = { agreementId: s0.request.documentId, consentText: CONSENT_TEXT, consentTextVersion: CONSENT_TEXT_VERSION, consented: !!s.consentedAt };
    if (!s.consentedAt) return { ...base, codeNeeded: false, link: null };
    const fresh = !!s.codeVerifiedAt && now.getTime() - s.codeVerifiedAt.getTime() < CODE_SESSION_MS;
    const verified = fresh ? true : await this.code(firmId, s0.id, s0.request.documentId, body);
    if (!verified) return { ...base, codeNeeded: true, codeSentTo: "the email address this link was sent to", link: null };
    return { ...base, codeNeeded: false, link: await this.providerLink(firmId, s0.request.providerDocumentId, s.id) };
  }

  /** P-564: the one-time email code. No code given → one is sent (again only when the last has expired, or on `resend`);
   *  a code given → checked under the request's lock: right → verified (true); wrong → counted, the sixth locks the link
   *  15 minutes (423); a locked link answers 423 until then. Only the code's sha256 is stored. */
  private async code(firmId: string, signerId: string, agreementId: string, body: { code?: unknown; resend?: unknown }): Promise<boolean> {
    const now = this.ports.clock.now(), given = typeof body.code === "string" && /^\d{6}$/.test(body.code.trim()) ? body.code.trim() : null;
    if (body.code !== undefined && !given) fail(422, "Check the code", "The code is the 6 digits in the email we sent you.", "CODE_FORMAT");
    let send: string | null = null;
    const verdict = await this.db.$transaction(async (tx) => {
      const r = await tx.foSigner.findFirstOrThrow({ where: { firmId, id: signerId }, include: { request: true } });
      await tx.$queryRaw`select 1 from fo_signature_request where firm_id = ${firmId}::uuid and id = ${r.requestId}::uuid for update`;
      const cur = await tx.foSigner.findFirstOrThrow({ where: { firmId, id: signerId } });
      if (cur.codeVerifiedAt && now.getTime() - cur.codeVerifiedAt.getTime() < CODE_SESSION_MS) return "OK" as const;
      if (cur.lockedUntil && cur.lockedUntil > now) return "LOCKED" as const;
      const line = (summary: string, after: Record<string, string | number | boolean | null>) => this.ports.audit.record(tx, { firmId, actor: SYSTEM, action: "consultation_agreement.code", entity: "fo_retainer", entityKey: agreementId, summary,
        detail: { agreementId, signerId }, before: { codeFailures: cur.codeFailures, locked: !!cur.lockedUntil }, after });
      if (!given) {
        const live = !!cur.codeSha256 && !!cur.codeExpiresAt && cur.codeExpiresAt > now && unspent(cur);
        if (live && body.resend !== true) return "SENT" as const;
        if (cur.codeExpiresAt && cur.codeExpiresAt.getTime() - CODE_MINUTES * 60_000 > now.getTime() - RESEND_GAP_MS) return "TOO_SOON" as const;
        send = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const failures = cur.lockedUntil ? 0 : cur.codeFailures;
        await tx.foSigner.update({ where: { id: cur.id }, data: { codeSha256: sha(send), codeExpiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000), codeFailures: failures, lockedUntil: null } });   // code_verified_at stays: the client did check a code once (R3-1)
        await line("Consultation agreement: a one-time code was emailed to the client.", { codeFailures: failures, locked: false });
        return "SENT" as const;
      }
      const live = cur.codeSha256 && cur.codeExpiresAt && cur.codeExpiresAt > now && unspent(cur);   // a used code is spent
      const right = !!live && timingSafeEqual(Buffer.from(sha(given), "hex"), Buffer.from(cur.codeSha256!, "hex"));
      if (right) {
        await tx.foSigner.update({ where: { id: cur.id }, data: { codeVerifiedAt: now, codeFailures: 0, lockedUntil: null } });
        await line("Consultation agreement: the client's one-time code was right.", { codeFailures: 0, locked: false, verified: true });
        return "OK" as const;
      }
      const failures = (cur.lockedUntil ? 0 : cur.codeFailures) + 1, lock = failures >= CODE_TRIES ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
      await tx.foSigner.update({ where: { id: cur.id }, data: { codeFailures: Math.min(failures, CODE_TRIES), lockedUntil: lock } });
      await line(lock ? "Consultation agreement: a sixth wrong code locked the link for 15 minutes." : "Consultation agreement: a wrong or expired code.", { codeFailures: Math.min(failures, CODE_TRIES), locked: !!lock });
      return (lock ? "LOCKED" : live ? "WRONG" : "EXPIRED") as "LOCKED" | "WRONG" | "EXPIRED" | "TOO_SOON";
    });
    if (send) {
      const s = await this.db.foSigner.findFirstOrThrow({ where: { firmId, id: signerId } });
      const person = s.personId ? await this.db.foPerson.findFirst({ where: { firmId, id: s.personId } }) : null;
      const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: firmId } });
      if (person?.email) await this.safe("the one-time code's email", () => this.ports.mail.send({ firmId, to: person.email!, replyTo: firm.contactEmail, class: "TRANSACTIONAL", person: { kind: "FO_PERSON", id: person.id },
        idempotencyKey: `consultation-agreement:${agreementId}:code:${sha(send!).slice(0, 16)}`, templateKey: "consultation_agreement.code",
        subject: `Your code to sign with ${firm.operatingName}`.slice(0, 200), text: `Your one-time code is ${send}. It works for ${CODE_MINUTES} minutes. If you did not ask for it, ignore this email.\n` }));
    }
    if (verdict === "TOO_SOON") fail(429, "Wait a minute", "A code was sent less than a minute ago. Check your email, or ask again in a minute.", "CODE_TOO_SOON");
    if (verdict === "LOCKED") fail(423, "Locked for now", `Too many wrong codes. Try again in ${LOCK_MINUTES} minutes.`, "CODE_LOCKED");
    if (verdict === "WRONG") fail(422, "Wrong code", "That code is not right. Check the email and try again.", "CODE_WRONG");
    if (verdict === "EXPIRED") fail(422, "Code expired", "That code has expired. Ask for a new one.", "CODE_EXPIRED");
    return verdict === "OK";
  }

  /** The firm's signer asks for their signing link (`consent: true`, the same consent text). Refused until the client has
   *  signed; only the person the agreement names signs for the firm. */
  async hostLink(ctx: StaffContext, id: string, body: { consent?: unknown } = {}) {
    const r = await this.mine(ctx, id);
    if (r.representativeStaffId !== ctx.staffId) fail(403, "Not allowed", "Only the person this agreement names signs it for the firm.", "NOT_THE_SIGNATORY");
    if (r.status === "SENT" || r.status === "VIEWED") fail(409, "Not yet", "The client signs first. You can sign once the client has signed.", "CLIENT_SIGNS_FIRST");
    if (r.status !== "CLIENT_SIGNED") fail(409, "Not open", r.status === "SIGNED" ? "This agreement is already signed." : "This agreement is no longer open for signing.", "NOT_OPEN");
    if (body.consent !== true) fail(422, "Consent needed", CONSENT_TEXT, "CONSENT_NEEDED");
    const req = await this.db.foSignatureRequest.findFirstOrThrow({ where: { firmId: ctx.firmId, documentKind: "CONSULTATION", documentId: r.id, status: "CLIENT_SIGNED" }, include: { signers: true } });
    const me0 = req.signers.find((s) => s.role === "FIRM")!, now = this.ports.clock.now();
    // Under the request's lock and re-read, so a double click records the consent once (break m4).
    if (!me0.consentedAt) await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select 1 from fo_signature_request where firm_id = ${ctx.firmId}::uuid and id = ${req.id}::uuid for update`;
      const me = await tx.foSigner.findFirstOrThrow({ where: { firmId: ctx.firmId, id: me0.id } });
      if (me.consentedAt || me.signedAt || me.declinedAt) return;
      await tx.foSigner.update({ where: { id: me.id }, data: { viewedAt: me.viewedAt ?? now, consentedAt: now, consentTextVersion: CONSENT_TEXT_VERSION } });
      await this.ports.audit.record(tx, { firmId: ctx.firmId, actor: `staff:${ctx.staffId}`, action: "consultation_agreement.opened", entity: "fo_retainer", entityKey: r.id, summary: "Consultation agreement: consent to sign electronically recorded (firm).",
        detail: { agreementId: r.id, signerId: me.id, consentTextVersion: CONSENT_TEXT_VERSION }, before: { consented: false }, after: { consented: true } });
    });
    return { agreementId: r.id, link: await this.providerLink(ctx.firmId, req.providerDocumentId, me0.id) };
  }

  /** A provider's call (FO-6's webhook route hands it over). Unverified, or about a document that is not a consultation
   *  agreement's: nothing is written. A verified event is stored once (a repeat changes nothing) and applied by the
   *  signing rules: the firm never signs before the client, and no one signs without the recorded consent. */
  async signingEvent(call: SigningHookCall, inFirm?: string): Promise<{ verified: boolean; applied: boolean; reason?: string }> {
    const ev = await this.ports.signing.verifyWebhook(call);
    if (!ev) return { verified: false, applied: false, reason: "UNVERIFIED" };
    // A webhook names no firm: FO-6's route resolves it (its narrow lookup, PF-12) and passes it; a direct call reads as its caller.
    return inFirm ? withFirm(inFirm, () => this.apply(ev, inFirm)) : this.apply(ev);
  }
  private async apply(ev: SigningHookEvent, inFirm?: string): Promise<{ verified: boolean; applied: boolean; reason?: string }> {
    const req = await this.db.foSignatureRequest.findFirst({ where: { ...(inFirm ? { firmId: inFirm } : {}), provider: ev.provider, providerDocumentId: ev.providerDocumentId, documentKind: "CONSULTATION" } });
    if (!req) return { verified: true, applied: false, reason: "NOT_OURS" };
    const firmId = req.firmId, now = this.ports.clock.now(), id = req.documentId;
    const out = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select 1 from fo_signature_request where firm_id = ${firmId}::uuid and id = ${req.id}::uuid for update`;
      const cur = await tx.foSignatureRequest.findFirstOrThrow({ where: { firmId, id: req.id }, include: { signers: true } });
      if (await tx.foSigningHookReceipt.findFirst({ where: { firmId, provider: ev.provider, providerDocumentId: ev.providerDocumentId, eventId: ev.eventId }, select: { id: true } })) return { applied: false, reason: "REPEAT", seal: true };   // a repeat retries a seal that failed (break m3)
      await tx.foSigningHookReceipt.create({ data: { firmId, requestId: req.id, provider: ev.provider, providerDocumentId: ev.providerDocumentId, eventId: ev.eventId, eventType: ev.providerType } });
      const s = ev.signerId ? cur.signers.find((x) => x.id === ev.signerId) : undefined, live = ["SENT", "VIEWED", "CLIENT_SIGNED"].includes(cur.status);
      const line = (summary: string, after: Record<string, string | boolean | null>, action = `consultation_agreement.${ev.type}`) => this.ports.audit.record(tx, { firmId, actor: `system:signing-${ev.provider.toLowerCase()}`, action, entity: "fo_retainer", entityKey: id, summary,
        detail: { agreementId: id, requestId: req.id, eventId: ev.eventId, signerRole: s?.role ?? null }, before: { status: cur.status }, after });
      const refuse = async (reason: string, words: string) => { await line(`Consultation agreement: a signing event was not applied (${words}).`, { status: cur.status, refused: reason }, "consultation_agreement.event_refused"); return { applied: false, reason }; };
      if (ev.type === "completed" || ev.type === "other") {   // a genuine event that moves nothing here; "completed" also retries the seal
        await line(`Consultation agreement: the provider's event "${ev.providerType}" was received.`, { status: cur.status }, "consultation_agreement.event_noted");
        return { applied: false, reason: "NOTED", seal: ev.type === "completed" };
      }
      if (!live || !s || s.signedAt || s.declinedAt) return refuse("NO_CHANGE", "nothing to change");
      if (ev.type === "viewed") {
        if (s.viewedAt) return refuse("NO_CHANGE", "already viewed");
        await tx.foSigner.update({ where: { id: s.id }, data: { viewedAt: now } });
        if (cur.status === "SENT") { await tx.foSignatureRequest.update({ where: { id: req.id }, data: { status: "VIEWED" } }); await tx.foRetainer.updateMany({ where: { firmId, id, status: "SENT" }, data: { status: "VIEWED" } }); }
        await line(`Consultation agreement viewed (${s.role === "CLIENT" ? "client" : "firm"}).`, { status: cur.status === "SENT" ? "VIEWED" : cur.status });
        return { applied: true };
      }
      if (ev.type === "declined") {
        await tx.foSigner.update({ where: { id: s.id }, data: { declinedAt: now } });
        await tx.foSignatureRequest.update({ where: { id: req.id }, data: { status: "DECLINED", endedAt: now } });
        // FO-5's agreement moves CLIENT_SIGNED only to SIGNED, WITHDRAWN or SIGNED_OFFLINE (fo_retainer_write): a decline after
        // the client signed (the firm's signer) ends it as WITHDRAWN with that reason, never a 500 (break M1).
        const after = cur.status === "CLIENT_SIGNED" ? "WITHDRAWN" : "DECLINED";
        await tx.foRetainerVersion.update({ where: { id: req.documentVersionId }, data: { endedAt: now, endReason: after } });
        await tx.foRetainer.update({ where: { id }, data: after === "WITHDRAWN" ? { status: "WITHDRAWN", withdrawnAt: now, withdrawnBy: SYSTEM, withdrawnReason: "The firm's signer declined to sign after the client signed." } : { status: "DECLINED" } });
        await line(`Consultation agreement declined (${s.role === "CLIENT" ? "client" : "firm"}). The meeting stays booked.`, { status: "DECLINED", agreement: after });
        return { applied: true };
      }
      if (s.role === "FIRM" && cur.signers.some((x) => x.role === "CLIENT" && !x.signedAt)) return refuse("CLIENT_SIGNS_FIRST", "the firm cannot sign before the client");
      if (!s.consentedAt) return refuse("NO_CONSENT", "no recorded consent to sign electronically");
      if (s.role === "CLIENT" && !s.codeVerifiedAt) return refuse("NO_CODE", "the client's one-time email code was not checked (P-564)");
      await tx.foSigner.update({ where: { id: s.id }, data: { signedAt: now, viewedAt: s.viewedAt ?? now } });
      if (s.role === "CLIENT") {
        await tx.foSignatureRequest.update({ where: { id: req.id }, data: { status: "CLIENT_SIGNED" } });
        await tx.foRetainer.update({ where: { id }, data: { status: "CLIENT_SIGNED" } });
        await line("Consultation agreement signed by the client. It now needs the firm's signature.", { status: "CLIENT_SIGNED" });
      } else await line("Consultation agreement signed for the firm.", { status: cur.status, firmSigned: true });
      return { applied: true, seal: s.role === "FIRM" };
    }, { maxWait: 10_000, timeout: 20_000 });
    if ("seal" in out && out.seal) await this.seal(firmId, req.id);
    return { verified: true, applied: out.applied, reason: "reason" in out ? out.reason : undefined };
  }

  /** Every signer signed: the sealed copy and the provider's audit file are fetched, stored and hashed, the request and
   *  the agreement become SIGNED, and the client's copy is queued once (s. 23(3)). A second call changes nothing. */
  async seal(firmId: string, requestId: string): Promise<boolean> {
    const req = await this.db.foSignatureRequest.findFirst({ where: { firmId, id: requestId, documentKind: "CONSULTATION", status: "CLIENT_SIGNED" }, include: { signers: true, evidence: true } });
    if (!req || req.evidence || req.signers.some((s) => !s.signedAt)) return false;
    const f = await this.ports.signing.fetchFiles(firmId, req.providerDocumentId), now = this.ports.clock.now(), id = req.documentId;
    const put = async (name: string, x: { bytes: Uint8Array; contentType: string }) => {
      const key = `signing/${req.id}/${name}.pdf`, had = await this.ports.files.get(firmId, key);
      return had ? { key, sha256: had.sha256 } : this.ports.files.put(firmId, key, x.bytes, x.contentType);
    };
    const sealed = await put("sealed", f.sealed), audit = await put("audit", f.audit);
    const done = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`select 1 from fo_signature_request where firm_id = ${firmId}::uuid and id = ${req.id}::uuid for update`;
      if (await tx.foSigningEvidence.findFirst({ where: { firmId, requestId: req.id }, select: { id: true } })) return false;
      await tx.foSigningEvidence.create({ data: { firmId, requestId: req.id, sealedFileKey: sealed.key, sealedSha256: sealed.sha256, auditFileKey: audit.key, auditSha256: audit.sha256, consentTextVersion: CONSENT_TEXT_VERSION, storedAt: now } });
      await tx.foSignatureRequest.update({ where: { id: req.id }, data: { status: "SIGNED", endedAt: now } });
      await tx.foRetainer.update({ where: { id }, data: { status: "SIGNED" } });
      const v = await tx.foRetainerVersion.findFirst({ where: { firmId, id: req.documentVersionId } });
      const bookingId = String((v?.mergeValues as Record<string, unknown> | undefined)?.[BOOKING_ID] ?? "");
      await this.ports.audit.record(tx, { firmId, actor: SYSTEM, action: AGREEMENT_EVENT.SIGNED, entity: "fo_retainer", entityKey: id, summary: "Consultation agreement signed by the client and the firm; the signed copy is stored.",
        detail: { agreementId: id, bookingId, requestId: req.id, sealedSha256: sealed.sha256, auditSha256: audit.sha256 }, before: { status: "CLIENT_SIGNED" }, after: { status: "SIGNED", sealedSha256: sealed.sha256 } });
      await tx.moduleEvent.create({ data: { firmId, type: AGREEMENT_EVENT.SIGNED, subjectId: id, occurredAt: now, payload: { agreementId: id, bookingId, sealedSha256: sealed.sha256 } } });   // last (contracts §0.5)
      return true;
    }, { maxWait: 10_000, timeout: 20_000 });
    if (done) await this.queueCopy(firmId, id, req.id);
    return done;
  }
  /** The signed copy's job, keyed once per agreement (a second queue of it does nothing; the runner retries a failed run). */
  private async queueCopy(firmId: string, agreementId: string, requestId: string) {
    await this.safe("the signed copy's email", () => this.ports.jobs.enqueue(COPY_JOB, { agreementId, requestId }, { firmId, key: `consultation-agreement:${agreementId}:signed-copy` }));
  }

  /** The signed copy to the client, once (the job's key is the email's key). */
  private async runSignedCopy(job: JobRun) {
    const p = job.payload as { agreementId: string; requestId: string }, firmId = job.firmId!;
    const ev = await this.db.foSigningEvidence.findFirst({ where: { firmId, requestId: p.requestId } });
    const r = await this.db.foRetainer.findFirst({ where: { firmId, id: p.agreementId, kind: "CONSULTATION" } });
    const person = r?.signerPersonId ? await this.db.foPerson.findFirst({ where: { firmId, id: r.signerPersonId } }) : null;
    const file = ev ? await this.ports.files.get(firmId, ev.sealedFileKey) : null;
    if (!ev || !person?.email || !file) return;
    const firm = await this.db.platformFirm.findUniqueOrThrow({ where: { id: firmId } });
    await this.ports.mail.send({ firmId, to: person.email, replyTo: firm.contactEmail, class: "TRANSACTIONAL", person: { kind: "FO_PERSON", id: person.id }, idempotencyKey: job.key, templateKey: "consultation_agreement.signed_copy",
      subject: `Your signed consultation agreement with ${firm.operatingName}`.slice(0, 200), text: `Hello ${person.givenNames ?? ""},\n\nYour consultation agreement with ${firm.operatingName} is signed by you and by the firm. Your copy is attached. Keep it for your records.\n`,
      attachments: [{ filename: "consultation-agreement-signed.pdf", contentType: file.contentType, bytes: new Uint8Array(file.bytes) }] });
  }
}
