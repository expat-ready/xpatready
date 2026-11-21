// J-30 (R1.30 lead lists, filters and board; R1.31 stage kinds, Won never by a person's move, totals per currency):
// the journey test of FO-4 part 2a (brief lead-b-briefs/wave1-sales.md row 2; concept screens/fo-4-sales r2), merged in
// the item's last PR (P-728). It walks the real screens against the real API on an isolated copy (its own database and
// port, never :4400; no fake API): Leads with the owner and date filters → Engage → the Pipeline board → "Move to…" by
// keyboard → a stale move → Mark lost and the Lost filter → Convert and Undo convert → the Won column, where the case
// side's "Open a case?" starts (not built on main: the walk ends at the won prospect).
//   A1-A2  the two reads this part adds (each stage's id on the board; the reasons Mark lost offers), pass and fail;
//   W1     Leads: filter by owner and by arrival day, kept in the address (R1.30);
//   W2     DW8: Engage makes a prospect in Engaged; a second Engage says so (BR-7);
//   W3v    FO-2pv (QA-530): the values behind the totals are set through the screen (the Value panel: keyboard only,
//          refused at the field, 375/1024/1440 px, axe), never by SQL;
//   W3     the board: totals per currency, never added (R1.31); DW9: "Move to…" by keyboard only, Won not offered, a
//          move into Won by the API refused, a stale move refused and the screen read again (BR-8);
//   W3d    FO-4 part 2a-ii (P-736): a card is dragged to another stage at 1440, 1024 and 400 px (the stage, the move
//          and the audit line read back); a drag onto Won is refused with rule 3's words; a drag onto Lost opens the
//          loss flow; no drag without the edit key; the keyboard "Move to…" still works;
//   W4     DW13: 200 cards per column page, then Load more; no sideways page scroll at 375, 1024 and 1440 px; axe;
//   W5     DW10: Mark lost without a reason is refused at the field; with one it is found under Stage: Lost (BR-9);
//   W6     DW11: Convert asks yes/no with AG-02's warning; Undo needs a reason and is not offered once a retainer is
//          signed (BR-11); a person without the keys sees no button (BR-10).
// Sample rows only; US$0, no model call. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j30 4446 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j30 4446 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_30.ts j30 4446
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { CURRENCY, EVERYONE_SEES_ALL, writeSetting } from "../../api/src/platform/settings.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j30", Number(process.argv[3] ?? 4446)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "fo-4-sales", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
ok("J-30 setup: both Sample firms and their front office are seeded", !!A && !!B && fo.failed.length === 0, fo.failed);
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "seed:J-30-test", workspaceId: await platformAuditWorkspaceId(db), reason: "J-30: the Owner works every prospect" });
const staff = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
const R = staff("user-R"), O = staff("user-O");   // Owner; Case Officer
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn(R.email), O: await signIn(O.email) };
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api/front-office${path}`, { method, headers: { ...(t ? { authorization: `Bearer ${t}` } : {}), "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
let n = 0;
/** A Sample lead made for this run: `daysAgo` sets the arrival day (the date filter reads it). */
const lead = (given: string, owner: string, daysAgo = 0) => {
  const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}${run}', 'Sample', 'j30.${++n}.${run}@example.org', 'test', now()) returning id`);
  const id = sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at, arrived_at) values (gen_random_uuid(), '${A}', '${p}', 'MANUAL', 'Phone call', '${owner}', 'test', now(), now() - interval '${daysAgo} days') returning id`);
  return { id, personId: p, name: `${given}${run} Sample`, number: sql(`select number from fo_lead where id = '${id}'`) };
};
const ana = lead("Ana", R.id), ben = lead("Ben", O.id, 12), cyd = lead("Cyd", R.id), many = lead("Many", R.id);
const engage = async (leadId: string, t = tok.R) => (await api(t, "POST", `/leads/${leadId}/engage`)).body as { id: string; number: string; version: string };
type Stage = { id?: string; key: string; label: string; kind: string; totals: { currency: string; valueCents: number }[]; prospects: { id: string; number: string }[] };
const boardOf = async (t = tok.R) => (await api(t, "GET", "/pipelines/INDIVIDUAL/board")).body as { totals: { currency: string; valueCents: number }[]; stages: Stage[] };

// ------------------------------------------------------------------- A1-A2: the two reads this part adds (API)
const cyd1 = await engage(cyd.id), b0 = await boardOf();
const UUID = /^[0-9a-f-]{36}$/, stage = (key: string) => b0.stages.find((s) => s.key === key)!;
ok("J-30 A1 pass: every stage of the board carries its id, and a move that names one is saved", b0.stages.length >= 6 && b0.stages.every((s) => UUID.test(s.id ?? ""))
  && (await api(tok.R, "POST", `/prospects/${cyd1.id}/move`, { stageId: stage("QUALIFIED").id, cause: "PERSON", version: cyd1.version })).body?.stage?.key === "QUALIFIED", b0.stages.map((s) => [s.key, s.id]));
const won = await api(tok.R, "POST", `/prospects/${cyd1.id}/move`, { stageId: stage("RETAINER_SIGNED").id, cause: "PERSON", version: "2" });
ok("J-30 A1 fail (R1.31): a person's move into the Won stage is refused (422 WON_BY_EVENT) and the prospect stays where it was", won.status === 422 && won.body?.code === "WON_BY_EVENT" && (await api(tok.R, "GET", `/prospects/${cyd1.id}`)).body?.stage?.key === "QUALIFIED", [won.status, won.body?.code]);
const reasons = await api(tok.O, "GET", "/prospects/lost-reasons"), rs = (reasons.body ?? []) as { id: string; key: string; label: string }[];
ok("J-30 A2 pass: the reasons Mark lost offers are the firm's seven prospect reasons, never a merge's, never a lead-close one", reasons.status === 200 && rs.length === 7 && rs.every((r) => UUID.test(r.id) && r.label) && !rs.some((r) => r.key === "COMBINED_PROSPECT") && rs.some((r) => r.key === "PRICE")
  && sql(`select count(*) from fo_reason where id in (${rs.map((r) => `'${r.id}'`).join(",")}) and firm_id = '${A}' and kind = 'PROSPECT_LOST' and active`) === "7", rs.map((r) => r.key));
ok("J-30 A2 fail: with no session the reasons are refused (401)", (await api(null, "GET", "/prospects/lost-reasons")).status === 401);

// ------------------------------------------------------------------------------------------------ the browser
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const pageAs = async (t: string) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  return p;
};
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `p2a-${name}.png`), fullPage: true });
const axeOf = async (p: Page, name: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`J-30 ${name}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`)); };
const noSideways = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const toast = (p: Page, text: string | RegExp) => p.getByText(text).first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
const owner = await pageAs(tok.R);

// ------------------------------------------------------------------------- W1: Leads, owner and date filters (R1.30)
await owner.goto(`${BASE}/front-office/leads?view=all`);
const rowOf = (l: { number: string }) => owner.locator(`[data-lead-row="${l.number}"]`);
await rowOf(ben).waitFor();
await owner.getByLabel("Owner").selectOption({ label: O.name });
await rowOf(ana).waitFor({ state: "detached" }); await rowOf(ben).waitFor();
ok("J-30 W1 pass: Owner = the Case Officer shows their lead and not the Owner's; the choice is in the address", await rowOf(ben).count() === 1 && await rowOf(ana).count() === 0 && owner.url().includes(`owner=${O.id}`), owner.url());
await owner.getByLabel("Owner").selectOption("");
const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
await owner.getByLabel("Arrived from").fill(day(14)); await owner.getByLabel("Arrived to").fill(day(10));
await rowOf(ana).waitFor({ state: "detached" }); await rowOf(ben).waitFor();
await shot(owner, "leads-filters-1440");
await owner.reload(); await rowOf(ben).waitFor();
ok("J-30 W1 pass: Arrived from/to shows only the lead that arrived 12 days ago, and a reload keeps the filter", await rowOf(ben).count() === 1 && await rowOf(ana).count() === 0 && await owner.getByLabel("Arrived from").inputValue() === day(14));
await owner.locator("[data-chip=mine]").click();
ok("J-30 W1 fail: under Mine no Owner filter is offered (it is All open's)", await owner.getByLabel("Owner").waitFor({ state: "detached", timeout: 5_000 }).then(() => true, () => false));
await axeOf(owner, "W1 Leads with filters");

// ---------------------------------------------------------------------------------------- W2: Engage (DW8, BR-7)
await owner.goto(`${BASE}/front-office/leads/${ana.id}`);
await owner.getByRole("button", { name: "Engage", exact: true }).focus(); await owner.keyboard.press("Enter");
await owner.getByText("Nothing is sent to").waitFor();
await shot(owner, "engage-panel-1440");
await owner.keyboard.press("Escape");
const backOnEngage = await owner.waitForFunction(() => document.activeElement?.textContent === "Engage", null, { timeout: 5_000 }).then(() => true, () => false);
await owner.keyboard.press("Enter"); await owner.getByText("Nothing is sent to").waitFor();
await owner.getByRole("button", { name: "Engage as Individual" }).dblclick();   // a double click sends one request (review M1)
await owner.waitForURL(/\/front-office\/prospects\//);
await owner.locator("[data-stage-now]").waitFor();
const anaId = owner.url().split("/").pop()!, anaRow = sql(`select number || '|' || owner_staff_id from fo_prospect where id = '${anaId}'`).split("|");
ok("J-30 W2 DW8 pass: Engage makes one prospect in Engaged (a double click too), owned by the lead's owner, and opens it; Escape had returned focus to Engage", backOnEngage && await owner.locator("[data-stage-now]").innerText() === "Engaged" && anaRow[1] === R.id && sql(`select count(*) from fo_prospect where lead_id = '${ana.id}'`) === "1", anaRow);
await owner.goto(`${BASE}/front-office/leads/${ana.id}`);
await owner.getByRole("button", { name: "Engage", exact: true }).click();
const warned = await owner.locator("[data-engaged-already]").isVisible();
await owner.getByRole("button", { name: "Engage as Individual" }).click();
ok("J-30 W2 DW8 pass: a second Engage is allowed and says so, before and after (\"already had prospect …\")", warned && await toast(owner, new RegExp(`This lead already had prospect ${anaRow[0]}`)) && sql(`select count(*) from fo_prospect where lead_id = '${ana.id}'`) === "2");
const ana2 = sql(`select id from fo_prospect where lead_id = '${ana.id}' and id <> '${anaId}'`);

// ------------------------------------------------------------- W3: the board, totals per currency, Move to… (DW9)
// FO-2pv (QA-530): the values are set through the screen, the Value panel on each prospect, never by SQL.
const valueOf = (id: string) => sql(`select coalesce(value_cents::text, 'null') || '|' || currency from fo_prospect where id = '${id}'`);
await owner.goto(`${BASE}/front-office/prospects/${anaId}`);
await owner.getByRole("button", { name: /^Set value: / }).focus(); await owner.keyboard.press("Enter");
await owner.getByLabel("Amount").waitFor();
const firstCurrency = await owner.getByLabel("Currency").locator("option").first().getAttribute("value"), currencyCount = await owner.getByLabel("Currency").locator("option").count();
await owner.keyboard.type("12.345"); await owner.keyboard.press("Enter");
ok("J-30 W3v fail (FO-2pv): three decimal places are refused at the Amount field in the brief's words, and nothing is saved", await owner.getByRole("alert").filter({ hasText: "Enter an amount of 0 or more, with at most 2 decimal places." }).isVisible() && valueOf(anaId) === "null|CAD", valueOf(anaId));
await axeOf(owner, "W3v the Value panel");
for (const w of [375, 1024, 1440]) { await owner.setViewportSize({ width: w, height: 900 }); ok(`J-30 W3v pass: the Value panel at ${w} px has no sideways page scroll`, await noSideways(owner)); }
await shot(owner, "value-panel-1440");
await owner.getByLabel("Amount").fill("5000"); await owner.keyboard.press("Enter");
await owner.locator("[data-value]", { hasText: "CAD" }).waitFor();
ok("J-30 W3v pass (FO-2pv, R1.31): by keyboard only (Enter, type, Enter) the value is saved as CAD 5,000: the prospect's own currency is offered first among the fixed list, the screen shows it, 500000 cents are stored", firstCurrency === "CAD" && currencyCount > 100 && (await owner.locator("[data-value]").innerText()).replace(/\s/g, " ") === "CAD 5,000" && valueOf(anaId) === "500000|CAD", [firstCurrency, currencyCount, valueOf(anaId)]);
// An amount with cents is shown exactly, never rounded (review M1): 5000.50, then back to 5000 for the totals below.
await owner.getByRole("button", { name: /^Change value: / }).click(); await owner.getByLabel("Amount").fill("5000.50"); await owner.getByRole("button", { name: "Save value" }).click();
const exact = await toast(owner, /The value of .* is CAD.5,000\.50\./), shownExact = (await owner.locator("[data-value]", { hasText: "5,000.50" }).waitFor({ timeout: 10_000 }).then(() => true, () => false));
await owner.getByRole("button", { name: /^Change value: / }).click(); const reopened = await owner.getByLabel("Amount").inputValue();
await owner.getByLabel("Amount").fill("5000"); await owner.getByRole("button", { name: "Save value" }).click(); await owner.locator("[data-value]", { hasText: /CAD.5,000$/ }).waitFor();
ok("J-30 W3v pass: CAD 5000.50 is shown as CAD 5,000.50 in the toast and on the Value row (not rounded to 5,001), and the panel reopens on 5000.50", exact && shownExact && reopened === "5000.50" && valueOf(anaId) === "500000|CAD", [exact, shownExact, reopened]);
// The firm's default currency (the setting platform.currency) comes first for a prospect with no value yet (review M2):
// with the firm set to USD the second prospect is saved in USD without touching the Currency control; then back to CAD.
const ws30 = await platformAuditWorkspaceId(db), firmCurrency = (value: "CAD" | "USD") => writeSetting(db, { firmId: A, key: CURRENCY.key, value, by: "seed:J-30-test", workspaceId: ws30, reason: "J-30: the firm's default currency" });
await firmCurrency("USD");
await owner.goto(`${BASE}/front-office/prospects/${ana2}`); await owner.getByRole("button", { name: /^Set value: / }).click();
const preselected = await owner.getByLabel("Currency").inputValue();
await owner.getByLabel("Amount").fill("3000.00"); await owner.getByRole("button", { name: "Save value" }).click(); await owner.locator("[data-value]", { hasText: "USD" }).waitFor();
await firmCurrency("CAD");
await owner.goto(`${BASE}/front-office/prospects/${cyd1.id}`); await owner.getByRole("button", { name: /^Set value: / }).click();
const backToCad = await owner.getByLabel("Currency").inputValue();
await owner.getByLabel("Amount").fill("1200"); await owner.getByRole("button", { name: "Save value" }).click(); await owner.locator("[data-value]", { hasText: "CAD" }).waitFor();
ok("J-30 W3v pass: with the firm's default currency set to USD a new value is offered and saved in USD (3,000) untouched; set back to CAD the next one is offered CAD (1,200); each kept in its own currency, nothing converted", preselected === "USD" && backToCad === "CAD" && valueOf(ana2) === "300000|USD" && valueOf(cyd1.id) === "120000|CAD", [preselected, backToCad, valueOf(ana2), valueOf(cyd1.id)]);
await owner.goto(`${BASE}/front-office/pipeline`);
const card = (num: string) => owner.locator(`[data-card="${num}"]`), inStage = (key: string, num: string) => owner.locator(`[data-stage="${key}"] [data-card="${num}"]`);
await inStage("ENGAGED", anaRow[0]).waitFor();
const openTotals = await owner.locator("[data-open-totals] [data-totals]").innerText(), engagedTotals = await owner.locator('[data-stage="ENGAGED"] [data-totals]').innerText();
ok("J-30 W3 pass (R1.31): the board shows the open totals per currency side by side (CAD 6,200 · USD 3,000) and the Engaged column's own (CAD 5,000 · USD 3,000)", /CAD\s6,200 · USD\s3,000/.test(openTotals) && /CAD\s5,000 · USD\s3,000/.test(engagedTotals), [openTotals, engagedTotals]);
ok("J-30 W3 fail (R1.31): no amount on the board is a sum across currencies (9,200 or 8,000 appears nowhere)", !/9,200|8,000/.test(await owner.locator("main, body").first().innerText()));
await shot(owner, "board-1440");
await card(anaRow[0]).getByRole("button", { name: /Move to…/ }).focus(); await owner.keyboard.press("Enter");
await owner.getByRole("menu").waitFor();
const offered = await owner.getByRole("menuitem").allInnerTexts();
ok("J-30 W3 DW9 pass: \"Move to…\" offers the other open stages only: Won, Lost and Nurture are not offered, and the menu says how Won is set", offered.includes("Consult") && !offered.some((x) => /Won|Lost|Nurture|Engaged/.test(x)) && await owner.getByRole("menu").getByText("Won is set when the retainer is signed, or by Convert to client.").isVisible(), offered);
await shot(owner, "move-to-menu-1440");
const focused = () => owner.evaluate(() => document.activeElement?.textContent ?? "");
// Opened by Enter, the menu takes the focus a moment later: the arrow keys wait for it (pressed earlier they go to the
// page and nothing is chosen: walk j_31 on 218bac46d), and Enter is pressed only once Consult really has the focus.
await owner.waitForFunction(() => !!document.activeElement?.closest('[role="menu"]'), null, { timeout: 10_000 });
for (let i = 0; i < 8 && await focused() !== "Consult"; i++) { await owner.keyboard.press("ArrowDown"); await owner.waitForTimeout(80); }
await owner.waitForFunction(() => document.activeElement?.textContent === "Consult", null, { timeout: 5_000 });
await owner.keyboard.press("Enter");
await inStage("CONSULT", anaRow[0]).waitFor();
ok("J-30 W3 DW9 pass: chosen by keyboard only (Enter, ArrowDown, Enter), the card is in Consult, one PERSON move is recorded, and focus is on that card's Move to… again", await owner.waitForFunction((n) => document.activeElement?.getAttribute("data-move") === n, anaRow[0], { timeout: 5_000 }).then(() => true, () => false) && sql(`select s.key || '|' || m.cause from fo_stage_move m join fo_stage s on s.id = m.to_stage_id where m.prospect_id = '${anaId}' order by m.seq desc limit 1`) === "CONSULT|PERSON");
// A stale move: the Case Officer moves it first; the Owner's board still shows Consult.
const seen = (await api(tok.O, "GET", `/prospects/${anaId}`)).body as { version: string };
await api(tok.O, "POST", `/prospects/${anaId}/move`, { stageId: stage("PROPOSAL").id, cause: "PERSON", version: seen.version });
await inStage("CONSULT", anaRow[0]).getByRole("button", { name: /Move to…/ }).click(); await owner.getByRole("menuitem", { name: "Qualified" }).click();
ok("J-30 W3 DW9 fail: a move from a board that is out of date is refused in words, nothing changes, and the board is read again (the card is in Fees discussed)", await toast(owner, /Someone moved .* to Fees discussed\. Nothing was changed/) && await inStage("PROPOSAL", anaRow[0]).waitFor().then(() => true, () => false) && sql(`select s.key from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${anaId}'`) === "PROPOSAL");
// The same on one prospect's screen, where the version read is sent: the server names who moved it.
await owner.goto(`${BASE}/front-office/prospects/${anaId}`); await owner.locator("[data-stage-now]").waitFor();
const seen2 = (await api(tok.O, "GET", `/prospects/${anaId}`)).body as { version: string };
await api(tok.O, "POST", `/prospects/${anaId}/move`, { stageId: stage("CONSULT").id, cause: "PERSON", version: seen2.version });
await owner.getByRole("button", { name: /Move to…/ }).click(); await owner.getByRole("menuitem", { name: "Qualified" }).click();
ok("J-30 W3 DW9 fail: on the prospect's screen a stale version is refused naming who moved it, and the screen then shows Consult", await toast(owner, `${O.name} moved this to Consult. Nothing was changed.`) && await owner.locator("[data-stage-now]", { hasText: "Consult" }).waitFor().then(() => true, () => false));

// --------------------------------------------- W3d: drag a card (FO-4 part 2a-ii, P-736; AG-2-18 rule 7), three widths
// The browser's own drag-and-drop; a drop runs the same move as "Move to…". Cyd's card starts in Qualified (A1).
const stageOf = (id: string) => sql(`select s.key from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${id}'`);
const moves = (id: string) => sql(`select count(*) from fo_stage_move where prospect_id = '${id}'`), audits = (id: string) => sql(`select count(*) from audit_event where entity_key = '${id}' and action = 'prospect.stage_moved'`);
// A real mouse path: press on the card, move, bring the target column into view (a person drags to the board's edge and
// the browser scrolls it; here the board is scrolled), move onto it, release. Playwright's own dragTo scrolls before the
// drag starts and then picks up whatever card is under the pointer, so it is not used.
// The prospect's timeline (FO-2 part 4, on main since #2181): how many stage-move lines it shows.
const timelineMoves = async (id: string) => { const b = (await api(tok.R, "GET", `/prospects/${id}/timeline`)).body; return ((Array.isArray(b) ? b : b?.lines ?? []) as { type: string }[]).filter((l) => l.type === "prospect.stage_moved").length; };
const dragTo = async (pg: Page, num: string, to: string, grab = "") => {
  const card = pg.locator(`[data-card="${num}"]`), target = pg.locator(to);
  await card.scrollIntoViewIfNeeded(); const c = (await (grab ? card.locator(grab).first() : card).boundingBox())!;
  await pg.mouse.move(c.x + (grab ? 8 : 30), c.y + (grab ? c.height / 2 : 12)); await pg.mouse.down(); await pg.mouse.move(c.x + 45, c.y + 20, { steps: 4 });
  await target.evaluate((e) => e.scrollIntoView({ inline: "center", block: "nearest" })); const t = (await target.boundingBox())!;
  await pg.mouse.move(t.x + t.width / 2, t.y + 60, { steps: 8 }); await pg.mouse.up();
};
await owner.goto(`${BASE}/front-office/pipeline`); await inStage("QUALIFIED", cyd1.number).waitFor();
for (const [w, to] of [[1440, "CONSULT"], [1024, "QUALIFIED"], [400, "CONSULT"]] as const) {
  await owner.setViewportSize({ width: w, height: 900 });
  const before = [moves(cyd1.id), audits(cyd1.id)].map(Number), shown = await timelineMoves(cyd1.id);
  await dragTo(owner, cyd1.number, `[data-stage="${to}"]`);
  ok(`J-30 W3d pass: at ${w} px a card dragged to ${to} lands there; the stage, one PERSON move, one audit line and one new timeline line read back; no sideways page scroll`, await inStage(to, cyd1.number).waitFor({ timeout: 10_000 }).then(() => true, () => false) && stageOf(cyd1.id) === to
    && Number(moves(cyd1.id)) === before[0] + 1 && Number(audits(cyd1.id)) === before[1] + 1 && await timelineMoves(cyd1.id) === shown + 1 && sql(`select cause from fo_stage_move where prospect_id = '${cyd1.id}' order by seq desc limit 1`) === "PERSON" && await noSideways(owner), [stageOf(cyd1.id), moves(cyd1.id), audits(cyd1.id)]);
}
await owner.setViewportSize({ width: 1440, height: 900 });
await shot(owner, "board-drag-hint-1440");
const kept = moves(cyd1.id);
await dragTo(owner, cyd1.number, '[data-stage="RETAINER_SIGNED"]');
ok("J-30 W3d fail (R1.31): a card dragged onto Won is refused with AG-2-26 rule 3's words, and the card stays in Consult with no new move", await toast(owner, "This stage is set when the prospect becomes a client. Use Convert to client, or Signed offline if the client signed on paper.") && await inStage("CONSULT", cyd1.number).isVisible() && stageOf(cyd1.id) === "CONSULT" && moves(cyd1.id) === kept, [stageOf(cyd1.id), moves(cyd1.id)]);
await dragTo(owner, cyd1.number, "[data-drop-lost]");
ok("J-30 W3d pass: a card dragged onto Lost opens the loss flow (why was it lost?) and nothing moves until a reason is saved", await owner.getByLabel("Why was it lost?").waitFor({ timeout: 10_000 }).then(() => true, () => false) && owner.url().includes(`/prospects/${cyd1.id}`) && !owner.url().includes("lost=1") && stageOf(cyd1.id) === "CONSULT" && moves(cyd1.id) === kept);
await owner.keyboard.press("Escape");
await owner.goto(`${BASE}/front-office/pipeline`); await inStage("CONSULT", cyd1.number).waitFor();
await inStage("CONSULT", cyd1.number).getByRole("button", { name: /Move to…/ }).focus(); await owner.keyboard.press("Enter"); await owner.getByRole("menuitem", { name: "Qualified" }).press("Enter");
ok("J-30 W3d pass: the keyboard \"Move to…\" still works beside drag (the card is back in Qualified)", await inStage("QUALIFIED", cyd1.number).waitFor({ timeout: 10_000 }).then(() => true, () => false) && stageOf(cyd1.id) === "QUALIFIED");

// ----------------------------------------------------------------- W4: 200 cards per column page (DW13), sizes, axe
for (let i = 0; i < 205; i += 5) await Promise.all([0, 1, 2, 3, 4].map(() => engage(many.id)));
await owner.goto(`${BASE}/front-office/pipeline`); await owner.locator('[data-stage="ENGAGED"] [data-load-more]').waitFor();
const col = owner.locator('[data-stage="ENGAGED"]');
ok("J-30 W4 DW13 pass: a column of 206 shows 200 cards and \"Load more (6 more)\"; its header counts all 206", await col.locator("[data-card]").count() === 200 && await col.locator("[data-load-more]").innerText() === "Load more (6 more)" && await col.locator("[data-count]").innerText() === "206");
for (const w of [1440, 1024, 375]) {
  await owner.setViewportSize({ width: w, height: 900 });
  ok(`J-30 W4 DW13 pass: the board at ${w} px has no sideways page scroll (it scrolls inside itself)`, await noSideways(owner) && await owner.locator("[data-board]").evaluate((e) => e.scrollWidth > e.clientWidth));
  if (w !== 1440) await owner.screenshot({ path: join(SHOTS, `p2a-board-${w}.png`) });
}
await axeOf(owner, "W4 the board at 375 px");
await owner.setViewportSize({ width: 1440, height: 900 });
await col.locator("[data-load-more]").focus(); await owner.keyboard.press("Enter");
ok("J-30 W4 DW13 fail: before Load more the 201st card is not drawn; after it all 206 are and the button is gone", await col.locator("[data-card]").count() === 206 && await col.locator("[data-load-more]").count() === 0);

// ------------------------------------------------------------------ W5: Mark lost and the Lost filter (DW10, BR-9)
await owner.goto(`${BASE}/front-office/prospects/${ana2}`);
await owner.getByRole("button", { name: "Mark lost" }).click();
await owner.getByLabel("Why was it lost?").waitFor();
await owner.getByRole("dialog").getByRole("button", { name: "Mark lost" }).click();
ok("J-30 W5 DW10 fail: Mark lost without a reason is refused at the field (\"Choose why it was lost.\") and the prospect is not lost", await owner.getByRole("alert").filter({ hasText: "Choose why it was lost." }).isVisible() && sql(`select s.kind from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${ana2}'`) === "ACTIVE");
await axeOf(owner, "W5 the Mark lost panel");
await shot(owner, "mark-lost-panel-1440");
await owner.getByLabel("Why was it lost?").selectOption({ label: "Price" }); await owner.getByLabel("Note (optional)").fill("Sample note");
await owner.getByRole("dialog").getByRole("button", { name: "Mark lost" }).click();
await owner.locator("[data-lost-reason]").waitFor();
const ana2No = sql(`select number from fo_prospect where id = '${ana2}'`);
ok("J-30 W5 DW10 pass: with a reason it is lost (reason Price kept), and its screen offers no further move", await owner.locator("[data-stage-now]").innerText() === "Lost" && sql(`select r.key from fo_prospect p join fo_reason r on r.id = p.lost_reason_id where p.id = '${ana2}'`) === "PRICE" && await owner.locator("[data-no-actions]").isVisible());
await owner.goto(`${BASE}/front-office/pipeline?view=list`);
await owner.locator(`[data-prospect-row="${anaRow[0]}"]`).waitFor();
const openHasLost = await owner.locator(`[data-prospect-row="${ana2No}"]`).count();
await owner.getByLabel("Stage").selectOption({ label: "Lost" });
await owner.locator(`[data-prospect-row="${ana2No}"]`).waitFor();
ok("J-30 W5 DW10 pass (R1.30): the lost prospect is not in the List until Stage: Lost is chosen; there it shows why (Price); the open one is not there", openHasLost === 0 && (await owner.locator(`[data-prospect-row="${ana2No}"]`).innerText()).includes("Price") && await owner.locator(`[data-prospect-row="${anaRow[0]}"]`).count() === 0 && owner.url().includes("stage=LOST"));
await shot(owner, "list-lost-1440");
await owner.getByLabel("Stage").selectOption({ label: "Consult" }); await owner.locator(`[data-prospect-row="${anaRow[0]}"]`).waitFor();
await owner.getByLabel("Owner").selectOption({ label: O.name }); await owner.locator("[data-empty]").waitFor();
ok("J-30 W5 pass (R1.30): the List filters by stage (Consult: the moved prospect only) and by owner (the Case Officer has none there)", await owner.locator("[data-prospect-row]").count() === 0 && owner.url().includes("stage=CONSULT") && owner.url().includes(`owner=${O.id}`));
await owner.setViewportSize({ width: 375, height: 800 }); await owner.locator("[data-clear]").click(); await owner.locator(`[data-prospect-row="${anaRow[0]}"]`).waitFor();
ok("J-30 W5 pass: the List at 375 px has no sideways page scroll", await noSideways(owner)); await axeOf(owner, "W5 the List at 375 px");
await owner.setViewportSize({ width: 1440, height: 900 });

// ------------------------------------------------------------- W6: Convert and Undo convert (DW11, BR-11), keys (BR-10)
// FO-13c: no client without a recorded conflict check; recorded through its API for Ana and Cyd (the panel is FO-13s).
for (const id of [anaId, cyd1.id]) { const c = await api(tok.R, "POST", "/conflict-checks", { prospectId: id, requestId: randomUUID(), result: "NO_CONFLICT" }); if (c.status !== 201) throw new Error(`J-30: the conflict check was not recorded (${c.status})`); }
await owner.goto(`${BASE}/front-office/prospects/${anaId}`);
await owner.getByRole("button", { name: "Convert to client" }).click();
const asked = await owner.getByRole("dialog").getByText("Retainer not signed. Work can start. Invoices will warn you, and the case will show a warning.").isVisible();
await shot(owner, "convert-confirm-1440");
await owner.getByRole("button", { name: "No, keep as prospect" }).click();
ok("J-30 W6 DW11 fail: Convert asks yes/no with AG-02's warning, and No changes nothing", asked && sql(`select s.kind from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${anaId}'`) === "ACTIVE");
await owner.getByRole("button", { name: "Convert to client" }).click(); await owner.getByRole("button", { name: "Yes, convert to client" }).click();
await owner.locator("[data-stage-now]", { hasText: "Won – client" }).waitFor();
ok("J-30 W6 DW11 pass (R1.31): Yes moves it to Won by Convert (cause CONVERT), the screen keeps the warning and offers Undo convert, never Move to…", sql(`select p.won_via || '|' || m.cause from fo_prospect p join fo_stage_move m on m.prospect_id = p.id where p.id = '${anaId}' order by m.seq desc limit 1`) === "CONVERTED|CONVERT"
  && await owner.getByRole("button", { name: "Undo convert" }).isVisible() && await owner.getByRole("button", { name: /Move to…/ }).count() === 0 && await owner.getByText("Retainer not signed. Work can start.").first().isVisible());
await owner.getByRole("button", { name: "Undo convert" }).click(); await owner.getByRole("button", { name: "Yes, undo convert" }).click();
const noReason = await owner.getByRole("alert").filter({ hasText: "Say why the Convert is undone." }).isVisible();
await owner.getByLabel("Why is it undone?").fill("Sample: converted by mistake"); await owner.getByRole("button", { name: "Yes, undo convert" }).click();
await owner.locator("[data-stage-now]", { hasText: "Consult" }).waitFor();
ok("J-30 W6 DW11 pass: Undo convert needs a reason, then returns the prospect to the stage it was in (Consult), Won cleared", noReason && sql(`select coalesce(won_via::text, 'none') from fo_prospect where id = '${anaId}'`) === "none");
// Once a retainer is signed, Undo is no longer offered, and the API refuses it.
await owner.getByRole("button", { name: "Convert to client" }).click(); await owner.getByRole("button", { name: "Yes, convert to client" }).click();
await owner.getByRole("button", { name: "Undo convert" }).waitFor();
/** A Sample retainer sent for a prospect (rows as check_fo2p3_prospects.ts writes them); `signed` also signs it. */
const retainer = (prospectId: string, personId: string, signed: boolean) => {
  const TPL = randomUUID(), RET = randomUUID(), VER = randomUUID(), hex = "ab".repeat(32);
  sql(`insert into fo_retainer_template (id, firm_id, name, kind, file_key, file_sha256, placeholders, created_by, updated_by, updated_at) values ('${TPL}', '${A}', 'Retainer (Sample J-30 ${RET.slice(0, 8)})', 'RETAINER', 'retainer-templates/${TPL}/v1.docx', '${hex}', '{client.name}', 'seed:J-30-test', 'seed:J-30-test', now())`);
  sql(`insert into fo_retainer (id, firm_id, kind, prospect_id, subject, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, created_by, updated_at) values ('${RET}', '${A}', 'RETAINER', '${prospectId}', 'PERSON', '${personId}', '${R.id}', '${TPL}', 1, 'retainer-templates/${TPL}/v1.docx', 'staff:${R.id}', now()); insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by) values ('${VER}', '${A}', '${RET}', 1, '{"client.name":"Sample"}', 'retainers/${RET}/v1.docx', '${hex}', 'staff:${R.id}')`);
  sql(`update fo_retainer_version set sent_at = now() where id = '${VER}'; update fo_retainer set status = 'SENT' where id = '${RET}'${signed ? `; update fo_retainer set status = 'CLIENT_SIGNED' where id = '${RET}'; update fo_retainer set status = 'SIGNED' where id = '${RET}'` : ""}`);
  return RET;
};
retainer(anaId, ana.personId, true);
await owner.reload(); await owner.locator("[data-no-actions]").waitFor();
const undo = await api(tok.R, "POST", `/prospects/${anaId}/undo-convert`, { reason: "Sample" });
ok("J-30 W6 DW11 fail: with a signed retainer Undo convert is not offered on the screen, and the API answers 409", await owner.getByRole("button", { name: "Undo convert" }).count() === 0 && undo.status === 409, [undo.status, undo.body?.code]);
// Won by a signature (R1.31): "Signed offline" on a sent retainer (FO-5's route) wins the prospect; no person moved it.
const paper = new FormData(); paper.set("reason", "Signed at the office (Sample)"); paper.set("expectedVersion", "1"); paper.set("file", new Blob(["%PDF-1.4\n%%EOF\n"], { type: "application/pdf" }), "signed.pdf");
const off = await fetch(`${BASE}/api/front-office/retainers/${retainer(cyd1.id, cyd.personId, false)}/signed-offline`, { method: "POST", headers: { authorization: `Bearer ${tok.R}` }, body: paper });
const cydNow = sql(`select s.kind || '|' || coalesce(p.won_via::text, '') || '|' || (select m.cause from fo_stage_move m where m.prospect_id = p.id order by m.seq desc limit 1) from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${cyd1.id}'`).split("|");
await owner.goto(`${BASE}/front-office/prospects/${cyd1.id}`); await owner.locator("[data-stage-now]", { hasText: "Won – client" }).waitFor();
ok("J-30 W6 pass (R1.31): Signed offline wins the prospect (Won, not by Convert, not a person's move); its screen says \"A signed retainer\" and offers no Undo convert", off.status === 200 && cydNow[0] === "WON" && cydNow[1] !== "CONVERTED" && cydNow[2] !== "PERSON" && await owner.getByText("A signed retainer", { exact: true }).isVisible() && await owner.getByRole("button", { name: "Undo convert" }).count() === 0, [off.status, cydNow]);
await owner.goto(`${BASE}/front-office/pipeline`); await inStage("RETAINER_SIGNED", anaRow[0]).waitFor();
let wonSent = 0; const count = (r: { method(): string; url(): string }) => { if (r.method() === "POST" && r.url().includes("/move")) wonSent++; };
owner.on("request", count); await dragTo(owner, anaRow[0], '[data-stage="QUALIFIED"]', "a"); await owner.waitForTimeout(800); owner.off("request", count);
ok("J-30 W3d fail: a Won card cannot be dragged, not even by its name (no move request, the card stays in Won)", wonSent === 0 && await inStage("RETAINER_SIGNED", anaRow[0]).isVisible(), wonSent);
ok("J-30 W6 end: the walk ends at the won prospect in the board's Won column, with no \"Move to…\" on it (the case side's first step starts from here)", await inStage("RETAINER_SIGNED", anaRow[0]).getByRole("button").count() === 0);
await shot(owner, "board-won-1440");
// BR-10: a person whose role may read but not work prospects sees no button (the Case Officer's keys are put back after).
const KEYS = ["agent/prospect:edit", "agent/prospect:lose", "agent/prospect:convert"].map((k) => `'${k}'`).join(",");
const had = rawSql(`select permission_key from platform_role_permission where role = 'CASE_OFFICER' and permission_key in (${KEYS})`).split("\n").filter(Boolean);
const ben1 = await engage(ben.id, tok.O);   // the Case Officer's own prospect, so they see one whatever "everyone sees all" says
try {
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key in (${KEYS})`);
  const readerTok = await signIn(O.email), reader = await pageAs(readerTok);   // a new session: it carries the role's keys as they are now
  await reader.goto(`${BASE}/front-office/prospects/${ben1.id}`); await reader.locator("[data-no-actions]").waitFor();
  const refused = await api(readerTok, "POST", `/prospects/${ben1.id}/lost`, { reasonId: rs[0].id });
  const noValue = await fetch(`${BASE}/api/front-office/prospects/${ben1.id}`, { method: "PATCH", headers: { authorization: `Bearer ${readerTok}`, "content-type": "application/json" }, body: JSON.stringify({ value: "5", currency: "CAD" }) });
  ok("J-30 W6 BR-10 fail: without the edit, lose and convert keys the prospect's screen shows no Move to…, Mark lost or Convert, says why, and the API refuses both Mark lost and a value edit (403)", await reader.getByRole("button", { name: /Move to…|Mark lost|Convert|value/ }).count() === 0 && (await reader.locator("[data-no-actions]").innerText()).includes("You can read this prospect") && refused.status === 403 && noValue.status === 403 && valueOf(ben1.id) === "null|CAD", [refused.status, noValue.status]);
  await reader.goto(`${BASE}/front-office/pipeline?view=list`); await reader.locator(`[data-prospect-row="${ben1.number}"]`).waitFor();
  await reader.goto(`${BASE}/front-office/pipeline`); await reader.locator('[data-stage="ENGAGED"] [data-card]').first().waitFor();
  const firstCard = await reader.locator('[data-stage="ENGAGED"] [data-card]').first().getAttribute("data-card"), cardId = sql(`select id from fo_prospect where number = '${firstCard}' and firm_id = '${A}'`), was = moves(cardId);
  // Both by the card and by its name (a link, which a browser drags by itself: review M1): no request may leave.
  let sent = 0; reader.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/move")) sent++; });
  await dragTo(reader, firstCard!, '[data-stage="CONSULT"]'); await dragTo(reader, firstCard!, '[data-stage="CONSULT"]', "a");
  await reader.waitForTimeout(800);
  ok("J-30 W3d fail (BR-10): without agent/prospect:edit no card can be dragged, by the card or by its name: not draggable, no Lost drop place, no hint, no move request sent, no card faded, nothing moved", sent === 0 && await reader.locator('[data-card][draggable="true"]').count() === 0 && await reader.locator("[data-drop-lost], [data-drag-hint], [data-card].opacity-50").count() === 0 && stageOf(cardId) === "ENGAGED" && moves(cardId) === was, sent);
  await reader.goto(`${BASE}/front-office/pipeline?view=list`); await reader.locator(`[data-prospect-row="${ben1.number}"]`).waitFor();
  ok("J-30 W6 BR-10 fail: the same person's List has no Move to… on any row", await reader.getByRole("button", { name: /Move to…/ }).count() === 0);
} finally { for (const k of had) sql(`insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', '${k}') on conflict do nothing`); }
// The other firm (one user): its Owner cannot open firm A's prospect, its board holds none of this run's cards, and
// it shows no owner anywhere (BR-10, X-4).
const S = staff("user-S"), sTok = ((await (await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-solo", email: S.email, secondStep: true }) })).json()) as { token: string }).token;
const solo = await pageAs(sTok), sLead = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${B}', 'Solo${run}', 'Sample', 'j30.solo.${run}@example.org', 'test', now()) returning id`);
const sProspect = (await api(sTok, "POST", `/leads/${sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${B}', '${sLead}', 'MANUAL', 'Phone call', '${S.id}', 'test', now()) returning id`)}/engage`)).body as { number: string };
await solo.goto(`${BASE}/front-office/pipeline`); await solo.locator(`[data-card="${sProspect.number}"]`).waitFor();
const soloText = await solo.locator("[data-board]").innerText(), other = await api(sTok, "GET", `/prospects/${anaId}`);
ok("J-30 fail: firm B's Owner gets 404 for firm A's prospect, firm B's board shows none of this run's firm A cards, and (one user) no owner on its card or in its List", other.status === 404 && !soloText.includes(`Ana${run}`) && !soloText.includes(`Many${run}`) && !soloText.includes(S.name)
  && await solo.goto(`${BASE}/front-office/pipeline?view=list`).then(() => solo.locator("[data-prospect-row]").first().waitFor()).then(async () => await solo.getByLabel("Owner").count() === 0 && await solo.locator("[data-owner]").count() === 0), other.status);

await browser.close(); await db.$disconnect();
process.exit(summary() ? 1 : 0);
