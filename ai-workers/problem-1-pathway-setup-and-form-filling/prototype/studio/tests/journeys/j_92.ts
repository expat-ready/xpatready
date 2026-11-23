// J-92 (map row 92, R1.92: firm profile, offices and time zones, licence-number check), written by the runtime lane (22 Nov, Lead 4's
// brief on #3003). It walks a firm's Owner through what is on main by screens at 1440 px, on an isolated copy (its own database and
// port, never :4400), with the API and the database read underneath. Done when (qa/CAPABILITIES R1.92): "Profile and offices save with
// a valid IANA zone; a licence number in the wrong shape refused on the field; office times shown in each office's zone". Lead 4 (22 Nov
// 15:39 IST, on #3003) and AG-1-34: the licence check is a WARNING on the field, never a refusal.
//   W1 Firm profile by screens: My account offers "Firm profile"; on it the Owner changes the firm's time zone (AG-01 §3.1: "language and
//      timezone pickers"), saves, and the setting and its one audit line change. FAILS today: no Firm profile page (PF-5s S5, the next
//      row). Once the page exists with no time-zone field, it fails naming that (the PF-5s concept's field list names none: a question for
//      the tech lead on #3028).
//   W2 the profile's API (PF-5fp, #3003): GET, then PUT a valid IANA zone, read back; a zone not on the list refused on its field (422),
//      nothing written. Fails until #3003 is merged (404 before it).
//   W3 Offices by screens (PF-18s part 1 over PF-18a): the Owner adds an office in Alberta: America/Edmonton is pre-filled before
//      saving; saved, the list shows it with its zone; a BC office gets America/Vancouver.
//   W4 office times in each office's zone: Vancouver's hours are changed to 08:00-16:00 (the API, as the Edit panel saves them); each
//      office's row shows its own zone and its own hours (Vancouver 08:00-16:00, Calgary 09:00-17:00), as the API holds them; the
//      firm's first office keeps the firm's zone.
//   W5 a zone not on the list is refused on the office's timeZone field in words (the API's 422; the screen offers only listed zones).
//   W6 Licence by screens (PF-6 part 2b, PF-4c part 2): My account → Licence; a number in the wrong shape for its body is saved and
//      WARNED on the field ("doesn't look like …"), never refused, the field not marked invalid, axe clean in that state; it reads
//      back on Licences; there, the Owner's save of a wrong shape keeps the panel open with the warning on the number. The body is
//      the first one whose pattern refuses the value (never assumed): the College's "R and 6 numbers", read at college-ic.ca
//      (23 Nov). Before PF-4c part 2's data and form, this step named both missing parts.
//   W7 400, 1024 and 1440 px: Offices and Licence have no sideways scroll and no WCAG 2.2 A/AA violation (axe); keyboard only, the
//      licence is saved (Tab to the number, type, Enter); no page error.
// Re-runnable on one copy (offices are never removed: each run adds its own names). Sample firms and values only. US$0, no model call,
// live AI off. Screenshots: product/screens/J-92/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j92 4783 start --ttl 30 AI_LIVE=off PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j92 4783 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_92.ts j92 4783
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j92", PORT = Number(process.argv[3] ?? 4783), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-92", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const signIn = async (firmKey: string, actorId: string): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${actorId} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
const BODIES = JSON.parse(readFileSync(join(STUDIO, "samples", "representative-bodies-ca.json"), "utf8")) as { types: { label: string; bodies: string[] }[]; bodies: { name: string; kind: string; numberPattern?: string }[] };

await api(null, "GET", "/platform/me");   // the app seeds the Sample firms at start; this only waits for it
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const TOWNER = await signIn("sample-firm", "user-R");
const OWNER = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`);
ok("R1.92 setup: the Sample firm and its Owner (user-R), signed in", !!A && !!OWNER);
const run = Date.now().toString(36).slice(-5);

const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, TOWNER);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `j92-${name}.png`), fullPage: true });
const axe = async (p: Page) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include("main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const dialog = (p: Page) => p.locator('[role="dialog"]');

try {
  // ------------------------------------------------------------------------------------------ W1 Firm profile by screens
  const p = await tab();
  await p.goto(`${BASE}/account`); await p.locator('nav[aria-label="My account"]').waitFor({ timeout: 60_000 });
  const sections = await p.locator('nav[aria-label="My account"] [data-account-section]').allInnerTexts();
  const profileEntry = sections.find((s) => /firm profile/i.test(s));
  await shot(p, "w1-my-account-1440");
  if (!profileEntry) ok("R1.92 W1: My account offers \"Firm profile\" to the Owner, where the firm's IANA time zone is changed and saved. FAILS today: no Firm profile page on main (PF-5s S5, the next row)", false, { sections });
  else {
    await p.locator('nav[aria-label="My account"] [data-account-section]', { hasText: /firm profile/i }).first().click();
    const field = p.getByLabel(/time zone/i).first();
    await field.waitFor({ timeout: 20_000 }).catch(() => undefined);
    if (!(await field.count())) ok("R1.92 W1: the Firm profile page offers the firm's time zone (AG-01 §3.1). FAILS: the page has no time-zone field (the PF-5s concept lists none: question for the tech lead on #3028)", false, { url: p.url() });
    else {
      const was = sql(`select coalesce((select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.time_zone'), 'America/Toronto')`);
      const to = was === "America/Halifax" ? "America/Regina" : "America/Halifax", t1 = sql(`select clock_timestamp()::text`);
      if (await field.evaluate((el) => el.tagName === "SELECT")) await field.selectOption(to); else await field.fill(to);
      await p.getByRole("button", { name: /^save/i }).first().click();
      const savedZone = await (async () => { for (let i = 0; i < 40; i++) { const z = sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.time_zone'`); if (z === to) return z; await p.waitForTimeout(250); } return null; })();
      await shot(p, "w1-firm-profile-saved-1440");
      ok("R1.92 W1: on Firm profile the Owner changes the firm's time zone and saves: the setting holds it and one audit line records it", savedZone === to
        && sql(`select count(*) from audit_event where at > '${t1}' and entity_key = '${A}:platform.time_zone'`) === "1", { to, savedZone });
      const g1 = await api(TOWNER, "GET", "/platform/firm/profile");
      await api(TOWNER, "PUT", "/platform/firm/profile", { version: g1.body?.version, timeZone: was });   // put the Sample firm's zone back
    }
  }

  // ------------------------------------------------------------------------------------------ W2 the profile's API
  const g = await api(TOWNER, "GET", "/platform/firm/profile");
  if (g.status === 404) ok("R1.92 W2: the firm profile API answers (PF-5fp). FAILS until #3003 is merged: GET /api/platform/firm/profile is 404", false, { status: g.status });
  else {
    const zone = g.body?.details?.timeZone === "America/Winnipeg" ? "America/Regina" : "America/Winnipeg", t0 = sql(`select clock_timestamp()::text`);
    const s = await api(TOWNER, "PUT", "/platform/firm/profile", { version: g.body?.version, timeZone: zone });
    const back = await api(TOWNER, "GET", "/platform/firm/profile");
    ok("R1.92 W2 pass: the profile saves a valid IANA zone and reads it back (one audit line on firm A)", s.status === 200 && back.body?.details?.timeZone === zone
      && sql(`select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.time_zone'`) === zone
      && sql(`select count(*) from audit_event where at > '${t0}' and entity_key = '${A}:platform.time_zone'`) === "1", [s.status, back.body?.details?.timeZone]);
    const bad = await api(TOWNER, "PUT", "/platform/firm/profile", { version: back.body?.version, timeZone: "Mars/Olympus" });
    ok("R1.92 W2 fail: a zone not on the list is refused on its field in words (422) and nothing changes", bad.status === 422 && /time zone/i.test(bad.body?.fields?.timeZone ?? "")
      && (await api(TOWNER, "GET", "/platform/firm/profile")).body?.details?.timeZone === zone, bad.body?.fields);
    // Put the Sample firm's zone back (its offices' first office was written from it; the walk below reads it fresh).
    await api(TOWNER, "PUT", "/platform/firm/profile", { version: (await api(TOWNER, "GET", "/platform/firm/profile")).body?.version, timeZone: g.body?.details?.timeZone });
  }

  // ------------------------------------------------------------------------------------------ W3 Offices by screens
  await p.goto(`${BASE}/platform/offices`); await p.locator("[data-one-office], [data-office-row], [data-offices-refused], [data-offices-error]").first().waitFor({ timeout: 60_000 });
  const before = await p.locator("[data-office-row]").count();
  await p.locator("[data-office-add]").click(); await dialog(p).waitFor();
  await p.locator("[data-office-name]").fill(`Calgary ${run}`);
  await p.locator("[data-office-province]").selectOption("AB");
  const pre = await p.locator("[data-office-zone]").inputValue();
  await shot(p, "w3-add-office-calgary-1440");
  ok("R1.92 W3: adding an office in Alberta shows America/Edmonton pre-filled before saving", pre === "America/Edmonton", { pre });
  await p.locator("[data-office-save]").click(); await dialog(p).waitFor({ state: "detached" });
  await p.locator(`[data-office-row="Calgary ${run}"]`).waitFor({ timeout: 30_000 });
  await p.locator("[data-office-add]").click(); await dialog(p).waitFor();
  await p.locator("[data-office-name]").fill(`Vancouver ${run}`); await p.locator("[data-office-province]").selectOption("BC");
  await p.locator("[data-office-save]").click(); await p.locator(`[data-office-row="Vancouver ${run}"]`).waitFor({ timeout: 30_000 });
  const zoneOf = (n: string) => p.locator(`[data-office-row="${n}"] [data-office-zone-cell]`).innerText();
  const cal = await zoneOf(`Calgary ${run}`), van = await zoneOf(`Vancouver ${run}`);
  await shot(p, "w3-offices-list-1440");
  ok("R1.92 W3: both offices are saved and listed with their own zones: Calgary America/Edmonton, Vancouver America/Vancouver (a first office written when the second arrived)",
    cal.replace(/\s/g, "") === "America/Edmonton" && van.replace(/\s/g, "") === "America/Vancouver" && await p.locator("[data-office-row]").count() === (before ? before + 2 : 3), { cal, van, before });

  // ------------------------------------------------------------------------------------------ W4 office times in each office's zone
  const van0 = ((await api(TOWNER, "GET", "/platform/offices")).body?.offices ?? []).find((o: { name: string }) => o.name === `Vancouver ${run}`);
  const early = ["MON", "TUE", "WED", "THU", "FRI"].map((day) => ({ day, opens: "08:00", closes: "16:00" }));
  const ch = await api(TOWNER, "PATCH", `/platform/offices/${van0?.id}`, { version: van0?.version, businessHours: early });
  await p.reload(); await p.locator(`[data-office-row="Vancouver ${run}"]`).waitFor({ timeout: 30_000 });
  const list = await api(TOWNER, "GET", "/platform/offices");
  const offices = (list.body?.offices ?? []) as { name: string; timeZone: string; businessHours: { day: string; opens: string; closes: string }[]; isFirst: boolean }[];
  const firmZone = sql(`select coalesce((select value #>> '{}' from platform_firm_setting where firm_id = '${A}' and key = 'platform.time_zone'), 'America/Toronto')`);
  const rowsOk = [];
  for (const o of offices.filter((x) => x.name.endsWith(run))) {
    const row = p.locator(`[data-office-row="${o.name}"]`);
    const text = (await row.innerText()).replace(/\s+/g, " ");
    rowsOk.push(text.includes(o.timeZone.split("/").pop()!.replace(/_/g, " ").split(" ")[0]) && o.businessHours.every((h) => text.includes(h.opens)));
  }
  const calText = await p.locator(`[data-office-row="Calgary ${run}"]`).innerText(), vanText = await p.locator(`[data-office-row="Vancouver ${run}"]`).innerText();
  await shot(p, "w4-offices-own-hours-1440");
  ok("R1.92 W4: each office's row shows its own zone and its own opening hours, as the API holds them (Vancouver 08:00-16:00 after its change, Calgary 09:00-17:00; the times are the office's, never converted)",
    ch.status === 200 && rowsOk.length === 2 && rowsOk.every(Boolean) && /08:00.16:00/.test(vanText) && !/08:00/.test(calText) && /09:00.17:00/.test(calText), { ch: ch.status, rowsOk, calText, vanText });
  const first = offices.find((o) => o.isFirst);
  ok("R1.92 W4: the firm's first office keeps the firm's own zone", !!first && first.timeZone === firmZone, { first: first?.timeZone, firmZone });

  // ------------------------------------------------------------------------------------------ W5 a zone not on the list
  const badOffice = await api(TOWNER, "POST", "/platform/offices", { name: `Nowhere ${run}`, province: "AB", timeZone: "Mars/Olympus" });
  ok("R1.92 W5: an office with a zone not on the list is refused in words (422, \"Choose a time zone from the list\") and not saved",
    badOffice.status === 422 && /time zone/i.test(String(badOffice.body?.fields?.timeZone ?? "")) && sql(`select count(*) from platform_office where firm_id = '${A}' and name = 'Nowhere ${run}'`) === "0", [badOffice.status]);

  // ------------------------------------------------------------------------------------------ W6 Licence by screens
  // A body with a pattern, and a value its pattern refuses (never assumed: review m4); else the College and a value no number has.
  const candidates = (pat: string) => [`X-${run}`, `${run}${run}`, "0", "ABC DEF GHI", `R${"9".repeat(12)}`].filter((v) => { try { return !new RegExp(pat).test(v); } catch { return false; } });
  const withPattern = BODIES.bodies.find((b) => b.numberPattern && candidates(b.numberPattern).length);
  const body = withPattern ?? BODIES.bodies.find((b) => b.kind === "CICC")!;
  const type = BODIES.types.find((t) => t.bodies.includes(body.kind))!.label;
  const wrong = withPattern ? candidates(withPattern.numberPattern!)[0] : `X-${run}`;
  await p.goto(`${BASE}/account/licence`); await p.locator("[data-licence-form]").waitFor({ timeout: 60_000 });
  await p.locator("[data-licence-type]").selectOption(type);
  if (await p.locator("[data-licence-body]").inputValue() !== body.name) await p.locator("[data-licence-body]").selectOption(body.name);
  await p.locator("[data-licence-number]").fill(wrong);
  // Wait for the save's own answer, then for the form to settle (review m3: no fixed wait).
  const [put] = await Promise.all([p.waitForResponse((r) => /\/api\/platform\/(staff\/[^/]+\/credential|me\/account)/.test(r.url()) && r.request().method() === "PUT", { timeout: 30_000 }), p.locator("[data-licence-save]").click()]);
  await p.waitForFunction(() => !document.querySelector("[data-licence-save][aria-busy='true']"), undefined, { timeout: 30_000 });
  const formText = await p.locator("[data-licence-form]").innerText();
  await shot(p, "w6-licence-wrong-shape-1440");
  const vWarn = await axe(p);
  ok("R1.92 W6: with the warning showing, the licence page has no WCAG 2.2 A/AA violation (axe), and the number field is not marked invalid (saved, not refused)",
    vWarn.length === 0 && (await p.locator("[data-licence-number]").getAttribute("aria-invalid")) === null, vWarn.map((x) => `${x.id}: ${x.nodes[0]?.target}`));
  const saved = sql(`select licence_number from platform_staff_credential where staff_id = '${OWNER}'`);
  ok("R1.92 W6: a number in the wrong shape is saved, never refused (AG-1-34: an input typo check, not a block)", put.status() === 200 && saved === wrong && !/Not saved/.test(formText), { put: put.status(), saved, formText: formText.slice(0, 200) });
  const answer = await put.json().catch(() => null) as { warning?: unknown } | null;
  const missing = [!withPattern ? "(a) no licensing body in samples/representative-bodies-ca.json carries a numberPattern and the save returns no warning (PF-4c part 2, the next row)" : !answer?.warning ? "(a) the save returns no warning for a number its body's pattern refuses (PF-4c part 2)" : "",
    "(b) the licence form does not show a save's warning on the field (licence-form.tsx drops the answer; no row holds it yet)"].filter((x, i) => x && (i === 0 || !/doesn.t look like/i.test(formText)));
  ok(`R1.92 W6: the wrong shape is WARNED on the field ("doesn't look like …"), never refused.${missing.length ? ` FAILS today: ${missing.join("; ")}` : ""}`,
    !!withPattern && !!answer?.warning && /doesn.t look like/i.test(formText), { body: body.name, pattern: withPattern?.numberPattern ?? null, warning: answer?.warning ?? null });
  const lics = await api(TOWNER, "GET", "/platform/licences");
  await p.goto(`${BASE}/platform/licences`); await p.locator(`[data-licence-row="${OWNER}"]`).waitFor({ timeout: 60_000 });
  ok("R1.92 W6: the record reads back on Licences (screen and API), with its type and body", (await p.locator(`[data-licence-row="${OWNER}"] [data-licence-number-cell]`).innerText()) === wrong
    && (lics.body?.licences ?? []).some((l: { staffId: string; licenceNumber: string; licensingBody: string }) => l.staffId === OWNER && l.licenceNumber === wrong && l.licensingBody === body.name), [lics.status]);
  // On Licences (the Owner editing a record in the right panel): a wrong shape is saved and the panel stays open with the warning.
  await p.locator(`[data-licence-row="${OWNER}"] [data-licence-change]`).click();
  await p.locator('[role="dialog"] [data-licence-number]').fill(`${wrong}9`);
  const [pput] = await Promise.all([p.waitForResponse((r) => /\/credential$/.test(r.url()) && r.request().method() === "PUT", { timeout: 30_000 }), p.locator('[role="dialog"] [data-licence-save]').click()]);
  const panelWarn = await p.locator('[role="dialog"] [data-licence-warning]').innerText({ timeout: 10_000 }).catch(() => "");
  await shot(p, "w6-licences-panel-warning-1440");
  ok("R1.92 W6: on Licences, the Owner's save of a wrong-shape number is saved (200) and the panel stays open with the warning on the number field",
    pput.status() === 200 && /doesn.t look like/i.test(panelWarn) && sql(`select licence_number from platform_staff_credential where staff_id = '${OWNER}'`) === `${wrong}9`, { status: pput.status(), panelWarn });

  // ------------------------------------------------------------------------------------------ W7 sizes and axe
  for (const width of [400, 1024, 1440]) for (const path of ["/platform/offices", "/account/licence"]) {
    const q = await tab(width);
    await q.goto(`${BASE}${path}`); await q.locator("[data-office-row], [data-one-office], [data-licence-form]").first().waitFor({ timeout: 60_000 });
    const v = await axe(q); const fits = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    if (width !== 1440) await shot(q, `w7-${path.split("/").pop()}-${width}`);
    ok(`R1.92 W7: ${path} at ${width} px has no sideways scroll and no WCAG 2.2 A/AA violation (axe)`, fits && v.length === 0, { fits, axe: v.map((x) => `${x.id}: ${x.nodes[0]?.target}`) });
    await q.context().close();
  }
  const k = await tab();
  await k.goto(`${BASE}/account/licence`); await k.locator("[data-licence-form]").waitFor({ timeout: 60_000 });
  const typed = `K-${run}`;
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) { await k.keyboard.press("Tab"); reached = await k.locator("[data-licence-number]").evaluate((el) => el === document.activeElement); }
  if (reached) { await k.keyboard.press("ControlOrMeta+a"); await k.keyboard.type(typed); }
  const [kput] = reached ? await Promise.all([k.waitForResponse((r) => r.request().method() === "PUT" && /credential|me\/account/.test(r.url()), { timeout: 30_000 }), k.keyboard.press("Enter")]) : [null];
  ok("R1.92 W7: keyboard only: Tab reaches the licence number, typing and Enter save it", reached && kput?.status() === 200 && sql(`select licence_number from platform_staff_credential where staff_id = '${OWNER}'`) === typed, { reached, status: kput?.status() });
  await k.context().close();
  ok("R1.92 W7: no page error on any page walked", errs.length === 0, errs.slice(0, 3));
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
