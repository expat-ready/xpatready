// FO-3c part 2 (R1.104; Lead 10's rulings of 23 Nov: W4/W9 block, W4b requireAgreement, W5 signatory, FO-3vr; J-104
// W2-W9; QA-750, QA-751; Code SOR/2022-128 s. 23, Unconfirmed: no counsel). Each case with a passing and a failing side,
// at the services: a scratch database (every migration, this part's included), PF-3's Sample firms and staff (user-R
// licensed hosts the bookings; firm B's user-S), the real booking, consult-record and booking-type services, FilesPort in
// a scratch folder, the fake clock, jobs, mail, audit and signer. No server, no browser, no model call (US$0). Dropped at
// the end.
//   P1  the type's switch (W4b): a follow-up sends none, a stored false sends none, a stored true sends; the settings save it
//   P2  the block (W4): Attended and the consult record refused while unsigned, the booking unchanged; No-show still saved
//   P3  after signing (W9): Attended and the consult record saved; a type that needs none is never held
//   P4  the poller (W2, W5): a booking event in the outbox sends the agreement as its firm, once; a reschedule moves the
//       reminder; each firm read writes its platform.bypass line; a follow-up's event sends none
//   P5  the reads follow the booking's visibility (FO-3vr): another person's booking is the one not-found
//   P6  the signed copy's key: refused before signing, given after, and checked again for whoever asks
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
const { HOLD_WORDS, needsAgreement } = await import("../api/src/front-office/booking/consultation-agreement/gate.ts");
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

  // --------------------------------------------------------------------------------------------------- P2 the block (W4)
  const b2 = await book(A, free, R.staffId, lee, -180), b3 = await book(A, free, R.staffId, lee, -180);   // both over: their attendance question is open
  const s2 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b2)), s3 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b3));
  const att2 = await answer(() => bookings.recordAttendance(R, b2.id, { outcome: "COMPLETED" }));
  const noShow3 = await answer(() => bookings.recordAttendance(R, b3.id, { outcome: "NO_SHOW" }));
  ok("FO-3c2 P2 pass (W4; QA-750): with its agreement sent and unsigned, Attended is refused (409 AGREEMENT_NOT_SIGNED, in words naming the agreement) and the booking stays Scheduled",
    s2?.sent === true && att2.status === 409 && /AGREEMENT_NOT_SIGNED/.test(att2.body) && att2.body.includes(HOLD_WORDS.slice(0, 40)) && statusOf(b2.id) === "SCHEDULED", { s2, att2 });
  ok("FO-3c2 P2 fail: No-show is not the consultation starting: it is saved while the agreement is unsigned", s3?.sent === true && noShow3.status === 200 && statusOf(b3.id) === "NO_SHOW", noShow3);
  // A booking already marked Attended before this part (written straight to the table): its record waits for the agreement too.
  const b4 = await book(A, free, R.staffId, lee, -120);
  const s4 = await db.$transaction(async () => svc.send(A, b4.id).catch(() => null));
  const sentLate = s4?.sent ? s4 : { sent: false };
  await db.foBooking.update({ where: { id: b4.id }, data: { status: "COMPLETED" } });
  const rec4 = await answer(() => consult.put(R, b4.id, RECORD));
  ok("FO-3c2 P2 record: a consult record for an Attended booking whose agreement is unsigned is refused (409 AGREEMENT_NOT_SIGNED) and nothing is stored (or the booking had no agreement to wait for: then the record is saved)",
    sentLate.sent ? rec4.status === 409 && /AGREEMENT_NOT_SIGNED/.test(rec4.body) && Number(sql(`select count(*) from fo_consult_record where booking_id = '${b4.id}'`)) === 0 : rec4.status === 200, { sentLate, rec4 });

  // ------------------------------------------------------------------------------------------------ P3 after signing (W9)
  // Signed during b5's meeting (a link of a meeting that has ended is refused, part 1's break m5), then answered after it.
  const b5 = await book(A, free, R.staffId, pat, -180), today = clock.now();
  await clock.set(new Date(b5.startsAt.getTime() - 10 * MIN));   // sent before the meeting, signed during it (the request's times run forward)
  const s5 = await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, b5));
  const before5 = await answer(() => bookings.recordAttendance(R, b5.id, { outcome: "COMPLETED" }));   // too early: not started
  await clock.set(new Date(b5.startsAt.getTime() + 5 * MIN));
  const held5 = await answer(() => bookings.recordAttendance(R, b5.id, { outcome: "COMPLETED" }));
  const signed5 = s5?.sent ? await signAll(s5.agreementId, "pat@client.example", R) : "";
  await clock.set(today);
  const att5 = await answer(() => bookings.recordAttendance(R, b5.id, { outcome: "COMPLETED" }));
  const rec5 = await answer(() => consult.put(R, b5.id, RECORD));
  ok("FO-3c2 P3 pass (W9): once the client and the firm have signed, Attended is saved and the consult record is accepted",
    signed5 === "SIGNED" && att5.status === 200 && statusOf(b5.id) === "COMPLETED" && rec5.status === 200, { signed5, att5, rec5 });
  ok("FO-3c2 P3 fail: the same booking was refused before signing (409 AGREEMENT_NOT_SIGNED during the meeting; too early before it)",
    before5.status === 409 && /too-early|Not yet/.test(before5.body) && held5.status === 409 && /AGREEMENT_NOT_SIGNED/.test(held5.body), { before5, held5 });
  const bF2 = await book(A, follow, R.staffId, lee, -120);
  await svc.onBookingEvent(eventOf(EVENT.BOOKING_SCHEDULED, bF2));
  const attF = await answer(() => bookings.recordAttendance(R, bF2.id, { outcome: "COMPLETED" }));
  ok("FO-3c2 P3 type: a follow-up (no agreement needed, none sent) is never held: its Attended is saved", attF.status === 200 && statusOf(bF2.id) === "COMPLETED" && agreementsOf(bF2.id) === 0, attF);

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
} catch (e) {
  fail++; console.log(`FAIL  the suite stopped: ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
  rmSync(WORK, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
