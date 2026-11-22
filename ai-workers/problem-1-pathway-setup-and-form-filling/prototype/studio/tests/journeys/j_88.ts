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
//   W6 export: Export CSV, confirm, the file: its data rows are the filtered lines (L2 and L4, not L3), its count equals the
//      list's and the X-Export-Rows header, and the export is itself one new `audit.exported` line by the Owner.
//   W7 keyboard: Tab to the first line's When cell and Enter opens it (its change in words and the raw detail).
//   W8 the Admin signs in, finds Activity log in the menu and filters by person (the Owner): exactly the Owner's lines.
//   W9 other roles refused: the Case Officer has no Activity log entry, the page by its address says "You do not have access to
//      the activity log" (never a blank or a list), and the API answers 403 to the read and to the export.
//   W10 400, 1024 and 1440 px: no sideways scroll, no WCAG 2.2 A/AA violation (axe) on the list; no page error.
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
const WS = sql(`select id from workspace where key = 'platform-audit'`);
const line = (firm: string, actor: string, entity: string, key: string, summary: string, ago: string) =>
  sql(`insert into audit_event (id, workspace_id, at, actor, action, entity, entity_key, summary, firm_id) values (gen_random_uuid(), '${WS}', now() - interval '${ago}', '${actor}', 'j88.sample_change', '${entity}', '${key}', $s$${summary}$s$, '${firm}') returning id`);
const L1 = line(A, `staff:${OWNER}`, "platform_staff", CO, "J-88: the Owner changed a colleague's role (Sample).", "2 hours");
const L2 = line(A, `staff:${ADMIN}`, "fo_lead", "j88-lead-1", "J-88: the Admin changed lead j88-lead-1 (Sample).", "1 day");
const L3 = line(A, `staff:${ADMIN}`, "fo_lead", "j88-lead-2", "J-88: the Admin changed lead j88-lead-2 (Sample).", "3 days");
const L4 = line(A, `staff:${OWNER}`, "fo_lead", "j88-lead-1", "J-88: the Owner changed lead j88-lead-1 (Sample), 20 days ago.", "20 days");
const L5 = line(B, "system:j88", "fo_lead", "j88-lead-1", "J-88: a line of the other firm (Sample).", "1 hour");
ok("J-88 setup: the Sample firm with its Owner, an Admin and a Case Officer; five Sample lines (four in firm A, one in firm B)", !!A && !!B && !!OWNER && !!ADMIN && !!CO && !!WS && [L1, L2, L3, L4, L5].every(Boolean));
/** Firm A's lines for a filter, newest first, as AUD-4 orders them (at desc, id desc). */
const dbIds = (where: string, from = FROM7, to = TODAY) => rows(`select id from audit_event where firm_id = '${A}' and at >= '${from}T00:00:00Z' and at < ${after(to)} ${where} order by at desc, id desc`);
const byPerson = (id: string, actor: string) => `and actor in ('staff:${id}', '${actor}')`;
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

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
  await step("J-88 W3 fail (before the filter, P-606): the unfiltered list is not the Admin's lines alone", async () => ({ pass: !same(await shown(o), wantAdmin) }));
  await step(`J-88 W3: Person = ${ADMIN_NAME} (the Admin) shows exactly the Admin's lines in the range, as audit_event holds them (L2 and L3 among them; nothing of the Owner's)`, async () => {
    await o.locator('[data-audit-filter="person"]').selectOption(ADMIN, { timeout: 10_000 }); await settled(o);
    const s = await allShown(o); return { pass: s.length > 0 && same(s, wantAdmin) && s.includes(L2) && s.includes(L3) && !s.includes(L1), detail: { shown: s.length, want: wantAdmin.length, url: o.url() } };
  });
  await shot(o, "w3-person-1440");

  // ---------------------------------------------------------------------------------------------- W4 record
  const wantRecord = dbIds(`and entity = 'fo_lead' and entity_key = 'j88-lead-1'`);
  await step("J-88 W4 fail (before the filter): the list is not the one record's lines alone", async () => ({ pass: !same(await shown(o), wantRecord) }));
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
  await step("J-88 W5 fail (before the date change): the 7-day list does not hold the 20-day-old line", async () => ({ pass: !(await shown(o)).includes(L4) && wantDated.includes(L4) }));
  await step(`J-88 W5: From ${FROM30} (30 days back), the record filter kept: L2 and the 20-day-old L4, newest first, as audit_event holds them`, async () => {
    await o.locator('[data-audit-filter="from"]').fill(FROM30, { timeout: 10_000 }); await settled(o);
    const s = await shown(o); return { pass: same(s, wantDated) && same(s, [L2, L4]), detail: { shown: s, url: o.url() } };
  });
  await shot(o, "w5-date-1440");

  // ---------------------------------------------------------------------------------------------- W6 export
  const exportedBefore = Number(sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'audit.exported' and actor = 'staff:${OWNER}'`));
  await step("J-88 W6: Export CSV, confirm: the file's data rows are the filtered lines (L2 and L4, not L3), as many as the list shows and as X-Export-Rows says; the export is one new audit.exported line by the Owner", async () => {
    const listed = (await shown(o)).length;
    const rowsHeader = o.waitForResponse((r) => r.url().includes("/api/platform/audit/export"), { timeout: 20_000 }).then((r) => r.headers()["x-export-rows"], () => undefined);
    await o.locator("[data-audit-export]").click({ timeout: 10_000 });
    await o.locator("[data-audit-export-confirm]").waitFor({ timeout: 10_000 });
    const [download] = await Promise.all([o.waitForEvent("download", { timeout: 30_000 }), o.locator("[data-audit-export-confirm]").click()]);
    const text = readFileSync((await download.path())!, "utf8").replace(/^﻿/, ""), data = text.split(/\r?\n/).filter(Boolean).slice(1), header = await rowsHeader;
    await o.waitForTimeout(500);
    const exportedAfter = Number(sql(`select count(*) from audit_event where firm_id = '${A}' and action = 'audit.exported' and actor = 'staff:${OWNER}'`));
    return { pass: data.length === listed && listed === 2 && header === "2" && text.includes("lead j88-lead-1 (Sample).") && text.includes("20 days ago") && !text.includes("j88-lead-2") && exportedAfter === exportedBefore + 1,
      detail: { rows: data.length, listed, header, exported: exportedAfter - exportedBefore, file: download.suggestedFilename() } };
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
  await a.context().close();

  // ---------------------------------------------------------------------------------------------- W9 other roles
  const c = await signIn(CO_EMAIL);
  const coMenu = await menuEntry(c).count();
  await c.goto(`${BASE}${PAGE}`); await c.locator("main").waitFor(); await c.waitForTimeout(1500);
  const coText = await c.locator("main").innerText(), coLines = await c.locator("[data-audit-line]").count(), coToken = await tokenOf(c);
  const [readStatus, exportStatus] = [await api(coToken ?? null, `/platform/audit?from=${FROM7}T00:00:00Z&to=${TODAY}T23:59:59Z`), await api(coToken ?? null, `/platform/audit/export?from=${FROM7}T00:00:00Z&to=${TODAY}T23:59:59Z`)];
  ok("J-88 W9 (API): the Case Officer's session is refused the read and the export (403)", readStatus === 403 && exportStatus === 403, { readStatus, exportStatus });
  ok(`J-88 W9 (screen): the Case Officer has no "Activity log" menu entry and the page by its address says "${NO_ACCESS}" (no line shown)`, coMenu === 0 && coText.includes(NO_ACCESS) && coLines === 0, { coMenu, coLines, said: coText.replace(/\s+/g, " ").slice(0, 160) });
  await shot(c, "w9-case-officer-1440");
  await c.context().close();

  // ---------------------------------------------------------------------------------------------- W10 sizes, axe
  for (const width of [400, 1024, 1440]) {
    await step(`J-88 W10: at ${width} px the Activity log has no sideways scroll and no WCAG 2.2 A/AA violation (axe)`, async () => {
      const p = await signIn(OWNER_EMAIL, width);
      try {
        await openLog(p);
        const listed = await p.locator("[data-audit-line]").count(), fits = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        const v = (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
        if (width === 400) await shot(p, "w10-400");
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
