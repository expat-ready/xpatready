// J-39 (map row 39, R1.39: the staff calendar screen), written by the qa lane (22 Nov) because no j_39 was on main. It
// walks FO-3st1 part 1's Bookings calendar (#2322) with part 2 (#2717) and FO-3st2's Time off on an isolated copy of the
// running app (its own database and port, never :4400), as a firm's case officer who hosts consultations.
// Done when (CAPABILITIES R1.39): day, week and list views of own bookings and time off; open a booking; another
// person's calendar only with the key.
//   Setup (Sample rows written to the copy's database, as tests/check_fo3st1_calendar_browser.ts does): firm `maple39`,
//   an Owner, two Case Officers (Client C, Client I: both hold agent/booking:list), a Billing and finance host (Client D:
//   no list key), Mon-Fri 09:00-17:00 hours in America/Toronto, one booking type, a lead (Client P), and one booking
//   each hosted by Client I and Client D next week.
//   W1 Client C signs in on screen, opens Home › Bookings calendar, and books Client P with New booking (a free time
//      offered, herself as host): "Booked".
//   W2 own bookings in the three views: Mine › Week shows that booking as a block on its day and hour, Mine › Day shows
//      it, Mine › List shows its row (person, type, host, time in the office zone, the zone named). Fails on the fake
//      (P-606): read before W1's booking, the same week is empty.
//   W3 open a booking: the block opens the detail with the person, the time and the host; by keyboard too (Enter).
//   W4 time off on the calendar: Client C adds a whole day off (My account › Availability › Add time off) on the day
//      after her booking; it is stored. Week shows "Time off" in that day's own cell and shades its hours (not the
//      booking day's), Day the same, List one time off row naming the day (QA-743, fixed by #2929). Fails on the fake:
//      the day's cell is read before the day off exists.
//   W5 another person's calendar only with the key: with the list key Client C's Team view shows Client I's booking and
//      "Host: Client I" narrows to it, while Mine never shows it; Client D (no list key) has no Bookings menu entry, the
//      calendar refuses in plain words, Client I's booking by its link is "not available", and the team feed answers 403
//      (their own booking still opens by its link: concept fo-3-booking Q4).
//   W6 400, 1024 and 1440 px: the week has no sideways scroll, no serious axe violation (WCAG 2.2 A/AA); no page error.
// Sample data only; US$0, no model call, live AI off. Screenshots: product/screens/J-39/screenshots/.
// Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j39 4439 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j39 4439 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_39.ts j39 4439
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j39", PORT = Number(process.argv[3] ?? 4439), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-39", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
process.env.DATABASE_URL = URL_;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
const { seedFirmFrontOffice } = await import("../../api/src/front-office/firm-seed.ts");
const { EVERYONE_SEES_ALL, TIME_ZONE, CLOSED_DAYS, writeSetting } = await import("../../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../../api/src/platform/audit/audit-event.ts");
const { wallToUtc } = await import("../../api/src/front-office/booking/slots.ts");
const TZ = "America/Toronto", MIN = 60_000, DAY = 24 * 60 * MIN, KEY = "maple39";

// ------------------------------------------------------------------------------------------------------------ set-up
if (await db.platformFirm.findUnique({ where: { key: KEY } })) { console.error(`STOP  firm ${KEY} exists: start a fresh copy (isolated.sh … start)`); process.exit(2); }
const M = await db.platformFirm.create({ data: { key: KEY, operatingName: "Maple Immigration (Sample)", countryCode: "CA", status: "ACTIVE", contactEmail: "hello@maple39.example" } });
await db.$transaction((tx) => seedFirmFrontOffice(tx, M.id));
const ws = await platformAuditWorkspaceId(db as never);
const setting = (key: string, value: unknown) => writeSetting(db, { firmId: M.id, key, value, by: "system:test", workspaceId: ws });
await setting(TIME_ZONE.key, TZ); await setting(CLOSED_DAYS.key, []); await setting(EVERYONE_SEES_ALL.key, true);
const person = async (name: string, role: string) => {
  const s = await db.platformStaff.create({ data: { firmId: M.id, email: `${name.replace(/\W/g, "").toLowerCase()}@maple39.example`, displayName: name } });
  await db.platformRoleGrant.create({ data: { firmId: M.id, staffId: s.id, role: role as never, grantedBy: "seed:j39" } });
  return s;
};
const F = await person("Client F", "OWNER"), C = await person("Client C", "CASE_OFFICER"), I = await person("Client I", "CASE_OFFICER"), D = await person("Client D", "BILLING_FINANCE");
const HOSTS = [F, C, I, D];
await db.foAvailability.createMany({ data: HOSTS.flatMap((h) => [1, 2, 3, 4, 5].map((weekday) => ({ firmId: M.id, staffId: h.id, weekday, startMinute: 540, endMinute: 1020, timeZone: TZ }))) });
const type = await db.foConsultationType.create({ data: { firmId: M.id, slug: "free-consultation", name: "Free consultation", modes: ["VIDEO", "PHONE"], hostStaffIds: HOSTS.map((h) => h.id), minutes: 30, windowDays: 60, minNoticeMinutes: 0 } });
const lead = async (given: string, owner: string) => {
  const p = await db.foPerson.create({ data: { firmId: M.id, givenNames: given, familyName: "Sample", email: `${given.replace(/\W/g, "").toLowerCase()}@client39.example`, createdBy: "test" } });
  await db.foLead.create({ data: { firmId: M.id, personId: p.id, door: "MANUAL", source: "WEBSITE", ownerStaffId: owner, createdBy: "test" } });
  return p;
};
const P = await lead("Client P", C.id), B = await lead("Client B", I.id);
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const hm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
const wall = (date: string, hhmm: string) => { const [y, m, d] = date.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number); return wallToUtc(y, m, d, h * 60 + mi, TZ)!; };
const plus = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const today = ymd(new Date());
const nextMonday = (() => { let d = plus(today, 1); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = plus(d, 1); return d; })();
const book = (host: string, personId: string, startsAt: Date) => db.foBooking.create({ data: { firmId: M.id, typeId: type.id, staffId: host, personId, mode: "VIDEO", startsAt, endsAt: new Date(startsAt.getTime() + 30 * MIN), bookerTimeZone: TZ } });
const ofI = await book(I.id, B.id, wall(plus(nextMonday, 2), "14:00")), ofD = await book(D.id, B.id, wall(plus(nextMonday, 3), "15:00"));
ok("J-39 setup: firm maple39 (Sample), an Owner, two Case Officers with the list key, a Billing and finance host without it, Mon-Fri hours, one booking each for Client I and Client D next week", !!ofI.id && !!ofD.id);

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const settle = async (p: Page) => { await p.locator("main h1").first().waitFor({ timeout: 30_000 }); await p.locator("[data-loading]").first().waitFor({ state: "detached", timeout: 30_000 }).catch(() => undefined); await p.waitForTimeout(250); };
const go = async (p: Page, path: string) => { await p.goto(`${BASE}${path}`); await settle(p); };
/** A person signs in on the sign-in card (PF-4's local stand-in: firm key and work email). */
async function signIn(email: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: TZ, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill(KEY); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 20_000 });
  return p;
}
const cal = (p: Page) => p.locator("[data-bookings-calendar]");
const calText = async (p: Page) => (await cal(p).innerText()).replace(/\s+/g, " ");
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const axeBad = async (p: Page) => (await new AxeBuilder({ page: p }).withTags(TAGS).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`);

try {
  // --------------------------------------------------------------------------------------------- W1: sign in, book
  const c = await signIn(C.email);
  await settle(c);
  await c.getByRole("link", { name: "Home", exact: true }).first().click(); await settle(c);
  await shot(c, "w1-home-1440");
  const way = c.locator('a[href="/front-office/bookings"]').first(), hasWay = (await way.count()) > 0;
  ok("J-39 W1 way in: after sign-in, Home has a link to the Bookings calendar (no address typed)", hasWay, hasWay ? await way.innerText() : null);
  if (hasWay) { await way.click(); await settle(c); } else await go(c, "/front-office/bookings");
  await cal(c).waitFor({ timeout: 20_000 });
  const whose = await c.getByRole("group", { name: "Whose" }).count();
  await go(c, `/front-office/bookings?view=week&whose=mine&date=${nextMonday}`);
  const emptyBefore = (await c.locator("[data-block]").count()) === 0;
  ok("J-39 W2 fail (before the booking, P-606): Client C's own week is empty", emptyBefore && whose === 1, { whose });
  await c.locator("[data-new-booking]").click();
  await c.locator("[data-person-find]").fill("Client P");
  await c.locator("[data-person]").selectOption({ index: 1 });
  await c.locator("[data-host]").selectOption({ label: "Client C (you)" });
  const slot = c.locator("[data-time-chooser] button[aria-pressed]").first();
  await slot.waitFor({ timeout: 15_000 }); await slot.click();
  await shot(c, "w1-new-booking-1440");
  await c.locator("[data-book]").click();
  await c.locator("[data-book]").waitFor({ state: "detached", timeout: 15_000 });
  const said = await c.locator("[data-saved]").innerText().catch(() => "");
  const mine = await db.foBooking.findFirst({ where: { firmId: M.id, staffId: C.id, personId: P.id } });
  ok("J-39 W1: Client C signs in on screen, opens Bookings and books Client P for herself with New booking (a free time offered): \"Booked\", stored once with her as host", said.startsWith("Booked Client P Sample") && !!mine && await db.foBooking.count({ where: { firmId: M.id, staffId: C.id } }) === 1, { said });
  if (!mine) throw new Error("no booking was made; the walk cannot go on");
  const day = ymd(mine.startsAt), time = hm(mine.startsAt), hour = Number(time.slice(0, 2));

  // --------------------------------------------------------------------------------------------- W2: the three views
  await go(c, `/front-office/bookings?view=week&whose=mine&date=${day}`);
  await c.getByRole("button", { name: "Week", exact: true }).click(); await settle(c);
  const cell = c.locator(`[data-cell="${day}T${String(hour).padStart(2, "0")}"]`);
  const weekBlocks = await c.locator("[data-block]").count(), inCell = await cell.locator("[data-block]").count(), zone = await c.locator("[data-zone-line]").innerText();
  ok(`J-39 W2 week: Mine › Week shows her one booking as a block on ${day} at ${String(hour).padStart(2, "0")}:00, and names the office zone`, weekBlocks === 1 && inCell === 1 && zone.includes(TZ) && (await cell.innerText()).includes("Client P"), { weekBlocks, inCell, zone });
  await shot(c, "w2-week-mine-1440");
  await c.getByRole("button", { name: "Day", exact: true }).click(); await settle(c);
  const dayText = await calText(c);
  ok("J-39 W2 day: Mine › Day shows the same booking (Client P, its time)", /view=day/.test(c.url()) && (await c.locator("[data-block]").count()) === 1 && dayText.includes("Client P") && dayText.includes(time), { url: c.url() });
  await shot(c, "w2-day-mine-1440");
  await c.getByRole("button", { name: "List", exact: true }).click(); await settle(c);
  const rows = await c.locator("[data-row]").allInnerTexts(), row = (rows.find((r) => r.includes("Client P")) ?? "").replace(/\s+/g, " ");
  ok("J-39 W2 list: Mine › List shows its row: when (office time), Client P Sample, Free consultation, Client C, Scheduled", /view=list/.test(c.url()) && rows.length === 1 && row.includes(time) && row.includes("Client P Sample") && row.includes("Free consultation") && row.includes("Client C") && row.includes("Scheduled"), { rows: rows.length, row });
  await shot(c, "w2-list-mine-1440");

  // --------------------------------------------------------------------------------------------- W3: open a booking
  await c.getByRole("button", { name: "Week", exact: true }).click(); await settle(c);
  await c.locator("[data-block]").first().click();
  await c.locator("[data-booking-detail]").waitFor({ timeout: 15_000 });
  const detail = (await c.getByRole("dialog").innerText()).replace(/\s+/g, " ");   // the panel: its title names the person and the type
  ok("J-39 W3: the block opens the booking: Client P Sample, the time, Free consultation, host Client C; the address is the booking's own", detail.includes("Client P Sample") && detail.includes(time) && detail.includes("Free consultation") && detail.includes("Client C") && c.url().includes(mine.id), { url: c.url(), detail: detail.slice(0, 200) });
  await shot(c, "w3-detail-1440");
  await c.keyboard.press("Escape"); await c.locator("[data-booking-detail]").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
  await go(c, `/front-office/bookings?view=week&whose=mine&date=${day}`);
  await c.locator("[data-block]").first().focus(); await c.keyboard.press("Enter");
  const byKeys = await c.locator("[data-booking-detail]").waitFor({ timeout: 10_000 }).then(() => true, () => false);
  ok("J-39 W3 keyboard: focus on the block and Enter opens the same booking", byKeys && c.url().includes(mine.id));

  // --------------------------------------------------------------------------------------------- W4: time off
  let off = plus(day, 1); while ([0, 6].includes(new Date(`${off}T12:00:00Z`).getUTCDay())) off = plus(off, 1);
  // Fails on the fake (P-606): before the day off exists, that day's own cell holds no time off.
  await go(c, `/front-office/bookings?view=week&whose=mine&date=${off}`);
  const offBefore = await c.locator(`[data-off-day="${off}"] [data-off]`).count();
  ok(`J-39 W4 fail (before the day off, P-606): the week shows no time off on ${off}`, offBefore === 0 && (await c.locator("[data-cell]").count()) + (await c.locator("[data-empty]").count()) > 0, { offBefore });   // the week loaded: its grid, or its empty words when the day off falls in a week with no booking
  await go(c, "/account/availability");
  await c.getByRole("button", { name: "Add time off" }).click();
  await c.locator("[data-time-off-form]").getByLabel("Whole day").check();
  await c.locator("[data-time-off-form]").getByLabel("From").fill(off);
  await c.getByRole("button", { name: "Save time off" }).click();
  await c.locator("[data-time-off-row]").first().waitFor({ timeout: 15_000 });
  const offRow = await c.locator("[data-time-off-row]").first().innerText(), stored = await db.foTimeOff.findMany({ where: { firmId: M.id, staffId: C.id } });
  ok(`J-39 W4 setup: Client C adds a whole day off on ${off} (My account › Availability › Add time off): listed there and stored once`, stored.length === 1 && ymd(stored[0].startsAt) === off && offRow.length > 0, { offRow: offRow.replace(/\s+/g, " ") });
  await shot(c, "w4-time-off-added-1440");
  // Tied to the day itself (review Minor on #2914): the day off's own cell, its own hours, its own List row.
  const monday = (d: string) => { const wd = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; return plus(d, -wd); }, sameWeek = monday(day) === monday(off);
  const dayName = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${off}T12:00:00Z`));
  await go(c, `/front-office/bookings?view=week&whose=mine&date=${off}`);
  const wkOff = (await c.locator(`[data-off-day="${off}"] [data-off]`).allInnerTexts()).join(" | "), wkElse = await c.locator(`[data-off-day]:not([data-off-day="${off}"]) [data-off]`).count();
  const shadedOff = await c.locator(`[data-cell^="${off}T"][data-off-hour]`).count(), shadedBooking = await c.locator(`[data-cell^="${day}T"][data-off-hour]`).count(), blockKept = await c.locator(`[data-cell="${day}T${String(hour).padStart(2, "0")}"] [data-block]`).count();
  await shot(c, "w4-week-with-day-off-1440");
  ok(`J-39 W4 week (QA-743): ${off}'s own cell says "Time off" (and no other day does), its hours are shaded, the booking day's are not, and the booking's block is still there`,
    /^Time off/.test(wkOff) && wkElse === 0 && shadedOff > 0 && shadedBooking === 0 && blockKept === (sameWeek ? 1 : 0), { wkOff, wkElse, shadedOff, shadedBooking, blockKept, sameWeek });
  await go(c, `/front-office/bookings?view=day&whose=mine&date=${off}`);
  const dyOff = (await c.locator(`[data-off-day="${off}"] [data-off]`).allInnerTexts()).join(" | "), dyShaded = await c.locator(`[data-cell^="${off}T"][data-off-hour]`).count();
  await shot(c, "w4-day-with-day-off-1440");
  ok(`J-39 W4 day (QA-743): Day for ${off} shows "Time off" in that day's cell and shades its hours`, /^Time off/.test(dyOff) && dyShaded > 0, { dyOff, dyShaded });
  await go(c, `/front-office/bookings?view=list&whose=mine&date=${off}`);
  const lsOff = (await c.locator("[data-off-row]").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
  await shot(c, "w4-list-with-day-off-1440");
  ok(`J-39 W4 list (QA-743): List has one time off row naming ${dayName}, Client C and "Time off", beside her booking's row`,
    lsOff.length === 1 && lsOff[0].includes(dayName) && lsOff[0].includes("Client C") && lsOff[0].includes("Time off") && (await c.locator("[data-row]").count()) === (sameWeek ? 1 : 0), { lsOff, sameWeek });

  // --------------------------------------------------------------------------------------------- W5: the key
  await go(c, `/front-office/bookings?view=week&whose=mine&date=${nextMonday}`);
  const mineHasI = (await calText(c)).includes("Client B");
  await c.getByRole("button", { name: "Team", exact: true }).click(); await settle(c);
  const teamHasI = (await calText(c)).includes("Client B");
  await c.locator("[data-host-filter]").selectOption({ label: "Client I" }); await settle(c);
  const onlyI = await c.locator("[data-block]").count(), filteredText = await calText(c);
  ok("J-39 W5 with the key: Client C's Mine never shows Client I's booking; Team shows it; \"Host: Client I\" narrows the week to Client I's (Client B), kept in the address", !mineHasI && teamHasI && onlyI >= 1 && filteredText.includes("Client B") && !filteredText.includes("Client P") && /host=/.test(c.url()), { mineHasI, teamHasI, onlyI, url: c.url() });
  await shot(c, "w5-team-host-filter-1440");
  const d = await signIn(D.email);
  await go(d, "/front-office/bookings");
  const dMenu = await d.locator('nav[aria-label="Bookings"] a[href="/front-office/bookings"]').count(), dRefused = (await d.locator("main").innerText()).includes("You do not have permission to do this.");
  await shot(d, "w5-no-key-refused-1440");
  await go(d, `/front-office/bookings/${ofI.id}`);
  const dOther = await d.getByText("This booking is not available.").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await go(d, `/front-office/bookings/${ofD.id}`);
  const dOwn = await d.locator("[data-booking-detail]").waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const token = await d.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string | undefined);
  const feed = (view: string) => fetch(`${BASE}/api/front-office/bookings/feed?view=${view}&from=${nextMonday}T00:00:00Z&to=${plus(nextMonday, 7)}T00:00:00Z`, { headers: { authorization: `Bearer ${token}` } });
  const team = await feed("team"), own = await feed("mine"), ownItems = own.ok ? ((await own.json()) as { items: { id: string }[] }).items.map((x) => x.id) : [];
  ok("J-39 W5 without the key: Client D (Billing and finance) has no Bookings menu entry, the calendar refuses in plain words, Client I's booking by its link is \"not available\", the team feed answers 403; their own booking opens by its link and the own feed holds only it",
    dMenu === 0 && dRefused && dOther && dOwn && team.status === 403 && ownItems.length === 1 && ownItems[0] === ofD.id, { dMenu, dRefused, dOther, dOwn, team: team.status, ownItems: ownItems.length });

  // --------------------------------------------------------------------------------------------- W6: sizes and axe
  for (const width of [400, 1024, 1440]) {
    const q = await signIn(C.email, width);
    await go(q, `/front-office/bookings?view=week&whose=team&date=${nextMonday}`);
    const fits = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), bad = await axeBad(q);
    ok(`J-39 W6: at ${width} px the Team week has no sideways scroll and no serious axe violation (WCAG 2.2 A/AA)`, fits && bad.length === 0, { fits, bad });
    if (width === 400) await shot(q, "w6-week-400");
    await q.context().close();
  }
  ok("J-39: no page error during the walk", errors.length === 0, errors);
} catch (e) {
  ok("J-39: the walk ran to its end", false, String(e).slice(0, 500));
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
