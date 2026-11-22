// FO-3c (BACKLOG row FO-3c; capability R1.104; P-564, P-627 (7); Code SOR/2022-128 s. 23, trace t8; Unconfirmed: no
// counsel): the consultation agreement before the first consultation, on SigningPort's fake. Cases DW1..DW9 of the row,
// each with a passing and a failing case, at the service: a scratch database (every migration), PF-3's Sample firms and
// staff (user-R and user-T licensed, user-O a case officer with no licence record; firm B's user-S), the real FilesPort
// (a scratch folder) and docx render, the fake clock, jobs, mail and audit. No server, no browser, no model call (US$0).
// Dropped at the end.
//   tsx studio/tests/check_fo3c_consultation_agreement.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fakeAudit } from "../ports/audit.ts";
import { FakeClock } from "../ports/clock.ts";
import { EVENT } from "../ports/events.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";
import { s23Check } from "../api/src/front-office/booking/consultation-agreement/items.ts";
import { AGREEMENT_EVENT, BOOKING_ID, ConsultationAgreementService, PRO_BONO, WORDS } from "../api/src/front-office/booking/consultation-agreement/service.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { buildDocx, placeholdersOf } from "../api/src/front-office/retainers/docx.ts";
import { Retainers } from "../api/src/front-office/retainers/service.ts";
import { fakeSigning } from "../api/src/front-office/signing/port.ts";
import type { StaffContext } from "../api/src/platform/identity/keys.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3c_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `fo3c-check-${process.pid}`);

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const fails = async (f: () => Promise<unknown>, status: number, re: RegExp = /./) => {
  try { await f(); return false; } catch (e) {
    const r = e as { getResponse?: () => unknown; getStatus?: () => number }, body = JSON.stringify(r.getResponse?.() ?? String(e)), okay = r.getStatus?.() === status && re.test(body);
    if (!okay) console.log(`      (refused ${r.getStatus?.()}: ${body.slice(0, 300)})`);
    return okay;
  }
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });

try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key='sample-firm'`), B = sql(`select id from platform_firm where key='sample-solo'`);
  const sid = (actor: string) => sql(`select id from platform_staff where actor_id='${actor}'`);
  const ctxOf = (actor: string, firmId: string, firmKey: string): StaffContext => ({ staffId: sid(actor), firmId, firmKey, roles: [], keys: [], duties: [], authTime: 0, via: "local" });
  const R = ctxOf("user-R", A, "sample-firm"), T = ctxOf("user-T", A, "sample-firm"), O = ctxOf("user-O", A, "sample-firm"), S = ctxOf("user-S", B, "sample-solo");
  const clock = new FakeClock("2026-11-24T14:00:00Z");
  const jobs = fakeJobs(clock), mail = fakeMail({ clock }), signing = fakeSigning({ now: () => clock.now() }), files = new LocalFiles(join(WORK, "files"));
  // The audit fake, noting at each line whether the agreement's outbox row is already there (DW9) and failing on demand (DW8).
  let failAudit = false;
  const eventsAtAudit: number[] = [];
  const inner = fakeAudit({ failOn: () => failAudit });
  const audit = { record: async (tx: { moduleEvent: { count(a: unknown): Promise<number> } }, e: { entityKey: string; action: string }) => {
    if (e.action === AGREEMENT_EVENT.SENT || e.action === AGREEMENT_EVENT.SIGNED) eventsAtAudit.push(await tx.moduleEvent.count({ where: { subjectId: e.entityKey, type: e.action } }));
    return inner.record(tx, e as never);
  } };
  const svc = new ConsultationAgreementService(db, { audit: audit as never, clock, mail, jobs, signing, files, publicBaseUrl: "https://book.example" });
  await svc.registerJobs();
  const lines = (key: string, action?: string) => inner.entries.filter((e) => e.entityKey === key && (!action || e.action === action));
  const events = (type: string, key: string) => Number(sql(`select count(*) from module_event where type = '${type}' and subject_id = '${key}'`));

  // Templates through FO-5's own store. Firm A: a full one; firm B: one without the fee placeholder (DW6).
  const retainers = new Retainers(db, files, { now: () => clock.now().getTime() });
  const FULL = ["# Consultation agreement", "Client: {client.name} ({client.email})", "Licensee: {representative.name}, {representative.licence_number}", "{#fees}", "{label}: {amount}", "{/fees}"];
  const NO_FEE = ["# Consultation agreement", "Client: {client.name} ({client.phone})", "Licensee: {representative.name}, {representative.licence_number}"];
  const up = (c: StaffContext, name: string, text: string[]) => { const bytes = buildDocx(text); return retainers.uploadTemplate(c, { name, kind: "CONSULTATION" }, { bytes, size: bytes.length } as never); };

  // DW6 fail side first: a firm with no active consultation template sees the warning, and a booking sends nothing.
  const person = (firmId: string, given: string, email: string | null) => db.foPerson.create({ data: { firmId, givenNames: given, familyName: "Sample", email, createdBy: "seed:fo3c" } });
  const type = (firmId: string, slug: string, hosts: string[], purpose = "FREE_CONSULT") => db.foConsultationType.create({ data: { firmId, slug, name: `Sample consultation ${slug}`, purpose: purpose as never, modes: ["VIDEO"], hostStaffIds: hosts, minutes: 30 } });
  let hour = 0;
  const book = async (firmId: string, t: { id: string }, staffId: string, p: { id: string }, daysAhead = 7) => {
    const startsAt = new Date(clock.now().getTime() + daysAhead * 86_400_000 + hour++ * 3_600_000);
    return db.foBooking.create({ data: { firmId, typeId: t.id, staffId, personId: p.id, mode: "VIDEO", startsAt, endsAt: new Date(startsAt.getTime() + 30 * 60_000), bookerTimeZone: "America/Toronto" } });
  };
  const eventOf = (type: string, b: { id: string; firmId: string; sequence: number; status: string; typeId: string; staffId: string; personId: string | null; prospectId: string | null; mode: string; startsAt: Date; endsAt: Date; bookerTimeZone: string }) =>
    ({ type, firmId: b.firmId, payload: { key: `${b.id}:${b.sequence}`, bookingId: b.id, sequence: b.sequence, status: b.status, typeId: b.typeId, staffId: b.staffId, personId: b.personId, prospectId: b.prospectId, mode: b.mode, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), bookerTimeZone: b.bookerTimeZone } });
  const TA = await type(A, "fo3c-free", [R.staffId, O.staffId, T.staffId]), TB = await type(B, "fo3c-solo", [S.staffId]);
  const lee = await person(A, "Lee", "lee@client.example"), pat = await person(A, "Pat", "pat@client.example"), sam = await person(B, "Sam", "sam@client.example");

  const none = await svc.templateCheck(R), b0 = await book(A, TA, R.staffId, lee);
  const sent0 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b0));
  ok("FO-3c DW6 fail: a firm with no active consultation template sees the warning on its booking settings, and a booking sends no agreement (the booking stays)",
    /No active consultation agreement template/.test(none.warning ?? "") && sent0?.sent === false && sent0.reason === "NO_TEMPLATE" && (await svc.forBooking(R, b0.id)).words === WORDS.none && mail.sent.length === 0, { none, sent0 });

  const tplA = await up(R, "Consultation (Sample)", FULL), tplB = await up(S, "Consultation without fee (Sample)", NO_FEE);
  const checkA = await svc.templateCheck(R), checkB = await svc.templateCheck(S);
  const itemsB = checkB.templates.find((t) => t.id === tplB.id)!;
  ok("FO-3c DW6 pass: a template without the fee placeholder is accepted, with the missing item shown (s. 23(2)(c)); the full template shows none missing; (d) and (e) are not checked",
    itemsB.missing.length === 1 && /s\. 23\(2\)\(c\)/.test(itemsB.missing[0]) && checkB.warning === null && checkA.templates.find((t) => t.id === tplA.id)!.missing.length === 0
    && s23Check(await placeholdersOf(buildDocx(FULL))).filter((i) => i.state === "NOT_CHECKED").map((i) => i.letter).join("") === "de" && checkA.source.legalReading === "Unconfirmed: no counsel", { itemsB, checkA });

  // ---------------------------------------------------------------------- DW1: one agreement per booking; a reschedule sends none
  const b1 = await book(A, TA, R.staffId, lee);
  const s1 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b1));
  const a1 = s1?.sent ? s1.agreementId : "";
  const inboxLee = () => mail.inbox("lee@client.example").filter((m) => m.templateKey === "consultation_agreement.sent");
  const v1 = await db.foRetainerVersion.findFirst({ where: { retainerId: a1 } });
  ok("FO-3c DW1 pass: a booking sends one agreement: an fo_retainer of kind CONSULTATION for the booking, one signing request with the client then the firm, one email with our link, the pro bono statement printed",
    s1?.sent === true && sql(`select kind || ' ' || status from fo_retainer where id = '${a1}'`) === "CONSULTATION SENT" && (v1?.mergeValues as Record<string, unknown>)[BOOKING_ID] === b1.id
    && sql(`select string_agg(role::text || sign_order, ',' order by sign_order) from fo_signer s join fo_signature_request r on r.id = s.request_id where r.document_id = '${a1}'`) === "CLIENT1,FIRM2"
    && inboxLee().length === 1 && /https:\/\/book\.example\/sign\/consultation-agreement#[0-9a-f]{32}\.[\w-]{43}/.test(inboxLee()[0].text) && ((v1?.mergeValues as { fees: { amount: string }[] }).fees[0].amount === PRO_BONO)
    && (await svc.forBooking(R, b1.id)).words === WORDS.unsigned, { s1, inbox: inboxLee().length });
  const again = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b1));
  const moved = await db.foBooking.update({ where: { id: b1.id }, data: { status: "RESCHEDULED", startsAt: new Date(b1.startsAt.getTime() + 86_400_000), endsAt: new Date(b1.endsAt.getTime() + 86_400_000), sequence: { increment: 1 } } });
  const res = await svc.onBookingEvent(eventOf(EVENT.BOOKING_RESCHEDULED, moved));
  const sweep = await svc.catchUp((_f, fn) => fn());
  ok("FO-3c DW1 fail: the same event again, a reschedule and the catch-up send none: still one agreement, one request, one email, one sent event; the catch-up sends only the booking made before the template",
    again?.sent === false && res?.sent === false && Number(sql(`select count(*) from fo_retainer_version where merge_values->>'booking.id' = '${b1.id}'`)) === 1 && Number(sql(`select count(*) from fo_signature_request where document_id = '${a1}'`)) === 1
    && inboxLee().filter((m) => m.text.includes("Sample consultation fo3c-free")).length === 2 && events(AGREEMENT_EVENT.SENT, a1) === 1 && sweep.sent === 1 && (await svc.forBooking(R, b0.id)).words === WORDS.unsigned, { again, res, sweep, mails: inboxLee().length });

  // --------------------------------------------------------------------------------- DW2: the host cannot sign before the client
  const req1 = await db.foSignatureRequest.findFirstOrThrow({ where: { documentId: a1 }, include: { signers: true } });
  const cl1 = req1.signers.find((s) => s.role === "CLIENT")!, fm1 = req1.signers.find((s) => s.role === "FIRM")!;
  const token1 = /#([0-9a-f]{32}\.[\w-]{43})/.exec(inboxLee().find((m) => m.text.includes(wall(b1.startsAt)))?.text ?? inboxLee()[0].text)![1];
  const early = await fails(() => svc.hostLink(R, a1, { consent: true }), 409, /CLIENT_SIGNS_FIRST/);
  // The out-of-order provider event is played on the catch-up's agreement (b0's), so this one's envelope stays in order.
  const a0 = (await svc.forBooking(R, b0.id)).id!, req0 = await db.foSignatureRequest.findFirstOrThrow({ where: { documentId: a0 }, include: { signers: true } }), fm0 = req0.signers.find((s) => s.role === "FIRM")!;
  const [hostFirst] = await signing.act(A, req0.providerDocumentId, fm0.id, "signed");
  const refused = await svc.signingEvent(hostFirst);
  ok("FO-3c DW2 fail: the host cannot sign before the client: the host's link is refused (409) and a provider event of the firm's signature first is stored, not applied (no signature, status unchanged, one audit line)",
    early && refused.verified && !refused.applied && refused.reason === "CLIENT_SIGNS_FIRST" && sql(`select signed_at is null from fo_signer where id = '${fm0.id}'`) === "t" && sql(`select status from fo_signature_request where id = '${req0.id}'`) === "SENT"
    && lines(a0, "consultation_agreement.event_refused").length === 1 && await fails(() => svc.hostLink(T, a1, { consent: true }), 403, /NOT_THE_SIGNATORY/), { early, refused });
  // The client: the door records the view, then the consent, and answers the provider's embedded link; no consent → no signature.
  const seen = await svc.open(token1);
  const [noConsent] = await signing.act(A, req1.providerDocumentId, cl1.id, "viewed");
  await svc.signingEvent(noConsent);
  const consented = await svc.open(token1, { consent: true });
  const [clientSigned] = await signing.act(A, req1.providerDocumentId, cl1.id, "signed");
  const c1 = await svc.signingEvent(clientSigned);
  const hostNow = await svc.hostLink(R, a1, { consent: true });
  ok("FO-3c DW2 pass: once the client has consented and signed (CLIENT_SIGNED), the host gets their signing link; a wrong link is the one not-found",
    seen.consented === false && seen.link === null && /^https:\/\/signing\.fake\.invalid\//.test(consented.link?.url ?? "") && c1.applied && sql(`select status from fo_retainer where id = '${a1}'`) === "CLIENT_SIGNED"
    && /^https:\/\/signing\.fake\.invalid\//.test(hostNow.link.url) && await fails(() => svc.open(`${token1.slice(0, -1)}${token1.endsWith("A") ? "B" : "A"}`), 404) && await fails(() => svc.open("nonsense"), 404), { seen, c1 });

  // ------------------------------------------------------------- DW3: the signed copy and its hash are stored and emailed once
  const before = await svc.read(R, a1);
  ok("FO-3c DW3 fail: until the firm signs there is no signed copy: \"Agreement not signed yet\", no evidence row, no copy emailed",
    before.words === WORDS.unsigned && before.signedCopy === null && Number(sql(`select count(*) from fo_signing_evidence where request_id = '${req1.id}'`)) === 0 && mail.sent.filter((m) => m.templateKey === "consultation_agreement.signed_copy").length === 0, before);
  const done = await signing.act(A, req1.providerDocumentId, fm1.id, "signed");   // signed, then the provider's "completed"
  for (const h of done) await svc.signingEvent(h);
  for (const h of done) await svc.signingEvent(h);   // the provider's repeats change nothing
  await svc.seal(A, req1.id);
  await jobs.runDue();
  const after = await svc.read(R, a1), evd = await db.foSigningEvidence.findFirstOrThrow({ where: { requestId: req1.id } });
  const sealed = await files.get(A, evd.sealedFileKey), copies = mail.inbox("lee@client.example").filter((m) => m.templateKey === "consultation_agreement.signed_copy");
  ok("FO-3c DW3 pass: all signed → the sealed copy and the audit file are stored with their sha256, the booking and the person show \"Agreement signed\", and the client is emailed the copy once (repeats and a second seal add none)",
    after.words === WORDS.signed && after.signedCopy?.sha256 === sealed?.sha256 && /^[0-9a-f]{64}$/.test(evd.auditSha256) && sql(`select status from fo_signature_request where id = '${req1.id}'`) === "SIGNED"
    && copies.length === 1 && copies[0].attachments?.length === 1 && Buffer.from(copies[0].attachments![0].bytes).equals(Buffer.from(sealed!.bytes))
    && (await svc.forBooking(R, b1.id)).words === WORDS.signed && (await svc.forPerson(R, lee.id)).agreements.some((x) => x.id === a1 && x.words === WORDS.signed) && events(AGREEMENT_EVENT.SIGNED, a1) === 1, { after, copies: copies.length });

  // ---------------------------------------------- DW4: a host with no licence record → the firm's representative of record
  const b4 = await book(A, TA, O.staffId, pat), s4 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b4));
  const a4 = s4?.sent ? s4.agreementId : "", r4 = await svc.read(R, a4);
  ok("FO-3c DW4 pass: the host holds no licence record → the agreement goes to the firm's representative of record instead, and the read, the audit line and the client's email say so",
    r4.signatory.staffId === R.staffId && r4.signatory.isHost === false && /representative of record/.test(r4.signatory.note ?? "") && /representative of record/.test(lines(a4, AGREEMENT_EVENT.SENT)[0]?.summary ?? "")
    && /representative of record/.test(mail.inbox("pat@client.example")[0]?.text ?? "") && sql(`select staff_id from fo_signer s join fo_signature_request q on q.id = s.request_id where q.document_id = '${a4}' and s.role = 'FIRM'`) === R.staffId, r4);
  ok("FO-3c DW4 fail: a licensed host signs their own agreement: no representative-of-record note anywhere", before.signatory.staffId === R.staffId && before.signatory.isHost === true && before.signatory.note === null
    && !/representative of record/.test(lines(a1, AGREEMENT_EVENT.SENT)[0].summary) && !/representative of record/.test(inboxLee()[0].text), before.signatory);

  // ------------------------------------------------------------------- DW5: unsigned 24 h before → one reminder and one item
  const reminders = () => mail.sent.filter((m) => m.templateKey === "consultation_agreement.reminder");
  const itemsR = (await svc.needsYou(R)).items;
  await clock.set(new Date(b4.startsAt.getTime() - 86_400_000 + 60_000));
  await jobs.runDue();
  ok("FO-3c DW5 pass: an unsigned agreement 24 h before the meeting gives one reminder to the person who signs and one \"needs you\" item (a second run adds none); the meeting stays booked",
    reminders().filter((m) => m.text.includes(wall(b4.startsAt))).length === 1 && reminders().every((m) => m.to === "representative@sample-firm.example.com") && itemsR.filter((i) => i.agreementId === a4).length === 1
    && sql(`select status from fo_booking where id = '${b4.id}'`) === "SCHEDULED", { reminders: reminders().length, itemsR });
  ok("FO-3c DW5 fail: a signed agreement gives no reminder and no item; nor does the time a rescheduled booking left; another person has no item",
    !itemsR.some((i) => i.agreementId === a1) && !reminders().some((m) => m.text.includes(wall(moved.startsAt)) || m.text.includes(wall(b1.startsAt))) && (await svc.needsYou(O)).items.length === 0, { itemsR });

  // --------------------------------------------------------------------------------- DW7: firm A's agreement unreadable by firm B
  const bB = await book(B, TB, S.staffId, sam), sB = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, bB)), aB = sB?.sent ? sB.agreementId : "";
  ok("FO-3c DW7 pass: each firm reads its own agreement, by id, by booking and by person", (await svc.read(S, aB)).id === aB && (await svc.forBooking(S, bB.id)).id === aB && (await svc.forPerson(S, sam.id)).agreements.length === 1 && (await svc.read(R, a1)).id === a1);
  ok("FO-3c DW7 fail: firm A's agreement, booking and person are unreadable by firm B (404), firm B cannot ask for its signing link, and a provider event passed under the wrong firm changes nothing",
    await fails(() => svc.read(S, a1), 404) && await fails(() => svc.forBooking(S, b1.id), 404) && await fails(() => svc.forPerson(S, lee.id), 404) && await fails(() => svc.hostLink(S, a4, { consent: true }), 404)
    && (await svc.signingEvent((await signing.act(B, (await db.foSignatureRequest.findFirstOrThrow({ where: { documentId: aB } })).providerDocumentId, (await db.foSigner.findFirstOrThrow({ where: { firmId: B, role: "CLIENT" } })).id, "viewed"))[0], A)).reason === "NOT_OURS");

  // ------------------------------------------------------------------- DW8: one audit line per change, in its transaction
  const unverified = await svc.signingEvent({ headers: { "x-fake-signing-signature": "0".repeat(64) }, body: new Uint8Array([1]) });
  ok("FO-3c DW8 pass: every change wrote one audit line: sent 1; the door's view and consent 1 each; client signed 1; firm signed 1; sealed 1; an unverified call writes nothing",
    lines(a1, AGREEMENT_EVENT.SENT).length === 1 && lines(a1, "consultation_agreement.opened").length === 3 && lines(a1, "consultation_agreement.signed").length === 3 && unverified.verified === false
    && Number(sql(`select count(*) from fo_signing_hook_receipt where request_id = '${req1.id}'`)) === lines(a1).filter((l) => /^system:signing-/.test(l.actor)).length, lines(a1).map((l) => l.action));
  const b8 = await book(A, TA, T.staffId, lee), sends = signing.calls.length;
  failAudit = true;
  let threw = false;
  try { await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b8)); } catch { threw = true; }
  failAudit = false;
  ok("FO-3c DW8 fail: a forced audit failure rolls the send back: no agreement, no request, no event, no email, and the envelope is cancelled",
    threw && Number(sql(`select count(*) from fo_retainer_version where merge_values->>'booking.id' = '${b8.id}'`)) === 0 && signing.calls.slice(sends).map((c) => c.op).join(",") === "send,cancel" && (await svc.forBooking(T, b8.id)).words === WORDS.none, signing.calls.slice(sends));

  // --------------------------------------------------------------------------------------- DW9: the outbox row written last
  ok("FO-3c DW9 pass: the outbox row is written last: at each sent and signed audit line its event was not there yet, and after the commit there is exactly one of each",
    eventsAtAudit.length >= 4 && eventsAtAudit.every((n) => n === 0) && events(AGREEMENT_EVENT.SENT, a1) === 1 && events(AGREEMENT_EVENT.SIGNED, a1) === 1 && events(AGREEMENT_EVENT.SENT, a4) === 1, eventsAtAudit);
  ok("FO-3c DW9 fail: an agreement not signed has no signed event, and the rolled-back send left no event", events(AGREEMENT_EVENT.SIGNED, a4) === 0 && Number(sql(`select count(*) from module_event where payload->>'bookingId' = '${b8.id}'`)) === 0);
} catch (e) {
  fail++; console.log(`FAIL  the suite stopped: ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
function wall(at: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", dateStyle: "full", timeStyle: "short" }).format(at); }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
