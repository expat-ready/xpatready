// FO-3pa (rows rev 16.23; Lead B's answers on PR #1830, 15 Nov; concept fo-3-booking r2 §3 BR-1, BR-2, BR-5, BR-8, BR-9,
// §6; AG-4-16..-20, -36..-38): the public booking answers, over HTTP on the feature's own public controller. Cases
// DW1..DW10, each with a passing and a failing case: a scratch database (every migration), one small Nest app with the
// public controller and the Booking provider, the real interim audit adapter (audit_event, as the running app), PF-0p's
// fake clock, jobs and mail, and the ArrivalPort fake. No model
// call (US$0). Dropped at the end.
//   tsx studio/tests/check_fo3pa_public_answers.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3pa_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const TZ = "America/Toronto";
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
type Res = { status: number; body: any; headers: Headers; text: string };
const call = async (base: string, method: string, path: string, body?: unknown): Promise<Res> => {
  const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b, headers: r.headers, text };
};

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
process.env.DATABASE_URL = URL;

const { Db, READ_SCOPE } = await import("../api/src/core.ts");
const { Booking, BOOKING_PORTS, BookingPublicController } = await import("../api/src/front-office/booking/public.controller.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const { copyFirmHoursTo } = await import("../api/src/front-office/booking-seed.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { BookingService } = await import("../api/src/front-office/booking/service.ts");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
const at = (s: string) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return wallToUtc(y, m, dd, h * 60 + mi, TZ)!; };
const iso = (s: string) => at(s).toISOString();

const clock = new FakeClock(at("2026-10-26 08:00"));   // Monday, EDT
const arrival = fakeArrival(), jobs = fakeJobs(clock), mail = fakeMail({ clock });
const ports = { audit: auditEvent as never, clock, jobs, mail, arrival, publicBaseUrl: "http://localhost:4430", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
@Module({ controllers: [BookingPublicController] as never[], providers: [Db, Booking, { provide: BOOKING_PORTS, useValue: ports }] as never[] }) class TestApp {}

let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const LINK = "https://meet.example/sample-room";
  const A = await db.platformFirm.create({ data: { key: "fo3pa-a", operatingName: "Sample Maple Immigration", countryCode: "CA", status: "ACTIVE", contactEmail: "hello@fo3pa-a.example",
    businessAddress: { unit: "4", street_number: "100", street_name: "Sample Street", city: "Toronto", province_state: "ON", postal_code: "M5V 0A1", country: "CA", phone: "+1 416 555 0100", owner_note: "SECRET-NOT-PUBLIC" } } });
  const N = await db.platformFirm.create({ data: { key: "fo3pa-n", operatingName: "Sample No Address", countryCode: "CA", status: "ACTIVE", contactEmail: "hello@fo3pa-n.example" } });
  const host = await db.platformStaff.create({ data: { firmId: A.id, email: "host@staff.example", displayName: "Sample Host" } });
  const hostN = await db.platformStaff.create({ data: { firmId: N.id, email: "hostn@staff.example", displayName: "Sample Host N" } });
  await copyFirmHoursTo(db, A.id, [host.id]);
  await copyFirmHoursTo(db, N.id, [hostN.id]);
  const type = (firmId: string, hostId: string, slug: string, name: string, extra: Record<string, unknown> = {}) =>
    db.foConsultationType.create({ data: { firmId, slug, name, modes: ["VIDEO", "PHONE"], hostStaffIds: [hostId], minutes: 30, ...extra } });
  const T = {
    free: await type(A.id, host.id, "free", "Free consultation"),
    noCancel: await type(A.id, host.id, "no-cancel", "Assessment call", { allowCancel: false, meetingLink: LINK }),
    noMove: await type(A.id, host.id, "no-move", "Business call", { allowReschedule: false }),
    hidden: await type(A.id, host.id, "hidden", "Hidden call", { showOnBookingPage: false }),
    retired: await type(A.id, host.id, "retired", "Retired call", { active: false }),
    n: await type(N.id, hostN.id, "free", "Free consultation"),
  };
  const ALL_IDS = [A.id, N.id, host.id, hostN.id, ...Object.values(T).map((t) => t.id)];
  const noIds = (x: unknown) => { const j = JSON.stringify(x); return !ALL_IDS.some((id) => j.includes(id)) && !/"(id|firmId|staffId|typeId|personId|prospectId)"/.test(j); };

  app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const go = (method: string, path: string, body?: unknown) => call(base, method, `/api/public${path}`, body);
  const page = (firm: string, slug: string) => go("GET", `/firms/${firm}/book/${slug}/slots?from=${encodeURIComponent(iso("2026-10-27 00:00"))}&to=${encodeURIComponent(iso("2026-10-31 00:00"))}`);
  /** Books from the type page like a person: the page's stamp, 5 s of typing, then the form. */
  const book = async (firm: string, slug: string, when: string, who: string, extra: Record<string, unknown> = {}) => {
    const p = await page(firm, slug);
    if (p.status !== 200) throw new Error(`page ${slug}: ${p.status}`);
    await clock.advance({ seconds: 5 });
    return go("POST", `/firms/${firm}/book/${slug}/bookings`, { givenNames: "Ana", familyName: `Sample ${who}`, email: `${who}@client.example`, mode: "VIDEO", startsAt: iso(when), timeZone: TZ, formStamp: p.body.formStamp, ...extra });
  };
  const rowOf = async (token: string) => { const t = await db.foBookingToken.findUniqueOrThrow({ where: { id: token.split(".")[0] } }); return db.foBooking.findUniqueOrThrow({ where: { id: t.bookingId } }); };
  const strip = (b: Record<string, unknown>) => { const { manageToken: _t, ...rest } = b; return rest; };
  const cancelLines = (bookingId: string) => db.auditEvent.findMany({ where: { entityKey: bookingId, action: "booking.cancelled" } });

  // ------------------------------------------------------------------------------------------------ the routes declare
  const open = (m: string) => Reflect.getMetadata(READ_SCOPE, (BookingPublicController.prototype as unknown as Record<string, object>)[m]);
  ok("FO-3pa routes: the list and the calendar file are open reads (the read guard admits a visitor; contracts §0.6)", open("list") === "open" && open("ics") === "open", [open("list"), open("ics")]);

  // ------------------------------------------------------------------------------------------------------------ DW1
  const list = await go("GET", "/firms/fo3pa-a/book");
  const slugs = Array.isArray(list.body?.types) ? list.body.types.map((t: { slug: string }) => t.slug) : [];
  ok("FO-3pa DW1 pass: the list shows the firm's active types shown on the page, by name (Assessment, Business, Free), as name, slug, length and modes only",
    list.status === 200 && JSON.stringify(slugs) === JSON.stringify(["no-cancel", "no-move", "free"]) && list.body.types.every((t: object) => JSON.stringify(Object.keys(t).sort()) === JSON.stringify(["minutes", "modes", "name", "slug"])) && list.body.types[2].minutes === 30, list.body);
  ok("FO-3pa DW1 fail: a hidden and a retired type are not listed, and the answer carries no id", !slugs.includes("hidden") && !slugs.includes("retired") && noIds(list.body) && !UUID_RE.test(list.text), list.text);
  const unknownSlug = await page("fo3pa-a", "no-such-type");
  const nf = [await go("GET", "/firms/no-such-firm/book"), await go("GET", "/firms/FO3PA-A/book"), await go("GET", `/firms/${A.id}/book`)];
  ok("FO-3pa DW1 fail: an unknown firm, a key in capitals and a firm id give the one not-found, identical to an unknown slug's (BR-2)",
    nf.every((r) => r.status === 404 && r.text === unknownSlug.text) && unknownSlug.status === 404, nf.map((r) => [r.status, r.text]));

  // ------------------------------------------------------------------------------------------------------------ DW2
  const shown = await page("fo3pa-a", "free"), hidden = await page("fo3pa-a", "hidden");
  ok("FO-3pa DW2 pass: a shown type's page answers with its times", shown.status === 200 && shown.body.slots.length > 0);
  await clock.advance({ seconds: 5 });
  const hiddenBook = await go("POST", "/firms/fo3pa-a/book/hidden/bookings", { givenNames: "Ana", familyName: "Sample", email: "hid@client.example", mode: "VIDEO", startsAt: iso("2026-10-27 13:00"), timeZone: TZ, formStamp: shown.body.formStamp });
  ok("FO-3pa DW2 fail: a hidden type's page and its booking form give exactly the unknown slug's not-found; nothing saved",
    hidden.status === 404 && hidden.text === unknownSlug.text && hiddenBook.status === 404 && hiddenBook.text === unknownSlug.text && await db.foBooking.count({ where: { typeId: T.hidden.id } }) === 0, [hidden.text, hiddenBook.text]);

  // ------------------------------------------------------------------------------------------------------------ DW3
  const wording = shown.body.consent.wordingId as string;
  const noTick = await book("fo3pa-a", "free", "2026-10-27 13:00", "notick");
  const callNoTick = arrival.calls.find((c) => c.person.email === "notick@client.example");
  ok("FO-3pa DW3 pass: booking with the tick left empty succeeds and records no marketing consent (AG-4-19 rule 3)",
    noTick.status === 201 && noTick.body.status === "SCHEDULED" && !!callNoTick && callNoTick.consent === undefined, [noTick.status, noTick.body, callNoTick]);
  const tick = await book("fo3pa-a", "free", "2026-10-27 14:00", "tick", { consent: true, consentWordingId: wording });
  const callTick = arrival.calls.filter((c) => c.person.email === "tick@client.example");
  ok("FO-3pa DW3 pass: with the tick, the booking carries one consent with the firm's wording id and the time it was given",
    tick.status === 201 && callTick.length === 1 && callTick[0].consent?.wordingId === wording && callTick[0].consent?.givenAt.getTime() === clock.now().getTime(), callTick);
  const falseTick = await book("fo3pa-a", "free", "2026-10-27 16:00", "falsetick", { consent: false, consentWordingId: wording });
  ok("FO-3pa DW3 fail: consent false sent with a wording id books with no consent (the id alone never makes one; review m)",
    falseTick.status === 201 && arrival.calls.find((c) => c.person.email === "falsetick@client.example")?.consent === undefined, falseTick.body);
  // BR-5: a firm with no consent sentence shows no box and still books; a tick there has nothing to agree to.
  const noWording = new BookingService(db, { ...ports, arrival: fakeArrival({ wording: null }) });
  const nwPage = await noWording.publicSlots("fo3pa-a", "free", {}, "10.0.0.9");
  await clock.advance({ seconds: 5 });
  const nwForm = { givenNames: "Ana", familyName: "Sample", email: "nowording@client.example", mode: "VIDEO", startsAt: iso("2026-10-27 10:00"), timeZone: TZ, formStamp: nwPage.formStamp };
  const nwBooked = await noWording.publicBook("fo3pa-a", "free", nwForm, "10.0.0.9");
  let nwTick = 0;
  try { await noWording.publicBook("fo3pa-a", "free", { ...nwForm, email: "nowording2@client.example", startsAt: iso("2026-10-27 10:30"), consent: true, consentWordingId: wording }, "10.0.0.9"); } catch (e) { nwTick = (e as { getStatus(): number }).getStatus(); }
  ok("FO-3pa DW3 pass: a firm with no consent sentence shows no box (consent null) and books without the tick (BR-5)", nwPage.consent === null && nwBooked.status === "SCHEDULED", nwPage.consent);
  ok("FO-3pa DW3 fail: at a firm with no consent sentence, a tick → 409 consent-wording-changed, nothing booked", nwTick === 409 && await db.foBooking.count({ where: { firmId: A.id, startsAt: at("2026-10-27 10:30") } }) === 0, nwTick);
  const before = arrival.calls.length;
  const badTick = await book("fo3pa-a", "free", "2026-10-27 15:00", "badtick", { consent: true, consentWordingId: "00000000-0000-4000-8000-000000000bad" });
  const tickNoId = await book("fo3pa-a", "free", "2026-10-27 15:00", "ticknoid", { consent: true });
  ok("FO-3pa DW3 fail: a tick naming another wording → 409 consent-wording-changed, a tick with no wording id → 422; neither books nor arrives",
    badTick.status === 409 && /consent-wording-changed/.test(badTick.body.type) && tickNoId.status === 422 && arrival.calls.length === before && await db.foBooking.count({ where: { firmId: A.id, startsAt: at("2026-10-27 15:00") } }) === 0, [badTick.body, tickNoId.body]);

  // ------------------------------------------------------------------------------------------------------------ DW4
  const want = { name: "Sample Maple Immigration", email: "hello@fo3pa-a.example", phone: "+1 416 555 0100", address: { unit: "4", streetNumber: "100", streetName: "Sample Street", city: "Toronto", provinceState: "ON", postalCode: "M5V 0A1", country: "CA" } };
  const manage = await go("GET", `/bookings/${noTick.body.manageToken}`);
  const answers = [list.body, shown.body, strip(noTick.body), manage.body];
  ok("FO-3pa DW4 pass: the list, type page, booking and manage answers carry the firm's operating name, email, phone and address",
    answers.every((a) => JSON.stringify(a.firm) === JSON.stringify(want)), answers.map((a) => a.firm));
  ok("FO-3pa DW4 pass: the type page, booking and manage answers carry the self-service limit in hours (4) and the type's switches",
    [shown.body.type, strip(noTick.body), manage.body].every((a) => a.selfServiceLimitHours === 4 && a.allowCancel === true && a.allowReschedule === true), [shown.body.type, manage.body]);
  ok("FO-3pa DW4 fail: no answer carries a staff, firm, type or person id, nor the business address's other keys",
    answers.every(noIds) && !answers.some((a) => JSON.stringify(a).includes("SECRET-NOT-PUBLIC")), answers);
  await db.platformFirm.update({ where: { id: N.id }, data: { businessAddress: { city: "Line\r\nBreak\u202eCity", phone: "  " } } });
  const mPage = await page("fo3pa-n", "free");
  ok("FO-3pa DW4 fail: line breaks and bidirectional characters in the firm's address are dropped, a blank phone is null (break m3)", mPage.body.firm.address?.city === "Line Break City" && mPage.body.firm.phone === null, mPage.body.firm);
  await db.platformFirm.update({ where: { id: N.id }, data: { businessAddress: Prisma.DbNull } });
  const nPage = await page("fo3pa-n", "free");
  ok("FO-3pa DW4 fail: a firm with no business address answers phone and address null, never an error", nPage.status === 200 && nPage.body.firm.phone === null && nPage.body.firm.address === null && nPage.body.firm.email === "hello@fo3pa-n.example", nPage.body.firm);

  // ------------------------------------------------------------------------------------------------------- DW5, DW9
  const nc = await book("fo3pa-a", "no-cancel", "2026-10-28 10:00", "nocancel");
  const ncView = await go("GET", `/bookings/${nc.body.manageToken}`);
  ok("FO-3pa DW9 pass: a type that allows cancelling shows the cancel action on its manage answer", manage.body.canCancel === true && manage.body.canReschedule === true, manage.body);
  ok("FO-3pa DW9 fail: a type with allowCancel false shows no cancel action (reschedule still offered)", ncView.status === 200 && ncView.body.canCancel === false && ncView.body.canReschedule === true && ncView.body.allowCancel === false, ncView.body);
  const ncRow = await rowOf(nc.body.manageToken);
  const ncCancel = await go("POST", `/bookings/${nc.body.manageToken}/cancel`, {});
  const ncAfter = await rowOf(nc.body.manageToken);
  ok("FO-3pa DW5 fail: allowCancel false gives a cancel attempt by link the refusal (409 NOT_ALLOWED_BY_LINK), the booking unchanged",
    ncCancel.status === 409 && ncCancel.body.code === "NOT_ALLOWED_BY_LINK" && ncAfter.status === "SCHEDULED" && ncAfter.sequence === ncRow.sequence && (await cancelLines(ncRow.id)).length === 0, [ncCancel.body, ncAfter.status]);
  const nm = await book("fo3pa-a", "no-move", "2026-10-28 11:00", "nomove");
  const nmMove = await go("POST", `/bookings/${nm.body.manageToken}/reschedule`, { startsAt: iso("2026-10-28 14:00") });
  const nmSlots = await go("GET", `/bookings/${nm.body.manageToken}/slots`);
  ok("FO-3pa DW5 fail: allowReschedule false refuses a move and its times by link (409 NOT_ALLOWED_BY_LINK), the booking unchanged",
    nmMove.status === 409 && nmMove.body.code === "NOT_ALLOWED_BY_LINK" && nmSlots.status === 409 && (await rowOf(nm.body.manageToken)).startsAt.toISOString() === iso("2026-10-28 11:00"), [nmMove.body, nmSlots.body]);
  // Switched off after the page loaded: the change re-reads the type under the row lock.
  const late = await book("fo3pa-a", "free", "2026-10-28 15:00", "late");
  const lateView = await go("GET", `/bookings/${late.body.manageToken}`);
  await db.foConsultationType.update({ where: { id: T.free.id }, data: { allowCancel: false } });
  const lateCancel = await go("POST", `/bookings/${late.body.manageToken}/cancel`);
  await db.foConsultationType.update({ where: { id: T.free.id }, data: { allowCancel: true } });
  ok("FO-3pa DW5 fail: cancelling switched off after the manage page loaded (it showed Cancel) is still refused, booking unchanged",
    lateView.body.canCancel === true && lateCancel.status === 409 && (await rowOf(late.body.manageToken)).status === "SCHEDULED", lateCancel.body);
  await db.foConsultationType.update({ where: { id: T.free.id }, data: { allowReschedule: false } });
  const lateMove = await go("POST", `/bookings/${late.body.manageToken}/reschedule`, { startsAt: iso("2026-10-28 16:00") });
  await db.foConsultationType.update({ where: { id: T.free.id }, data: { allowReschedule: true } });
  ok("FO-3pa DW5 fail: rescheduling switched off after the manage page loaded (it showed Reschedule) is still refused, booking unchanged",
    lateView.body.canReschedule === true && lateMove.status === 409 && lateMove.body.code === "NOT_ALLOWED_BY_LINK" && (await rowOf(late.body.manageToken)).startsAt.toISOString() === iso("2026-10-28 15:00"), lateMove.body);
  const okCancel = await go("POST", `/bookings/${late.body.manageToken}/cancel`);
  ok("FO-3pa DW5 pass: a type that allows it is cancelled by link (200 CANCELLED)", okCancel.status === 200 && okCancel.body.status === "CANCELLED", okCancel.body);

  // ------------------------------------------------------------------------------------------------------------ DW6
  const ic = await book("fo3pa-a", "free", "2026-10-29 10:00", "ics");
  await jobs.runDue();
  const mailed = mail.inbox("ics@client.example").find((m) => m.templateKey === "booking.booked");
  const mailedIcs = mailed?.attachments?.[0] ? new TextDecoder().decode(mailed.attachments[0].bytes) : "";
  const dl = await go("GET", `/bookings/${ic.body.manageToken}/ics`);
  const lines = (s: string, k: string) => s.split("\r\n").filter((l) => l.startsWith(`${k}:`) || l.startsWith(`${k};`));
  const KEYS = ["METHOD", "UID", "SEQUENCE", "DTSTART", "DTEND", "SUMMARY", "ORGANIZER", "ATTENDEE", "STATUS"];
  ok("FO-3pa DW6 pass: the .ics download equals the mailed invite (UID, SEQUENCE, UTC start and end, summary, organizer, attendee)",
    dl.status === 200 && !!mailedIcs && KEYS.every((k) => JSON.stringify(lines(dl.text, k)) === JSON.stringify(lines(mailedIcs, k)) && lines(dl.text, k).length === 1) && lines(dl.text, "DTSTART")[0] === `DTSTART:${iso("2026-10-29 10:00").replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    { dl: dl.text.slice(0, 400), mailed: mailedIcs.slice(0, 400) });
  ok("FO-3pa DW6 pass: it downloads as a calendar file (text/calendar, an attachment named invite.ics, not cached)",
    /^text\/calendar/.test(dl.headers.get("content-type") ?? "") && /attachment; filename="invite.ics"/.test(dl.headers.get("content-disposition") ?? "") && dl.headers.get("cache-control") === "no-store", [...dl.headers]);
  const moved = await go("POST", `/bookings/${ic.body.manageToken}/reschedule`, { startsAt: iso("2026-10-29 13:00") });
  const oldDl = await go("GET", `/bookings/${ic.body.manageToken}/ics`), newDl = await go("GET", `/bookings/${moved.body.manageToken}/ics`);
  ok("FO-3pa DW6 fail: after a move the old link's download is the one not-found; the new link's has SEQUENCE raised and the new time",
    moved.status === 200 && oldDl.status === 404 && oldDl.text === unknownSlug.text && newDl.status === 200 && lines(newDl.text, "UID")[0] === lines(dl.text, "UID")[0] && Number(lines(newDl.text, "SEQUENCE")[0].split(":")[1]) > Number(lines(dl.text, "SEQUENCE")[0].split(":")[1]) && lines(newDl.text, "DTSTART")[0] === `DTSTART:${iso("2026-10-29 13:00").replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`, [oldDl.status, newDl.text.slice(0, 300)]);
  await db.foBookingToken.update({ where: { id: moved.body.manageToken.split(".")[0] }, data: { voidedAt: clock.now() } });
  const voided = await go("GET", `/bookings/${moved.body.manageToken}/ics`), garbage = await go("GET", "/bookings/not-a-token/ics");
  ok("FO-3pa DW6 fail: a voided token and a garbage token give 404, identical to every other not-found", voided.status === 404 && garbage.status === 404 && voided.text === unknownSlug.text && garbage.text === unknownSlug.text, [voided.text, garbage.text]);
  ok("FO-3pa DW6 fail: the not-found is JSON, never a calendar download (break M2)",
    /^application\/json/.test(voided.headers.get("content-type") ?? "") && !voided.headers.get("content-disposition") && !garbage.headers.get("content-disposition"), [...voided.headers]);

  // ------------------------------------------------------------------------------------------------------------ DW7
  const REASON = "Sample reason: moving to another city";
  const rc = await book("fo3pa-a", "free", "2026-10-30 10:00", "reason");
  const rcRow = await rowOf(rc.body.manageToken);
  const tooLong = await go("POST", `/bookings/${rc.body.manageToken}/cancel`, { reason: "x".repeat(501) });
  const control = await go("POST", `/bookings/${rc.body.manageToken}/cancel`, { reason: "bad\u0007bell" });
  const rowNow = (id: string) => db.foBooking.findUniqueOrThrow({ where: { id } });
  ok("FO-3pa DW10 fail: a reason over 500 characters or with a control character → 422, the booking unchanged and no reason stored",
    tooLong.status === 422 && control.status === 422 && (await rowNow(rcRow.id)).status === "SCHEDULED" && (await rowNow(rcRow.id)).cancelReason === null, [tooLong.body, control.body]);
  const rcCancel = await go("POST", `/bookings/${rc.body.manageToken}/cancel`, { reason: `  ${REASON}  ` });
  const rcAudit = await cancelLines(rcRow.id);
  ok("FO-3pa DW10 pass: the reason (trimmed) is stored on the booking (cancel_reason) in the cancel's own write", rcCancel.status === 200 && (await rowNow(rcRow.id)).cancelReason === REASON && (await rowNow(rcRow.id)).status === "CANCELLED", await rowNow(rcRow.id));
  ok("FO-3pa DW10 pass: the audit entry says a reason was given and holds no part of its text",
    rcAudit.length === 1 && rcAudit[0].summary === "Consultation cancelled by the booker. A reason was given." && !JSON.stringify(rcAudit[0]).includes("moving") && !JSON.stringify(rcAudit[0]).includes("Sample reason"), rcAudit);
  const rcView = await go("GET", `/bookings/${rc.body.manageToken}`);
  const events = await db.moduleEvent.findMany({ where: { subjectId: rcRow.id } });
  ok("FO-3pa DW7 fail: the reason is never shown back: not in the cancel answer, its events or mails, and the cancelled link is the one not-found",
    !rcCancel.text.includes("moving to another city") && !JSON.stringify(events.map((e) => e.payload)).includes("moving")
      && !mail.sent.some((m) => JSON.stringify(m).includes("moving to another city")) && rcView.status === 404 && rcView.text === unknownSlug.text, [rcCancel.text, rcView.status]);
  const noReason = await book("fo3pa-a", "free", "2026-10-30 13:00", "noreason");
  const nrRow = await rowOf(noReason.body.manageToken);
  const nrCancel = await go("POST", `/bookings/${noReason.body.manageToken}/cancel`);
  ok("FO-3pa DW10 pass: a cancel with no body still works, stores NULL and its audit sentence names no reason",
    nrCancel.status === 200 && (await rowNow(nrRow.id)).cancelReason === null && (await cancelLines(nrRow.id))[0]?.summary === "Consultation cancelled by the booker.", nrCancel.body);
  // Break B1, B2, M1, m2: any reason the form takes is taken in full, or refused with 422, never a 500.
  const reasons = [["500 characters", "r".repeat(500)], ["an email address in it", "Please write to sample.person@client.example instead"], ["two lines", "First line\nsecond line"]] as const;
  const kept: unknown[] = [];
  for (const [i, [what, reason]] of reasons.entries()) {
    const b = await book("fo3pa-a", "free", `2026-10-30 ${String(14 + i).padStart(2, "0")}:00`, `reason${i}`);
    const r = await go("POST", `/bookings/${b.body.manageToken}/cancel`, { reason });
    const row = await rowOf(b.body.manageToken);
    const line = (await cancelLines(row.id))[0];
    kept.push({ what, status: r.status, stored: row.cancelReason?.slice(0, 60), summary: line?.summary });
    ok(`FO-3pa DW10 pass: a reason with ${what} cancels (200) and is stored whole on the booking, not in the audit (break B1, B2)`,
      r.status === 200 && r.body.status === "CANCELLED" && row.cancelReason === reason.replace("\n", " ") && line?.summary === "Consultation cancelled by the booker. A reason was given.", kept.at(-1));
  }
  const bad = await book("fo3pa-a", "free", "2026-10-30 09:00", "badreason");
  const badRow = await rowOf(bad.body.manageToken);
  const refusedReasons = await Promise.all(["x\ud800y", "right\u202eto left", "\u200b\u200b"].map((reason) => go("POST", `/bookings/${bad.body.manageToken}/cancel`, { reason })));
  ok("FO-3pa DW10 fail: a reason with broken UTF-16, a bidirectional override or only invisible characters → 422, never a 500; the booking unchanged (break M1, m2)",
    refusedReasons.every((r) => r.status === 422) && (await rowNow(badRow.id)).status === "SCHEDULED" && (await rowNow(badRow.id)).cancelReason === null, refusedReasons.map((r) => [r.status, r.body?.issues]));
  // The database's own rule: a reason only on a cancelled booking, at most 500 characters.
  const dbRefuses = async (sql: string) => { try { await db.$executeRawUnsafe(sql); return false; } catch { return true; } };
  ok("FO-3pa DW10 fail: the database refuses a reason on a booking that is not cancelled, and one over 500 characters",
    await dbRefuses(`UPDATE fo_booking SET cancel_reason = 'x' WHERE id = '${badRow.id}'`) && await dbRefuses(`UPDATE fo_booking SET cancel_reason = repeat('x', 501) WHERE id = '${rcRow.id}'`) && (await rowNow(rcRow.id)).cancelReason === REASON);

  // ------------------------------------------------------------------------------------------------------------ DW8
  const ncPage = await page("fo3pa-a", "no-cancel");
  ok("FO-3pa DW8 fail: the type page never carries the join link (its meetingLink is null, the link nowhere in the answer)", ncPage.status === 200 && ncPage.body.type.meetingLink === null && !ncPage.text.includes(LINK), ncPage.body.type);
  ok("FO-3pa DW8 pass: the confirmation and the manage answer of a confirmed video booking carry the join link", nc.body.joinLink === LINK && ncView.body.joinLink === LINK, [nc.body.joinLink, ncView.body.joinLink]);
  const phone = await book("fo3pa-a", "no-cancel", "2026-10-30 16:00", "phone", { mode: "PHONE", phone: "+1 416 555 0199" });
  const freeNoLink = strip(noTick.body);
  ok("FO-3pa DW8 fail: a phone booking, and a type with no link, answer joinLink null", phone.status === 201 && phone.body.joinLink === null && freeNoLink.joinLink === null, [phone.body.joinLink, freeNoLink.joinLink]);
  ok("FO-3pa DW8 fail: a cancelled booking's answer carries no join link", okCancel.body.joinLink === null && rcCancel.body.joinLink === null, [okCancel.body.joinLink]);

  // ---------------------------------------------------------------------------- the new routes are rate-limited
  const tight = new BookingService(db, { ...ports, limits: { slotsPerIp: 2, tokenPerIp: 2 } });
  const status = async (f: () => Promise<unknown>) => { try { await f(); return 200; } catch (e) { return (e as { getStatus(): number }).getStatus(); } };
  const listRuns = [await status(() => tight.publicList("fo3pa-a", "192.0.2.1")), await status(() => tight.publicList("fo3pa-a", "192.0.2.1")), await status(() => tight.publicList("fo3pa-a", "192.0.2.1")), await status(() => tight.publicList("fo3pa-a", "192.0.2.2"))];
  const live = await book("fo3pa-a", "free", "2026-10-30 11:00", "limits");
  const icsRuns = [await status(() => tight.publicIcs(live.body.manageToken, "192.0.2.3")), await status(() => tight.publicIcs(live.body.manageToken, "192.0.2.3")), await status(() => tight.publicIcs(live.body.manageToken, "192.0.2.3"))];
  ok("FO-3pa door pass: the list and the calendar file answer within the per-IP limit, and another address is not held back", listRuns[0] === 200 && listRuns[1] === 200 && listRuns[3] === 200 && icsRuns[0] === 200 && icsRuns[1] === 200, { listRuns, icsRuns });
  ok("FO-3pa door fail: past the per-IP limit the list and the calendar file answer 429 (contracts §0.6)", listRuns[2] === 429 && icsRuns[2] === 429, { listRuns, icsRuns });
} catch (e) {
  fail++;
  console.log(`FAIL  FO-3pa: the check stopped — ${e instanceof Error ? e.stack : String(e)}`);
} finally {
  await app?.close().catch(() => undefined);
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
