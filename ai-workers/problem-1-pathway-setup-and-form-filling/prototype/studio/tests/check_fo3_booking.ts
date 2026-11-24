// FO-3 (BACKLOG row FO-3; contracts §2.2, §7 §2.2; AG-04 v2.1; AG-02 AG-2-10, -26): the booking API. Every line of the
// row's "Done when", each with a passing and a failing case, on PF-0p's fake clock, jobs and mail and the ArrivalPort fake,
// against a scratch database that gets every migration (FO-1b's booking tables and their rules are real). The public door
// is also called over HTTP through a child Nest app (this file with --serve) with the real read guard. No model call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo3_booking.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival, type FakeArrival } from "../ports/arrival.ts";
import { fakeAudit, type AuditPort } from "../ports/audit.ts";
import { FakeClock } from "../ports/clock.ts";
import { EVENT } from "../ports/events.ts";
import { fakeJobs, type FakeJobs, type JobHandler, type JobPort } from "../ports/jobs.ts";
import { fakeMail, type FakeMail } from "../ports/mail.ts";
import { fakeStaff, type StaffContext } from "../ports/staff.ts";
import { copyFirmHoursTo } from "../api/src/front-office/booking-seed.ts";
import { bookingIcs, fold } from "../api/src/front-office/booking/ics.ts";
import { BookingService, bookingPortsWith, Name, PublicBookingBody, type BookingPorts } from "../api/src/front-office/booking/service.ts";
import { computeSlots, wallToUtc } from "../api/src/front-office/booking/slots.ts";
import { issueToken } from "../api/src/front-office/booking/tokens.ts";
import { auditEvent } from "../api/src/platform/audit/audit-event.ts";
import { CLOSED_DAYS, TIME_ZONE, writeSetting } from "../api/src/platform/settings.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const TZ = "America/Toronto";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
/** The thrown HTTP problem's status and body (or null when nothing was thrown). */
const thrown = async (f: () => unknown): Promise<{ status: number; body: Record<string, unknown> } | null> => {
  try { await f(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown; message?: string };
    return x.getStatus ? { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> } : { status: 0, body: { message: String(x.message ?? e) } };
  }
};
/** A Toronto wall time as a moment ("2026-10-26 09:00"). */
const at = (s: string, zone = TZ) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); const r = wallToUtc(y, m, dd, h * 60 + mi, zone); if (!r) throw new Error(`no such time ${s}`); return r; };
const iso = (s: string) => at(s).toISOString();
const has = (slots: { startsAt: string }[], s: string) => slots.some((x) => x.startsAt === iso(s));

if (process.argv.includes("--serve")) await serve();
execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
let server: ChildProcess | null = null;

try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const ws = await db.workspace.create({ data: { key: "fo3-check", label: "FO-3 check" } });
  const firm = (key: string, status: "ACTIVE" | "PAYMENT_HOLD" = "ACTIVE") => db.platformFirm.create({ data: { key, operatingName: `Sample ${key}`, countryCode: "CA", status, contactEmail: `${key}@firm.example` } });
  const [A, B, H] = [await firm("fo3-a"), await firm("fo3-b"), await firm("fo3-hold", "PAYMENT_HOLD")];
  const staff = (firmId: string, n: string, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") => db.platformStaff.create({ data: { firmId, email: `${n}@staff.example`, displayName: `Sample ${n}`, status } });
  const [A1, A2, A3, B1, H1] = [await staff(A.id, "a1"), await staff(A.id, "a2"), await staff(A.id, "a3", "SUSPENDED"), await staff(B.id, "b1"), await staff(H.id, "h1")];
  await copyFirmHoursTo(db, A.id, [A1.id, A2.id, A3.id]);
  await copyFirmHoursTo(db, B.id, [B1.id]);
  await copyFirmHoursTo(db, H.id, [H1.id]);
  await writeSetting(db, { firmId: A.id, key: CLOSED_DAYS.key, value: ["2026-10-28"], by: "seed:fo3", workspaceId: ws.id });
  // Types that need no consultation agreement: this check is about attendance, not the agreement (QA-772: gate.ts holds a type that needs one and has none).
  const type = (firmId: string, slug: string, hosts: string[], extra: Record<string, unknown> = {}) => db.foConsultationType.create({ data: { requireAgreement: false, firmId, slug, name: `Free consultation ${slug}`, modes: ["VIDEO", "PHONE"], hostStaffIds: hosts, minutes: 30, ...extra } });
  const T = {
    base: await type(A.id, "free", [A1.id]),
    team: await type(A.id, "team", [A1.id, A2.id]),
    every15: await type(A.id, "every15", [A1.id], { slotIntervalMinutes: 15 }),
    short: await type(A.id, "short", [A1.id], { windowDays: 2 }),
    susp: await type(A.id, "susp", [A3.id, A2.id]),
    suspOnly: await type(A.id, "susp-only", [A3.id]),
    off: await type(A.id, "retired", [A1.id], { active: false }),
    b: await type(B.id, "free", [B1.id]),
    hold: await type(H.id, "free", [H1.id]),
    race: await type(A.id, "race", [A2.id], { gapAfterMinutes: 0 }),
  };

  const clock = new FakeClock(at("2026-10-26 08:00"));   // Monday, EDT
  const make = (o: Partial<BookingPorts> & { mail?: FakeMail; arrival?: FakeArrival } = {}) => {
    const mail = o.mail ?? fakeMail({ clock }), arrival = o.arrival ?? fakeArrival(), audit = o.audit ?? fakeAudit(), jobs = o.jobs ?? fakeJobs(clock);
    const warnings: string[] = [];
    const svc = new BookingService(db, { audit: audit as AuditPort<never>, clock, jobs, mail, arrival, publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000, ...o.limits }, warn: (m) => warnings.push(m) });
    return { svc, mail, arrival, audit, jobs, warnings };
  };
  const main = make();
  await main.svc.registerJobs();
  const S = main.svc;
  const days = (from: string, to: string) => ({ from: iso(from), to: iso(to), tz: TZ });
  /** A filled form for a slug: the stamp from the slots answer, then 5 s of "typing". */
  const form = async (svc: BookingService, slug: string, startsAt: string, who = "ana", extra: Record<string, unknown> = {}, firmKey = A.key) => {
    const page = await svc.publicSlots(firmKey, slug, {}, "10.0.0.1");
    await clock.advance({ seconds: 5 });
    return { givenNames: "Ana", familyName: `Sample ${who}`, email: `${who}@client.example`, mode: "VIDEO", startsAt: iso(startsAt), timeZone: TZ, consent: true, consentWordingId: page.consent!.wordingId, formStamp: page.formStamp, ...extra };
  };
  /** A public answer with the booking's own row beside it (the public answer carries no ids: the test reads them from
   *  the database by the link's selector). */
  const full = async <R extends { manageToken: string }>(r: R) => {
    const tok = await db.foBookingToken.findUniqueOrThrow({ where: { id: r.manageToken.split(".")[0] } });
    const b = await db.foBooking.findUniqueOrThrow({ where: { id: tok.bookingId } });
    return { ...r, answer: r, id: b.id, staffId: b.staffId, personId: b.personId, prospectId: b.prospectId, sequence: b.sequence };
  };
  const book = async (svc: BookingService, slug: string, startsAt: string, who?: string, extra?: Record<string, unknown>) => full(await svc.publicBook(A.key, slug, await form(svc, slug, startsAt, who, extra), "10.0.0.1"));
  const IDS = ["id", "staffId", "personId", "prospectId", "typeId", "firmId"];
  const noIds = (x: object) => !Object.keys(x).some((k) => IDS.includes(k)) && !JSON.stringify(x).includes(A1.id) && !JSON.stringify(x).includes(A2.id);

  // ------------------------------------------------------------------------------------------------- slots: the rules
  const mon = (await S.publicSlots(A.key, "free", days("2026-10-26 00:00", "2026-10-27 00:00"), "ip")).slots;
  ok("FO-3 slots pass: 12:00 Monday is offered (inside the host's hours, after the 4 h shortest notice from 08:00)", has(mon, "2026-10-26 12:00"), mon.slice(0, 3));
  ok("FO-3 slots fail: 11:30 Monday is inside the shortest notice and not offered", !has(mon, "2026-10-26 11:30"));
  ok("FO-3 slots fail: no slot ends after the host's 17:00 (16:30 is the last start)", has(mon, "2026-10-26 16:30") && !has(mon, "2026-10-26 17:00"));
  ok("FO-3 slots: each slot is labelled in the visitor's zone", mon.every((s) => s.label.endsWith(`(${TZ})`)));
  const wed = (await S.publicSlots(A.key, "free", days("2026-10-28 00:00", "2026-10-30 00:00"), "ip")).slots;
  ok("FO-3 slots fail: a slot on a firm closed day (28 Oct) is not offered", !wed.some((s) => s.startsAt < iso("2026-10-29 00:00")));
  ok("FO-3 slots pass: the next open day (29 Oct) is offered", has(wed, "2026-10-29 09:00"));
  ok("FO-3 slots pass: a 15-minute interval offers 12:15; fail: the default interval (the meeting's length) does not",
    has((await S.publicSlots(A.key, "every15", days("2026-10-26 00:00", "2026-10-27 00:00"), "ip")).slots, "2026-10-26 12:15") && !has(mon, "2026-10-26 12:15"));
  const shortW = (await S.publicSlots(A.key, "short", days("2026-10-26 00:00", "2026-10-31 00:00"), "ip")).slots;
  ok("FO-3 slots pass: inside a 2-day booking window 27 Oct is offered; fail: 29 Oct (beyond it) is not", has(shortW, "2026-10-27 10:00") && !has(shortW, "2026-10-29 10:00"));
  ok("FO-3 slots fail: a type whose only host is suspended offers nothing (AG-4-53)", (await S.publicSlots(A.key, "susp-only", days("2026-10-26 00:00", "2026-11-02 00:00"), "ip")).slots.length === 0);
  const susp = await book(S, "susp", "2026-10-27 15:00", "susp");
  ok("FO-3 slots pass: a type with a suspended host and an active one offers times, and books the active one", susp.staffId === A2.id, susp);
  await db.foTimeOff.create({ data: { firmId: A.id, staffId: A1.id, startsAt: at("2026-10-27 09:00"), endsAt: at("2026-10-27 12:00"), createdBy: "seed:fo3" } });
  const tue = (await S.publicSlots(A.key, "free", days("2026-10-27 00:00", "2026-10-28 00:00"), "ip")).slots;
  ok("FO-3 slots fail: time off (Tue 09:00-12:00) removes 10:00; pass: 13:00 is offered", !has(tue, "2026-10-27 10:00") && has(tue, "2026-10-27 13:00"));

  // DST (AG-4-1 rule 8), on the slot rule itself: 1 Nov 2026 in Toronto repeats 01:00-01:59; 8 Mar 2026 skips 02:00-02:59.
  const dstType = { minutes: 30, gapBeforeMinutes: 0, gapAfterMinutes: 0, minNoticeMinutes: 0, windowDays: 400, slotIntervalMinutes: null, hostStaffIds: ["h"] };
  const night = (date: string, now: string) => computeSlots({ type: dstType, hours: new Map([["h", [{ weekday: 0, startMinute: 0, endMinute: 240, timeZone: TZ }]]]), busy: new Map(), timeOff: new Map(), closedDays: [], firmZone: TZ, now: new Date(now), from: new Date(`${date}T00:00:00Z`), to: new Date(`${date}T23:59:00Z`) });
  const fall = night("2026-11-01", "2026-10-01T00:00:00Z");
  const label = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  ok("FO-3 DST pass: on 1 Nov 2026 (America/Toronto) 01:30 is offered once, at its first moment (05:30Z)", fall.filter((s) => label(s.startsAt) === "01:30").length === 1 && fall.some((s) => s.startsAt.toISOString() === "2026-11-01T05:30:00.000Z"), fall.map((s) => s.startsAt.toISOString()));
  ok("FO-3 DST fail: the second 01:30 (06:30Z) is not offered again", !fall.some((s) => s.startsAt.toISOString() === "2026-11-01T06:30:00.000Z"));
  const spring = night("2026-03-08", "2026-02-01T00:00:00Z");
  ok("FO-3 DST fail: on 8 Mar 2026 the skipped 02:00 and 02:30 are not offered; pass: 03:00 is", !spring.some((s) => ["02:00", "02:30"].includes(label(s.startsAt))) && spring.some((s) => label(s.startsAt) === "03:00") && spring.length === 6, spring.map((s) => label(s.startsAt)));

  // ------------------------------------------------------------------------------------- one door, one identical 404
  const nf = async (f: () => unknown) => JSON.stringify((await thrown(f))?.body ?? null);
  const nfs = [await nf(() => S.publicSlots("no-such-firm", "free", {}, "ip")), await nf(() => S.publicSlots(A.key, "no-such-type", {}, "ip")), await nf(() => S.publicSlots(A.key, "retired", {}, "ip")), await nf(() => S.publicSlots(H.key, "free", {}, "ip"))];
  ok("FO-3 door: an unknown firm, an unknown slug, an inactive type and a firm on payment hold give the identical 404", new Set(nfs).size === 1 && JSON.parse(nfs[0]).status === 404, nfs);
  ok("FO-3 door fail: a firm key with a NUL byte or capitals gives the same identical 404 (break B-7)", await nf(() => S.publicSlots("fo3-a\u0000", "free", {}, "ip")) === nfs[0] && await nf(() => S.publicSlots("FO3-A", "free", {}, "ip")) === nfs[0]);
  ok("FO-3 door pass: a known firm and active type answers its page (no host named)", !JSON.stringify(await S.publicSlots(A.key, "free", {}, "ip")).includes(A1.id));

  // ----------------------------------------------------------------------------------------------- booking: the form
  const ref = async (body: Record<string, unknown>) => (await thrown(async () => S.publicBook(A.key, "free", body, "ip")))?.status;
  const good = await form(S, "free", "2026-10-29 09:00", "form");
  // FO-3pa: the tick is optional (AG-4-19 rule 3); a tick without the wording it agreed to is still refused.
  ok("FO-3 form fail: the consent tick without its wording id → 422", await ref({ ...good, consentWordingId: undefined }) === 422);
  ok("FO-3 form fail: a missing last name → 422", await ref({ ...good, familyName: "" }) === 422);
  ok("FO-3 form fail: phone mode without a phone → 422", await ref({ ...good, mode: "PHONE" }) === 422);
  ok("FO-3 form fail: a mode the type does not offer → 422", await ref({ ...good, mode: "IN_PERSON" }) === 422);
  ok("FO-3 form fail: the honeypot filled → 422", await ref({ ...good, website: "http://spam.example" }) === 422);
  ok("FO-3 form fail: another consent wording than the firm's → 409", await ref({ ...good, consentWordingId: "00000000-0000-4000-8000-000000000bad" }) === 409);
  ok("FO-3 form fail: a forged form stamp → 422", await ref({ ...good, formStamp: `${clock.now().getTime() - 60_000}.forged` }) === 422);
  const fast = await S.publicSlots(A.key, "free", {}, "ip");
  ok("FO-3 form fail: sent 1 s after the page loaded (minimum fill time) → 422", await ref({ ...good, formStamp: fast.formStamp }) === 422);
  ok("FO-3 form fail: an invisible-only name, a right-to-left override, U+2028 → 422 (break B-9)", await ref({ ...good, givenNames: "\u200b" }) === 422 && await ref({ ...good, familyName: "Ann\u202eX" }) === 422 && await ref({ ...good, familyName: "A\u2028B" }) === 422);
  ok("FO-3 form fail: a Hangul filler, RLM, ALM or tag characters → 422 (break B-9 round 2)", await ref({ ...good, givenNames: "\u3164" }) === 422 && await ref({ ...good, givenNames: "Ana\u200f" }) === 422 && await ref({ ...good, givenNames: "Ana\u061c" }) === 422 && await ref({ ...good, givenNames: "Ana\u{e0041}" }) === 422);
  ok("FO-3 form pass: a name in another script (Arabic, Korean, accented Latin) is taken by the name rule", ["\u0639\u0644\u064a", "\uc9c0\ubbfc", "Zo\u00eb", "O'Brien-Smith"].every((n) => PublicBookingBody.shape.givenNames.safeParse(n).success) && !PublicBookingBody.shape.givenNames.safeParse("\u3164").success);
  ok("FO-3 form fail: a zone the database does not take (Etc/GMT0) → 422, never 500 (break B-2)", await ref({ ...good, timeZone: "Etc/GMT0" }) === 422);
  ok("FO-3 form fail: a start in year 0001 → 422; slots asked from year 0001 → 422 (break B-2)", await ref({ ...good, startsAt: "0001-01-01T10:00:00Z" }) === 422 && (await thrown(() => S.publicSlots(A.key, "free", { from: "0001-01-01T00:00:00Z" }, "ip")))?.status === 422);
  ok("FO-3 form fail: a line break in a name → 422 (never 500)", await ref({ ...good, givenNames: "Ana\r\nBcc: x@y.example" }) === 422);
  const phoneOk = await full(await S.publicBook(A.key, "free", { ...good, mode: "PHONE", phone: "+1 416 555 0100" }, "ip"));
  const caps = await full(await S.publicBook(A.key, "free", { ...(await form(S, "free", "2026-10-29 11:00", "caps")), timeZone: "America/TORONTO" }, "ip"));
  ok("FO-3 form pass: America/TORONTO is kept in IANA's spelling, America/Toronto (break B-10)", (await db.foBooking.findUniqueOrThrow({ where: { id: caps.id } })).bookerTimeZone === TZ);
  const lim3 = make({ limits: { bookPerFirm: 3 } });
  const realForm = await form(lim3.svc, "free", "2026-10-29 10:00", "notblocked");
  for (let i = 0; i < 10; i++) await thrown(() => lim3.svc.publicBook(A.key, "free", {}, `198.51.100.${i}`));
  // B-3 round 2: well-formed, stamped forms for a time never offered (one stamp reused) do not count either.
  for (let i = 0; i < 10; i++) await thrown(() => lim3.svc.publicBook(A.key, "free", { ...realForm, startsAt: iso("2026-11-01 08:00"), email: `bot${i}@client.example` }, `198.51.100.${50 + i}`));
  ok("FO-3 door pass: empty posts and stamped forms for a never-offered time from 20 addresses do not use up the firm's limit; a real booking still goes through (break B-3)", (await lim3.svc.publicBook(A.key, "free", realForm, "203.0.113.9")).status === "SCHEDULED");
  for (const t of ["2026-10-29 12:00", "2026-10-29 13:00"]) await lim3.svc.publicBook(A.key, "free", { ...(await form(lim3.svc, "free", t, `fill${t.slice(-5, -3)}`)) }, `203.0.113.${t.slice(-5, -3)}`);
  ok("FO-3 door fail: once the firm's limit (3 here) of real bookings is reached, the next well-formed form → 429", (await thrown(async () => lim3.svc.publicBook(A.key, "free", await form(lim3.svc, "free", "2026-10-29 14:00", "over"), "203.0.113.77")))?.status === 429);
  const reads = make({ limits: { slotsPerIp: 2 } });
  for (let i = 0; i < 30; i++) for (let k = 0; k < 2; k++) await reads.svc.publicSlots(A.key, "free", {}, `192.0.2.${i}`);
  ok("FO-3 door pass: 30 addresses reading the page to their own limit never close it for a new visitor (break R2-1); fail: the third read from one of them → 429",
    (await reads.svc.publicSlots(A.key, "free", {}, "192.0.2.200")).slots.length > 0 && (await thrown(() => reads.svc.publicSlots(A.key, "free", {}, "192.0.2.1")))?.status === 429);
  ok("FO-3 door: the public booking answer names no host, person, prospect or type (contracts §0.6); fail-proof: the row has them", noIds(phoneOk.answer) && !!phoneOk.staffId && !!phoneOk.personId, phoneOk.answer);
  ok("FO-3 form pass: phone mode with a phone, consent ticked → booked SCHEDULED", phoneOk.status === "SCHEDULED" && phoneOk.mode === "PHONE" && !!phoneOk.manageToken, phoneOk);

  // ------------------------------------------------------------------------------------- 20 at once for one slot
  const race = make();
  const raceForms = await Promise.all(Array.from({ length: 20 }, (_, i) => form(race.svc, "race", "2026-11-02 10:00", `race${i}`)));
  await clock.advance({ seconds: 5 });
  const results = await Promise.allSettled(raceForms.map((f) => race.svc.publicBook(A.key, "race", f, "ip")));
  const won = results.filter((r) => r.status === "fulfilled").length;
  const lost = results.filter((r) => r.status === "rejected" && (r.reason as { getStatus?: () => number }).getStatus?.() === 409 && ((r.reason as { getResponse: () => { code?: string } }).getResponse().code === "SLOT_TAKEN")).length;
  ok("FO-3 race: 20 parallel requests for one slot → exactly one booked, 19 answered 409 SLOT_TAKEN", won === 1 && lost === 19, { won, lost, other: results.filter((r) => r.status === "rejected").map((r) => { const x = (r as PromiseRejectedResult).reason as { getResponse?: () => unknown }; return x.getResponse ? JSON.stringify(x.getResponse()).slice(0, 200) : String(x).slice(0, 200); }).filter((t) => !t.includes("SLOT_TAKEN")).slice(0, 3) });
  ok("FO-3 race: one row in the database for that host and time", await db.foBooking.count({ where: { firmId: A.id, typeId: T.race.id, startsAt: at("2026-11-02 10:00") } }) === 1);

  // --------------------------------------------------------------------------------------- gaps and the first free host
  const g = await book(S, "free", "2026-10-30 13:00", "gap");
  const fri = (await S.publicSlots(A.key, "free", days("2026-10-30 00:00", "2026-10-31 00:00"), "ip")).slots;
  ok("FO-3 gaps fail: with 10 min after a 13:00 booking, the host's 13:30 is not offered; pass: 14:00 is", g.staffId === A1.id && !has(fri, "2026-10-30 13:30") && has(fri, "2026-10-30 14:00"));
  const t1 = await book(S, "team", "2026-10-30 13:00", "team1");
  const t2 = await book(S, "team", "2026-10-30 15:00", "team2");
  ok("FO-3 first free host: A1 is busy at 13:00 → the team booking goes to A2; pass: at 15:00 the first listed host (A1) takes it", t1.staffId === A2.id && t2.staffId === A1.id, [t1.staffId, t2.staffId]);

  // ---------------------------------------------------------------------------------- hours never move a booking
  const before = await db.foBooking.findUniqueOrThrow({ where: { id: g.id } });
  await db.foAvailability.deleteMany({ where: { firmId: A.id, staffId: A1.id, weekday: 5 } });
  const after = await db.foBooking.findUniqueOrThrow({ where: { id: g.id } });
  ok("FO-3 hours pass: removing the host's Friday hours leaves the Friday booking as it was", after.startsAt.getTime() === before.startsAt.getTime() && after.status === before.status && after.sequence === before.sequence);
  ok("FO-3 hours fail: the change took effect for new bookings (no Friday slot for A1 any more)", (await S.publicSlots(A.key, "free", days("2026-11-06 00:00", "2026-11-07 00:00"), "ip")).slots.length === 0);
  await copyFirmHoursTo(db, A.id, [A1.id]);   // back (Friday only was removed, so nothing else is copied)
  ok("FO-3 hours: the copy back is refused for a person who still has hours (FO-1b's rule), so Friday stays empty", (await S.publicSlots(A.key, "free", days("2026-11-06 00:00", "2026-11-07 00:00"), "ip")).slots.length === 0);
  await db.foAvailability.create({ data: { firmId: A.id, staffId: A1.id, weekday: 5, startMinute: 540, endMinute: 1020, timeZone: TZ } });

  // ------------------------------------------------------------------------------------------- the arrival path
  const arr = make();
  const n1 = await book(arr.svc, "free", "2026-11-03 09:00", "newbie");
  ok("FO-3 arrival pass: a new email runs the arrival path once, keyed booking:<id>, and makes one lead", arr.arrival.calls.length === 1 && arr.arrival.calls[0].key === `booking:${n1.id}` && arr.arrival.leads.length === 1 && n1.personId === arr.arrival.calls[0].result.personId);
  const pros = arr.arrival.addProspect(A.id, "pat@client.example", "ENGAGED");
  const p1 = await book(arr.svc, "free", "2026-11-03 10:00", "pat");
  const p2 = await book(arr.svc, "free", "2026-11-03 11:00", "pat");
  const moved = arr.arrival.prospects.find((p) => p.id === pros.id)!;
  ok("FO-3 arrival: a booker with an open prospect makes no new lead (still 1 lead)", arr.arrival.leads.length === 1, arr.arrival.leads);
  ok("FO-3 arrival: the prospect moves to Consult once, with the cause \"consult booked\" (a second booking moves nothing)", moved.stage === "CONSULT" && moved.causes.length === 1 && moved.causes[0] === "consult booked" && p1.prospectId === pros.id && p2.prospectId === pros.id, moved);
  arr.arrival.addProspect(A.id, "two@client.example", "NEW"); arr.arrival.addProspect(A.id, "two@client.example", "ENGAGED");
  const two = await book(arr.svc, "free", "2026-11-03 13:00", "two");
  ok("FO-3 arrival fail: a person with two open prospects moves neither, and the booking names no prospect", two.prospectId === null && arr.arrival.prospects.filter((p) => p.causes.length).length === 1);
  const arrFail = make({ arrival: fakeArrival({ failOn: () => true }) });
  ok("FO-3 arrival fail: a failing arrival path rolls the booking back (nothing saved)", (await thrown(async () => book(arrFail.svc, "free", "2026-11-03 14:00", "rollback"))) !== null && await db.foBooking.count({ where: { firmId: A.id, startsAt: at("2026-11-03 14:00") } }) === 0);

  // --------------------------------------------------------------------------------------------- audit and outbox
  const aud = make({ audit: fakeAudit({ failOn: (e) => e.action === "booking.scheduled" }) });
  const evBefore = await db.moduleEvent.count();
  ok("FO-3 audit fail: a forced audit failure rolls the booking back (no booking, no token, no event)",
    (await thrown(async () => book(aud.svc, "free", "2026-11-03 15:00", "audfail"))) !== null && await db.foBooking.count({ where: { firmId: A.id, startsAt: at("2026-11-03 15:00") } }) === 0 && await db.moduleEvent.count() === evBefore);
  const real = make({ audit: auditEvent as AuditPort<never> });
  const r1 = await book(real.svc, "free", "2026-11-03 15:00", "audok");
  const lines = await db.auditEvent.findMany({ where: { entityKey: r1.id } });
  ok("FO-3 audit pass: the booking wrote one audit_event line in its transaction (real interim adapter, platform-audit workspace)", lines.length === 1 && lines[0].action === "booking.scheduled" && lines[0].actor === "system:booking-page" && !JSON.stringify(lines[0].detail).includes("@"), lines);
  const ev = await db.moduleEvent.findMany({ where: { subjectId: r1.id } });
  ok("FO-3 event: one booking.scheduled outbox row, key <id>:0, ids only (no name or email)", ev.length === 1 && ev[0].type === EVENT.BOOKING_SCHEDULED && (ev[0].payload as { key: string }).key === `${r1.id}:0` && !JSON.stringify(ev[0].payload).includes("@"), ev);
  ok("FO-3 audit: each booking made so far wrote exactly one booking.scheduled line (main service)", [susp, phoneOk, caps, g, t1, t2].every((b) => (main.audit as ReturnType<typeof fakeAudit>).entries.filter((e) => e.entityKey === b.id && e.action === "booking.scheduled").length === 1));

  // ------------------------------------------------------------------------------- mail after commit, never losing
  const broken = make({ mail: fakeMail({ failOn: () => true }) });
  await broken.svc.registerJobs();
  const mb = await book(broken.svc, "free", "2026-11-03 16:00", "nomail");
  await (broken.jobs as FakeJobs).runDue();
  ok("FO-3 mail pass: a throwing mail adapter still saves the booking (SCHEDULED in the database); the email jobs fail, for the runner to retry (FO-3f m3)",
    (await db.foBooking.findUniqueOrThrow({ where: { id: mb.id } })).status === "SCHEDULED" && (broken.jobs as FakeJobs).jobs.filter((j) => j.key.startsWith(`booking:${mb.id}:0:mail-`) && j.status === "failed").length === 2, (broken.jobs as FakeJobs).jobs.filter((j) => j.name === "booking.mail"));
  await (main.jobs as FakeJobs).runDue();
  const conf = main.mail.inbox("form@client.example");
  const linkOf = (text: string) => /\/manage#([^\s]+)/.exec(text)?.[1] ?? "";
  ok("FO-3 mail pass: the booker's confirmation carries a live self-service link to this booking and the time in their zone; fail: it holds no host id",
    conf.length === 1 && conf[0].text.includes(`/book/${A.key}/manage#`) && (await S.manageView(linkOf(conf[0].text), "ip")).startsAt === phoneOk.startsAt && conf[0].text.includes(`(${TZ})`) && !conf[0].text.includes(A1.id), conf[0]?.text);

  // ---------------------------------------------------------------------------------------------------- the invite
  const icsOf = (m: { attachments?: { bytes: Uint8Array }[] }) => new TextDecoder().decode(m.attachments![0].bytes);
  const inv = icsOf(conf[0]);
  ok("FO-3 ics: METHOD:REQUEST, a stable UID, SEQUENCE:0, DTSTART in UTC, CRLF lines", /METHOD:REQUEST\r\n/.test(inv) && inv.includes(`UID:${phoneOk.id}@booking.expatready.com`) && inv.includes("SEQUENCE:0\r\n") && inv.includes(`DTSTART:${iso("2026-10-29 09:00").replace(/[-:]/g, "").replace(".000", "")}`), inv);
  const unfolded = inv.replace(/\r\n /g, "");
  ok("FO-3 ics fail: no answer the person typed is inside (no phone; the booker's email only on the attendee line)", !unfolded.includes("+14165550100") && (unfolded.match(/form@client\.example/g) ?? []).length === 1 && /ATTENDEE[^\r]*form@client\.example/.test(unfolded), unfolded);
  const long = fold(`DESCRIPTION:${"é".repeat(60)}`);
  ok("FO-3 ics: lines fold at 75 octets without splitting a character", long.split("\r\n ").every((l, i) => Buffer.byteLength(l) <= (i ? 74 : 75)) && long.replace(/\r\n /g, "") === `DESCRIPTION:${"é".repeat(60)}`);
  ok("FO-3 ics: text is escaped (comma, semicolon, newline)", bookingIcs({ bookingId: phoneOk.id, sequence: 1, method: "CANCEL", startsAt: new Date(), endsAt: new Date(), stamp: new Date(), summary: "a,b;c\nd", description: "x", organizer: { name: "F", email: "f@x.example" }, attendee: { name: "P", email: "p@x.example" } }).includes("SUMMARY:a\\,b\\;c\\nd"));

  // ------------------------------------------------------------------------------------------ self-service tokens
  const sv = await book(S, "free", "2026-11-04 10:00", "self");
  await (main.jobs as FakeJobs).runDue();   // its emails (keyed booking:<id>:0:mail-*) are sent
  const second = await db.$transaction((tx) => issueToken(tx, A.id, sv.id, new Date(sv.endsAt)));
  ok("FO-3 tokens pass: two live links for one booking both open it", (await S.manageView(sv.manageToken, "ip")).status === "SCHEDULED" && (await S.manageView(second, "ip")).status === "SCHEDULED");
  // M2 (review): a reschedule to the booking's own time writes nothing: no audit line, no event, the links and reminders stay.
  const evSame = await db.moduleEvent.count({ where: { subjectId: sv.id } }), audSame = (main.audit as ReturnType<typeof fakeAudit>).entries.length;
  const same = await S.selfReschedule(sv.manageToken, { startsAt: iso("2026-11-04 10:00") }, "ip");
  ok("FO-3 reschedule: to its own time → no event, no audit line, sequence 0, both links still live, the reminders still waiting",
    same.status === "SCHEDULED" && same.manageToken === sv.manageToken && await db.moduleEvent.count({ where: { subjectId: sv.id } }) === evSame && (main.audit as ReturnType<typeof fakeAudit>).entries.length === audSame
      && (await db.foBooking.findUniqueOrThrow({ where: { id: sv.id } })).sequence === 0 && (await S.manageView(second, "ip")).status === "SCHEDULED"
      && (main.jobs as ReturnType<typeof fakeJobs>).jobs.filter((j) => j.key.startsWith(`booking:${sv.id}:0:`) && j.status === "waiting").length === 3);
  const mv1 = await full(await S.selfReschedule(sv.manageToken, { startsAt: iso("2026-11-04 11:00") }, "ip"));
  await (main.jobs as FakeJobs).runDue();   // the first move's email goes before the second move (a stale one is not sent: FO-3f m3)
  ok("FO-3 door: the public reschedule answer names no host, person, prospect or type", noIds(mv1.answer), mv1.answer);
  const nfBody = await nf(() => S.manageView(sv.manageToken, "ip"));
  ok("FO-3 tokens fail: after a reschedule both old links give the identical not-found; pass: the new link works",
    nfBody === nfs[0] && await nf(() => S.manageView(second, "ip")) === nfs[0] && (await S.manageView(mv1.manageToken, "ip")).status === "RESCHEDULED", nfBody);
  const mv2 = await full(await S.selfReschedule(mv1.manageToken, { startsAt: iso("2026-11-04 14:00") }, "ip"));
  ok("FO-3 reschedule pass: a RESCHEDULED booking reschedules again (sequence 2); the host is kept when free", mv2.status === "RESCHEDULED" && mv2.sequence === 2 && mv2.staffId === A1.id, mv2);
  ok("FO-3 reschedule fail: to a time that is not offered (Sunday) → 409 SLOT_TAKEN with fresh times", (await thrown(() => S.selfReschedule(mv2.manageToken, { startsAt: iso("2026-11-08 10:00") }, "ip")))?.body.code === "SLOT_TAKEN");
  await (main.jobs as FakeJobs).runDue();
  const upd = main.mail.inbox("self@client.example");
  ok("FO-3 ics: the update keeps the UID and carries SEQUENCE:2", upd.length === 3 && icsOf(upd[2]).includes(`UID:${sv.id}@booking.expatready.com`) && icsOf(upd[2]).includes("SEQUENCE:2\r\n"), upd.map((m) => m.subject));
  const garbage = await nf(() => S.manageView("not-a-token", "ip")), forged = await nf(() => S.manageView(`${mv2.manageToken.split(".")[0]}.${"A".repeat(43)}`, "ip"));
  ok("FO-3 tokens fail: a malformed token and a right selector with a wrong verifier give the identical not-found", garbage === nfs[0] && forged === nfs[0]);
  const cxAnswer = await S.selfCancel(mv2.manageToken, "ip");
  await (main.jobs as FakeJobs).runDue();
  const cx = { ...cxAnswer, ...(await db.foBooking.findUniqueOrThrow({ where: { id: sv.id }, select: { sequence: true } })) };
  ok("FO-3 door: the public cancel answer names no host, person, prospect or type", noIds(cxAnswer), cxAnswer);
  ok("FO-3 cancel pass: cancelled by link (sequence 3); METHOD:CANCEL with the same UID", cx.status === "CANCELLED" && cx.sequence === 3 && /METHOD:CANCEL\r\n/.test(icsOf(main.mail.inbox("self@client.example")[3])) && icsOf(main.mail.inbox("self@client.example")[3]).includes(`UID:${sv.id}@`));
  ok("FO-3 cancel fail: the used link now gives the identical not-found; pass: the freed 14:00 is offered again",
    await nf(() => S.selfCancel(mv2.manageToken, "ip")) === nfs[0] && has((await S.publicSlots(A.key, "free", days("2026-11-04 00:00", "2026-11-05 00:00"), "ip")).slots, "2026-11-04 14:00"));

  // a firm on hold answers its links like its page (break B-5)
  const held = await book(S, "free", "2026-11-04 15:00", "held");
  await db.platformFirm.update({ where: { id: A.id }, data: { status: "PAYMENT_HOLD" } });
  const heldNf = await nf(() => S.manageView(held.manageToken, "ip")), heldMove = (await thrown(() => S.selfReschedule(held.manageToken, { startsAt: iso("2026-11-04 16:00") }, "ip")))?.status;
  await db.platformFirm.update({ where: { id: A.id }, data: { status: "ACTIVE" } });
  ok("FO-3 tokens fail: while the firm is on payment hold its links give the identical not-found and move nothing; pass: back to Active, the link works",
    heldNf === nfs[0] && heldMove === 404 && (await db.foBooking.findUniqueOrThrow({ where: { id: held.id } })).startsAt.getTime() === at("2026-11-04 15:00").getTime() && (await S.manageView(held.manageToken, "ip")).status === "SCHEDULED");

  // the self-service limit (4 h) and the end of the meeting
  const lim = await book(S, "free", "2026-11-05 10:00", "limit");
  const back = clock.now();
  await clock.set(at("2026-11-05 05:30"));
  ok("FO-3 limit pass: 4 h 30 min before, the link can still change it", (await S.manageView(lim.manageToken, "ip")).canChange === true);
  await clock.set(at("2026-11-05 07:00"));
  const view = await S.manageView(lim.manageToken, "ip");
  ok("FO-3 limit fail: 3 h before, the page says to reply or call, and a reschedule or cancel is refused 409",
    view.canChange === false && /reply to your confirmation email or call/.test(view.message ?? "") && (await thrown(() => S.selfCancel(lim.manageToken, "ip")))?.body.code === "SELF_SERVICE_CLOSED" && (await thrown(() => S.selfReschedule(lim.manageToken, { startsAt: iso("2026-11-05 15:00") }, "ip")))?.status === 409);
  await clock.set(at("2026-11-05 10:31"));
  ok("FO-3 tokens fail: after the meeting's end the link gives the identical not-found", await nf(() => S.manageView(lim.manageToken, "ip")) === nfs[0]);
  await clock.set(back);

  // -------------------------------------------------------------------- reminders, attendance question, no auto no-show
  const rem = make();
  await rem.svc.registerJobs();
  const ctxA = fakeStaff({ firmId: A.id, firmKey: A.key, staffId: A1.id, keys: ["agent/booking:create", "agent/booking:edit", "agent/booking:list", "agent/prospect:assign"] });   // FO-3vr: AG-4-67 rule 3, a not-linked booking needs the unassigned-lead rule
  await clock.set(at("2026-11-02 08:00"));
  const rb = await book(rem.svc, "free", "2026-11-06 10:00", "remind");
  const scheduled = rem.jobs as ReturnType<typeof fakeJobs>;
  ok("FO-3 reminders: 24 h and 1 h reminders and the attendance question are queued on JobPort with sequence keys",
    ["reminder-24h", "reminder-1h", "attendance"].every((k) => scheduled.jobs.some((j) => j.key === `booking:${rb.id}:0:${k}`)) && scheduled.jobs.find((j) => j.key.endsWith(":0:reminder-24h"))!.runAt.getTime() === at("2026-11-05 10:00").getTime());
  await clock.set(at("2026-11-05 10:01"));
  const remMails = () => rem.mail.inbox("remind@client.example").filter((m) => m.templateKey?.startsWith("booking.reminder"));
  ok("FO-3 reminders pass: the 24 h reminder is sent at its time", remMails().length === 1 && remMails()[0].templateKey === "booking.reminder_24h");
  const moved2 = await rem.svc.staffReschedule(ctxA, rb.id, { startsAt: iso("2026-11-06 14:00") });
  await clock.set(at("2026-11-06 09:30"));
  const oneHour = () => remMails().filter((m) => m.templateKey === "booking.reminder_1h");
  ok("FO-3 reminders fail: after a reschedule the old 1 h reminder (09:00) is not sent", oneHour().length === 0, remMails().map((m) => m.templateKey));
  ok("FO-3 reminders: the moved meeting (Fri 14:00) got its own 24 h reminder (Thu 14:00)", remMails().filter((m) => m.templateKey === "booking.reminder_24h").length === 2);
  await clock.set(at("2026-11-06 13:01"));
  ok("FO-3 reminders pass: the new 1 h reminder (13:00) is sent once", oneHour().length === 1 && moved2.sequence === 1);
  await clock.set(at("2026-11-06 15:01"));
  ok("FO-3 attendance: 30 min after the end the question is shown, not mailed (AG-4-39 rule 2; FO-3m DW6)", !rem.mail.inbox("a1@staff.example").some((m) => m.templateKey === "booking.attendance_ask"));
  ok("FO-3 attendance: the question is due on the host's list", (await rem.svc.attendanceDue(ctxA)).some((b) => b.id === rb.id));
  await clock.set(at("2026-11-10 12:00"));
  ok("FO-3 attendance fail: four days later nothing has marked it (still RESCHEDULED, no no-show event)",
    (await db.foBooking.findUniqueOrThrow({ where: { id: rb.id } })).status === "RESCHEDULED" && await db.moduleEvent.count({ where: { subjectId: rb.id, type: EVENT.BOOKING_NO_SHOW } }) === 0);
  const att = await rem.svc.recordAttendance(ctxA, rb.id, { outcome: "COMPLETED" });
  const ns = await rem.svc.recordAttendance(ctxA, rb.id, { outcome: "NO_SHOW" });
  ok("FO-3 attendance pass: a person answers Attended (booking.completed), then changes it to No-show (booking.no_show)",
    att.status === "COMPLETED" && ns.status === "NO_SHOW" && await db.moduleEvent.count({ where: { subjectId: rb.id, type: { in: [EVENT.BOOKING_COMPLETED, EVENT.BOOKING_NO_SHOW] } } }) === 2);
  await clock.set(back);
  const early = await book(S, "free", "2026-11-09 10:00", "early");
  ok("FO-3 attendance fail: before the meeting has started → 409", (await thrown(() => S.recordAttendance(ctxA, early.id, { outcome: "COMPLETED" })))?.status === 409);

  // ---------------------------------------------------------------------------------- staff services and the firm wall
  const ctxA2 = fakeStaff({ firmId: A.id, firmKey: A.key, staffId: A2.id, keys: [] });
  const ctxB = fakeStaff({ firmId: B.id, firmKey: B.key, staffId: B1.id, keys: ["agent/booking:create", "agent/booking:edit", "agent/booking:list"] });
  const pid = main.arrival.addPerson(A.id, { givenNames: "Lee", familyName: "Sample", email: "lee@client.example" });
  const sb = { typeId: T.base.id, personId: pid, mode: "VIDEO", startsAt: iso("2026-11-09 11:00"), timeZone: TZ };
  ok("FO-3 staff fail: creating without agent/booking:create → 403", (await thrown(() => S.staffCreate(ctxA2, sb)))?.status === 403);
  const sc = await S.staffCreate(ctxA, sb);
  // M4 (review): a staff booking moves the person's only open prospect to Consult through the port; the prospect is never
  // taken from the body; a person of another firm is 404.
  const kim = main.arrival.addPerson(A.id, { givenNames: "Kim", familyName: "Sample", email: "kim@client.example" });
  const kimPros = main.arrival.addProspect(A.id, "kim@client.example", "ENGAGED");
  const kb = await S.staffCreate(ctxA, { ...sb, personId: kim, startsAt: iso("2026-11-09 13:00") });
  const kimNow = main.arrival.prospects.find((p) => p.id === kimPros.id)!;
  ok("FO-3 staff pass: a staff booking moves the person's only open prospect to Consult with its cause, and names it", kb.prospectId === kimPros.id && kimNow.stage === "CONSULT" && kimNow.causes.join() === "consult booked", { kb, kimNow });
  const bPerson = main.arrival.addPerson(B.id, { givenNames: "Bo", familyName: "Sample", email: "bo@client.example" });
  ok("FO-3 staff fail: a prospect id in the body is refused (422); a person of firm B booked by firm A → 404, nothing saved",
    (await thrown(() => S.staffCreate(ctxA, { ...sb, prospectId: kimPros.id, startsAt: iso("2026-11-09 14:00") })))?.status === 422
      && (await thrown(() => S.staffCreate(ctxA, { ...sb, personId: bPerson, startsAt: iso("2026-11-09 14:00") })))?.status === 404
      && await db.foBooking.count({ where: { firmId: A.id, startsAt: at("2026-11-09 14:00") } }) === 0);
  ok("FO-3 staff fail: a booking id that is not a uuid → 404 (never 500)", (await thrown(() => S.staffGet(ctxA, "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz")))?.status === 404 && (await thrown(() => S.staffCancel(ctxA, "------------------------------------")))?.status === 404);

  // M3 (review): every change writes one audit line in its transaction; a forced audit failure rolls each one back.
  const auditLines = (id: string, action: string) => (main.audit as ReturnType<typeof fakeAudit>).entries.filter((e) => e.entityKey === id && e.action === action).length;
  for (const [action, run, check] of [
    ["booking.rescheduled", (svc: BookingService) => svc.staffReschedule(ctxA, kb.id, { startsAt: iso("2026-11-09 15:00") }), async () => (await db.foBooking.findUniqueOrThrow({ where: { id: kb.id } })).startsAt.getTime() === at("2026-11-09 13:00").getTime()],
    ["booking.cancelled", (svc: BookingService) => svc.staffCancel(ctxA, kb.id), async () => (await db.foBooking.findUniqueOrThrow({ where: { id: kb.id } })).status !== "CANCELLED"],
    ["booking.completed", (svc: BookingService) => svc.recordAttendance(ctxA, susp.id, { outcome: "COMPLETED" }), async () => (await db.foBooking.findUniqueOrThrow({ where: { id: susp.id } })).status === "SCHEDULED"],
  ] as const) {
    const id = action === "booking.completed" ? susp.id : kb.id;
    if (action === "booking.completed") await clock.set(at("2026-10-27 15:31"));   // after the meeting began
    const failing = make({ audit: fakeAudit({ failOn: (e) => e.action === action }), arrival: main.arrival });
    const ev0 = await db.moduleEvent.count({ where: { subjectId: id } });
    ok(`FO-3 audit fail: a forced audit failure on ${action} rolls it back (row unchanged, no event)`, String((await thrown(() => run(failing.svc)))?.body.message ?? "").includes("forced audit failure") && await check() && await db.moduleEvent.count({ where: { subjectId: id } }) === ev0);
    await run(S);
    ok(`FO-3 audit pass: ${action} wrote exactly one audit line and one event`, auditLines(id, action) === 1 && await db.moduleEvent.count({ where: { subjectId: id } }) === ev0 + 1, auditLines(id, action));
    if (action === "booking.completed") await clock.set(back);
  }
  ok("FO-3 staff pass: a staff member with the key books for a person (no arrival run, audit actor staff:<id>)", sc.status === "SCHEDULED" && sc.personId === pid && (main.audit as ReturnType<typeof fakeAudit>).entries.at(-1)?.actor === `staff:${A1.id}`);
  ok("FO-3 staff fail: firm B's staff reading, moving or cancelling firm A's booking → 404 (never 403)",
    (await thrown(() => S.staffGet(ctxB, sc.id)))?.status === 404 && (await thrown(() => S.staffCancel(ctxB, sc.id)))?.status === 404 && (await thrown(() => S.staffReschedule(ctxB, sc.id, { startsAt: iso("2026-11-09 13:00") })))?.status === 404);
  ok("FO-3 staff fail: firm B cannot book firm A's type (404)", (await thrown(() => S.staffCreate(ctxB, sb)))?.status === 404);
  const listA2 = await S.staffList(ctxA2, { from: iso("2026-10-26 00:00"), to: iso("2026-11-14 00:00") });
  const listA = await S.staffList(ctxA, { from: iso("2026-10-26 00:00"), to: iso("2026-11-14 00:00") });
  ok("FO-3 staff list: without agent/booking:list a person sees only the bookings they host; pass: with it, the firm's",
    listA2.length > 0 && listA2.every((b) => b.staffId === A2.id) && listA.some((b) => b.staffId === A1.id) && listA.length > listA2.length);
  ok("FO-3 staff fail: the host without the edit key may not cancel (403)", (await thrown(() => S.staffCancel(ctxA2, t1.id)))?.status === 403);
  const scx = await S.staffCancel(ctxA, sc.id);
  ok("FO-3 staff pass: cancel by staff → CANCELLED, booking.cancelled event", scx.status === "CANCELLED" && await db.moduleEvent.count({ where: { subjectId: sc.id, type: EVENT.BOOKING_CANCELLED } }) === 1);
  ok("FO-3 no money: no booking route or table takes a payment (no amount, card or price field in the answer)", !/amount|price|card|payment/i.test(JSON.stringify(sc)));

  // ------------------------------------------------------------------------- FO-3f: booking hardening (rows rev 16.8)
  const T3 = await type(A.id, "fo3f", [A2.id], { gapBeforeMinutes: 0, gapAfterMinutes: 0 });   // one host, no gaps: each listed time books once
  const free3 = (await S.publicSlots(A.key, "fo3f", days("2026-11-16 00:00", "2026-11-21 00:00"), "ip")).slots.map((x) => x.startsAt);
  let next3 = 0;
  const slot3 = () => { const v = free3[next3++]; if (!v) throw new Error("FO-3f: out of free test slots"); return v; };
  const form3 = async (svc: BookingService, who: string, extra: Record<string, unknown> = {}) => ({ ...(await form(svc, "fo3f", "2026-11-16 09:00", who)), startsAt: slot3(), ...extra });
  const statusOf = (r: PromiseSettledResult<unknown>) => r.status === "fulfilled" ? 201 : ((r.reason as { getStatus?: () => number }).getStatus?.() ?? 0);
  const codeOf = (r: PromiseSettledResult<unknown>) => r.status === "rejected" ? (r.reason as { getResponse?: () => { code?: string } }).getResponse?.().code : undefined;

  // item 1, m10: U+200C / U+200D between letters
  const persian = "علی‌رضا";   // علی‌رضا
  const faForm = await form3(S, "fa", { givenNames: persian });
  const fa = await S.publicBook(A.key, "fo3f", faForm, "ip").then(full, (e: unknown) => ({ status: "REFUSED", personId: null, refusal: (e as { getResponse?: () => unknown }).getResponse?.() }));
  ok("FO-3f m10 pass: a Persian name with U+200C between letters (علی‌رضا) books, and the name is kept as typed; so do a ZWJ after a virama (Devanagari क्‍ष) and a ZWNJ in Hindi",
    fa.status === "SCHEDULED" && !!fa.personId && (await main.arrival.contactOf(db, A.id, fa.personId))?.givenNames === persian && ["क्‍ष", "क्‌ष"].every((n) => Name.safeParse(n).success), fa);
  const badJoin = ["‌Ana", "Ana‌", "Ana ‌Lee", "Ana‌‌Lee", "1‍2", "‍", "Ana‌-Lee"];
  const refusedJoin = [];
  for (const n of badJoin) refusedJoin.push((await thrown(async () => S.publicBook(A.key, "fo3f", await form3(S, "zw", { givenNames: n }), "ip")))?.status);
  next3 -= badJoin.length;   // none booked
  ok("FO-3f m10 fail: a joiner at the start or end, beside a space, digit or hyphen, doubled, or alone → 422 (the B-9 rule stays)", refusedJoin.every((x) => x === 422), refusedJoin);

  // item 2, m3: the emails are keyed jobs; a failed send is retried after commit
  const fj = fakeJobs(clock), handlers = new Map<string, JobHandler>();
  const retrying: JobPort = { enqueue: (n, p, o) => fj.enqueue(n, p, o), schedule: (n, a, p, o) => fj.schedule(n, a, p, o), cancel: (k) => fj.cancel(k), recurring: (n, c, z) => fj.recurring(n, c, z), handle: async (n, h) => { handlers.set(n, h); await fj.handle(n, h); } };
  let failures = 1;
  const flaky = make({ jobs: retrying, mail: fakeMail({ clock, failOn: (m) => m.templateKey === "booking.booked" && failures-- > 0 }) });
  await flaky.svc.registerJobs();
  const fb = await full(await flaky.svc.publicBook(A.key, "fo3f", await form3(flaky.svc, "flaky"), "ip"));
  const sentAtBook = flaky.mail.sent.length;
  const mailJobs = () => fj.jobs.filter((j) => j.name === "booking.mail" && j.key.startsWith(`booking:${fb.id}:`));
  ok("FO-3f m3 pass: the booking sends nothing itself; it queues one booking.mail job per recipient, keyed booking:<id>:0:mail-person / mail-host, ids only in the payload",
    sentAtBook === 0 && mailJobs().map((j) => j.key).sort().join() === [`booking:${fb.id}:0:mail-host`, `booking:${fb.id}:0:mail-person`].join() && mailJobs().every((j) => !JSON.stringify(j.payload).includes("@") && !JSON.stringify(j.payload).includes(".")), mailJobs());
  await fj.runDue();
  const liveFor = (id: string) => db.foBookingToken.count({ where: { bookingId: id, voidedAt: null } });
  const failed = mailJobs().find((j) => j.key.endsWith("mail-person"))!;
  ok("FO-3f m3 fail: the person's send failed → its job failed (for the runner to retry), the booking stays, the link that send made is voided (only the answer's link is live), the host's email went",
    failed.status === "failed" && /forced mail failure/.test(failed.error ?? "") && (await db.foBooking.findUniqueOrThrow({ where: { id: fb.id } })).status === "SCHEDULED" && await liveFor(fb.id) === 1 && flaky.mail.inbox("flaky@client.example").length === 0 && flaky.mail.inbox("a2@staff.example").some((m) => m.templateKey === "booking.host_booked"), failed);
  await handlers.get("booking.mail")!({ name: failed.name, payload: failed.payload, key: failed.key, firmId: failed.firmId, runAt: failed.runAt, attempt: 2 });
  const retried = flaky.mail.inbox("flaky@client.example");
  ok("FO-3f m3 pass: the retry (attempt 2) sends the confirmation once, with a live link to the booking; the host is not emailed twice",
    retried.length === 1 && (await flaky.svc.manageView(linkOf(retried[0].text), "ip")).startsAt === fb.startsAt && await liveFor(fb.id) === 2 && flaky.mail.sent.filter((m) => m.templateKey === "booking.host_booked").length === 1, retried.map((m) => m.text));
  const stale = await full(await flaky.svc.publicBook(A.key, "fo3f", await form3(flaky.svc, "stale"), "ip"));
  await flaky.svc.selfReschedule(stale.manageToken, { startsAt: slot3() }, "ip");
  await fj.runDue();
  const staleHost = flaky.mail.inbox("a2@staff.example").filter((m) => icsOf(m).includes(`UID:${stale.id}@`)).map((m) => m.templateKey);
  ok("FO-3f m3 fail: booked emails whose booking moved before they ran are not sent, to the person or the host (the moved ones are), and make no link (review m4)",
    flaky.mail.inbox("stale@client.example").map((m) => m.templateKey).join() === "booking.moved" && staleHost.join() === "booking.host_moved" && await liveFor(stale.id) === 2, { person: flaky.mail.inbox("stale@client.example").map((m) => m.templateKey), host: staleHost });
  ok("FO-3f m3 pass: the running app's ports name no JobPort and take PF-14's runner; fail: with neither, the booking service refuses to start",
    bookingPortsWith({ ...flaky.svc["ports"], jobs: undefined }, retrying).jobs === retrying && /no JobPort/.test(String((await thrown(() => bookingPortsWith({ ...flaky.svc["ports"], jobs: undefined }, null)))?.body.message)));

  // item 3, m7: staff never get the visitor's link
  const lia = main.arrival.addPerson(A.id, { givenNames: "Lia", familyName: "Sample", email: "lia@client.example" });
  const tokensBefore = await db.foBookingToken.count();
  const sl = await S.staffCreate(ctxA, { typeId: T3.id, personId: lia, mode: "VIDEO", startsAt: slot3(), timeZone: TZ });
  ok("FO-3f m7 fail: the staff create answer carries no manageToken (nor any token-shaped value), and the transaction issued no link",
    !("manageToken" in sl) && !/[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}/.test(JSON.stringify(sl)) && await db.foBookingToken.count() === tokensBefore, sl);
  await (main.jobs as FakeJobs).runDue();
  const liaMail = main.mail.inbox("lia@client.example");
  ok("FO-3f m7 pass: the person still gets their link by email, and it opens the booking", liaMail.length === 1 && (await S.manageView(linkOf(liaMail[0].text), "ip")).startsAt === sl.startsAt, liaMail.map((m) => m.text));
  const smoved = await S.staffReschedule(ctxA, sl.id, { startsAt: slot3() });
  ok("FO-3f m7 fail: a staff move answers no token and issues none in its transaction (the moved email makes the only new link)",
    !("manageToken" in smoved) && await db.foBookingToken.count() === tokensBefore + 1, smoved);

  // item 4, B-8: one form stamp books once
  const once = await form3(S, "once");
  await S.publicBook(A.key, "fo3f", once, "ip");
  const again = await thrown(() => S.publicBook(A.key, "fo3f", { ...once, startsAt: slot3(), email: "again@client.example" }, "ip"));
  ok("FO-3f B-8 fail: the same stamp a second time (another time, another email) → 409 FORM_ALREADY_SENT \"This form was already sent. Reload the page to book again.\"",
    again?.status === 409 && again.body.code === "FORM_ALREADY_SENT" && again.body.detail === "This form was already sent. Reload the page to book again.", again);
  const taken = await form3(S, "retry", { startsAt: once.startsAt });
  const t409 = await thrown(() => S.publicBook(A.key, "fo3f", taken, "ip"));
  ok("FO-3f B-8 pass: a stamp whose booking was refused (time taken, 409 SLOT_TAKEN) books with the next time picked; a fresh stamp books",
    t409?.body.code === "SLOT_TAKEN" && (await S.publicBook(A.key, "fo3f", { ...taken, startsAt: slot3() }, "ip")).status === "SCHEDULED" && (await S.publicBook(A.key, "fo3f", await form3(S, "fresh"), "ip")).status === "SCHEDULED");
  const shared = await form3(S, "shared");
  const par = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => S.publicBook(A.key, "fo3f", { ...shared, startsAt: i ? slot3() : shared.startsAt, email: `shared${i}@client.example` }, `198.51.100.${100 + i}`)));
  ok("FO-3f B-8 fail: one stamp sent 10 times at once for 10 free times → exactly one booking, 9 × 409 FORM_ALREADY_SENT",
    par.filter((r) => r.status === "fulfilled").length === 1 && par.filter((r) => codeOf(r) === "FORM_ALREADY_SENT").length === 9, par.map(statusOf));
  const edge = await form3(S, "edge");
  await S.publicBook(A.key, "fo3f", edge, "ip");
  const edgeBack = clock.now();
  await clock.set(new Date(Number(String(edge.formStamp).split(".")[0]) + 2 * 60 * 60_000));   // the stamp's last valid moment
  const atEdge = await thrown(() => S.publicBook(A.key, "fo3f", { ...edge, startsAt: slot3(), email: "edge2@client.example" }, "ip"));
  await clock.set(new Date(Number(String(edge.formStamp).split(".")[0]) + 2 * 60 * 60_000 + 1));
  const pastEdge = await thrown(() => S.publicBook(A.key, "fo3f", { ...edge, startsAt: slot3(), email: "edge3@client.example" }, "ip"));
  await clock.set(edgeBack);
  ok("FO-3f B-8 fail: at exactly 2 h after the page was drawn (the stamp's last valid moment), a used stamp is still refused 409 FORM_ALREADY_SENT; 1 ms later the age rule refuses it 422 (review m1, break F1)",
    atEdge?.body.code === "FORM_ALREADY_SENT" && pastEdge?.status === 422, { atEdge, pastEdge });
  /** Holds the host's transaction lock (as a booking for that host would), so a public booking for A2 waits inside its
   *  transaction, after the firm's lock and its gate, until `free()` (break F2/F3: a booking in flight). */
  const holdHost = async () => {
    let free!: () => void, got!: () => void;
    const gate = new Promise<void>((r) => { free = r; }), taken = new Promise<void>((r) => { got = r; });
    const tx = db.$transaction(async (t) => { await t.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`fo-booking-host:${A2.id}`}))`; got(); await gate; }, { timeout: 30_000 });
    await taken;
    return async () => { free(); await tx; };
  };
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const inflight = await form3(S, "inflight", { startsAt: once.startsAt });   // a time already taken: it will fail
  let freeHost = await holdHost();
  const fA = S.publicBook(A.key, "fo3f", inflight, "198.51.100.200").then(() => 201, (e: { getResponse?: () => { code?: string } }) => e.getResponse?.().code);
  await pause(300);
  const fB = S.publicBook(A.key, "fo3f", { ...inflight, startsAt: slot3(), email: "inflight2@client.example" }, "198.51.100.201").then(() => 201, (e: { getResponse?: () => { code?: string } }) => e.getResponse?.().code);
  await pause(300);
  await freeHost();
  const [rA, rB] = await Promise.all([fA, fB]);
  ok("FO-3f B-8 pass: the same stamp sent while its first send (for a taken time) is still in flight waits, then books once the first has failed (review m2, break F2)", rA === "SLOT_TAKEN" && rB === 201, { rA, rB });
  const sameMs = [S.stamp(A.id, clock.now()), S.stamp(A.id, clock.now())];
  ok("FO-3f B-8 pass: two pages drawn in the same millisecond get two stamps (a random nonce), so two visitors never share one", sameMs[0] !== sameMs[1] && sameMs.every((x) => x.split(".")[0] === String(clock.now().getTime())));

  // item 5, the cap race: the firm's cap under bookings in flight
  const capped = make({ limits: { bookPerFirm: 3 } });
  for (let i = 0; i < 2; i++) await capped.svc.publicBook(A.key, "fo3f", await form3(capped.svc, `cap${i}`), "ip");
  ok("FO-3f cap pass: a booking refused inside its transaction (time taken) does not use up the cap", (await thrown(async () => capped.svc.publicBook(A.key, "fo3f", await form3(capped.svc, "captaken", { startsAt: once.startsAt }), "ip")))?.body.code === "SLOT_TAKEN");
  const capForms = [];
  for (let i = 0; i < 20; i++) capForms.push(await form3(capped.svc, `capr${i}`));
  const locks0 = await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'`;
  const capRun = await Promise.allSettled(capForms.map((f, i) => capped.svc.publicBook(A.key, "fo3f", f, `203.0.113.${100 + i}`)));
  const capBooked = await db.foBooking.count({ where: { firmId: A.id, typeId: T3.id, startsAt: { in: capForms.map((f) => new Date(f.startsAt as string)) } } });
  ok("FO-3f cap pass: 20 parallel bookings for 20 free times at cap − 1 (2 of 3) → exactly one success (held by the check-and-hold in the transaction, which counts bookings in flight)", capRun.filter((r) => r.status === "fulfilled").length === 1 && capBooked === 1, capRun.map(statusOf));
  const capped2 = make({ limits: { bookPerFirm: 3 } });
  for (let i = 0; i < 2; i++) await capped2.svc.publicBook(A.key, "fo3f", await form3(capped2.svc, `cap2${i}`), "ip");
  const doomed = await form3(capped2.svc, "doomed", { startsAt: once.startsAt }), good2 = await form3(capped2.svc, "good2");
  freeHost = await holdHost();
  const cA = capped2.svc.publicBook(A.key, "fo3f", doomed, "198.51.100.210").then(() => 201, (e: { getStatus?: () => number }) => e.getStatus?.());
  await pause(300);
  const cB = capped2.svc.publicBook(A.key, "fo3f", good2, "198.51.100.211").then(() => 201, (e: { getStatus?: () => number }) => e.getStatus?.());
  await pause(300);
  await freeHost();
  const [sA, sB] = await Promise.all([cA, cB]);
  ok("FO-3f cap pass: at cap − 1, a booking in flight that then fails (time taken) gives its place back before the next one is checked under the firm's lock, so the next real booking books, not 429 (review m2/m3, break F3)", sA === 409 && sB === 201, { sA, sB });
  ok("FO-3f cap fail: the other 19 → 429, never a booking past the cap; no advisory lock is left held", capRun.filter((r) => statusOf(r) === 429).length === 19 && (await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory'`)[0].n === locks0[0].n, capRun.map(statusOf));

  // ---------------------------------------------------------- FO-3h: the host's mails in the host's office zone (QA-470)
  // AG-04 v2.1 Part B rule 9 (AG01-24): staff see the host's office time. Today the office zone is the firm's (PF-3's
  // platform.time_zone; PF-18a adds offices). Own firm, clock, jobs and mail, so the cases above are not disturbed.
  {
    const hz = new FakeClock(new Date("2026-11-16T13:00:00Z"));   // Monday 08:00 Toronto
    const D = await firm("fo3h");
    await writeSetting(db, { firmId: D.id, key: TIME_ZONE.key, value: TZ, by: "seed:fo3h", workspaceId: ws.id });
    const D1 = await staff(D.id, "fo3h-host");
    await copyFirmHoursTo(db, D.id, [D1.id]);
    const TD = await type(D.id, "free", [D1.id]);
    const mail = fakeMail({ clock: hz }), jobs = fakeJobs(hz);
    const svc = new BookingService(db, { audit: fakeAudit() as AuditPort<never>, clock: hz, jobs, mail, arrival: fakeArrival(), publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 }, warn: () => {} });
    await svc.registerJobs();
    const bookFrom = async (who: string, startsAt: string, timeZone: string) => {
      const page = await svc.publicSlots(D.key, "free", {}, "10.0.0.7");
      await hz.advance({ seconds: 5 });
      return svc.publicBook(D.key, "free", { givenNames: "Client", familyName: who, email: `${who}@client.example`, mode: "VIDEO", startsAt, timeZone, consent: true, consentWordingId: page.consent!.wordingId, formStamp: page.formStamp }, "10.0.0.7");
    };
    const said = (m: { subject: string; text: string }) => `${m.subject}\n${m.text}`;
    const hostMail = (key: string) => mail.inbox("fo3h-host@staff.example").find((m) => m.templateKey === key);
    const TOR10 = /10:00\sa\.m\. \(America\/Toronto\)/, TOR11 = /11:00\sa\.m\. \(America\/Toronto\)/;

    // Tue 17 Nov 10:00 Toronto = 15:00Z = 19:00 Dubai.
    await bookFrom("dubai1", "2026-11-17T15:00:00.000Z", "Asia/Dubai");
    await jobs.runDue();
    const hb = hostMail("booking.host_booked");
    ok("FO-3h DW1 pass: a booking from Asia/Dubai for Tue 17 Nov 10:00 Toronto mails the host \"10:00 a.m. (America/Toronto)\" in subject and text",
      !!hb && TOR10.test(hb.subject) && TOR10.test(hb.text), hb && said(hb));
    ok("FO-3h DW1 fail: no host mail states the time only in Asia/Dubai", mail.inbox("fo3h-host@staff.example").length === 1 && !said(hb!).includes("Asia/Dubai"), mail.inbox("fo3h-host@staff.example").map(said));
    const pb = mail.inbox("dubai1@client.example").find((m) => m.templateKey === "booking.booked");
    ok("FO-3h DW2: the booker's confirmation reads \"7:00 p.m. (Asia/Dubai)\" (kept)", !!pb && /7:00\sp\.m\. \(Asia\/Dubai\)/.test(pb.text), pb && said(pb));

    // DW5: the invite stays in UTC and is byte-identical to the unchanged generator's output for the same booking.
    const row1 = await db.foBooking.findFirstOrThrow({ where: { firmId: D.id, personId: { not: null }, startsAt: new Date("2026-11-17T15:00:00.000Z") } });
    const icsFor = (attendee: { name: string; email: string }) => bookingIcs({ bookingId: row1.id, sequence: 0, method: "REQUEST", startsAt: row1.startsAt, endsAt: row1.endsAt, stamp: hz.now(),
      summary: `${TD.name} with ${D.operatingName}`, description: `Video call. Your join link will follow.`, location: undefined, organizer: { name: D.operatingName, email: D.contactEmail }, attendee });
    const hostIcs = new TextDecoder().decode(hb!.attachments![0].bytes), personIcs = new TextDecoder().decode(pb!.attachments![0].bytes);
    ok("FO-3h DW5: the .ics start and end are still UTC (20261117T150000Z, 20261117T153000Z), byte-identical to before for the same booking",
      [hostIcs, personIcs].every((x) => x.includes("DTSTART:20261117T150000Z\r\n") && x.includes("DTEND:20261117T153000Z\r\n"))
        && hostIcs === icsFor({ name: "Sample fo3h-host", email: "fo3h-host@staff.example" }) && personIcs === icsFor({ name: "Client dubai1", email: "dubai1@client.example" }), hostIcs);

    // DW3: booked from Dubai for Wed 18 Nov 10:00 Toronto, moved to 11:00 by the booker now in Tokyo, then cancelled.
    const b2 = await bookFrom("dubai2", "2026-11-18T15:00:00.000Z", "Asia/Dubai");
    await jobs.runDue();
    const mv = await svc.selfReschedule(b2.manageToken, { startsAt: "2026-11-18T16:00:00.000Z", timeZone: "Asia/Tokyo" }, "10.0.0.7");
    await jobs.runDue();
    await svc.selfCancel(mv.manageToken, "10.0.0.7");
    await jobs.runDue();
    const hm = hostMail("booking.host_moved"), hc = hostMail("booking.host_cancelled");
    const pm = mail.inbox("dubai2@client.example").find((m) => m.templateKey === "booking.moved");
    ok("FO-3h DW3 pass: after the booker changes zone on reschedule, the host's reschedule and cancel mails read \"11:00 a.m. (America/Toronto)\"",
      !!hm && !!hc && TOR11.test(hm.subject) && TOR11.test(hm.text) && TOR11.test(hc.subject) && TOR11.test(hc.text), [hm, hc].map((m) => m && said(m)));
    ok("FO-3h DW3 fail: neither host mail states the time in the booker's zone (Asia/Tokyo or Asia/Dubai); the booker's own moved mail stays in Asia/Tokyo",
      !!hm && !!hc && [hm, hc].every((m) => !/Asia\/(Tokyo|Dubai)/.test(said(m))) && !!pm && /1:00\sa\.m\. \(Asia\/Tokyo\)/.test(pm.text), [hm, hc, pm].map((m) => m && said(m)));

    // DW4: the attendance question, 30 min after b1 ends (15:30Z), to the host in the host's zone.
    await hz.set(new Date("2026-11-17T16:01:00Z"));
    await jobs.runDue();
    // FO-3m DW6: the question is shown, not pushed (AG-4-39 rule 2), so no host mail is sent at all.
    const ask = hostMail("booking.attendance_ask");
    ok("FO-3h DW4 (as FO-3m DW6): 30 min after the end no attendance mail goes to the host", !ask, ask && said(ask));

    // hostZone reads the firm's own setting, not a fixed default (review m1): the firm moves to America/Regina (UTC-6 all year).
    await writeSetting(db, { firmId: D.id, key: TIME_ZONE.key, value: "America/Regina", by: "seed:fo3h", workspaceId: ws.id });
    await bookFrom("dubai3", "2026-11-19T17:00:00.000Z", "Asia/Dubai");   // Thu 19 Nov 12:00 Toronto = 11:00 Regina
    await jobs.runDue();
    const hv = mail.inbox("fo3h-host@staff.example").filter((m) => m.templateKey === "booking.host_booked").at(-1);
    ok("FO-3h hostZone: a firm in America/Regina mails the host \"11:00 a.m. (America/Regina)\", not the setting's default zone",
      !!hv && /11:00\sa\.m\. \(America\/Regina\)/.test(hv.subject) && /11:00\sa\.m\. \(America\/Regina\)/.test(hv.text) && !said(hv).includes("America/Toronto") && !said(hv).includes("Asia/Dubai"), hv && said(hv));
  }

  // --------------------------------------------------------------------------------------- over HTTP, with the guard
  // The app's decorators need the api's tsconfig, so the route checks run in a child of this file (`--serve`): the real
  // controller and read guard on this scratch database, its own fake clock at Mon 26 Oct 08:00, 5 slot reads per IP.
  const child = spawn(join(STUDIO, "node_modules", ".bin", "tsx"), ["--tsconfig", join(STUDIO, "api", "tsconfig.json"), import.meta.filename, "--serve"], { env: { ...process.env, DATABASE_URL: URL }, stdio: ["ignore", "pipe", "inherit"] });
  server = child;
  const base = await new Promise<string>((resolve, reject) => {
    let out = "";
    child.stdout.on("data", (d: Buffer) => { out += d; const m = /^LISTEN (\S+)$/m.exec(out); if (m) resolve(m[1]); });
    child.on("exit", (c) => reject(new Error(`the route server stopped (${c}): ${out}`)));
    setTimeout(() => reject(new Error(`the route server did not start in 60 s: ${out}`)), 60_000).unref();
  });
  const get = async (p: string) => { const r = await fetch(`${base}${p}`); return { status: r.status, body: await r.text() }; };
  const h1 = await get(`/api/public/firms/${A.key}/book/free/slots`);
  ok("FO-3 http pass: the slots route answers 200 with no person header (open door)", h1.status === 200 && JSON.parse(h1.body).slots.length > 0, h1.status);
  const hs = [await get(`/api/public/firms/nope/book/free/slots`), await get(`/api/public/firms/${A.key}/book/nope/slots`), await get(`/api/public/firms/${A.key}/book/retired/slots`), await get(`/api/public/bookings/not-a-token`)];
  ok("FO-3 http fail: unknown firm, unknown slug, inactive type and a bad link → 404 with the identical body", hs.every((r) => r.status === 404) && new Set(hs.map((r) => r.body)).size === 1, hs);
  const many = [];
  for (let i = 0; i < 4; i++) many.push((await get(`/api/public/firms/${A.key}/book/free/slots`)).status);
  ok("FO-3 http fail: past 5 slot reads from one IP in the window (the 404s count too) → 429 (rate limit); pass: the fifth is 200", many[0] === 200 && many.slice(1).every((s) => s === 429), many);
  const post = await fetch(`${base}/api/public/firms/${A.key}/book/free/bookings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ givenNames: "x" }) });
  ok("FO-3 http fail: a POST with a half-filled form → 422 with the issues listed, nothing booked", post.status === 422 && Array.isArray((await post.json()).issues));
} catch (e) {
  fail++;
  console.log(`FAIL  FO-3 check stopped: ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  server?.kill();
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

/** The child: the public controller with the real read guard, on the parent's database (DATABASE_URL). Never returns. */
async function serve(): Promise<never> {
  const { NestFactory, APP_GUARD } = await import("@nestjs/core");
  const { Module } = await import("@nestjs/common");
  const core = await import("../api/src/core.ts");
  const pc = await import("../api/src/front-office/booking/public.controller.ts");
  const clock = new FakeClock(at("2026-10-26 08:00"));
  const ports: BookingPorts = { audit: fakeAudit() as AuditPort<never>, clock, jobs: fakeJobs(clock), mail: fakeMail(), arrival: fakeArrival(), publicBaseUrl: "http://localhost", limits: { slotsPerIp: 5 } };
  class TestModule {}
  Module({ controllers: [pc.BookingPublicController], providers: [core.Db, pc.Booking, { provide: pc.BOOKING_PORTS, useValue: ports }, { provide: APP_GUARD, useClass: core.ConfigReadGuard }] })(TestModule);
  const nest = await NestFactory.create(TestModule, { logger: false });
  await nest.listen(0, "127.0.0.1");
  console.log(`LISTEN ${(await nest.getUrl()).replace("[::1]", "127.0.0.1")}`);
  return new Promise<never>(() => {});
}
