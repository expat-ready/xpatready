// CS-DL3 part 2 (R1.74, QA-591; brief design/build-lead-c-briefs/CS-DL3.md "Part 2"): the case page's "Government steps"
// section, walked in a browser on an isolated copy (its own database and port, never :4400), with the API and the
// database read underneath. Each DW line has a pass and a stand-in that must fail:
//   DW8  record a biometrics letter due in 30 days by keyboard and see it (due date, "in 30 days", reference, who, the
//        reminders); fail: a due date before the letter's date is refused at the field and nothing is written;
//   DW9  cancel it with a reason and record it again: both lines shown, the first as cancelled with its reason; fail: a
//        cancel with no reason is refused at the field and the step stays open;
//   DW10 a staff member without agent/case:edit (Read only) sees the steps and no button; fail: the same record sent
//        through the API with that session is 403 and writes nothing (the server decides, the screen only shows);
//   DW11 (review S2, break m1, m2) a refusal takes the focus to its words; a staff sign-in that ends mid-dialog says
//        nothing was recorded (fail), and signed in again the dialog opens with what was typed (pass).
// Keyboard on every control (dates set on the focused field); axe clean (WCAG 2.2 A/AA) on the section and both dialogs;
// 1024 and 1440 px with no sideways scroll. Sample rows only (the step names are Sample); US$0, no model call; live AI off.
// Screenshots (deviceScaleFactor 1) in product/screens/CS-DL3/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh csdl3b 4651 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_csdl3_milestones_browser.ts 4651 xr_studio_csdl3b
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4651), process.argv[3] ?? "xr_studio_csdl3b"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "CS-DL3", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown, actor?: string): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}), ...(actor ? { "x-actor": actor } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
/** Today in the firm's zone (the Sample firm's default, America/Toronto), and a day n days on. */
const ZONE = "America/Toronto";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const plus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const words = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const vv = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id)`);
if (!vv()) await api(null, "POST", "/demo/load", { sample: "configured" }, "user-A");
const VV = vv(), A = sql(`select id from platform_firm where key = 'sample-firm'`);
const signIn = async (actorId: string): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey: "sample-firm", actorId, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${actorId} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
const TR = await signIn("user-R");
const reader = await db.platformStaff.create({ data: { firmId: A, actorId: `csdl3-reader-${run}`, email: `csdl3-reader-${run}@sample.invalid`, displayName: "Sample reader" } });
await db.platformRoleGrant.create({ data: { firmId: A, staffId: reader.id, role: "READ_ONLY", grantedBy: "seed:csdl3" } });
const TRO = await signIn(reader.actorId!);
const opened = await api(null, "POST", "/runtime/cases", { combinationId: VV, reference: `CSDL3-${run}`, clientActor: "user-P", principal: { displayName: "Sample Client DL3" }, representative: "user-R", caseOfficers: ["user-O"] }, "user-O");
const CASE = opened.body?.id as string;
ok("CS-DL3 setup: the Sample firm, a representative's and a Read only staff session, and an open Visitor visa case on the copy", !!VV && !!A && !!TR && !!TRO && opened.status < 300 && !!CASE, { status: opened.status, body: opened.text.slice(0, 200) });
const rows = () => Number(sql(`select count(*) from case_milestone where case_id = '${CASE}'`));

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", slowMo: process.env.HEADED === "1" ? 200 : 0, ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, actor = "user-O") => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((x) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x.token, expiresAt: Date.now() + 3_600_000 })); localStorage.setItem("xr-actor", x.actor); }, { token, actor });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const section = (p: Page) => p.locator("[data-gov-steps]");
const openCase = async (p: Page) => { await p.goto(`${BASE}/cases/${CASE}`); await section(p).waitFor({ timeout: 60_000 }); await section(p).locator("[data-gov-empty], [data-gov-step]").first().waitFor({ timeout: 30_000 }); };
const shot = (p: Page, name: string) => section(p).screenshot({ path: join(SHOTS, `csdl3-${name}.png`) });
const axe = async (p: Page, what: string, include: string) => { const v = (await new AxeBuilder({ page: p }).include(include).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations; ok(`CS-DL3 axe: ${what}: no WCAG 2.2 A/AA violation`, v.length === 0, v.map((x) => `${x.id}: ${x.nodes[0]?.target}`)); };
/** Tab to a control and press Enter (keyboard only). */
const reach = async (p: Page, target: Locator, max = 200) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
const press = async (p: Page, target: Locator) => { await reach(p, target); await p.keyboard.press("Enter"); };
const dialog = (p: Page, kind: string) => p.locator(`[data-gov-dialog="${kind}"]`);
const field = (p: Page, kind: string, name: string) => dialog(p, kind).locator(`[data-gov-field="${name}"]`);
/** Fills the record dialog by keyboard: Tab from field to field, the step chosen with the arrow keys. */
const fillRecord = async (p: Page, v: { occurredOn: string; dueOn: string; reference: string }) => {
  const step = field(p, "record", "milestoneKey");
  await reach(p, step); await step.selectOption("biometrics");   // the native select by keyboard (ArrowDown) differs per platform; the value is the same
  await reach(p, field(p, "record", "occurredOn")); await field(p, "record", "occurredOn").fill(v.occurredOn);   // Tab walks a date's own parts: reach the next field
  await reach(p, field(p, "record", "dueOn")); await field(p, "record", "dueOn").fill(v.dueOn);
  await reach(p, field(p, "record", "reference")); await p.keyboard.type(v.reference);
};

let failed = 0;
try {
  const page = await tab(TR);
  await openCase(page);
  ok("CS-DL3 DW8 setup: the case page shows Government steps, empty, with Record a step for the representative", await section(page).locator("[data-gov-empty]").isVisible() && await section(page).locator("[data-gov-record]").isVisible());

  // ---------------------------------------------------------------------------------------------- DW8 fail, then pass
  const due = plus(today, 30);
  await press(page, section(page).locator("[data-gov-record]")); await dialog(page, "record").waitFor();
  await axe(page, "the Record a step dialog", '[role="dialog"]');
  ok("CS-DL3 DW8: the dialog says before the click that the due date never changes", (await dialog(page, "record").locator("[data-gov-cannot-change]").innerText()).includes("The due date can't be changed later; if it's wrong, cancel it and record it again."));
  await fillRecord(page, { occurredOn: today, dueOn: plus(today, -1), reference: `B-${run}` });
  await press(page, dialog(page, "record").locator("[data-gov-send]"));
  await page.getByText("The due date can't be before the letter's date.").waitFor({ timeout: 10_000 });
  ok("CS-DL3 DW8 fail: a due date before the letter's date is refused at the due date field, focused, and nothing is written",
    await field(page, "record", "dueOn").getAttribute("aria-invalid") === "true" && await field(page, "record", "dueOn").evaluate((el) => el === document.activeElement) && rows() === 0, rows());
  await field(page, "record", "dueOn").fill(due);
  await press(page, dialog(page, "record").locator("[data-gov-send]"));
  await dialog(page, "record").waitFor({ state: "detached" });
  const first = section(page).locator("[data-gov-step]").first(); await first.waitFor();
  const firstText = await first.innerText();
  const listed = (await api(TR, "GET", `/runtime/cases/${CASE}/milestones`)).body?.milestones?.[0];
  ok(`CS-DL3 DW8 pass: recorded by keyboard, the step shows its name, the letter's date, due ${words(due)} "in 30 days", the reference and who recorded it`,
    firstText.includes("Biometrics instruction letter") && firstText.includes(`Letter of ${words(today)}`) && firstText.includes(words(due)) && firstText.includes("in 30 days") && firstText.includes(`Ref. B-${run}`) && /Recorded by \S/.test(firstText) && !firstText.includes("a staff member"), firstText);
  ok("CS-DL3 DW8 pass: underneath, one line with that due date; the reminders the API plans are the ones listed on the case",
    rows() === 1 && sql(`select due_on from case_milestone where case_id = '${CASE}'`) === due && listed?.reminders?.length > 0
      && listed.reminders.every((r: { day: string }) => firstText.includes(words(r.day))) && (await first.locator("[data-gov-reminders]").innerText()).startsWith("Reminders planned:"), { rows: rows(), reminders: listed?.reminders });
  const reminded = await section(page).locator("[data-gov-reminded]").innerText().catch(() => "");
  ok("CS-DL3 DW8 (part 3): the section says who is reminded and where: the case officer and the lead representative, on their Home under Needs you",
    reminded === "The case officer and the lead representative are reminded on their Home, under Needs you, when in-app reminders are on.", reminded);
  ok("CS-DL3 DW8 (part 3) fail: the stale \"none is sent\" sentence is gone", await section(page).locator("[data-gov-not-sent]").count() === 0 && !(await section(page).innerText()).includes("none is sent"));
  await axe(page, "the Government steps section with one step", "[data-gov-steps]");
  await shot(page, "1-recorded");

  // ---------------------------------------------------------------------------------------------- DW9 fail, then pass
  await press(page, first.locator("[data-gov-cancel]")); await dialog(page, "cancel").waitFor();
  await axe(page, "the Cancel dialog", '[role="dialog"]');
  await press(page, dialog(page, "cancel").locator("[data-gov-cancel-send]"));
  await page.getByText("Give a reason.").waitFor({ timeout: 10_000 });
  ok("CS-DL3 DW9 fail: a cancel with no reason is refused at the reason field and the step stays open",
    await field(page, "cancel", "reason").getAttribute("aria-invalid") === "true" && sql(`select count(*) from case_milestone where case_id = '${CASE}' and cancelled_at is not null`) === "0");
  await field(page, "cancel", "reason").focus(); await page.keyboard.type("Typed the wrong due date (test walk)");
  await press(page, dialog(page, "cancel").locator("[data-gov-cancel-send]")); await dialog(page, "cancel").waitFor({ state: "detached" });
  await page.locator('[data-gov-state="cancelled"]').waitFor(); await page.waitForTimeout(150);
  ok("CS-DL3 DW9: after the cancel, focus returns to the section's heading (its Cancel button is gone)", await page.evaluate(() => document.activeElement?.id) === "gov-steps-h", await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 120)));
  const due2 = plus(today, 29);
  await press(page, section(page).locator("[data-gov-record]")); await dialog(page, "record").waitFor();
  await fillRecord(page, { occurredOn: today, dueOn: due2, reference: `B-${run}` });
  await press(page, dialog(page, "record").locator("[data-gov-send]"));
  await dialog(page, "record").waitFor({ state: "detached", timeout: 15_000 }).catch(async (e) => { throw new Error(`the record dialog stayed open: ${await dialog(page, "record").innerText()} (${(e as Error).message.split("\n")[0]})`); });
  await page.locator('[data-gov-state="open"]').waitFor();
  const cancelledText = await page.locator('[data-gov-state="cancelled"]').innerText(), openText = await page.locator('[data-gov-state="open"]').innerText();
  ok("CS-DL3 DW9 pass: cancelled and recorded again, both lines show: the first as Cancelled with its reason and no reminder, the second open with its own due date",
    await section(page).locator("[data-gov-step]").count() === 2 && cancelledText.includes("Cancelled") && cancelledText.includes("Reason: Typed the wrong due date (test walk)") && !cancelledText.includes("Reminders")
      && openText.includes(words(due2)) && openText.includes("in 29 days") && openText.includes("Reminders planned:"), { cancelledText, openText });
  ok("CS-DL3 DW9 pass: underneath, both lines kept (one cancelled, one open), no update of a due date",
    sql(`select string_agg(due_on::text || ':' || (cancelled_at is not null)::text, ',' order by recorded_at) from case_milestone where case_id = '${CASE}'`) === `${due}:true,${due2}:false`);
  const fits: boolean[] = [];
  for (const width of [1024, 1440]) { await page.setViewportSize({ width, height: 900 }); await page.waitForTimeout(200); fits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); if (width === 1024) await shot(page, "2-cancelled-and-again-1024"); }
  ok("CS-DL3: no sideways page scroll at 1024 and 1440 px", fits.every(Boolean), fits);
  await shot(page, "2-cancelled-and-again-1440");

  // ---------------------------------------------------------------------------------------------- DW10 pass, then fail
  const ro = await tab(TRO);
  await openCase(ro); await section(ro).locator("[data-gov-step]").first().waitFor();
  ok("CS-DL3 DW10 pass: a Read only staff member sees both steps and no Record or Cancel button, with the reason in words",
    await section(ro).locator("[data-gov-step]").count() === 2 && await section(ro).locator("[data-gov-record], [data-gov-cancel]").count() === 0 && await section(ro).locator("[data-gov-no-key]").isVisible());
  await shot(ro, "3-read-only");
  const before = rows();
  const forced = await api(TRO, "POST", `/runtime/cases/${CASE}/milestones`, { milestoneKey: "biometrics", occurredOn: today, dueOn: due });
  ok("CS-DL3 DW10 fail: the same record sent through the API with the Read only session is 403 and writes nothing", forced.status === 403 && rows() === before, forced.status);

  // ---------------------------------------------------------------------------------------------- DW11 (S2, m1, m2)
  page.on("dialog", (d) => void d.accept());   // Back with something typed asks first (break m4)
  const openId = (await section(page).locator('[data-gov-state="open"]').getAttribute("data-gov-step"))!;
  await press(page, section(page).locator(`[data-gov-step="${openId}"] [data-gov-cancel]`)); await dialog(page, "cancel").waitFor();
  await field(page, "cancel", "reason").focus(); await page.keyboard.type("Done elsewhere (test walk)");
  const elsewhere = await api(TR, "POST", `/runtime/cases/${CASE}/milestones/${openId}/cancel`, { reason: "Cancelled in another tab (test walk)" });
  await press(page, dialog(page, "cancel").locator("[data-gov-cancel-send]"));
  await dialog(page, "cancel").locator("[data-gov-refusal]").waitFor({ timeout: 10_000 }); await page.waitForTimeout(200);
  ok("CS-DL3 DW11 (break m1): cancelled in another tab first, the refusal says so in words and takes the focus",
    elsewhere.status === 200 && (await dialog(page, "cancel").locator("[data-gov-refusal]").innerText()).includes("already cancelled") && await page.evaluate(() => document.activeElement?.hasAttribute("data-gov-refusal")), { status: elsewhere.status, refusal: await dialog(page, "cancel").locator("[data-gov-refusal]").innerText(), active: await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160)) });
  await press(page, dialog(page, "cancel").getByRole("button", { name: "Back" })); await dialog(page, "cancel").waitFor({ state: "detached" });
  await press(page, section(page).locator("[data-gov-record]")); await dialog(page, "record").waitFor();
  await fillRecord(page, { occurredOn: today, dueOn: due, reference: `S2-${run}` });
  const n0 = rows(), out = await api(TR, "POST", "/platform/session/sign-out");
  await press(page, dialog(page, "record").locator("[data-gov-send]"));
  await section(page).locator("[data-gov-session-lost]").waitFor({ timeout: 15_000 });
  ok("CS-DL3 DW11 fail (break m2): the sign-in ended elsewhere while Record a step was open: the section says it was not sent and nothing was recorded",
    out.status < 300 && /^Record a step was not sent: nothing was recorded\./.test(await section(page).locator("[data-gov-session-lost]").innerText()) && rows() === n0, out.status);
  const card = page.locator("[data-case-decision]");
  await card.getByLabel("Firm key").fill("sample-firm"); await card.getByLabel("Work email").fill(sql(`select email from platform_staff where actor_id = 'user-R'`));
  await card.getByRole("button", { name: "Sign in" }).click();
  await dialog(page, "record").locator("[data-gov-restored]").waitFor({ timeout: 30_000 });
  ok("CS-DL3 DW11 pass (review S2): signed in again, Record a step opens with what was typed; nothing sent yet",
    await field(page, "record", "reference").inputValue() === `S2-${run}` && await field(page, "record", "dueOn").inputValue() === due && rows() === n0);
  await press(page, dialog(page, "record").getByRole("button", { name: "Back" })); await dialog(page, "record").waitFor({ state: "detached" });
  ok("CS-DL3 walk: no page error on the way", errs.length === 0, errs);
} catch (e) {
  failed++; console.log(`FAIL  CS-DL3 browser check stopped: ${(e as Error).stack ?? e}`);
} finally {
  await browser.close(); await db.$disconnect();
}
const f = summary();
process.exit(f || failed ? 1 : 0);
