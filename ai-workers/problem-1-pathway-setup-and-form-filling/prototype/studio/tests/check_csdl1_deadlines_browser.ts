// CS-DL1 part 1, by screens and through the API (Build Lead C's rulings on #2000): DW7 the stage strip and the stage
// panel show the deadline with its weekday and "(weekend)" / "(closed day)" mark, never moved, and a "Missed" tag once
// the date is past (AG-7-94 r3), at 1440 and 375 px, by keyboard, axe WCAG 2.2 A/AA, no sideways scroll; DW8 the case's
// own firm's calendar through the database's narrow lookup (Build Lead C's ruling after Build Lead A's): firm A's closed day shows on firm A's case, firm
// B's never does, a case whose firm cannot be found gets the defaults, never another firm's calendar; DW9 the one narrow
// lookup platform_firm_calendar (migration csdl1_firm_calendar) from the catalogue. On the configured
// checkpoint's Sample route "Study, then work"; the two Sample firms are seeded here (PF-1's seed) with test closed days
// (labelled test data, no immigration value). Today is the server's clock. No model call (US$0).
// Screenshots (deviceScaleFactor 1) in product/screens/CS-DL1/screenshots/.
//   zsh studio/tools/isolated.sh rt_csdl1b 4472 start && tsx studio/tests/check_csdl1_deadlines_browser.ts 4472 xr_studio_rt_csdl1b
import { createRequire } from "node:module";
import { existsSync, mkdirSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright";
import { AUTHOR, DB, OFFICER, PORT, sql } from "../acceptance/lib/m3.ts";

const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "CS-DL1", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 400)}` : ""}`); return !!c; };
const post = (path: string, body: unknown) => new Promise<{ status: number }>((done) => {
  const data = JSON.stringify(body);
  const rq = request({ host: "127.0.0.1", port: PORT, path: `/api${path}`, method: "POST", timeout: 1_200_000, headers: { "content-type": "application/json", "x-actor": AUTHOR, "content-length": Buffer.byteLength(data) } }, (r) => { r.resume(); r.on("end", () => done({ status: r.statusCode ?? 0 })); });
  rq.on("timeout", () => rq.destroy(new Error("no answer in 20 minutes"))); rq.on("error", () => done({ status: 0 })); rq.end(data);
});
type Deadline = { due: string | null; shown?: string | null; mark?: string | null; missed?: boolean } | null;
const current = async (id: string): Promise<Deadline> => {
  const r = await fetch(`${BASE}/api/runtime/cases/${id}/stages`, { headers: { "x-actor": OFFICER } });
  const b = await r.json() as { stages?: { state: string; deadline: Deadline }[] };
  return b.stages?.find((s) => s.state === "CURRENT")?.deadline ?? null;
};
/** The done-before study stage's end date, set in place (the date the work permit's deadline is worked out from). */
const setDate = (id: string, v: string) => sql(`update case_stage set key_details = jsonb_set(key_details::jsonb, '{stage.permit_valid_until,value}', '"${v}"')::json where case_id = '${id}' and stage_key = 'study'`);

const reset = await post("/demo/reset", { confirm: "RESET" });
const load = reset.status < 300 ? await post("/demo/load", { sample: "configured" }) : reset;
ok("setup: the configured checkpoint loads its Sample route (fails, never skips, when it is missing)", load.status < 300 && Number(sql("select count(*) from route") ?? 0) >= 1, { load: load.status });
if (load.status >= 300) process.exit(1);

// The Sample firms (PF-1's seed; a fresh copy seeds them at start since CS-W1) and their test calendars: firm B
// (sample-solo) closed Mon 8 and Tue 9 Mar 2027, in Tokyo; the officer's firm A (sample-firm) has no calendar setting
// until DW8 gives it Mon 8 Mar 2027. A firm that cannot be found is the unit suite's (check_csdl1_deadlines.ts, DW8).
process.env.DATABASE_URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const { Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/identity/audit.ts");
const { CLOSED_DAYS, TIME_ZONE, writeSetting } = await import("../api/src/platform/settings.ts");
const db = new Db();
const idOf = async (key: string) => (await db.platformFirm.findUnique({ where: { key }, select: { id: true } }))?.id ?? null;
await seedSampleFirms(db);
const W = await platformAuditWorkspaceId(db as never);
const set = (firmId: string, key: string, value: unknown) => writeSetting(db, { firmId, key, value, by: "seed:csdl1", workspaceId: W });
const B = (await idOf("sample-solo"))!;
await set(B, CLOSED_DAYS.key, ["2027-03-08", "2027-03-09"]); await set(B, TIME_ZONE.key, "Asia/Tokyo");

const b = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
const p = await ctx.newPage(); const errs: string[] = [];
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|status of 4\d\d/.test(m.text())) errs.push(m.text()); });
await p.goto(BASE); await p.evaluate((a) => localStorage.setItem("xr-actor", a), OFFICER);
const settle = async () => { await p.waitForFunction(() => !document.querySelector('[aria-busy="true"]') && !document.querySelector(".animate-spin"), null, { timeout: 30_000 }); await p.waitForTimeout(300); };
async function state(name: string, scope: string) {
  await settle();
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    await p.setViewportSize({ width: w, height: h }); await p.locator(scope).first().scrollIntoViewIfNeeded(); await p.waitForTimeout(250);
    await p.screenshot({ path: join(SHOTS, `CSDL1-${name}-${w}.png`) });
    ok(`CS-DL1 DW7 ${w} px: ${name} has no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  }
  const v = (await new AxeBuilder({ page: p }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
  ok(`CS-DL1 DW7 axe: ${name}: no WCAG 2.2 A/AA violation`, v.length === 0, v.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes[0]?.target}`));
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(150);
}

const run = Date.now().toString(36).slice(-4);
try {
  // Open a case on the work permit with the study permit done before (the C6.17 journey), firm A's officer.
  await p.goto(`${BASE}/cases`); await settle(); await p.getByRole("button", { name: "Open a case" }).click();
  const sel = p.getByLabel("Combination (released)"); await sel.selectOption((await sel.locator("option", { hasText: "LMIA" }).first().getAttribute("value"))!);
  await p.getByLabel("Study permit valid until (optional)").fill("2027-02-03");
  await p.getByLabel("Your own reference (optional)").fill(`CSDL1-${run}`); await p.getByLabel("Principal applicant's name").fill("Sample Client A");
  await p.getByRole("button", { name: "Open case" }).click(); await p.waitForURL(/\/cases\/[0-9a-f-]{36}$/); await p.locator("[data-stage-strip]").waitFor();
  const caseId = p.url().split("/").pop()!;
  ok("setup: the case is firm A's (sample-firm)", sql(`select firm_key from runtime_case where id = '${caseId}'`) === "sample-firm");

  // ---------------------------------------------------------------- DW8 the case's own firm's calendar
  setDate(caseId, "2027-03-08");
  const bare = await current(caseId);
  ok("CS-DL1 DW8 fail: firm A with no calendar setting gets the defaults (no closed days), never another firm's calendar (firm B is closed that day)", bare?.shown === "Mon 8 Mar 2027" && bare.mark === null, bare);
  const A = (await idOf("sample-firm"))!;
  await set(A, CLOSED_DAYS.key, ["2027-03-08"]);
  const closed = await current(caseId);
  ok("CS-DL1 DW8 pass: firm A's closed day (Mon 8 Mar 2027) shows \"(closed day)\" on firm A's case through the API; the date is not moved", closed?.due === "2027-03-08" && closed.shown === "Mon 8 Mar 2027 (closed day)" && closed.mark === "closed day", closed);
  setDate(caseId, "2027-03-09");
  const other = await current(caseId);
  ok("CS-DL1 DW8 fail: firm B's closed day (Tue 9 Mar 2027) never shows on firm A's case, nor B's Tokyo zone", other?.shown === "Tue 9 Mar 2027" && other.mark === null, other);
  setDate(caseId, "2027-03-08");

  // ---------------------------------------------------------------- DW9 the lookup, from the catalogue
  const fn = sql(`select r.rolname || '|' || p.prosecdef || '|' || array_to_string(p.proconfig, ',') || '|' || pg_get_function_result(p.oid) || '|' || has_function_privilege('public', p.oid, 'EXECUTE') || '|' || has_function_privilege('xr_app', p.oid, 'EXECUTE') from pg_proc p join pg_roles r on r.oid = p.proowner where p.proname = 'platform_firm_calendar'`);
  ok("CS-DL1 DW9 pass: platform_firm_calendar is owned by xr_wall_reader, SECURITY DEFINER, search_path pinned (pg_temp last), returns only the time zone, hours and closed days; xr_app may run it",
    fn === "xr_wall_reader|true|search_path=pg_catalog, public, pg_temp|TABLE(time_zone jsonb, business_hours jsonb, closed_days jsonb)|false|true", fn);
  ok("CS-DL1 DW9 fail: PUBLIC cannot run it, and it is the only function of that name (no overload)", fn?.split("|")[4] === "false" && sql("select count(*) from pg_proc where proname = 'platform_firm_calendar'") === "1");
  const odd = ["", "x' OR '1'='1", "sample-solo'--", "SAMPLE-FIRM", "sample-firm "].map((k) => sql(`select count(*) from platform_firm_calendar('${k.replace(/'/g, "''")}')`));
  ok("CS-DL1 DW9 fail: an empty key, a key with SQL in it, another case of letters or a trailing space returns no row", odd.every((n) => n === "0"), odd);
  ok("CS-DL1 DW9 pass: firm A's key returns one row, its closed day as stored, its unset zone as null (the app reads the default)",
    sql("select closed_days::text || '|' || coalesce(time_zone::text, 'null') from platform_firm_calendar('sample-firm')") === '["2027-03-08"]|null');

  // ---------------------------------------------------------------- DW7 the words on the screen
  await p.reload(); await p.locator("[data-stage-strip]").waitFor(); await settle();
  const strip1 = await p.locator("[data-stage-strip]").innerText();
  ok("CS-DL1 DW7 pass: the strip shows \"Mon 8 Mar 2027 (closed day)\" in place of the bare date, Sample, not Missed", /Mon 8 Mar 2027 \(closed day\)/.test(strip1) && /Sample/.test(strip1) && !/Missed/.test(strip1), strip1);
  await state("strip-closed-day", "[data-stage-strip]");
  setDate(caseId, "2026-11-01");
  await p.reload(); await p.locator("[data-stage-strip]").waitFor(); await settle();
  const strip2 = await p.locator("[data-stage-strip]").innerText();
  ok("CS-DL1 DW7 pass: a past date shows \"Sun 1 Nov 2026 (weekend)\" and a Missed tag", /Sun 1 Nov 2026 \(weekend\)/.test(strip2) && /Missed/.test(strip2), strip2);
  ok("CS-DL1 DW7 fail: the bare date without its weekday is gone from the strip", !/by 1 Nov 2026/.test(strip2), strip2);
  await state("strip-missed", "[data-stage-strip]");
  await p.locator('[data-stage="work"]').focus(); await p.keyboard.press("Enter"); await p.locator("[data-stage-panel]").waitFor();
  const panel = await p.locator("[data-stage-panel]").innerText();
  ok("CS-DL1 DW7 pass (keyboard): Enter on the current stage opens its panel, whose Deadline shows the weekday, the mark and Missed", /Sun 1 Nov 2026 \(weekend\)/.test(panel) && /Missed/.test(panel), panel.slice(0, 300));
  await state("panel-missed", "[role=dialog]");
  await p.keyboard.press("Escape");
  ok("CS-DL1 DW7: no script error on the page", errs.length === 0, errs);
} finally {
  await b.close(); await db.$disconnect();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
