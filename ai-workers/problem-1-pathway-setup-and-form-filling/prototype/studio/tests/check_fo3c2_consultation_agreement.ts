// FO-3c part 2 (R1.104; Lead 10's rulings of 23 Nov: W4b requireAgreement, W5 signatory, FO-3vr; J-104 W2-W9; QA-750,
// QA-751; AG-4-15 rule 4 "warn, never block", the founder's ruling of 24 Nov relayed on #3471, replacing W4/W9's block and
// Lead 22's ruling on QA-772; Code SOR/2022-128 s. 23, Unconfirmed: no counsel). Each case with a passing and a failing side,
// at the services: a scratch database (every migration, this part's included), PF-3's Sample firms and staff (user-R
// licensed hosts the bookings; firm B's user-S), the real booking, consult-record and booking-type services, FilesPort in
// a scratch folder, the fake clock, jobs, mail, audit and signer. No server, no browser, no model call (US$0). Dropped at
// the end.
//   P1  the type's switch (W4b): a follow-up sends none, a stored false sends none, a stored true sends; the settings save it
//   P2  warn, never block: Attended and the consult record saved while unsigned, each answer carrying the warning; No-show
//       saved too
//   P3  after signing (W9): no warning; a type that needs none never warns
//   P4  the poller (W2, W5): a booking event in the outbox sends the agreement as its firm, once; a reschedule moves the
//       reminder; each firm read writes its platform.bypass line; a follow-up's event sends none
//   P5  the reads follow the booking's visibility (FO-3vr): another person's booking is the one not-found
//   P6  the signed copy's key: refused before signing, given after, and checked again for whoever asks
//   B2, B6  an agreement that ended unsigned (declined, withdrawn) still warns; a fresh one is sent while the meeting is
//       ahead (by the send, the catch-up or a reschedule), once; its signature ends the warning (Lead 1's ruling on #3184)
//   B5  the poller's backoff: held back, retried after 30 s, doubled; capped by the time left before the meeting (P2R2-2)
//   B7  the panel's next step on a No-show booking (review r2-2)   B8  NO_TEMPLATE backs off (P2R2-3)
//   B9  the reminder reads the type's switch (review r2-1)   B10  any signed agreement ends the warning (P2R3-1)
//   B11 one fresh agreement under concurrent sends; a draft counts as ended (review M2)   B12 the cap at each check (m3-2)
//   N1-N4 (QA-772): a type that needs it and has none yet warns, naming the cause (no client email, no active template,
//       nobody licensed to sign, a send still being made); removing the cause lets the catch-up send, and the warning then
//       names the agreement. N5: a No-show booking with none; a type needing none
//   W1-W4 (the founder's ruling, 24 Nov): Attended and the consult record with none sent are saved with the warning; a
//       paper copy ends it; a person without the key is still refused; no regulator or statute named in the words
//   tsx studio/tests/check_fo3c2_consultation_agreement.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { fakeAudit } from "../ports/audit.ts";
import { FakeClock } from "../ports/clock.ts";
import { EVENT } from "../ports/events.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3c2_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`, WORK = join(STUDIO, "var", `fo3c2-check-${process.pid}`);
process.env.DATABASE_URL = URL;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 600)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
/** The refusal's status and body (or 200 and the answer). */
const answer = async (f: () => Promise<unknown>): Promise<{ status: number; body: string }> => {
  try { return { status: 200, body: JSON.stringify(await f()) }; } catch (e) {
    const r = e as { getResponse?: () => unknown; getStatus?: () => number };
    return { status: r.getStatus?.() ?? 500, body: JSON.stringify(r.getResponse?.() ?? String(e)) };
  }
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });

const { ConsultationAgreementService, WORDS } = await import("../api/src/front-office/booking/consultation-agreement/service.ts");
const { AgreementPoll } = await import("../api/src/front-office/booking/consultation-agreement/live.ts");
const { CAUSE_WORDS, NEXT_WORDS, WARN_WORDS, WARN_WORDS_INACTIVE, agreementWarning, missingWords, needsAgreement } = await import("../api/src/front-office/booking/consultation-agreement/gate.ts");
const { agreementNextStep, sendsFresh, NEXT_CANCELLED, NEXT_COMPLETED, NEXT_NO_SHOW, NEXT_RESCHEDULE } = await import("../contracts/consultation-agreement-words.ts");
const { BookingService } = await import("../api/src/front-office/booking/service.ts");
const { ConsultRecordService } = await import("../api/src/front-office/booking/consult/service.ts");
const { BookingTypesService } = await import("../api/src/front-office/booking/settings/types.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { buildDocx } = await import("../api/src/front-office/retainers/docx.ts");
const { Retainers } = await import("../api/src/front-office/retainers/service.ts");
const { fakeSigning } = await import("../api/src/front-office/signing/port.ts");
const { dutiesOf } = await import("../api/src/platform/identity/keys.ts");
const { EVERYONE_SEES_ALL, writeSetting } = await import("../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/audit/audit-event.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
type StaffContext = import("../api/src/platform/identity/keys.ts").StaffContext;

try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key='sample-firm'`), B = sql(`select id from platform_firm where key='sample-solo'`);
  const keysOf = (role: string) => sql(`select coalesce(string_agg(permission_key, ','), '') from platform_role_permission where role::text = '${role}'`).split(",").filter(Boolean);
  const sid = (actor: string) => sql(`select id from platform_staff where actor_id='${actor}'`);
  const ctxOf = (staffId: string, firmId: string, keys: string[]): StaffContext => ({ staffId, firmId, firmKey: "sample", roles: [], keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" });
  const officer = keysOf("CASE_OFFICER");
  const R = ctxOf(sid("user-R"), A, keysOf("OWNER")), S = ctxOf(sid("user-S"), B, keysOf("OWNER"));
  // A colleague of firm A with the list key, who neither hosts the bookings nor owns their leads (everyone-sees-all off).
  const own = ctxOf(sid("user-O"), A, officer.filter((k) => k !== "agent/prospect:view.all" && k !== "agent/prospect:assign"));
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws });

  const HOUR = 3_600_000, MIN = 60_000;
  // Today's time: the database answers attendance only after a meeting has really started (fo_booking_write), as j_104 does.
  const clock = new FakeClock(new Date());
  const jobs = fakeJobs(clock), mail = fakeMail({ clock }), signing = fakeSigning({ now: () => clock.now() }), files = new LocalFiles(join(WORK, "files")), audit = fakeAudit();
  const bookings = new BookingService(db, { audit: audit as never, clock, jobs, mail, arrival: fakeArrival(), publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } } as never);
  const consult = new ConsultRecordService(db, { audit: audit as never });
  const types = new BookingTypesService(db, bookings, { audit: audit as never, clock });
  const svc = new ConsultationAgreementService(db, { audit: audit as never, clock, mail, jobs, signing, files, publicBaseUrl: "https://book.example", seeBooking: (c, id) => bookings.staffBooking(c, id) });
  await svc.registerJobs();

  const retainers = new Retainers(db, files, { now: () => clock.now().getTime() });
  const tplBytes = buildDocx(["# Consultation agreement (Sample)", "Client: {client.name} ({client.email})", "Licensee: {representative.name}, {representative.licence_number}", "{#fees}", "{label}: {amount}", "{/fees}"]);
  for (const c of [R, S]) await retainers.uploadTemplate(c, { name: "Consultation (Sample)", kind: "CONSULTATION" }, { bytes: tplBytes, size: tplBytes.length } as never);
  const type = (firmId: string, slug: string, hosts: string[], purpose = "FREE_CONSULT", requireAgreement: boolean | null = null) =>
    db.foConsultationType.create({ data: { firmId, slug, name: `Sample ${slug}`, purpose: purpose as never, modes: ["VIDEO"], hostStaffIds: hosts, minutes: 30, requireAgreement } });
  const person = (firmId: string, given: string) => db.foPerson.create({ data: { firmId, givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}@client.example`, createdBy: "seed:fo3c2" } });
  const taken: [string, number][] = [];
  /** A booking about `inMin` minutes from the clock, moved by half hours (earlier for a past one, later otherwise) off any
   *  time its host already has (the database's no-overlap rule). */
  const book = (firmId: string, t: { id: string }, staffId: string, p: { id: string }, inMin = 60) => {
    let at = clock.now().getTime() + inMin * MIN;
    while (taken.some(([h, x]) => h === staffId && Math.abs(x - at) < 2 * HOUR)) at += (inMin < 0 ? -2 : 2) * HOUR;   // the gaps the firm pads around each booking count too
    taken.push([staffId, at]);
    const startsAt = new Date(at);
    return db.foBooking.create({ data: { firmId, typeId: t.id, staffId, personId: p.id, mode: "VIDEO", startsAt, endsAt: new Date(startsAt.getTime() + 30 * MIN), bookerTimeZone: "America/Toronto" } });
  };
  const eventOf = (type: string, b: { id: string; firmId: string; sequence: number; status: string; typeId: string; staffId: string; personId: string | null; prospectId: string | null; mode: string; startsAt: Date; endsAt: Date; bookerTimeZone: string }) =>
    ({ type, firmId: b.firmId, payload: { key: `${b.id}:${b.sequence}`, bookingId: b.id, sequence: b.sequence, status: b.status, typeId: b.typeId, staffId: b.staffId, personId: b.personId, prospectId: b.prospectId, mode: b.mode, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), bookerTimeZone: b.bookerTimeZone } });
  const agreementsOf = (bookingId: string) => Number(sql(`select count(*) from fo_retainer_version v join fo_retainer r on r.id = v.retainer_id where r.kind = 'CONSULTATION' and v.merge_values->>'booking.id' = '${bookingId}'`));
  const statusOf = (bookingId: string) => sql(`select status from fo_booking where id = '${bookingId}'`);
  /** The whole signing path on the fake: the client's link, consent and code, the client's signature, the host's, the seal. */
  const signAll = async (agreementId: string, email: string, host: StaffContext) => {
    const token = /#([0-9a-f]{32}\.[\w-]{43})/.exec(mail.inbox(email).find((m) => m.idempotencyKey === `consultation-agreement:${agreementId}:sent`)?.text ?? "")?.[1] ?? "";
    await svc.open(token, {}, "10.9.0.1"); await svc.open(token, { consent: true }, "10.9.0.1");
    const code = /\b(\d{6})\b/.exec(mail.inbox(email).filter((m) => m.templateKey === "consultation_agreement.code").at(-1)?.text ?? "")?.[1];
    await svc.open(token, { consent: true, code }, "10.9.0.1");
    const req = await db.foSignatureRequest.findFirstOrThrow({ where: { documentId: agreementId }, include: { signers: true } });
    const client = req.signers.find((s) => s.role === "CLIENT")!, firmSigner = req.signers.find((s) => s.role === "FIRM")!;
    for (const step of ["viewed", "signed"] as const) for (const h of await signing.act(req.firmId, req.providerDocumentId, client.id, step)) await svc.signingEvent(h);
    await svc.hostLink(host, agreementId, { consent: true });
    for (const h of await signing.act(req.firmId, req.providerDocumentId, firmSigner.id, "signed")) await svc.signingEvent(h);
    await svc.seal(req.firmId, req.id);
    return sql(`select status from fo_retainer where id = '${agreementId}'`);
  };
  const RECORD = { timeSpentMinutes: 30, notes: "Sample consult notes (FO-3c part 2)", recommended: ["Study permit (Sample)"] };
  /** The warning the booking carries now (gate.ts `agreementWarning`, as the panel, Attended and the record show it): reads only. */
  const warnAt = async (c: StaffContext | string, bookingId: string) => { const w = await agreementWarning(db, typeof c === "string" ? c : c.firmId, bookingId); return { warned: !!w, body: JSON.stringify(w ?? null) }; };
  /** An answer's `agreementWarning` (null when none). */
  const warningOf = (a: { status: number; body: string }) => { try { return JSON.parse(a.body).agreementWarning ?? null; } catch { return undefined; } };

  const free = await type(A, "p2-free", [R.staffId]), follow = await type(A, "p2-follow", [R.staffId], "FOLLOW_UP");
  const freeOff = await type(A, "p2-free-off", [R.staffId], "FREE_CONSULT", false), followOn = await type(A, "p2-follow-on", [R.staffId], "FOLLOW_UP", true);
  const lee = await person(A, "Lee"), pat = await person(A, "Pat");
  // Lee's lead is the colleague's? No: owned by R, so the own-only colleague does not see Lee's bookings (P5).
  await db.foLead.create({ data: { firmId: A, personId: lee.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: R.staffId, createdBy: "test" } });
  await db.foLead.create({ data: { firmId: A, personId: pat.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: own.staffId, createdBy: "test" } });

  // ------------------------------------------------------------------------------------------------ P1 the switch (W4b)
  const bF = await book(A, follow, R.staffId, lee), bOff = await book(A, freeOff, R.staffId, lee), bOn = await book(A, followOn, R.staffId, lee);
  const [sF, sOff, sOn] = [await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, bF)), await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, bOff)), await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, bOn))];
  ok("FO-3c2 P1 pass (W4b; QA-751): a follow-up (no choice stored) and a free consultation switched off send no agreement (NOT_REQUIRED), and the catch-up sends them none either",
    sF?.sent === false && sF.reason === "NOT_REQUIRED" && sOff?.sent === false && sOff.reason === "NOT_REQUIRED" && (await svc.catchUp((_f, fn) => fn())).sent === 0 && agreementsOf(bF.id) + agreementsOf(bOff.id) === 0, { sF, sOff });
  ok("FO-3c2 P1 fail: a follow-up switched on sends it; with no choice stored the default is on for every purpose but a follow-up",
    sOn?.sent === true && agreementsOf(bOn.id) === 1 && needsAgreement({ requireAgreement: null, purpose: "FREE_CONSULT" }) && needsAgreement({ requireAgreement: null, purpose: "CASE_REVIEW" }) && !needsAgreement({ requireAgreement: null, purpose: "FOLLOW_UP" }), sOn);
  const tv = await types.get(R, free.id) as { requireAgreement: boolean; requireAgreementSet: boolean; version: number };
  const saved = await types.update(R, free.id, { requireAgreement: false, version: tv.version }) as { requireAgreement: boolean; requireAgreementSet: boolean; version: number };
  const back = await types.update(R, free.id, { requireAgreement: true, version: saved.version }) as { requireAgreement: boolean; requireAgreementSet: boolean };
  const badType = await answer(() => types.update(R, free.id, { requireAgreement: "yes", version: saved.version + 1 }));
  ok("FO-3c2 P1 settings: a type reads its default (on, not stored), saves off and on again (stored), and a non-boolean is refused (422, named)",
    tv.requireAgreement === true && tv.requireAgreementSet === false && saved.requireAgreement === false && saved.requireAgreementSet === true && back.requireAgreement === true
    && sql(`select require_agreement from fo_consultation_type where id = '${free.id}'`) === "t" && badType.status === 422 && /requireAgreement/.test(badType.body), { tv, saved, back, badType });

  // ------------------------------------------------------------------------------ P2 warn, never block (AG-4-15 rule 4)
  const b2 = await book(A, free, R.staffId, lee, -180), b3 = await book(A, free, R.staffId, lee, -180);   // both over: their attendance question is open
  const s2 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b2)), s3 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b3));
  const att2 = await answer(() => bookings.recordAttendance(R, b2.id, { outcome: "COMPLETED" }));
  const noShow3 = await answer(() => bookings.recordAttendance(R, b3.id, { outcome: "NO_SHOW" }));
  ok("FO-3c2 P2 pass (AG-4-15 r4; the founder's ruling): with its agreement sent and unsigned, Attended is saved (200, Attended) and its answer carries the warning naming the agreement",
    s2?.sent === true && att2.status === 200 && statusOf(b2.id) === "COMPLETED" && warningOf(att2)?.code === "AGREEMENT_NOT_SIGNED" && warningOf(att2)?.agreementId === s2.agreementId, { s2, att2 });
  ok("FO-3c2 P2 fail: No-show is saved while the agreement is unsigned (and carries no warning)", warningOf(noShow3) === null && s3?.sent === true && noShow3.status === 200 && statusOf(b3.id) === "NO_SHOW", noShow3);
  // A booking already marked Attended (written straight to the table): its record is saved, with the warning.
  const b4 = await book(A, free, R.staffId, lee, -120);
  const sentLate = await svc.send(A, b4.id);
  await db.foBooking.update({ where: { id: b4.id }, data: { status: "COMPLETED" } });
  const rec4 = await answer(() => consult.put(R, b4.id, RECORD));
  const get4 = await answer(() => consult.get(R, b4.id));
  ok("FO-3c2 P2 record: a consult record for an Attended booking whose agreement is unsigned is saved (one row) and its answer, and a later read, carry the warning",
    sentLate.sent && rec4.status === 200 && Number(sql(`select count(*) from fo_consult_record where booking_id = '${b4.id}'`)) === 1 && warningOf(rec4)?.code === "AGREEMENT_NOT_SIGNED" && warningOf(get4)?.code === "AGREEMENT_NOT_SIGNED", { sentLate, rec4, get4 });

  // ------------------------------------------------------------------------------------------------ P3 after signing (W9)
  // Signed during b5's meeting (a link of a meeting that has ended is refused, part 1's break m5), then answered after it.
  const b5 = await book(A, free, R.staffId, pat, -180), today = clock.now();
  await clock.set(new Date(b5.startsAt.getTime() - 10 * MIN));   // sent before the meeting, signed during it (the request's times run forward)
  const s5 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b5));
  const before5 = await answer(() => bookings.recordAttendance(R, b5.id, { outcome: "COMPLETED" }));   // too early: not started
  await clock.set(new Date(b5.startsAt.getTime() + 5 * MIN));
  const held5 = await warnAt(R, b5.id);
  const signed5 = s5?.sent ? await signAll(s5.agreementId, "pat@client.example", R) : "";
  await clock.set(today);
  const att5 = await answer(() => bookings.recordAttendance(R, b5.id, { outcome: "COMPLETED" }));
  const rec5 = await answer(() => consult.put(R, b5.id, RECORD));
  ok("FO-3c2 P3 pass (W9): once the client and the firm have signed, Attended and the consult record are saved with no warning",
    signed5 === "SIGNED" && att5.status === 200 && statusOf(b5.id) === "COMPLETED" && rec5.status === 200 && warningOf(att5) === null && warningOf(rec5) === null, { signed5, att5, rec5 });
  ok("FO-3c2 P3 fail: the same booking warned before signing (during the meeting); Attended before the meeting started is still too early (409)",
    before5.status === 409 && /too-early|Not yet/.test(before5.body) && held5.warned && /AGREEMENT_NOT_SIGNED/.test(held5.body), { before5, held5 });
  const bF2 = await book(A, follow, R.staffId, lee, -120);
  await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, bF2));
  const attF = await answer(() => bookings.recordAttendance(R, bF2.id, { outcome: "COMPLETED" }));
  ok("FO-3c2 P3 type: a follow-up (no agreement needed, none sent) never warns: its Attended is saved", attF.status === 200 && warningOf(attF) === null && statusOf(bF2.id) === "COMPLETED" && agreementsOf(bF2.id) === 0, attF);

  // --------------------------------------------------------------------------------------------------- P4 the poller (W2)
  const poll = new AgreementPoll(db, svc, () => clock.now());
  const first = await poll.tick();   // sets the cursor (a day back) and runs the first catch-up
  const lines = () => Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and detail->>'use' = 'front-office.consultation-agreement.poll'`));
  const b6 = await book(A, free, R.staffId, lee, 3 * 24 * 60), bF3 = await book(A, follow, R.staffId, lee, 3 * 24 * 60), bB = await book(B, await type(B, "p2-solo", [S.staffId]), S.staffId, await person(B, "Sam"), 3 * 24 * 60);
  const out = (b: typeof b6, t: string) => db.moduleEvent.create({ data: { firmId: b.firmId, type: t, subjectId: b.id, occurredAt: clock.now(), payload: eventOf(t, b).payload } });
  for (const b of [b6, bF3, bB]) await out(b, EVENT.BOOKING_SCHEDULED);
  const linesBefore = lines();
  const run = await poll.tick(), again = await poll.tick();
  ok("FO-3c2 P4 pass (W2): booking.scheduled events in the outbox reach the agreement service, each as its own firm: firm A's and firm B's bookings each get one agreement, and each firm read writes its platform.bypass line",
    !!first && run?.events === 3 && run.sent === 2 && agreementsOf(b6.id) === 1 && agreementsOf(bB.id) === 1 && sql(`select r.firm_id from fo_retainer r join fo_retainer_version v on v.retainer_id = r.id where v.merge_values->>'booking.id' = '${bB.id}'`) === B
    && lines() - linesBefore >= 2, { first, run, lines: lines() - linesBefore });
  ok("FO-3c2 P4 fail: the next run reads no event again and sends nothing; the follow-up's event sent none", again?.events === 0 && again.sent === 0 && agreementsOf(bF3.id) === 0, { again });
  const keyOf = (b: { sequence: number }, id: string) => `consultation-agreement:${id}:reminder:${b.sequence}`;
  const a6 = (await svc.forBooking(R, b6.id)).id!;
  const moved = await db.foBooking.update({ where: { id: b6.id }, data: { status: "RESCHEDULED", startsAt: new Date(b6.startsAt.getTime() + 24 * HOUR), endsAt: new Date(b6.endsAt.getTime() + 24 * HOUR), sequence: { increment: 1 } } });
  await out(moved, EVENT.BOOKING_RESCHEDULED);
  const run2 = await poll.tick();
  const waiting = (k: string) => jobs.jobs.filter((j) => j.key === k && j.status === "waiting");
  const at = (k: string) => waiting(k)[0]?.runAt.toISOString() ?? "";
  ok("FO-3c2 P4 reschedule (W5): a booking.rescheduled event sends no second agreement and queues the reminder 24 hours before the new time (its key names the new sequence)",
    run2?.events === 1 && run2.sent === 0 && agreementsOf(b6.id) === 1 && waiting(keyOf(b6, a6)).length === 1 && waiting(keyOf(moved, a6)).length === 1
    && at(keyOf(moved, a6)) === new Date(moved.startsAt.getTime() - 24 * HOUR).toISOString(), { run2, keys: jobs.jobs.filter((j) => j.key?.includes(a6)).map((j) => [j.key, j.status]) });

  // ------------------------------------------------------------------------------------------- P5 the reads (FO-3vr)
  const byBooking = await answer(() => svc.forBooking(own, b6.id)), byId = await answer(() => svc.read(own, a6)), byPerson = await answer(() => svc.forPerson(own, lee.id));
  ok("FO-3c2 P5 pass (FO-3vr): a colleague with the list key who neither hosts the booking nor owns Lee's lead reads its agreement as the one not-found (by booking, by id) and Lee's list without it",
    byBooking.status === 404 && byId.status === 404 && byPerson.status === 200 && !byPerson.body.includes(a6), { byBooking: byBooking.status, byId: byId.status, byPerson: byPerson.body.slice(0, 200) });
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });
  const allKeys = ctxOf(own.staffId, A, [...new Set([...officer, "agent/prospect:view.all"])]);
  const seen = await answer(() => svc.forBooking(allKeys, b6.id)), hostSees = await answer(() => svc.read(R, a6)), otherFirm = await answer(() => svc.read(S, a6));
  ok("FO-3c2 P5 fail: the host reads it, a viewer who sees all (everyone-sees-all on, view.all) reads it, and another firm still reads the one not-found",
    seen.status === 200 && seen.body.includes(a6) && hostSees.status === 200 && otherFirm.status === 404, { seen: seen.status, hostSees: hostSees.status, otherFirm: otherFirm.status });
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws });

  // ------------------------------------------------------------------------------------------------ P6 the signed copy
  const a5 = s5?.sent ? s5.agreementId : "";
  const unsignedKey = await answer(() => svc.signedCopyKey(R, a6));
  const key5 = await answer(() => svc.signedCopyKey(R, a5));
  const k = key5.status === 200 ? JSON.parse(key5.body) as string : "";
  const evd = await db.foSigningEvidence.findFirst({ where: { firmId: A, sealedFileKey: k } });
  ok("FO-3c2 P6 pass (W7): a signed agreement gives its stored signed copy's key, which is the sealed file of its evidence, and is visible to its host",
    !!evd && (await svc.copyVisible(R, k)) && !!(await files.get(A, k)), { key5 });
  // Pat's lead is the colleague's own, so the colleague sees b5: firm B and a person outside the rule do not.
  ok("FO-3c2 P6 fail: an unsigned agreement has no copy (409 NO_SIGNED_COPY); another firm's person is not shown the key (404) nor the file",
    unsignedKey.status === 409 && /NO_SIGNED_COPY/.test(unsignedKey.body) && (await answer(() => svc.signedCopyKey(S, a5))).status === 404 && !(await svc.copyVisible(S, k)), { unsignedKey });
  const words = await svc.read(R, a5);
  ok("FO-3c2 W7 words: the signed agreement reads \"Agreement signed\" with the copy's sha256", words.words === WORDS.signed && /^[0-9a-f]{64}$/.test(words.signedCopy?.sha256 ?? ""), words);

  // ------------------------------------------------------------------------- round 1's breaker findings (P2-1 .. P2-5)
  // P2-1: the representative of record signs for a host with no licence record (user-O) on a lead the signer does not
  // see (everyone-sees-all off, the colleague owns it): the signer still reaches the agreement; a third person does not.
  const Ohost = ctxOf(sid("user-O"), A, officer), Tview = ctxOf(sid("user-T"), A, officer.filter((k) => k !== "agent/prospect:view.all" && k !== "agent/prospect:assign"));
  const typeO = await type(A, "p2-free-o", [Ohost.staffId]);
  const b7 = await book(A, typeO, Ohost.staffId, pat, -180);
  await clock.set(new Date(b7.startsAt.getTime() - 10 * MIN));
  const s7 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b7));
  const a7 = s7?.sent ? s7.agreementId : "";
  const rep7 = sql(`select representative_staff_id from fo_retainer where id = '${a7}'`);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws });
  const RnoAll = ctxOf(R.staffId, A, R.keys.filter((k) => k !== "agent/prospect:view.all" && k !== "agent/prospect:assign"));
  const readSigner = await answer(() => svc.read(RnoAll, a7)), seesBooking = await answer(() => svc.forBooking(RnoAll, b7.id));
  await clock.set(new Date(b7.startsAt.getTime() + 5 * MIN));
  const signed7 = a7 ? await signAll(a7, "pat@client.example", RnoAll).catch((e) => `threw ${String(e).slice(0, 120)}`) : "";
  await clock.set(today);
  ok("FO-3c2 B1 pass (break P2-1): the representative of record, who signs for a host with no licence record, reads the agreement and signs it although the booking is not one they see",
    rep7 === R.staffId && readSigner.status === 200 && seesBooking.status === 404 && signed7 === "SIGNED", { rep7: rep7 === R.staffId, readSigner: readSigner.status, seesBooking: seesBooking.status, signed7 });
  ok("FO-3c2 B1 fail: a colleague who neither signs nor sees the booking still reads the one not-found", (await answer(() => svc.read(Tview, a7))).status === 404);
  // P2R2-1 (Lead 1's ruling on #3184): an agreement that ended unsigned still holds; while the meeting is ahead the
  // catch-up sends a fresh one, and its signature lifts the hold. A past meeting gets none until it is rescheduled.
  const latestOf = (bookingId: string) => sql(`select r.id || ':' || r.status from fo_retainer r join fo_retainer_version v on v.retainer_id = r.id and v.n = 1 where r.kind = 'CONSULTATION' and v.merge_values->>'booking.id' = '${bookingId}' order by r.created_at desc, r.id desc limit 1`).split(":");
  const decline = async (agreementId: string) => {
    const q = await db.foSignatureRequest.findFirstOrThrow({ where: { documentId: agreementId }, include: { signers: true } });
    for (const h of await signing.act(q.firmId, q.providerDocumentId, q.signers.find((x) => x.role === "CLIENT")!.id, "declined")) await svc.signingEvent(h);
  };
  const b8 = await book(A, free, R.staffId, lee, -180);
  await clock.set(new Date(b8.startsAt.getTime() - 60 * MIN));   // the meeting an hour ahead
  const s8 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b8)), a8 = s8?.sent ? s8.agreementId : "";
  await decline(a8);
  const st8 = sql(`select status from fo_retainer where id = '${a8}'`), w8 = await svc.read(R, a8);
  const cuFresh8 = await svc.catchUp((_f, fn) => fn());   // the catch-up sends the fresh one (review M2)
  const [fresh8, freshSt8] = latestOf(b8.id);
  const repeat8 = await svc.send(A, b8.id), cu8 = await svc.catchUp((_f, fn) => fn());   // the fresh one is waiting: none more
  await clock.set(new Date(b8.startsAt.getTime() + 5 * MIN));
  const att8 = await warnAt(R, b8.id);
  ok("FO-3c2 B2 pass (P2R2-1; Lead 1's ruling): a declined agreement reads \"Agreement ended unsigned\" and still warns; while the meeting is ahead a fresh one is sent (once), and the warning names it until it is signed",
    ["DECLINED", "WITHDRAWN"].includes(st8) && w8.words === WORDS.ended && cuFresh8.sent >= 1 && fresh8 !== a8 && freshSt8 === "SENT" && agreementsOf(b8.id) === 2
    && repeat8.sent === false && repeat8.reason === "ALREADY_SENT" && cu8.sent === 0 && agreementsOf(b8.id) === 2 && att8.warned && /AGREEMENT_NOT_SIGNED/.test(att8.body) && att8.body.includes(fresh8), { st8, words: w8.words, cuFresh8, repeat8, cu8, att8 });
  const signed8 = await signAll(fresh8, "lee@client.example", R);
  await clock.set(today);
  const done8 = await answer(() => bookings.recordAttendance(R, b8.id, { outcome: "COMPLETED" }));
  ok("FO-3c2 B2 fail: once the fresh agreement is signed, the same booking's Attended is saved with no warning (the latest agreement decides, not the declined one)",
    signed8 === "SIGNED" && done8.status === 200 && warningOf(done8) === null && statusOf(b8.id) === "COMPLETED", { signed8, done8 });
  // Withdrawn by the firm (FO-5's withdraw) with the meeting already past: warns, and no fresh one until it is rescheduled.
  const b8w = await book(A, free, R.staffId, lee, -180);
  await clock.set(new Date(b8w.startsAt.getTime() - 60 * MIN));
  const s8w = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b8w)), a8w = s8w?.sent ? s8w.agreementId : "";
  await clock.set(today);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });   // FO-5's page reads it so
  const wd = await answer(() => retainers.withdraw(R, a8w, { reason: "Sample: skip it", expectedVersion: 1, expectedStatus: "SENT" }));
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "system:test", workspaceId: ws });
  const held8w = await warnAt(R, b8w.id), cu8w = await svc.catchUp((_f, fn) => fn());
  ok("FO-3c2 B6 pass (P2R2-1): an agreement the firm withdrew still warns, and with the meeting past the catch-up sends no fresh one",
    wd.status === 200 && sql(`select status from fo_retainer where id = '${a8w}'`) === "WITHDRAWN" && held8w.warned && /AGREEMENT_NOT_SIGNED/.test(held8w.body) && agreementsOf(b8w.id) === 1 && statusOf(b8w.id) === "SCHEDULED", { wd: wd.status, held8w, cu8w });
  const moved8w = await db.foBooking.update({ where: { id: b8w.id }, data: { status: "RESCHEDULED", startsAt: new Date(clock.now().getTime() + 9 * 24 * HOUR), endsAt: new Date(clock.now().getTime() + 9 * 24 * HOUR + 30 * MIN), sequence: { increment: 1 } } });
  const r8w = await svc.onBookingEvent(eventOf(EVENT.BOOKING_RESCHEDULED, moved8w));
  ok("FO-3c2 B6 fail: rescheduled to a time ahead, the reschedule sends a fresh agreement for the new time (the latest is SENT)",
    r8w?.sent === true && agreementsOf(b8w.id) === 2 && latestOf(b8w.id)[1] === "SENT", { r8w });
  // Review M2: three sends at once after a decline make one fresh agreement (the re-check inside the lock); an agreement
  // put back to draft (FO-5's edit) counts as ended, so the catch-up sends a fresh one.
  const b15 = await book(A, free, R.staffId, pat, -180);
  await clock.set(new Date(b15.startsAt.getTime() - 60 * MIN));
  const s15 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b15));
  await decline(s15?.sent ? s15.agreementId : "");
  const race15 = await Promise.all([svc.send(A, b15.id), svc.send(A, b15.id), svc.send(A, b15.id)]);
  ok("FO-3c2 B11 pass (review M2): three sends at once after a decline make exactly one fresh agreement; the others answer ALREADY_SENT with it",
    race15.filter((x) => x.sent).length === 1 && agreementsOf(b15.id) === 2 && race15.filter((x) => !x.sent).every((x) => !x.sent && x.reason === "ALREADY_SENT"), race15);
  const b16 = await book(A, free, R.staffId, pat, -180);
  await clock.set(new Date(b16.startsAt.getTime() - 60 * MIN));
  const s16 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b16)), a16 = s16?.sent ? s16.agreementId : "";
  const before16 = await svc.catchUp((_f, fn) => fn()), n16 = agreementsOf(b16.id);
  sql(`set session_replication_role = replica; update fo_retainer set status = 'DRAFT' where id = '${a16}'`);   // FO-5's edit of a sent one
  const cu16 = await svc.catchUp((_f, fn) => fn());
  await clock.set(today);
  ok("FO-3c2 B11 draft (review M2): an agreement put back to draft counts as ended: the catch-up sends a fresh one, which is the booking's agreement",
    cu16.sent >= 1 && agreementsOf(b16.id) === 2 && latestOf(b16.id)[1] === "SENT", { cu16 });
  ok("FO-3c2 B11 fail: while it was still sent, the catch-up sent the booking none", n16 === 1 && s16?.sent === true, { before16, n16 });
  // Break P2R3-1: any signed agreement of the booking lifts the hold, whichever is newest, and a fresh one is sent only when
  // every agreement has ended. A1 declined, fresh A2 sent; then A1 is filed signed on paper (FO-5's signed offline of an
  // earlier version, written straight to the table here, past FO-5's own rules: the breaker reached it through FO-5).
  const b14 = await book(A, free, R.staffId, pat, -180);
  await clock.set(new Date(b14.startsAt.getTime() - 60 * MIN));
  const s14 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b14)), a14 = s14?.sent ? s14.agreementId : "";
  await decline(a14);
  const f14 = await svc.send(A, b14.id), a14b = f14.sent ? f14.agreementId : "";
  await clock.set(new Date(b14.startsAt.getTime() + 5 * MIN));
  const held14 = await warnAt(R, b14.id);
  sql(`set session_replication_role = replica; update fo_retainer set status = 'SIGNED_OFFLINE', offline_at = now(), offline_reason = 'Sample: signed on paper', offline_by = 'staff:${R.staffId}', offline_file_key = 'retainers/' || id::text || '/signed-offline.pdf', offline_file_sha256 = repeat('a', 64) where id = '${a14}'`);
  const retainersApi = await answer(() => retainers.withdraw(R, a14b, { reason: "Sample: signed on paper", expectedVersion: 1, expectedStatus: "SENT" }));
  const again14 = await svc.send(A, b14.id), cu14 = await svc.catchUp((_f, fn) => fn()), panel14 = await svc.forBooking(R, b14.id);
  const att14 = await answer(() => bookings.recordAttendance(R, b14.id, { outcome: "COMPLETED" }));
  await clock.set(today);
  ok("FO-3c2 B10 pass (break P2R3-1): an older agreement signed (on paper) ends the warning although a newer one was sent and then withdrawn; no further one is sent; the panel shows the signed one",
    att14.status === 200 && warningOf(att14) === null && statusOf(b14.id) === "COMPLETED" && again14.sent === false && again14.reason === "ALREADY_SENT" && again14.agreementId === a14 && cu14.sent === 0 && agreementsOf(b14.id) === 2 && panel14.id === a14 && panel14.signed === true,
    { att14: att14.status, again14, cu14, panel14: [panel14.id === a14, panel14.status], withdraw: retainersApi.status });
  ok("FO-3c2 B10 fail: before the older one was signed, the same booking warned on the fresh one (naming it)",
    f14.sent === true && held14.warned && held14.body.includes(a14b), { f14, held14 });
  // Review r2-2: a No-show booking cannot be rescheduled, so the panel's next step says to make a new booking.
  ok("FO-3c2 B7 (review r2-2): the panel's next step on a No-show booking says to make a new booking, never to reschedule; on any other booking it says to reschedule",
    agreementNextStep("NO_SHOW") === NEXT_NO_SHOW && !/reschedule it/.test(agreementNextStep("NO_SHOW")) && agreementNextStep("SCHEDULED") === NEXT_RESCHEDULE && agreementNextStep(undefined) === NEXT_RESCHEDULE
    && (await answer(() => bookings.staffReschedule(R, b3.id, { startsAt: new Date(clock.now().getTime() + 10 * 24 * HOUR).toISOString(), timeZone: "America/Toronto" }))).status === 409);
  const noShowAtt = await answer(() => bookings.recordAttendance(R, b3.id, { outcome: "COMPLETED" }));
  const sched7 = await warnAt(R, b8w.id);   // rescheduled ahead, its fresh agreement sent and unsigned (B6 fail)
  ok("FO-3c2 B7 server words (review m3-1): Attended on a No-show booking is saved, and its warning says a new booking sends a new agreement, never to reschedule (a Rescheduled one's warning names the email link)",
    noShowAtt.status === 200 && warningOf(noShowAtt)?.words === WARN_WORDS_INACTIVE && !/reschedule it/.test(noShowAtt.body) && warningOf(att2)?.words === WARN_WORDS_INACTIVE && sched7.body.includes(WARN_WORDS), { noShowAtt, sched7 });
  ok("FO-3c2 B7 other statuses (break P2R3-4): Attended and cancelled bookings are never told to reschedule nor promised a fresh agreement; Scheduled and Rescheduled are",
    agreementNextStep("COMPLETED") === NEXT_COMPLETED && agreementNextStep("CANCELLED") === NEXT_CANCELLED && !sendsFresh("COMPLETED") && !sendsFresh("CANCELLED") && !sendsFresh("NO_SHOW") && sendsFresh("SCHEDULED") && sendsFresh("RESCHEDULED"));
  // P2-3: a quiet catch-up (a signed copy already queued, nothing to send) touches no firm: no new bypass line.
  for (let i = 0; i < 16; i++) await poll.tick();   // runs at least one catch-up (every 15th run)
  const quiet0 = lines();
  for (let i = 0; i < 16; i++) await poll.tick();
  ok("FO-3c2 B3 pass (break P2-3): with nothing new, a further catch-up writes no platform.bypass line (signed copies already queued are passed over)", lines() === quiet0, { before: quiet0, after: lines() });
  const b9 = await book(A, free, R.staffId, lee, 6 * 24 * 60);   // clear of b6, moved to day 4 straight in the table
  await out(b9, EVENT.BOOKING_SCHEDULED);
  await poll.tick();
  ok("FO-3c2 B3 fail: a new booking event is read, sent and lined (one firm read, one line)", agreementsOf(b9.id) === 1 && lines() === quiet0 + 1, { lines: lines() - quiet0 });
  // P2-5: null puts a type back on its purpose's default.
  const cur = await types.get(R, follow.id) as { version: number };
  const on = await types.update(R, follow.id, { requireAgreement: true, version: cur.version }) as { version: number; requireAgreement: boolean };
  const reset = await types.update(R, follow.id, { requireAgreement: null, version: on.version }) as { requireAgreement: boolean; requireAgreementSet: boolean };
  ok("FO-3c2 B4 (break P2-5): requireAgreement null puts a follow-up back on its default (off, nothing stored); true before it stored on",
    on.requireAgreement === true && reset.requireAgreement === false && reset.requireAgreementSet === false && sql(`select coalesce(require_agreement::text, 'null') from fo_consultation_type where id = '${follow.id}'`) === "null", { on, reset });
  // Review m1: the type's switch is read by the hold itself (a type switched off after its agreement was sent holds no more;
  // switched on again, it holds again), and the download's visibility check refuses a person outside the rule.
  const b10 = await book(A, freeOff, R.staffId, lee, -180);
  await db.foConsultationType.update({ where: { id: freeOff.id }, data: { requireAgreement: true } });
  await clock.set(new Date(b10.startsAt.getTime() - 10 * MIN));
  const s10 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b10));
  await clock.set(today);
  const held10 = await warnAt(R, b10.id);
  await db.foConsultationType.update({ where: { id: freeOff.id }, data: { requireAgreement: false } });
  const free10 = await answer(() => bookings.recordAttendance(R, b10.id, { outcome: "COMPLETED" }));
  ok("FO-3c2 R1 (review m1): the warning reads the type's switch: on, an unsigned agreement warns; switched off, the same booking's Attended is saved with no warning",
    s10?.sent === true && held10.warned && free10.status === 200 && warningOf(free10) === null && statusOf(b10.id) === "COMPLETED", { s10, held10, free10: free10.status });
  ok("FO-3c2 R1 download: the signed copy's file is refused to a colleague with the list key outside the record rule (the download's check), and given to its host",
    !(await svc.copyVisible(Tview, k)) && (await svc.copyVisible(R, k)), { k: !!k });

  // ------------------------------------------------------------------- round 3: the backoff (P2R2-2, P2R2-3; review r2-1)
  // The poller's own backoff, on a stand-in service whose catch-up tries one row of firm B: a provider down for 70
  // minutes, the meeting 100 minutes ahead, one catch-up every 30 s (the default: 2 s × 15).
  const linesOf = (firmId: string) => Number(sql(`select count(*) from audit_event where action = 'platform.bypass' and firm_id = '${firmId}' and detail->>'use' = 'front-office.consultation-agreement.poll'`));
  const outage = async (withMeeting: boolean) => {
    const t0 = clock.now().getTime(), meeting = t0 + 100 * MIN, downUntil = t0 + 70 * MIN, tries: number[] = [];
    let on = false, done = false;
    const stand = { onBookingEvent: async () => null, catchUp: async (each: (f: string, fn: () => Promise<unknown>, key?: string, before?: Date) => Promise<unknown>) => {
      if (on && !done) await each(B, async () => { tries.push(clock.now().getTime()); if (clock.now().getTime() < downUntil) throw new Error("Sample: the provider is down"); done = true; return { sent: true }; }, "send:sample", withMeeting ? new Date(meeting) : undefined).catch(() => null);
      return { sent: 0, failed: 0, sealed: 0 };
    } };
    const p = new AgreementPoll(db, stand as never, () => clock.now());
    const catchUpNow = async () => { (p as unknown as { runs: number }).runs = 0; await p.tick(); };
    await catchUpNow(); on = true;   // the first run sets the cursor and reads the day's events (not counted)
    await catchUpNow();
    const l1 = linesOf(B); await catchUpNow(); const skipped = tries.length === 1 && linesOf(B) === l1;   // same time: held back, no line
    for (let t = t0 + 30_000; t < meeting; t += 30_000) { await clock.set(new Date(t)); await catchUpNow(); }
    await clock.set(new Date(t0));
    return { t0, meeting, downUntil, tries: tries.map((x) => (x - t0) / 1000), skipped, linesOf: linesOf(B) - l1 };
  };
  const withM = await outage(true), noM = await outage(false);
  ok("FO-3c2 B5 pass (break P2R2-2): a row with a meeting waits at most half the time left before it, so once the provider is back it is tried, and sent, before the meeting; the wait still doubles meanwhile",
    withM.tries.some((x) => x >= 70 * 60 && x < 100 * 60) && withM.tries.length <= 14, withM);
  ok("FO-3c2 B5 fail: the same outage with no meeting given (the old rule) is not tried again before the 100 minutes are up",
    !noM.tries.some((x) => x >= 70 * 60 && x < 100 * 60), noM);
  ok("FO-3c2 B5 backoff (review r2-1): after a failure the row is held back at the next catch-up (no try, no bypass line), tried again after 30 s, then after a doubled wait of 60 s",
    withM.skipped && withM.tries[0] === 0 && withM.tries[1] === 30 && withM.tries[2] === 90, withM.tries.slice(0, 4));
  // Review m3-2: a row whose wait grew while its meeting was days away is tried again before a meeting moved nearer.
  const movedNear = async (capAtCheck: boolean) => {
    const t0 = clock.now().getTime(), tries: number[] = [];
    let mt = t0 + 3 * 24 * HOUR, down = true, on = false, done = false;
    const stand = { onBookingEvent: async () => null, catchUp: async (each: (f: string, fn: () => Promise<unknown>, key?: string, before?: Date) => Promise<unknown>) => {
      if (on && !done) await each(B, async () => { tries.push(clock.now().getTime()); if (down) throw new Error("Sample: the provider is down"); done = true; return { sent: true }; }, "send:moved", capAtCheck ? new Date(mt) : new Date(t0 + 3 * 24 * HOUR)).catch(() => null);
      return { sent: 0, failed: 0, sealed: 0 };
    } };
    const p = new AgreementPoll(db, stand as never, () => clock.now());
    const go = async () => { (p as unknown as { runs: number }).runs = 0; await p.tick(); };
    await go(); on = true;
    let t = t0;
    for (; t < t0 + 70 * MIN; t += 30_000) { await clock.set(new Date(t)); await go(); }   // the wait grows to an hour
    mt = t + 40 * MIN; down = false;   // moved to 40 minutes ahead; the provider is back
    for (; t < mt; t += 30_000) { await clock.set(new Date(t)); await go(); }
    await clock.set(new Date(t0));
    return { sentBefore: done && tries.at(-1)! < mt, lastTry: (tries.at(-1)! - t0) / 1000, meeting: (mt - t0) / 1000, tries: tries.length };
  };
  const mNear = await movedNear(true), mFar = await movedNear(false);
  ok("FO-3c2 B12 pass (review m3-2): a row whose wait grew to an hour is tried again, and sent, before its meeting once the meeting is moved to 40 minutes ahead (the cap is read at each check)", mNear.sentBefore, mNear);
  ok("FO-3c2 B12 fail: with the meeting left days away, the same row is not tried in those 40 minutes", !mFar.sentBefore, mFar);
  // P2R2-3: a send that answers NO_TEMPLATE (the template's file is missing from the store) backs off as a failure does.
  const b11 = await book(B, await type(B, "p3-solo", [S.staffId]), S.staffId, await person(B, "Sky"), 5 * 24 * 60);
  const realGet = files.get.bind(files);
  (files as unknown as { get: typeof files.get }).get = async (f, key) => (f === B ? null : realGet(f, key));
  const nt = new AgreementPoll(db, svc, () => clock.now());
  const catchUpNt = async () => { (nt as unknown as { runs: number }).runs = 0; return (await nt.tick())?.caughtUp; };
  await catchUpNt();   // sets the cursor; its catch-up tries b11 once (NO_TEMPLATE → failed)
  const l11 = linesOf(B), c2 = await catchUpNt(), held11 = linesOf(B) - l11;
  await clock.set(new Date(clock.now().getTime() + 31_000));
  const c3 = await catchUpNt(), retried11 = linesOf(B) - l11, none11 = agreementsOf(b11.id);
  (files as unknown as { get: typeof files.get }).get = realGet;
  await clock.set(new Date(clock.now().getTime() + 61_000));
  const c4 = await catchUpNt();
  await clock.set(today);
  ok("FO-3c2 B8 pass (break P2R2-3): a catch-up send answering NO_TEMPLATE is held back like a failure: the next catch-up neither tries it nor writes firm B a bypass line",
    none11 === 0 && c2?.failed === 0 && held11 === 0, { c2, held11, none11 });
  ok("FO-3c2 B8 fail: after its wait it is tried again (failed, one line), and once the file is back it is sent",
    c3?.failed === 1 && retried11 === 1 && c4?.sent === 1 && agreementsOf(b11.id) === 1, { c3, retried11, c4 });
  // Review r2-1: the 24-hour reminder reads the type's switch when it runs.
  const repEmail = sql(`select email from platform_staff where id = '${R.staffId}'`);
  const remOn = await type(A, "p3-rem-on", [R.staffId], "FREE_CONSULT", true), remOff = await type(A, "p3-rem-off", [R.staffId], "FREE_CONSULT", true);
  const b12 = await book(A, remOn, R.staffId, pat, 3 * 24 * 60), b13 = await book(A, remOff, R.staffId, pat, 3 * 24 * 60);
  const s12 = await svc.send(A, b12.id), s13 = await svc.send(A, b13.id);
  await db.foConsultationType.update({ where: { id: remOff.id }, data: { requireAgreement: false } });
  await clock.set(new Date(Math.max(b12.startsAt.getTime(), b13.startsAt.getTime()) - 23 * HOUR));   // both reminders due
  const reminded = (s: typeof s12, b: typeof b12) => s.sent && mail.inbox(repEmail).some((m) => m.idempotencyKey === keyOf(b, s.agreementId) && m.templateKey === "consultation_agreement.reminder");
  const on12 = reminded(s12, b12), off13 = reminded(s13, b13);
  await clock.set(today);
  ok("FO-3c2 B9 pass (review r2-1): a type switched off after its agreement was sent gets no 24-hour reminder", s13.sent && !off13, { s13, off13 });
  ok("FO-3c2 B9 fail: a type still on gets its reminder", s12.sent && on12, { s12, on12 });

  // ------------------------------------------------------------------------------------- QA-772: needs one, none yet
  // Each booking is over (its attendance question is open) and was never sent an agreement (no event read). It warns,
  // naming the cause and the way out (read here without answering Attended, which W1 saves). The way out is the real one
  // (break QA772-1): the cause fixed, the meeting rescheduled to a later time, and the catch-up sends the agreement.
  const att = (c: StaffContext, b: { id: string }) => warnAt(c, b.id);
  const causesOf = (r: { body: string }) => { try { return (JSON.parse(r.body).causes ?? []).join(","); } catch { return "?"; } };
  let later = 12 * 24;   // hours ahead, a fresh time for each reschedule
  const sendAfter = async (c: StaffContext, b: { id: string }) => {
    later += 3;
    const at = new Date(clock.now().getTime() + later * HOUR).toISOString(), go = (w?: string[]) => answer(() => bookings.staffReschedule(c, b.id, { startsAt: at, timeZone: "America/Toronto", ...(w ? { bookAnyway: true, acceptedWarnings: w } : {}) } as never));
    let moved = await go();
    if (moved.status === 409 && /"WARNINGS"/.test(moved.body)) moved = await go((JSON.parse(moved.body).warnings as { code: string }[]).map((w) => w.code));   // "Book anyway?" answered yes, as a person does
    await svc.catchUp((_f, fn) => fn());
    return { moved: moved.status, n: agreementsOf(b.id), why: moved.status === 200 ? "" : moved.body.slice(0, 300) };
  };
  const heldOn = async (c: StaffContext, bookingId: string) => (await svc.forBooking(c, bookingId)).status === "SENT";
  // N1: the client has no email.
  const noe = await db.foPerson.create({ data: { firmId: A, givenNames: "Noe", familyName: "Sample", createdBy: "seed:qa772" } });
  const n1 = await book(A, free, R.staffId, noe, -180);
  const n1a = await att(R, n1), n1panel = await svc.forBooking(R, n1.id) as { why?: string; causes?: string[] };
  ok("FO-3c2 N1 (QA-772): no client email: the warning names the cause and the way out; the panel says the same",
    n1a.warned && /AGREEMENT_NOT_SIGNED/.test(n1a.body) && causesOf(n1a) === "NO_CLIENT_EMAIL" && n1a.body.includes(CAUSE_WORDS.NO_CLIENT_EMAIL) && n1a.body.includes(NEXT_WORDS.started) && !n1a.body.includes(NEXT_WORDS.ahead) && n1panel.why?.includes(CAUSE_WORDS.NO_CLIENT_EMAIL) === true && statusOf(n1.id) === "SCHEDULED", { n1a, n1panel });
  await db.foPerson.update({ where: { id: noe.id }, data: { email: "noe@client.example" } });
  const n1cu = await svc.catchUp((_f, fn) => fn()), n1c = await att(R, n1);
  ok("FO-3c2 N1 started (break QA772-1): with only the email added, a meeting already started is not sent one, and the warning says to reschedule (it promises no send)",
    agreementsOf(n1.id) === 0 && n1c.warned && causesOf(n1c) === "SENDING" && n1c.body.includes(NEXT_WORDS.startedSending) && !/within a minute|being sent now/.test(n1c.body), { n1cu, n1c });
  const n1sent = await sendAfter(R, n1);
  ok("FO-3c2 N1 pass: rescheduled to a later time, the catch-up sends the agreement (the booking now waits on it, sent, not signed)", n1sent.moved === 200 && n1sent.n === 1 && await heldOn(R, n1.id), n1sent);
  // N2: the firm has no active consultation template (firm B's switched off).
  const n2 = await book(B, await type(B, "qa772-solo", [S.staffId]), S.staffId, await person(B, "Tam"), -180);
  sql(`set session_replication_role = replica; update fo_retainer_template set active = false where firm_id = '${B}' and kind = 'CONSULTATION'`);
  const n2a = await att(S, n2);
  sql(`set session_replication_role = replica; update fo_retainer_template set active = true where firm_id = '${B}' and kind = 'CONSULTATION'`);
  ok("FO-3c2 N2 (QA-772): no active template: the warning names it (Templates)",
    n2a.warned && causesOf(n2a) === "NO_TEMPLATE" && n2a.body.includes(CAUSE_WORDS.NO_TEMPLATE) && statusOf(n2.id) === "SCHEDULED", n2a);
  const n2sent = await sendAfter(S, n2);
  ok("FO-3c2 N2 pass: with the template on again and the meeting rescheduled, the catch-up sends it", n2sent.moved === 200 && n2sent.n === 1 && await heldOn(S, n2.id), n2sent);
  // N3: nobody can sign for the firm (firm B's staff suspended: no licensed host, no representative of record).
  const n3 = await book(B, await type(B, "qa772-solo-2", [S.staffId]), S.staffId, await person(B, "Uma"), -180);
  const staffB = sql(`select string_agg(id::text || '=' || status::text, ',') from platform_staff where firm_id = '${B}'`);
  sql(`set session_replication_role = replica; update platform_staff set status = 'SUSPENDED' where firm_id = '${B}'`);
  const n3a = await att(S, n3);
  for (const kv of staffB.split(",")) { const [id, st] = kv.split("="); sql(`set session_replication_role = replica; update platform_staff set status = '${st}' where id = '${id}'`); }
  ok("FO-3c2 N3 (QA-772): nobody licensed to sign: the warning names it",
    n3a.warned && causesOf(n3a) === "NO_LICENSED" && n3a.body.includes(CAUSE_WORDS.NO_LICENSED), n3a);
  const n3sent = await sendAfter(S, n3);
  ok("FO-3c2 N3 pass: with the signer active again and the meeting rescheduled, the catch-up sends it", n3sent.moved === 200 && n3sent.n === 1 && await heldOn(S, n3.id), n3sent);
  // N4: nothing stops the send, but none has been made yet (the event not read, or a send backing off).
  const n4 = await book(A, free, R.staffId, pat, -180);
  const n4a = await att(R, n4);
  ok("FO-3c2 N4 (QA-772): nothing missing but none sent before the meeting started: the warning says to reschedule (no promise of a send)",
    n4a.warned && causesOf(n4a) === "SENDING" && n4a.body.includes(NEXT_WORDS.startedSending) && agreementsOf(n4.id) === 0, n4a);
  const n4sent = await sendAfter(R, n4);
  ok("FO-3c2 N4 pass: rescheduled to a later time, the catch-up sends it", n4sent.moved === 200 && n4sent.n === 1 && await heldOn(R, n4.id), n4sent);
  // N5: a No-show booking with none is told to make a new booking; a type that needs none is never held (unchanged).
  const n5 = await book(A, free, R.staffId, noe, -180), n5f = await book(A, follow, R.staffId, noe, -180);
  const n5ns = await answer(() => bookings.recordAttendance(R, n5.id, { outcome: "NO_SHOW" })), n5a = await att(R, n5), n5b = await answer(() => bookings.recordAttendance(R, n5f.id, { outcome: "COMPLETED" }));
  const n5c = await book(A, free, R.staffId, noe, -180);
  await db.foBooking.update({ where: { id: n5c.id }, data: { status: "CANCELLED" } });
  const n5panel = await svc.forBooking(R, n5c.id) as { why?: string };
  ok("FO-3c2 N5 (QA-772; break QA772-4): No-show is saved; that No-show booking with none warns to make a new booking (cause NOT_SCHEDULED); a follow-up with none is saved with no warning; a cancelled booking's panel shows no warning",
    n5ns.status === 200 && n5a.warned && warningOf(n5b) === null && causesOf(n5a) === "NOT_SCHEDULED" && n5a.body.includes(NEXT_WORDS.inactive) && !/reschedule/.test(n5a.body) && n5b.status === 200 && statusOf(n5f.id) === "COMPLETED" && n5panel.why === undefined, { n5ns: n5ns.status, n5a, n5b: n5b.status, n5panel });

  // ------------------------------------------------- W: warn, never block (AG-4-15 rule 4; the founder's ruling, 24 Nov)
  // W1: none could be sent (no client email): Attended and the consult record are saved, each answer naming the cause.
  const wPerson = await db.foPerson.create({ data: { firmId: A, givenNames: "Wren", familyName: "Sample", createdBy: "seed:fo3c2-warn" } });
  const w1 = await book(A, free, R.staffId, wPerson, -180);
  const w1att = await answer(() => bookings.recordAttendance(R, w1.id, { outcome: "COMPLETED" }));
  const w1rec = await answer(() => consult.put(R, w1.id, RECORD)), w1panel = await svc.forBooking(R, w1.id) as { why?: string };
  ok("FO-3c2 W1 pass (AG-4-15 r4): with no agreement sent (no client email), Attended is saved (Attended) and its answer warns, naming the cause; the consult record is saved (one row) with the same warning; the panel still warns",
    w1att.status === 200 && statusOf(w1.id) === "COMPLETED" && warningOf(w1att)?.code === "AGREEMENT_NOT_SIGNED" && (warningOf(w1att)?.causes ?? []).includes("NO_CLIENT_EMAIL")
    && w1rec.status === 200 && Number(sql(`select count(*) from fo_consult_record where booking_id = '${w1.id}'`)) === 1 && (warningOf(w1rec)?.causes ?? []).includes("NO_CLIENT_EMAIL") && !!w1panel.why, { w1att, w1rec, w1panel });
  ok("FO-3c2 W1 fail: a booking type that needs none gives Attended no warning, and the warning's words never say the consultation cannot start",
    warningOf(attF) === null && !/cannot start|wait/.test(String(warningOf(w1att)?.words)) && !/cannot start/.test(WARN_WORDS + WARN_WORDS_INACTIVE), { words: warningOf(w1att)?.words });
  // W2: a paper copy (FO-5's Signed offline, written straight to the table) ends the warning; until then it shows.
  const w2 = await book(A, free, R.staffId, lee, -180);
  await clock.set(new Date(w2.startsAt.getTime() - 60 * MIN));
  const s2w = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, w2));
  await clock.set(today);
  const w2before = await warnAt(R, w2.id), w2panelBefore = await svc.forBooking(R, w2.id);
  sql(`set session_replication_role = replica; update fo_retainer set status = 'SIGNED_OFFLINE', offline_at = now(), offline_reason = 'Sample: signed on paper', offline_by = 'staff:${R.staffId}', offline_file_key = 'retainers/' || id::text || '/signed-offline.pdf', offline_file_sha256 = repeat('b', 64) where id = '${s2w?.sent ? s2w.agreementId : ""}'`);
  const w2after = await warnAt(R, w2.id), w2panel = await svc.forBooking(R, w2.id), w2att = await answer(() => bookings.recordAttendance(R, w2.id, { outcome: "COMPLETED" }));
  ok("FO-3c2 W2 pass: once signed on paper, the warning goes: Attended's answer has none and the panel reads signed",
    s2w?.sent === true && !w2after.warned && w2panel.signed === true && w2att.status === 200 && warningOf(w2att) === null, { s2w, w2after, w2panel: w2panel.status, w2att });
  ok("FO-3c2 W2 fail: before the paper copy, the same booking warned and its panel read unsigned", w2before.warned && w2panelBefore.signed === false, { w2before, w2panelBefore: w2panelBefore.status });
  // W3: who may answer is unchanged: a colleague without agent/booking:edit, not the host, is still refused.
  const w3 = await book(A, free, R.staffId, lee, -180);
  const noKey = ctxOf(sid("user-O"), A, keysOf("CASE_OFFICER").filter((k) => k !== "agent/booking:edit"));
  const w3att = await answer(() => bookings.recordAttendance(noKey, w3.id, { outcome: "COMPLETED" }));
  const w3rec = await answer(() => consult.put(noKey, w2.id, RECORD));
  ok("FO-3c2 W3 (permissions unchanged): a colleague without agent/booking:edit who does not host is refused Attended (403 or the one 404) and the consult record, and nothing changes",
    [403, 404].includes(w3att.status) && statusOf(w3.id) === "SCHEDULED" && [403, 404].includes(w3rec.status) && Number(sql(`select count(*) from fo_consult_record where booking_id = '${w2.id}'`)) === 0, { w3att, w3rec });
  // W4: AG-04 Rule 7: the words name no regulator or statute.
  const allWords = [WARN_WORDS, WARN_WORDS_INACTIVE, ...Object.values(CAUSE_WORDS), ...Object.values(NEXT_WORDS), missingWords(["NO_CLIENT_EMAIL", "NO_TEMPLATE", "NO_LICENSED"], true), missingWords(["SENDING"], false)].join(" ");
  ok("FO-3c2 W4 (AG-04 Rule 7): no warning word names a regulator or a statute", !/College|Code|SOR\/|regulat|statute|s\. ?23/i.test(allWords), allWords.slice(0, 200));
} catch (e) {
  fail++; console.log(`FAIL  the suite stopped: ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
  rmSync(WORK, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
