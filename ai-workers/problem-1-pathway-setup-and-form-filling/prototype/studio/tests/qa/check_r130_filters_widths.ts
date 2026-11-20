// qa 11, 20 Nov (/qa capability R1.30, gate A by screens on main 418be9f1a): what J-30 does not walk. J-30 filters Leads
// by owner and arrival day at 1440 px only, and the prospects List by stage and owner at 375 px only; it never uses the
// Source control by screen. Here, at 400, 1024 and 1440 px, as the firm's Owner (a person, by what they see): Leads →
// Source (a checkbox list) narrows the list and is kept in the address and across a reload; Owner; Arrived from/to;
// the List → Stage, Owner, Engaged from/to; no sideways page scroll; axe at each width. Odd input: an unknown source
// and a from-after-to range typed into the address. Ends at R1.31's first step (the prospect's Value panel opens).
// Sample rows only; US$0, no model call. Run from prototype/:
//   zsh studio/tools/isolated.sh qa_r130 4473 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh qa_r130 4473 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/qa/check_r130_filters_widths.ts qa_r130 4473 <shots-dir>
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../../api/src/platform/settings.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "qa_r130", Number(process.argv[3] ?? 4473)];
const SHOTS = process.argv[4] ?? "."; mkdirSync(SHOTS, { recursive: true });
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("R1.30 setup: Sample firm and its front office are seeded", !!A && fo.failed.length === 0, fo.failed);
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "seed:qa-r130", workspaceId: await platformAuditWorkspaceId(db), reason: "qa R1.30: the Owner sees every lead" });
const staff = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
const R = staff("user-R"), O = staff("user-O");
const signIn = async (email: string) => {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
};
const tok = await signIn(R.email);
let n = 0;
const lead = (given: string, owner: string, source: string, daysAgo: number) => {
  const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}${run}', 'Sample', 'qa130.${++n}.${run}@example.org', 'test', now()) returning id`);
  const id = sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at, arrived_at) values (gen_random_uuid(), '${A}', '${p}', 'MANUAL', '${source}', '${owner}', 'test', now(), now() - interval '${daysAgo} days') returning id`);
  return { id, number: sql(`select number from fo_lead where id = '${id}'`) };
};
// Three leads: by source (Referral only Rae), by owner (Oli is the Case Officer's), by day (Old arrived 20 days ago).
const rae = lead("Rae", R.id, "Referral", 1), oli = lead("Oli", O.id, "Phone call", 2), old = lead("Old", R.id, "Phone call", 20);
const engage = async (leadId: string) => {
  const r = await fetch(`${BASE}/api/front-office/leads/${leadId}/engage`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" } });
  return await r.json() as { id: string; number: string };
};
// Engaged leads leave All open, so the prospects come from three more leads of the same shape.
const pRae = await engage(lead("Pia", R.id, "Referral", 1).id), pOli = await engage(lead("Pol", O.id, "Phone call", 2).id), pOld = await engage(lead("Pod", R.id, "Phone call", 20).id);
// One more prospect per width, moved on the board by keyboard only (J-30 does this at 1440 only).
const pKey: Record<number, { id: string; number: string }> = { 1440: await engage(lead("Kay", R.id, "Phone call", 3).id), 1024: await engage(lead("Kim", R.id, "Phone call", 3).id), 400: await engage(lead("Kit", R.id, "Phone call", 3).id) };
sql(`update fo_prospect set created_at = now() - interval '20 days' where id = '${pOld.id}'`);
ok("R1.30 setup: three prospects, one engaged 20 days ago", sql(`select count(*) from fo_prospect where id in ('${pRae.id}','${pOli.id}','${pOld.id}')`) === "3"
  && sql(`select (created_at < now() - interval '19 days') from fo_prospect where id = '${pOld.id}'`) === "t");
const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------------------------------------ the browser
const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const pageAt = async (width: number) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tok);
  return p;
};
const axeOf = async (p: Page, what: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`R1.30 ${what}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)); };
const noSideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const shown = async (p: Page, attr: string, nums: string[]) => { const out: Record<string, number> = {}; for (const x of nums) out[x] = await p.locator(`[${attr}="${x}"]`).count(); return out; };
const settle = (p: Page) => p.waitForLoadState("networkidle").catch(() => undefined);

for (const w of [1440, 1024, 400]) {
  const p = await pageAt(w);
  // ---------------------------------------------------------------------------- Leads: Source, Owner, Arrived
  await p.goto(`${BASE}/front-office/leads?view=all`);
  await p.locator(`[data-lead-row="${old.number}"]`).waitFor();
  await p.locator("[data-source-toggle]").click();
  await p.locator('[data-source="Referral"]').click();   // a person's click (check() reads the box before the address update re-renders it)
  await p.locator('[data-source-chip="Referral"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  await p.keyboard.press("Escape");
  await p.locator(`[data-lead-row="${oli.number}"]`).waitFor({ state: "detached" }); await settle(p);
  const bySrc = await shown(p, "data-lead-row", [rae.number, oli.number, old.number]);
  ok(`R1.30 ${w}px Leads pass: Source → Referral shows only the Referral lead, a chip names it, the address keeps it`,
    bySrc[rae.number] === 1 && bySrc[oli.number] === 0 && bySrc[old.number] === 0 && await p.locator('[data-source-chip="Referral"]').count() === 1 && p.url().includes("source=Referral"), [bySrc, p.url()]);
  ok(`R1.30 ${w}px Leads pass: focus is back on the Source button after Escape`, await p.evaluate(() => document.activeElement?.hasAttribute("data-source-toggle") ?? false));
  await p.screenshot({ path: join(SHOTS, `r130-leads-source-${w}.png`), fullPage: true });
  await p.reload(); await p.locator(`[data-lead-row="${rae.number}"]`).waitFor(); await settle(p);
  ok(`R1.30 ${w}px Leads pass: a reload keeps the Source filter`, (await shown(p, "data-lead-row", [oli.number]))[oli.number] === 0 && await p.locator('[data-source-chip="Referral"]').count() === 1);
  ok(`R1.30 ${w}px Leads pass: no sideways page scroll with filters set`, await noSideways(p));
  await axeOf(p, `${w}px Leads with Source chosen`);
  await p.locator("[data-source-clear]").click();
  await p.locator(`[data-lead-row="${oli.number}"]`).waitFor();
  await p.getByLabel("Owner").selectOption({ label: O.name });
  await p.locator(`[data-lead-row="${rae.number}"]`).waitFor({ state: "detached" });
  await p.locator(`[data-lead-row="${oli.number}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined); await settle(p);
  const byOwner = await shown(p, "data-lead-row", [rae.number, oli.number, old.number]);
  ok(`R1.30 ${w}px Leads pass: Owner = the Case Officer shows only their lead`, byOwner[oli.number] === 1 && byOwner[rae.number] === 0 && byOwner[old.number] === 0, byOwner);
  await p.getByLabel("Owner").selectOption("");
  await p.getByLabel("Arrived from").fill(day(25)); await p.getByLabel("Arrived to").fill(day(15));
  await p.locator(`[data-lead-row="${rae.number}"]`).waitFor({ state: "detached" });
  await p.locator(`[data-lead-row="${old.number}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined); await settle(p);
  const byDay = await shown(p, "data-lead-row", [rae.number, oli.number, old.number]);
  ok(`R1.30 ${w}px Leads pass: Arrived from/to shows only the lead that arrived 20 days ago`, byDay[old.number] === 1 && byDay[rae.number] === 0 && byDay[oli.number] === 0, byDay);
  ok(`R1.30 ${w}px Leads pass: no sideways page scroll with the date filter`, await noSideways(p));

  // ---------------------------------------------------------------------------- List: Stage, Owner, Engaged
  await p.goto(`${BASE}/front-office/pipeline?view=list`);
  await p.locator(`[data-prospect-row="${pOld.number}"]`).waitFor();
  await p.getByLabel("Owner").selectOption({ label: O.name });
  await p.locator(`[data-prospect-row="${pRae.number}"]`).waitFor({ state: "detached" }); await settle(p);
  const lOwner = await shown(p, "data-prospect-row", [pRae.number, pOli.number, pOld.number]);
  ok(`R1.30 ${w}px List pass: Owner = the Case Officer shows only their prospect`, lOwner[pOli.number] === 1 && lOwner[pRae.number] === 0 && lOwner[pOld.number] === 0 && p.url().includes(`owner=${O.id}`), lOwner);
  await p.getByLabel("Owner").selectOption("");
  await p.getByLabel("Engaged from").fill(day(25)); await p.getByLabel("Engaged to").fill(day(15));
  await p.locator(`[data-prospect-row="${pRae.number}"]`).waitFor({ state: "detached" });
  await p.locator(`[data-prospect-row="${pOld.number}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined); await settle(p);
  const lDay = await shown(p, "data-prospect-row", [pRae.number, pOli.number, pOld.number]);
  ok(`R1.30 ${w}px List pass: Engaged from/to shows only the prospect engaged 20 days ago`, lDay[pOld.number] === 1 && lDay[pRae.number] === 0 && lDay[pOli.number] === 0, lDay);
  await p.locator("[data-clear]").click();
  await p.getByLabel("Stage").selectOption({ label: "Consult" }).catch(async () => p.getByLabel("Stage").selectOption("CONSULT"));
  await p.locator("[data-empty]").waitFor().catch(() => undefined); await settle(p);
  const lStage = await shown(p, "data-prospect-row", [pRae.number, pOli.number, pOld.number]);
  ok(`R1.30 ${w}px List pass: Stage = Consult (none there) shows none of the Engaged prospects and says so in words`,
    Object.values(lStage).every((c) => c === 0) && /No prospects match/.test(await p.locator("[data-empty]").innerText().catch(() => "")), lStage);
  ok(`R1.30 ${w}px List pass: no sideways page scroll with filters set`, await noSideways(p));
  await p.screenshot({ path: join(SHOTS, `r130-list-filters-${w}.png`), fullPage: true });
  await axeOf(p, `${w}px List with filters`);

  // ---------------------------------------------------------------------------- Board: keyboard "Move to…"; then Stage
  const k = pKey[w];
  await p.goto(`${BASE}/front-office/pipeline`);
  await p.locator(`[data-stage="ENGAGED"] [data-card="${k.number}"]`).waitFor();
  await p.locator(`[data-card="${k.number}"]`).getByRole("button", { name: /Move to…/ }).focus(); await p.keyboard.press("Enter");
  await p.getByRole("menu").waitFor();
  await p.waitForFunction(() => !!document.activeElement?.closest('[role="menu"]'), null, { timeout: 10_000 });
  const focusedText = () => p.evaluate(() => document.activeElement?.textContent ?? "");
  for (let i = 0; i < 8 && await focusedText() !== "Qualified"; i++) { await p.keyboard.press("ArrowDown"); await p.waitForTimeout(80); }
  const onQualified = await p.waitForFunction(() => document.activeElement?.textContent === "Qualified", null, { timeout: 5_000 }).then(() => true, () => false);
  await p.keyboard.press("Enter");
  const landed = await p.locator(`[data-stage="QUALIFIED"] [data-card="${k.number}"]`).waitFor({ timeout: 10_000 }).then(() => true, () => false);
  const row = sql(`select s.key || '|' || (select count(*) from fo_stage_move m where m.prospect_id = p.id and m.cause = 'PERSON' and m.to_stage_id = p.stage_id and m.from_stage_id is not null) from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${k.id}'`);
  ok(`R1.30 ${w}px Board pass: "Move to…" by keyboard only (focus, Enter, ArrowDown, Enter) moves the card to Qualified; underneath exactly one PERSON move into Qualified`, onQualified && landed && row === "QUALIFIED|1", [onQualified, landed, row]);
  ok(`R1.30 ${w}px Board pass: no sideways page scroll after the move`, await noSideways(p));
  await p.goto(`${BASE}/front-office/pipeline?view=list`);
  await p.locator(`[data-prospect-row="${pOld.number}"]`).waitFor();
  await p.getByLabel("Stage").selectOption("QUALIFIED");
  await p.locator(`[data-prospect-row="${pOld.number}"]`).waitFor({ state: "detached" });
  await p.locator(`[data-prospect-row="${k.number}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined); await settle(p);
  const lQ = await shown(p, "data-prospect-row", [k.number, pRae.number, pOli.number, pOld.number]);
  ok(`R1.30 ${w}px List pass: Stage = Qualified shows the prospect just moved there and none of the Engaged ones`, lQ[k.number] === 1 && lQ[pRae.number] === 0 && lQ[pOli.number] === 0 && lQ[pOld.number] === 0 && p.url().includes("stage=QUALIFIED"), lQ);
  await p.context().close();
}

// ---------------------------------------------------------------------------- odd input typed into the address
const p = await pageAt(1440);
await p.goto(`${BASE}/front-office/leads?view=all&source=no-such-source-${run}`);
await p.locator(`[data-lead-row="${old.number}"]`).waitFor({ timeout: 10_000 }).catch(() => undefined); await settle(p);
const unk = await shown(p, "data-lead-row", [rae.number, oli.number, old.number]);
ok("R1.30 Leads fail-safe: a source typed into the address that the firm does not have is dropped, the whole list shows, no error page",
  Object.values(unk).every((c) => c === 1) && !(await p.getByText(/went wrong|not available/i).count()), [unk, p.url()]);
// The range's own answer (API), then what the List shows once it stops loading (an empty list, words, or an alert).
const tokHdr = { authorization: `Bearer ${tok}` };
const apiRange = await fetch(`${BASE}/api/front-office/prospects?type=INDIVIDUAL&from=${day(1)}&to=${day(20)}`, { headers: tokHdr });
const apiRangeBody = await apiRange.text();
await p.goto(`${BASE}/front-office/pipeline?view=list&from=${day(1)}&to=${day(20)}`);
const outcome = await Promise.race([
  p.locator("[data-empty]").waitFor({ timeout: 20_000 }).then(() => "empty"),
  p.getByRole("alert").first().waitFor({ timeout: 20_000 }).then(() => "alert"),
  p.locator("[data-prospect-row]").first().waitFor({ timeout: 20_000 }).then(() => "rows"),
]).catch(() => "still loading after 20 s");
const words = outcome === "empty" ? await p.locator("[data-empty]").innerText() : outcome === "alert" ? await p.getByRole("alert").first().innerText() : "";
console.log(`NOTE  from after to: API ${apiRange.status} ${apiRangeBody.slice(0, 200)}; the List: ${outcome} "${words}"`);
ok("R1.30 List: Engaged from after Engaged to typed into the address ends in plain words a person can act on (no endless loading, no raw error)",
  (outcome === "empty" || outcome === "alert") && !/Bad Request|BAD_|undefined|\{"|from:/.test(words), [outcome, words, apiRange.status]);   // QA-572: fails today ("from: on or before to.")
await p.screenshot({ path: join(SHOTS, "r130-list-from-after-to.png"), fullPage: true });
// The same range typed by a person into the date fields (min/max on a date field do not stop typing).
for (const [where, from, to, url] of [["List", "Engaged from", "Engaged to", "/front-office/pipeline?view=list"], ["Leads", "Arrived from", "Arrived to", "/front-office/leads?view=all"]] as const) {
  await p.goto(`${BASE}${url}`); await settle(p);
  await p.getByLabel(to).fill(day(20)); await settle(p);
  await p.getByLabel(from).fill(day(1)); await settle(p);
  const t0 = Date.now();
  const end = await Promise.race([
    p.getByRole("alert").first().waitFor({ timeout: 30_000 }).then(() => "alert"),
    p.locator("[data-empty]").waitFor({ timeout: 30_000 }).then(() => "empty"),
    p.locator("[data-prospect-row], [data-lead-row]").first().waitFor({ timeout: 30_000 }).then(() => "rows"),   // once fixed: the list keeps its rows
  ]).catch(() => "still loading after 30 s");
  const secs = Math.round((Date.now() - t0) / 1000);
  const fromVal = await p.getByLabel(from).inputValue();
  const alertText = end === "alert" ? await p.getByRole("alert").first().innerText() : end;
  const fieldInvalid = await p.getByLabel(from).evaluate((e) => (e as HTMLInputElement).validity.valid === false || e.getAttribute("aria-invalid") === "true");
  console.log(`NOTE  ${where}: typed ${from} ${day(1)} after ${to} ${day(20)}: field keeps "${fromVal}", field invalid ${fieldInvalid}, after ${secs} s: "${alertText}"`);
  // QA-572's expected: refused at the field (aria-invalid, a described message in plain words), the list kept, no page alert.
  const fieldAria = await p.getByLabel(from).getAttribute("aria-invalid");
  const describedBy = await p.getByLabel(from).evaluate((e) => (e.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim());
  const listKept = end !== "still loading after 30 s" && end !== "alert";
  ok(`R1.30 ${where}: a ${from} typed after ${to} is refused at the field in plain words, the list kept (QA-572: fails today)`,
    fieldAria === "true" && /on or before|before|after|earlier|later/i.test(describedBy) && !/from:/.test(describedBy) && listKept, [fromVal, fieldInvalid, fieldAria, describedBy, alertText]);
  await p.screenshot({ path: join(SHOTS, `r130-${where.toLowerCase()}-typed-from-after-to.png`), fullPage: true });
}

// ---------------------------------------------------------------------------- QA-533: source on the prospects List / board
// AG-2-23: "The board/list SHALL be filterable by rep, source, … stage, date range". Fails today (no Source control on the
// List or the board; GET /prospects?source= is ignored) unless the tech lead rules that Leads' Source filter is enough.
await p.goto(`${BASE}/front-office/pipeline?view=list`); await p.locator(`[data-prospect-row="${pOld.number}"]`).waitFor();
const listSource = await p.getByLabel(/^Source/).count() + await p.locator("[data-source-toggle]").count();
const apiAll = await (await fetch(`${BASE}/api/front-office/prospects?type=INDIVIDUAL`, { headers: { authorization: `Bearer ${tok}` } })).json() as unknown[];
const apiSrc = await fetch(`${BASE}/api/front-office/prospects?type=INDIVIDUAL&source=Referral`, { headers: { authorization: `Bearer ${tok}` } });
const apiSrcBody = apiSrc.ok ? await apiSrc.json() as unknown[] : [];
ok("R1.30 List (QA-533): the prospects List offers a Source filter, and ?source=Referral narrows the API's answer (fails today)",
  listSource > 0 && apiSrc.ok && apiSrcBody.length > 0 && apiSrcBody.length < apiAll.length, { listSource, all: apiAll.length, status: apiSrc.status, bySource: apiSrcBody.length });

// ---------------------------------------------------------------------------- next capability's first step (R1.31)
await p.goto(`${BASE}/front-office/pipeline?view=list`);
await p.locator(`[data-prospect-row="${pRae.number}"] a`).click();
await p.waitForURL(/\/front-office\/prospects\//);
const valueBtn = p.getByRole("button", { name: /value/i }).first();
await valueBtn.click().catch(() => undefined);
const amount = await p.getByLabel(/Amount/).first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
ok("R1.30 → R1.31 first step: from a filtered List row the prospect opens and its Value panel (Amount) opens", amount, p.url());
await p.screenshot({ path: join(SHOTS, "r130-next-r131-value.png"), fullPage: true });

await browser.close(); await db.$disconnect();
process.exit(summary() ? 1 : 0);   // summary() is the number of FAIL lines
