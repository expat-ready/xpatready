// PF-18s part 1 (concept screens/PF-18s, approved by Lead 19 on #2332 with the challenge's 7 Majors; AG-16-68, AG-16-75, AG-1-74;
// R1.92): My account → Offices walked in a browser on an isolated copy (its own database and port, never :4400), with the API and
// the database read underneath. Each line has a pass and a fail:
//   DW1 (M1) only Owner and Admin: the Case Officer has no Offices entry and by address sees the plain refusal; the provinces read
//       and placing a person are 403 for them; fail: the Owner has the entry and the page;
//   DW2 one office: no list, no zone, only "Add an office" and what it does; fail: once a second office exists, the list shows;
//   DW3 (M2) adding Calgary in AB shows America/Edmonton pre-filled before saving; saved untouched → audit "province"; fail: a zone
//       the person picks is saved as "chosen";
//   DW4 refusals in words on the field: a duplicate name (409), a country code not on the list (422 on Country);
//   DW5 a stale edit (409) loads the latest and says so; the next save goes through;
//   DW6 (owed PUT, m1) who works where: the unplaced notice, Change places the Case Officer in Calgary (page, API, one audit line);
//       the same placement again writes no line; null takes out; fail: another firm's person or office, a bad id → 404, an extra
//       field → 422, the Case Officer's PUT → 403;
//   DW7 keyboard only (Tab to Add, Enter opens on the name field, Escape returns focus to Add), axe clean (WCAG 2.2 A/AA) on every
//       state, at 375, 1024 and 1440 px with no sideways scroll; fail: the same axe run finds an unlabelled button we add.
// Sample firms only, on a fresh copy (offices are never removed). US$0, no model call; live AI off.
// Screenshots (deviceScaleFactor 1) in product/screens/PF-18s/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh pf18s 4719 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf18s_offices_browser.ts 4719 xr_studio_pf18s
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4719), process.argv[3] ?? "xr_studio_pf18s"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-18s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
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

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");   // the app seeds the Sample firms at start (PLATFORM_SAMPLE_SEED); this only waits for it
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
// An office is never removed (the database refuses it), so DW2's one-office state needs a fresh copy: a reused one stops here.
if (sql(`select count(*) from platform_office where firm_id = '${A}'`) !== "0") { console.error("STOP  sample-firm already has offices: start a fresh isolated copy (isolated.sh <name> <port> stop, then start)"); process.exit(2); }
const TOWNER = await signIn("sample-firm", { actorId: "user-R" }), TOFF = await signIn("sample-firm", { actorId: "user-O" });
const OFF = sql(`select id from platform_staff where actor_id = 'user-O' and firm_id = '${A}'`), OFFNAME = sql(`select display_name from platform_staff where id = '${OFF}'`);
const bStaff = sql(`select id from platform_staff where firm_id = '${B}' and status = 'ACTIVE' order by created_at limit 1`);
const TB = await signIn("sample-solo", { email: sql(`select email from platform_staff where id = '${bStaff}'`) });
const audits = (action: string, key: string) => Number(sql(`select count(*) from audit_event where action = '${action}' and entity_key = '${key}'`));
ok("PF-18s setup: the Sample firms, the Owner (user-R), the Case Officer (user-O) and firm B's staff signed in; firm A has no office rows", !!A && !!B && !!OFF && !!bStaff && sql(`select count(*) from platform_office where firm_id = '${A}'`) === "0");

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const offices = async (p: Page) => { await p.goto(`${BASE}/platform/offices`); await p.locator("[data-one-office], [data-office-row], [data-offices-refused], [data-offices-error]").first().waitFor({ timeout: 60_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `pf18s-${name}.png`), fullPage: true });
// A button turning from disabled grey to blue animates (transition-all): axe reads its colours once it has settled.
const axe = async (p: Page, panel = false) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include(panel ? '[role="dialog"]' : "main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const ids = (v: { id: string; nodes: { target: unknown }[] }[]) => v.map((x) => `${x.id}: ${x.nodes[0]?.target}`);
const reach = async (p: Page, target: Locator, max = 80) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return; await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
const dialog = (p: Page) => p.locator('[role="dialog"]');
const menuHas = (p: Page) => p.locator('nav[aria-label="My account"] [data-account-section="/platform/offices"]').count();

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- DW1
  const po = await tab(TOFF); await offices(po);
  const [prov403, put403] = [await api(TOFF, "GET", "/platform/offices/provinces"), await api(TOFF, "PUT", `/platform/staff/${OFF}/office`, { officeId: null })];
  ok("PF-18s DW1: the Case Officer has no Offices entry; by address the page says \"Only an Owner or Admin can manage the firm's offices.\" with no list and no Add; provinces and placing are 403",
    await menuHas(po) === 0 && (await po.locator("[data-offices-refused]").innerText()) === "Only an Owner or Admin can manage the firm's offices." && await po.locator("[data-office-add], [data-one-office]").count() === 0
      && prov403.status === 403 && put403.status === 403, { prov: prov403.status, put: put403.status });
  const vRefused = await axe(po); ok("PF-18s DW7: the refusal has no WCAG 2.2 A/AA violation", vRefused.length === 0, ids(vRefused));
  await shot(po, "1-refused-case-officer-1440"); await po.context().close();

  // ---------------------------------------------------------------------------------------------- DW2
  const p = await tab(TOWNER); await offices(p);
  const one = await p.locator("main").innerText();
  ok("PF-18s DW1 fail + DW2: the Owner has the entry; with one office the page shows \"Your firm works from one place\" and Add an office, no list and no time zone",
    await menuHas(p) === 1 && await p.locator("[data-one-office]").isVisible() && await p.locator("[data-office-add]").isVisible() && await p.locator("table").count() === 0 && !/America\/|time zone:/i.test(one.replace("its own time zone", "")), one.slice(0, 300));
  const vOne = await axe(p); ok("PF-18s DW7: one office has no WCAG 2.2 A/AA violation", vOne.length === 0, ids(vOne));
  await shot(p, "2-one-office-1440");

  // ---------------------------------------------------------------------------------------------- DW7 keyboard + DW3
  const add = p.locator("[data-office-add]");
  await reach(p, add); await p.keyboard.press("Enter");
  await dialog(p).waitFor();
  const onName = await p.locator("[data-office-name]").evaluate((el) => el === document.activeElement);
  await p.keyboard.press("Escape"); await dialog(p).waitFor({ state: "detached" });
  const backOnAdd = await p.waitForFunction(() => document.activeElement?.hasAttribute("data-office-add"), undefined, { timeout: 5_000 }).then(() => true, () => false);   // review m-4: focus returns after the close animation
  ok("PF-18s DW7: by keyboard, Enter on Add an office opens the panel on the name field; Escape closes it and focus is back on Add", onName && backOnAdd, { onName, backOnAdd });
  await add.click(); await dialog(p).waitFor();
  await p.locator("[data-office-name]").fill("Calgary office");
  await p.locator("[data-office-province]").selectOption("AB");
  const pre = await p.locator("[data-office-zone]").inputValue(), hint = await dialog(p).innerText();
  ok("PF-18s DW3: before saving, picking AB shows the time zone America/Edmonton, pre-filled and editable, with \"Pre-filled from AB\"", pre === "America/Edmonton" && hint.includes("Pre-filled from AB") && await p.locator("[data-office-zone]").isEnabled(), { pre });
  const firmOpt = () => p.locator('[data-office-zone] option', { hasText: "Your firm's time zone" }).count();
  const withProvince = await firmOpt();
  await p.locator("[data-office-province]").selectOption(""); const noProvince = await firmOpt(), zoneNone = await p.locator("[data-office-zone]").inputValue();
  await p.locator("[data-office-province]").selectOption("AB");
  ok("PF-18s DW3 (break M1): while a province gives a zone, \"Your firm's time zone\" is not offered (the server would pre-fill the province's over it); with no province it is, and chosen",
    withProvince === 0 && noProvince === 1 && zoneNone === "" && await p.locator("[data-office-zone]").inputValue() === "America/Edmonton", { withProvince, noProvince, zoneNone });
  const vPanel = await axe(p, true); ok("PF-18s DW7: the add panel has no WCAG 2.2 A/AA violation", vPanel.length === 0, ids(vPanel));
  await shot(p, "3-add-prefilled-1440");
  await p.locator("[data-office-save]").click(); await dialog(p).waitFor({ state: "detached" });
  await p.locator('[data-office-row="Calgary office"]').waitFor({ timeout: 30_000 });
  const cal = sql(`select id from platform_office where firm_id = '${A}' and name = 'Calgary office'`);
  const from = sql(`select detail->>'timeZoneFrom' from audit_event where action = 'platform.office.add' and entity_key = '${cal}'`);
  ok("PF-18s DW2 fail + DW3: after the add the list shows two offices (the first written from the firm's settings, and Calgary in America/Edmonton); the audit says pre-filled from the province",
    await p.locator("[data-office-row]").count() === 2 && (await p.locator('[data-office-row="Calgary office"] [data-office-zone-cell]').innerText()) === "America/Edmonton" && from === "province" && await p.locator("[data-first-added]").isVisible(), { from });
  await p.locator("[data-office-add]").click(); await dialog(p).waitFor();
  await p.locator("[data-office-name]").fill("Vancouver desk"); await p.locator("[data-office-province]").selectOption("BC");
  await p.locator("[data-office-zone]").selectOption("America/Edmonton");
  await p.locator("[data-office-save]").click(); await p.locator('[data-office-row="Vancouver desk"]').waitFor({ timeout: 30_000 });
  const van = sql(`select id from platform_office where firm_id = '${A}' and name = 'Vancouver desk'`);
  ok("PF-18s DW3 fail: a zone the person picks (America/Edmonton for a BC office) is saved as theirs, and the audit says chosen",
    sql(`select time_zone from platform_office where id = '${van}'`) === "America/Edmonton" && sql(`select detail->>'timeZoneFrom' from audit_event where action = 'platform.office.add' and entity_key = '${van}'`) === "chosen");

  // ---------------------------------------------------------------------------------------------- DW4
  await p.locator("[data-office-add]").click(); await dialog(p).waitFor();
  await p.locator("[data-office-name]").fill("calgary OFFICE"); await p.locator("[data-office-save]").click();
  await p.locator("[data-office-problem]").waitFor();
  const dup = await p.locator("[data-office-problem]").innerText(), dupOnName = await p.locator("[data-office-name]").getAttribute("aria-invalid");
  await p.locator("[data-office-name]").fill("Leeds"); await p.locator("[data-office-abroad]").check(); await p.locator("[data-office-country]").fill("Canada");
  await p.locator("[data-office-save]").click();
  await dialog(p).getByText("For an office in Canada, choose In Canada and its province.").waitFor();
  await p.locator("[data-office-country]").fill("ZZ");
  await p.locator("[data-office-save]").click();
  await dialog(p).getByText("Office not saved").or(dialog(p).locator('[role="alert"]')).first().waitFor();
  await p.waitForFunction(() => document.activeElement?.hasAttribute("data-office-country"), undefined, { timeout: 5_000 });
  const countryErr = await p.locator("[data-office-country]").getAttribute("aria-invalid");
  ok("PF-18s DW4 (break m3, m4): \"Canada\" typed as a country abroad is refused on the field before sending; after a refusal focus is on the field in error",
    countryErr === "true" && sql(`select count(*) from platform_office where firm_id = '${A}' and name = 'Leeds'`) === "0");
  ok("PF-18s DW4: a name already used (any case) is refused in words, nothing saved; a country code not on the list is refused on the Country field",
    dup === "An office with this name already exists." && dupOnName === "true" && countryErr === "true" && sql(`select count(*) from platform_office where firm_id = '${A}'`) === "3", { dup, countryErr });
  const vErr = await axe(p, true); ok("PF-18s DW7: the panel with a field error has no WCAG 2.2 A/AA violation", vErr.length === 0, ids(vErr));
  await shot(p, "4-field-error-1440");
  await dialog(p).locator("button", { hasText: "Close" }).click(); await dialog(p).waitFor({ state: "detached" });

  // ---------------------------------------------------------------------------------------------- DW5
  await p.locator('[data-office-row="Calgary office"] [data-office-edit]').click(); await dialog(p).waitFor();
  const v0 = (await api(TOWNER, "GET", "/platform/offices")).body.offices.find((o: { id: string }) => o.id === cal).version;
  const elsewhere = await api(TOWNER, "PATCH", `/platform/offices/${cal}`, { name: "Calgary (Stephen Ave)", version: v0 });
  await p.locator("[data-office-name]").fill("Calgary downtown"); await p.locator("[data-office-save]").click();
  // PF-31 (EXPERIENCE §4 "conflict", the founder's 23 Nov decision): a stale save no longer reloads the latest over what was
  // typed; the conflict state shows the saved name beside mine, and "Keep mine, then Save" goes through.
  await p.locator("[data-conflict]").waitFor();
  const stale = await p.locator("[data-conflict]").innerText(), reloaded = await p.locator('[data-conflict-row="Office name"] [data-conflict-saved]').innerText();
  await p.locator("[data-conflict-keep-mine]").click(); await p.locator("[data-office-save]").click(); await dialog(p).waitFor({ state: "detached" });
  ok("PF-18s DW5: a change made elsewhere first → the save is refused (409) in words, the latest name is shown beside mine; Keep mine then Save goes through",
    elsewhere.status === 200 && stale.includes("Someone changed this office since you opened it.") && reloaded.includes("Calgary (Stephen Ave)") && sql(`select name from platform_office where id = '${cal}'`) === "Calgary downtown", { stale, reloaded });

  // ---------------------------------------------------------------------------------------------- DW6
  await offices(p); const where = p.locator("[data-who-works-where]"); await where.locator("[data-place-row]").first().waitFor({ timeout: 30_000 });
  ok("PF-18s DW6: Who works where lists the active staff, each with No office, and says how many have none yet",
    (await where.locator(`[data-place-row="${OFFNAME}"] [data-place-office-name]`).innerText()) === "No office" && /people? ha(s|ve) no office yet/.test(await where.innerText()));
  const vList = await axe(p); ok("PF-18s DW7: the office list and Who works where have no WCAG 2.2 A/AA violation", vList.length === 0, ids(vList));
  await shot(p, "5-offices-list-1440");
  const change = where.locator(`[data-place-row="${OFFNAME}"] [data-place-open]`);
  await change.click(); await dialog(p).waitFor();
  const vPlace = await axe(p, true); ok("PF-18s DW7: the place panel has no WCAG 2.2 A/AA violation", vPlace.length === 0, ids(vPlace));
  await p.locator('[data-place-office="Calgary downtown"]').check(); await shot(p, "6-place-panel-1440");
  await p.locator("[data-place-save]").click(); await dialog(p).waitFor({ state: "detached" });
  await where.locator(`[data-place-row="${OFFNAME}"] [data-place-office-name]`).filter({ hasText: "Calgary downtown" }).waitFor({ timeout: 15_000 });
  const backOnChange = await change.evaluate((el) => el === document.activeElement);
  const staffRow = (await api(TOWNER, "GET", "/platform/staff")).body.staff.find((s: { id: string }) => s.id === OFF);
  ok("PF-18s DW6: Change → Calgary downtown → Save: the row shows it, focus is back on Change, GET staff answers its officeId, one audit line",
    backOnChange && staffRow?.officeId === cal && audits("platform.office.staff", OFF) === 1, { backOnChange, officeId: staffRow?.officeId, audits: audits("platform.office.staff", OFF) });
  // Break B1: Offices and Team read the staff list into separate cache entries; moving between them by the menu breaks neither.
  await p.locator('nav[aria-label="My account"] [data-account-section="/platform/team"]').click(); await p.locator("[data-seat-line]").waitFor({ timeout: 15_000 });
  await p.locator('nav[aria-label="My account"] [data-account-section="/platform/offices"]').click();
  const placedCell = where.locator(`[data-place-row="${OFFNAME}"] [data-place-office-name]`);
  await placedCell.filter({ hasText: "Calgary downtown" }).waitFor({ timeout: 15_000 });
  await where.locator(`[data-place-row="${OFFNAME}"] [data-place-open]`).click(); await dialog(p).waitFor();
  await p.waitForFunction(() => (document.activeElement as HTMLInputElement | null)?.checked === true, undefined, { timeout: 5_000 });
  const onTicked = await p.evaluate(() => document.activeElement?.getAttribute("data-place-office"));
  await dialog(p).locator("button", { hasText: "Close" }).click(); await dialog(p).waitFor({ state: "detached" });
  ok("PF-18s DW6 (break B1, m5): Offices → Team → Offices by the menu: Team shows its seat line, Offices still shows the placement; the place panel opens on the ticked office",
    onTicked === "Calgary downtown" && !errs.length, { onTicked, errs });
  const again = await api(TOWNER, "PUT", `/platform/staff/${OFF}/office`, { officeId: cal.toUpperCase() });
  const moved = await api(TOWNER, "PUT", `/platform/staff/${OFF}/office`, { officeId: van });
  ok("PF-18s DW6 (m1): the same placement again answers it and writes no audit line; a real move writes one",
    again.status === 200 && again.body?.officeId === cal && moved.status === 200 && audits("platform.office.staff", OFF) === 2, { again: again.text.slice(0, 120), audits: audits("platform.office.staff", OFF) });
  const bOffice = sql(`select id from platform_office where firm_id = '${B}' limit 1`);
  const [otherStaff, otherOffice, badId, extra, missing, noKey] = [
    await api(TOWNER, "PUT", `/platform/staff/${bStaff}/office`, { officeId: cal }),
    await api(TB, "PUT", `/platform/staff/${bStaff}/office`, { officeId: cal }),
    await api(TOWNER, "PUT", "/platform/staff/not-a-uuid/office", { officeId: cal }),
    await api(TOWNER, "PUT", `/platform/staff/${OFF}/office`, { officeId: cal, note: "x" }),
    await api(TOWNER, "PUT", `/platform/staff/${OFF}/office`, {}),
    await api(TOFF, "PUT", `/platform/staff/${OFF}/office`, { officeId: cal }),
  ];
  ok("PF-18s DW6 fail: another firm's person (404), another firm's office from firm B (404), a bad id (404), an extra or missing field (422), no key (403); the placement is unchanged",
    otherStaff.status === 404 && otherOffice.status === 404 && badId.status === 404 && extra.status === 422 && missing.status === 422 && noKey.status === 403 && sql(`select office_id from platform_staff_office where staff_id = '${OFF}'`) === van,
    { otherStaff: otherStaff.status, otherOffice: otherOffice.status, badId: badId.status, extra: extra.status, missing: missing.status, noKey: noKey.status, bOffice: !!bOffice });
  const out = await api(TOWNER, "PUT", `/platform/staff/${OFF}/office`, { officeId: null });
  ok("PF-18s DW6: officeId null takes the person out (no row), one more audit line", out.status === 200 && out.body?.officeId === null && sql(`select count(*) from platform_staff_office where staff_id = '${OFF}'`) === "0" && audits("platform.office.staff", OFF) === 3);

  // ---------------------------------------------------------------------------------------------- DW7 three widths
  for (const w of [375, 1024, 1440]) {
    const q = await tab(TOWNER, w); await offices(q); await q.locator("[data-who-works-where] [data-place-row]").first().waitFor({ timeout: 30_000 });
    const v = await axe(q), wide = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(`PF-18s DW7: Offices at ${w} px has no WCAG 2.2 A/AA violation and no sideways scroll`, v.length === 0 && wide, { v: ids(v), wide });
    if (w !== 1440) await shot(q, `7-offices-${w}`);
    if (w === 375) {
      await q.evaluate(() => { document.querySelector("[data-who-works-where]")!.appendChild(document.createElement("button")); });
      const bad = await axe(q);
      ok("PF-18s DW7 fail: the same axe run finds the unlabelled button we add (the check can fail)", bad.some((x) => x.id === "button-name"), bad.map((x) => x.id));
    }
    await q.context().close();
  }
  ok("PF-18s: no page error in any tab", errs.length === 0, errs);
} catch (e) {
  failed++; console.log(`FAIL  PF-18s: the check stopped: ${(e as Error).stack?.slice(0, 600)}`);
} finally {
  await browser.close();
}
process.exit(summary() + failed ? 1 : 0);
