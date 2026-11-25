// FO-3c (BACKLOG row FO-3c; capability R1.104; P-564, P-627 (7); Code SOR/2022-128 s. 23, trace t8; Unconfirmed: no
// counsel): the consultation agreement before the first consultation, on SigningPort's fake. Cases DW1..DW9 of the row,
// each with a passing and a failing case, at the service: a scratch database (every migration), PF-3's Sample firms and
// staff (user-R and user-T licensed, user-O a case officer with no licence record; firm B's user-S), the real FilesPort
// (a scratch folder) and docx render, the fake clock, jobs, mail and audit. No server, no browser, no model call (US$0).
// Dropped at the end.
//   QA-777 (Lead 28, 24 Nov; Lead 24's ruling on #3433): the right code binds the link to the browser that typed it (a
//   session cookie on the door's path, only its sha256 on the signer: FO-6 part 4b's columns); consent only after the code.
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
  // Part 1's reads are the firm walls only; part 2's booking visibility (FO-3vr) is check_fo3c2_consultation_agreement.ts.
  const svc = new ConsultationAgreementService(db, { audit: audit as never, clock, mail, jobs, signing, files, publicBaseUrl: "https://book.example", seeBooking: async () => undefined });
  await svc.registerJobs();
  // The public door counts tries per IP: each call here comes from its own address unless a case says otherwise.
  let ipN = 0;
  // `cookies`: the session cookies this browser sends (QA-777); none by default, as a fresh browser.
  const op = (t: unknown, b: Parameters<typeof svc.open>[1] = {}, ip = `10.0.${Math.floor(++ipN / 250)}.${ipN % 250}`, cookies: string[] = []) => (svc.open as (t: unknown, b: unknown, ip: string, c: string[]) => ReturnType<typeof svc.open>)(t, b, ip, cookies);
  const cookieOf = (a: unknown) => (a as { session?: string }).session;
  /** Consent, then the one-time code from the client's email (P-564): answers the signing link. */
  const withCode = async (t: string, email: string) => {
    const first = await op(t, { consent: true });
    const m = mail.inbox(email).filter((x) => x.templateKey === "consultation_agreement.code").at(-1);
    const code = /\b(\d{6})\b/.exec(m?.text ?? "")?.[1];
    return { first, done: await op(t, { consent: true, code }) };
  };
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
  const seen = await op(token1);
  const [noConsent] = await signing.act(A, req1.providerDocumentId, cl1.id, "viewed");
  await svc.signingEvent(noConsent);
  const { first: codeAsked, done: consented } = await withCode(token1, "lee@client.example");
  const [clientSigned] = await signing.act(A, req1.providerDocumentId, cl1.id, "signed");
  const c1 = await svc.signingEvent(clientSigned);
  const hostNow = await svc.hostLink(R, a1, { consent: true });
  ok("FO-3c DW2 pass: once the client has consented and signed (CLIENT_SIGNED), the host gets their signing link; a wrong link is the one not-found",
    seen.consented === false && seen.link === null && codeAsked.codeNeeded === true && codeAsked.link === null && /^https:\/\/signing\.fake\.invalid\//.test(consented.link?.url ?? "") && c1.applied && sql(`select status from fo_retainer where id = '${a1}'`) === "CLIENT_SIGNED"
    && /^https:\/\/signing\.fake\.invalid\//.test(hostNow.link.url) && await fails(() => op(`${token1.slice(0, -1)}${token1.endsWith("A") ? "B" : "A"}`), 404) && await fails(() => op("nonsense"), 404), { seen, c1 });

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
  await jobs.runDue();   // a second run adds none
  ok("FO-3c DW5 pass: an unsigned agreement 24 h before the meeting gives one reminder to the person who signs and one \"needs you\" item (a second run adds none); the meeting stays booked",
    reminders().filter((m) => m.text.includes(wall(b4.startsAt))).length === 1 && reminders().every((m) => m.to === "representative@sample-firm.example.com") && itemsR.filter((i) => i.agreementId === a4).length === 1
    && sql(`select status from fo_booking where id = '${b4.id}'`) === "SCHEDULED", { reminders: reminders().length, itemsR });
  ok("FO-3c DW5 fail: a signed agreement gives no reminder and no item; nor does the time a rescheduled booking left; another person has no item",
    !itemsR.some((i) => i.agreementId === a1) && !reminders().some((m) => m.text.includes(wall(moved.startsAt)) || m.text.includes(wall(b1.startsAt))) && (await svc.needsYou(O)).items.length === 0, { itemsR });

  // ------------------------------------------------------------- the breaker's cases on be10e6d24 (each a pass and a fail)
  const sendOne = async (staffId: string, who: { id: string }, days = 9) => {
    const b = await book(A, TA, staffId, who, days), r = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b));
    const id = r?.sent ? r.agreementId : "", q = await db.foSignatureRequest.findFirstOrThrow({ where: { documentId: id }, include: { signers: true } });
    const tok = /#([0-9a-f]{32}\.[\w-]{43})/.exec(mail.inbox(`${(await db.foPerson.findFirstOrThrow({ where: { id: who.id } })).email}`).filter((m) => m.templateKey === "consultation_agreement.sent").at(-1)!.text)![1];
    return { b, id, q, cl: q.signers.find((x) => x.role === "CLIENT")!, fm: q.signers.find((x) => x.role === "FIRM")!, tok };
  };
  const kim = await person(A, "Kim", "kim@client.example");
  // M1: the firm's signer declines after the client signed.
  const m1 = await sendOne(T.staffId, kim);
  await withCode(m1.tok, "kim@client.example");
  for (const h of await signing.act(A, m1.q.providerDocumentId, m1.cl.id, "signed")) await svc.signingEvent(h);
  const [declined] = await signing.act(A, m1.q.providerDocumentId, m1.fm.id, "declined");
  const d1 = await svc.signingEvent(declined), d2 = await svc.signingEvent(declined);
  ok("FO-3c M1 pass: the firm's signer declining after the client signed ends the request DECLINED and the agreement WITHDRAWN with that reason (no 500); its retry is a repeat; no item, no host link",
    d1.applied && d2.reason === "REPEAT" && sql(`select status from fo_signature_request where id = '${m1.q.id}'`) === "DECLINED" && sql(`select status || '|' || withdrawn_reason from fo_retainer where id = '${m1.id}'`) === "WITHDRAWN|The firm's signer declined to sign after the client signed."
    && !(await svc.needsYou(T)).items.some((i) => i.agreementId === m1.id) && await fails(() => svc.hostLink(T, m1.id, { consent: true }), 409, /NOT_OPEN/), { d1, d2 });
  // A client's decline before signing stays DECLINED (the fail side: no WITHDRAWN there).
  const m1b = await sendOne(T.staffId, kim, 10);
  const [cdecl] = await signing.act(A, m1b.q.providerDocumentId, m1b.cl.id, "declined");
  ok("FO-3c M1 fail: a client's decline before signing is DECLINED, never WITHDRAWN; the client's link is then the one not-found",
    (await svc.signingEvent(cdecl)).applied && sql(`select status || '|' || coalesce(withdrawn_reason, '-') from fo_retainer where id = '${m1b.id}'`) === "DECLINED|-" && await fails(() => op(m1b.tok), 404));
  // M2: the provider ended the client's part before its event reached us (the client signed and reloads).
  const m2 = await sendOne(T.staffId, kim, 11);
  const m2s = cookieOf((await withCode(m2.tok, "kim@client.example")).done), m2c = m2s ? [m2s] : [];   // the client's browser (QA-777)
  const early2 = await signing.act(A, m2.q.providerDocumentId, m2.cl.id, "signed");   // not handed to us yet
  ok("FO-3c M2 pass: the client reloading after signing at the provider (the same browser) gets 409 SIGNING_ENDED (never a 500), with the words that the copy follows",
    await fails(() => op(m2.tok, { consent: true }, undefined, m2c), 409, /SIGNING_ENDED/) && await fails(() => op(m2.tok, {}, undefined, m2c), 409, /signed copy/));
  for (const h of early2) await svc.signingEvent(h);
  ok("FO-3c M2 fail: once the client's signature is applied, their link is the one not-found (not a 409, not a 500)", await fails(() => op(m2.tok), 404));
  // m4: a double click on the host's link records the consent once; m3: a seal that failed is retried by the provider's repeat.
  const clicks = await Promise.allSettled([1, 2, 3].map(() => svc.hostLink(T, m2.id, { consent: true })));
  ok("FO-3c m4 pass: three parallel host links all answer, one consent line", clicks.every((c) => c.status === "fulfilled") && lines(m2.id, "consultation_agreement.opened").filter((l) => /firm/.test(l.summary)).length === 1, clicks.map((c) => c.status));
  const fetchFiles = signing.fetchFiles;
  signing.fetchFiles = async () => { throw new Error("provider down"); };
  const [firmSig] = await signing.act(A, m2.q.providerDocumentId, m2.fm.id, "signed");
  let sealFailed = false;
  try { await svc.signingEvent(firmSig); } catch { sealFailed = true; }
  const unsealed = sql(`select status from fo_signature_request where id = '${m2.q.id}'`);
  signing.fetchFiles = fetchFiles;
  const retried = await svc.signingEvent(firmSig);
  ok("FO-3c m3 fail: the provider down at the seal leaves the request CLIENT_SIGNED (the firm's signature kept) and the call fails, so the provider retries", sealFailed && unsealed === "CLIENT_SIGNED");
  ok("FO-3c m3 pass: the provider's retry (a repeat) seals it: SIGNED, one evidence row", retried.reason === "REPEAT" && sql(`select status from fo_signature_request where id = '${m2.q.id}'`) === "SIGNED" && Number(sql(`select count(*) from fo_signing_evidence where request_id = '${m2.q.id}'`)) === 1);
  // m5: a cancelled booking's agreement: no item, the link is the one not-found.
  const m5 = await sendOne(T.staffId, kim, 12);
  const had5 = (await svc.needsYou(T)).items.some((i) => i.agreementId === m5.id);
  await db.foBooking.update({ where: { id: m5.b.id }, data: { status: "CANCELLED" } });
  ok("FO-3c m5 pass/fail: an agreement shows as an item while its meeting is ahead; once the booking is cancelled the item goes and the client's link is the one not-found (the booking is never touched by us)",
    had5 && !(await svc.needsYou(T)).items.some((i) => i.agreementId === m5.id) && await fails(() => op(m5.tok), 404));
  // m9: a reschedule of a booking with no agreement says so (b0 had none until the catch-up; a fresh one in firm B with no template is used).
  const bNo = await book(A, TA, T.staffId, await person(A, "Noe", null), 13), r9 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_RESCHEDULED, bNo));
  ok("FO-3c m9 pass/fail: a reschedule of a booking with no agreement answers NO_AGREEMENT, not ALREADY_SENT", r9?.sent === false && r9.reason === "NO_AGREEMENT", r9);

  // ------------------------------------------------------------- the reviewer's cases on be10e6d24 (M2, M3, m6)
  // M3: P-564's code before the signing link; the sixth wrong code locks; an unchecked code never signs; a per-IP limit.
  const r3 = await sendOne(T.staffId, kim, 14);
  const ask = await op(r3.tok, { consent: true });
  const wrongs: number[] = [];
  for (let i = 0; i < 6; i++) { try { await op(r3.tok, { consent: true, code: String(111111 + i) }); wrongs.push(200); } catch (e) { wrongs.push((e as { getStatus(): number }).getStatus()); } }
  const lockedRight = await fails(async () => { const code = /\b(\d{6})\b/.exec(mail.inbox("kim@client.example").filter((x) => x.templateKey === "consultation_agreement.code").at(-1)!.text)![1]; return op(r3.tok, { consent: true, code }); }, 423, /CODE_LOCKED/);
  ok("FO-3c M3 fail: consent alone gives no signing link (a code is emailed); five wrong codes answer 422, the sixth locks (423), and even the right code is refused while locked",
    ask.codeNeeded === true && ask.link === null && wrongs.slice(0, 5).every((x) => x === 422) && wrongs[5] === 423 && lockedRight && sql(`select code_failures || '|' || (locked_until is not null) from fo_signer where id = '${r3.cl.id}'`) === "6|true", { ask, wrongs });
  await clock.advance({ minutes: 16 });
  const fresh = await op(r3.tok, { consent: true, resend: true }), code3 = /\b(\d{6})\b/.exec(mail.inbox("kim@client.example").filter((x) => x.templateKey === "consultation_agreement.code").at(-1)!.text)![1];
  const good = await op(r3.tok, { consent: true, code: code3 });
  ok("FO-3c M3 pass: after the lock a new code is sent, the right code gives the signing link once checked, and only its sha256 is stored",
    fresh.codeNeeded && /^https:\/\/signing\.fake\.invalid\//.test(good.link?.url ?? "") && sql(`select code_verified_at is not null and code_sha256 ~ '^[0-9a-f]{64}$' from fo_signer where id = '${r3.cl.id}'`) === "t"
    && Number(sql(`select count(*) from fo_signer where code_sha256 = '${code3}'`)) === 0, good);
  // R2-1: a checked code opens the link for 30 minutes only; then a new code is asked, from any address. R2-2: one new code a minute.
  const within = await op(r3.tok, {}, "198.51.100.7", cookieOf(good) ? [cookieOf(good)!] : []);   // the same browser (QA-777)
  await clock.advance({ minutes: 31 });
  const later = await op(r3.tok, {}, "198.51.100.8", cookieOf(good) ? [cookieOf(good)!] : []);   // the same browser, its cookie now 31 minutes old (QA-777 review M1)
  ok("FO-3c R2-1 pass: within 30 minutes of the right code the same browser (its session cookie) opens the link again without a code", /^https:\/\/signing\.fake\.invalid\//.test(within.link?.url ?? ""), within);
  ok("FO-3c R2-1 fail: 31 minutes later the same browser (its session cookie, expired) gets no signing link: a new code is emailed and the old one is spent",
    later.codeNeeded === true && later.link === null && await fails(() => op(r3.tok, { consent: true, code: code3 }), 422), later);
  const tooSoon = await fails(() => op(r3.tok, { consent: true, resend: true }), 429, /CODE_TOO_SOON/);
  await clock.advance({ minutes: 1, seconds: 1 });
  const resent = await op(r3.tok, { consent: true, resend: true });
  ok("FO-3c R2-2 fail/pass: a second code within a minute is refused (429); after a minute a new one is sent", tooSoon && resent.codeNeeded === true);
  // R3-1: a client who signed at the provider, whose event is late, clicks the email again after the session: the new code
  // must not undo the check their signature rests on. r3-1: the new code is accepted after the session.
  const r31 = await sendOne(T.staffId, kim, 18);
  await withCode(r31.tok, "kim@client.example");
  const late = await signing.act(A, r31.q.providerDocumentId, r31.cl.id, "signed");   // not delivered yet
  await clock.advance({ minutes: 31 });
  await fails(() => op(r31.tok, {}), 409);   // the provider ended the client's part: 409, and no code is touched
  const r31b = await sendOne(T.staffId, kim, 19);
  await withCode(r31b.tok, "kim@client.example");
  await clock.advance({ minutes: 31 });
  const again31 = await op(r31b.tok, {});   // a stale session on an unsigned agreement: a new code
  const late31 = await svc.signingEvent(late[0]);
  ok("FO-3c R3-1 pass: the late \"signed\" of a client who checked a code is applied (CLIENT_SIGNED) after a later visit", late31.applied && sql(`select status from fo_retainer where id = '${r31.id}'`) === "CLIENT_SIGNED", late31);
  const [lateB] = await signing.act(A, r31b.q.providerDocumentId, r31b.cl.id, "signed");
  const lateB31 = await svc.signingEvent(lateB);
  const newCode = /\b(\d{6})\b/.exec(mail.inbox("kim@client.example").filter((x) => x.templateKey === "consultation_agreement.code").at(-1)!.text)![1];
  ok("FO-3c R3-1 fail: a new code after a stale session does not clear the earlier check: the provider's later \"signed\" is applied, not refused NO_CODE",
    again31.codeNeeded === true && lateB31.applied && lateB31.reason !== "NO_CODE", { again31, lateB31 });
  const r31c = await sendOne(T.staffId, kim, 20);
  await withCode(r31c.tok, "kim@client.example");
  await clock.advance({ minutes: 31 });
  await op(r31c.tok, {});
  const code31 = /\b(\d{6})\b/.exec(mail.inbox("kim@client.example").filter((x) => x.templateKey === "consultation_agreement.code").at(-1)!.text)![1];
  const ok31 = await op(r31c.tok, { consent: true, code: code31 });
  ok("FO-3c r3-1 pass/fail: after a stale session the new code is accepted (the link opens), and the code used before it is refused", /^https:\/\/signing\.fake\.invalid\//.test(ok31.link?.url ?? "") && newCode !== code31, ok31);
  const r3b = await sendOne(T.staffId, kim, 15);
  const r3bAsk = await op(r3b.tok, { consent: true });   // QA-777: no code, so no consent is recorded (only a code is emailed)
  const [noCode] = await signing.act(A, r3b.q.providerDocumentId, r3b.cl.id, "signed");
  const ncNoConsent = await svc.signingEvent(noCode);
  // The rule behind it still holds on its own: a consent written straight to the table, with no code checked, is refused NO_CODE.
  const r3c2 = await sendOne(T.staffId, kim, 16);
  sql(`update fo_signer set consented_at = now(), consent_text_version = 'sign-electronically-v1' where id = '${r3c2.cl.id}'`);
  const [noCode2] = await signing.act(A, r3c2.q.providerDocumentId, r3c2.cl.id, "signed");
  const nc = await svc.signingEvent(noCode2);
  ok("FO-3c M3 fail: a provider \"signed\" for a client whose code was never checked is stored and not applied: refused NO_CONSENT when the door recorded nothing (QA-777), NO_CODE when a consent exists without a code",
    r3bAsk.consented === false && ncNoConsent.reason === "NO_CONSENT" && nc.reason === "NO_CODE" && sql(`select (signed_at is null)::text from fo_signer where id in ('${r3b.cl.id}', '${r3c2.cl.id}') group by 1`) === "true", { r3bAsk: r3bAsk.consented, ncNoConsent, nc });
  const r3c = await sendOne(T.staffId, kim, 17);
  const [noConsent3] = await signing.act(A, r3c.q.providerDocumentId, r3c.cl.id, "signed");
  const ncs = await svc.signingEvent(noConsent3);
  ok("FO-3c m6 fail: a provider \"signed\" for a client who never consented here is stored and not applied (NO_CONSENT)", ncs.reason === "NO_CONSENT" && sql(`select signed_at is null from fo_signer where id = '${r3c.cl.id}'`) === "t", ncs);
  const flood: number[] = [];
  for (let i = 0; i < 31; i++) { try { await op("nonsense", {}, "203.0.113.9"); } catch (e) { flood.push((e as { getStatus(): number }).getStatus()); } }
  ok("FO-3c M3 pass/fail: the public door answers the one 404 for 30 tries from one address, then 429; another address is still answered", flood.slice(0, 30).every((x) => x === 404) && flood[30] === 429 && await fails(() => op("nonsense", {}, "203.0.113.10"), 404), flood.slice(28));
  // M2: a fully signed request with no evidence is sealed by the catch-up; its copy is sent once.
  const r2 = await sendOne(T.staffId, kim, 16);
  await withCode(r2.tok, "kim@client.example");
  for (const h of await signing.act(A, r2.q.providerDocumentId, r2.cl.id, "signed")) await svc.signingEvent(h);
  await svc.hostLink(T, r2.id, { consent: true });
  const realFetch = signing.fetchFiles;
  signing.fetchFiles = async () => { throw new Error("not ready"); };
  for (const h of await signing.act(A, r2.q.providerDocumentId, r2.fm.id, "signed")) { try { await svc.signingEvent(h); } catch { /* the provider retries */ } }
  const stuck = sql(`select status from fo_signature_request where id = '${r2.q.id}'`);
  signing.fetchFiles = realFetch;
  const cu = await svc.catchUp((_f, fn) => fn());
  await jobs.runDue();
  await svc.catchUp((_f, fn) => fn());
  await jobs.runDue();
  const copies2 = mail.inbox("kim@client.example").filter((m) => m.templateKey === "consultation_agreement.signed_copy" && m.subject.includes("signed"));
  ok("FO-3c M2 fail: the provider not ready at the seal leaves it CLIENT_SIGNED with no evidence", stuck === "CLIENT_SIGNED");
  ok("FO-3c M2 pass: the catch-up seals it (SIGNED, one evidence row) and the copy is emailed once though the catch-up ran twice",
    cu.sealed === 1 && sql(`select status from fo_signature_request where id = '${r2.q.id}'`) === "SIGNED" && Number(sql(`select count(*) from fo_signing_evidence where request_id = '${r2.q.id}'`)) === 1
    && copies2.filter((m) => m.idempotencyKey === `consultation-agreement:${r2.id}:signed-copy`).length === 1, { cu, copies: copies2.length });

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
  // PF-19r S1/S2 for this feature (Lead 4 on #2922): its mail is the app's MESSAGES_MAIL (MailPort over MessagePort).
  process.env.PLATFORM_ENVIRONMENT ??= "local";   // features/platform-messages.ts reads the loader at import (as check_pf19r does)
  const feature = (await import("../api/src/features/front-office-consultation-agreement.ts")).default as { providers: { provide?: unknown; useFactory?: (...a: unknown[]) => unknown; inject?: unknown[] }[] };
  const { CONSULTATION_AGREEMENT_PORTS } = await import("../api/src/front-office/booking/consultation-agreement/controller.ts");
  const { MESSAGES_MAIL } = await import("../api/src/features/platform-messages.ts");
  const prov = feature.providers.find((x) => x.provide === CONSULTATION_AGREEMENT_PORTS), given = { send: async () => ({ messageId: "x" }) };
  const made = prov?.useFactory?.(given, files) as { mail?: unknown } | undefined;
  ok("FO-3c PF-19r pass: the feature's ports take MESSAGES_MAIL and carry that same mail (every agreement email goes through MessagePort)", prov?.inject?.[0] === MESSAGES_MAIL && made?.mail === given, { inject: prov?.inject?.map(String) });
  ok("FO-3c PF-19r fail: a factory given another mail carries that one, not MESSAGES_MAIL's (the check tells them apart)", (prov?.useFactory?.(mail, files) as { mail?: unknown }).mail !== given);

  // ---------------------------------------------------- QA-777: the code binds the link to one browser; consent after it
  const q7 = await sendOne(T.staffId, kim, 22), lastCode = () => /\b(\d{6})\b/.exec(mail.inbox("kim@client.example").filter((x) => x.templateKey === "consultation_agreement.code").at(-1)?.text ?? "")?.[1];
  await clock.advance({ minutes: 2 });   // clear of the earlier cases' resend gap
  const qb0 = await op(q7.tok, { consent: true }, "203.0.113.2");   // browser B first, holding only the forwarded link
  const consentedB0 = sql(`select (consented_at is not null)::text from fo_signer where id = '${q7.cl.id}'`);
  const a1q = await op(q7.tok, { consent: true }, "203.0.113.1"), a2q = await op(q7.tok, { consent: true, code: lastCode() }, "203.0.113.1");
  const cookieA = cookieOf(a2q);
  const qb1 = await op(q7.tok, { consent: true }, "203.0.113.2"), qb2 = await op(q7.tok, {}, "203.0.113.2", ["x".repeat(43)]);
  const a3q = await op(q7.tok, {}, "203.0.113.1", cookieA ? [cookieA] : []);
  const stored = sql(`select coalesce(session_sha256, '') from fo_signer where id = '${q7.cl.id}'`);
  ok("FO-3c QA-777 (2): a forwarded link alone, before any code, records no consent (consent comes after the code); it is told a code is needed",
    qb0.codeNeeded === true && qb0.link === null && qb0.consented === false && consentedB0 === "false", { qb0, consentedB0 });
  ok("FO-3c QA-777 control: the client (browser A) types the emailed code and gets the signing link and a session cookie (only its sha256 stored); consent is recorded then",
    a1q.codeNeeded === true && /^https:\/\/signing\.fake\.invalid\//.test(a2q.link?.url ?? "") && !!cookieA && /^[0-9a-f]{64}$/.test(stored) && stored !== cookieA && a2q.consented === true, { a1q, a2q: { ...a2q, session: !!cookieA }, stored: !!stored });
  ok("FO-3c QA-777 (1): browser B, with the forwarded link but not A's session (no cookie, or a made-up one), is asked for the code (200, no 429) and gets no signing link",
    qb1.codeNeeded === true && qb1.link === null && qb2.codeNeeded === true && qb2.link === null, { qb1, qb2 });
  ok("FO-3c QA-777 same browser: A, sending its session cookie, gets the link again without a code", /^https:\/\/signing\.fake\.invalid\//.test(a3q.link?.url ?? "") && a3q.codeNeeded === false, a3q);
  // QA-777 review m6: a session counts only when the code check started it (expiry = check + 30 minutes): the same live
  // cookie on a session moved off that moment (written straight to the table) gets no link.
  sql(`update fo_signer set session_expires_at = session_expires_at + interval '1 minute' where id = '${q7.cl.id}'`);
  const unpaired = await op(q7.tok, {}, undefined, cookieA ? [cookieA] : []);
  sql(`update fo_signer set session_expires_at = session_expires_at - interval '1 minute' where id = '${q7.cl.id}'`);
  const paired = await op(q7.tok, {}, undefined, cookieA ? [cookieA] : []);
  ok("FO-3c QA-777 pairing: the same live cookie on a session not started at the code check's moment gets no link (a code is asked); paired again, it opens",
    unpaired.codeNeeded === true && unpaired.link === null && /^https:\/\/signing\.fake\.invalid\//.test(paired.link?.url ?? ""), { unpaired, paired: !!paired.link });
  // QA-777 break B2 (Lead B's Minor on 55ff7dc8f): the provider failing right after the right code still hands this
  // browser its session (the error carries it for the cookie), so the same browser's retry opens without a new code.
  const q9 = await sendOne(T.staffId, kim, 24);
  await clock.advance({ minutes: 2 });
  await op(q9.tok, { consent: true });
  const realLink = signing.embeddedLink, code9 = lastCode();
  signing.embeddedLink = async () => { throw new Error("provider down (Sample)"); };
  let carried: string | undefined, threw9 = false;
  try { await op(q9.tok, { consent: true, code: code9 }); } catch (e) { threw9 = true; carried = (e as { session?: string }).session; }
  signing.embeddedLink = realLink;
  const retry9 = await op(q9.tok, {}, undefined, carried ? [carried] : []);
  ok("FO-3c QA-777 B2: the provider failing after the right code still gives this browser its session (carried for the cookie); the same browser's retry opens the link with no new code",
    threw9 && !!carried && /^https:\/\/signing\.fake\.invalid\//.test(retry9.link?.url ?? "") && retry9.codeNeeded === false, { threw9, carried: !!carried, retry9 });
  // QA-777 break B1: with no live code (none asked yet), a link holder's made-up codes are refused and never counted, so
  // they cannot lock the client out; the client's own code then works.
  const q8 = await sendOne(T.staffId, kim, 23), guesses: string[] = [];
  for (let i = 0; i < 7; i++) { try { await op(q8.tok, { code: String(100000 + i) }); guesses.push("200"); } catch (e) { const r = e as { getStatus(): number; getResponse(): { code?: string } }; guesses.push(`${r.getStatus()}:${r.getResponse().code}`); } }
  const counted8 = sql(`select code_failures || '|' || (locked_until is not null) from fo_signer where id = '${q8.cl.id}'`);
  await clock.advance({ minutes: 2 });
  const ask8 = await op(q8.tok, { consent: true }), ok8 = await op(q8.tok, { consent: true, code: lastCode() });
  ok("FO-3c QA-777 B1: with no code asked, seven made-up codes are each refused (422 CODE_EXPIRED), none counted, no lock; the client then asks for a code and signs (the link)",
    guesses.every((g) => g === "422:CODE_EXPIRED") && counted8 === "0|false" && ask8.codeNeeded === true && /^https:\/\/signing\.fake\.invalid\//.test(ok8.link?.url ?? ""), { guesses, counted8, ok8: !!ok8.link });
  // QA-777 m8 (review round 2 on #3498): B2's controller half. Through the public controller itself, the provider failing
  // right after the right code still sends this browser's Set-Cookie (same attributes as a success) and re-throws the
  // same error with no token in its body; the retry with that cookie opens with no new code.
  const { ConsultationAgreementPublicController } = await import("../api/src/front-office/booking/consultation-agreement/controller.ts");
  const door = new ConsultationAgreementPublicController(svc as unknown as ConstructorParameters<typeof ConsultationAgreementPublicController>[0]);
  const resOf = () => { const h: Record<string, string> = {}; return { h, res: { setHeader: (n: string, v: string) => { h[n.toLowerCase()] = v; } } }; };
  const reqOf = (cookie?: string) => ({ ip: `10.9.0.${++ipN % 250}`, headers: cookie ? { cookie } : {} });
  const q10 = await sendOne(T.staffId, kim, 25);
  await clock.advance({ minutes: 2 });
  await door.open({ token: q10.tok, consent: true }, reqOf(), resOf().res);
  const code10 = lastCode(), down = resOf(), realLink10 = signing.embeddedLink;
  signing.embeddedLink = async () => { throw new Error("provider down (Sample)"); };
  let err10: unknown;
  try { await door.open({ token: q10.tok, consent: true, code: code10 }, reqOf(), down.res); } catch (e) { err10 = e; }
  signing.embeddedLink = realLink10;
  const set10 = down.h["set-cookie"] ?? "", tok10 = /^xr_sign=([^;]+);/.exec(set10)?.[1];
  const attrs10 = ["Path=/api/public/consultation-agreements/open", "Max-Age=1800", "HttpOnly", "SameSite=Strict"].every((a) => set10.split("; ").includes(a));
  const leaked10 = !!tok10 && (JSON.stringify(err10) ?? "").includes(tok10);
  const retry10 = await door.open({ token: q10.tok }, reqOf(tok10 ? `xr_sign=${tok10}` : undefined), resOf().res) as { codeNeeded?: boolean; link?: { url?: string } | null };
  ok("FO-3c QA-777 m8: through the public controller, a provider failure after the right code re-throws the provider's error, still sets this browser's xr_sign cookie (door path, 30 minutes, HttpOnly, SameSite=Strict) with no token in the error, and the retry with that cookie opens the link with no new code",
    (err10 as Error)?.message === "provider down (Sample)" && !!tok10 && attrs10 && !leaked10 && down.h["cache-control"] === "no-store" && retry10.codeNeeded === false && /^https:\/\/signing\.fake\.invalid\//.test(retry10.link?.url ?? ""),
    { err: String(err10), set10: set10.replace(/=[^;]+;/, "=…;"), attrs10, leaked10, retry10 });
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
