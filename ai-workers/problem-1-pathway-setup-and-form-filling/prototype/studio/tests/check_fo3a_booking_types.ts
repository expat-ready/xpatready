// FO-3a part 1a (brief lead-b-briefs/FO-3a.md with P-626-order.md A2; AG-4-9 rules 1-7, AG-4-10, AG-4-8; C5): the
// booking-type settings API over HTTP behind PF-4's guard, on the six roles PF-3 seeds. Cases DW1..DW11 of the brief,
// each with a passing and a failing case: a scratch database (every migration; DW11 also a copy of main's schema
// migrated up), one small Nest app with the booking-type, staff booking and public controllers, the Booking provider,
// the real interim audit adapter (audit_event), PF-0p's fake clock, jobs and mail and the ArrivalPort fake. No model call
// (US$0). Dropped at the end.
//   tsx studio/tests/check_fo3a_booking_types.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeArrival } from "../ports/arrival.ts";
import { FakeClock } from "../ports/clock.ts";
import { fakeJobs } from "../ports/jobs.ts";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo3a_${process.pid}`, OLD = `xr_studio_fo3a_old_${process.pid}`;
const urlOf = (d: string) => `postgresql://xr_studio@127.0.0.1:54329/${d}`, URL = urlOf(DB);
const TZ = "America/Toronto", THIS = "20261116090000_fo3a_booking_types";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
type Res = { status: number; body: any };
const call = async (base: string, method: string, path: string, token?: string, body?: unknown): Promise<Res> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let b: any = text; try { b = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, body: b };
};
const migrations = readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort();
const migrate = (d: string, list: string[]) => { for (const m of list) execFileSync(join(BIN, "psql"), [urlOf(d), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, m, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] }); };
const psql = (d: string, q: string) => execFileSync(join(BIN, "psql"), [urlOf(d), "-v", "ON_ERROR_STOP=1", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

for (const d of [DB, OLD]) { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", d]); execFileSync(join(BIN, "createdb"), [...PG, d]); }
migrate(DB, migrations);
process.env.DATABASE_URL = URL;
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_POOL_MFA_REQUIRED", "PLATFORM_LOCAL_SECRET"]) delete process.env[k];

const { Db } = await import("../api/src/core.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { Booking, BOOKING_PORTS, BookingPublicController } = await import("../api/src/front-office/booking/public.controller.ts");
const { BookingStaffController } = await import("../api/src/front-office/booking/staff.controller.ts");
const { BookingTypes, BookingTypesController } = await import("../api/src/front-office/booking/settings/types.controller.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const { copyFirmHoursTo } = await import("../api/src/front-office/booking-seed.ts");
const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
const { CLOSED_DAYS, writeSetting } = await import("../api/src/platform/settings.ts");
const feature = (await import("../api/src/features/front-office-booking-settings.ts")).default;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL, options: "-c TimeZone=UTC" }) });
const at = (s: string) => { const [d, t] = s.split(" "); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number); return wallToUtc(y, m, dd, h * 60 + mi, TZ)!; };
const iso = (s: string) => at(s).toISOString();

const clock = new FakeClock(at("2026-10-26 08:00"));   // Monday, EDT
const arrival = fakeArrival(), jobs = fakeJobs(clock);
const ports = { audit: auditEvent as never, clock, jobs, mail: fakeMail({ clock }), arrival, publicBaseUrl: "http://localhost:4431", limits: { bookPerIp: 1000, bookPerFirm: 1000, slotsPerIp: 1000, tokenPerIp: 1000 } };
const identity = new LocalIdentity("fo3a-check-signing-key-0123456789abcdef0", () => Date.now());
const pclock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const providers = [Db, { provide: PlatformClock, useValue: pclock }, { provide: IDENTITY_PORT, useValue: identity }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
  Booking, { provide: BOOKING_PORTS, useValue: ports }, BookingTypes];
@Module({ controllers: [BookingTypesController, BookingStaffController, BookingPublicController] as never[], providers: providers as never[] }) class TestApp {}

let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
try {
  // ---------------------------------------------------------------------------------------------------------- set-up
  const firm = (key: string) => db.platformFirm.create({ data: { key, operatingName: `Sample ${key}`, countryCode: "CA", status: "ACTIVE", contactEmail: `${key}@firm.example` } });
  const [A, B] = [await firm("fo3a-a"), await firm("fo3a-b")];
  const ws = await db.workspace.create({ data: { key: "fo3a-check", label: "FO-3a check" } });
  await writeSetting(db, { firmId: A.id, key: CLOSED_DAYS.key, value: ["2026-10-28"], by: "seed:fo3a", workspaceId: ws.id });
  const person = async (firmId: string, n: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${n}@staff.example`, displayName: `Sample ${n}` } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as never, grantedBy: "seed:fo3a" } });
    return { id: s.id, token: identity.issue(s.id, { authTimeMs: Date.now() - 1000, secondStep: true }) };
  };
  const ROLES = ["OWNER", "ADMIN", "CASE_MANAGER", "CASE_OFFICER", "BILLING_FINANCE", "READ_ONLY"] as const;
  const P: Record<(typeof ROLES)[number], { id: string; token: string }> = {} as never;
  for (const r of ROLES) P[r] = await person(A.id, r.toLowerCase(), r);
  const BO = await person(B.id, "b-owner", "OWNER");
  await copyFirmHoursTo(db, A.id, [P.OWNER.id, P.ADMIN.id]);
  await copyFirmHoursTo(db, B.id, [BO.id]);
  const pid = arrival.addPerson(A.id, { givenNames: "Lee", familyName: "Sample", email: "lee@client.example" });

  app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1");
  const base = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  const T = (method: string, path: string, who: { token: string } = P.OWNER, b?: unknown) => call(base, method, `/api/front-office/booking-types${path}`, who.token, b);
  const staff = (method: string, path: string, who: { token: string } = P.OWNER, b?: unknown) => call(base, method, `/api/front-office/bookings${path}`, who.token, b);
  const pub = (method: string, path: string, b?: unknown) => call(base, method, `/api/public${path}`, undefined, b);
  const make = async (extra: Record<string, unknown> = {}, who = P.OWNER) => { const r = await T("POST", "", who, { name: "Free consultation", minutes: 30, modes: ["VIDEO", "PHONE"], hostStaffIds: [P.OWNER.id], ...extra }); if (r.status !== 201) throw new Error(`create: ${JSON.stringify(r)}`); return r.body; };
  const typeRows = () => db.foConsultationType.count({ where: { firmId: A.id } });
  const pubBook = async (slug: string, when: string, who: string) => {
    const p = await pub("GET", `/firms/fo3a-a/book/${slug}/slots?from=${encodeURIComponent(iso("2026-10-27 00:00"))}&to=${encodeURIComponent(iso("2026-10-31 00:00"))}`);
    if (p.status !== 200) return p;
    await clock.advance({ seconds: 5 });
    return pub("POST", `/firms/fo3a-a/book/${slug}/bookings`, { givenNames: "Ana", familyName: `Sample ${who}`, email: `${who}@client.example`, mode: "VIDEO", startsAt: iso(when), timeZone: TZ, formStamp: p.body.formStamp });
  };
  const staffBook = (typeId: string, when: string, mode = "VIDEO") => staff("POST", "", P.OWNER, { typeId, personId: pid, mode, startsAt: iso(when), timeZone: TZ });
  const listedSlugs = async () => ((await pub("GET", "/firms/fo3a-a/book")).body.types as { slug: string }[]).map((t) => t.slug);
  ok("FO-3a routes: the feature file lists the booking-type controller and its service", (feature.controllers as unknown[]).includes(BookingTypesController) && (feature.providers as unknown[]).includes(BookingTypes));

  // ------------------------------------------------------------------------------------- DW1: fields (AG-4-9 rule 1)
  const n80 = "N".repeat(80), n81 = "N".repeat(81);
  const okSaves = [await T("POST", "", P.OWNER, { name: n80, minutes: 30, modes: ["VIDEO"] }), await T("POST", "", P.OWNER, { name: "Short call", minutes: 5, modes: ["VIDEO"] }),
    await T("POST", "", P.OWNER, { name: "Long call", minutes: 480, modes: ["VIDEO"], description: "D".repeat(1000), colour: "C8" })];
  ok("FO-3a DW1 pass: an 80-character name, lengths 5 and 480 and a 1,000-character description save (201)", okSaves.every((r) => r.status === 201) && okSaves[2].body.colour === "C8", okSaves.map((r) => [r.status, r.body?.detail]));
  const before1 = await typeRows();
  const bad = { n81: await T("POST", "", P.OWNER, { name: n81, minutes: 30, modes: ["VIDEO"] }), m4: await T("POST", "", P.OWNER, { name: "X four", minutes: 4, modes: ["VIDEO"] }),
    m481: await T("POST", "", P.OWNER, { name: "X 481", minutes: 481, modes: ["VIDEO"] }), d1001: await T("POST", "", P.OWNER, { name: "X desc", minutes: 30, modes: ["VIDEO"], description: "D".repeat(1001) }),
    colour: await T("POST", "", P.OWNER, { name: "X colour", minutes: 30, modes: ["VIDEO"], colour: "PINK" }) };
  ok("FO-3a DW1 fail: an 81-character name → 422 on field name with \"Name must be 1 to 80 characters.\"", bad.n81.status === 422 && bad.n81.body.fields?.name === "Name must be 1 to 80 characters." && bad.n81.body.detail === "Name must be 1 to 80 characters.", bad.n81);
  ok("FO-3a DW1 fail: lengths 4 and 481 → 422 \"Length must be 5 to 480 minutes.\"; a 1,001-character description and a colour outside the eight → 422; nothing saved",
    bad.m4.status === 422 && bad.m4.body.fields?.minutes === "Length must be 5 to 480 minutes." && bad.m481.status === 422 && bad.m481.body.fields?.minutes === "Length must be 5 to 480 minutes."
      && bad.d1001.status === 422 && !!bad.d1001.body.fields?.description && bad.colour.status === 422 && !!bad.colour.body.fields?.colour && await typeRows() === before1, bad);

  // ------------------------------------------------------------------------------------------ DW2: slugs (rule 2)
  const free1 = await make(), free2 = await make();
  const manage = await make({ name: "Manage" });
  ok("FO-3a DW2 pass: \"Free consultation\" gets free-consultation, a second gets free-consultation-2, \"Manage\" gets manage-2", free1.slug === "free-consultation" && free2.slug === "free-consultation-2" && manage.slug === "manage-2", [free1.slug, free2.slug, manage.slug]);
  const usedSlug = await T("PATCH", `/${free2.id}`, P.OWNER, { slug: "free-consultation", version: free2.version });
  const reserved = [await T("PATCH", `/${free2.id}`, P.OWNER, { slug: "manage", version: free2.version }), await T("POST", "", P.OWNER, { name: "Mine", slug: "manage", minutes: 30, modes: ["VIDEO"] })];
  ok("FO-3a DW2 fail: editing a slug to a used one → 409 \"This web address is already used.\"; the slug manage → 422 \"This web address is reserved.\" (edit and create)",
    usedSlug.status === 409 && usedSlug.body.fields?.slug === "This web address is already used." && reserved.every((r) => r.status === 422 && r.body.fields?.slug === "This web address is reserved.")
      && (await db.foConsultationType.findUniqueOrThrow({ where: { id: free2.id } })).slug === "free-consultation-2", [usedSlug, reserved]);
  const delFree1 = await T("DELETE", `/${free1.id}`);
  const reuse = await T("PATCH", `/${free2.id}`, P.OWNER, { slug: "free-consultation", version: free2.version });
  ok("FO-3a DW2 pass: a deleted type's slug can be used again (free-consultation freed by deleting the first)", delFree1.status === 200 && reuse.status === 200 && reuse.body.slug === "free-consultation", [delFree1, reuse]);
  const badShape = await T("PATCH", `/${free2.id}`, P.OWNER, { slug: "Free Consultation", version: reuse.body.version });
  ok("FO-3a DW2 fail: a slug that is not lower-case words joined by - → 422 on field slug", badShape.status === 422 && !!badShape.body.fields?.slug, badShape);
  const pub1 = reuse.body;   // "Free consultation", slug free-consultation, public

  // --------------------------------------------------------------------------------------- DW3: duplicate (rule 3)
  const src = await make({ name: "Assessment", minutes: 45, modes: ["PHONE", "IN_PERSON"], hostStaffIds: [P.OWNER.id, P.ADMIN.id], description: "Sample", colour: "C3", purpose: "OTHER", allowCancel: false, slotIntervalMinutes: 15 });
  await db.foConsultationType.update({ where: { id: src.id }, data: { gapAfterMinutes: 20, minNoticeMinutes: 600 } });
  const srcBooking = await staffBook(src.id, "2026-10-27 13:00", "PHONE");
  if (srcBooking.status !== 201) throw new Error(`source booking: ${JSON.stringify(srcBooking)}`);
  const dup = await T("POST", `/${src.id}/duplicate`);
  const same = ["minutes", "modes", "hostStaffIds", "description", "colour", "purpose", "allowCancel", "allowReschedule", "showOnBookingPage", "active", "slotIntervalMinutes", "meetingLink"].every((k) => JSON.stringify(dup.body[k]) === JSON.stringify(src[k]));
  ok("FO-3a DW3 pass: duplicate copies every field (hosts, modes, timings) and names it \"Assessment (copy)\" with its own slug", dup.status === 201 && same && dup.body.name === "Assessment (copy)" && dup.body.slug === "assessment-copy"
    && dup.body.timings.gapAfterMinutes === 20 && dup.body.timings.minNoticeMinutes === 600 && dup.body.id !== src.id && dup.body.version === 1, dup.body);
  ok("FO-3a DW3 fail: the copy has no booking (the source keeps its one)", await db.foBooking.count({ where: { typeId: dup.body.id } }) === 0 && await db.foBooking.count({ where: { typeId: src.id } }) === 1);

  // ------------------------------------------------------------------------- DW4: switch off and delete (rules 4, 5)
  const off = await make({ name: "Switch me" }), gone = await make({ name: "Delete me" });
  const offBooking = await staffBook(off.id, "2026-10-27 10:00"), goneBooking = await staffBook(gone.id, "2026-10-29 10:00");
  const wasListed = (await listedSlugs()).includes("switch-me");
  const offR = await T("POST", `/${off.id}/switch-off`), goneR = await T("DELETE", `/${gone.id}`);
  const afterOff = [await staffBook(off.id, "2026-10-27 11:00"), await staffBook(gone.id, "2026-10-27 11:00"), await pubBook("switch-me", "2026-10-27 14:00", "p1"), await pubBook("delete-me", "2026-10-27 14:00", "p2")];
  const nowListed = await listedSlugs();
  ok("FO-3a DW4 fail: a switched-off or deleted type cannot be booked by staff (404, the type's not-found) nor by the public door (the one not-found); a switched-off type leaves the public list",
    offR.status === 200 && offR.body.active === false && goneR.status === 200 && goneR.body.futureBookings === 1 && wasListed && !nowListed.includes("switch-me") && !nowListed.includes("delete-me")
      && afterOff.every((r) => r.status === 404) && afterOff[2].body.detail === "This page is not available.", { offR, goneR, afterOff, nowListed });
  const offShow = await staff("GET", `/${offBooking.body.id}`), goneShow = await staff("GET", `/${goneBooking.body.id}`);
  const goneMove = await staff("POST", `/${goneBooking.body.id}/reschedule`, P.OWNER, { startsAt: iso("2026-10-29 11:00") });
  ok("FO-3a DW4 pass: their bookings stay; the deleted type's future booking still shows and can be rescheduled (AG-4-9 test 4)",
    offShow.status === 200 && offShow.body.status === "SCHEDULED" && goneShow.status === 200 && goneMove.status === 200 && goneMove.body.startsAt === iso("2026-10-29 11:00"), { offShow, goneShow, goneMove });
  const onR = await T("POST", `/${off.id}/switch-on`);
  ok("FO-3a DW4 pass: switched on again, it is listed and bookable; the deleted one is gone from staff lists (GET, list)",
    onR.status === 200 && (await listedSlugs()).includes("switch-me") && (await T("GET", `/${gone.id}`)).status === 404 && !((await T("GET", "")).body.types as { id: string }[]).some((t) => t.id === gone.id));

  // --------------------------------------------------------------------------------- DW5: edits keep bookings (rule 6)
  const b30 = await staffBook(pub1.id, "2026-10-27 15:00");
  const edit45 = await T("PATCH", `/${pub1.id}`, P.OWNER, { minutes: 45, version: pub1.version });
  const row30 = await db.foBooking.findUniqueOrThrow({ where: { id: b30.body.id } });
  ok("FO-3a DW5 pass: editing the length 30 → 45 leaves the existing booking at 30 minutes", edit45.status === 200 && edit45.body.minutes === 45 && row30.endsAt.getTime() - row30.startsAt.getTime() === 30 * 60_000, [edit45.status, row30]);
  const b45 = await staffBook(pub1.id, "2026-10-29 15:00");
  ok("FO-3a DW5 fail: a booking made after the edit is 45 minutes, not 30", b45.status === 201 && new Date(b45.body.endsAt).getTime() - new Date(b45.body.startsAt).getTime() === 45 * 60_000, b45);

  // ------------------------------------------------------------------------------------ DW6: optimistic save (rule 7)
  const v = edit45.body.version;
  const first = await T("PATCH", `/${pub1.id}`, P.ADMIN, { name: "Free consultation call", version: v });
  const snap = await db.foConsultationType.findUniqueOrThrow({ where: { id: pub1.id } });
  const stale = await T("PATCH", `/${pub1.id}`, P.OWNER, { name: "Overwritten", minutes: 60, version: v });
  ok("FO-3a DW6 pass: a save with the version read saves and moves the version on", first.status === 200 && first.body.version === v + 1 && first.body.name === "Free consultation call", first);
  ok("FO-3a DW6 fail: a save with an old version → 409 \"Someone else changed this type. Reload to see their changes.\" and nothing changes",
    stale.status === 409 && stale.body.detail === "Someone else changed this type. Reload to see their changes." && JSON.stringify(await db.foConsultationType.findUniqueOrThrow({ where: { id: pub1.id } })) === JSON.stringify(snap), stale);
  const cur = (await db.foConsultationType.findUniqueOrThrow({ where: { id: pub1.id } })).version;
  const racers = await Promise.all(Array.from({ length: 6 }, (_, i) => T("PATCH", `/${pub1.id}`, P.OWNER, { description: `Racer ${i}`, version: cur })));
  ok("FO-3a DW6 fail: six parallel saves with the same version → exactly one 200, five 409, the version up by one (the row lock, review m2)",
    racers.filter((r) => r.status === 200).length === 1 && racers.filter((r) => r.status === 409).length === 5 && (await db.foConsultationType.findUniqueOrThrow({ where: { id: pub1.id } })).version === cur + 1, racers.map((r) => r.status));
  first.body.version = cur + 1;
  const noVersion = await T("PATCH", `/${pub1.id}`, P.OWNER, { name: "No version" });
  ok("FO-3a DW6 fail: a save without a version → 422", noVersion.status === 422 && !!noVersion.body.fields?.version, noVersion);

  // ------------------------------------------------------------------------------------------- DW7: purpose (AG-4-10)
  const cr = await make({ name: "Document review call", purpose: "CASE_REVIEW" }), fu = await make({ name: "Follow up call", purpose: "FOLLOW_UP" });
  const crPage = await pubBook(cr.slug, "2026-10-27 14:00", "p3"), fuPage = await pubBook(fu.slug, "2026-10-27 14:00", "p4");
  ok("FO-3a DW7 pass: CASE_REVIEW and FOLLOW_UP save and are never on the booking page (not listed; their link is the one not-found)",
    !(await listedSlugs()).some((s) => s === cr.slug || s === fu.slug) && crPage.status === 404 && fuPage.status === 404 && crPage.body.detail === "This page is not available." && cr.onBookingPage === false, [crPage, fuPage]);
  const sw = await make({ name: "Public then case" });
  const swB = await staffBook(sw.id, "2026-10-30 10:00");
  const wasPub = (await listedSlugs()).includes(sw.slug);
  const toCase = await T("PATCH", `/${sw.id}`, P.OWNER, { purpose: "CASE_REVIEW", version: sw.version });
  ok("FO-3a DW7 pass: changing a public type to CASE_REVIEW removes it from the page at once and keeps its booking",
    wasPub && toCase.status === 200 && !(await listedSlugs()).includes(sw.slug) && (await db.foBooking.findUniqueOrThrow({ where: { id: swB.body.id } })).status === "SCHEDULED", toCase);
  const before7 = await typeRows();
  const paid = [await T("POST", "", P.OWNER, { name: "Strategy session", purpose: "PAID_CONSULT", minutes: 60, modes: ["VIDEO"] }), await T("PATCH", `/${sw.id}`, P.OWNER, { purpose: "PAID_CONSULT", version: toCase.body.version })];
  ok("FO-3a DW7 fail: PAID_CONSULT → 422 on field purpose until map row 44, nothing saved", paid.every((r) => r.status === 422 && r.body.code === "PAID_NOT_AVAILABLE" && !!r.body.fields?.purpose) && await typeRows() === before7
    && (await db.foConsultationType.findUniqueOrThrow({ where: { id: sw.id } })).purpose === "CASE_REVIEW", paid);

  // ---------------------------------------------------------------------------------------------- DW8: keys (C5)
  const cmWrites = [await T("POST", "", P.CASE_MANAGER, { name: "CM type", minutes: 30, modes: ["VIDEO"] }), await T("PATCH", `/${pub1.id}`, P.CASE_MANAGER, { name: "CM edit", version: first.body.version }),
    await T("DELETE", `/${pub1.id}`, P.CASE_MANAGER), await T("POST", `/${pub1.id}/duplicate`, P.CASE_MANAGER), await T("POST", `/${pub1.id}/switch-off`, P.CASE_MANAGER)];
  ok("FO-3a DW8 fail: a Case Manager creating, editing, deleting, duplicating or switching off a type → 403 MISSING_PERMISSION, nothing changed",
    cmWrites.every((r) => r.status === 403 && r.body.code === "MISSING_PERMISSION") && (await db.foConsultationType.findUniqueOrThrow({ where: { id: pub1.id } })).version === first.body.version, cmWrites.map((r) => [r.status, r.body?.code]));
  const reads = [await T("GET", "", P.CASE_MANAGER), await T("GET", `/${pub1.id}`, P.CASE_MANAGER), await T("GET", `/${pub1.id}/preview`, P.CASE_MANAGER), await T("GET", "", P.CASE_OFFICER), await T("GET", "", P.READ_ONLY), await T("GET", "", P.ADMIN)];
  ok("FO-3a DW8 pass: a Case Manager lists, reads and previews (200), as do a Case Officer, Read-only and an Admin", reads.every((r) => r.status === 200), reads.map((r) => r.status));
  const bf = [await T("GET", "", P.BILLING_FINANCE), await T("GET", `/${pub1.id}/preview`, P.BILLING_FINANCE), await call(base, "GET", "/api/front-office/booking-types")];
  ok("FO-3a DW8 fail: Billing/Finance listing or previewing → 403 MISSING_PERMISSION; no sign-in → 401", bf[0].status === 403 && bf[0].body.code === "MISSING_PERMISSION" && bf[1].status === 403 && bf[2].status === 401, bf.map((r) => [r.status, r.body?.code]));

  // ----------------------------------------------------------------------------------------------- DW9: preview
  const counts = async () => [await db.foBooking.count(), await db.foConsultationType.count(), await db.foBookingToken.count(), await db.auditEvent.count(), await db.moduleEvent.count()].join(",");
  const c0 = await counts();
  const q = `?from=${encodeURIComponent(iso("2026-10-27 00:00"))}&to=${encodeURIComponent(iso("2026-10-30 00:00"))}`;
  const pv = await T("GET", `/${off.id}/preview${q}`);
  const pubSlots = await pub("GET", `/firms/fo3a-a/book/switch-me/slots${q}`);
  const day = (d: string) => (pv.body.days as { date: string; slots: { startsAt: string }[]; reason: string | null }[]).find((x) => x.date === d);
  ok("FO-3a DW9 pass: the preview gives exactly the public page's slots, by day in the firm's zone; Tue and Thu have times",
    pv.status === 200 && JSON.stringify(pv.body.days.flatMap((x: { slots: { startsAt: string }[] }) => x.slots.map((s) => s.startsAt))) === JSON.stringify(pubSlots.body.slots.map((s: { startsAt: string }) => s.startsAt))
      && day("2026-10-27")!.slots.length > 0 && day("2026-10-27")!.reason === null && pv.body.timeZone === TZ, { pv: pv.body?.days?.map((x: { date: string; reason: string }) => [x.date, x.reason]), pub: pubSlots.body?.slots?.length });
  ok("FO-3a DW9 fail: the firm's closed day (Wed 28 Oct) shows no slots and \"Closed day\"", day("2026-10-28")?.slots.length === 0 && day("2026-10-28")?.reason === "Closed day", day("2026-10-28"));
  const noHost = await make({ name: "Nobody hosts", hostStaffIds: [] });
  const officerOnly = await make({ name: "Officer hosts", hostStaffIds: [P.CASE_OFFICER.id] });   // a host with no hours
  const pvNo = await T("GET", `/${noHost.id}/preview${q}`), pvOff = await T("GET", `/${officerOnly.id}/preview${q}`);
  ok("FO-3a DW9 fail: a type with no host shows \"This type has no host\"; a host with no hours shows \"No host hours\" on an open day",
    pvNo.status === 200 && pvNo.body.reason === "This type has no host" && pvNo.body.days.every((x: { slots: unknown[]; reason: string }) => !x.slots.length && x.reason === "This type has no host")
      && pvOff.body.days.find((x: { date: string }) => x.date === "2026-10-27")?.reason === "No host hours", [pvNo.body, pvOff.body?.days]);
  // Fill Thu 29 Oct for the Admin's only type: every slot that day taken → "Fully booked".
  const solo = await make({ name: "Solo admin", hostStaffIds: [P.ADMIN.id], minutes: 240 });
  for (const h of ["2026-10-29 09:00", "2026-10-29 13:00"]) await staffBook(solo.id, h);
  const c1 = await counts();
  const pvFull = await T("GET", `/${solo.id}/preview${q}`);
  const dubai = await T("GET", `/${solo.id}/preview${q}&tz=Asia/Dubai`);
  ok("FO-3a DW9 pass: a day whose times are all taken shows \"Fully booked\"; a time zone shows the times in it (AG-4-8's Dubai example)",
    pvFull.body.days.find((x: { date: string }) => x.date === "2026-10-29")?.reason === "Fully booked" && dubai.status === 200 && dubai.body.timeZone === "Asia/Dubai" && /Asia\/Dubai/.test(dubai.body.days.find((x: { slots: unknown[] }) => x.slots.length)?.slots[0].label ?? ""), [pvFull.body?.days, dubai.body?.days?.[0]]);
  ok("FO-3a DW9 fail: a preview writes no row (bookings, types, tokens, audit, outbox counted before and after)", await counts() === c1 && c0 !== "", [c1, await counts()]);
  const badRange = await T("GET", `/${solo.id}/preview?from=${encodeURIComponent(iso("2026-10-27 00:00"))}&to=${encodeURIComponent(iso("2027-01-27 00:00"))}`);
  ok("FO-3a DW9 fail: more than 62 days → 422", badRange.status === 422, badRange);
  const past = await T("GET", `/${solo.id}/preview?from=${encodeURIComponent(iso("2026-10-24 00:00"))}&to=${encodeURIComponent(iso("2026-10-26 00:00"))}`);
  const offPv = await T("GET", `/${officerOnly.id}/preview${q}`);
  ok("FO-3a DW9 pass: days before now say \"In the past\"; a preview answer says whether visitors see the type (onBookingPage)",
    past.body.days.every((x: { reason: string }) => x.reason === "In the past") && pvFull.body.type.onBookingPage === true && (await T("POST", `/${officerOnly.id}/switch-off`)).status === 200 && (await T("GET", `/${officerOnly.id}/preview${q}`)).body.type.onBookingPage === false && offPv.status === 200, [past.body?.days, offPv.body?.type]);

  // ------------------------------------------------------------------- breaker's findings (break-report.md, c11de56)
  const race = await Promise.all(Array.from({ length: 12 }, () => T("POST", "", P.OWNER, { name: "Race me", minutes: 30, modes: ["VIDEO"] })));
  const raceSlugs = race.map((r) => r.body?.slug);
  ok("FO-3a break M1 pass: 12 parallel creates of one name all save (201), each with its own slug", race.every((r) => r.status === 201) && new Set(raceSlugs).size === 12 && raceSlugs.includes("race-me") && raceSlugs.includes("race-me-12"), race.map((r) => [r.status, r.body?.slug ?? r.body?.detail]));
  const before0 = await typeRows();
  const nul = [await T("POST", "", P.OWNER, { name: "Nul text", minutes: 30, modes: ["VIDEO"], description: "a\u0000b" }), await T("PATCH", `/${solo.id}`, P.OWNER, { description: "bidi \u202e here", version: solo.version }),
    await T("POST", "", P.OWNER, { name: "Joined\u2060name", minutes: 30, modes: ["VIDEO"] }), await T("POST", "", P.OWNER, { name: "Lone \ud800 half", minutes: 30, modes: ["VIDEO"] })];
  ok("FO-3a break M2 fail: a NUL byte or bidi override in a description, a word joiner or a lone surrogate in a name → 422 on that field, nothing saved",
    nul[0].status === 422 && !!nul[0].body.fields?.description && nul[1].status === 422 && !!nul[1].body.fields?.description && nul[2].status === 422 && !!nul[2].body.fields?.name && nul[3].status === 422 && await typeRows() === before0, nul.map((r) => [r.status, r.body?.fields]));
  const lines2 = await T("POST", "", P.OWNER, { name: "Multi line", minutes: 30, modes: ["VIDEO"], description: "Line one\nLine two\tend" });
  const emoji = await T("POST", "", P.OWNER, { name: "🙂".repeat(80), minutes: 30, modes: ["VIDEO"] });
  ok("FO-3a break M2/m3 pass: a description with line breaks and tabs saves; a name of 80 emoji counts 80 characters and saves", lines2.status === 201 && emoji.status === 201, [lines2.status, emoji.body?.detail]);
  const emDup = await T("POST", `/${emoji.body.id}/duplicate`);
  ok("FO-3a break m2 pass: duplicating it keeps whole emoji (73 and \" (copy)\", no U+FFFD)", emDup.status === 201 && !emDup.body.name.includes("\ufffd") && [...emDup.body.name].length === 80, emDup.body?.name);
  const other = await make({ name: "Other chat", purpose: "OTHER" });
  const otherBook = await pubBook(other.slug, "2026-10-29 16:00", "p5");
  ok("FO-3a break M3 pass: an OTHER type is public (AG-4-10 rule 4): listed, bookable, marked on the booking page", (await listedSlugs()).includes(other.slug) && otherBook.status === 201 && other.onBookingPage === true, otherBook);
  const v0 = (await db.foConsultationType.findUniqueOrThrow({ where: { id: other.id } })).version, a0 = await db.auditEvent.count({ where: { entityKey: other.id } });
  const noop = [await T("PATCH", `/${other.id}`, P.OWNER, { version: v0 }), await T("PATCH", `/${other.id}`, P.OWNER, { name: "Other chat", version: v0 }), await T("POST", `/${other.id}/switch-on`)];
  ok("FO-3a break m5 fail: a save that changes nothing (only the version, the same name, switching on a type that is on) moves no version and writes no line",
    noop.every((r) => r.status === 200 && r.body.version === v0) && await db.auditEvent.count({ where: { entityKey: other.id } }) === a0, noop.map((r) => [r.status, r.body?.version]));
  await db.platformStaff.update({ where: { id: P.READ_ONLY.id }, data: { status: "SUSPENDED" } });
  const susp = [await T("POST", "", P.OWNER, { name: "Suspended host", minutes: 30, modes: ["VIDEO"], hostStaffIds: [P.READ_ONLY.id] }), await T("PATCH", `/${other.id}`, P.OWNER, { hostStaffIds: [P.OWNER.id, P.READ_ONLY.id], version: v0 })];
  ok("FO-3a break m6 fail: a suspended staff member cannot be added as a host (create and edit → 422 on hostStaffIds)", susp.every((r) => r.status === 422 && !!r.body.fields?.hostStaffIds), susp.map((r) => [r.status, r.body?.fields]));
  const withSusp = await make({ name: "Two hosts", hostStaffIds: [P.OWNER.id, P.ADMIN.id] });
  await db.platformStaff.update({ where: { id: P.ADMIN.id }, data: { status: "SUSPENDED" } });
  const dupSusp = await T("POST", `/${withSusp.id}/duplicate`);
  await db.platformStaff.update({ where: { id: P.ADMIN.id }, data: { status: "ACTIVE" } });
  ok("FO-3a DW3 pass: duplicating a type whose host was suspended since copies its hosts (review M4)", dupSusp.status === 201 && JSON.stringify(dupSusp.body.hostStaffIds) === JSON.stringify([P.OWNER.id, P.ADMIN.id]), dupSusp);
  await db.platformStaff.update({ where: { id: P.READ_ONLY.id }, data: { status: "ACTIVE" } });

  // ------------------------------------------------------------------------------------- DW10: audit and the wall
  const lines = await db.auditEvent.findMany({ where: { entity: "fo_consultation_type" }, orderBy: { at: "asc" } });
  const of = (id: string, action: string) => lines.filter((l) => l.entityKey === id && l.action === action);
  const ed = of(pub1.id, "booking_type.updated").map((l) => l.detail as Record<string, unknown>);
  const lenEdit = ed.find((d) => (d.fields as string[]).includes("minutes"));
  ok("FO-3a DW10 pass: create, edit, duplicate, switch and delete each write one line; the edit has before and after of the type's own fields",
    of(src.id, "booking_type.created").length === 1 && of(dup.body.id, "booking_type.duplicated").length === 1 && of(off.id, "booking_type.switched_off").length === 1 && of(off.id, "booking_type.switched_on").length === 1
      && of(gone.id, "booking_type.deleted").length === 1 && lenEdit?.minutes_before === 30 && lenEdit?.minutes_after === 45 && JSON.stringify(lenEdit?.fields) === JSON.stringify(["minutes"]) && lines.every((l) => l.actor.startsWith("staff:")), { ed, n: lines.length });
  ok("FO-3a DW10 fail: refused writes (stale version, Case Manager, PAID_CONSULT) wrote no line; a description is kept as its length only",
    !lines.some((l) => /Overwritten|CM edit|CM type|Strategy session/.test(JSON.stringify(l))) && (of(okSaves[2].body.id, "booking_type.created")[0]?.detail as Record<string, unknown>)?.description_after === "1000 characters", lines.length);
  const mailName = await make({ name: "ask@firm.example call" });
  const mailLines = await db.auditEvent.findMany({ where: { entityKey: mailName.id } });
  ok("FO-3a DW10 fail: an email-shaped type name is kept in neither the audit summary nor its detail (review m13)", mailLines.length === 1 && !JSON.stringify(mailLines).includes("ask@firm.example"), mailLines);
  const bType = await db.foConsultationType.create({ data: { firmId: B.id, slug: "b-free", name: "B free", modes: ["VIDEO"], hostStaffIds: [BO.id], minutes: 30 } });
  const cross = [await T("GET", `/${bType.id}`), await T("GET", `/${bType.id}/preview`), await T("PATCH", `/${bType.id}`, P.OWNER, { name: "Taken", version: 1 }), await T("DELETE", `/${bType.id}`), await T("POST", `/${bType.id}/duplicate`), await T("POST", `/${bType.id}/switch-off`)];
  const bRow = await db.foConsultationType.findUniqueOrThrow({ where: { id: bType.id } });
  ok("FO-3a DW10 fail: firm A never reads, previews, edits, deletes, duplicates or switches firm B's type (404), and it is unchanged",
    cross.every((r) => r.status === 404) && bRow.name === "B free" && bRow.active && !bRow.deletedAt && bRow.version === 1 && !((await T("GET", "")).body.types as { id: string }[]).some((t) => t.id === bType.id), cross.map((r) => r.status));
  const hostB = await T("POST", "", P.OWNER, { name: "Borrowed host", minutes: 30, modes: ["VIDEO"], hostStaffIds: [BO.id] });
  ok("FO-3a DW10 fail: another firm's staff member as a host → 422 on hostStaffIds", hostB.status === 422 && !!hostB.body.fields?.hostStaffIds, hostB);
  const bList = await T("GET", "", BO);
  ok("FO-3a DW10 pass: firm B's Owner lists only firm B's type", bList.status === 200 && bList.body.types.length === 1 && bList.body.types[0].id === bType.id, bList.body);

  // ------------------------------------------------------------------------------ DW11: the migration on main's schema
  migrate(OLD, migrations.filter((m) => m !== THIS));
  const f = psql(OLD, "insert into platform_firm (id, key, operating_name, country_code, status, contact_email, updated_at) values (gen_random_uuid(), 'old-firm', 'Sample Old', 'CA', 'ACTIVE', 'old@firm.example', now()) returning id").split("\n")[0];
  psql(OLD, `insert into fo_consultation_type (id, firm_id, slug, name, modes, host_staff_ids, minutes, updated_at) values (gen_random_uuid(), '${f}', 'free-consultation', 'Free consultation', '{VIDEO}', '{}', 30, now())`);
  let up = "";
  try { migrate(OLD, [THIS]); up = "ok"; } catch (e) { up = String((e as { stderr?: Buffer }).stderr ?? e); }
  const kept = psql(OLD, "select slug, colour, version, deleted_at is null, description is null, active, show_on_booking_page from fo_consultation_type");
  ok("FO-3a DW11 pass: the migration runs on a copy of main's schema with a type in it; the type keeps its slug and gets C1, version 1, not deleted", up === "ok" && kept === "free-consultation|C1|1|t|t|t|t", [up, kept]);
  let dupRefused = false, reservedRefused = false;
  try { psql(OLD, `insert into fo_consultation_type (id, firm_id, slug, name, modes, host_staff_ids, minutes, updated_at) values (gen_random_uuid(), '${f}', 'free-consultation', 'Again', '{VIDEO}', '{}', 30, now())`); } catch (e) { dupRefused = /fo_consultation_type_firm_id_slug_key/.test(String((e as { stderr?: Buffer }).stderr)); }
  try { psql(OLD, `insert into fo_consultation_type (id, firm_id, slug, name, modes, host_staff_ids, minutes, updated_at) values (gen_random_uuid(), '${f}', 'manage', 'Manage', '{VIDEO}', '{}', 30, now())`); } catch (e) { reservedRefused = /fo_consultation_type_slug_reserved/.test(String((e as { stderr?: Buffer }).stderr)); }
  psql(OLD, "update fo_consultation_type set deleted_at = now()");
  const freed = psql(OLD, `insert into fo_consultation_type (id, firm_id, slug, name, modes, host_staff_ids, minutes, updated_at) values (gen_random_uuid(), '${f}', 'free-consultation', 'Again', '{VIDEO}', '{}', 30, now()) returning slug`);
  ok("FO-3a DW11 fail: after it, a second live type with the slug and a slug manage are refused by the database; once deleted, the slug is free", dupRefused && reservedRefused && freed.startsWith("free-consultation"), [dupRefused, reservedRefused, freed]);
} catch (e) {
  fail++; console.log(`FAIL  FO-3a: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 900)}`);
} finally {
  await app?.close();
  await db.$disconnect();
  for (const d of [DB, OLD]) { try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", d]); } catch { /* left for prune-test-dbs.sh */ } }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
