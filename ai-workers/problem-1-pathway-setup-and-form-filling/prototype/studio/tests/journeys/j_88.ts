// J-88 (map row 88, R1.88: the firm reads its own audit log), the acceptance journey written by the qa lane (22 Nov, the tech
// lead's ask) BEFORE AUD-4s (#2916, My account → Activity log) merged: it walks R1.88's done-when as people do, on screens, with
// the database read underneath. AUD-4 (#2339, the firm's read and export, GET /api/platform/audit and …/audit/export) is on
// main; the page is AUD-4s's. Done when (CAPABILITIES R1.88): "An Owner or Admin filters by person, record and date and
// exports; other roles refused".
//   Setup (Sample, on an isolated copy, never :4400): the seeded Sample firm `sample-firm` (Owner user-R; user-T is given the
//   Admin role here; user-O is a Case Officer) and five Sample lines written into its audit_event (as AUD-4's and AUD-4s's own
//   checks do: there is no screen that makes a line on demand), marked "J-88":
//     L1 by the Owner on platform_staff (2 hours ago) · L2 by the Admin on fo_lead j88-lead-1 (1 day ago) · L3 by the Admin on
//     fo_lead j88-lead-2 (3 days ago) · L4 by the Owner on fo_lead j88-lead-1 (20 days ago: outside the default 7 days) ·
//     L5 a line of the other Sample firm (1 hour ago: never shown).
//   W1 the Owner signs in on the sign-in card and opens My account › Activity log from the menu (no address typed).
//   W2 the default list (the last 7 days): the lines shown are firm A's newest, in order, as the database holds them; L4 and L5
//      are not shown.
//   W3 filter by person: Person = the Admin → exactly the Admin's lines in the range (L2, L3 and their sign-in), read against
//      audit_event; fails on the fake (P-606): the same judge on the list before the filter does not hold.
//   W4 filter by record: Advanced › Record type fo_lead, Record reference j88-lead-1 (Person cleared) → exactly L2; fails on the
//      fake (the list before).
//   W5 filter by date: From 30 days ago → L2 and L4 (the record filter kept); fails on the fake (the 7-day list).
//   W6 export: Export CSV, confirm, the file: its data rows are the filtered lines (L2 and L4, not L3), row by row (when and
//      what), its count equals the list's and the X-Export-Rows header, and the export is itself one new `audit.exported` line by the Owner.
//   W7 keyboard: Tab to the first line's When cell and Enter opens it (its change in words and the raw detail).
//   W8 the Admin signs in and finds Activity log in the menu; filters by person (the Owner): exactly the Owner's lines; by
//      record (j88-lead-1, Person back to Everyone): L2; by date, From 30 days back and To 2 days back: only L4 (the To date
//      leaves out L2); exports: the file's rows are those lines, row by row (when and what), and one new audit.exported line
//      by the Admin.
//   W9 other roles refused, each of the four roles without agent/audit:read (Case Officer, Case Manager, Billing and finance,
//      Read-only; the last three are Sample staff added here with that one role): no Activity log entry, the page by its
//      address says "You do not have access to the activity log" (never a blank or a list), the API answers 403 to the read
//      and to the export.
//   W10 375, 1024 and 1440 px: no sideways scroll, no WCAG 2.2 A/AA violation (axe) on the list; no page error.
// Every fail-before-filter judge needs a list that shows lines (an empty or missing list never passes it). The export judges
// match the file to the filtered lines row by row: each row's "When (UTC)" and "What" against audit_event, in order.
// What is a stand-in (said, not hidden): the five lines are Sample rows written to the copy's database; the sign-in is PF-4's
// local stand-in (firm key and work email, PLATFORM_IDENTITY=local); times are UTC as the page shows them until AUD-4's answer
// carries the firm's zone (AUD-4s build notes, C9). The next capability's first step: none named in the row (the walk ends at
// the export's own line). Sample data only; US$0, no model call, live AI off.
// Screenshots: product/screens/J-88/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j88 4471 start --ttl 30 AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on && trap 'zsh studio/tools/isolated.sh j88 4471 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_88.ts j88 4471
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j88", PORT = Number(process.argv[3] ?? 4471), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-88", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const rows = (q: string) => (rawSql(q) ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
const PAGE = "/platform/activity-log", NO_ACCESS = "You do not have access to the activity log";
const DAY = 86_400_000;
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);   // the page's days are UTC today (C9)
const TODAY = ymd(Date.now()), FROM7 = ymd(Date.now() - 7 * DAY), FROM30 = ymd(Date.now() - 30 * DAY);
const after = (d: string) => `'${ymd(Date.parse(`${d}T00:00:00Z`) + DAY)}T00:00:00Z'`;
const api = async (token: string | null, path: string) => { const r = await fetch(`${BASE}/api${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }); return r.status; };

// ------------------------------------------------------------------------------------------------------------ set-up
await fetch(`${BASE}/api/platform/me`).catch(() => undefined);   // the app seeds the Sample firms at start
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const staff = (actor: string) => sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|");
const [OWNER, OWNER_EMAIL, OWNER_NAME] = staff("user-R"), [ADMIN, ADMIN_EMAIL, ADMIN_NAME] = staff("user-T"), [CO, CO_EMAIL] = staff("user-O");
if (sql(`select count(*) from audit_event where summary like 'J-88:%'`) !== "0") { console.error("STOP  this copy already holds J-88's lines: start a fresh copy"); process.exit(2); }
sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${ADMIN}', 'ADMIN', 'seed:j88') on conflict do nothing`);
// The roles without agent/audit:read beyond the Case Officer: one Sample person each, with that one role.
const person = (name: string, role: string) => {
  const email = `j88.${role.toLowerCase()}@sample-firm.example.com`;
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${email}', '${name} (Sample)', 'j88-${role.toLowerCase()}', now()) returning id`);
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${role}', 'seed:j88')`);
  return email;
};
const REFUSED: [string, string][] = [["Case Officer", CO_EMAIL], ["Case Manager", person("Case manager J-88", "CASE_MANAGER")], ["Billing and finance", person("Billing J-88", "BILLING_FINANCE")], ["Read-only", person("Read-only J-88", "READ_ONLY")]];
const WS = sql(`select id from workspace where key = 'platform-audit'`);
const line = (firm: string, actor: string, entity: string, key: string, summary: string, ago: string) =>
  sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id) values (gen_random_uuid(), '${WS}', now() - interval '${ago}', '${actor}', 'j88.sample_change', '${entity}', '${key}', $s$${summary}$s$, '${firm}') returning id`);
const L1 = line(A, `staff:${OWNER}`, "platform_staff", CO, "J-88: the Owner changed a colleague's role (Sample).", "2 hours");
const L2 = line(A, `staff:${ADMIN}`, "fo_lead", "j88-lead-1", "J-88: the Admin changed lead j88-lead-1 (Sample).", "1 day");
const L3 = line(A, `staff:${ADMIN}`, "fo_lead", "j88-lead-2", "J-88: the Admin changed lead j88-lead-2 (Sample).", "3 days");
const L4 = line(A, `staff:${OWNER}`, "fo_lead", "j88-lead-1", "J-88: the Owner changed lead j88-lead-1 (Sample), 20 days ago.", "20 days");
const L5 = line(B, "system:j88", "fo_lead", "j88-lead-1", "J-88: a line of the other firm (Sample).", "1 hour");
ok("J-88 setup: the Sample firm with its Owner, an Admin, a Case Officer and one Sample person each as Case Manager, Billing and finance and Read-only; five Sample lines (four in firm A, one in firm B)", !!A && !!B && !!OWNER && !!ADMIN && !!CO && !!WS && [L1, L2, L3, L4, L5].every(Boolean) && REFUSED.every(([, e]) => !!e));
/** Firm A's lines for a filter, newest first, as AUD-4 orders them (at desc, id desc). */
const dbIds = (where: string, from = FROM7, to = TODAY) => rows(`select id from audit_event where firm_id = '${A}' and at >= '${from}T00:00:00Z' and at < ${after(to)} ${where} order by at desc, id desc`);
const byPerson = (id: string, actor: string) => `and actor in ('staff:${id}', '${actor}')`;
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
/** The lines' "When (UTC)" and "What" as AUD-4 writes them in the file, from audit_event, in the given order. */
const whenWhat = (ids: string[]) => ids.map((id) => sql(`select to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || summary from audit_event where id = '${id}'`));
/** A CSV file's data rows (RFC 4180 quotes), as "When (UTC)|What" (columns 1 and 6 of AUD-4's header). */
function csvWhenWhat(text: string): string[] {
  const out: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((c) => c !== "")) out.push(row); row = []; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.some((c) => c !== "")) out.push(row); }
  return out.slice(1).map((r) => `${r[0]}|${r[5]}`);
}
/** Export CSV, confirm, the file: its rows as "When|What", X-Export-Rows, and how many audit.exported lines by `actor` it made. */
async function exportNow(p: Page, actor: string) {
  const count = () => Number(sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'audit.exported' and actor = 'staff:${actor}'`));
  const before = count();
  const rowsHeader = p.waitForResponse((r) => r.url().includes("/api/platform/audit/export"), { timeout: 20_000 }).then((r) => r.headers()["x-export-rows"], () => undefined);
  await p.locator("[data-audit-export]").click({ timeout: 10_000 });
  await p.locator("[data-audit-export-confirm]").waitFor({ timeout: 10_000 });
  const [download] = await Promise.all([p.waitForEvent("download", { timeout: 30_000 }), p.locator("[data-audit-export-confirm]").click()]);
  const text = readFileSync((await download.path())!, "utf8").replace(/^\uFEFF/, ""), header = await rowsHeader;
  await p.waitForTimeout(500);
  return { rows: csvWhenWhat(text), header, made: count() - before, file: download.suggestedFilename() };
}

// ------------------------------------------------------------------------------------------------------------ helpers
const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 200 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true }).catch(() => undefined);
async function signIn(email: string, width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(`${BASE}/account`);
  await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 20_000 });
  await p.locator("main h1").first().waitFor({ timeout: 20_000 });
  return p;
}
const tokenOf = (p: Page) => p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string | undefined);
/** The list once it shows what its filters ask (not the last answer while the next comes); false if no list appears. */
const settled = (p: Page) => p.locator("[data-audit-list]:not([aria-busy]), [data-audit-no-access], [data-audit-error]").first().waitFor({ timeout: 20_000 }).then(() => p.waitForTimeout(300)).then(() => true, () => false);
const shown = (p: Page) => p.locator("[data-audit-line]").evaluateAll((els) => els.map((e) => e.getAttribute("data-audit-line") ?? ""));
/** Every line the list holds, after Show more until there is none. */
async function allShown(p: Page) { for (let i = 0; i < 20 && await p.locator("[data-audit-more]").count(); i++) { await p.locator("[data-audit-more]").click(); await settled(p); } return shown(p); }
/** A step that throws (a missing control on main) is a FAIL with its reason, and the walk goes on. */
async function step(name: string, fn: () => Promise<{ pass: boolean; detail?: unknown }>) {
  try { const r = await fn(); ok(name, r.pass, r.detail); } catch (e) { ok(name, false, `could not walk it: ${String(e).split("\n")[0].slice(0, 220)}`); }
}
const menuEntry = (p: Page) => p.getByRole("link", { name: "Activity log", exact: true });
async function openLog(p: Page) { if (await menuEntry(p).count()) await menuEntry(p).first().click(); else await p.goto(`${BASE}${PAGE}`); await settled(p); }

try {
  // ---------------------------------------------------------------------------------------------- W1, W2 the Owner
  const o = await signIn(OWNER_EMAIL);
  await step("J-88 W1: the Owner signs in on the sign-in card and finds \"Activity log\" in the My account menu (no address typed)", async () => {
    const n = await menuEntry(o).count(); return { pass: n >= 1, detail: { menuEntries: n } };
  });
  await openLog(o); await shot(o, "w2-default-1440");
  await step("J-88 W2: the page opens on the last 7 days: the lines shown are firm A's newest as audit_event holds them, in order; the 20-day-old line and the other firm's are not shown", async () => {
    const s = await shown(o), db = dbIds("").slice(0, s.length);
    return { pass: s.length > 0 && same(s, db) && s.includes(L1) && !s.includes(L4) && !s.includes(L5), detail: { shown: s.length, sentence: await o.locator("[data-audit-sentence]").innerText().catch(() => null) } };
  });

  // ---------------------------------------------------------------------------------------------- W3 person
  const wantAdmin = dbIds(byPerson(ADMIN, "user-T"));
  await step("J-88 W3 fail (before the filter, P-606): the unfiltered list is not the Admin's lines alone", async () => { const s = await shown(o); return { pass: s.length > 0 && !same(s, wantAdmin), detail: { shown: s.length } }; });
  await step(`J-88 W3: Person = ${ADMIN_NAME} (the Admin) shows exactly the Admin's lines in the range, as audit_event holds them (L2 and L3 among them; nothing of the Owner's)`, async () => {
    await o.locator('[data-audit-filter="person"]').selectOption(ADMIN, { timeout: 10_000 }); await settled(o);
    const s = await allShown(o); return { pass: s.length > 0 && same(s, wantAdmin) && s.includes(L2) && s.includes(L3) && !s.includes(L1), detail: { shown: s.length, want: wantAdmin.length, url: o.url() } };
  });
  await shot(o, "w3-person-1440");

  // ---------------------------------------------------------------------------------------------- W4 record
  const wantRecord = dbIds(`and entity = 'fo_lead' and entity_key = 'j88-lead-1'`);
  await step("J-88 W4 fail (before the filter): the list is not the one record's lines alone", async () => { const s = await shown(o); return { pass: s.length > 0 && !same(s, wantRecord), detail: { shown: s.length } }; });
  await step("J-88 W4: Person back to Everyone, Advanced › Record type fo_lead and Record reference j88-lead-1: exactly that record's line in the range (L2), as audit_event holds it", async () => {
    await o.locator('[data-audit-filter="person"]').selectOption("", { timeout: 10_000 }); await settled(o);
    if (!(await o.locator('[data-audit-filter="entity"]').isVisible())) await o.locator("[data-audit-advanced-toggle]").click({ timeout: 10_000 });
    await o.locator('[data-audit-filter="entity"]').fill("fo_lead", { timeout: 10_000 }); await o.keyboard.press("Enter");
    await o.locator('[data-audit-filter="entityKey"]').fill("j88-lead-1", { timeout: 10_000 }); await o.keyboard.press("Enter"); await settled(o);
    const s = await shown(o); return { pass: same(s, wantRecord) && same(s, [L2]), detail: { shown: s, url: o.url() } };
  });
  await shot(o, "w4-record-1440");

  // ---------------------------------------------------------------------------------------------- W5 date
  const wantDated = dbIds(`and entity = 'fo_lead' and entity_key = 'j88-lead-1'`, FROM30);
  await step("J-88 W5 fail (before the date change): the 7-day list does not hold the 20-day-old line", async () => { const s = await shown(o); return { pass: s.length > 0 && !s.includes(L4) && wantDated.includes(L4), detail: { shown: s.length } }; });
  await step(`J-88 W5: From ${FROM30} (30 days back), the record filter kept: L2 and the 20-day-old L4, newest first, as audit_event holds them`, async () => {
    await o.locator('[data-audit-filter="from"]').fill(FROM30, { timeout: 10_000 }); await settled(o);
    const s = await shown(o); return { pass: same(s, wantDated) && same(s, [L2, L4]), detail: { shown: s, url: o.url() } };
  });
  await shot(o, "w5-date-1440");

  // ---------------------------------------------------------------------------------------------- W6 export
  await step("J-88 W6: Export CSV, confirm: the file's rows are the filtered lines row by row (when and what of L2, then L4; not L3), as many as the list shows and as X-Export-Rows says; the export is one new audit.exported line by the Owner", async () => {
    const listed = await shown(o), e = await exportNow(o, OWNER);
    return { pass: same(listed, [L2, L4]) && same(e.rows, whenWhat(listed)) && e.header === "2" && e.made === 1, detail: { rows: e.rows.length, listed: listed.length, header: e.header, exported: e.made, file: e.file } };
  });
  await shot(o, "w6-exported-1440");

  // ---------------------------------------------------------------------------------------------- W7 keyboard
  await step("J-88 W7 keyboard: Tab reaches the first line's When cell and Enter opens it in place (the change in words and the raw detail)", async () => {
    const first = o.locator("[data-audit-when]").first(); await first.waitFor({ timeout: 10_000 });
    for (let i = 0; i < 60 && !(await first.evaluate((e) => e === document.activeElement)); i++) await o.keyboard.press("Tab");
    await o.keyboard.press("Enter"); await o.locator("[data-audit-open]").first().waitFor({ timeout: 10_000 });
    return { pass: await o.locator("[data-audit-open] [data-audit-raw]").count() === 1 && (await first.getAttribute("aria-expanded")) === "true" };
  });
  await o.context().close();

  // ---------------------------------------------------------------------------------------------- W8 the Admin
  const a = await signIn(ADMIN_EMAIL);
  await step("J-88 W8: the Admin finds \"Activity log\" in the menu", async () => ({ pass: await menuEntry(a).count() >= 1 }));
  await openLog(a);
  const wantOwner = dbIds(byPerson(OWNER, "user-R"));
  await step(`J-88 W8: the Admin filters by Person = ${OWNER_NAME} (the Owner): exactly the Owner's lines in the range, as audit_event holds them (L1 and the Owner's export among them)`, async () => {
    await a.locator('[data-audit-filter="person"]').selectOption(OWNER, { timeout: 10_000 }); await settled(a);
    const s = await allShown(a); return { pass: s.length > 0 && same(s, dbIds(byPerson(OWNER, "user-R"))) && s.includes(L1) && !s.includes(L2), detail: { shown: s.length, want: wantOwner.length } };
  });
  await shot(a, "w8-admin-person-1440");
  const wantAdminRecord = dbIds(`and entity = 'fo_lead' and entity_key = 'j88-lead-1'`);
  await step("J-88 W8 fail (before the record filter): the Admin's list is not the one record's lines alone", async () => { const s = await shown(a); return { pass: s.length > 0 && !same(s, wantAdminRecord), detail: { shown: s.length } }; });
  await step("J-88 W8: the Admin, Person back to Everyone, Advanced › Record type fo_lead and Record reference j88-lead-1: exactly L2, as audit_event holds it", async () => {
    await a.locator('[data-audit-filter="person"]').selectOption("", { timeout: 10_000 }); await settled(a);
    if (!(await a.locator('[data-audit-filter="entity"]').isVisible())) await a.locator("[data-audit-advanced-toggle]").click({ timeout: 10_000 });
    await a.locator('[data-audit-filter="entity"]').fill("fo_lead", { timeout: 10_000 }); await a.keyboard.press("Enter");
    await a.locator('[data-audit-filter="entityKey"]').fill("j88-lead-1", { timeout: 10_000 }); await a.keyboard.press("Enter"); await settled(a);
    const s = await shown(a); return { pass: same(s, wantAdminRecord) && same(s, [L2]), detail: { shown: s } };
  });
  const TO2 = ymd(Date.now() - 2 * DAY), wantAdminDated = dbIds(`and entity = 'fo_lead' and entity_key = 'j88-lead-1'`, FROM30, TO2);
  await step("J-88 W8 fail (before the date change): the Admin's list holds L2 and not L4", async () => { const s = await shown(a); return { pass: s.length > 0 && s.includes(L2) && !s.includes(L4) && same(wantAdminDated, [L4]), detail: { shown: s.length } }; });
  await step(`J-88 W8: the Admin sets From ${FROM30} and To ${TO2} (the record filter kept): only the 20-day-old L4; the To date leaves out yesterday's L2`, async () => {
    await a.locator('[data-audit-filter="from"]').fill(FROM30, { timeout: 10_000 }); await settled(a);
    await a.locator('[data-audit-filter="to"]').fill(TO2, { timeout: 10_000 }); await settled(a);
    const s = await shown(a); return { pass: same(s, wantAdminDated), detail: { shown: s, url: a.url() } };
  });
  await step("J-88 W8: the Admin exports: the file's rows are the filtered lines row by row (L4 only: its when and what), as X-Export-Rows says; one new audit.exported line by the Admin", async () => {
    const listed = await shown(a), e = await exportNow(a, ADMIN);
    return { pass: same(listed, [L4]) && same(e.rows, whenWhat(listed)) && e.header === "1" && e.made === 1, detail: { rows: e.rows, header: e.header, exported: e.made, file: e.file } };
  });
  await shot(a, "w8-admin-exported-1440");
  await a.context().close();

  // ---------------------------------------------------------------------------------------------- W9 other roles
  for (const [role, email] of REFUSED) {
    await step(`J-88 W9 (${role}): no "Activity log" menu entry; the page by its address says "${NO_ACCESS}" (no line shown); the API refuses the read and the export (403)`, async () => {
      const c = await signIn(email);
      try {
        const menu = await menuEntry(c).count();
        await c.goto(`${BASE}${PAGE}`); await c.locator("main").waitFor(); await settled(c); await c.waitForTimeout(500);
        const text = await c.locator("main").innerText(), lines = await c.locator("[data-audit-line]").count(), token = await tokenOf(c);
        const q = `from=${FROM7}T00:00:00Z&to=${TODAY}T23:59:59Z`, read = await api(token ?? null, `/platform/audit?${q}`), exp = await api(token ?? null, `/platform/audit/export?${q}`);
        if (role === "Case Officer") await shot(c, "w9-case-officer-1440");
        return { pass: menu === 0 && text.includes(NO_ACCESS) && lines === 0 && read === 403 && exp === 403, detail: { menu, lines, read, exp, said: text.replace(/\s+/g, " ").slice(0, 120) } };
      } finally { await c.context().close(); }
    });
  }

  // ---------------------------------------------------------------------------------------------- W10 sizes, axe
  for (const width of [375, 1024, 1440]) {
    await step(`J-88 W10: at ${width} px the Activity log has no sideways scroll and no WCAG 2.2 A/AA violation (axe)`, async () => {
      const p = await signIn(OWNER_EMAIL, width);
      try {
        await openLog(p);
        const listed = await p.locator("[data-audit-line]").count(), fits = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        const v = (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
        if (width === 375) await shot(p, "w10-375");
        return { pass: listed > 0 && fits && v.length === 0, detail: { listed, fits, axe: v.map((x) => x.id) } };
      } finally { await p.context().close(); }
    });
  }
  ok("J-88: no page error during the walk", errors.length === 0, errors.slice(0, 3));
} catch (e) {
  ok("J-88: the walk ran to its end", false, String(e).slice(0, 400));
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
