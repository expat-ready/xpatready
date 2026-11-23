// PF-5s S5 (R1.92; AG-01 §3.1, AG01-29(7), AG-1-65; Lead 6's ruling: an IANA time-zone picker): My account → Firm profile walked in a
// browser on an isolated copy (its own database and port, never :4400), with the API and the database read underneath. Each line has
// a pass and a fail:
//   FP1 the menu offers "Firm profile"; the Owner's page edits contact and defaults; the Case Officer reads them (no field, no Save,
//       no billing section, and the API sends them no billing email); fail: a person without agent/settings:list has no entry;
//   FP2 the Owner changes the time zone and the website, Save: the settings hold them, one audit line each, the page says saved;
//       fail: an unchanged form sends nothing ("No changes to save") and writes no line;
//   FP3 refusals in words on each field (a phone of letters, a website with no https://): 422, aria-invalid on both, focus on the
//       first; nothing written; fail: correcting them saves;
//   FP4 a stale save (someone changed the profile behind the page): 409, the latest is loaded into the form and said; fail: the
//       next save from the loaded form goes through;
//   FP5 the billing email is the Owner's: the Owner changes it (one platform.firm.billing_email_changed line); an Admin sees it as
//       text with "Only the Owner can change this" and no field, and the Admin's own save of the website goes through without it;
//   FP6 keyboard only (Tab to Time zone, change by keys, Save by Enter on the button), axe clean (WCAG 2.2 A/AA) on every state, at
//       1280 and 375 px with no sideways scroll; fail: the same axe run finds an unlabelled field we add.
// Sample firms only; re-runnable on the same copy (each run's values are new and the Sample firm's zone is put back). US$0, no model
// call; live AI off. Screenshots (deviceScaleFactor 1) in product/screens/PF-5s/screenshots-s5/. Run from prototype/:
//   zsh studio/tools/isolated.sh pf5sfp 4747 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf5s_firm_profile_browser.ts 4747 xr_studio_pf5sfp
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { ACCOUNT_SECTIONS, visibleSections } from "../web/src/modules/platform/account-sections.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4747), process.argv[3] ?? "xr_studio_pf5sfp"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-5s", "screenshots-s5"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const signIn = async (firmKey: string, who: { actorId?: string; email?: string }): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, ...who, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${JSON.stringify(who)} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
const PROFILE = "/platform/firm/profile";

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");   // the app seeds the Sample firms at start (PLATFORM_SAMPLE_SEED); this only waits for it
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const run = Date.now().toString(36).slice(-5);
const TOWNER = await signIn("sample-firm", { actorId: "user-R" }), TOFF = await signIn("sample-firm", { actorId: "user-O" });
const ADM = sql(`select id from platform_staff where actor_id = 'user-T' and firm_id = '${A}'`);
const roles = await api(TOWNER, "PATCH", `/platform/staff/${ADM}/roles`, { roles: ["CASE_MANAGER", "ADMIN"], reason: "PF-5s S5 check: an Admin for the firm profile" });
const TADM = await signIn("sample-firm", { actorId: "user-T" });
const keysOf = async (t: string) => ((await api(t, "GET", "/platform/me")).body?.keys ?? []) as string[];
const [kOwner, kOff, kAdm] = [await keysOf(TOWNER), await keysOf(TOFF), await keysOf(TADM)];
const zone0 = (await api(TOWNER, "GET", PROFILE)).body?.details?.timeZone as string;
const now = () => sql(`select clock_timestamp()::text`);
const lines = (key: string, since: string) => Number(sql(`select count(*) from audit_event where at > '${since}' and entity_key = '${A}:${key}'`));
ok("PF-5s S5 setup: the Owner (user-R), the Case Officer (user-O) and user-T made Admin by the Owner are signed in; the Owner and Admin edit details, the Admin not the billing email",
  !!A && roles.status === 200 && kOwner.includes("agent/settings:edit") && kAdm.includes("agent/settings:edit") && !kAdm.includes("agent/firm-profile:manage") && kOwner.includes("agent/firm-profile:manage") && kOff.includes("agent/settings:list") && !kOff.includes("agent/settings:edit"),
  { roles: roles.status, off: kOff.filter((k) => k.includes("settings")) });

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1280) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const open = async (p: Page) => { await p.goto(`${BASE}/platform/firm-profile`); await p.locator("[data-profile-section=details], [data-profile-refused], [data-profile-error]").first().waitFor({ timeout: 60_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `pf5s-s5-${name}.png`), fullPage: true });
const axe = async (p: Page) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const ids = (v: { id: string; nodes: { target: unknown }[] }[]) => v.map((x) => `${x.id}: ${x.nodes[0]?.target}`);
const sideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const reach = async (p: Page, target: Locator, max = 80) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
const field = (p: Page, name: string) => p.locator(`[data-profile-field="${name}"]`);
const problem = (p: Page) => p.locator("[data-profile-problem]");
const save = (p: Page) => p.locator("[data-profile-save]");
const toast = (p: Page, text: RegExp) => p.getByText(text).first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
const wait = async (cond: () => boolean, ms = 10_000) => { for (let i = 0; i < ms / 250; i++) { if (cond()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };
const axeAll: string[] = [];

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- FP1
  const po = await tab(TOWNER); await po.goto(`${BASE}/account`); await po.locator('nav[aria-label="My account"]').waitFor({ timeout: 60_000 });
  const entry = po.locator('nav[aria-label="My account"] [data-account-section="/platform/firm-profile"]');
  ok("PF-5s S5 FP1 pass: My account offers \"Firm profile\" to the Owner, and it opens the page", (await entry.innerText()).trim() === "Firm profile" && (await entry.click(), await po.locator("[data-profile-section=details]").waitFor({ timeout: 20_000 }).then(() => true, () => false)));
  ok("PF-5s S5 FP1 pass: the Owner's page has the six detail fields, the Owner's billing email field, a Save, and the firm's legal fields as text only",
    (await po.locator("[data-profile-field]").count()) === 7 && (await save(po).count()) === 1 && (await po.locator('[data-profile-value="legalName"], [data-profile-value="operatingName"], [data-profile-value="countryCode"], [data-profile-value="key"]').count()) === 4
    && (await po.getByLabel(/time zone/i).evaluate((el) => el.tagName)) === "SELECT" && (await po.getByLabel(/time zone/i).locator("option").count()) > 100);
  await shot(po, "owner-1280"); axeAll.push(...ids(await axe(po)).map((x) => `owner: ${x}`));
  const pc = await tab(TOFF); await open(pc);
  const offApi = await api(TOFF, "GET", PROFILE);
  ok("PF-5s S5 FP1 pass: the Case Officer reads contact and defaults as text: no field, no Save, no billing section; the API sends them no billing email",
    (await pc.locator("[data-profile-field]").count()) === 0 && (await save(pc).count()) === 0 && (await pc.locator("[data-profile-section=billing]").count()) === 0
    && (await pc.locator('[data-profile-value="timeZone"]').innerText()) === zone0 && (await pc.getByText("Only an Owner or Admin can change these.").count()) === 1 && offApi.body?.ownerOnly?.billingEmail === null,
    { zone: zone0 });
  await shot(pc, "case-officer-1280"); axeAll.push(...ids(await axe(pc)).map((x) => `officer: ${x}`));
  ok("PF-5s S5 FP1 fail: a person without agent/settings:list has no Firm profile entry; with it, they have", !visibleSections(ACCOUNT_SECTIONS, ["agent/staff:manage"]).some((s) => s.path === "/platform/firm-profile")
    && visibleSections(ACCOUNT_SECTIONS, ["agent/settings:list"]).some((s) => s.path === "/platform/firm-profile" && s.label === "Firm profile"));

  // ---------------------------------------------------------------------------------------------- FP2
  let t0 = now();
  await save(po).click();
  ok("PF-5s S5 FP2 fail: Save on an unchanged form sends nothing: \"No changes to save\", no audit line", (await problem(po).innerText().catch(() => "")) === "No changes to save." && sql(`select count(*) from audit_event where at > '${t0}' and firm_id = '${A}'`) === "0");
  const to = zone0 === "America/Halifax" ? "America/Regina" : "America/Halifax", site = `https://fp-${run}.example.ca`;
  t0 = now();
  await field(po, "timeZone").selectOption(to); await field(po, "website").fill(site);
  ok("PF-5s S5 FP2: the page says there are unsaved changes before Save", (await po.locator("[data-profile-unsaved]").count()) === 1);
  await save(po).click();
  const saved = await toast(po, /^Firm profile saved\.$/);
  const held = await wait(() => sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.time_zone'`) === to);
  ok("PF-5s S5 FP2 pass: the Owner changes the time zone and the website and saves: the settings hold them, one audit line each, the page says saved and shows no unsaved changes",
    saved && held && sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.website'`) === site
    && lines("platform.time_zone", t0) === 1 && lines("platform.website", t0) === 1 && (await po.locator("[data-profile-unsaved]").count()) === 0 && (await field(po, "timeZone").inputValue()) === to, { saved, held });
  await shot(po, "owner-saved-1280");

  // ---------------------------------------------------------------------------------------------- FP3
  t0 = now();
  await field(po, "publicPhone").fill("call us"); await field(po, "website").fill("fp-example.ca");
  await save(po).click();
  await problem(po).waitFor({ timeout: 15_000 });
  const inv = async (n: string) => (await field(po, n).getAttribute("aria-invalid")) === "true";
  const focusOnPhone = await field(po, "publicPhone").evaluate((el) => el === document.activeElement);
  const phoneNote = await po.locator(`#${await field(po, "publicPhone").getAttribute("aria-describedby")}`).innerText();
  ok("PF-5s S5 FP3 fail: a phone of letters and a website with no https:// are refused on each field in words (aria-invalid, the server's words), focus on the first; nothing written",
    (await inv("publicPhone")) && (await inv("website")) && focusOnPhone && /phone|digits/i.test(phoneNote) && /web address/i.test(await po.locator(`#${await field(po, "website").getAttribute("aria-describedby")}`).innerText())
    && sql(`select count(*) from audit_event where at > '${t0}' and firm_id = '${A}'`) === "0" && sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.website'`) === site, { phoneNote, focusOnPhone });
  await shot(po, "field-errors-1280"); axeAll.push(...ids(await axe(po)).map((x) => `errors: ${x}`));
  ok("PF-5s S5 FP3: typing in a refused field clears its error", (await field(po, "publicPhone").fill("+1 416 555-0100"), !(await inv("publicPhone"))));
  await field(po, "website").fill(`${site}/contact`); t0 = now();
  await save(po).click();
  ok("PF-5s S5 FP3 pass: once corrected, the same save goes through (phone and website held, one line each)",
    (await toast(po, /^Firm profile saved\.$/)) && await wait(() => sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.public_phone'`) === "+1 416 555-0100") && lines("platform.website", t0) === 1);

  // ---------------------------------------------------------------------------------------------- FP4
  const behind = `https://behind-${run}.example.ca`;
  const g = await api(TOWNER, "GET", PROFILE);
  const other = await api(TADM, "PUT", PROFILE, { version: g.body.version, website: behind });
  await field(po, "publicEmail").fill(`hello-${run}@sample-firm.example.ca`); t0 = now();
  await save(po).click();
  await problem(po).waitFor({ timeout: 15_000 });
  const conflictText = await problem(po).innerText();
  ok("PF-5s S5 FP4 fail: a save from before someone else's change is refused (409); the latest is loaded into the form and said; nothing written",
    other.status === 200 && /Someone else changed/.test(conflictText) && /latest details are loaded/.test(conflictText) && (await field(po, "website").inputValue()) === behind && (await field(po, "publicEmail").inputValue()) !== `hello-${run}@sample-firm.example.ca`
    && sql(`select count(*) from audit_event where at > '${t0}' and firm_id = '${A}'`) === "0", { conflictText });
  await shot(po, "conflict-1280"); axeAll.push(...ids(await axe(po)).map((x) => `conflict: ${x}`));
  await field(po, "publicEmail").fill(`hello-${run}@sample-firm.example.ca`); t0 = now();
  await save(po).click();
  ok("PF-5s S5 FP4 pass: the next save from the loaded form goes through, keeping the other person's website",
    (await toast(po, /^Firm profile saved\.$/)) && await wait(() => lines("platform.public_email", t0) === 1) && sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.website'`) === behind);

  // ---------------------------------------------------------------------------------------------- FP5
  const billing = `billing-${run}@sample-firm.example.ca`; t0 = now();
  await field(po, "billingEmail").fill(billing); await save(po).click();
  ok("PF-5s S5 FP5 pass: the Owner changes the billing email: stored, one platform.firm.billing_email_changed line",
    (await toast(po, /^Firm profile saved\.$/)) && await wait(() => sql(`select billing_email from platform_firm where id = '${A}'`) === billing) && sql(`select count(*) from audit_event where at > '${t0}' and action = 'platform.firm.billing_email_changed'`) === "1");
  const pa = await tab(TADM); await open(pa);
  ok("PF-5s S5 FP5 fail: the Admin sees the billing email as text with \"Only the Owner can change this.\" and no billing email field; the detail fields are theirs",
    (await field(pa, "billingEmail").count()) === 0 && (await pa.locator('[data-profile-value="billingEmail"]').innerText()) === billing && (await pa.locator("[data-profile-section=billing]").getByText("Only the Owner can change this.").count()) === 1 && (await field(pa, "timeZone").count()) === 1);
  await shot(pa, "admin-1280"); axeAll.push(...ids(await axe(pa)).map((x) => `admin: ${x}`));
  const asite = `https://admin-${run}.example.ca`; t0 = now();
  await field(pa, "website").fill(asite); await save(pa).click();
  ok("PF-5s S5 FP5 pass: the Admin's own save of the website goes through and never carries the billing email (unchanged, one website line, no billing line)",
    (await toast(pa, /^Firm profile saved\.$/)) && await wait(() => lines("platform.website", t0) === 1) && sql(`select billing_email from platform_firm where id = '${A}'`) === billing && sql(`select count(*) from audit_event where at > '${t0}' and action = 'platform.firm.billing_email_changed'`) === "0");

  // ---------------------------------------------------------------------------------------------- FP6
  const pk = await tab(TOWNER); await open(pk);
  const zf = field(pk, "timeZone"); await reach(pk, zf);
  const before = await zf.inputValue();
  await pk.keyboard.press("ArrowDown");
  const after = await zf.inputValue(); t0 = now();
  await reach(pk, save(pk)); await pk.keyboard.press("Enter");
  ok("PF-5s S5 FP6 pass: keyboard only: Tab reaches Time zone, an arrow key changes it, Tab to Save and Enter saves it",
    before !== after && (await toast(pk, /^Firm profile saved\.$/)) && await wait(() => sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.time_zone'`) === after), { before, after });
  for (const [who, t] of [["owner", TOWNER], ["officer", TOFF]] as const) {
    const pm = await tab(t, 375); await open(pm);
    const wide = await sideways(pm); axeAll.push(...ids(await axe(pm)).map((x) => `${who}-375: ${x}`));
    await shot(pm, `${who}-375`);
    ok(`PF-5s S5 FP6 pass: at 375 px the ${who}'s page has no sideways scroll`, !wide);
  }
  ok("PF-5s S5 FP6 pass: axe-core (WCAG 2.2 A/AA) finds nothing on the Owner, Case Officer, Admin, field-error and conflict states at 1280 px and the 375 px pages", axeAll.length === 0, axeAll);
  await pk.evaluate(() => { const i = document.createElement("input"); i.setAttribute("data-axe-probe", ""); document.querySelector("#profile-form")?.appendChild(i); });
  ok("PF-5s S5 FP6 fail: the same axe run finds an unlabelled field we add", ids(await axe(pk)).some((x) => x.startsWith("label")));
  ok("PF-5s S5: no page error in any tab", errs.length === 0, errs);
} catch (e) { failed++; ok(`PF-5s S5: the walk stopped: ${(e as Error).message.split("\n")[0]}`, false); }
finally {
  const g = await api(TOWNER, "GET", PROFILE);   // put the Sample firm's zone back (re-runnable)
  if (g.body?.version) await api(TOWNER, "PUT", PROFILE, { version: g.body.version, timeZone: zone0 });
  await browser.close();
}
process.exit(summary() || failed ? 1 : 0);
