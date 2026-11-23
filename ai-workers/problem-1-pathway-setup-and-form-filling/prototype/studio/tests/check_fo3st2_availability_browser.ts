// FO-3st2 (brief lead-b-briefs/FO-3st2.md; concept screens/fo-3-booking r2 BR-17, §6 J-A1..J-A5; AG-4-62 rules 1-8, §8,
// §11): My account → Availability and Time off in a real browser against FO-3a part 1b's real routes on the isolated copy
// (PF-4's local stand-in sign-in; no fake API). J-A1..J-A5 and DW6, each a pass and a fail; public slots read through
// FO-3's slots route; the booking read through the staff booking route. Seeds the Sample firms, then adds this run's own
// people (Client F, a new Case Officer with no hours; an Admin) and one public type hosted by Client F. Dates are the
// Monday at least a week ahead (the requirement's "Mon 26 Oct" is past), America/Toronto (the firm's zone). US$0.
//   zsh studio/tools/isolated.sh screens_fo3st2 4571 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo3st2_availability_browser.ts 4571 xr_studio_screens_fo3st2
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { wallToUtc } from "../api/src/front-office/booking/slots.ts";
import { ACCOUNT_SECTIONS } from "../web/src/modules/platform/account-sections.ts";
import { recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4571), DBNAME = process.argv[3] ?? "xr_studio_screens_fo3st2";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-3-booking", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"], TZ = "America/Toronto";
const NO_HOURS = "You offer no times on the booking page. Staff can still book you, with a warning.";
const { ok, summary } = recorder();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const firm = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } });

// ----------------------------------------------------------------------------------------------------------- set-up
type Res = { status: number; body: any };
async function call(tok: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ }
  return { status: r.status, body: b };
}
async function signIn(email: string): Promise<string> {
  const r = await call(null, "POST", "/platform/session/local", { firmKey: "sample-firm", email, secondStep: true });
  if (!r.body.token) throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${JSON.stringify(r.body)}`);
  const pending = await call(r.body.token, "GET", "/platform/me/terms");   // PF-5t: a new person accepts the privacy notice first
  const ids = ((pending.body?.pending ?? pending.body?.terms ?? []) as { id?: string; versionId?: string }[]).map((t) => t.versionId ?? t.id).filter(Boolean);
  if (ids.length) await call(r.body.token, "POST", "/platform/me/terms/accept", { versionIds: ids });
  return r.body.token as string;
}
const person = async (name: string, role: string) => {
  const s = await db.platformStaff.create({ data: { firmId: firm.id, email: `fo3st2-${name.replace(/\W/g, "").toLowerCase()}-${run}@sample-firm.example.com`, displayName: `${name} ${run}`, status: "ACTIVE" } });
  await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: s.id, role: role as never, grantedBy: "test:fo3st2" } });
  return s;
};
const F = await person("Client F", "CASE_OFFICER"), A = await person("Sample Admin", "ADMIN");
const T = await db.platformStaff.findFirstOrThrow({ where: { actorId: "user-T" } });   // the Sample firm's Case Manager
const gone = await person("Former colleague", "CASE_OFFICER"); await db.platformStaff.update({ where: { id: gone.id }, data: { status: "DEACTIVATED" } });
const [fTok, aTok, tTok] = [await signIn(F.email), await signIn(A.email), await signIn(T.email)];
const slug = `fo3st2-${run}`;
await db.foConsultationType.create({ data: { firmId: firm.id, slug, name: `Availability check ${run}`, modes: ["VIDEO"], hostStaffIds: [F.id], minutes: 30, windowDays: 120, meetingLink: "https://meet.example/sample-room" } });

// The Monday at least a week ahead, and its Tuesday (Toronto). Calendar days, never instants (20 Nov fix): the dates
// come from today's date in Toronto by whole-day steps on "YYYY-MM-DD", so the hour of the run cannot move them. Before,
// TUE was "Monday at this time + 25 h": a run that started between 23:00 and 24:00 Toronto got Wednesday as its Tuesday
// (CI run 44676831421 started 04:58 UTC = 23:58 Toronto; J-A2 read Wednesday's slots, J-A4 expected the wrong end).
const today = new Date(), dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const plusDays = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();   // 0 = Sunday, 1 = Monday
let MON = plusDays(dayOf(today), 7); while (weekdayOf(MON) !== 1) MON = plusDays(MON, 1);
const TUE = plusDays(MON, 1), WED = plusDays(MON, 2);
const at = (day: string, hhmm: string) => { const [y, m, d] = day.split("-").map(Number); return wallToUtc(y, m, d, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ)!; };
const local = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
async function slots(day: string, next: string): Promise<{ list: string[]; formStamp: string }> {
  const r = await call(null, "GET", `/public/firms/sample-firm/book/${slug}/slots?from=${encodeURIComponent(at(day, "00:00").toISOString())}&to=${encodeURIComponent(at(next, "00:00").toISOString())}`);
  if (r.status !== 200) throw new Error(`slots: ${JSON.stringify(r)}`);
  return { list: (r.body.slots as { startsAt: string }[]).map((s) => local(s.startsAt)), formStamp: r.body.formStamp };
}

const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function open(tok: string, path = "/account/availability", width = 1440, zone = TZ): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce", timezoneId: zone });
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}${path}`); await p.locator("[data-week-editor]").waitFor({ timeout: 30_000 });
  return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo3st2-${name}.png`), fullPage: true });
const day = (p: Page, name: string) => p.locator(`[data-day="${name}"]`);
const times = async (p: Page, name: string) => (await day(p, name).locator('input[type="time"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).join(",");
const chooseSet = async (p: Page, name: string) => { await p.locator(`[data-set="${name}"]`).click(); await p.locator("#fo3st2-set", { hasText: name }).waitFor(); };
/** Where the keyboard is: the focused element's label, id or text. */
const focused = (p: Page) => p.evaluate(() => { const a = document.activeElement as HTMLElement | null; return a ? a.getAttribute("aria-label") ?? (a.id || null) ?? a.textContent?.trim() ?? a.tagName : null; });
const setsOf = async (tok: string, path = "/front-office/me") => (await call(tok, "GET", `${path}/availability-sets`)).body.sets as { id: string; name: string; isDefault: boolean; timeZone: string; windows: { weekday: number; start: string; end: string }[] }[];

try {
  // ------------------------------------------------------------------------------------------------------ J-A1
  const pf = await open(fTok);
  const listed = await pf.locator("[data-set]").allInnerTexts();
  const weekdays = await Promise.all(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map((d) => times(pf, d)));
  const weekend = [await day(pf, "Saturday").innerText(), await day(pf, "Sunday").innerText()];
  ok("FO-3st2 J-A1 pass: a new staff member sees one set \"Normal hours\", marked Default, Mon-Fri 09:00-17:00", listed.length === 1 && /Normal hours/.test(listed[0]) && /Default/.test(listed[0]) && weekdays.every((w) => w === "09:00,17:00") && weekend.every((w) => w.includes("Unavailable")), { listed, weekdays, weekend });
  ok("FO-3st2 J-A1 pass: in the office zone (\"Times in America/Toronto\")", (await pf.locator("[data-zone-line]").innerText()) === `Times in ${TZ}`);
  ok("FO-3st2 J-A1 pass: the menu lists Availability once (one ACCOUNT_SECTIONS entry)", ACCOUNT_SECTIONS.filter((s) => s.path === "/account/availability").length === 1 && (await pf.locator('nav[aria-label="My account"] [data-account-section="/account/availability"]').count()) === 1);
  const delDefault = await call(fTok, "DELETE", `/front-office/me/availability-sets/${(await setsOf(fTok))[0].id}`);
  ok("FO-3st2 J-A1 fail: the default set has no Delete set, and the server refuses its delete (\"You cannot delete your default set.\")", (await pf.getByRole("button", { name: "Delete set" }).count()) === 0 && delDefault.status === 409 && delDefault.body.detail === "You cannot delete your default set.", delDefault);
  ok("FO-3st2 J-A1 fail: no \"Viewing\" picker for a Case Officer", (await pf.locator("[data-viewing]").count()) === 0);
  // A booking with Client F on the Monday at 10:00, made through the public door once her first read has given her Normal hours (J-A4 reads it after).
  const before = await slots(MON, TUE);
  await new Promise((r) => setTimeout(r, 3_200));   // the real app's minimum fill time (AG-4-20 rule 3)
  const booked = await call(null, "POST", `/public/firms/sample-firm/book/${slug}/bookings`, { givenNames: "Client B", familyName: "Sample", email: `client.b.${run}@example.org`, mode: "VIDEO", startsAt: at(MON, "10:00").toISOString(), timeZone: TZ, formStamp: before.formStamp });
  ok("FO-3st2 setup: a public booking with Client F on the Monday at 10:00", booked.status === 201, booked.body);
  const bookingId = (await db.foBooking.findFirstOrThrow({ where: { firmId: firm.id, staffId: F.id }, orderBy: { createdAt: "desc" } })).id;

  await axe("FO-3st2 DW6 Availability (1440)", pf); await noSideways("FO-3st2 DW6 Availability (1440)", pf); await shot(pf, "availability-1440");

  // ------------------------------------------------------------------------------------------------------ J-A3
  await day(pf, "Monday").getByLabel("Monday hours 1: start").fill("14:00"); await day(pf, "Monday").getByLabel("Monday hours 1: end").fill("13:00");
  await pf.getByRole("button", { name: "Save hours" }).click();
  await day(pf, "Monday").locator("[data-field-error]").waitFor({ timeout: 10_000 });
  const mondayAfter = (await setsOf(fTok))[0].windows.filter((w) => w.weekday === 1);
  ok("FO-3st2 J-A3 fail: 14:00-13:00 shows \"End must be after start.\" on that window, and nothing is saved", (await day(pf, "Monday").locator("[data-field-error]").innerText()) === "End must be after start." && JSON.stringify(mondayAfter) === JSON.stringify([{ weekday: 1, start: "09:00", end: "17:00" }]), mondayAfter);
  ok("FO-3st2 J-A3: the field is marked invalid and named by its error", (await day(pf, "Monday").getByLabel("Monday hours 1: end").getAttribute("aria-invalid")) === "true");
  await shot(pf, "end-after-start-1440");
  await day(pf, "Monday").getByLabel("Monday hours 1: start").fill("09:00"); await day(pf, "Monday").getByLabel("Monday hours 1: end").fill("17:00");
  await pf.getByRole("button", { name: "Add hours: Monday" }).click();
  await day(pf, "Monday").getByLabel("Monday hours 2: start").fill("12:00"); await day(pf, "Monday").getByLabel("Monday hours 2: end").fill("13:00");
  await pf.getByRole("button", { name: "Save hours" }).click();
  await day(pf, "Monday").locator("[data-field-error]", { hasText: "These hours overlap." }).waitFor({ timeout: 10_000 });
  const mon2 = (await setsOf(fTok))[0].windows.filter((w) => w.weekday === 1);
  ok("FO-3st2 J-A3 fail: two overlapping windows show \"These hours overlap.\" on the later one, nothing saved", mon2.length === 1 && (await day(pf, "Monday").locator("[data-window]").nth(1).locator("[data-field-error]").innerText()) === "These hours overlap.", mon2);
  await pf.getByRole("button", { name: "Remove hours: Monday 2" }).click();
  await pf.getByRole("button", { name: "Save hours" }).click(); await pf.locator("[data-saved]", { hasText: "Saved." }).waitFor({ timeout: 10_000 });
  ok("FO-3st2 J-A3 pass: valid hours save (09:00-17:00 Monday kept)", JSON.stringify((await setsOf(fTok))[0].windows.filter((w) => w.weekday === 1)) === JSON.stringify([{ weekday: 1, start: "09:00", end: "17:00" }]));

  // ------------------------------------------------------------------------------------------------------ J-A2
  const tueBefore = (await slots(TUE, WED)).list;
  await pf.getByRole("button", { name: "Add a set" }).click();
  await pf.getByLabel("Set name").fill("Evening calls"); await pf.getByRole("dialog").getByRole("button", { name: "Add a set" }).click();
  await pf.locator("#fo3st2-set", { hasText: "Evening calls" }).waitFor({ timeout: 10_000 });
  await pf.waitForFunction(() => document.activeElement?.id === "fo3st2-set", null, { timeout: 5_000 }).catch(() => null);
  ok("FO-3st2 break M3: after \"Add a set\" the keyboard is on the new set's title", (await focused(pf)) === "fo3st2-set", await focused(pf));
  for (const d of ["Tuesday", "Thursday"]) {
    await pf.getByRole("button", { name: `Add hours: ${d}` }).click();
    await day(pf, d).getByLabel(`${d} hours 1: start`).fill("18:00"); await day(pf, d).getByLabel(`${d} hours 1: end`).fill("20:00");
  }
  await pf.getByRole("button", { name: "Save hours" }).click(); await pf.locator("[data-saved]", { hasText: "Saved." }).waitFor({ timeout: 10_000 });
  const tueSaved = (await slots(TUE, WED)).list;
  ok("FO-3st2 J-A2 fail: a second set that is not the default leaves the public slots as they were (09:00-17:00)", tueBefore[0] === "09:00" && JSON.stringify(tueSaved) === JSON.stringify(tueBefore), { tueBefore, tueSaved });
  await pf.getByRole("button", { name: "Make default" }).click();
  await pf.locator('[data-set="Evening calls"] [data-default]').waitFor({ timeout: 10_000 });
  const tueAfter = (await slots(TUE, WED)).list;
  ok("FO-3st2 J-A2 pass: \"Evening calls\" made default changes the public slots of a type that names no set (Tue 18:00-20:00 only)", tueAfter.length > 0 && tueAfter.every((t) => t >= "18:00" && t < "20:00") && tueAfter[0] === "18:00", tueAfter);
  ok("FO-3st2 J-A2: Normal hours is no longer the default and now shows Delete set", (await pf.locator('[data-set="Normal hours"] [data-default]').count()) === 0 && await (async () => { await chooseSet(pf, "Normal hours"); return (await pf.getByRole("button", { name: "Delete set" }).count()) === 1; })());

  // ------------------------------------------------------------------------------------------------------ J-A5
  await pf.getByRole("button", { name: "Add a set" }).click();
  await pf.getByLabel("Set name").fill("Delhi hours"); await pf.getByRole("dialog").getByRole("button", { name: "Add a set" }).click();
  await pf.locator("#fo3st2-set", { hasText: "Delhi hours" }).waitFor({ timeout: 10_000 });
  await pf.getByRole("button", { name: "Change zone" }).click();
  await pf.getByLabel("Time zone").fill("Mars/Olympus"); await pf.getByRole("button", { name: "Save hours" }).click();
  await pf.getByText("Choose a time zone such as America/Toronto.").waitFor({ timeout: 10_000 });
  ok("FO-3st2 J-A5 fail: a zone that is not a real name is refused on the field, the zone line unchanged", (await pf.locator("[data-zone-line]").innerText()) === `Times in ${TZ}` && (await setsOf(fTok)).find((s) => s.name === "Delhi hours")?.timeZone === TZ);
  await pf.getByLabel("Time zone").fill("Asia/Kolkata");
  await pf.getByRole("button", { name: "Add hours: Monday" }).click();
  await pf.getByRole("button", { name: "Save hours" }).click(); await pf.locator("[data-zone-line]", { hasText: "Asia/Kolkata" }).waitFor({ timeout: 10_000 });
  const savedLine = await pf.locator("[data-saved]").innerText();
  ok("FO-3st2 J-A5 pass: the zone changed to Asia/Kolkata shows \"Times in Asia/Kolkata\"; saving shows \"Existing bookings are not moved.\"", (await pf.locator("[data-zone-line]").innerText()) === "Times in Asia/Kolkata" && savedLine.includes("Existing bookings are not moved.") && (await setsOf(fTok)).find((s) => s.name === "Delhi hours")?.timeZone === "Asia/Kolkata", savedLine);
  await shot(pf, "zone-kolkata-1440");
  // The delete confirm (concept §5) on a set that is not the default.
  await pf.getByRole("button", { name: "Delete set" }).click();
  const confirmText = await pf.getByRole("dialog").innerText();
  await pf.getByRole("button", { name: "Keep" }).click();
  ok("FO-3st2 J-A5: Delete set asks \"Delete Delhi hours? Types that use it switch to your default set.\"; Keep deletes nothing", confirmText.includes("Delete Delhi hours? Types that use it switch to your default set.") && (await setsOf(fTok)).some((s) => s.name === "Delhi hours"));
  await pf.getByRole("button", { name: "Delete set" }).click(); await pf.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await pf.locator('[data-set="Delhi hours"]').waitFor({ state: "detached", timeout: 10_000 });
  ok("FO-3st2 J-A5: Delete removes the set", !(await setsOf(fTok)).some((s) => s.name === "Delhi hours"));
  await pf.waitForFunction(() => document.activeElement?.id === "fo3st2-set", null, { timeout: 5_000 }).catch(() => null);
  ok("FO-3st2 break M3: after Delete the keyboard is on the default set's title, not the page", (await focused(pf)) === "fo3st2-set" && (await pf.locator("#fo3st2-set").innerText()) === "Evening calls", await focused(pf));

  // ------------------------------------------------------------------------------------------- break M1 (unsaved)
  await chooseSet(pf, "Normal hours");
  await day(pf, "Wednesday").getByLabel("Wednesday hours 1: end").fill("11:45");
  let asked = "";
  pf.once("dialog", (d) => { asked = d.message(); void d.dismiss(); });
  await pf.getByRole("button", { name: "Make default" }).click(); await pf.waitForTimeout(500);
  ok("FO-3st2 break M1 fail: Make default with unsaved hours asks first; Keep editing leaves the edit and the default as they were", asked === "Discard your unsaved changes?" && (await day(pf, "Wednesday").getByLabel("Wednesday hours 1: end").inputValue()) === "11:45" && (await setsOf(fTok)).find((x) => x.isDefault)?.name === "Evening calls", asked);
  asked = ""; pf.once("dialog", (d) => { asked = d.message(); void d.dismiss(); });
  await pf.locator('[data-set="Evening calls"]').click(); await pf.waitForTimeout(300);
  ok("FO-3st2 break M1 fail: choosing another set with unsaved hours asks first; dismissed, the editor stays on Normal hours with the edit", asked === "Discard your unsaved changes?" && (await pf.locator("#fo3st2-set").innerText()) === "Normal hours" && (await day(pf, "Wednesday").getByLabel("Wednesday hours 1: end").inputValue()) === "11:45");
  pf.once("dialog", (d) => void d.accept());
  await pf.locator('[data-set="Evening calls"]').click(); await pf.locator("#fo3st2-set", { hasText: "Evening calls" }).waitFor({ timeout: 5_000 });
  ok("FO-3st2 break M1 pass: discarding moves on and saves nothing (Normal hours' Wednesday still 17:00)", (await setsOf(fTok)).find((x) => x.name === "Normal hours")!.windows.some((w) => w.weekday === 3 && w.end === "17:00"));

  // ------------------------------------------------------------------------------------------------------ J-A4
  const pa = await open(aTok, "/account/availability", 1440, "Asia/Dubai");   // the browser's zone is not the set's (review m4)
  const picker = pa.getByLabel("Viewing");
  const offered = await picker.locator("option").allInnerTexts();
  ok("FO-3st2 J-A4: an Admin sees \"Viewing\"; active colleagues only (a deactivated one is not offered)", offered.includes(F.displayName) && !offered.includes(gone.displayName) && /\(you\)$/.test(offered[0]), offered);
  await picker.selectOption({ label: F.displayName });
  await pa.locator('[data-set="Evening calls"]').waitFor({ timeout: 15_000 });
  ok("FO-3st2 J-A4: picking Client F shows her sets (Evening calls the default) and her address in the URL", new URL(pa.url()).searchParams.get("staff") === F.id && (await pa.locator('[data-set="Evening calls"] [data-default]').count()) === 1);
  await pa.getByRole("button", { name: "Add time off" }).click();
  ok("FO-3st2 break M3: \"Add time off\" puts the keyboard on From", (await pa.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type)) === "date" && (await pa.getByLabel("From").evaluate((e) => e === document.activeElement)));
  await pa.getByLabel("From").fill(MON);
  await pa.getByRole("button", { name: "Save time off" }).click();
  await pa.locator("[data-time-off-row]").first().waitFor({ timeout: 10_000 });
  await pa.waitForFunction(() => document.activeElement?.textContent?.trim() === "Add time off", null, { timeout: 5_000 }).catch(() => null);
  ok("FO-3st2 break M3: after \"Save time off\" the keyboard is on \"Add time off\"", (await focused(pa)) === "Add time off", await focused(pa));
  const off = (await call(aTok, "GET", `/front-office/staff/${F.id}/time-off`)).body.timeOff as { startsAt: string; endsAt: string }[];
  const bk = await call(aTok, "GET", `/front-office/bookings/${bookingId}`);
  const bkWhen = bk.body?.startsAt ?? bk.body?.booking?.startsAt;
  const bkStatus = bk.body?.status ?? bk.body?.booking?.status;
  ok("FO-3st2 J-A4 pass: the Admin's whole-day time off for Client F on the Monday is saved (midnight to midnight, Toronto)", off.length === 1 && off[0].startsAt === at(MON, "00:00").toISOString() && off[0].endsAt === at(TUE, "00:00").toISOString(), off);
  ok("FO-3st2 J-A4 pass: her booking that day is unchanged (read through the staff booking route)", bk.status === 200 && new Date(bkWhen).toISOString() === at(MON, "10:00").toISOString() && bkStatus === "SCHEDULED", bk);
  ok("FO-3st2 J-A4: the row reads \"<Mon d Mon yyyy> (whole day)\" and the page says bookings are not moved", /^Mon \d{1,2} [A-Z][a-z]{2} \d{4} \(whole day\)$/.test(await pa.locator("[data-time-off-row] > span").first().innerText()) && (await pa.locator("[data-time-off-status]").innerText()).includes("Existing bookings are not moved."));
  await axe("FO-3st2 DW6 Admin viewing a colleague (1440)", pa); await shot(pa, "admin-viewing-colleague-1440");
  // To before From on the field (the server's answer).
  await pa.getByRole("button", { name: "Add time off" }).click();
  await pa.getByRole("checkbox", { name: "Whole day" }).uncheck();
  await pa.getByLabel("From").fill(`${MON}T12:00`); await pa.getByLabel("To").fill(`${MON}T11:00`);
  await pa.getByRole("button", { name: "Save time off" }).click();
  await pa.locator("[data-time-off-form]").getByText("End must be after start.").waitFor({ timeout: 10_000 });
  ok("FO-3st2 J-A4 fail: time off ending before it starts shows \"End must be after start.\" on To, nothing saved", ((await call(aTok, "GET", `/front-office/staff/${F.id}/time-off`)).body.timeOff as unknown[]).length === 1);
  await pa.getByRole("button", { name: "Cancel" }).click();
  await pa.waitForFunction(() => document.activeElement?.textContent?.trim() === "Add time off", null, { timeout: 5_000 }).catch(() => null);
  ok("FO-3st2 break M3: Cancel puts the keyboard back on \"Add time off\"", (await focused(pa)) === "Add time off", await focused(pa));
  // Break M2: a Remove the server refuses (the row was removed elsewhere) says so, and the list shows what is saved.
  const extra = await call(aTok, "POST", `/front-office/staff/${F.id}/time-off`, { startsAt: at(WED, "00:00").toISOString(), endsAt: at(plusDays(WED, 1), "00:00").toISOString() });
  await pa.reload(); await pa.locator("[data-time-off-row]").nth(1).waitFor({ timeout: 10_000 });
  await call(aTok, "DELETE", `/front-office/staff/${F.id}/time-off/${extra.body.id}`);
  await pa.locator("[data-time-off-row]").nth(1).getByRole("button", { name: /Remove/ }).click();
  await pa.getByText("Not removed").waitFor({ timeout: 10_000 }).catch(() => null);
  await pa.waitForFunction(() => document.querySelectorAll("[data-time-off-row]").length === 1, null, { timeout: 10_000 }).catch(() => null);
  ok("FO-3st2 break M2 fail: a Remove the server refuses shows its message (\"Not removed\"), and the list then shows only what is saved", (await pa.getByText("Not removed").count()) === 1 && (await pa.locator("[data-time-off-row]").count()) === 1, await pa.locator("[data-time-off]").innerText());
  // A Case Manager: no picker; a colleague's address shows their own page; the server refuses a colleague's time off.
  const pt = await open(tTok, `/account/availability?staff=${F.id}`);
  const tRefused = await call(tTok, "POST", `/front-office/staff/${F.id}/time-off`, { startsAt: at(MON, "00:00").toISOString(), endsAt: at(TUE, "00:00").toISOString() });
  ok("FO-3st2 J-A4 fail: a Case Manager sees no picker, and ?staff= of a colleague shows their own hours, not hers", (await pt.locator("[data-viewing]").count()) === 0 && (await pt.locator('[data-set="Evening calls"]').count()) === 0);
  ok("FO-3st2 J-A4 fail: the server refuses a Case Manager's time off for a colleague (403)", tRefused.status === 403, tRefused);

  // ------------------------------------------------------------------------------------------------------ DW6
  // Empty states: Client F removes the default set's hours → the no-hours text; after removing the time off → "No time off planned."
  await pf.reload(); await pf.locator("[data-week-editor]").waitFor();
  await chooseSet(pf, "Evening calls");
  for (const d of ["Tuesday", "Thursday"]) await pf.getByRole("button", { name: `Remove hours: ${d} 1` }).click();
  await pf.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Add hours: Thursday", null, { timeout: 5_000 }).catch(() => null);
  ok("FO-3st2 break M3: \"Remove hours\" puts the keyboard on that day's \"Add hours\"", (await focused(pf)) === "Add hours: Thursday", await focused(pf));
  await pf.getByRole("button", { name: "Save hours" }).click();
  await pf.getByText(NO_HOURS).waitFor({ timeout: 10_000 });
  ok("FO-3st2 DW6 pass: a default set with no hours shows \"You offer no times on the booking page. Staff can still book you, with a warning.\"", (await pf.getByText(NO_HOURS).count()) === 1 && (await day(pf, "Tuesday").innerText()).includes("Unavailable"));
  await pf.locator("[data-time-off-row]").getByRole("button", { name: /Remove/ }).click();
  await pf.locator("[data-empty-time-off]").waitFor({ timeout: 10_000 });
  await pf.waitForFunction(() => document.activeElement?.textContent?.trim() === "Add time off", null, { timeout: 5_000 }).catch(() => null);
  ok("FO-3st2 break M3: after a time off Remove the keyboard is on \"Add time off\"", (await focused(pf)) === "Add time off", await focused(pf));
  ok("FO-3st2 DW6 pass: with no time off the section says \"No time off planned.\"", (await pf.locator("[data-empty-time-off]").innerText()) === "No time off planned.");
  ok("FO-3st2 DW6 fail: with hours in the default set the no-hours text is absent (Normal hours made default again)", await (async () => { await chooseSet(pf, "Normal hours"); await pf.getByRole("button", { name: "Make default" }).click(); await pf.getByText(NO_HOURS).waitFor({ state: "detached", timeout: 10_000 }); return true; })());
  await axe("FO-3st2 DW6 empty states (1440)", pf); await shot(pf, "empty-states-1440");
  // Loading skeletons: the answers held back, the skeletons render with a status name.
  const pl = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ }).then(async (ctx) => {
    await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, fTok);
    const p = await ctx.newPage();
    await p.route("**/api/front-office/me/**", async (r) => { await new Promise((x) => setTimeout(x, 4_000)); await r.continue().catch(() => null); });
    await p.goto(`${BASE}/account/availability`); return p; });
  await pl.getByRole("status", { name: "Loading hours…" }).waitFor({ timeout: 15_000 });
  ok("FO-3st2 DW6 pass: loading shows skeletons (\"Loading hours…\")", (await pl.locator("[data-loading] [data-slot=skeleton]").count()) >= 3);
  await shot(pl, "loading-1440");
  await pl.locator("[data-week-editor]").waitFor({ timeout: 20_000 }); await pl.locator("[data-empty-time-off], [data-time-off-row]").first().waitFor({ timeout: 20_000 });
  ok("FO-3st2 DW6 fail: once the answer is in, no skeleton is left", (await pl.locator("[data-slot=skeleton]").count()) === 0);
  await pl.context().close();

  // Keyboard only: Tab reaches Add hours: Monday, Enter adds a window, then Save hours by Tab and Enter.
  const pk = await open(fTok);
  await chooseSet(pk, "Normal hours");
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) { await pk.keyboard.press("Tab"); reached = (await pk.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Add hours: Saturday"; }
  await pk.keyboard.press("Enter");
  const satRows = await day(pk, "Saturday").locator("[data-window]").count();
  let saveReached = false;
  for (let i = 0; i < 40 && !saveReached; i++) { await pk.keyboard.press("Tab"); saveReached = (await pk.evaluate(() => document.activeElement?.textContent?.trim())) === "Save hours"; }
  await pk.keyboard.press("Enter"); await pk.locator("[data-saved]", { hasText: "Saved." }).waitFor({ timeout: 10_000 });
  ok("FO-3st2 DW6 keyboard: Tab reaches \"Add hours: Saturday\", Enter adds a window, Tab and Enter save it", reached && satRows === 1 && saveReached && (await setsOf(fTok)).find((s) => s.name === "Normal hours")!.windows.some((w) => w.weekday === 6));
  await pk.waitForFunction(() => document.activeElement?.textContent?.trim() === "Save hours", null, { timeout: 5_000 }).catch(() => null);
  const focusRing = await pk.evaluate(() => ({ on: document.activeElement?.textContent?.trim(), ring: getComputedStyle(document.activeElement!).boxShadow }));
  ok("FO-3st2 DW6 keyboard: after the save the keyboard's place is kept (Save hours focused, with its focus ring)", focusRing.on === "Save hours" && focusRing.ring !== "none", focusRing);
  // Widths.
  for (const w of [375, 1024]) {
    const p = await open(aTok, `/account/availability?staff=${F.id}`, w);
    await axe(`FO-3st2 DW6 Availability (${w})`, p); await noSideways(`FO-3st2 DW6 Availability (${w})`, p); await shot(p, `availability-${w}`);
    await p.context().close();
  }
  await noSideways("FO-3st2 DW6 Availability (1440, after edits)", pk);
  ok("FO-3st2: no page error in any browser", errors.length === 0, errors);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
