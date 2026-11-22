// FO-3st3b (concept screens/fo-3-booking r2 BR-20, §6 J-T5; board design/settings.html §4-5; AG-4-4, AG-4-5, AG-4-66
// rules 1-3, 8, §8; C5; R1.42): Settings → Timings and a booking type's own timings under Advanced, in a real browser
// against FO-3a1e's real routes on the isolated copy (PF-4's local stand-in sign-in; no fake API). J-T5, the firm form's
// refusals, who sees what (§8, C5), the stale save, keyboard only, axe and 375/1024/1440; each a pass and a fail. Seeds
// the Sample firms, then adds this run's own people (an Admin, a Case Officer host, a Billing and finance member) beside
// the Sample Case Manager, and one booking type through the API. Sample values only; US$0.
//   zsh studio/tools/isolated.sh screens_fo3st3b 4574 start PLATFORM_IDENTITY=local && tsx studio/tests/check_fo3st3_timings_browser.ts 4574 xr_studio_screens_fo3st3b
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4574), DBNAME = process.argv[3] ?? "xr_studio_screens_fo3st3b";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-3-booking", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"], TZ = "America/Toronto";
const TIMINGS = "/front-office/settings/timings", TYPES = "/front-office/settings/booking-types";
const REFUSED = "You do not have permission to do this. Ask an Owner or Admin.";
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
  const s = await db.platformStaff.create({ data: { firmId: firm.id, email: `fo3st3b-${name.replace(/\W/g, "").toLowerCase()}-${run}@sample-firm.example.com`, displayName: `${name} ${run}`, status: "ACTIVE" } });
  await db.platformRoleGrant.create({ data: { firmId: firm.id, staffId: s.id, role: role as never, grantedBy: "test:fo3st3b" } });
  return s;
};
const A = await person("Sample Admin", "ADMIN"), F = await person("Client F", "CASE_OFFICER"), BF = await person("Sample billing", "BILLING_FINANCE");
const T = await db.platformStaff.findFirstOrThrow({ where: { actorId: "user-T" } });   // the Sample firm's Case Manager
const [aTok, bTok, tTok] = [await signIn(A.email), await signIn(BF.email), await signIn(T.email)];
let NAME = `Timings check ${run}`;   // renamed by the M1 check
const made = await call(aTok, "POST", "/front-office/booking-types", { name: NAME, minutes: 30, modes: ["VIDEO"], hostStaffIds: [F.id] });
if (made.status !== 201 && made.status !== 200) throw new Error(`STOP  could not add the booking type: ${JSON.stringify(made.body)}`);
const typeId = made.body.id as string;
const typeApi = async () => (await call(aTok, "GET", `/front-office/booking-types/${typeId}`)).body;
const firmApi = async () => (await call(aTok, "GET", "/front-office/booking-timings")).body;

const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function open(tok: string, width = 1440, path = TIMINGS, ready = "[data-timings]"): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce", timezoneId: TZ, locale: "en-GB" });
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}${path}`); await p.locator(ready).first().waitFor({ timeout: 30_000 });
  return p;
}
/** CSS transitions still running (finite ones), and a wait for them to end (2 s cap): axe reads the settled screen, not a
 *  button halfway through its 150 ms colour fade (the cause of the FO-3st3 suite's red batches, main fix #2782). */
const changing = (p: Page) => p.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => `${(a.effect as KeyframeEffect | null)?.target?.textContent?.trim().slice(0, 30)}: ${(a as CSSTransition).transitionProperty ?? "animation"}`));
const settle = (p: Page) => p.evaluate(() => Promise.race([new Promise((res) => setTimeout(res, 2_000)),
  Promise.all(document.getAnimations().filter((a) => a.playState === "running" && Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => a.finished.catch(() => undefined)))]));
const axe = async (name: string, p: Page) => {
  await settle(p); const still = await changing(p);
  ok(`${name}: nothing is still animating when axe runs (settled state)`, still.length === 0, still);
  const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = async (p: Page, name: string) => { await settle(p); return p.screenshot({ path: join(SHOTS, `fo3st3b-${name}.png`), fullPage: true }); };
const form = (p: Page) => p.locator("[data-timings-form]");
const fld = (p: Page, label: string) => form(p).getByLabel(label, { exact: true });
const note = async (p: Page, label: string) => { const id = await fld(p, label).getAttribute("aria-describedby"); return id ? (await p.locator(`[id="${id}"]`).innerText()) : ""; };
const putCount = (p: Page) => { const n = { v: 0 }; p.on("request", (r) => { if (r.method() === "PUT" && r.url().endsWith("/api/front-office/booking-timings")) n.v++; }); return n; };
const saveFirm = async (p: Page) => {
  const answer = p.waitForResponse((r) => r.url().endsWith("/api/front-office/booking-timings") && r.request().method() === "PUT", { timeout: 15_000 });
  await p.getByRole("button", { name: "Save timings" }).click(); await answer; await p.waitForTimeout(300);
};
const panel = (p: Page) => p.locator("[data-type-panel]");
const openType = async (p: Page) => {
  await p.locator(`[data-type-row="${NAME}"]`).getByRole("button", { name: NAME, exact: true }).click();
  await panel(p).waitFor({ timeout: 15_000 }); await panel(p).locator("[data-type-timing-value]").first().waitFor({ timeout: 15_000 });
};
const timingRow = (p: Page, f: string) => panel(p).locator(`[data-type-timing="${f}"]`);
const timingValue = async (p: Page, f: string) => (await timingRow(p, f).locator("[data-type-timing-value]").innerText()).trim();
const saveTiming = async (p: Page, f: string, click: () => Promise<void>) => {
  const answer = p.waitForResponse((r) => r.url().endsWith(`/booking-types/${typeId}/timings`) && r.request().method() === "PATCH", { timeout: 15_000 });
  await click(); const r = await answer; await p.waitForTimeout(300); return r.status();
};

try {
  // ------------------------------------------------------------------------------------------- the firm's Timings (Admin)
  const pa = await open(aTok, 1440, TYPES, "[data-booking-types]");
  ok("FO-3st3b menu: the Bookings area lists Settings → Timings for an Admin", (await pa.locator("[data-menu-timings]").count()) === 1);
  await pa.locator("[data-menu-timings]").click(); await pa.locator("[data-timings-form]").waitFor({ timeout: 15_000 });
  ok("FO-3st3b reminders: read-only \"24 hours and 1 hour before (fixed for now)\", with no field", (await form(pa).locator("[data-reminders]").innerText()) === "24 hours and 1 hour before (fixed for now)"
    && (await form(pa).getByLabel(/Reminders/).count()) === 0);
  ok("FO-3st3b defaults: the six firm defaults (AG-4-4 rule 1) fill the form in their units", (await fld(pa, "Shortest notice (hours)").inputValue()) === "4" && (await fld(pa, "Booking window (days)").inputValue()) === "60"
    && (await fld(pa, "Gap before (minutes)").inputValue()) === "0" && (await fld(pa, "Gap after (minutes)").inputValue()) === "10" && (await fld(pa, "Self-service limit (hours)").inputValue()) === "4");
  await shot(pa, "timings-1440"); await axe("FO-3st3b Timings (Admin, 1440)", pa);

  // the form's refusals: nothing is sent for a non-number; the server's words for a value out of range, and nothing saved
  const puts = putCount(pa);
  await fld(pa, "Self-service limit (hours)").fill("six"); await pa.getByRole("button", { name: "Save timings" }).click(); await pa.waitForTimeout(300);
  ok("FO-3st3b firm fail (not a number): \"six\" is refused at the field, focus goes there, and nothing is sent",
    (await note(pa, "Self-service limit (hours)")).startsWith("Enter a number of hours") && (await fld(pa, "Self-service limit (hours)").getAttribute("aria-invalid")) === "true" && puts.v === 0
    && (await pa.evaluate(() => document.activeElement?.getAttribute("data-timing-field"))) === "selfServiceLimitMinutes", await note(pa, "Self-service limit (hours)"));
  await fld(pa, "Shortest notice (hours)").fill("0.000000001"); await pa.getByRole("button", { name: "Save timings" }).click(); await pa.waitForTimeout(300);
  ok("FO-3st3b firm fail (break m1): 0.000000001 hours is refused at the field, never rounded to 0; nothing is sent",
    (await note(pa, "Shortest notice (hours)")).startsWith("Enter a number of hours") && puts.v === 0 && (await firmApi()).timings.minNoticeMinutes === 240);
  await fld(pa, "Shortest notice (hours)").fill("4");
  await fld(pa, "Self-service limit (hours)").fill("4");
  await fld(pa, "Gap after (minutes)").fill("2000"); await fld(pa, "Shortest notice (hours)").fill("2");
  await saveFirm(pa);
  const afterRefusal = await firmApi();
  ok("FO-3st3b firm fail (range, AG-4-66 §10): a gap after of 2,000 shows the server's words at the field; the notice changed beside it is not saved either",
    (await note(pa, "Gap after (minutes)")) === "Gap after must be a whole number of minutes from 0 to 1,440." && afterRefusal.timings.gapAfterMinutes === 10 && afterRefusal.timings.minNoticeMinutes === 240, { note: await note(pa, "Gap after (minutes)"), t: afterRefusal.timings });
  await shot(pa, "timings-refused-1440");
  await fld(pa, "Gap after (minutes)").fill("10"); await fld(pa, "Shortest notice (hours)").fill("4");
  await fld(pa, "Shortest notice (hours)").fill("10000"); await saveFirm(pa);
  ok("FO-3st3b firm fail (range, review m1): a field typed in hours says the server's range in hours", (await note(pa, "Shortest notice (hours)")) === "Shortest notice must be from 0 to 8,760 hours." && (await firmApi()).timings.minNoticeMinutes === 240, await note(pa, "Shortest notice (hours)"));
  await fld(pa, "Shortest notice (hours)").fill("4");

  // J-T5 step 1: the firm's self-service limit 6 hours
  await fld(pa, "Self-service limit (hours)").fill("6"); await saveFirm(pa);
  const six = await firmApi();
  ok("FO-3st3b J-T5 pass (step 1): the firm's self-service limit saved as 6 hours (360 minutes), with \"Timings saved.\"", six.timings.selfServiceLimitMinutes === 360 && (await pa.locator("[data-said]").innerText()).startsWith("Timings saved."), six.timings);
  ok("FO-3st3b overridden line: no type overrides the firm yet", (await pa.locator("[data-overridden]").innerText()) === "No booking type overrides these.");

  // ------------------------------------------------------------------------------------------- J-T5: the type's Advanced
  await pa.goto(`${BASE}${TYPES}`); await pa.locator(`[data-type-row="${NAME}"]`).waitFor({ timeout: 15_000 });
  await openType(pa);
  ok("FO-3st3b J-T5 pass (step 2): a type without its own value shows \"Uses firm default (6 hours)\" for the self-service limit", (await timingValue(pa, "selfServiceLimitMinutes")) === "Uses firm default (6 hours)", await timingValue(pa, "selfServiceLimitMinutes"));
  ok("FO-3st3b J-T5 fail (step 2): it does not still show the old default (4 hours)", !(await timingValue(pa, "selfServiceLimitMinutes")).includes("4 hours"));
  // the panel's typed Definition survives a timing save, and Save type is not refused as stale afterwards
  await panel(pa).getByLabel("Description (optional)", { exact: true }).fill(`Typed before a timing change ${run}`);
  await timingRow(pa, "selfServiceLimitMinutes").getByRole("button", { name: "Change for this type" }).click();
  const ssInput = panel(pa).getByLabel("Self-service limit (hours) for this type", { exact: true });
  ok("FO-3st3b change: \"Change for this type\" opens a field with the value in use (6), focused", (await ssInput.inputValue()) === "6" && (await ssInput.evaluate((e) => e === document.activeElement)));
  await ssInput.fill("-1");
  await saveTiming(pa, "selfServiceLimitMinutes", () => timingRow(pa, "selfServiceLimitMinutes").getByRole("button", { name: "Save", exact: true }).click()).catch(() => 0);
  ok("FO-3st3b type fail (not a number): -1 is refused at the field and nothing is sent; the type keeps the firm's value",
    (await timingRow(pa, "selfServiceLimitMinutes").locator('[role="alert"]').innerText()).startsWith("Enter a number of hours") && (await typeApi()).timings.selfServiceLimitMinutes === null);
  await ssInput.fill("2");
  const st = await saveTiming(pa, "selfServiceLimitMinutes", () => timingRow(pa, "selfServiceLimitMinutes").getByRole("button", { name: "Save", exact: true }).click());
  const two = await typeApi();
  ok("FO-3st3b J-T5 pass (step 3): \"Change for this type\" 2 hours → that type uses 2 hours (its own value 120; resolved 120)",
    st === 200 && (await timingValue(pa, "selfServiceLimitMinutes")) === "2 hours (this type)" && two.timings.selfServiceLimitMinutes === 120 && two.effectiveTimings.selfServiceLimitMinutes === 120, { st, t: two.timings, e: two.effectiveTimings });
  ok("FO-3st3b J-T5 (step 3): the firm's value stays 6 hours", (await firmApi()).timings.selfServiceLimitMinutes === 360);
  ok("FO-3st3b panel: the description typed before the timing save is still there", (await panel(pa).getByLabel("Description (optional)", { exact: true }).inputValue()) === `Typed before a timing change ${run}`);
  await shot(pa, "type-override-1440"); await axe("FO-3st3b type panel with an override", pa);
  const typeSave = pa.waitForResponse((r) => r.url().endsWith(`/booking-types/${typeId}`) && r.request().method() === "PATCH", { timeout: 15_000 });
  await pa.getByRole("button", { name: "Save type" }).click();
  ok("FO-3st3b panel: Save type after a timing save is accepted (the version is current), and keeps the type's own timing",
    (await (await typeSave).status()) === 200 && (await typeApi()).description === `Typed before a timing change ${run}` && (await typeApi()).timings.selfServiceLimitMinutes === 120);
  await panel(pa).waitFor({ state: "detached", timeout: 15_000 }).catch(() => undefined);
  if (await panel(pa).count()) { await pa.keyboard.press("Escape"); await panel(pa).waitFor({ state: "detached" }); }

  // the Timings page names the overriding type
  await pa.goto(`${BASE}${TIMINGS}`); await pa.locator("[data-timings-form]").waitFor();
  await pa.locator("[data-overridden]").filter({ hasText: /\S/ }).waitFor();
  ok("FO-3st3b overridden line: \"Overridden on 1 type: <name>.\"", (await pa.locator("[data-overridden]").innerText()) === `Overridden on 1 type: ${NAME}.`, await pa.locator("[data-overridden]").innerText());

  // J-T5 step 4: Reset to firm default
  await pa.goto(`${BASE}${TYPES}`); await pa.locator(`[data-type-row="${NAME}"]`).waitFor({ timeout: 15_000 }); await openType(pa);
  ok("FO-3st3b J-T5 (reopen): the type shows its own 2 hours with \"Reset to firm default\"", (await timingValue(pa, "selfServiceLimitMinutes")) === "2 hours (this type)" && (await timingRow(pa, "selfServiceLimitMinutes").getByRole("button", { name: "Reset to firm default" }).count()) === 1);
  await saveTiming(pa, "selfServiceLimitMinutes", () => timingRow(pa, "selfServiceLimitMinutes").getByRole("button", { name: "Reset to firm default" }).click());
  const back = await typeApi();
  ok("FO-3st3b J-T5 pass (step 4): \"Reset to firm default\" → 6 hours again (its own value null; resolved 360)",
    (await timingValue(pa, "selfServiceLimitMinutes")) === "Uses firm default (6 hours)" && back.timings.selfServiceLimitMinutes === null && back.effectiveTimings.selfServiceLimitMinutes === 360, { t: back.timings, e: back.effectiveTimings });

  // the server's range on a type's value (window 1-730 days): its words at the field, nothing saved
  await timingRow(pa, "windowDays").getByRole("button", { name: "Change for this type" }).click();
  await panel(pa).getByLabel("Booking window (days) for this type", { exact: true }).fill("1000");
  const wst = await saveTiming(pa, "windowDays", () => timingRow(pa, "windowDays").getByRole("button", { name: "Save", exact: true }).click());
  ok("FO-3st3b type fail (range): a window of 1,000 days is refused (422) with the server's words at the field; nothing saved",
    wst === 422 && (await timingRow(pa, "windowDays").locator('[role="alert"]').innerText()) === "Booking window must be a whole number of days from 1 to 730." && (await typeApi()).timings.windowDays === null);
  await panel(pa).getByLabel("Booking window (days) for this type", { exact: true }).press("Escape");
  ok("FO-3st3b type: Escape leaves the row's field without closing the panel", (await panel(pa).count()) === 1 && (await timingRow(pa, "windowDays").getByRole("button", { name: "Change for this type" }).count()) === 1);

  // stale: another tab saves this type's timings; this panel's save is refused in words, with Reload
  const ver = (await typeApi()).version;
  ok("FO-3st3b stale (set-up): another tab sets the gap before to 5 minutes", (await call(aTok, "PATCH", `/front-office/booking-types/${typeId}/timings`, { gapBeforeMinutes: 5, version: ver })).status === 200);
  await timingRow(pa, "minNoticeMinutes").getByRole("button", { name: "Change for this type" }).click();
  await panel(pa).getByLabel("Shortest notice (hours) for this type", { exact: true }).fill("1");
  const sst = await saveTiming(pa, "minNoticeMinutes", () => timingRow(pa, "minNoticeMinutes").getByRole("button", { name: "Save", exact: true }).click());
  ok("FO-3st3b stale fail: the save is refused (409) with \"Someone else changed this type. Reload to see their changes.\" and a Reload button; nothing saved",
    sst === 409 && (await panel(pa).locator("[data-type-timings]").getByText("Someone else changed this type. Reload to see their changes.").count()) === 1 && (await typeApi()).timings.minNoticeMinutes === null);
  await shot(pa, "type-stale-1440");
  await panel(pa).locator("[data-type-timings]").getByRole("button", { name: "Reload" }).click();
  await timingRow(pa, "gapBeforeMinutes").locator("[data-type-timing-value]", { hasText: "5 minutes (this type)" }).waitFor({ timeout: 15_000 });
  await timingRow(pa, "minNoticeMinutes").getByRole("button", { name: "Change for this type" }).click();
  await panel(pa).getByLabel("Shortest notice (hours) for this type", { exact: true }).fill("1");
  const rst = await saveTiming(pa, "minNoticeMinutes", () => panel(pa).getByLabel("Shortest notice (hours) for this type", { exact: true }).press("Enter"));
  ok("FO-3st3b stale pass: after Reload, the other tab's 5 minutes shows and Enter saves the notice (1 hour)", rst === 200 && (await typeApi()).timings.minNoticeMinutes === 60 && (await timingValue(pa, "minNoticeMinutes")) === "1 hour (this type)");
  await pa.keyboard.press("Escape"); await panel(pa).waitFor({ state: "detached" }).catch(() => undefined);

  // review M1 (no lost update): another tab renames the type; this panel's timing save is refused, Reload brings the
  // rename into the panel too, and Save type afterwards keeps it
  await pa.goto(`${BASE}${TYPES}`); await pa.locator(`[data-type-row="${NAME}"]`).waitFor({ timeout: 15_000 }); await openType(pa);
  const RENAMED = `${NAME} renamed`;
  ok("FO-3st3b M1 (set-up): another tab renames the type", (await call(aTok, "PATCH", `/front-office/booking-types/${typeId}`, { name: RENAMED, version: (await typeApi()).version })).status === 200);
  await timingRow(pa, "gapAfterMinutes").getByRole("button", { name: "Change for this type" }).click();
  await panel(pa).getByLabel("Gap after (minutes) for this type", { exact: true }).fill("20");
  const m1a = await saveTiming(pa, "gapAfterMinutes", () => timingRow(pa, "gapAfterMinutes").getByRole("button", { name: "Save", exact: true }).click());
  await panel(pa).locator("[data-type-timings]").getByRole("button", { name: "Reload" }).click();
  for (let i = 0; i < 40 && (await panel(pa).getByLabel("Name", { exact: true }).inputValue()) !== RENAMED; i++) await pa.waitForTimeout(250);
  ok("FO-3st3b M1 fail: the timing save is refused (409); Reload shows the other tab's name in the panel's Name field", m1a === 409 && (await panel(pa).getByLabel("Name", { exact: true }).inputValue()) === RENAMED, await panel(pa).getByLabel("Name", { exact: true }).inputValue());
  await timingRow(pa, "gapAfterMinutes").getByRole("button", { name: "Change for this type" }).click();
  await panel(pa).getByLabel("Gap after (minutes) for this type", { exact: true }).fill("20");
  const m1b = await saveTiming(pa, "gapAfterMinutes", () => timingRow(pa, "gapAfterMinutes").getByRole("button", { name: "Save", exact: true }).click());
  const m1Save = pa.waitForResponse((r) => r.url().endsWith(`/booking-types/${typeId}`) && r.request().method() === "PATCH", { timeout: 15_000 });
  await pa.getByRole("button", { name: "Save type" }).click(); const m1s = (await m1Save).status(); const m1t = await typeApi();
  ok("FO-3st3b M1 pass: the timing then saves, and Save type keeps the other tab's name (no lost update)", m1b === 200 && m1s === 200 && m1t.name === RENAMED && m1t.timings.gapAfterMinutes === 20, { m1b, m1s, name: m1t.name });
  NAME = RENAMED;
  await pa.context().close();

  // ------------------------------------------------------------------------------------------- who sees what (§8, C5)
  const pt = await open(tTok);
  ok("FO-3st3b keys pass (C5): a Case Manager sees Timings as text (Self-service limit 6 hours), with no field and no Save timings",
    (await pt.locator('[data-timing-text="selfServiceLimitMinutes"]').innerText()) === "6 hours" && (await pt.locator("[data-timings] input").count()) === 0
    && (await pt.getByRole("button", { name: "Save timings" }).count()) === 0 && (await pt.locator("[data-read-only]").count()) === 1);
  await shot(pt, "timings-read-only-1440"); await axe("FO-3st3b Timings read-only (Case Manager)", pt);
  const cmPut = await call(tTok, "PUT", "/front-office/booking-timings", { selfServiceLimitMinutes: 60 });
  ok("FO-3st3b keys fail (§8): the Case Manager's PUT through the API is refused (403) and nothing changes", cmPut.status === 403 && (await firmApi()).timings.selfServiceLimitMinutes === 360, cmPut.status);
  await pt.goto(`${BASE}${TYPES}`); await pt.locator(`[data-type-row="${NAME}"]`).waitFor({ timeout: 15_000 }); await openType(pt);
  ok("FO-3st3b keys pass: the Case Manager sees the type's timings as text (\"1 hour (this type)\", \"Uses firm default (6 hours)\") with no Change or Reset",
    (await timingValue(pt, "minNoticeMinutes")) === "1 hour (this type)" && (await timingValue(pt, "selfServiceLimitMinutes")) === "Uses firm default (6 hours)"
    && (await panel(pt).locator("[data-type-timings] button").count()) === 0);
  const cmPatch = await call(tTok, "PATCH", `/front-office/booking-types/${typeId}/timings`, { selfServiceLimitMinutes: 30, version: (await typeApi()).version });
  ok("FO-3st3b keys fail: the Case Manager's type timing PATCH is refused (403)", cmPatch.status === 403 && (await typeApi()).timings.selfServiceLimitMinutes === null, cmPatch.status);
  await pt.context().close();
  const pb = await open(bTok, 1440, TIMINGS, "main h1");
  ok("FO-3st3b keys (Billing and finance): no Timings menu item, and the direct link shows the refusal words",
    (await pb.locator("[data-menu-timings]").count()) === 0 && (await pb.getByText(REFUSED).count()) === 1 && (await pb.locator("[data-timings-form]").count()) === 0);
  await pb.context().close();

  // ------------------------------------------------------------------------------------------- keyboard only, sizes
  const pk = await open(aTok);
  await pk.locator("[data-timings-form]").waitFor();
  for (let i = 0; i < 60 && (await pk.evaluate(() => document.activeElement?.getAttribute("data-timing-field"))) !== "gapBeforeMinutes"; i++) await pk.keyboard.press("Tab");
  ok("FO-3st3b keyboard: Tab reaches the Gap before field", (await pk.evaluate(() => document.activeElement?.getAttribute("data-timing-field"))) === "gapBeforeMinutes");
  await pk.keyboard.press("ControlOrMeta+A"); await pk.keyboard.type("15");
  const kAnswer = pk.waitForResponse((r) => r.url().endsWith("/api/front-office/booking-timings") && r.request().method() === "PUT", { timeout: 15_000 });
  await pk.keyboard.press("Enter"); await kAnswer;
  ok("FO-3st3b keyboard pass: Enter saves Gap before 15 minutes; the keyboard returns to the heading", (await firmApi()).timings.gapBeforeMinutes === 15 && (await pk.evaluate(() => document.activeElement?.tagName)) === "H1");
  await pk.context().close();
  for (const w of [375, 1024]) {
    const p = await open(aTok, w);
    await p.locator("[data-timings-form]").waitFor();
    await noSideways(`FO-3st3b Timings (${w})`, p); await axe(`FO-3st3b Timings (${w})`, p); await shot(p, `timings-${w}`);
    await p.goto(`${BASE}${TYPES}`); await p.locator(`[data-type-row="${NAME}"]`).waitFor({ timeout: 15_000 }); await openType(p);
    await axe(`FO-3st3b type panel timings (${w})`, p); await shot(p, `type-timings-${w}`);
    await p.context().close();
  }
  ok("FO-3st3b: no page error in any browser", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
