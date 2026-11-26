// FO-3v part 1 (BACKLOG row FO-3v; brief lead-b-briefs/FO-3v.md; AG-4-58 rules 2-5, §9, §12; AG-4-59; AG-4-29 rules 2,
// 6, 7, 9, §7, §9, §10; AG-16-73): My account → Video and the link on each Video booking. The brief's DW1, DW2, DW3,
// DW5 and DW6 (part 1), each with a passing and a failing case, plus AG-4-59's own-record rule, over HTTP: a scratch
// database (every migration), one small Nest app with FO-3sr's staff routes and this row's routes beside PF-4's guard
// with the local sign-in stand-in, PF-0p's fake clock, jobs, mail and audit, the NotificationPort fake and the
// ArrivalPort fake. No network, no model call (US$0). Dropped at the end. DW4 and DW8 are part 2's (Zoom).
//   tsx studio/tests/check_fo3v_video.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { fakeAudit } from "../ports/audit.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";
import { fakeNotifications, NOTIFICATION_KIND } from "../ports/notifications.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3v_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const TZ = "America/Toronto";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, token?: string, body?: unknown, type = "application/json"): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": type };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text();
  let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};

// DW6: every line the app writes to the console or stdout during the run is kept, to look for a link in it.
const logged: string[] = [];
const own = (l: string) => /^(PASS|FAIL) {2}FO-3v/.test(l);   // this check's own result lines name the links it tests
const keep = (f: (...a: any[]) => any) => (...a: any[]) => { logged.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); return f(...a); };
for (const k of ["log", "info", "warn", "error", "debug"] as const) (console as any)[k] = keep((console as any)[k].bind(console));
const write = process.stdout.write.bind(process.stdout), writeErr = process.stderr.write.bind(process.stderr);
(process.stdout as any).write = (c: any, ...r: any[]) => { logged.push(String(c)); return write(c, ...r); };
(process.stderr as any).write = (c: any, ...r: any[]) => { logged.push(String(c)); return writeErr(c, ...r); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_POOL_MFA_REQUIRED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { Db } = await import("../api/src/core.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { Booking, BOOKING_PORTS } = await import("../api/src/front-office/booking/public.controller.ts");
const { BookingStaffController } = await import("../api/src/front-office/booking/staff.controller.ts");
const { MyVideo, MyVideoController } = await import("../api/src/front-office/booking/video/controller.ts");
const { LINK_CHARS, linkFor, linkOk, VIDEO_WORDS } = await import("../api/src/front-office/booking/video/service.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const { copyFirmHoursTo } = await import("../api/src/front-office/booking-seed.ts");
const feature = (await import("../api/src/features/front-office-video.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
const at = (s: string) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return wallToUtc(y, m, dd, h * 60 + mi, TZ)!; };
const iso = (s: string) => at(s).toISOString();

const clock = new FakeClock(at("2026-10-26 08:00"));   // Monday, EDT
const arrival = fakeArrival(), jobs = fakeJobs(clock), audit = fakeAudit(), mail = fakeMail({ clock }), notifications = fakeNotifications({ now: () => clock.now() });
const ports = { audit: audit as never, clock, jobs, mail, arrival, notifications: notifications as never, publicBaseUrl: "http://localhost:4432", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
const identity = new LocalIdentity("fo3v-check-signing-key-0123456789abcdef", () => Date.now());
const pclock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const providers = [Db, { provide: PlatformClock, useValue: pclock }, { provide: IDENTITY_PORT, useValue: identity }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  Booking, { provide: BOOKING_PORTS, useValue: ports }, MyVideo];
@Module({ controllers: [BookingStaffController, MyVideoController] as never[], providers: providers as never[] }) class TestApp {}

const LINK = "https://zoom.us/j/1234567890", LINK2 = "https://meet.example/h2-room";
let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const firm = (key: string) => db.platformFirm.create({ data: { key, operatingName: `Sample ${key}`, countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const [A, B] = [await firm("fo3v-a"), await firm("fo3v-b")];
  const person = async (firmId: string, n: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${n}@staff.example`, displayName: `Sample ${n}` } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as never, grantedBy: "seed:fo3v" } });
    return { id: s.id, token: identity.issue(s.id, { authTimeMs: Date.now() - 1000, secondStep: true }) };
  };
  const OWNER = await person(A.id, "owner", "OWNER"), CO = await person(A.id, "officer", "CASE_OFFICER"), H2 = await person(A.id, "second", "CASE_OFFICER"), H3 = await person(A.id, "third", "CASE_OFFICER");
  const B1 = await person(B.id, "b-owner", "OWNER");
  await copyFirmHoursTo(db, A.id, [OWNER.id, CO.id, H2.id, H3.id]);
  const type = (slug: string, hosts: string[], modes = ["VIDEO", "PHONE"]) =>
    // The type's own link stays on main but is no source (Lead B rev 16.66): a link here must never reach a booking.
    db.foConsultationType.create({ data: { firmId: A.id, slug, name: `Sample consultation ${slug}`, purpose: "FREE_CONSULT", modes: modes as never, hostStaffIds: hosts, minutes: 30, meetingLink: "https://type.example/firm-room" } });
  const [TV, TO, T2] = [await type("officer", [CO.id]), await type("owner", [OWNER.id]), await type("pair", [CO.id, H2.id])];
  const lee = arrival.addPerson(A.id, { givenNames: "Lee", familyName: "Sample", email: "lee@client.example" });

  app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const me = (method: string, who?: { token: string }, b?: unknown, ct?: string) => call(base, method, "/api/front-office/me/video", who?.token, b, ct);
  const go = (method: string, path: string, who: { token: string }, b?: unknown) => call(base, method, `/api/front-office/bookings${path}`, who.token, b);
  const book = async (typeId: string, when: string, host: string, mode = "VIDEO") => {
    const r = await go("POST", "", OWNER, { typeId, personId: lee, mode, startsAt: iso(when), timeZone: TZ, hostStaffId: host });
    if (r.status !== 201) throw new Error(`create ${when}: ${JSON.stringify(r)}`);
    await jobs.runDue();
    return r.body as { id: string; sequence: number; staffId: string };
  };
  const videoOf = (bookingId: string) => db.foBookingVideo.findFirst({ where: { bookingId } });
  const mailsOf = (bookingId: string, to = "lee@client.example") => mail.inbox(to).filter((m) => m.attachments?.some((a) => new TextDecoder().decode(a.bytes).includes(bookingId)));
  /** The links in a text, compared whole (CodeQL: never a URL found by substring). */
  const linksIn = (text: string) => text.match(/https:\/\/[^\s"<>]+/g)?.map((l) => l.replace(/[.,;:)]+$/, "")) ?? [];
  const hasLink = (text: string | undefined, link: string) => !!text && linksIn(text).includes(link);
  const ics = (m: { attachments?: { bytes: Uint8Array }[] }) => new TextDecoder().decode(m.attachments![0].bytes).replace(/\r\n /g, "");
  const prefRows = () => db.foVideoPref.count();
  ok("FO-3v set-up: the feature file registers the Video routes (My account → Video's panel is part 1b, DW7)", feature.controllers?.includes(MyVideoController));

  // ---------------------------------------------------------------------------------------- DW1: the link's shape
  const empty = await me("GET", CO);
  ok("FO-3v DW1 set-up: a Case Officer with no extra keys reads their own empty settings (no link, no source, Zoom hidden)",
    empty.status === 200 && empty.body.myMeetingLink === null && empty.body.sourceChoice === null && empty.body.sources.length === 0 && empty.body.zoomAvailable === false, empty);
  const refusedLinks = ["zoom.us/j/1234", "http://zoom.us/j/1234", `https://zoom.us/j/${"1".repeat(2049 - "https://zoom.us/j/".length)}`, "javascript:alert(1)", "https://zoom.us/j/1\r\nATTENDEE:mailto:x@evil.example", "https://zoom.us/j/1 2", "https://",
    // Look-alikes (breaker m1): invisible and direction marks, a backslash before @, no host, a dot host, markup, user:pass.
    "https://zoom.us/j/1\u200b2", "https://zoom.us/j/\u202e1", "https://evil.example\\@zoom.us/j/1", "https:///zoom.us", "https://./x", "https://zoom.us/\"><script>", "https://user:pass@zoom.us/j/1", "https://zoom.us/j/1\u00a02"];
  const refusals = [];
  for (const l of refusedLinks) refusals.push(await me("PUT", CO, { myMeetingLink: l }));
  ok(`FO-3v DW1 fail: ${refusedLinks.length} bad links (no https, http, 2,049 characters, javascript:, a line break, a space, no host) → 422 "${VIDEO_WORDS.link}" on the field, nothing saved`,
    refusals.every((r) => r.status === 422 && r.body.fields?.myMeetingLink === VIDEO_WORDS.link) && (await prefRows()) === 0, refusals.map((r) => [r.status, r.body.fields]));
  const exact = `https://zoom.us/j/${"1".repeat(2048 - "https://zoom.us/j/".length)}`;
  const saved2048 = await me("PUT", H3, { myMeetingLink: exact });
  const saved = await me("PUT", CO, { myMeetingLink: LINK });
  ok("FO-3v DW1 pass: https://zoom.us/j/1234567890 is saved and the choice is pre-set to My meeting link (rule 3); exactly 2,048 characters is saved",
    saved.status === 200 && saved.body.myMeetingLink === LINK && saved.body.sourceChoice === "MY_LINK" && saved.body.sources.join() === "MY_LINK" && saved2048.status === 200 && saved2048.body.myMeetingLink === exact, [saved, saved2048.status]);
  // CodeQL (Lead 25): the shape names each character; every printable ASCII character is taken or refused as listed.
  const allowed = new Set(LINK_CHARS), shapeWrong: string[] = [];
  for (let c = 0x21; c <= 0x7e; c++) { const ch = String.fromCharCode(c); if (linkOk(`https://zoom.us/j/1${ch}2`) !== allowed.has(ch)) shapeWrong.push(ch); }
  ok("FO-3v DW1 pass/fail: the narrowed shape takes each listed character and refuses \" < > \\ ^ ` { | } (no range hides one)",
    shapeWrong.length === 0 && [..."\"<>\\^`{|}"].every((ch) => !allowed.has(ch)) && allowed.size === 0x7e - 0x21 + 1 - 9 && linkOk(LINK) && linkOk(LINK2) && linkOk("https://teams.microsoft.com/l/meetup-join/19%3a1@thread.v2/0?context=%7b%7d"), shapeWrong);
  let dbRefused = false;
  try { await db.$executeRawUnsafe(`INSERT INTO fo_video_pref (firm_id, staff_id, my_meeting_link) VALUES ('${A.id}', '${OWNER.id}', 'http://zoom.us/j/1')`); } catch { dbRefused = true; }
  ok("FO-3v DW1 fail: the database refuses a non-https link written past the API (fo_video_link_ok)", dbRefused && (await prefRows()) === 2);
  const dbBad = ["https://zoom.us/j/1\u2028x", "https://zoom.us/j/1\u00a0x", "https://u:p@zoom.us/j/1", "https://zoom.us/\"<b>", "https://zoom.us/j/1\u202e"];
  const dbAnswers = await db.$queryRawUnsafe<{ ok: boolean }[]>(`SELECT fo_video_link_ok(x) AS ok FROM unnest($1::text[]) AS x`, [...dbBad, LINK, exact]);
  ok("FO-3v DW1 fail (breaker m2): the database check refuses a line separator, a non-breaking space, user:pass, markup and a direction mark, and takes the good links",
    dbAnswers.slice(0, dbBad.length).every((r) => r.ok === false) && dbAnswers.slice(dbBad.length).every((r) => r.ok === true), dbAnswers);
  const zoom = await me("PUT", CO, { sourceChoice: "ZOOM" }), cal = await me("PUT", CO, { sourceChoice: "CALENDAR" });
  ok("FO-3v DW1 fail: a source the person does not have (Zoom hidden, no calendar) is refused 422, the choice unchanged (rule 3)",
    zoom.status === 422 && zoom.body.fields?.sourceChoice === VIDEO_WORDS.choice && cal.status === 422 && (await me("GET", CO)).body.sourceChoice === "MY_LINK", [zoom.body, cal.status]);
  const form = await me("PUT", CO, "myMeetingLink=https://x.example", "application/x-www-form-urlencoded"), unknown = await me("PUT", CO, { myMeetingLink: LINK, colour: "red" });
  ok("FO-3v DW1 fail: a form body is 415 and an unknown field is 422; nothing changed", form.status === 415 && unknown.status === 422 && (await me("GET", CO)).body.myMeetingLink === LINK, [form.status, unknown.status]);

  // ------------------------------------------------------------------------------- AG-4-59: own record only, no key
  const other = await me("PUT", OWNER, { staffId: CO.id, myMeetingLink: "https://evil.example/x" });
  const otherUser = await me("PUT", OWNER, { userId: CO.id, myMeetingLink: null });
  ok("FO-3v AG-4-59 fail: a body naming another person (staffId, userId) → 403, nothing changed for either", other.status === 403 && other.body.code === "OWN_RECORD_ONLY" && otherUser.status === 403
    && (await me("GET", CO)).body.myMeetingLink === LINK && (await me("GET", OWNER)).body.myMeetingLink === null, [other.body, otherUser.status]);
  const byQuery = await call(base, "PUT", `/api/front-office/me/video?staffId=${CO.id}`, OWNER.token, { myMeetingLink: "https://evil.example/q" });
  const byId = await me("PUT", OWNER, { id: CO.id, myMeetingLink: null }), byCase = await me("PUT", OWNER, { StaffId: CO.id }), readOther = await call(base, "GET", `/api/front-office/me/video?staff_id=${CO.id}`, OWNER.token);
  ok("FO-3v AG-4-59 fail (breaker m7): another person's id in the query, as `id`, or in another spelling → 403, nothing saved for anyone",
    [byQuery, byId, byCase, readOther].every((r) => r.status === 403) && (await me("GET", OWNER)).body.myMeetingLink === null && (await me("GET", CO)).body.myMeetingLink === LINK, [byQuery.status, byId.status, byCase.status, readOther.status]);
  // PF-28: any other query field is 422 naming it, on the read and the save; nothing saved.
  const qRead = await call(base, "GET", "/api/front-office/me/video?pf28Unknown=x", CO.token), qSave = await call(base, "PUT", "/api/front-office/me/video?colour=red", CO.token, { myMeetingLink: "https://meet.example/q" });
  ok("FO-3v PF-28 fail: an unknown query field on GET or PUT → 422 naming it, nothing saved",
    qRead.status === 422 && qRead.body.fields?.pf28Unknown !== undefined && qSave.status === 422 && qSave.body.fields?.colour !== undefined && (await me("GET", CO)).body.myMeetingLink === LINK, [qRead.status, qRead.body.fields, qSave.status]);
  const noChoice = await me("PUT", CO, { sourceChoice: null });
  ok("FO-3v rule 3 fail (breaker m4): \"no choice\" is not kept while the person has a source; the choice stays My meeting link, as bookings use it", noChoice.status === 200 && noChoice.body.sourceChoice === "MY_LINK", noChoice.body);
  // Breaker m3: two saves at once. One tab clears the link while another changes only the choice: the link stays cleared.
  const linesBefore = audit.entries.filter((e) => e.action === "video.choice_changed").length;
  await Promise.all([me("PUT", H3, { myMeetingLink: null }), me("PUT", H3, { sourceChoice: "MY_LINK" })]);
  const h3 = await me("GET", H3);
  const firsts = await Promise.all(Array.from({ length: 8 }, () => me("PUT", OWNER, { myMeetingLink: "https://meet.example/owner-room" })));
  ok("FO-3v rule 4 fail (breaker m3): saves one after another per person: a cleared link is never written back, and 8 first saves at once write one row and one line each kind",
    h3.body.myMeetingLink === null && firsts.every((r) => r.status === 200) && (await db.foVideoPref.count({ where: { staffId: OWNER.id } })) === 1
      && audit.entries.filter((e) => e.action === "video.choice_changed").length - linesBefore <= 2
      && audit.entries.filter((e) => e.action === "video.meeting_link_changed" && (e.detail as { staffId?: string }).staffId === OWNER.id).length === 1, [h3.body, audit.entries.filter((e) => e.action === "video.choice_changed").length - linesBefore]);
  await me("PUT", OWNER, { myMeetingLink: null });   // the Owner has no source again for DW3
  await me("PUT", H3, { myMeetingLink: exact });      // H3 keeps a link for §12
  const bRead = await me("GET", B1), anon = await me("GET");
  ok("FO-3v AG-4-59 pass: each person reads only their own row (another firm's Owner sees none of firm A's; no sign-in → 401)", bRead.status === 200 && bRead.body.myMeetingLink === null && anon.status === 401, [bRead.body, anon.status]);

  // ----------------------------------------------------------------------- DW2: the link in the email and the .ics
  const h2 = await me("PUT", H2, { myMeetingLink: LINK2 });
  const v1 = await book(TV.id, "2026-10-27 09:00", CO.id);
  const v1Mail = mailsOf(v1.id), v1Host = mailsOf(v1.id, "officer@staff.example");
  ok("FO-3v DW2 pass: a Video booking with the host's My meeting link carries it in the confirmation email and the .ics LOCATION (the person's and the host's invite)",
    h2.status === 200 && v1Mail.length === 1 && hasLink(v1Mail[0].text, LINK) && ics(v1Mail[0]).includes(`LOCATION:${LINK}`) && ics(v1Host[0]).includes(`LOCATION:${LINK}`)
      && (await videoOf(v1.id))?.meetingLink === LINK && (await videoOf(v1.id))?.provider === "MY_LINK", [v1Mail.map((m) => m.text), (await videoOf(v1.id))]);
  ok("FO-3v DW2 fail: the type's own meetingLink is no source (never in the email or the .ics)", !JSON.stringify(mail.sent).includes("type.example") && !ics(v1Mail[0]).includes("type.example"));
  const p1 = await book(TV.id, "2026-10-27 10:00", CO.id, "PHONE");
  const p1Mail = mailsOf(p1.id);
  ok("FO-3v DW2 fail: a Phone booking carries no link (no row, not in the email, no LOCATION)", p1Mail.length === 1 && !hasLink(p1Mail[0].text, LINK) && !ics(p1Mail[0]).includes("LOCATION:") && !(await videoOf(p1.id)), p1Mail.map((m) => m.text));
  await clock.set(at("2026-10-27 08:01"));   // the 1-hour reminder of v1 (09:00) is due
  await jobs.runDue();
  const reminder = mail.inbox("lee@client.example").find((m) => m.templateKey === "booking.reminder_1h" && m.text.includes("Video call"));
  ok("FO-3v DW2 pass: the reminder reads the booking's link", hasLink(reminder?.text, LINK), reminder?.text);
  await clock.set(at("2026-10-26 08:00"));

  // ------------------------------------------------------------------------------------------- DW3: no source at all
  const o1 = await book(TO.id, "2026-10-28 09:00", OWNER.id);
  const o1Mail = mailsOf(o1.id), items = () => notifications.sent().filter((n) => n.kind === NOTIFICATION_KIND.VIDEO_LINK_NEEDED);
  ok(`FO-3v DW3 pass: a host with no source → the booking is made, the email says "${VIDEO_WORDS.noLink}", and the host has exactly one item for it`,
    o1Mail.length === 1 && o1Mail[0].text.includes(VIDEO_WORDS.noLink) && !ics(o1Mail[0]).includes("LOCATION:") && !(await videoOf(o1.id))
      && items().length === 1 && items()[0].staffId === OWNER.id && items()[0].item.kind === "booking" && items()[0].item.id === o1.id, [o1Mail.map((m) => m.text), items()]);
  await jobs.runDue();
  const o1Moved = await go("POST", `/${o1.id}/reschedule`, OWNER, { startsAt: iso("2026-10-28 10:00"), timeZone: TZ });
  await jobs.runDue();
  ok("FO-3v DW3 fail: a second confirmation of the same booking (a move, the jobs run again) adds no second item", o1Moved.status === 200 && items().length === 1, [o1Moved.status, items().length]);
  ok("FO-3v DW3 fail: a host with a link gets no item (only the no-source booking made one)", !notifications.sent().some((n) => n.staffId === CO.id));

  // ------------------------------------------------------------------------------- DW5: reschedule, cancel, new host
  const seqBefore = mailsOf(v1.id).length;
  const moved = await go("POST", `/${v1.id}/reschedule`, OWNER, { startsAt: iso("2026-10-27 11:00"), timeZone: TZ });
  await jobs.runDue();
  const after = mailsOf(v1.id), movedMails = after.slice(seqBefore).filter((m) => m.templateKey === "booking.moved");
  ok("FO-3v DW5 pass: a reschedule keeps the link and re-sends the invite once, with it", moved.status === 200 && movedMails.length === 1 && ics(movedMails[0]).includes(`LOCATION:${LINK}`)
    && hasLink(movedMails[0].text, LINK) && (await videoOf(v1.id))?.meetingLink === LINK, [moved.status, movedMails.map((m) => m.text)]);
  const cancelled = await go("POST", `/${v1.id}/cancel`, OWNER);
  await jobs.runDue();
  const cMail = mailsOf(v1.id).find((m) => m.templateKey === "booking.cancelled");
  ok("FO-3v DW5 pass: a cancel voids the link (voided_at set) and the cancel invite carries no LOCATION", cancelled.status === 200 && !!(await videoOf(v1.id))?.voidedAt && !!cMail && !ics(cMail).includes("LOCATION:"), [cancelled.status, await videoOf(v1.id)]);
  const pair = await book(T2.id, "2026-10-29 09:00", CO.id);
  await db.foTimeOff.create({ data: { firmId: A.id, staffId: CO.id, startsAt: at("2026-10-29 13:00"), endsAt: at("2026-10-29 17:00"), createdBy: "seed:fo3v" } });
  const toH2 = await go("POST", `/${pair.id}/reschedule`, OWNER, { startsAt: iso("2026-10-29 14:00"), timeZone: TZ });
  await jobs.runDue();
  const pairMoved = mailsOf(pair.id).filter((m) => m.templateKey === "booking.moved");
  ok("FO-3v DW5 pass: a new host gets the new host's link (the row, the moved email and its invite)", toH2.status === 200 && toH2.body.staffId === H2.id && (await videoOf(pair.id))?.meetingLink === LINK2
    && pairMoved.length === 1 && ics(pairMoved[0]).includes(`LOCATION:${LINK2}`) && !hasLink(pairMoved[0].text, LINK), [toH2, await videoOf(pair.id)]);
  ok("FO-3v DW5 fail: a move with the same host writes no new link line (one 'video link set' per host change)",
    audit.entries.filter((e) => e.action === "booking.video_link_set" && (e.detail as { bookingId?: string }).bookingId === v1.id).length === 1
      && audit.entries.filter((e) => e.action === "booking.video_link_set" && (e.detail as { bookingId?: string }).bookingId === pair.id).length === 2);

  // ------------------------------------------------------------------------ AG-4-58 rule 4, §12: clear, deactivate
  const cleared = await me("PUT", CO, { myMeetingLink: null });
  ok("FO-3v rule 4 pass: clearing the link moves the choice to the next source the person has (none here)", cleared.status === 200 && cleared.body.myMeetingLink === null && cleared.body.sourceChoice === null && cleared.body.sources.length === 0, cleared.body);
  const noLink = await book(TV.id, "2026-10-30 09:00", CO.id);
  ok("FO-3v rule 4 fail: after clearing, the next booking has no link (and its host one item)", !(await videoOf(noLink.id)) && items().some((n) => n.item.id === noLink.id));
  await db.platformStaff.update({ where: { id: H3.id }, data: { status: "SUSPENDED" } });
  ok("FO-3v §12 fail: a suspended host's saved link is never used for a booking (the row stays)", (await linkFor(db, A.id, H3.id)) === null && (await db.foVideoPref.count({ where: { staffId: H3.id } })) === 1);
  await db.platformStaff.update({ where: { id: H3.id }, data: { status: "DEACTIVATED" } });
  ok("FO-3v §12 pass: deactivating a person drops their saved link and choice in the same transaction", (await db.foVideoPref.count({ where: { staffId: H3.id } })) === 0 && (await db.foVideoPref.count({ where: { staffId: H2.id } })) === 1);

  // ---------------------------------------------------------------------------------- DW6: never in a log or audit
  const audits = JSON.stringify(audit.entries);
  const urls = [LINK, LINK2, exact, "zoom.us/j/", "meet.example"];
  ok("FO-3v DW6 pass: the audit lines are there (meeting link changed, video choice changed, video link set (source: my link))",
    audit.entries.some((e) => e.action === "video.meeting_link_changed") && audit.entries.some((e) => e.action === "video.choice_changed")
      && audit.entries.some((e) => e.action === "booking.video_link_set" && e.summary === "Video link set (source: my link)."), audit.entries.map((e) => e.action));
  // Review m2: the real AuditPort (audit_event) on a save, then the table is read back as text.
  const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
  const { VideoService } = await import("../api/src/front-office/booking/video/service.ts");
  await new VideoService(db, { audit: auditEvent as never }).put({ firmId: A.id, staffId: H2.id, firmKey: "fo3v-a", roles: [], keys: [], duties: [], authTime: Date.now(), via: "local" }, { myMeetingLink: "https://meet.example/audit-room" });
  const realLines = await db.$queryRawUnsafe<{ n: number; leaked: number }[]>(`SELECT count(*) FILTER (WHERE action = 'video.meeting_link_changed')::int AS n, count(*) FILTER (WHERE row_to_json(a)::text ~ '(meet\\.example|zoom\\.us)')::int AS leaked FROM audit_event a`);
  ok("FO-3v DW6 pass/fail (review m2): through the real AuditPort the save writes its audit_event line, and no audit_event row holds a link", realLines[0].n >= 1 && realLines[0].leaked === 0, realLines);
  ok(`FO-3v DW6 fail: no link is in any audit line or any of the ${logged.filter((l) => !own(l)).length} captured log lines (console, stdout, stderr)`, !urls.some((u) => audits.includes(u)) && !logged.some((l) => !own(l) && urls.some((u) => l.includes(u))),
    logged.filter((l) => !own(l) && urls.some((u) => l.includes(u))).slice(0, 3));
} catch (e) {
  fail++; console.log(`FAIL  FO-3v: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 800)}`);
} finally {
  await app?.close();
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* left for prune-test-dbs.sh */ }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
