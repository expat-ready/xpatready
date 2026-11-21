// FO-3st3 part 3a (concept screens/fo-3-booking r2 BR-19, §6 J-T1..J-T4; AG-4-8, AG-4-9 rules 1-7, AG-4-10; R1.42):
// Settings → Booking types in a real browser against FO-3a part 1a's real routes on the isolated copy (PF-4's local
// stand-in sign-in; no fake API). J-T1..J-T4, each a pass and a fail, plus create, duplicate, the stale save, delete,
// keyboard only, axe and 375/1024/1440. Seeds the Sample firms, then adds this run's own people (an Admin, a Case
// Officer host "Client F", a Billing and finance member) beside the Sample Case Manager. J-T3's 25 December is the next
// one, written as a closed day of the Sample firm (America/Toronto). J-T5 (Timings) is part 3b: no route on main. US$0.
//   zsh studio/tools/isolated.sh screens_fo3st3 4573 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo3st3_types_browser.ts 4573 xr_studio_screens_fo3st3
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { CLOSED_DAYS, readSetting, writeSetting } from "../api/src/platform/settings.ts";
import { wallToUtc } from "../api/src/front-office/booking/slots.ts";
import { recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4573), DBNAME = process.argv[3] ?? "xr_studio_screens_fo3st3";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-3-booking", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"], TZ = "America/Toronto", HOME = "/front-office/settings/booking-types";
const { ok, summary } = recorder();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const firm = await db.platformFirm.findUniqueOrThrow({ where: { key: "sample-firm" } });

// ----------------------------------------------------------------------------------------------------------- set-up
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
async function call(tok: string | null, method: string, path: string, body?: unknown): Promise<Res> {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ }
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
  const s = await db.platformStaff.create({ data: { firmId: firm.id, email: `fo3st3-${name.replace(/\W/g, "").toLowerCase()}-${run}@sample-firm.example.com`, displayName: `${name} ${run}`, status: "ACTIVE" } });
  await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: s.id, role: role as never, grantedBy: "test:fo3st3" } });
  return s;
};
const A = await person("Sample Admin", "ADMIN"), F = await person("Client F", "CASE_OFFICER"), BF = await person("Sample billing", "BILLING_FINANCE");
const T = await db.platformStaff.findFirstOrThrow({ where: { actorId: "user-T" } });   // the Sample firm's Case Manager
const [aTok, fTok, bTok, tTok] = [await signIn(A.email), await signIn(F.email), await signIn(BF.email), await signIn(T.email)];
await call(fTok, "GET", "/front-office/me/availability-sets");   // Client F's first read gives her "Normal hours" (FO-3a 1b-i)
const now = new Date(), dayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const plusDays = (day: string, n: number) => { const [y, m, d] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const today = dayOf(now), XMAS = `${today >= `${today.slice(0, 4)}-12-25` ? Number(today.slice(0, 4)) + 1 : today.slice(0, 4)}-12-25`;
let MON = plusDays(today, 7); while (new Date(`${MON}T00:00:00Z`).getUTCDay() !== 1) MON = plusDays(MON, 1);
const at = (day: string, hhmm: string) => { const [y, m, d] = day.split("-").map(Number); return wallToUtc(y, m, d, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ)!; };
const closed = (await readSetting<string[]>(db, firm.id, CLOSED_DAYS.key)) ?? [];
if (!closed.includes(XMAS)) await writeSetting(db, { firmId: firm.id, key: CLOSED_DAYS.key, value: [...closed, XMAS], by: "seed:FO-3st3-test", workspaceId: await platformAuditWorkspaceId(db), reason: "FO-3st3 J-T3: 25 December is closed (Sample)" });
const publicNames = async () => ((await call(null, "GET", "/public/firms/sample-firm/book")).body?.types ?? []).map((t: { name: string }) => t.name) as string[];

const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function open(tok: string, width = 1440, path = HOME, ready = "[data-booking-types]"): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce", timezoneId: TZ, locale: "en-GB" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}${path}`); await p.locator(ready).first().waitFor({ timeout: 30_000 });
  return p;
}
/** CSS transitions still running on the page (finite ones; a spinner's endless turn is not counted). */
const changing = (p: Page) => p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => `${(a.effect as KeyframeEffect | null)?.target?.textContent?.trim().slice(0, 30)}: ${(a as CSSTransition).transitionProperty ?? (a as CSSAnimation).animationName ?? "animation"}`));
/** Wait for those transitions to end (each lasts 150 ms; 2 s is the cap). */
const settle = (p: Page) => p.evaluate(() => Promise.race([new Promise((res) => setTimeout(res, 2_000)),
  Promise.all(document.getAnimations().filter((a) => a.playState === "running" && Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => a.finished.catch(() => undefined)))]));
const axe = async (name: string, p: Page) => {
  await settle(p); const still = await changing(p);   // main fix FO-3st3: axe met Save type halfway from its disabled grey to blue (bg rgb(137,179,224), text rgb(165,165,165))
  ok(`${name}: nothing is still changing (no running transition) when axe runs (settled state)`, still.length === 0, still);
  const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `fo3st3-${name}.png`), fullPage: true });
const row = (p: Page, name: string) => p.locator(`[data-type-row="${name}"]`);
const panel = (p: Page) => p.locator("[data-type-panel]");
const field = (p: Page, label: string) => panel(p).getByLabel(label, { exact: true });
const fieldNote = async (p: Page, label: string) => { const id = await field(p, label).getAttribute("aria-describedby"); return id ? (await p.locator(`[id="${id}"]`).innerText()) : ""; };
const openType = async (p: Page, name: string) => { await row(p, name).getByRole("button", { name, exact: true }).click(); await panel(p).waitFor({ timeout: 15_000 }); };
/** Save type, then wait for the server's answer to the save (and the screen to draw it). */
const saveAndWait = async (p: Page) => {
  const answer = p.waitForResponse((r) => /\/api\/front-office\/booking-types(\/[0-9a-f-]+)?$/.test(new URL(r.url()).pathname) && ["PATCH", "POST"].includes(r.request().method()), { timeout: 15_000 });
  await p.getByRole("button", { name: "Save type" }).click(); await answer; await p.waitForTimeout(400);
};
const typeRow = (name: string) => db.foConsultationType.findFirst({ where: { firmId: firm.id, name, deletedAt: null } });

const NAME = `Free consultation ${run}`;
try {
  // ------------------------------------------------------------------------------------------- create (Admin, 1440)
  const pa = await open(aTok);
  ok("FO-3st3 menu: the Bookings area lists Settings → Booking types for an Admin", (await pa.locator("[data-menu-booking-types]").count()) === 1);
  await pa.locator('[data-type-row], [data-booking-types] [role="alert"], [data-booking-types] :text("No booking types yet")').first().waitFor({ timeout: 15_000 });
  if ((await db.foConsultationType.count({ where: { firmId: firm.id, deletedAt: null } })) === 0) {   // a fresh copy: the empty state (review m4)
    ok("FO-3st3 empty state: \"No booking types yet. Add one so visitors can book.\" with one New booking type button", (await pa.getByText("No booking types yet. Add one so visitors can book.").count()) === 1 && (await pa.getByRole("button", { name: "New booking type" }).count()) === 1);
    await shot(pa, "empty-1440");
  }
  await shot(pa, "list-1440"); await axe("FO-3st3 list (Admin, 1440)", pa);
  await pa.getByRole("button", { name: "New booking type" }).click(); await panel(pa).waitFor();
  await field(pa, "Name").fill(NAME); await field(pa, "Length (minutes)").fill("4");
  await panel(pa).getByLabel(F.displayName).check();
  await saveAndWait(pa);
  ok("FO-3st3 create fail: length 4 shows \"Length must be 5 to 480 minutes.\" at the field; nothing is saved",
    (await fieldNote(pa, "Length (minutes)")) === "Length must be 5 to 480 minutes." && (await field(pa, "Length (minutes)").getAttribute("aria-invalid")) === "true" && !(await typeRow(NAME)), await fieldNote(pa, "Length (minutes)"));
  await field(pa, "Length (minutes)").fill("30");
  await shot(pa, "new-type-1440"); await axe("FO-3st3 new booking type panel", pa);
  await saveAndWait(pa);
  await row(pa, NAME).waitFor({ timeout: 15_000 });
  const made = await typeRow(NAME);
  ok("FO-3st3 create pass: the Admin adds a type on the screen: one row, 30 min, hosted by Client F, on the booking page, slug made from the name",
    !!made && made.minutes === 30 && made.hostStaffIds.includes(F.id) && (await row(pa, NAME).locator("[data-on-page]").innerText()) === "Yes" && made.slug === `free-consultation-${run}`, made);
  ok("FO-3st3 create pass: the new type is on the public list (/book/sample-firm)", (await publicNames()).includes(NAME));

  // ------------------------------------------------------------------------------------------- J-T1: name of 81
  await openType(pa, NAME);
  await field(pa, "Name").fill("N".repeat(81));
  await saveAndWait(pa);
  ok("FO-3st3 J-T1 fail: an 81-character name shows \"Name must be 1 to 80 characters.\" at the field (FO-3a's words); nothing is saved",
    (await fieldNote(pa, "Name")) === "Name must be 1 to 80 characters." && (await field(pa, "Name").getAttribute("aria-invalid")) === "true" && (await typeRow(NAME))?.version === made!.version, await fieldNote(pa, "Name"));
  await shot(pa, "name-81-1440");
  await field(pa, "Name").fill(NAME); await field(pa, "Web address").fill("manage");
  await saveAndWait(pa);
  ok("FO-3st3 J-T1 fail: the web address \"manage\" shows \"This web address is reserved.\" at the field", (await fieldNote(pa, "Web address")) === "This web address is reserved.", await fieldNote(pa, "Web address"));
  const eighty = `${NAME} ${"x".repeat(80 - NAME.length - 1)}`;
  await field(pa, "Web address").fill(made!.slug); await field(pa, "Name").fill(eighty); await field(pa, "Description (optional)").fill("Sample: a first talk about your options.");
  await saveAndWait(pa);
  await row(pa, eighty).waitFor({ timeout: 15_000 });
  ok("FO-3st3 J-T1 pass: an 80-character name saves (the version goes up by one)", (await typeRow(eighty))?.version === made!.version + 1);
  // the stale save (AG-4-9 rule 7): someone else saves between opening and saving
  await openType(pa, eighty);
  const other = await call(aTok, "PATCH", `/front-office/booking-types/${made!.id}`, { name: NAME, version: made!.version + 1 });
  await field(pa, "Length (minutes)").fill("45");
  await pa.getByRole("button", { name: "Save type" }).click();
  await panel(pa).getByText("Someone else changed this type. Reload to see their changes.").waitFor({ timeout: 15_000 });
  ok("FO-3st3 stale save fail: a save after someone else's shows \"Someone else changed this type. Reload to see their changes.\" with Reload; the length stays 30",
    other.status === 200 && (await panel(pa).getByRole("button", { name: "Reload" }).count()) === 1 && (await typeRow(NAME))?.minutes === 30, other.body);
  await shot(pa, "stale-save-1440");
  await panel(pa).getByRole("button", { name: "Reload" }).click();
  for (let i = 0; i < 50 && (await field(pa, "Name").inputValue()) !== NAME; i++) await pa.waitForTimeout(200);
  ok("FO-3st3 stale save pass: Reload shows the other person's name", (await field(pa, "Name").inputValue()) === NAME);
  await pa.keyboard.press("Escape"); await panel(pa).waitFor({ state: "detached" });
  await row(pa, NAME).waitFor({ timeout: 15_000 }); await row(pa, eighty).waitFor({ state: "detached", timeout: 15_000 });   // the list's reload lands first (review m2)
  ok("FO-3st3 stale save pass: after Reload the list behind shows the other person's name too", (await row(pa, NAME).count()) === 1 && (await row(pa, eighty).count()) === 0);

  // ------------------------------------------------------------------------------------------- Duplicate
  await row(pa, NAME).getByRole("button", { name: `Duplicate ${NAME}` }).click();
  await row(pa, `${NAME} (copy)`).waitFor({ timeout: 15_000 });
  const copy = await typeRow(`${NAME} (copy)`);
  ok("FO-3st3 duplicate pass: Duplicate adds \"<name> (copy)\" with its own web address and the same host and length", !!copy && copy.slug === `${made!.slug}-copy` && copy.minutes === 30 && copy.hostStaffIds.includes(F.id), copy);

  // ------------------------------------------------------------------------------------------- J-T2: Retire
  const slots = await call(null, "GET", `/public/firms/sample-firm/book/${made!.slug}/slots?from=${encodeURIComponent(at(MON, "00:00").toISOString())}&to=${encodeURIComponent(at(plusDays(MON, 1), "00:00").toISOString())}`);
  await new Promise((r) => setTimeout(r, 3_200));   // the real app's minimum fill time (AG-4-20 rule 3)
  const booked = await call(null, "POST", `/public/firms/sample-firm/book/${made!.slug}/bookings`, { givenNames: "Client B", familyName: "Sample", email: `client.b.${run}@example.org`, mode: "VIDEO", startsAt: at(MON, "10:00").toISOString(), timeZone: TZ, formStamp: slots.body?.formStamp });
  ok("FO-3st3 J-T2 setup: a public booking of the type on the Monday at 10:00", booked.status === 201, booked.body);
  const bookingBefore = await db.foBooking.findFirst({ where: { firmId: firm.id, typeId: made!.id } });
  await row(pa, NAME).getByRole("button", { name: `Retire ${NAME}` }).click();
  await pa.getByRole("dialog").getByText("It leaves the booking page and staff lists. Its bookings stay.").waitFor();
  await shot(pa, "retire-confirm-1440");
  await pa.getByRole("dialog").getByRole("button", { name: "Keep" }).click();
  ok("FO-3st3 J-T2 fail: Keep in the confirm retires nothing (still active and on the public list)", (await typeRow(NAME))?.active === true && (await publicNames()).includes(NAME));
  await row(pa, NAME).getByRole("button", { name: `Retire ${NAME}` }).click();
  await pa.getByRole("dialog").getByRole("button", { name: "Retire" }).click();
  await pa.locator("[data-said]", { hasText: "is retired" }).waitFor({ timeout: 15_000 });
  const bookingAfter = await db.foBooking.findFirst({ where: { id: bookingBefore?.id ?? "" } });
  const pub = await open(fTok, 1440, "/book/sample-firm", "main h1");
  await pub.waitForLoadState("networkidle");
  ok("FO-3st3 J-T2 pass: Retire takes the type off /book/sample-firm (the page and its list), marks the row Retired, and its booking stays unchanged",
    !(await publicNames()).includes(NAME) && !(await pub.locator("main").innerText()).split("\n").some((l) => l.includes(NAME) && !l.includes(`${NAME} (copy)`)) && (await row(pa, NAME).getByText("Retired").count()) === 1 && (await row(pa, NAME).locator("[data-on-page]").innerText()) === "No"
    && !!bookingAfter && bookingAfter.status === bookingBefore!.status && bookingAfter.startsAt.getTime() === bookingBefore!.startsAt.getTime(), { status: bookingAfter?.status });
  await pub.context().close();
  await shot(pa, "retired-1440");

  // ------------------------------------------------------------------------------------------- J-T3: Preview as a booker
  await openType(pa, `${NAME} (copy)`);
  const writesBefore = [await db.foBooking.count({ where: { firmId: firm.id } }), await db.auditEvent.count({ where: { firmId: firm.id } })];
  await panel(pa).getByRole("button", { name: "Preview as a booker" }).click();
  const dlg = pa.getByRole("dialog", { name: /Preview as a booker/ });
  await dlg.locator("[data-preview-day]").first().waitFor({ timeout: 20_000 });
  await dlg.getByLabel("Date").fill(MON);
  await dlg.locator(`[data-preview-day="${MON}"]`).waitFor({ timeout: 20_000 });
  const monText = await dlg.locator(`[data-preview-day="${MON}"]`).innerText();
  ok("FO-3st3 J-T3 pass: Preview on a working Monday shows Client F's times (09:00 and 16:30 offered)", /09:00/.test(monText) && /16:30/.test(monText), monText);
  await shot(pa, "preview-1440"); await axe("FO-3st3 preview dialog", pa);
  await dlg.getByLabel("Date").fill(XMAS);
  await dlg.locator(`[data-preview-day="${XMAS}"]`).waitFor({ timeout: 20_000 });
  const xmasText = await dlg.locator(`[data-preview-day="${XMAS}"]`).innerText();
  const writesAfter = [await db.foBooking.count({ where: { firmId: firm.id } }), await db.auditEvent.count({ where: { firmId: firm.id } })];
  ok(`FO-3st3 J-T3 fail: Preview on ${XMAS} shows no times and "Closed day"; nothing is written (bookings and audit lines unchanged)`,
    xmasText.includes("Closed day") && !/\d\d:\d\d/.test(xmasText) && JSON.stringify(writesBefore) === JSON.stringify(writesAfter), { xmasText, writesBefore, writesAfter });
  await dlg.getByLabel("Time zone").selectOption("Asia/Dubai"); await dlg.getByLabel("Date").fill(MON);
  await dlg.locator(`[data-preview-day="${MON}"]`).waitFor({ timeout: 20_000 });
  ok("FO-3st3 J-T3 pass: in Asia/Dubai the same Monday starts at 18:00 (09:00 Toronto)", (await dlg.locator(`[data-preview-day="${MON}"]`).innerText()).includes("18:00"));
  await shot(pa, "preview-closed-day-1440");
  await dlg.getByLabel("Date").fill("9999-12-31"); await pa.waitForTimeout(500);
  ok("FO-3st3 break M4 fail: the date 9999-12-31 is not taken (the preview stays, no page error)", (await dlg.count()) === 1 && (await dlg.getByLabel("Date").inputValue()) !== "" && errors.length === 0, errors.slice(0, 2));
  await pa.keyboard.press("Escape"); await dlg.waitFor({ state: "detached" });
  const focusedText = () => pa.evaluate(() => document.activeElement?.textContent?.trim());   // focus moves after the dialog's own close handling
  for (let i = 0; i < 20 && (await focusedText()) !== "Preview as a booker"; i++) await pa.waitForTimeout(50);
  ok("FO-3st3 break m5: closing the preview puts the keyboard back on \"Preview as a booker\"", (await focusedText()) === "Preview as a booker");
  await pa.keyboard.press("Escape"); await panel(pa).waitFor({ state: "detached" });

  // ------------------------------------------------------------------------------------------- break M1, M2: a set save that fails after the type saved
  const evening = await call(fTok, "POST", "/front-office/me/availability-sets", { name: `Evening calls ${run}` });
  const SETNAME = `Set check ${run}`;
  await pa.getByRole("button", { name: "New booking type" }).click(); await panel(pa).waitFor();
  await field(pa, "Name").fill(SETNAME); await panel(pa).getByLabel(F.displayName).check();
  await panel(pa).getByLabel(`Uses set for ${F.displayName}`).selectOption({ label: `Evening calls ${run}` });
  await call(fTok, "DELETE", `/front-office/me/availability-sets/${evening.body?.id}`);   // someone deletes the chosen set before Save
  const isList = (u: URL) => /\/api\/front-office\/booking-types$/.test(u.pathname);   // main fix FO-3st3: the list's reload after Save is held 1 s, so a check that reads the list before it lands fails every time, not now and then
  await pa.route(isList, async (r) => { if (r.request().method() === "GET") await new Promise((res) => setTimeout(res, 1_000)); await r.fallback().catch(() => undefined); });
  await pa.getByRole("button", { name: "Save type" }).click();
  await panel(pa).waitFor({ state: "detached", timeout: 15_000 });
  await row(pa, SETNAME).waitFor({ timeout: 15_000 });   // the list's reload lands, then the screen is read
  const warned = await pa.locator("[data-booking-types]").innerText();
  ok("FO-3st3 break M1 fail: a set of hours that fails after the type saved is said in words (the type is saved; the set was not) and the list shows the type",
    warned.includes(`Added ${SETNAME}.`) && warned.includes(`The set of hours for ${F.displayName} was not saved`) && (await row(pa, SETNAME).count()) === 1, warned.slice(0, 400));
  await pa.unroute(isList);
  ok("FO-3st3 break M2 pass: the type exists once (no second create on a retry)", (await db.foConsultationType.count({ where: { firmId: firm.id, name: SETNAME, deletedAt: null } })) === 1);

  // ------------------------------------------------------------------------------------------- break M3: a suspended host stays visible and removable
  const G = await person("Client G", "CASE_OFFICER");
  const SUS = `Suspended host check ${run}`;
  const susType = await call(aTok, "POST", "/front-office/booking-types", { name: SUS, minutes: 30, modes: ["VIDEO"], hostStaffIds: [F.id, G.id] });
  await db.platformStaff.update({ where: { id: G.id }, data: { status: "SUSPENDED" } });
  await pa.reload(); await row(pa, SUS).waitFor({ timeout: 15_000 });
  await openType(pa, SUS);
  const gBox = panel(pa).getByLabel(`${G.displayName} (suspended: offers no times)`);
  ok("FO-3st3 break M3 pass: a suspended host on the type is shown, ticked and named as suspended", susType.status === 201 && (await gBox.count()) === 1 && (await gBox.isChecked()), susType.body);
  await gBox.uncheck(); await saveAndWait(pa);
  ok("FO-3st3 break M3 fail: unticking the suspended host and saving removes them from the type", JSON.stringify((await typeRow(SUS))?.hostStaffIds) === JSON.stringify([F.id]), (await typeRow(SUS))?.hostStaffIds);

  // ------------------------------------------------------------------------------------------- Uses set (AG-4-62 rule 1b) and the allow flags (review M1)
  const morning = await call(fTok, "POST", "/front-office/me/availability-sets", { name: `Morning calls ${run}` });
  ok("FO-3st3 Uses set setup: Client F adds a second set \"Morning calls\"", morning.status === 201, morning.body);
  await openType(pa, SUS);
  await panel(pa).getByLabel(`Uses set for ${F.displayName}`).selectOption({ label: `Morning calls ${run}` });
  await saveAndWait(pa); await panel(pa).waitFor({ state: "detached", timeout: 15_000 });   // the host-set PUT goes after the PATCH; the panel closes once it is answered (review m3)
  const chosen = await db.foTypeHostSet.findFirst({ where: { firmId: firm.id, typeId: susType.body.id, staffId: F.id } });
  ok("FO-3st3 Uses set pass: choosing Client F's \"Morning calls\" for the type saves that set for her on this type", morning.status === 201 && chosen?.setId === morning.body.id, { morning: morning.status, chosen });
  await openType(pa, SUS);
  await panel(pa).getByLabel(`Uses set for ${F.displayName}`).waitFor();
  for (let i = 0; i < 40 && (await panel(pa).getByLabel(`Uses set for ${F.displayName}`).inputValue()) !== morning.body.id; i++) await pa.waitForTimeout(250);
  await panel(pa).getByLabel(`Uses set for ${F.displayName}`).selectOption({ value: "" });   // back to her default set (Morning calls has no hours)
  await saveAndWait(pa); await panel(pa).waitFor({ state: "detached", timeout: 15_000 });
  ok("FO-3st3 Uses set pass: \"(default)\" puts the type back on her default set", !(await db.foTypeHostSet.findFirst({ where: { firmId: firm.id, typeId: susType.body.id, staffId: F.id } }))?.setId);
  const susSlug = (await typeRow(SUS))!.slug, mail = `client.c.${run}@example.org`;
  const s2 = await call(null, "GET", `/public/firms/sample-firm/book/${susSlug}/slots?from=${encodeURIComponent(at(MON, "00:00").toISOString())}&to=${encodeURIComponent(at(plusDays(MON, 1), "00:00").toISOString())}`);
  await new Promise((res) => setTimeout(res, 3_200));
  const b2 = await call(null, "POST", `/public/firms/sample-firm/book/${susSlug}/bookings`, { givenNames: "Client C", familyName: "Sample", email: mail, mode: "VIDEO", startsAt: at(MON, "11:00").toISOString(), timeZone: TZ, formStamp: s2.body?.formStamp });
  let link = "";
  for (let i = 0; i < 45 && !link; i++) {
    const inbox = await call(null, "GET", `/demo/platform-inbox?address=${encodeURIComponent(mail)}`);
    link = /To reschedule or cancel: (\S+)/.exec(((inbox.body?.messages ?? []) as { body: string }[]).map((m) => m.body).join("\n"))?.[1] ?? "";
    if (!link) await new Promise((res) => setTimeout(res, 2_000));
  }
  const manage = async () => { const p = await open(fTok, 1440, new URL(link).pathname + new URL(link).hash, "[data-public-state]"); await p.waitForLoadState("networkidle"); return p; };
  let pm = await manage();
  ok("FO-3st3 allow flags pass: with Allow reschedule ticked, the booker's manage page offers Reschedule and Cancel", b2.status === 201 && !!link && (await pm.getByRole("button", { name: "Reschedule" }).count()) === 1 && (await pm.getByRole("button", { name: /^Cancel/ }).count()) >= 1, { b2: b2.status, link: !!link });
  await pm.context().close();
  await openType(pa, SUS);
  await panel(pa).getByLabel("Allow reschedule", { exact: true }).uncheck();
  await saveAndWait(pa);
  pm = await manage();
  ok("FO-3st3 allow flags fail: Allow reschedule unticked on the screen → the manage page offers no Reschedule (Cancel stays)", (await typeRow(SUS))?.allowReschedule === false && (await pm.getByRole("button", { name: "Reschedule" }).count()) === 0 && (await pm.getByRole("button", { name: /^Cancel/ }).count()) >= 1, (await pm.locator("main").innerText()).slice(0, 300));
  await shot(pa, "allow-flags-1440"); await pm.context().close();

  // ------------------------------------------------------------------------------------------- J-T4: read-only and no entry
  const pt = await open(tTok);
  await row(pt, `${NAME} (copy)`).waitFor({ timeout: 15_000 });
  const ttext = await pt.locator("[data-booking-types]").innerText();
  ok("FO-3st3 J-T4 pass: a Case Manager sees the list (the copy, its length and the read-only line)", ttext.includes(`${NAME} (copy)`) && ttext.includes("You can view booking types but not change them."));
  ok("FO-3st3 J-T4 fail: no New booking type, Duplicate, Retire or Delete for a Case Manager", (await pt.getByRole("button", { name: /^(New booking type|Duplicate|Retire|Delete)/ }).count()) === 0);
  await openType(pt, `${NAME} (copy)`);
  ok("FO-3st3 J-T4 fail: the Case Manager's panel shows values as text (no Name field, no Save type)", (await panel(pt).locator("[data-values]").count()) === 1 && (await pt.getByRole("button", { name: "Save type" }).count()) === 0 && (await panel(pt).locator("input:not([type=checkbox])").count()) === 0);
  const cmPatch = await call(tTok, "PATCH", `/front-office/booking-types/${copy!.id}`, { name: "Changed by CM", version: copy!.version });
  ok("FO-3st3 J-T4 fail: the server refuses a Case Manager's edit (403)", cmPatch.status === 403, cmPatch.status);
  await shot(pt, "read-only-1440"); await axe("FO-3st3 read-only panel (Case Manager)", pt);
  await pt.context().close();
  const pb = await open(bTok, 1440, HOME, "h1");
  ok("FO-3st3 J-T4 fail: Billing and finance has no Booking types menu entry and gets the refusal, no list", (await pb.locator("[data-menu-booking-types]").count()) === 0 && (await pb.locator("main").innerText()).includes("You do not have permission to do this. Ask an Owner or Admin.") && (await pb.locator("[data-type-row]").count()) === 0);
  await pb.context().close();

  // ------------------------------------------------------------------------------------------- Delete
  await row(pa, `${NAME} (copy)`).getByRole("button", { name: `Delete ${NAME} (copy)` }).click();
  await pa.getByRole("dialog").getByText("It is hidden everywhere; its bookings stay and can still be changed.").waitFor();
  await pa.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await row(pa, `${NAME} (copy)`).waitFor({ state: "detached", timeout: 15_000 });
  ok("FO-3st3 delete pass: Delete removes the row; the type is soft-deleted (deletedAt set)", !!(await db.foConsultationType.findFirst({ where: { id: copy!.id } }))?.deletedAt);

  // ------------------------------------------------------------------------------------------- keyboard only, sizes
  const pk = await open(aTok);
  for (let i = 0; i < 60 && (await pk.evaluate(() => document.activeElement?.textContent?.trim())) !== "New booking type"; i++) await pk.keyboard.press("Tab");
  await pk.keyboard.press("Enter"); await panel(pk).waitFor();
  const kName = `Keyboard type ${run}`;
  ok("FO-3st3 keyboard: Enter on New booking type opens the panel on its Name field", (await pk.evaluate(() => (document.activeElement as HTMLInputElement | null)?.closest("div")?.querySelector("label")?.textContent)) === "Name");
  await pk.keyboard.type(kName); await pk.keyboard.press("Enter");
  await row(pk, kName).waitFor({ timeout: 15_000 });
  ok("FO-3st3 keyboard pass: typing a name and Enter saves a type with no mouse", !!(await typeRow(kName)));
  await pk.context().close();
  for (const w of [375, 1024]) {
    const p = await open(aTok, w);
    await noSideways(`FO-3st3 list (${w})`, p); await axe(`FO-3st3 list (${w})`, p); await shot(p, `list-${w}`);
    await openType(p, NAME); await settle(p); await shot(p, `panel-${w}`); await axe(`FO-3st3 panel (${w})`, p);
    await p.context().close();
  }
  await noSideways("FO-3st3 list (1440)", pa);
  ok("FO-3st3: no page error in any browser", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
