// AUD-4s (concept screens/AUD-4s/concept.md C1-C9 over concept-draft.md; AG-16-26, SA-6-33, SA-2-29, SA-11-34, AG-13-43; R1.88): My
// account → Activity log walked in a browser on an isolated copy (its own database and port, never :4400), with the API and the
// database read underneath. Each case has a pass and a fail (its judge run on a stand-in, where it must fail; the J-77 pattern):
//   W1   the draft's 8-step walk as the Owner, keyboard only (the menu entry, the last 7 days and the sentence, the "ExpatReady staff
//        access" shortcut, a line opened on its When cell with "role: Case Officer → Admin" and the raw before and after, the person
//        who left the firm picked from Person and from an open line, the export's confirm, cancel and file, a range over a year
//        stopped on its field, Show more twice with the focus and the count); then an Admin repeats steps 2, 5 and 6;
//   DW1  no key: the Case Officer has no menu entry and by address the no-access page (never blank), API 403; fail: the Owner;
//   DW1b firm A's session ends, firm B signs in the same tab: no firm A text in the DOM before B's first answer; fail: A's own page;
//   DW2  an empty range names its dates; over a year is stopped on the field and the list stays; a filter the server refuses
//        (forced from the address) is shown in the server's words; fail: a good filter shows no refusal;
//   DW3  export: one confirm, one file, one new top line; Cancel → nothing; DW3b the confirm pressed twice fast → one file, one line;
//        too large (the server's 413, stood in) says so with its numbers; fail: a judge on the file's lines fails on another range;
//   DW5  Show more over 120 lines with equal times: each line once; fail: the judge on a list with one line twice;
//   DW6  an Advanced filter set from the address opens Advanced, shows in the sentence and as a chip; fail: no filter, none of them;
//   DW7  the shortcut clears Person and Done by and says so (C8); fail: with neither set it says nothing;
//   DW8  the keep sentence is AUD-5's field (a stand-in answer's words show instead); with that read failing the list still loads;
//   C9   the zone: UTC named in the sentence today; when the answer carries `timeZone` (stood in) the sentence and the range follow it;
//   axe-core (WCAG 2.2 A/AA) on every state, 375, 1024 and 1440 px with no sideways scroll; fail: axe finds an unlabelled button.
// No integrity pill is drawn and none is tested (C2: row AUD-4s-i). Sample firms and Sample lines only (written straight into the
// copy's audit_event, as check_aud4_firm_log.ts does). US$0, no model call; live AI off.
// Screenshots (deviceScaleFactor 1) in product/screens/AUD-4s/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh aud4s 4442 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_aud4s_activity_log_browser.ts 4442 xr_studio_aud4s
// (the form run-suites.sh reads; it starts and stops the copy itself. By hand, stop it after: isolated.sh aud4s 4442 stop)
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Download, type Locator, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
import { ACCOUNT_SECTIONS, visibleSections } from "../web/src/modules/platform/account-sections.ts";
import { addDays, apiQuery, COPY, dayStart, dayWords, defaults, Page as AuditPage, rangeProblem, sentence, spanWords, today } from "../web/src/modules/platform/audit/contract.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4442), process.argv[3] ?? "xr_studio_aud4s"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "AUD-4s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const rows = (q: string) => (rawSql(q) ?? "").split("\n").filter(Boolean);
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

// ------------------------------------------------------------------------------------------------ pure helpers (Node)
{
  const f = { ...defaults("UTC", Date.UTC(2026, 10, 16, 12)), from: "2026-11-09", to: "2026-11-16" }, none = { people: [], areas: [], actions: [] };
  ok("AUD-4s BR-3: the default range is the last 7 days in the log's zone; From's first moment to the moment after To's last is what the API is asked",
    defaults("UTC", Date.UTC(2026, 10, 16, 12)).from === "2026-11-09" && today("America/Toronto", Date.UTC(2026, 10, 16, 3)) === "2026-11-15"
      && new URLSearchParams(apiQuery(f, "UTC")).get("to") === "2026-11-17T00:00:00.000Z" && dayStart("2026-11-09", "America/Toronto").toISOString() === "2026-11-09T05:00:00.000Z" && dayStart("2026-07-01", "America/Toronto").toISOString() === "2026-07-01T04:00:00.000Z");
  ok("AUD-4s BR-3 pass and fail: one year to the day is read; a day more is stopped with the limit named; To before From and a date that does not exist are stopped",
    rangeProblem({ ...f, from: "2025-11-17", to: "2026-11-16" }, "UTC") === null && rangeProblem({ ...f, from: "2025-11-16", to: "2026-11-16" }, "UTC")?.words === "Pick dates at most one year apart (this range is just over 1 year)."
      && rangeProblem({ ...f, from: "2025-01-17", to: "2026-11-16" }, "UTC")?.words.includes("1 year 10 months") === true && spanWords("2024-11-17", "2026-11-17") === "2 years"
      && rangeProblem({ ...f, to: "2026-11-01" }, "UTC")?.field === "to" && rangeProblem({ ...f, from: "2026-02-31" }, "UTC")?.field === "from");
  ok("AUD-4s BR-12: the sentence names every filter, Advanced included, and the zone once",
    sentence(f, none, "UTC") === "everyone's changes in all areas, from 9 Nov 2026 to 16 Nov 2026 (UTC)"
      && sentence({ ...f, ours: true, area: "team", action: "x.y", actorType: "SYSTEM" }, { ...none, areas: [{ code: "team", words: "Team and settings" }] }, "America/Toronto") === "ExpatReady staff changes in Team and settings, action x.y, done by The system (Advanced), from 9 Nov 2026 to 16 Nov 2026 (Toronto time)");
  ok("AUD-4s break M3 (pure): 31 Dec 9999 is not a day the page reads (it has no next day), so it is stopped on its field and never reaches the date sums; 31 Dec 9998 is read",
    rangeProblem({ ...f, to: "9999-12-31" }, "UTC")?.field === "to" && rangeProblem({ ...f, from: "9999-06-01", to: "9999-12-31" }, "UTC")?.field === "from" && rangeProblem({ ...f, from: "9998-01-01", to: "9998-12-31" }, "UTC") === null);
  ok("AUD-4s break m7 (pure): where a clock change skips midnight (America/Santiago, 6 Sep 2026) the day starts at its first moment, 01:00 local; fail: the day before's midnight rule (Toronto) is unchanged",
    dayStart("2026-09-06", "America/Santiago").toISOString() === "2026-09-06T04:00:00.000Z" && today("America/Santiago", dayStart("2026-09-06", "America/Santiago").getTime()) === "2026-09-06"
      && today("America/Santiago", dayStart("2026-09-06", "America/Santiago").getTime() - 1) === "2026-09-05" && dayStart("2026-11-01", "America/Toronto").toISOString() === "2026-11-01T04:00:00.000Z");
  const page = { lines: [], next: null, people: [], actions: [], areas: [] };
  ok("AUD-4s break round 2 m1 (pure): a time zone the browser cannot use is refused at the edge (the page says it could not load) instead of throwing while it draws; fail: a real zone is read",
    !AuditPage.safeParse({ ...page, timeZone: "Mars/Olympus_Mons" }).success && AuditPage.safeParse({ ...page, timeZone: "America/Toronto" }).success && AuditPage.safeParse(page).success);
  ok("AUD-4s DW1 (C5): the menu entry is one ACCOUNT_SECTIONS line, shown only with agent/audit:read",
    ACCOUNT_SECTIONS.filter((s) => s.path === "/platform/activity-log" && s.label === "Activity log" && s.key === "agent/audit:read").length === 1
      && visibleSections(ACCOUNT_SECTIONS, ["agent/audit:read"]).some((s) => s.path === "/platform/activity-log") && !visibleSections(ACCOUNT_SECTIONS, ["agent/staff:manage"]).some((s) => s.path === "/platform/activity-log"));
}

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");   // the app seeds the Sample firms at start; this only waits for it
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const staff = (actor: string) => sql(`select id from platform_staff where actor_id = '${actor}'`);
const R = staff("user-R"), T = staff("user-T"), O = staff("user-O"), RNAME = sql(`select display_name from platform_staff where id = '${R}'`), TNAME = sql(`select display_name from platform_staff where id = '${T}'`);
if (sql(`select count(*) from audit_event where action like 'aud4s.%'`) !== "0") { console.error("STOP  this copy already holds this check's lines: start a fresh isolated copy"); process.exit(2); }
// An Admin (user-T gains ADMIN) and a Case Officer who left the firm yesterday (deactivated, five lines).
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${T}', 'ADMIN', 'seed:aud4s-check')`);
const LEFT = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', 'case.officer.b@sample-firm.example.com', 'Case officer B (Sample)', 'aud4s-left', now()) returning id`);
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${LEFT}', 'CASE_OFFICER', 'seed:aud4s-check')`);
const WS = sql(`select id from workspace where key = 'platform-audit'`), SESSION = "5e550000-0000-4000-8000-0000000000a4", LONG = `Gave the Admin role to Case officer (Sample). ${"A long note on why, kept in full on the line. ".repeat(13)}`.slice(0, 599) + ".";
const line = (o: { firm: string; actor: string; action: string; entity: string; key?: string; summary: string; ago: string; detail?: unknown; session?: string }) =>
  sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, detail, firm_id, support_session_id) values (gen_random_uuid(), '${WS}', now() - interval '${o.ago}', '${o.actor}', '${o.action}', '${o.entity}', ${o.key ? `'${o.key}'` : "null"},
    $s$${o.summary}$s$, ${o.detail === undefined ? "null" : `$d$${JSON.stringify(o.detail)}$d$::jsonb`}, '${o.firm}', ${o.session ? `'${o.session}'` : "null"}) returning id`);
const ROLE = line({ firm: A, actor: `staff:${R}`, action: "platform.staff.roles_changed", entity: "platform_staff", key: O, summary: LONG, ago: "5 minutes", detail: { role_from: "Case Officer", role_to: "Admin", staffId: O } });
for (const [i, s] of ["Reset two-step sign-in for Second representative (Sample) during a support session.", "Ended the old sign-in sessions of Second representative (Sample) after the reset."].entries())
  line({ firm: A, actor: "system:support", action: "aud4s.support_change", entity: "platform_staff", key: T, summary: s, ago: `${3 - i} hours`, session: SESSION });
for (let i = 0; i < 5; i++) line({ firm: A, actor: `staff:${LEFT}`, action: "aud4s.case_note", entity: "platform_check", key: `left-${i}`, summary: `Case officer B changed a reminder (${i + 1} of 5).`, ago: `${26 + i} hours` });
sql(`update platform_staff set status = 'DEACTIVATED', deactivation_reason = 'left (Sample)' where id = '${LEFT}'`);
// 120 lines at one moment (DW5) and 23 more: with the Owner's, the two support lines and the five above, 151 lines.
sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id) select gen_random_uuid(), '${WS}', date_trunc('second', now() - interval '2 days'), 'system:aud4s', 'aud4s.same_moment', 'msg_check', 'same-' || g, 'Stopped marketing email to one address after a hard bounce (' || g || ').', '${A}' from generate_series(1, 120) g`);
sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id) select gen_random_uuid(), '${WS}', now() - interval '3 days' - (g || ' minutes')::interval, 'system:aud4s', 'aud4s.daily', 'money_check', 'day-' || g, 'Checked the day''s invoices (' || g || ').', '${A}' from generate_series(1, 23) g`);
line({ firm: B, actor: "system:aud4s", action: "aud4s.other_firm", entity: "platform_check", summary: "FIRM-B-ONLY: a line of the other firm.", ago: "1 hour" });
const TOWNER = await signIn("sample-firm", { actorId: "user-R" }), TADMIN = await signIn("sample-firm", { actorId: "user-T" }), TOFF = await signIn("sample-firm", { actorId: "user-O" });
const B_EMAIL = sql(`select email from platform_staff where firm_id = '${B}' and status = 'ACTIVE' order by created_at limit 1`);
const TODAY = today("UTC"), FROM = addDays(TODAY, -7), exported = () => Number(sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'audit.exported'`));
ok("AUD-4s setup: the Sample firms; an Admin, a Case Officer and a Case Officer who left (deactivated); 151 Sample lines in firm A's last 7 days and one in firm B",
  !!A && !!B && !!LEFT && sql(`select count(*) from audit_event where firm_id = '${A}' and (action like 'aud4s.%' or id = '${ROLE}')`) === "151" && exported() === 0);

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true });
  await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const SETTLED = "[data-audit-line], [data-audit-empty], [data-audit-no-access], [data-audit-error]";
const log = async (p: Page, query = "") => { await p.goto(`${BASE}/platform/activity-log${query}`); await p.locator(SETTLED).first().waitFor({ timeout: 60_000 }); };
/** The list once it shows what the filters ask (not the last answer, dimmed while the next comes). */
const settled = async (p: Page) => { await p.locator("[data-audit-list]:not([aria-busy]), [data-audit-no-access], [data-audit-error]").first().waitFor({ timeout: 30_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `aud4s-${name}.png`), fullPage: true });
const axe = async (p: Page, inDialog = false) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include(inDialog ? '[role="dialog"]' : "main").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const ids = (v: { id: string; nodes: { target: unknown }[] }[]) => v.map((x) => `${x.id}: ${x.nodes[0]?.target}`);
const focused = (target: Locator) => target.evaluate((el) => el === document.activeElement).catch(() => false);
const reach = async (p: Page, target: Locator, max = 400) => {
  for (let i = 0; i < max; i++) { if (await focused(target)) return; await p.keyboard.press("Tab"); }
  throw new Error(`not reached by Tab: ${target}`);
};
const lineIds = (p: Page) => p.locator("[data-audit-line]").evaluateAll((els) => els.map((e) => e.getAttribute("data-audit-line") ?? ""));
const whos = (p: Page) => p.locator("[data-audit-who]").evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
const text = (p: Page, sel: string) => p.locator(sel).first().innerText();
const said = (p: Page) => p.locator("[data-audit-said]").textContent();
const menuHas = (p: Page) => p.locator('nav[aria-label="My account"] [data-account-section="/platform/activity-log"]').count();
const downloads = (p: Page) => { const got: Download[] = []; p.on("download", (d) => got.push(d)); return got; };
/** A minimal RFC 4180 reader (quoted cells may hold commas, quotes and line breaks). */
function readCsv(s: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\r" && s[i + 1] === "\n") { row.push(cell); out.push(row); row = []; cell = ""; i++; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}
/** The judges, each also run on a stand-in where it must fail. */
const eachOnce = (list: string[], must: string[]) => new Set(list).size === list.length && must.every((id) => list.includes(id));
const noFirmText = (dom: string, words: string[]) => words.every((w) => !dom.includes(w));
const refusedPage = async (p: Page) => await menuHas(p) === 0 && await p.locator("[data-audit-no-access]").count() === 1 && await p.locator("[data-audit-line], [data-audit-export], [data-audit-filters]").count() === 0;

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- W1 step 1-2
  const p = await tab(TOWNER); const got = downloads(p);
  await p.goto(`${BASE}/home`);
  const entry = p.locator('nav[aria-label="My account"] [data-account-section="/platform/activity-log"]'); await entry.waitFor({ timeout: 60_000 });
  await reach(p, entry); await p.keyboard.press("Enter");
  await p.locator("[data-audit-line]").first().waitFor({ timeout: 60_000 });
  const total = Number(sql(`select count(*) from audit_event where firm_id = '${A}' and at >= '${FROM}T00:00:00Z'`));
  const sentence1 = await text(p, "[data-audit-sentence]"), page1 = await lineIds(p);
  ok("AUD-4s W1 steps 1-2: by keyboard from the My account menu to Activity log: the heading and its subtitle, From = today − 7 days and To = today, 50 lines, and the sentence reading the filters back with the zone (UTC: C9)",
    new URL(p.url()).pathname === "/platform/activity-log" && (await p.locator("main h1").innerText()) === "Activity log" && (await p.locator("main").innerText()).includes(COPY.subtitle)
      && await p.locator('[data-audit-filter="from"]').inputValue() === FROM && await p.locator('[data-audit-filter="to"]').inputValue() === TODAY && page1.length === 50
      && sentence1 === `Showing everyone's changes in all areas, from ${dayWords(FROM)} to ${dayWords(TODAY)} (UTC) — 50 shown, more below.`, { sentence1, n: page1.length, total });
  const main1 = await p.locator("main").innerText();
  ok("AUD-4s BR-1, BR-2, C2: only firm A's lines (never firm B's); no edit, delete or hide control; no integrity pill and no word about integrity",
    !main1.includes("FIRM-B-ONLY") && await p.locator("main button", { hasText: /^(Edit|Delete|Remove|Hide)/ }).count() === 0 && !/intact|tamper|last checked|not checked/i.test(main1));
  const v1 = await axe(p); ok("AUD-4s W1: the list has no WCAG 2.2 A/AA violation", v1.length === 0, ids(v1));
  await shot(p, "1-list-1440");

  // ---------------------------------------------------------------------------------------------- W1 step 3
  const shortcut = p.locator("[data-audit-shortcut]");
  await reach(p, shortcut); await p.keyboard.press("Space"); await p.locator("[data-audit-sessions]").waitFor(); await settled(p);
  const ours = await whos(p), sentence3 = await text(p, "[data-audit-sentence]");
  ok("AUD-4s W1 step 3: Space on \"ExpatReady staff access\" shows only the two support-session lines (ExpatReady support, marked Support session), no firm staff line; aria-pressed is true; the sentence and a chip name the shortcut",
    ours.length === 2 && ours.every((w) => w === "ExpatReady support Support session") && await shortcut.getAttribute("aria-pressed") === "true" && sentence3.startsWith("Showing ExpatReady staff changes in all areas") && sentence3.endsWith("2 lines.")
      && await p.locator('[data-audit-chip="ours"]').count() === 1 && new URL(p.url()).searchParams.get("ours") === "1", { ours, sentence3 });
  const v3 = await axe(p); ok("AUD-4s W1: the shortcut's list has no WCAG 2.2 A/AA violation", v3.length === 0, ids(v3));
  await shot(p, "2-expatready-staff-access-1440");
  await p.keyboard.press("Space"); await p.locator("[data-audit-sessions]").waitFor({ state: "detached" }); await settled(p);
  ok("AUD-4s W1 step 3: Space again: the shortcut is off, aria-pressed false, all lines back", await shortcut.getAttribute("aria-pressed") === "false" && (await lineIds(p)).length === 50 && !new URL(p.url()).searchParams.has("ours"));

  // ---------------------------------------------------------------------------------------------- W1 step 4
  const roleWhen = p.locator(`[data-audit-when="${ROLE}"]`), roleRow = p.locator(`[data-audit-line="${ROLE}"]`);
  await reach(p, roleWhen);
  const inView = await roleWhen.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth; });
  const closedChip = await roleRow.locator("[data-audit-chip-change]").innerText(), oneLine = await roleRow.locator("[data-audit-summary]").evaluate((el) => el.scrollWidth > el.clientWidth && el.clientHeight < 30);
  await p.keyboard.press("Enter");
  const opened = p.locator(`#audit-open-${ROLE}`); await opened.waitFor();
  const change = await opened.locator("[data-audit-change]").innerText(), full = await opened.locator("[data-audit-summary-full]").innerText();
  await reach(p, opened.locator("summary")); await p.keyboard.press("Enter");
  const raw = await opened.locator("[data-audit-detail]").innerText(), rawList = await opened.locator("[data-audit-raw]").innerText();
  ok("AUD-4s W1 step 4 (BR-5, C1): Tab reaches the When button of the Owner's 600-character line, in view when focused; the long summary is one line with the change under it; Enter opens it: \"role: Case Officer → Admin\", the summary in full; under Advanced the raw before and after and the action's code",
    inView && oneLine && closedChip === "role: Case Officer → Admin" && await roleWhen.getAttribute("aria-expanded") === "true" && change === "role: Case Officer → Admin" && full === LONG && full.length === 600
      && raw.includes('"role_from": "Case Officer"') && raw.includes('"role_to": "Admin"') && rawList.includes("platform.staff.roles_changed"), { inView, oneLine, closedChip, change, len: full.length });
  const v4 = await axe(p); ok("AUD-4s W1: an open line has no WCAG 2.2 A/AA violation", v4.length === 0, ids(v4));
  await shot(p, "3-line-open-1440");

  // ---------------------------------------------------------------------------------------------- W1 step 5
  const person = p.locator('[data-audit-filter="person"]'), options = await person.locator("option").allInnerTexts();
  const leftFirst = sql(`select id from audit_event where actor = 'staff:${LEFT}' order by at desc, id desc limit 1`);
  await reach(p, p.locator(`[data-audit-when="${leftFirst}"]`)); await p.keyboard.press("Enter");
  const only = p.locator(`#audit-open-${leftFirst} [data-audit-only-person]`); await reach(p, only); await p.keyboard.press("Enter");
  await p.locator('[data-audit-chip="person"]').waitFor(); await settled(p);
  const byLine = await whos(p), sentence5 = await text(p, "[data-audit-sentence]");
  await p.locator('[data-audit-chip="person"]').focus(); await p.keyboard.press("Enter"); await p.locator('[data-audit-chip="person"]').waitFor({ state: "detached" }); await settled(p);
  const cleared = (await lineIds(p)).length;
  await person.selectOption(LEFT); await p.locator('[data-audit-chip="person"]').waitFor(); await settled(p);
  const byList = await whos(p);
  ok("AUD-4s W1 step 5 (BR-9, BR-14, C3): the Person list is AUD-4's people: active first, the Case Officer who left last and marked \"(left the firm)\" in words; \"Show only this person's changes\" on their open line, and picking them in Person, each give their five lines with their name kept; removing the chip brings every line back",
    options[0] === "Everyone" && options[options.length - 1] === "Case officer B (Sample) (left the firm)" && options.includes(RNAME) && options.slice(1, -1).every((o) => !o.includes("left the firm")) && options.slice(1, -1).join("|") === [...options.slice(1, -1)].sort((x, y) => x.localeCompare(y)).join("|")
      && byLine.length === 5 && byLine.every((w) => w === "Case officer B (Sample) (left the firm)") && sentence5.startsWith("Showing changes by Case officer B (Sample) (left the firm) in all areas") && cleared === 50
      && byList.length === 5 && await person.inputValue() === LEFT, { options, byLine: byLine.length, cleared, byList: byList.length });
  await shot(p, "4-person-left-the-firm-1440");
  await person.selectOption(""); await p.locator('[data-audit-chip="person"]').waitFor({ state: "detached" }); await settled(p);

  // ---------------------------------------------------------------------------------------------- W1 step 6 (DW3)
  const exportBtn = p.locator("[data-audit-export]"), dialog = p.locator('[role="dialog"]');
  await exportBtn.focus(); await p.keyboard.press("Enter"); await dialog.waitFor();
  const ask = await dialog.innerText();
  const vd = await axe(p, true); ok("AUD-4s W1: the export confirm has no WCAG 2.2 A/AA violation", vd.length === 0, ids(vd));
  await shot(p, "5-export-confirm-1440");
  await p.keyboard.press("Escape"); await dialog.waitFor({ state: "detached" });
  const backOnExport = await p.waitForFunction(() => document.activeElement?.hasAttribute("data-audit-export"), undefined, { timeout: 5_000 }).then(() => true, () => false);
  await p.waitForTimeout(500);
  ok("AUD-4s W1 step 6, DW3 fail side: Enter on Export CSV asks once: \"Export these lines as CSV?\", the sentence again, \"This export is recorded in the activity log.\"; Escape: focus back on Export CSV, no file, no new line",
    ask.includes(COPY.exportAsk) && ask.includes(COPY.exportRecorded) && ask.includes(`Everyone's changes in all areas, from ${dayWords(FROM)} to ${dayWords(TODAY)} (UTC).`) && backOnExport && got.length === 0 && exported() === 0, { backOnExport, files: got.length });
  const before = Number(sql(`select count(*) from audit_event where firm_id = '${A}' and at >= '${FROM}T00:00:00Z'`));
  await p.keyboard.press("Enter"); await dialog.waitFor();
  await reach(p, p.locator("[data-audit-export-confirm]"), 10); await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelector("[data-audit-said]")?.textContent?.startsWith("Export saved"), undefined, { timeout: 30_000 });
  const exportLine = sql(`select id from audit_event where firm_id = '${A}' and action = 'audit.exported' order by at desc limit 1`);
  await p.locator(`[data-audit-line="${exportLine}"]`).waitFor({ timeout: 30_000 });
  const csv = readCsv(readFileSync(await got[0].path(), "utf8").replace(/^﻿/, "")), top = (await lineIds(p))[0], topRow = await p.locator("[data-audit-line]").first().innerText();
  const fileHolds = (file: string[][], n: number) => file.length === n + 1 && file[0][0] === "When (UTC)" && file.some((r) => r.includes(LONG)) && !file.some((r) => r.join(" ").includes("FIRM-B-ONLY"));
  ok("AUD-4s W1 step 6, DW3 (BR-6): Enter on the confirm's Export CSV: one file, holding exactly the lines the filters matched (values in full, none of firm B); one new line, the list's top line: the Owner's export; focus stays on Export CSV",
    got.length === 1 && /^activity-log-.*\.csv$/.test(got[0].suggestedFilename()) && fileHolds(csv, before) && exported() === 1 && top === exportLine && topRow.includes(RNAME) && topRow.includes("Activity log exported") && await focused(exportBtn)
      && !fileHolds(csv, before + 1), { files: got.length, name: got[0]?.suggestedFilename(), csv: csv.length, before, topRow: topRow.slice(0, 120) });

  // ---------------------------------------------------------------------------------------------- W1 step 7 (DW2)
  const fromInput = p.locator('[data-audit-filter="from"]'), shownBefore = await lineIds(p);
  await fromInput.fill(addDays(TODAY, -730));
  const fieldError = await p.locator('[data-audit-filters] [role="alert"]').innerText();
  await p.waitForTimeout(600);
  ok("AUD-4s W1 step 7, DW2 (BR-3): From set two years back is stopped on the field with the limit named; the list is unchanged and Export does nothing",
    /^Pick dates at most one year apart \(this range is (just over )?2 years\)\.$/.test(fieldError) && await fromInput.getAttribute("aria-invalid") === "true" && JSON.stringify(await lineIds(p)) === JSON.stringify(shownBefore) && await exportBtn.getAttribute("aria-disabled") === "true", { fieldError });
  await exportBtn.focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
  const noAsk = await dialog.count() === 0;
  const vr = await axe(p); ok("AUD-4s W1: the range error has no WCAG 2.2 A/AA violation; Export asks nothing while the range cannot be read", vr.length === 0 && noAsk, ids(vr));
  await shot(p, "6-range-over-a-year-1440");
  await fromInput.fill(FROM); await p.locator('[data-audit-filters] [role="alert"]').waitFor({ state: "detached" }); await settled(p);

  // ---------------------------------------------------------------------------------------------- W1 step 8 (DW5, BR-10)
  const more = p.locator("[data-audit-more]"), firstPage = await lineIds(p);
  await reach(p, more); await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelectorAll("[data-audit-line]").length === 100, undefined, { timeout: 30_000 });
  const second = await lineIds(p), on51 = await p.waitForFunction((id) => document.activeElement?.getAttribute("data-audit-when") === id, second[50], { timeout: 5_000 }).then(() => true, () => false), said100 = await said(p);
  await reach(p, more); await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelectorAll("[data-audit-line]").length === 150, undefined, { timeout: 30_000 });
  const third = await lineIds(p), on101 = await p.waitForFunction((id) => document.activeElement?.getAttribute("data-audit-when") === id, third[100], { timeout: 5_000 }).then(() => true, () => false), said150 = await said(p);
  ok("AUD-4s W1 step 8: Enter on Show more: focus on line 51 and \"Showing 100 lines\" said; again: focus on line 101 and \"Showing 150 lines\"",
    firstPage.length === 50 && on51 && said100 === "Showing 100 lines" && on101 && said150 === "Showing 150 lines", { on51, said100, on101, said150 });
  await more.click(); await p.locator("[data-audit-more]").waitFor({ state: "detached", timeout: 30_000 });
  const all = await lineIds(p), sameMoment = rows(`select id from audit_event where action = 'aud4s.same_moment'`), inDb = rows(`select id from audit_event where firm_id = '${A}' and at >= '${FROM}T00:00:00Z' order by at desc, id desc`);
  ok("AUD-4s DW5 (BR-10): Show more to the end, across 120 lines of one moment: every line once, in the database's order, and no Show more after the last; fail: the judge on a list with one line twice, and on one missing a line",
    sameMoment.length === 120 && eachOnce(all, sameMoment) && JSON.stringify(all) === JSON.stringify(inDb) && (await text(p, "[data-audit-sentence]")).endsWith(`${all.length} lines.`)
      && !eachOnce([...all, all[60]], sameMoment) && !eachOnce(all.filter((id) => id !== sameMoment[7]), sameMoment), { shown: all.length, inDb: inDb.length });
  const wide1440 = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  ok("AUD-4s W1: at 1440 px nothing scrolls sideways", wide1440);

  // ---------------------------------------------------------------------------------------------- DW3b, too large
  await p.locator("[data-audit-export]").click(); await dialog.waitFor();
  await p.locator("[data-audit-export-confirm]").dblclick({ delay: 5 }).catch(() => undefined);   // the dialog may close under the second press
  await p.waitForFunction(() => document.querySelector("[data-audit-export]")?.textContent === "Export CSV" && document.querySelector("[data-audit-said]")?.textContent?.startsWith("Export saved"), undefined, { timeout: 30_000 });
  await p.waitForTimeout(800);
  ok("AUD-4s DW3b: the confirm's Export CSV pressed twice fast: one more file and one more line, not two", got.length === 2 && exported() === 2, { files: got.length, lines: exported() });
  await p.route("**/api/platform/audit/export?*", (r) => r.fulfill({ status: 413, contentType: "application/problem+json", body: JSON.stringify({ title: "Narrow the dates", detail: "This export would hold 212000 lines; the limit is 100000 (Sample).", code: "EXPORT_TOO_LARGE", rows: 212000, limit: 100000 }) }));
  await p.locator("[data-audit-export]").click(); await dialog.waitFor(); await p.locator("[data-audit-export-confirm]").click();
  const tooLarge = await p.locator("[data-audit-export-error]").innerText(); await p.waitForTimeout(300);
  ok("AUD-4s DW3 (BR-6): the server's 413 (stood in; its own check is check_aud4_firm_log) is said plainly with its numbers; no file, no line",
    tooLarge === "212,000 lines match; one export holds at most 100,000. Narrow the dates and export again." && (await p.locator("main").innerText()).includes(COPY.tooLarge) && got.length === 2 && exported() === 2, { tooLarge });
  const vx = await axe(p); ok("AUD-4s: the too-large notice has no WCAG 2.2 A/AA violation", vx.length === 0, ids(vx));
  await shot(p, "7-export-too-large-1440");
  await p.unroute("**/api/platform/audit/export?*");

  // ---------------------------------------------------------------------------------------------- DW2 empty, refused, load error
  await log(p, `?from=${addDays(TODAY, -200)}&to=${addDays(TODAY, -199)}`);
  const empty = await text(p, "[data-audit-empty]");
  ok("AUD-4s DW2: a range with no line names its dates and says what to try; with no other filter there is nothing to clear",
    empty.includes(`No changes from ${dayWords(addDays(TODAY, -200))} to ${dayWords(addDays(TODAY, -199))}`) && empty.includes(COPY.emptyHelp) && await p.locator("[data-audit-clear]").count() === 0 && await p.locator("[data-audit-line]").count() === 0, { empty });
  const ve = await axe(p); ok("AUD-4s: the empty range has no WCAG 2.2 A/AA violation", ve.length === 0, ids(ve));
  await shot(p, "8-empty-range-1440");
  await log(p, `?ours=1&person=${R}`);
  const emptyBoth = await text(p, "[data-audit-empty]");
  await p.locator("[data-audit-clear]").click(); await p.locator("[data-audit-line]").first().waitFor();
  ok("AUD-4s BR-4: the shortcut with a person names both in the empty list; Clear filters brings the lines back and keeps the dates",
    emptyBoth.includes(`No ExpatReady staff changes by ${RNAME}`) && p.url().endsWith("/platform/activity-log") && (await lineIds(p)).length === 50, { emptyBoth });
  await log(p, "?person=not-a-staff-id");
  const refusal = await text(p, "[data-audit-error]"), direct = await api(TOWNER, "GET", `/platform/audit?from=${FROM}&to=${TODAY}&person=not-a-staff-id`);
  const refusedShown = async (q: Page) => await q.locator("[data-audit-error]").count() === 1 && await q.locator("[data-audit-line]").count() === 0;
  const shownHere = await refusedShown(p);
  await shot(p, "9-filter-refused-1440");
  await log(p, `?person=${R}`);
  ok("AUD-4s DW2: a filter the server refuses, forced from the address, is shown in the server's own words (422), with no line; fail: a good person filter shows lines and no refusal",
    shownHere && direct.status === 422 && refusal === direct.body?.detail && refusal.includes("person") && !(await refusedShown(p)), { refusal, status: direct.status });
  const flaky = await tab(TOWNER); let cut = true;
  await flaky.route("**/api/platform/audit?*", (r) => (cut ? r.abort() : r.continue()));
  await flaky.goto(`${BASE}/platform/activity-log`); await flaky.locator("[data-audit-retry]").waitFor({ timeout: 60_000 });
  const loadError = await flaky.locator("main").innerText(), ver = await axe(flaky);
  await shot(flaky, "10-load-error-1440");
  cut = false; await flaky.locator("[data-audit-retry]").click(); await flaky.locator("[data-audit-line]").first().waitFor({ timeout: 30_000 });
  ok("AUD-4s: a read that fails says \"The activity log could not load\" with Retry (no WCAG violation); Retry loads the lines", loadError.includes(COPY.loadFailed) && loadError.includes(COPY.loadFailedTry) && ver.length === 0 && (await lineIds(flaky)).length === 50, ids(ver));
  await flaky.context().close();

  // ---------------------------------------------------------------------------------------------- DW6, DW7
  await log(p, "?action=audit.exported");
  const adv = p.locator("[data-audit-advanced]"), sentence6 = await text(p, "[data-audit-sentence]");
  const advancedShown = async (q: Page) => await q.locator("[data-audit-advanced]").isVisible() && await q.locator('[data-audit-chip="action"]').count() === 1 && (await text(q, "[data-audit-sentence]")).includes("(Advanced)");
  const shown6 = await advancedShown(p), toggle6 = await text(p, "[data-audit-advanced-toggle]"), n6 = (await lineIds(p)).length;
  const v6 = await axe(p); await shot(p, "11-advanced-from-address-1440");
  await log(p);
  ok("AUD-4s DW6 (BR-12): an Advanced filter set from the address opens Advanced by itself (\"1 set\"), is named in the sentence and as a removable chip, and filters the list (the two exports); no WCAG violation; fail: with no filter Advanced is closed, no chip, no such words",
    shown6 && await adv.count() === 1 && sentence6.includes("action Exported the activity log (Advanced)") && toggle6.includes("(1 set)") && n6 === 2 && v6.length === 0 && !(await advancedShown(p)), { sentence6, toggle6, n6, v: ids(v6) });
  await log(p, `?person=${R}&actorType=FIRM_STAFF`);
  await p.locator("[data-audit-shortcut]").focus(); await p.keyboard.press("Space"); await p.locator("[data-audit-sessions]").waitFor(); await settled(p);
  const said7 = await said(p), url7 = new URL(p.url()).searchParams, chips7 = await p.locator("[data-audit-chip]").evaluateAll((els) => els.map((e) => e.getAttribute("data-audit-chip")));
  await log(p);
  await p.locator("[data-audit-shortcut]").focus(); await p.keyboard.press("Space"); await p.locator("[data-audit-sessions]").waitFor(); await settled(p);
  ok("AUD-4s DW7 (C8): pressing the shortcut with Person and Done by set clears both (the address and the chips) and says \"Person filter cleared.\" in the status; the two support lines show; fail: pressed with neither set, nothing is said",
    said7 === "Person filter cleared. Done by filter cleared." && url7.get("ours") === "1" && !url7.has("person") && !url7.has("actorType") && JSON.stringify(chips7) === '["ours"]' && (await said(p)) === "", { said7, chips7 });

  // ---------------------------------------------------------------------------------------------- review round 1, Minors 1-3
  const LONGKEY = "記録".repeat(30), LONGASCII = "r".repeat(120);
  for (const [w, key] of [[1024, LONGKEY], [375, LONGASCII], [1440, "x".repeat(200)]] as const) {
    const q = await tab(TOWNER, w); await log(q, `?entityKey=${encodeURIComponent(key)}&person=${R}`);
    const fits = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), chipW = await q.locator('[data-audit-chip="entityKey"]').evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth);
    ok(`AUD-4s review m1: a ${key.length}-character record filter's chip is cut short at ${w} px: the page does not scroll sideways`, fits && chipW, { fits, chipW });
    if (w === 1024) {
      // fail: the same judge on the chip with its width limit taken away widens the page
      await q.evaluate(() => { const li = document.querySelector('[data-audit-chip="entityKey"]')!.parentElement!; li.className = ""; li.style.whiteSpace = "nowrap"; li.querySelector("button")!.className = "inline-flex"; li.querySelector("span")!.className = ""; li.querySelector("span")!.textContent = "x".repeat(400); });   // fonts differ between machines: the stand-in is wide on any of them
      ok("AUD-4s review m1 fail: without the width limit the same chip widens the page (the judge can fail)", await q.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1));
    }
    await q.context().close();
  }
  await log(p, `?person=${R}&area=team&action=audit.exported`);
  const areaChip = p.locator('[data-audit-chip="area"]'); await areaChip.focus(); await p.keyboard.press("Enter");
  await p.locator('[data-audit-chip="area"]').waitFor({ state: "detached" });
  const nextChip = await p.waitForFunction(() => document.activeElement?.getAttribute("data-audit-chip") === "action", undefined, { timeout: 5_000 }).then(() => true, () => false);
  await p.locator('[data-audit-chip="action"]').focus(); await p.keyboard.press("Enter"); await p.locator('[data-audit-chip="action"]').waitFor({ state: "detached" });
  const prevChip = await p.waitForFunction(() => document.activeElement?.getAttribute("data-audit-chip") === "person", undefined, { timeout: 5_000 }).then(() => true, () => false);
  await p.keyboard.press("Enter"); await p.locator('[data-audit-chip="person"]').waitFor({ state: "detached" });
  const lastToBox = await p.waitForFunction(() => document.activeElement?.hasAttribute("data-audit-filters"), undefined, { timeout: 5_000 }).then(() => true, () => false);
  await log(p, `?from=${addDays(TODAY, -200)}&to=${addDays(TODAY, -199)}&person=${R}`);
  await p.locator("[data-audit-clear]").focus(); await p.keyboard.press("Enter"); await p.locator('[data-audit-chip="person"]').waitFor({ state: "detached" });
  const clearToBox = await p.waitForFunction(() => document.activeElement?.hasAttribute("data-audit-filters"), undefined, { timeout: 5_000 }).then(() => true, () => false);
  const notBody = await p.evaluate(() => document.activeElement !== document.body);
  ok("AUD-4s review m2: removing a chip by keyboard puts focus on the chip that took its place, else the one before; the last chip and Clear filters put it on the Filters box; fail: focus is never left on the page body",
    nextChip && prevChip && lastToBox && clearToBox && notBody, { nextChip, prevChip, lastToBox, clearToBox });
  await log(p);
  const tip = p.locator("[data-audit-shortcut-tip]");
  const hiddenBefore = !(await tip.isVisible());
  await p.locator("[data-audit-shortcut]").focus(); await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Tab");
  const onFocus = await tip.isVisible(), described = await p.locator("[data-audit-shortcut]").evaluate((el) => document.getElementById(el.getAttribute("aria-describedby") ?? "")?.textContent);
  await p.keyboard.press("Escape"); const escHides = !(await tip.isVisible()), stillFocused = await focused(p.locator("[data-audit-shortcut]"));
  await p.keyboard.press("Shift+Tab"); await p.keyboard.press("Tab"); const backOnRefocus = await tip.isVisible();
  await p.locator("main h1").click(); await p.locator("[data-audit-shortcut]").hover(); const onHover = await tip.isVisible();
  const box = await tip.boundingBox(); await p.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); const stays = await tip.isVisible();
  ok("AUD-4s review m3, R2-1 (WCAG 1.4.13): the shortcut's tip shows on keyboard focus and on hover and is its description; it stays while the pointer moves onto it; Escape hides it without moving focus, and it comes back on the next focus; fail: before focus it is not shown",
    hiddenBefore && onFocus && described === COPY.shortcutTip && escHides && stillFocused && backOnRefocus && onHover && stays, { hiddenBefore, onFocus, described, escHides, stillFocused, backOnRefocus, onHover, stays });
  await p.mouse.move(0, 0);
  await shot(p, "15-shortcut-tip-on-focus-1440");

  // ---------------------------------------------------------------------------------------------- break round 1: M1, M3, m3, m6
  // A name is never broken inside a word: it takes no more lines than it has words, in a column at least 150 px wide.
  const whoFits = async (q: Page) => q.locator("[data-audit-who]").evaluateAll((els) => els.length > 0 && els.every((e) => {
    const name = e.firstElementChild as HTMLElement, range = document.createRange(); range.selectNodeContents(name);
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    return e.getBoundingClientRect().width >= 150 && lines <= (name.textContent ?? "").trim().split(/\s+/).length;
  }));
  for (const query of ["?actorType=FIRM_STAFF", `?person=${R}`]) {
    await log(p, query); await settled(p);
    const pillless = await p.locator("[data-audit-who] .rounded-md").count() === 0, fits = await whoFits(p);
    ok(`AUD-4s break M1: with no Support session pill on screen (${query.slice(1, 12)}…) the Who column keeps its width (at least 150 px) and never breaks a name inside a word`, pillless && fits, { pillless, fits });
  }
  await p.locator("[data-audit-who]").first().evaluate((el) => { document.querySelectorAll("[data-audit-who]").forEach((td) => { td.className = "hidden max-w-48 sm:table-cell"; (td.firstElementChild as HTMLElement).className = "block [overflow-wrap:anywhere]"; }); });
  ok("AUD-4s break M1 fail: the same judge on the column as it was (no width, break anywhere) fails", !(await whoFits(p)));
  for (const query of ["?to=9999-12-31", "?from=9999-06-01&to=9999-12-31"]) {
    await p.goto(`${BASE}/platform/activity-log${query}`); await p.locator('[data-audit-filters] [role="alert"]').waitFor({ timeout: 30_000 });
    const alertWords = await p.locator('[data-audit-filters] [role="alert"]').innerText(), framed = await p.getByRole("button", { name: "Sign out" }).isVisible();
    ok(`AUD-4s break M3: ${query} is stopped on its field ("${alertWords}") and the page, its menu and Sign out stay; nothing is asked of the API`, framed && alertWords.length > 0 && await p.locator("[data-audit-list]").count() === 0, { alertWords, framed });
  }
  await log(p, `?to=${TODAY}`);
  ok("AUD-4s break M3 fail: a real To date shows no field error", await p.locator('[data-audit-filters] [role="alert"]').count() === 0 && (await lineIds(p)).length === 50);
  await p.route("**/api/platform/audit/export?*", (r) => r.fulfill({ status: 413, contentType: "application/problem+json", body: JSON.stringify({ title: "Narrow the dates", code: "EXPORT_TOO_LARGE", rows: 212000, limit: 100000 }) }));
  await p.locator("[data-audit-export]").focus(); await p.keyboard.press("Enter"); await p.locator('[role="dialog"]').waitFor(); await p.locator("[data-audit-export-confirm]").click();
  await p.locator("[data-audit-export-error]").waitFor();
  await p.locator('[data-audit-filter="area"]').selectOption("team"); await settled(p);
  const errGone = await p.locator("[data-audit-export-error]").count() === 0, saidGone = (await said(p)) === "";
  ok("AUD-4s break m3, m6: narrowing the filters takes away the last export's refusal and the last status words; fail side: they showed before the change", errGone && saidGone, { errGone, saidGone });
  await p.unroute("**/api/platform/audit/export?*");

  // ---------------------------------------------------------------------------------------------- DW8, C9
  await log(p);
  const keepApi = await api(TOWNER, "GET", "/platform/keep-periods"), keepShown = await text(p, "[data-audit-keep]");
  const stand = await tab(TOWNER);
  await stand.route("**/api/platform/keep-periods", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ activityLog: "Stand-in: kept for 1 year." }) }));
  await log(stand); const keepStand = await text(stand, "[data-audit-keep]"); await stand.context().close();
  const noKeep = await tab(TOWNER);
  await noKeep.route("**/api/platform/keep-periods", (r) => r.abort());
  await log(noKeep);
  ok("AUD-4s DW8 (C6, BR-8): the keep sentence is AUD-5's field, word for word (a stand-in answer's words show instead: the page types none); with that read failing the sentence is left out and the list still loads",
    keepShown === keepApi.body?.activityLog && keepShown === "Your activity log is kept for 7 years for security." && keepStand === "Stand-in: kept for 1 year." && await noKeep.locator("[data-audit-keep]").count() === 0 && (await lineIds(noKeep)).length === 50, { keepShown, keepStand });
  await noKeep.context().close();
  const zoned = await tab(TOWNER); const asked: string[] = [];
  await zoned.route("**/api/platform/audit?*", async (r) => { asked.push(new URL(r.request().url()).searchParams.get("from") ?? ""); const res = await r.fetch(), j = await res.json(); await r.fulfill({ response: res, json: j.people ? { ...j, timeZone: "America/Toronto" } : j }); });
  await zoned.goto(`${BASE}/platform/activity-log`);
  await zoned.waitForFunction(() => document.querySelector("[data-audit-sentence]")?.textContent?.includes("(Toronto time)"), undefined, { timeout: 30_000 }); await settled(zoned);
  const zFrom = await zoned.locator('[data-audit-filter="from"]').inputValue();
  ok("AUD-4s C9 (BR-11): today every time is UTC and the sentence says so once; when AUD-4's answer carries the firm's zone (stood in: America/Toronto) the sentence names it and the range asked is that zone's days (never the browser's zone)",
    sentence1.includes("(UTC)") && zFrom === addDays(today("America/Toronto"), -7) && asked[asked.length - 1] === dayStart(zFrom, "America/Toronto").toISOString() && /T0[45]:00:00\.000Z$/.test(asked[asked.length - 1]), { asked, zFrom });
  await zoned.context().close();

  // ---------------------------------------------------------------------------------------------- the Admin: steps 2, 5, 6
  const pa = await tab(TADMIN); const gotA = downloads(pa); await log(pa);
  const adminSentence = await text(pa, "[data-audit-sentence]"), adminMenu = await menuHas(pa);
  await pa.locator('[data-audit-filter="person"]').selectOption(LEFT); await pa.locator('[data-audit-chip="person"]').waitFor(); await settled(pa);
  const adminLeft = await whos(pa);
  await pa.locator("[data-audit-export]").focus(); await pa.keyboard.press("Enter"); await pa.locator('[role="dialog"]').waitFor();
  await reach(pa, pa.locator("[data-audit-export-confirm]"), 10); await pa.keyboard.press("Enter");
  await pa.waitForFunction(() => document.querySelector("[data-audit-said]")?.textContent?.startsWith("Export saved"), undefined, { timeout: 30_000 });
  const adminCsv = readCsv(readFileSync(await gotA[0].path(), "utf8").replace(/^﻿/, ""));
  await pa.locator('[data-audit-chip="person"]').click();
  await pa.locator(`[data-audit-line="${sql(`select id from audit_event where firm_id = '${A}' and action = 'audit.exported' and actor = 'staff:${T}'`)}"]`).waitFor({ timeout: 30_000 });
  const adminTop = await pa.locator("[data-audit-line]").first().innerText();
  ok("AUD-4s W1 (the Admin, steps 2, 5, 6; SA-6-33): the Admin has the entry and the same firm-wide list; the person who left gives their five lines; the export of that filter holds those five and is the Admin's own new line (the Owner's lines are seen too)",
    adminMenu === 1 && adminSentence.startsWith("Showing everyone's changes in all areas") && adminLeft.length === 5 && gotA.length === 1 && adminCsv.length === 6 && adminCsv.slice(1).every((r) => r[1] === "Case officer B (Sample)")
      && exported() === 3 && adminTop.includes(TNAME) && adminTop.includes("Activity log exported") && (await pa.locator("main").innerText()).includes(RNAME), { adminLeft: adminLeft.length, csv: adminCsv.length, adminTop: adminTop.slice(0, 100) });
  await pa.context().close();

  // ---------------------------------------------------------------------------------------------- DW1
  const po = await tab(TOFF); await po.goto(`${BASE}/home`); await po.locator('nav[aria-label="My account"]').waitFor({ timeout: 60_000 });
  const noEntryHome = await menuHas(po);
  await log(po);
  const officerPage = await po.locator("main").innerText(), officerApi = await api(TOFF, "GET", `/platform/audit?from=${FROM}&to=${TODAY}`), officerExport = await api(TOFF, "GET", `/platform/audit/export?from=${FROM}&to=${TODAY}`);
  ok("AUD-4s DW1: the Case Officer has no Activity log entry; by address the page says \"You do not have access to the activity log\" and who to ask, never blank, with no filter, line or Export; the API refuses both routes (403); fail: the same judge on the Owner's page",
    noEntryHome === 0 && await refusedPage(po) && officerPage.includes(COPY.noAccess) && officerPage.includes(COPY.noAccessAsk) && officerApi.status === 403 && officerExport.status === 403 && !(await refusedPage(p)), { officerApi: officerApi.status, officerExport: officerExport.status });
  const vo = await axe(po); ok("AUD-4s DW1: the no-access page has no WCAG 2.2 A/AA violation", vo.length === 0, ids(vo));
  await shot(po, "12-no-access-1440"); await po.context().close();

  // ---------------------------------------------------------------------------------------------- widths
  for (const w of [375, 1024, 1440]) {
    const q = await tab(TOWNER, w); await log(q);
    await q.locator(`[data-audit-when="${ROLE}"]`).click(); await q.locator(`#audit-open-${ROLE} summary`).click();
    const v = await axe(q), wide = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), table = await q.locator('[aria-label="Activity log lines, newest first"]').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    ok(`AUD-4s: the list with the Owner's 600-character line open at ${w} px has no WCAG 2.2 A/AA violation, no sideways scroll of the page or of the table`, v.length === 0 && wide && table, { v: ids(v), wide, table });
    if (w !== 1440) await shot(q, `13-list-open-${w}`);
    if (w === 375) {
      await q.locator("[data-audit-export]").click(); await q.locator('[role="dialog"]').waitFor();
      const vq = await axe(q, true), fits = await q.locator('[role="dialog"]').evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; });
      ok("AUD-4s: the export confirm at 375 px fits the screen with no WCAG 2.2 A/AA violation", vq.length === 0 && fits, ids(vq));
      await q.keyboard.press("Escape");
      await q.evaluate(() => { document.querySelector("[data-audit-filters]")!.appendChild(document.createElement("button")); });
      const bad = await axe(q);
      ok("AUD-4s fail: the same axe run finds an unlabelled button we add (the check can fail)", bad.some((x) => x.id === "button-name"), bad.map((x) => x.id));
    }
    await q.context().close();
  }

  // ---------------------------------------------------------------------------------------------- break round 2: R2-M1, R2-M2
  const bare = async (width = 1440) => { const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" }); const q = await ctx.newPage(); q.on("pageerror", (e) => errs.push(e.message)); return q; };
  const signInHere = async (q: Page, firmKey: string, email: string) => { await q.locator("[data-sign-in-card]").waitFor({ timeout: 30_000 }); await q.getByLabel("Firm key").fill(firmKey); await q.getByLabel("Work email").fill(email); await q.getByRole("button", { name: "Sign in" }).click(); };
  const T_EMAIL = sql(`select email from platform_staff where id = '${T}'`);   // the Admin: signing the Owner in here would end the Owner's own tab (one session at a time)
  {
    const q = await bare(); await q.goto(`${BASE}/platform/activity-log?action=audit.exported&person=${R}`); await signInHere(q, "sample-firm", T_EMAIL);
    await q.locator('[data-audit-chip="action"]').waitFor({ timeout: 30_000 }); await settled(q);
    const kept = new URL(q.url()).searchParams, note = await q.locator("[data-audit-filters-cleared]").count();
    ok("AUD-4s break R2-M2: a link with filters opened in a new tab before sign-in (a link from mail) keeps them once the person signs in: chips, address and list follow it, and no \"Filters cleared\" note",
      kept.get("action") === "audit.exported" && kept.get("person") === R && note === 0 && await q.locator('[data-audit-chip="person"]').count() === 1, { search: q.url(), note });
    // R2-M1: firm A's Owner leaves the filtered page for Team, signs out there; firm B's Owner signs in on the same tab and presses Back.
    await q.locator('nav[aria-label="My account"] [data-account-section="/platform/team"]').click(); await q.waitForURL(/\/platform\/team/);
    await q.getByRole("button", { name: "Sign out" }).click(); await signInHere(q, "sample-solo", B_EMAIL);
    await q.locator('nav[aria-label="My account"]').waitFor({ timeout: 30_000 });
    await q.goBack(); await q.locator("[data-audit-filters-cleared]").waitFor({ timeout: 30_000 }); await settled(q);
    const domBack = await q.locator("body").innerText() + q.url(), chipsBack = await q.locator("[data-audit-chip]").count();
    ok("AUD-4s break R2-M1 (BR-13): after firm A signs out on another page and firm B signs in on the same tab, Back to A's filtered Activity log opens it without A's filters (address, chips, fields, sentence) and says the filters were cleared; fail: the same judge on A's own filtered page",
      chipsBack === 0 && new URL(q.url()).search === "" && noFirmText(domBack, [R, RNAME, "audit.exported", "Exported the activity log"]) && domBack.includes("FIRM-B-ONLY")
        && !noFirmText(await p.locator("body").innerText().then(async (t) => (await log(p, `?action=audit.exported&person=${R}`), t + p.url())), [R]), { chipsBack, url: q.url() });
    await q.context().close();
  }
  {
    const z = await tab(TOWNER);
    await z.route("**/api/platform/audit?*", async (r) => { const res = await r.fetch(), j = await res.json(); await r.fulfill({ response: res, json: { ...j, timeZone: "Mars/Olympus_Mons" } }); });
    await z.goto(`${BASE}/platform/activity-log`); await z.locator("[data-audit-error]").waitFor({ timeout: 30_000 });
    ok("AUD-4s break round 2 m1: an answer with a zone the browser cannot use shows \"The activity log could not load\" with the frame, menu and Sign out kept (never a blank app)",
      (await z.locator("main").innerText()).includes(COPY.loadFailed) && await z.getByRole("button", { name: "Sign out" }).isVisible());
    await z.context().close();
  }

  // ---------------------------------------------------------------------------------------------- DW1b (last: it ends the Owner's session)
  await log(p, `?person=${R}&area=team&actorType=FIRM_STAFF`); await p.locator(`[data-audit-when="${ROLE}"]`).click(); await p.locator(`#audit-open-${ROLE}`).waitFor();
  const A_WORDS = [RNAME, R, "Case officer B (Sample)", "Gave the Admin role", "hard bounce", "Activity log exported:"], domA = await p.locator("body").innerText() + p.url();
  await p.getByRole("button", { name: "Sign out" }).click(); await p.locator("[data-sign-in-card]").waitFor({ timeout: 30_000 });
  const domOut = await p.locator("body").innerText(), urlOut = new URL(p.url());
  let release: () => void = () => undefined; const held = new Promise<void>((r) => { release = r; }); let bAsked = 0;
  await p.route("**/api/platform/audit?*", async (r) => { bAsked++; await held; await r.continue(); });
  await p.getByLabel("Firm key").fill("sample-solo"); await p.getByLabel("Work email").fill(B_EMAIL); await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator("[data-audit-loading], [data-audit-list]").first().waitFor({ timeout: 30_000 });
  for (let i = 0; i < 50 && !bAsked; i++) await p.waitForTimeout(100);
  const domWaiting = await p.locator("body").innerText(), loadingB = await p.locator("[data-audit-loading]").count();
  const vl = await axe(p); await shot(p, "14-loading-1440");
  release(); await p.locator("[data-audit-line]").first().waitFor({ timeout: 30_000 });
  const clearedB = await p.locator("[data-audit-filters-cleared]").isVisible();
  const domB = await p.locator("body").innerText() + p.url(), chipsB = await p.locator("[data-audit-chip]").count(), personB = await p.locator('[data-audit-filter="person"]').inputValue();
  ok("AUD-4s DW1b (BR-13): firm A's Owner signs out on the page and firm B's Owner signs in in the same tab: no firm A text in the DOM at the sign-in card, nor while B's first answer is awaited (the loading state, no WCAG violation), nor after it (B's own lines, FIRM-B-ONLY among them); fail: the same judge on firm A's own page",
    noFirmText(domOut, A_WORDS) && urlOut.pathname === "/platform/activity-log" && new URL(p.url()).search === "" && chipsB === 0 && personB === "" && clearedB && bAsked >= 1 && loadingB === 1 && noFirmText(domWaiting, A_WORDS) && domWaiting.includes("Activity log") && vl.length === 0 && noFirmText(domB, A_WORDS) && domB.includes("FIRM-B-ONLY") && !noFirmText(domA, A_WORDS), { bAsked, loadingB, search: urlOut.search, chipsB, v: ids(vl) });
  await p.context().close();
  ok("AUD-4s: no page error in any tab", errs.length === 0, errs);
} catch (e) {
  failed++; console.log(`FAIL  AUD-4s: the check stopped: ${(e as Error).stack?.slice(0, 900)}`);
} finally {
  await browser.close();
}
process.exit(summary() + failed ? 1 : 0);
