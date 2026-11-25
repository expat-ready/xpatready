// FO-3st1 part 1 (brief lead-b-briefs/FO-3st1.md; concept screens/fo-3-booking r2 §4, §5, §6 J-S1..J-S4, J-S9; BR-13,
// BR-14; AG-4-39, AG-4-63, AG-4-67): the staff Bookings calendar in a real browser on an isolated copy of the running app
// (its build, its routes, PF-4's local sign-in, the system clock). Sample firm `maple` is written to the copy's database
// with the seeded roles' staff, hours, a type, leads and bookings (Sample rows); the browser signs in as each person.
// One named case per Done when line, a pass and a fail each: J-S1, J-S2, J-S3, J-S4, J-S9, DW10 (axe, keyboard only,
// 375/1024/1440, 60 bookings in a week with no overlapping blocks), QA-743 (R1.39: time off on the calendar), DW11 (the new paths overlap no APP_ROUTES entry; PF-1's own suite checks every module). US$0, no model call.
//   zsh studio/tools/isolated.sh screens_fo3st1 4541 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo3st1_calendar_browser.ts 4541 xr_studio_screens_fo3st1
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4541), DBNAME = process.argv[3] ?? "xr_studio_screens_fo3st1";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, ".."), URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`;
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-3-booking", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
process.env.DATABASE_URL = URL_;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const { seedFirmFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { EVERYONE_SEES_ALL, TIME_ZONE, CLOSED_DAYS, writeSetting } = await import("../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/audit/audit-event.ts");
const { wallToUtc } = await import("../api/src/front-office/booking/slots.ts");
const TZ = "America/Toronto", MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

// ------------------------------------------------------------------------------------------------------------ set-up
if (await db.platformFirm.findUnique({ where: { key: "maple" } })) { console.error("STOP  firm maple exists: start a fresh copy (isolated.sh … start)"); process.exit(2); }
const M = await db.platformFirm.create({ data: { key: "maple", operatingName: "Maple Immigration", countryCode: "CA", status: "ACTIVE", contactEmail: "hello@maple.example" } });
await db.$transaction((tx) => seedFirmFrontOffice(tx, M.id));
const ws = await platformAuditWorkspaceId(db as never);
const setting = (key: string, value: unknown) => writeSetting(db, { firmId: M.id, key, value, by: "system:test", workspaceId: ws });
await setting(TIME_ZONE.key, TZ); await setting(CLOSED_DAYS.key, []); await setting(EVERYONE_SEES_ALL.key, true);
const person = async (name: string, role: string) => {
  const s = await db.platformStaff.create({ data: { firmId: M.id, email: `${name.replace(/\W/g, "").toLowerCase()}@maple.example`, displayName: name } });
  await db.platformRoleGrant.create({ data: { firmId: M.id, staffId: s.id, role: role as never, grantedBy: "seed:fo3st1" } });
  return s;
};
const F = await person("Client F", "OWNER"), C = await person("Client C", "CASE_OFFICER"), I = await person("Client I", "CASE_OFFICER"), AD = await person("Client A", "ADMIN"), CM = await person("Client K", "CASE_MANAGER"), BF = await person("Client D", "BILLING_FINANCE");
const HOSTS = [F, C, I, AD, CM, BF];
await db.foAvailability.createMany({ data: HOSTS.flatMap((h) => [1, 2, 3, 4, 5].map((weekday) => ({ firmId: M.id, staffId: h.id, weekday, startMinute: 540, endMinute: 1020, timeZone: TZ }))) });
// Types that need no consultation agreement: this check is about attendance, not the agreement (QA-772: gate.ts holds a type that needs one and has none).
const type = await db.foConsultationType.create({ data: { requireAgreement: false, firmId: M.id, slug: "free-consultation", name: "Free consultation", modes: ["VIDEO", "PHONE"], hostStaffIds: HOSTS.map((h) => h.id), minutes: 30, windowDays: 400, minNoticeMinutes: 0 } });
const client = async (given: string, owner: string | null) => {
  const p = await db.foPerson.create({ data: { firmId: M.id, givenNames: given, familyName: "Sample", email: `${given.replace(/\W/g, "").toLowerCase()}@client.example`, createdBy: "test" } });
  const l = await db.foLead.create({ data: { firmId: M.id, personId: p.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: owner, createdBy: "test" } });
  return { person: p, lead: l };
};
const P = await client("Client P", F.id), B = await client("Client B", I.id), O = await client("Client O", C.id);
const book = async (host: string, personId: string, startsAt: Date, status: "SCHEDULED" | "CANCELLED" = "SCHEDULED", anyway = false) => {
  const b = await db.foBooking.create({ data: { firmId: M.id, typeId: type.id, staffId: host, personId, mode: "VIDEO", startsAt, endsAt: new Date(startsAt.getTime() + 30 * MIN), bookerTimeZone: "Asia/Dubai", ...(anyway ? { overlapConfirmedByUserId: host } : {}) } });
  return status === "CANCELLED" ? db.foBooking.update({ where: { id: b.id }, data: { status } }) : b;
};
// The Toronto date of a moment, and a Toronto wall time as a moment.
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const wall = (date: string, hhmm: string) => { const [y, m, d] = date.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number); return wallToUtc(y, m, d, h * 60 + mi, TZ)!; };
const plus = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const now = Date.now(), today = ymd(new Date(now));
const nextMonday = (() => { let d = plus(today, 1); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = plus(d, 1); return d; })();
// J-S2: 60 bookings in next week, five hosts at Tue 10:00; J-S4: own meetings that ended 31 and 29 minutes ago, one cancelled.
const WEEK_HOSTS = [F, C, I, AD, CM];
for (let i = 0; i < 60; i++) { const day = plus(nextMonday, Math.floor(i / 12) % 5), slot = i % 12; await book(WEEK_HOSTS[slot % 5].id, (slot % 2 ? P : O).person.id, wall(day, `${String(9 + Math.floor(slot / 5) * 2 + (day === plus(nextMonday, 1) ? 1 : 0)).padStart(2, "0")}:00`)); }
const tue10 = await db.foBooking.count({ where: { firmId: M.id, startsAt: wall(plus(nextMonday, 1), "10:00") } });
const due = await book(C.id, O.person.id, new Date(now - 61 * MIN)), notYet = await book(C.id, B.person.id, new Date(now - 59 * MIN + 1), "SCHEDULED", true), gone = await book(C.id, P.person.id, new Date(now - 4 * HOUR), "CANCELLED");
const others = await book(I.id, B.person.id, new Date(now - 3 * HOUR));   // Client I's, ended: the Owner sees its question on the booking
const billing = await book(BF.id, P.person.id, new Date(now - 2 * HOUR));   // hosted by Billing and finance (no list key)
const old = await book(C.id, O.person.id, new Date(now - 9 * DAY));   // ended 9 days ago, never answered (review M1)
const soon = await book(F.id, P.person.id, new Date(Math.ceil((now + 2 * HOUR) / (30 * MIN)) * 30 * MIN));   // starts within the 4-hour limit
const onColleague = await book(I.id, B.person.id, wall(plus(nextMonday, 2), "16:00")), cHosts = await book(C.id, B.person.id, wall(plus(nextMonday, 3), "16:00"));
ok("FO-3st1 setup: firm maple, six staff on the seeded roles, Mon-Fri hours, 60 bookings next week with five at Tue 10:00", tue10 === 5, { tue10 });

const browser = await chromium.launch({ headless: !process.env.HEADED, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function as(email: string, width = 1440): Promise<Page> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "maple", email, secondStep: true }) });
  const { token } = await r.json() as { token: string };
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: "Asia/Dubai", colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  // Two days: the night case below sets the browser's clock up to a day ahead of the server's.
  await ctx.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 2 * 86_400_000 })), token);
  return p;
}
const go = async (p: Page, path: string) => { await p.goto(`${BASE}${path}`); await p.locator("main h1").first().waitFor({ timeout: 30_000 }); await p.locator("[data-loading]").first().waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined); };
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const axeBad = async (p: Page) => (await new AxeBuilder({ page: p }).withTags(TAGS).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`);
const axed: string[] = [];
const axe = async (name: string, p: Page) => { const bad = await axeBad(p); if (bad.length) axed.push(`${name}: ${bad.join(" | ")}`); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo3st1-${name}.png`), fullPage: true });
const week = `?view=week&whose=team&date=${nextMonday}`;

try {
  // --------------------------------------------------------------------------------------------- J-S1 (Q4)
  const bf = await as(BF.email);
  await go(bf, "/front-office/bookings");
  const bfMenu = await bf.locator('nav[aria-label="Bookings"]').count(), bfRefused = (await bf.locator("main").innerText()).includes("You do not have permission to do this.");
  await go(bf, `/front-office/bookings/${billing.id}`);
  await bf.locator("[data-booking-detail]").waitFor({ timeout: 15_000 });
  await bf.getByRole("button", { name: "Attended" }).click();
  await bf.locator('[data-attendance] button[aria-pressed="true"]').waitFor({ timeout: 15_000 });
  const answered = (await db.foBooking.findUniqueOrThrow({ where: { id: billing.id } })).status;
  await axe("J-S1 own booking by its link", bf); await shot(bf, "billing-own-booking-1440");
  ok("FO-3st1 J-S1 pass: a Billing and finance host (no list key) opens their own booking by its link, sees the detail and answers attendance (Attended saved)", answered === "COMPLETED", { answered });
  await go(bf, `/front-office/bookings/${others.id}`);
  const bfOther = await bf.getByText("This booking is not available.").waitFor({ timeout: 15_000 }).then(() => 1, () => 0);
  ok("FO-3st1 J-S1 fail: they have no Bookings menu entry and no calendar (the plain refusal), and another host's booking by its link is not available", bfMenu === 0 && bfRefused && bfOther === 1, { bfMenu, bfRefused, bfOther });
  const co = await as(C.email);
  await go(co, "/front-office/bookings");
  const coSeg = await co.getByRole("group", { name: "Whose" }).count(), coMenu = await co.locator('nav[aria-label="Bookings"]').count();
  ok("FO-3st1 J-S1 pass: a Case Officer with the list key has the Bookings menu and sees Mine and Team", coSeg === 1 && coMenu === 1 && (await co.getByRole("button", { name: "Team" }).count()) === 1);

  // --------------------------------------------------------------------------------------------- J-S2, DW10 (60 a week)
  const ow = await as(F.email);
  await go(ow, `/front-office/bookings${week}`);
  await ow.locator("[data-grid]").waitFor({ timeout: 20_000 });
  const cell = ow.locator(`[data-cell="${plus(nextMonday, 1)}T10"]`);
  const [blocks, more] = [await cell.locator("[data-block]").count(), await cell.locator("[data-more]").innerText().catch(() => "")];
  const zoneLine = await ow.locator("[data-zone-line]").innerText();
  const boxes = await ow.locator("[data-block]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })));
  const moreCount = (await ow.locator("[data-more]").allInnerTexts()).reduce((n, t) => n + Number(t.replace(/\D/g, "")), 0);
  const inWeek = await db.foBooking.count({ where: { firmId: M.id, status: { not: "CANCELLED" }, startsAt: { gte: wall(nextMonday, "00:00"), lt: wall(plus(nextMonday, 7), "00:00") } } });
  const overlaps = boxes.flatMap((a, i) => boxes.slice(i + 1).filter((b) => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5)).length;
  await axe("J-S2 Team week, 60 bookings", ow); await shot(ow, "team-week-60-1440");
  ok("FO-3st1 J-S2 pass: the Owner's Team week with 60 bookings shows three blocks and \"+2 more\" at Tue 10:00, the office zone named", blocks === 3 && more.trim() === "+2 more" && zoneLine.includes("America/Toronto"), { blocks, more, zoneLine });
  ok("FO-3st1 DW10 pass: the week holds its 60 bookings (each a block or counted in \"+n more\") with no block overlapping another", overlaps === 0 && inWeek >= 60 && boxes.length + moreCount === inWeek, { blocks: boxes.length, moreCount, inWeek, overlaps });
  await cell.locator("[data-more]").click();
  await ow.locator("[data-row]").first().waitFor({ timeout: 10_000 });
  const listed = await ow.locator("[data-row]").count();
  await axe("J-S2 list for one hour", ow);
  ok("FO-3st1 J-S2 fail→pass: \"+2 more\" opens the list for that hour with all five (not three), kept in the address", listed === 5 && /view=list/.test(ow.url()) && /hour=/.test(ow.url()), { listed, url: ow.url() });

  // --------------------------------------------------------------------------------------------- J-S3 (BR-13, FO-3sa)
  let sunday = plus(today, 2); while (new Date(`${sunday}T12:00:00Z`).getUTCDay() !== 0) sunday = plus(sunday, 1);
  const count0 = await db.foBooking.count({ where: { firmId: M.id } });
  const newBooking = async (dubai = false) => {
    await go(ow, "/front-office/bookings");
    await ow.locator("[data-new-booking]").click();
    await ow.locator("[data-person-find]").fill("Client P");
    await ow.locator("[data-person]").selectOption({ label: `Client P Sample (lead ${P.lead.number})` }).catch(async () => ow.locator("[data-person]").selectOption({ index: 1 }));
    await ow.locator("[data-times-zone]").filter({ hasText: "Client P" }).waitFor({ timeout: 10_000 });
    await ow.locator("[data-host]").selectOption({ label: "Client F (you)" });
    // BR-13 (review M3): the zone is shown and can be changed; 20:00 Asia/Dubai is 11:00 Toronto on a winter Sunday.
    if (dubai) { await ow.locator("[data-zone-change]").click(); await ow.locator("[data-zone]").selectOption("Asia/Dubai"); }
    await ow.locator("[data-pick-other]").click();
    await ow.locator("[data-other-date]").fill(sunday); await ow.locator("[data-other-time]").fill(dubai ? "20:00" : "11:00");
    await ow.locator("[data-book]").click();
    await ow.locator("[data-book-anyway]").waitFor({ timeout: 15_000 }).catch(async (e) => { await shot(ow, "debug-new-booking"); throw new Error(`no Book anyway: ${(await ow.getByRole("dialog").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600)} ${String(e).slice(0, 80)}`); });
  };
  await newBooking();
  const reasons = await ow.locator("[data-book-anyway] li").allInnerTexts();
  await axe("J-S3 Book anyway?", ow); await shot(ow, "new-booking-book-anyway-1440");
  await ow.locator("[data-book-anyway]").getByRole("button", { name: "Cancel" }).click();
  await ow.getByRole("button", { name: "Close", exact: true }).last().click();
  const afterCancel = await db.foBooking.count({ where: { firmId: M.id } });
  ok("FO-3st1 J-S3 fail: New booking for lead Client P on Sunday 11:00 asks \"Book anyway?\" listing \"Outside Client F's hours\"; Cancel saves nothing", reasons.some((r) => r === "Outside Client F's hours") && afterCancel === count0, { reasons, afterCancel, count0 });
  await newBooking(true);
  await ow.locator("[data-book-anyway]").getByRole("button", { name: "Book anyway" }).click();
  await ow.locator("[data-book]").waitFor({ state: "detached", timeout: 15_000 });
  const said = await ow.locator("[data-saved]").innerText().catch(() => "");
  const made = await db.foBooking.findFirst({ where: { firmId: M.id, startsAt: wall(sunday, "11:00"), staffId: F.id } });
  const audit = made ? await db.auditEvent.findFirst({ where: { entity: "fo_booking", entityKey: made.id, action: "booking.scheduled" } }) : null;
  ok("FO-3st1 J-S3 pass: Book anyway saves it for Client F at Sunday 11:00 Toronto (chosen as 20:00 in the changed zone, Asia/Dubai, which is kept for the person's mails), says \"Booked\", and the audit line names the warning",
    !!made && made.personId === P.person.id && made.bookerTimeZone === "Asia/Dubai" && said.startsWith("Booked Client P Sample") && JSON.stringify(audit?.detail ?? {}).includes("OUTSIDE_HOURS"), { made: made?.id, zone: made?.bookerTimeZone, said, audit: audit?.summary });
  // Break M4: a person the search no longer shows is no longer chosen, and Book cannot book them.
  await go(ow, "/front-office/bookings"); await ow.locator("[data-new-booking]").click();
  await ow.locator("[data-person-find]").fill("Client P"); await ow.locator("[data-person]").selectOption({ index: 1 });
  await ow.locator("[data-person-find]").fill("Client B");
  const [stale, bookOff] = [await ow.locator("[data-person]").inputValue(), await ow.locator("[data-book]").isDisabled()];
  await ow.getByRole("button", { name: "Close", exact: true }).last().click();
  ok("FO-3st1 J-S3 fail (break M4): choosing Client P, then searching Client B, leaves nobody chosen and Book off", stale === "" && bookOff, { stale, bookOff });

  // --------------------------------------------------------------------------------------------- J-S4 (BR-14)
  await go(co, "/front-office/bookings?whose=mine");
  await co.locator("[data-zone-line]").waitFor();
  await co.locator(`[data-due="${due.id}"]`).waitFor({ timeout: 15_000 }).catch(() => undefined);
  const pinned = await co.locator("[data-due]").evaluateAll((els) => els.map((e) => e.getAttribute("data-due")));
  await axe("J-S4 pinned question", co); await shot(co, "attendance-pinned-1440");
  ok("FO-3st1 J-S4 pass: the viewer's own meeting that ended 30 min ago is pinned (\"Did Client O attend?\")", pinned.includes(due.id) && (await co.locator(`[data-due="${due.id}"]`).innerText()).includes("Did Client O Sample attend?"), pinned);
  ok("FO-3st1 J-S4 fail: one that ended 29 min ago is not pinned yet; a cancelled one never", !pinned.includes(notYet.id) && !pinned.includes(gone.id), pinned);
  await co.getByRole("button", { name: "Next week" }).click();
  await co.locator(`[data-due="${due.id}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  const nextWeek = await co.locator("[data-due]").evaluateAll((els) => els.map((e) => e.getAttribute("data-due")));
  ok("FO-3st1 J-S4 pass (review M1): the questions stay pinned whatever week is shown, a meeting from 9 days ago included", nextWeek.includes(due.id) && nextWeek.includes(old.id) && pinned.includes(old.id), { pinned, nextWeek });
  await go(ow, `/front-office/bookings/${others.id}`);
  await ow.locator("[data-booking-detail]").waitFor({ timeout: 15_000 });
  const ownerPinned = await ow.locator(`[data-due="${others.id}"]`).count(), ownerAsk = await ow.locator(`[data-attendance="${others.id}"]`).count();
  ok("FO-3st1 J-S4 pass/fail: an Owner sees another host's question on the booking (Attended, No-show), never pinned", ownerPinned === 0 && ownerAsk === 1, { ownerPinned, ownerAsk });

  // --------------------------------------------------------------------------------------------- J-S9 (AG-4-67 test 1)
  await setting(EVERYONE_SEES_ALL.key, false);
  await go(co, `/front-office/bookings${week}`);
  await co.locator("[data-grid]").waitFor({ timeout: 20_000 });
  const [seeOther, seeOwn] = [await co.locator(`[data-block="${onColleague.id}"]`).count(), await co.locator(`[data-block="${cHosts.id}"]`).count()];
  await go(co, `/front-office/bookings/${onColleague.id}`);
  const byLink = await co.getByText("This booking is not available.").waitFor({ timeout: 15_000 }).then(() => 1, () => 0);
  ok("FO-3st1 J-S9 fail: a Case Officer on own only with the list key does not see a booking on a colleague's lead (not in Team, not by its link)", seeOther === 0 && byLink === 1, { seeOther, byLink });
  ok("FO-3st1 J-S9 pass: they see the one they host on that lead", seeOwn === 1, { seeOwn });
  await setting(EVERYONE_SEES_ALL.key, true);

  // --------------------------------------------------------------------------------------------- Reschedule and Cancel (More)
  const moveSentence = async (id: string) => {
    await go(ow, `/front-office/bookings/${id}`);
    await ow.locator("[data-booking-detail]").waitFor({ timeout: 15_000 });
    await ow.locator("[data-more-menu]").click(); await ow.getByRole("menuitem", { name: "Reschedule" }).click();
    await ow.getByRole("dialog", { name: "Move this booking" }).waitFor();
    const t = await ow.locator("[data-inside-limit]").innerText().catch(() => "");
    await axe("Move this booking", ow);
    await ow.keyboard.press("Escape");
    return t;
  };
  const [inside, outside] = [await moveSentence(soon.id), await moveSentence(cHosts.id)];
  ok("FO-3st1 detail pass/fail: More → Reschedule says \"This is inside the 4-hour limit. Client P Sample can no longer change it online.\" for a booking 2 h away, and nothing for one next week",
    inside === "This is inside the 4-hour limit. Client P Sample can no longer change it online." && outside === "", { inside, outside });
  // Review M2: a move the server gives to another free host says so. Every week host is busy at Monday 09:00 next week;
  // Client D (Billing and finance) is a free host of the type.
  await go(ow, `/front-office/bookings/${cHosts.id}`);
  await ow.locator("[data-booking-detail]").waitFor({ timeout: 15_000 });
  await ow.locator("[data-more-menu]").click(); await ow.getByRole("menuitem", { name: "Reschedule" }).click();
  await ow.locator("[data-pick-other]").click();
  await ow.locator("[data-other-date]").fill(nextMonday); await ow.locator("[data-other-time]").fill("09:00");
  await ow.locator("[data-move]").click();
  const changed = await ow.getByText("The host changed").waitFor({ timeout: 15_000 }).then(async () => (await ow.locator("[data-booking-detail]").innerText()).replace(/\s+/g, " "), () => "");
  const movedTo = (await db.foBooking.findUniqueOrThrow({ where: { id: cHosts.id } })).staffId;
  ok("FO-3st1 detail pass/fail (review M2): moving Client C's booking to a time Client C is busy gives it to a free host, and the panel says \"Client C was not free then, so Client D now hosts this booking.\"",
    movedTo === BF.id && changed.includes("Client C was not free then, so Client D now hosts this booking."), { movedTo, changed: changed.slice(0, 200) });
  await go(ow, `/front-office/bookings/${soon.id}`);
  await ow.locator("[data-more-menu]").click(); await ow.getByRole("menuitem", { name: "Cancel booking" }).click();
  await ow.getByRole("button", { name: "Keep booking" }).click();
  await ow.locator("[data-cancel-booking]").waitFor({ state: "detached", timeout: 10_000 });
  const kept = (await db.foBooking.findUniqueOrThrow({ where: { id: soon.id } })).status;
  await ow.locator("[data-more-menu]").click(); await ow.getByRole("menuitem", { name: "Cancel booking" }).click();
  await axe("Cancel booking?", ow);
  await ow.locator("[data-cancel-booking]").click();
  await ow.getByRole("dialog", { name: /Cancel .*booking\?/ }).waitFor({ state: "detached", timeout: 15_000 });
  const gone2 = (await db.foBooking.findUniqueOrThrow({ where: { id: soon.id } })).status;
  const chipTip = await ow.locator("span[title='Cancelled by Client F.']").first().waitFor({ timeout: 10_000 }).then(() => "Cancelled by Client F.", () => null);
  ok("FO-3st1 detail pass/fail: Keep booking changes nothing; Cancel booking cancels it, and its chip says who (\"Cancelled by Client F.\")", kept === "SCHEDULED" && gone2 === "CANCELLED" && chipTip === "Cancelled by Client F.", { kept, gone2, chipTip });

  // --------------------------------------------------------------------------------------------- break M1, M7, M9 / review M4
  for (const bad of ["?date=2027-13-45", "?view=list&hour=foo", "?date=2027-02-30&view=day"]) await go(ow, `/front-office/bookings${bad}`);
  const bad = errors.length;
  ok("FO-3st1 detail fail (break M1): a malformed date or hour in the address falls back to the defaults, no blank page, no page error", bad === 0 && (await ow.locator("[data-zone-line]").count()) === 1, errors.slice(0, 2));
  await go(ow, `/front-office/bookings${week}`);
  await ow.locator("[data-host-filter]").selectOption(CM.id);
  await ow.getByRole("button", { name: "Next week" }).click(); await ow.getByRole("button", { name: "Next week" }).click();
  const kept2 = await ow.locator("[data-host-filter] option:checked").innerText();
  ok("FO-3st1 detail pass/fail (break M7): a host chosen in the filter stays named on a week with none of their bookings", kept2 === "Client K", kept2);
  const night = await as(AD.email);   // another person: signing Client F in again would end their session (one at a time)
  await night.clock.install({ time: wall(today, "21:30") });   // 21:30 in Toronto is already tomorrow in UTC
  await night.clock.resume();
  await go(night, "/front-office/bookings?view=day");
  await night.locator("[data-range]").filter({ hasText: /\d/ }).waitFor();
  const dayShown = await night.locator("[data-range]").innerText();
  const want = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${today}T12:00:00Z`));
  await night.context().close();
  ok("FO-3st1 detail pass/fail (review M4): at 21:30 in Toronto, Today is the office's day, not the next UTC day", dayShown === want, { dayShown, want });

  // --------------------------------------------------------------------------------------------- QA-743 (R1.39: time off)
  // A day off saved through Availability's own route shows in Week, Day and List in office time (the browser is in
  // Asia/Dubai); a colleague's is "not available" in Team only; nothing but who and when leaves the feed.
  const offDay = plus(nextMonday, 2), partDay = plus(nextMonday, 3), mineWeek = `?whose=mine&date=${nextMonday}`;
  const tokenOf = (p: Page) => p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string);
  const call = (token: string, path: string, body?: unknown) => fetch(`${BASE}/api/front-office/${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  type Off = { id: string; staff: { id: string; name: string }; mine: boolean; label: string; startsAt: string; endsAt: string };
  const feedOf = async (token: string, view: string) => { const r = await call(token, `bookings/feed?view=${view}&from=${nextMonday}T00:00:00Z&to=${plus(nextMonday, 7)}T00:00:00Z`); return { status: r.status, timeOff: r.ok ? ((await r.json()) as { timeOff: Off[] }).timeOff : [] }; };
  await go(co, `/front-office/bookings${mineWeek}&view=week`);
  await co.locator("[data-grid]").waitFor({ timeout: 20_000 });
  const offBefore = await co.locator("[data-off], [data-off-row]").count();
  const coToken = await tokenOf(co);
  const savedOff = await call(coToken, "me/time-off", { startsAt: wall(offDay, "00:00").toISOString(), endsAt: wall(plus(offDay, 1), "00:00").toISOString() });
  const colleagueOff = await db.foTimeOff.create({ data: { firmId: M.id, staffId: I.id, startsAt: wall(partDay, "13:00"), endsAt: wall(partDay, "15:00"), createdBy: `staff:${I.id}` } });
  const myOff = await db.foTimeOff.findFirstOrThrow({ where: { firmId: M.id, staffId: C.id } });
  const offText = async (view: string, whose: string, date: string) => {
    await go(co, `/front-office/bookings?view=${view}&whose=${whose}&date=${date}`);
    await co.locator("[data-grid], [data-empty], table").first().waitFor({ timeout: 20_000 });
    return { mine: (await co.locator(view === "list" ? `[data-off-row="${myOff.id}"]` : `[data-off-day="${offDay}"] [data-off="${myOff.id}"]`).allInnerTexts()).join(" ").replace(/\s+/g, " "),
      other: (await co.locator(view === "list" ? `[data-off-row="${colleagueOff.id}"]` : `[data-off-day="${partDay}"] [data-off="${colleagueOff.id}"]`).allInnerTexts()).join(" ").replace(/\s+/g, " "), all: await co.locator("[data-off]").count() };
  };
  const wk = await offText("week", "mine", nextMonday);
  const shaded = await co.locator(`[data-cell^="${offDay}T"][data-off-hour]`).count(), shadedElsewhere = await co.locator(`[data-off-hour]:not([data-cell^="${offDay}T"])`).count();
  // Break M1: the shading is seen, not only marked: an off hour's background differs from the same hour the day before.
  const bg = (sel: string) => co.locator(sel).first().evaluate((e) => getComputedStyle(e).backgroundColor);
  const [offBg, freeBg] = [await bg(`[data-cell="${offDay}T08"]`), await bg(`[data-cell="${plus(offDay, -1)}T08"]`)];
  await axe("QA-743 Mine week with a day off", co); await shot(co, "time-off-week-mine-1440");
  // Not a booking: no button or link in it, and a click opens nothing.
  const inert = await co.locator("[data-off-row] button, [data-off-row] a, [data-off-row] [role=button]").count();
  await co.locator(`[data-off="${myOff.id}"]`).click();
  const openedByClick = (await co.locator("[data-booking-detail]").count()) > 0 || !co.url().endsWith(`date=${nextMonday}`);
  const dy = await offText("day", "mine", offDay), dyNone = await offText("day", "mine", plus(nextMonday, 1));
  await shot(co, "time-off-day-mine-1440");
  const ls = await offText("list", "mine", nextMonday);
  const listInert = await co.locator("[data-off-row] button, [data-off-row] a").count();
  await axe("QA-743 Mine list with a day off", co); await shot(co, "time-off-list-mine-1440");
  ok("QA-743 R1.39 fail (before): with no time off saved, Client C's own week shows none", offBefore === 0, { offBefore });
  ok("QA-743 R1.39 pass: a day off saved on Availability (201) shows on that day in Mine › Week (\"Time off · all day\", its hours shaded, no other day), Day and List, in office time; it is text, not a booking (a click opens nothing)",
    savedOff.status === 201 && wk.mine === "Time off · all day" && wk.all === 1 && shaded > 0 && shadedElsewhere === 0 && offBg !== freeBg && dy.mine === "Time off · all day" && dyNone.all === 0 && ls.mine.includes(", all day") && ls.mine.includes("Client C") && ls.mine.includes("Time off") && inert === 0 && listInert === 0 && !openedByClick,
    { saved: savedOff.status, wk, shaded, shadedElsewhere, offBg, freeBg, dy, dyNone, ls, inert, listInert, openedByClick });
  const tm = await offText("week", "team", nextMonday);
  await axe("QA-743 Team week with time off", co); await shot(co, "time-off-week-team-1440");
  const tl = await offText("list", "team", nextMonday);
  const teamFeed = await feedOf(coToken, "team"), mineFeed = await feedOf(coToken, "mine");
  const theirs = teamFeed.timeOff.find((o) => o.id === colleagueOff.id);
  // Break m6: a deactivated colleague's time off is not listed (Availability treats them as not in the firm).
  const goneStaff = await db.platformStaff.create({ data: { firmId: M.id, email: "clientx@maple.example", displayName: "Client X", status: "DEACTIVATED" as never } });
  const goneOff = await db.foTimeOff.create({ data: { firmId: M.id, staffId: goneStaff.id, startsAt: wall(partDay, "09:00"), endsAt: wall(partDay, "10:00"), createdBy: "seed:fo3st1" } });
  const teamAfter = await feedOf(coToken, "team");
  ok("QA-743 R1.39 pass: with the list key, Team shows a colleague's time off as \"Client I: not available · 13:00–15:00\" (Week) and \"Not available\" (List); Mine never shows it; a deactivated colleague's is not sent; the feed sends who and when only",
    tm.other === "Client I: not available · 13:00–15:00" && teamAfter.timeOff.some((o) => o.id === colleagueOff.id) && !teamAfter.timeOff.some((o) => o.id === goneOff.id) && tm.mine === "Time off · all day" && wk.other === "" && tl.other.includes("13:00–15:00") && tl.other.includes("Client I") && tl.other.includes("Not available")
      && mineFeed.timeOff.length === 1 && mineFeed.timeOff[0].id === myOff.id && !!theirs && theirs.label === "Not available" && !theirs.mine && Object.keys(theirs).sort().join() === "endsAt,id,label,mine,staff,startsAt" && Object.keys(theirs.staff).sort().join() === "id,name",
    { tm, tl, mineFeed: mineFeed.timeOff.length, theirs });
  // The host without the list key (Billing and finance): the team feed refuses; their own feed holds no colleague's.
  const bfToken = ((await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "maple", email: BF.email, secondStep: true }) })).json()) as { token: string }).token;
  const bfTeam = await feedOf(bfToken, "team"), bfMine0 = await feedOf(bfToken, "mine");
  await db.foTimeOff.create({ data: { firmId: M.id, staffId: BF.id, startsAt: wall(plus(nextMonday, 4), "09:00"), endsAt: wall(plus(nextMonday, 4), "12:00"), createdBy: `staff:${BF.id}` } });
  const bfMine1 = await feedOf(bfToken, "mine");
  ok("QA-743 R1.39 fail: a host without the list key never sees a colleague's time off (team feed 403; own feed empty while two colleagues have time off, then only their own once they add one, with no reason field)",
    bfTeam.status === 403 && bfMine0.status === 200 && bfMine0.timeOff.length === 0 && bfMine1.timeOff.length === 1 && bfMine1.timeOff[0].staff.id === BF.id && bfMine1.timeOff[0].mine && !JSON.stringify(bfMine1.timeOff).toLowerCase().includes("reason"),
    { team: bfTeam.status, before: bfMine0.timeOff.length, after: bfMine1.timeOff });
  const offAxe: string[] = [], offFit: Record<number, number> = {}, offCut: string[] = [];
  for (const w of [400, 1024, 1440]) {
    const p = await as(C.email, w);
    for (const v of ["week", "day", "list"]) {
      await go(p, `/front-office/bookings?view=${v}&whose=team&date=${offDay}`);   // below 768 px the week is a day: the day off's
      await p.locator("[data-off], [data-off-row]").first().waitFor({ timeout: 20_000 });
      offAxe.push(...(await axeBad(p)).map((b) => `${v} ${w}: ${b}`));
      offFit[w] = Math.max(offFit[w] ?? 0, await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth));
      // Review M1: every time-off label is shown whole (wrapped, never cut to "…").
      offCut.push(...(await p.locator("[data-off]").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent ?? ""))).map((t) => `${v} ${w}: ${t}`));
      if (w === 400 || v === "week") await shot(p, `time-off-${v}-team-${w}`);
    }
    await p.context().close();
  }
  ok("QA-743 R1.39 pass: Week, Day and List with time off at 400, 1024 and 1440 px: nothing serious or critical from axe, no sideways page scroll, no time-off label cut", offAxe.length === 0 && Object.values(offFit).every((o) => o <= 1) && offCut.length === 0, { offAxe, offFit, offCut });

  // --------------------------------------------------------------------------------------------- DW10 (keyboard, widths)
  await go(ow, `/front-office/bookings${week}`);
  await ow.locator("[data-grid]").waitFor().catch(async (e) => { await shot(ow, "debug-dw10"); throw new Error(`DW10 no grid: ${ow.url()} ${(await ow.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300)}`); });
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) { await ow.keyboard.press("Tab"); reached = await ow.evaluate(() => document.activeElement?.hasAttribute("data-block") ?? false); }
  await ow.keyboard.press("Enter");
  const kbPanel = await ow.locator("[data-booking-detail]").waitFor({ timeout: 10_000 }).then(() => true, () => false);
  await axe("DW10 detail panel", ow); await shot(ow, "detail-panel-1440");
  await ow.keyboard.press("Escape");
  const closed = await ow.locator("[data-booking-detail]").waitFor({ state: "detached", timeout: 10_000 }).then(() => true, () => false);
  ok("FO-3st1 DW10 pass: keyboard only, Tab reaches a booking block, Enter opens its detail and Escape closes it", reached && kbPanel && closed, { reached, kbPanel, closed });
  const fit: Record<number, unknown> = {};
  for (const w of [375, 1024, 1440]) {
    const p = await as(F.email, w);
    await go(p, `/front-office/bookings${week}`);
    await p.locator("[data-grid], [data-empty]").first().waitFor({ timeout: 20_000 });
    const days = await p.locator("[data-grid] thead th").count() - 1;
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    fit[w] = { days, over };
    await axe(`DW10 week at ${w}`, p); await shot(p, `team-week-${w}`);
    for (const v of ["list", "day"]) { await go(p, `/front-office/bookings?view=${v}&whose=team&date=${nextMonday}`); await axe(`DW10 ${v} at ${w}`, p); }
    await p.context().close();
  }
  ok("FO-3st1 DW10 pass: at 375 px the week becomes a day; at 1024 and 1440 seven days; no page scrolls sideways at any width", (fit[375] as { days: number }).days === 1 && (fit[1024] as { days: number }).days === 7 && (fit[1440] as { days: number }).days === 7 && Object.values(fit).every((f) => (f as { over: number }).over <= 0), fit);
  ok("FO-3st1 DW10 fail: axe finds nothing serious or critical on any page or state above (week, day, list, panel, New booking, Book anyway, pinned question, own booking by link)", axed.length === 0, axed);
  ok("FO-3st1 DW10: no page error in the browser", errors.length === 0, errors.slice(0, 3));

  // --------------------------------------------------------------------------------------------- DW11
  // PF-1's own suite (check_pf1_module_routes.ts, its own copy on :4517) checks every module's paths; here, without a
  // second copy: the two new paths are not among APP_ROUTES (modules.tsx), and the running app (which stops on any
  // clash of addresses, modules.tsx routeProblems) served them above.
  const appRoutes = [...(readFileSync(join(STUDIO, "web", "src", "modules.tsx"), "utf8").match(/export const APP_ROUTES = \[([\s\S]*?)\] as const/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const ours = ["/front-office/bookings", "/front-office/bookings/:id"];
  const clash = ours.filter((r) => appRoutes.some((a) => a === r || (a.endsWith("/*") && r.startsWith(a.slice(0, -1)))));
  ok("FO-3st1 DW11 pass/fail: the two new paths overlap no APP_ROUTES entry, and the app served them (it stops on a clash)", appRoutes.length > 20 && clash.length === 0 && reached, { appRoutes: appRoutes.length, clash });
} catch (e) {
  ok("FO-3st1: the check ran to the end", false, String((e as Error)?.stack ?? e).slice(0, 1200));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
