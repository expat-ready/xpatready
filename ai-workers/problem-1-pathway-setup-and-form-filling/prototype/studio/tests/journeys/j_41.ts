// J-41 (map row 41, R1.41: staff hours and time off): the join-and-walk row (rows rev 16.11 (b); brief
// lead-b-briefs/J-rows.md §J-41). It adds no feature: it walks FO-3st2's screen (My account → Availability and Time off)
// and FO-3w's public booking page (on main) over FO-3a part 1's real routes, on an isolated copy of the running app (its
// own database and port, never :4400), at 1440 px. A host sets weekly hours and a day off by screens; a booker with no
// session then sees it on the firm's public page.
//   W1: a host sets weekly hours (Monday 10:00-12:00 instead of 09:00-17:00, "Save hours");
//   W2: adds a day off (the Tuesday, whole day, "Save time off");
//   W3: the public page shows no slots that day (the Tuesday cannot be chosen) and slots only inside the hours (the
//       Monday offers 10:00-11:30 only; the Wednesday, untouched, still starts at 09:00);
//   W4: ends at row 37's first step, the slot list: the booker picks the Monday's 10:00 and reaches "Your details".
// Swaps (DW): none. Step 0's grep (`git grep 'fake[A-Z]…(' api/src`, 19 Nov, on main with FO-2 part 3b): no fake is left
// in the booking module's running path (`arrival` is the real PrismaArrival since FO-2 part 3b; mail is the app's
// MailPort). Hours, time off and busy times are read from the database, and this walk makes no booking. Fails on the
// fake (P-606): with no fake behind any judge, the stand-in replaced is "no hours or day off set": every W3 judge is
// run before the host changes anything and must fail there (the NR lines).
// Dates: the Monday at least a week ahead and its Tuesday and Wednesday, America/Toronto (the Sample firm's zone).
// Sample rows only; US$0, no model call. Screenshots: product/screens/J-41/screenshots/.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j41 4441 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j41 4441 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_41.ts j41 4441
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { wallToUtc } from "../../api/src/front-office/booking/slots.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j41", Number(process.argv[3] ?? 4441)];
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", ".."), TZ = "America/Toronto";
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-41", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/xr_studio_${NAME}`, options: "-c TimeZone=UTC" }) });
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
async function call(tok: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: b };
}

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const firm = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } });
const host = await db.platformStaff.create({ data: { firmId: firm.id, email: `j41-host-${run}@sample-firm.example.com`, displayName: `Sample host ${run}`, status: "ACTIVE" } });
await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: host.id, role: "CASE_OFFICER", grantedBy: "test:j41" } });
const slug = `j41-${run}`;
await db.foConsultationType.create({ data: { firmId: firm.id, slug, name: `Hours walk ${run}`, modes: ["VIDEO"], hostStaffIds: [host.id], minutes: 30, windowDays: 120, meetingLink: "https://meet.example/sample-room" } });
const signedIn = await call(null, "POST", "/platform/session/local", { firmKey: "sample-firm", email: host.email, secondStep: true });
const tok = signedIn.body?.token as string | undefined;
if (!tok) throw new Error(`STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local): ${JSON.stringify(signedIn.body)}`);
const pending = await call(tok, "GET", "/platform/me/terms");   // PF-5t: a new person accepts the privacy notice first
const termIds = ((pending.body?.pending ?? pending.body?.terms ?? []) as { id?: string; versionId?: string }[]).map((t) => t.versionId ?? t.id).filter(Boolean);
if (termIds.length) await call(tok, "POST", "/platform/me/terms/accept", { versionIds: termIds });

// The Monday at least a week ahead, its Tuesday and Wednesday (Toronto), in the page's own words.
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...o });
let mon = new Date(Date.now() + 7 * 86_400_000); while (fmt({ weekday: "short" }).format(mon) !== "Mon") mon = new Date(mon.getTime() + 86_400_000);
const at = (key: string, minutes = 0) => { const [y, m, d] = key.split("-").map(Number); return wallToUtc(y, m, d, minutes, TZ)!; };
const keyOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
// Each next day is read at the day before's local noon plus 24 h, so the hour the run starts never moves a day (review M1).
const days = [0, 1, 2].map((n) => {
  const d = new Date(at(keyOf(mon), 720).getTime() + n * 86_400_000), p = Object.fromEntries(fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(d).map((x) => [x.type, x.value]));
  return { key: keyOf(d), words: `${p.weekday} ${p.day} ${p.month}`, month: `${p.month} ${p.year}` };
});
const [MON, TUE, WED] = days;
if (!/^Monday /.test(MON.words) || !/^Tuesday /.test(TUE.words) || !/^Wednesday /.test(WED.words)) throw new Error(`STOP  the walk's days are not Monday, Tuesday, Wednesday: ${JSON.stringify(days)}`);

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function page(session: string | null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce", timezoneId: TZ });
  if (session) await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, session);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  return p;
}
/** The viewport with `sel` scrolled into it (a full-page shot draws the sticky top bar over the week: review m2). */
const shot = async (p: Page, name: string, sel?: string) => { if (sel) await p.locator(sel).first().scrollIntoViewIfNeeded(); await p.screenshot({ path: join(SHOTS, `j41-${name}.png`) }); };
/** What a booker with no session sees on the public page for one day: can the day be chosen, and its times if so. */
async function publicDay(p: Page, d: typeof MON): Promise<{ open: boolean; times: string[] }> {
  const shown = () => p.locator("h2[aria-live]").innerText(), n = (words: string) => { const t = new Date(`1 ${words} UTC`); return t.getUTCFullYear() * 12 + t.getUTCMonth(); };
  for (let i = 0, at = await shown(); i < 6 && at !== d.month; i++, at = await shown()) {   // the three days can straddle a month's end
    await p.getByRole("button", { name: n(at) < n(d.month) ? "Next month" : "Previous month" }).click(); await p.waitForFunction((was) => document.querySelector("h2[aria-live]")?.textContent !== was, at, { timeout: 10_000 });
  }
  await p.locator(`[role="group"][aria-label="${d.month}"]`).waitFor({ timeout: 15_000 });
  const btn = p.getByRole("button", { name: d.words, exact: true });
  if (await btn.isDisabled()) return { open: false, times: [] };
  await btn.click(); await p.locator("[data-day-times] h3", { hasText: d.words }).waitFor({ timeout: 10_000 });
  return { open: true, times: await p.locator("[data-day-times] li").allInnerTexts() };
}
async function publicPage(): Promise<Page> {
  const p = await page(null);
  await p.goto(`${BASE}/book/sample-firm/${slug}`); await p.getByRole("heading", { name: "Choose a time" }).waitFor({ timeout: 30_000 });
  return p;
}
const INSIDE = ["10:00", "10:30", "11:00", "11:30"];
const judges = (m: { open: boolean; times: string[] }, t: { open: boolean; times: string[] }) => ({ hours: m.open && JSON.stringify(m.times) === JSON.stringify(INSIDE), dayOff: !t.open });

try {
  // -------------------------------------------------------------------------------- W1: the host opens Availability
  const p = await page(tok);
  await p.goto(`${BASE}/account/availability`); await p.locator("[data-week-editor]").waitFor({ timeout: 30_000 });
  ok("J-41 W1: the host opens My account → Availability and sees the firm's hours as \"Normal hours\" (Monday 09:00-17:00)", (await p.locator("[data-set]").first().innerText()).includes("Normal hours") && (await p.getByLabel("Monday hours 1: start").inputValue()) === "09:00" && (await p.getByLabel("Monday hours 1: end").inputValue()) === "17:00");

  // -------------------------------------------------------------- NR: before any change, W3's judges must fail
  const before = await publicPage();
  const [m0, t0] = [await publicDay(before, MON), await publicDay(before, TUE)], nr = judges(m0, t0);
  ok("J-41 NR (fails with no hours or day off set): the Monday offers the firm's 09:00-17:00, so \"only 10:00-11:30\" is false", !nr.hours && m0.times[0] === "09:00" && m0.times.at(-1) === "16:30", m0);
  ok("J-41 NR (fails with no hours or day off set): the Tuesday can be chosen and has times, so \"no slots that day\" is false", !nr.dayOff && t0.times.length > 0, t0);
  await before.context().close();

  // ------------------------------------------------------------------------------ W1: the host sets weekly hours
  const monday = p.locator('[data-day="Monday"]');
  await monday.getByLabel("Monday hours 1: start").fill("10:00"); await monday.getByLabel("Monday hours 1: end").fill("12:00");
  await p.getByRole("button", { name: "Save hours" }).click(); await p.locator("[data-saved]", { hasText: "Saved." }).waitFor({ timeout: 10_000 });
  const sets = (await call(tok, "GET", "/front-office/me/availability-sets")).body.sets as { isDefault: boolean; windows: { weekday: number; start: string; end: string }[] }[];
  const saved = sets.find((s) => s.isDefault)?.windows.filter((w) => w.weekday === 1);
  ok("J-41 W1: the host sets Monday to 10:00-12:00 on My account → Availability; \"Save hours\" answers Saved and the server holds it", JSON.stringify(saved) === JSON.stringify([{ weekday: 1, start: "10:00", end: "12:00" }]) && (await p.locator("[data-saved]").innerText()).includes("Existing bookings are not moved."), saved);
  await shot(p, "w1-hours-saved", "[data-week-editor]");

  // ----------------------------------------------------------------------------------------- W2: adds a day off
  await p.getByRole("button", { name: "Add time off" }).click();
  await p.getByLabel("From").fill(TUE.key);
  await p.getByRole("button", { name: "Save time off" }).click(); await p.locator("[data-time-off-row]").first().waitFor({ timeout: 10_000 });
  const off = (await call(tok, "GET", "/front-office/me/time-off")).body.timeOff as { startsAt: string; endsAt: string }[];
  const row = await p.locator("[data-time-off-row] > span").first().innerText();
  ok("J-41 W2: the host adds the Tuesday as a whole day off; it is listed and saved midnight to midnight (Toronto)", off.length === 1 && off[0].startsAt === at(TUE.key).toISOString() && off[0].endsAt === at(WED.key).toISOString() && /\(whole day\)$/.test(row), { off, row });
  await shot(p, "w2-day-off-saved", "[data-time-off-row]");
  await p.context().close();

  // --------------------------------------------- W3: the public page, read by a booker with no session
  const b = await publicPage();
  const t1 = await publicDay(b, TUE);
  ok("J-41 W3: the public page shows no slots on the day off (the Tuesday cannot be chosen)", judges({ open: true, times: INSIDE }, t1).dayOff, t1);
  const w1 = await publicDay(b, WED);
  ok("J-41 W3: a day the host did not touch is as before (the Wednesday still offers 09:00 to 16:30)", w1.open && w1.times[0] === "09:00" && w1.times.at(-1) === "16:30", w1);
  const m1 = await publicDay(b, MON);
  ok("J-41 W3: the public page shows slots only inside the hours (the Monday offers 10:00, 10:30, 11:00, 11:30 and nothing else)", judges(m1, { open: false, times: [] }).hours, m1);
  const api = await call(null, "GET", `/public/firms/sample-firm/book/${slug}/slots?from=${encodeURIComponent(at(MON.key).toISOString())}&to=${encodeURIComponent(at(WED.key).toISOString())}`);
  const starts = ((api.body.slots ?? []) as { startsAt: string }[]).map((s) => Date.parse(s.startsAt));
  ok("J-41 W3: underneath, the slots route gives the same (Monday 10:00-11:30 only, nothing on the Tuesday)", api.status === 200 && starts.length === 4 && starts.every((s) => s >= at(MON.key, 600).getTime() && s < at(MON.key, 720).getTime()), api.body.slots);
  await shot(b, "w3-public-page-monday");

  // ------------------------------------------------------- W4: ends at row 37's first step, the slot list
  await b.locator("[data-day-times] li button").first().click();
  await b.getByRole("heading", { name: "Your details" }).waitFor({ timeout: 10_000 });
  const chosen = await b.locator("[data-chosen]").innerText();
  ok("J-41 W4: the booker picks 10:00 from the slot list and reaches \"Your details\" with that time (row 37's first step)", chosen === `${MON.words}, 10:00 ${TZ} time`, chosen);
  await shot(b, "w4-slot-chosen");
  ok("J-41: no page error in any browser", errors.length === 0, errors);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
