// R1.30 (QA-533; AG-2-23 rule 1 "The board/list SHALL be filterable by rep, source, … stage, date range"): the prospects
// List and the board filter by the lead's stored source, with Leads' choices and words, inside the visibility. Against
// the real routes and in a real browser: DW1 GET prospects ?source=, DW2 the board route ?source= (cards, counts and
// totals), DW3 an own-only Case Officer, DW4 the screens (List and board: chip, address, reload, the Board/List switch,
// an unknown source in the address, the sources outage), DW5 QA-572 (from after to said at the field, never sent).
// A pass and a fail each. Sample rows only; US$0, no model call.
//   zsh studio/tools/isolated.sh screens_r130src 4486 start PLATFORM_IDENTITY=local && tsx studio/tests/check_r130_prospect_source.ts 4486 xr_studio_screens_r130src
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4486), DBNAME = process.argv[3] ?? "xr_studio_screens_r130src";
const BASE = `http://localhost:${PORT}`;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("R1.30 setup: the Sample firm and its front office are seeded", !!A && fo.failed.length === 0, fo.failed);
const ws = await platformAuditWorkspaceId(db);
const seesAll = (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "seed:R1.30-test", workspaceId: ws, reason: "R1.30 source test" });
await seesAll(true);
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const T = staffOf("user-T"), O = staffOf("user-O");   // Case Manager (sees all when the setting is on), Case Officer (own only)
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { T: await signIn(T.email), O: await signIn(O.email) };
const get = async (t: string, path: string) => { const r = await fetch(`${BASE}/api/front-office/${path}`, { headers: { authorization: `Bearer ${t}` } }); return { status: r.status, body: await r.json() as unknown }; };
let n = 0;
const lead = (source: string, owner: string) => {
  const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Rsrc${++n}${run}', 'Sample', 'r130src${n}.${run}@example.org', 'test', now()) returning id`);
  return sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${p}', 'MANUAL', '${source}', '${owner}', 'test', now()) returning id`);
};
const engage = async (t: string, leadId: string) => (await (await fetch(`${BASE}/api/front-office/leads/${leadId}/engage`, { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" } })).json()) as { id: string; number: string };
// Four prospects (the source is the lead's, "where it came from"): two Referral (one the Case Officer's), one Phone call,
// one with a comma in its source (one value, never split). Values in two currencies, so the board's totals can be read.
// Sources unique to this run, so a second run on the same database adds nothing to these lines' totals.
const REF = `Referral ${run}`, PHONE = `Phone call ${run}`, COMMA = `Event, Toronto ${run}`;
const P = {
  tRef: await engage(tok.T, lead(REF, T.id)), oRef: await engage(tok.O, lead(REF, O.id)),
  tPhone: await engage(tok.T, lead(PHONE, T.id)), tComma: await engage(tok.T, lead(COMMA, T.id)),
};
sql(`update fo_prospect set value_cents = 100000, currency = 'CAD' where id = '${P.tRef.id}'`);
sql(`update fo_prospect set value_cents = 50000, currency = 'USD' where id = '${P.oRef.id}'`);
sql(`update fo_prospect set value_cents = 700000, currency = 'CAD' where id = '${P.tPhone.id}'`);
const ours = new Set(Object.values(P).map((x) => x.id));
const enc = (...v: string[]) => v.map((x) => `source=${encodeURIComponent(x)}`).join("&");
const ids = (b: unknown) => new Set(Array.isArray(b) ? (b as { id: string }[]).map((x) => x.id).filter((id) => ours.has(id)) : []);
const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));

// ------------------------------------------------------------------------------------------- DW1: GET prospects ?source=
const ref = await get(tok.T, `prospects?type=INDIVIDUAL&${enc(REF)}`);
ok("R1.30 DW1 pass: prospects ?source=Referral returns only the prospects whose lead came from Referral", ref.status === 200 && same(ids(ref.body), [P.tRef.id, P.oRef.id]), [ref.status, [...ids(ref.body)]]);
const two = await get(tok.T, `prospects?type=INDIVIDUAL&${enc(REF, COMMA)}`), all = await get(tok.T, "prospects?type=INDIVIDUAL"), blank = await get(tok.T, "prospects?type=INDIVIDUAL&source=");
ok("R1.30 DW1 pass: two sources return both, a comma source is one value; no source (or an empty one) → every prospect, as before",
  same(ids(two.body), [P.tRef.id, P.oRef.id, P.tComma.id]) && same(ids(all.body), Object.values(P).map((x) => x.id)) && same(ids(blank.body), Object.values(P).map((x) => x.id)), [[...ids(two.body)], ids(all.body).size, ids(blank.body).size]);
const withStage = await get(tok.T, `prospects?type=INDIVIDUAL&stage=ENGAGED&${enc(PHONE)}`);
ok("R1.30 DW1 pass: source combines with the other filters (stage)", withStage.status === 200 && same(ids(withStage.body), [P.tPhone.id]), [...ids(withStage.body)]);
const bad = await get(tok.T, `prospects?type=INDIVIDUAL&${enc(REF, "FAX")}`), badBody = bad.body as { code?: string; detail?: string; allowed?: string[] };
ok("R1.30 DW1 fail: an unknown source is refused 422 UNKNOWN_SOURCE naming it and the choices (never ignored, QA-533)",
  bad.status === 422 && badBody.code === "UNKNOWN_SOURCE" && /FAX/.test(badBody.detail ?? "") && (badBody.allowed ?? []).includes(REF), [bad.status, badBody]);

// ------------------------------------------------------------------------------------------- DW2: the board route
type B = { totals: { currency: string; valueCents: number }[]; stages: { key: string; totals: { currency: string; valueCents: number }[]; prospects: { id: string }[] }[] };
const board = async (t: string, qs: string) => { const r = await get(t, `pipelines/INDIVIDUAL/board${qs ? `?${qs}` : ""}`); return { status: r.status, b: r.body as B, ids: new Set(((r.body as B).stages ?? []).flatMap((s) => s.prospects.map((p) => p.id)).filter((id) => ours.has(id))) }; };
const bRef = await board(tok.T, enc(REF)), bAll = await board(tok.T, "");
const engaged = (x: B) => x.stages.find((s) => s.key === "ENGAGED")!;
ok("R1.30 DW2 pass: the board ?source=Referral draws only Referral cards; without it every card", bRef.status === 200 && same(bRef.ids, [P.tRef.id, P.oRef.id]) && same(bAll.ids, Object.values(P).map((x) => x.id)), [[...bRef.ids], bAll.ids.size]);
const cad = (lines: { currency: string; valueCents: number }[]) => lines.find((l) => l.currency === "CAD")?.valueCents ?? 0;
ok("R1.30 DW2 pass: the board's counts and totals follow the source (Referral: CAD 1,000 and USD 500 only; the Phone call CAD 7,000 is not added)",
  engaged(bRef.b).prospects.length === bRef.b.stages.reduce((k, s) => k + s.prospects.length, 0) && cad(engaged(bRef.b).totals) === 100000 && cad(bRef.b.totals) === 100000
  && (bRef.b.totals.find((l) => l.currency === "USD")?.valueCents ?? 0) === 50000 && cad(bAll.b.totals) >= 800000, [bRef.b.totals, bAll.b.totals]);
const bBad = await board(tok.T, enc("FAX"));
ok("R1.30 DW2 fail: the board refuses an unknown source 422 UNKNOWN_SOURCE (PF-28 part 3a: a field error is 422)", bBad.status === 422 && (bBad.b as unknown as { code?: string }).code === "UNKNOWN_SOURCE", bBad.status);

// ------------------------------------------------------------------------------------------- DW3: own-only visibility
await seesAll(false);
const oRef = await get(tok.O, `prospects?type=INDIVIDUAL&${enc(REF)}`), oBoard = await board(tok.O, enc(REF));
ok("R1.30 DW3 pass: the source narrows inside the visibility: the Case Officer gets only their own Referral prospect, on the List and the board",
  same(ids(oRef.body), [P.oRef.id]) && same(oBoard.ids, [P.oRef.id]) && cad(oBoard.b.totals) === 0, [[...ids(oRef.body)], [...oBoard.ids]]);
const oPhone = await get(tok.O, `prospects?type=INDIVIDUAL&${enc(COMMA)}`);
ok("R1.30 DW3 fail: a source only on leads the Case Officer cannot see is unknown to them (422), never named in a list (PF-28 part 3a: a field error is 422)", oPhone.status === 422 && !((oPhone.body as { allowed?: string[] }).allowed ?? []).includes(COMMA), oPhone.status);
await seesAll(true);

// ------------------------------------------------------------------------------------------- DW4: the screens
const browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tok.T);
const p = await ctx.newPage();
const errors: string[] = []; p.on("pageerror", (e) => errors.push(e.message));
const rowsShown = async (attr: string) => new Set(await p.locator(`[${attr}]`).evaluateAll((els, a) => els.map((e) => e.getAttribute(a) ?? ""), attr));
const num = (k: keyof typeof P) => P[k].number;
await p.goto(`${BASE}/front-office/pipeline?view=list`); await p.locator(`[data-prospect-row="${num("tPhone")}"]`).waitFor({ timeout: 30_000 });
await p.locator("[data-source-toggle]").click(); await p.locator(`[data-source="${REF}"]`).click();
await p.locator(`[data-source-chip="${REF}"]`).waitFor({ timeout: 10_000 }); await p.keyboard.press("Escape");
await p.locator(`[data-prospect-row="${num("tPhone")}"]`).waitFor({ state: "detached", timeout: 15_000 });
// The Phone call row also goes while "Loading prospects" stands in for the list (a new source is a new query): read the
// rows only once the filtered list has drawn, or a slow answer reads none (batch #2825, shard 7, both tries: []).
await p.locator(`[data-prospect-row="${num("tRef")}"]`).waitFor({ timeout: 15_000 });
let shown = await rowsShown("data-prospect-row");
ok("R1.30 DW4 pass: List → Source → Referral shows only the Referral prospects, a chip names it, the address keeps it, focus back on Source",
  shown.has(num("tRef")) && shown.has(num("oRef")) && !shown.has(num("tComma")) && p.url().includes(`source=${encodeURIComponent(REF).replace(/%20/g, "+")}`) && await p.evaluate(() => document.activeElement?.hasAttribute("data-source-toggle") ?? false), [[...shown], p.url()]);
await p.reload(); await p.locator(`[data-prospect-row="${num("tRef")}"]`).waitFor({ timeout: 30_000 });
shown = await rowsShown("data-prospect-row");
ok("R1.30 DW4 pass: a reload keeps the List's Source filter", !shown.has(num("tPhone")) && (await p.locator(`[data-source-chip="${REF}"]`).count()) === 1);
const axeList = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
ok("R1.30 DW4 pass: axe finds no WCAG A/AA violation on the List with Source chosen", axeList.violations.length === 0, axeList.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`));
await p.locator('[data-view="board"]').click(); await p.locator(`[data-card="${num("tRef")}"]`).waitFor({ timeout: 30_000 });
const cards = await rowsShown("data-card");
ok("R1.30 DW4 pass: the Board/List switch keeps the source; the board draws only the Referral cards, with the chip",
  p.url().includes(`source=${encodeURIComponent(REF).replace(/%20/g, "+")}`) && cards.has(num("tRef")) && cards.has(num("oRef")) && !cards.has(num("tPhone")) && (await p.locator(`[data-source-chip="${REF}"]`).count()) === 1, [[...cards], p.url()]);
const axeBoard = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
ok("R1.30 DW4 pass: axe finds no WCAG A/AA violation on the board with Source chosen", axeBoard.violations.length === 0, axeBoard.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`));
for (const w of [400, 1024]) {
  await p.setViewportSize({ width: w, height: 900 }); await p.waitForTimeout(200);
  ok(`R1.30 DW4 pass: ${w}px board with Source chosen: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
}
await p.setViewportSize({ width: 1440, height: 900 });
await p.locator("[data-source-clear]").click(); await p.locator(`[data-card="${num("tPhone")}"]`).waitFor({ timeout: 15_000 });
ok("R1.30 DW4 pass: All sources on the board draws every card again and clears the address", !p.url().includes("source=") && (await rowsShown("data-card")).has(num("tComma")));
await p.goto(`${BASE}/front-office/pipeline?view=list&source=FAX`); await p.locator(`[data-prospect-row="${num("tPhone")}"]`).waitFor({ timeout: 30_000 });
ok("R1.30 DW4 fail: an unknown ?source= in the address is dropped: no chip, every prospect listed, no alert", (await p.locator("[data-source-chip]").count()) === 0 && (await p.getByRole("alert").count()) === 0);
let unfiltered = 0;
await p.route("**/api/front-office/leads/sources", (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ title: "Unavailable", detail: "Sample outage." }) }));
p.on("request", (r) => { const u = new URL(r.url()); if (/\/api\/front-office\/(prospects|pipelines\/INDIVIDUAL\/board)$/.test(u.pathname) && !u.searchParams.has("source")) unfiltered++; });
await p.goto(`${BASE}/front-office/pipeline?${enc(REF)}`); await p.locator("[data-source-blocked]").waitFor({ timeout: 30_000 });
ok("R1.30 DW4 fail: when the sources cannot be loaded, the board keeps the asked source, fetches and shows no unfiltered board, and offers Try again",
  unfiltered === 0 && (await p.locator("[data-card]").count()) === 0 && (await p.getByRole("button", { name: "Try again" }).count()) >= 1, { unfiltered });
await p.unroute("**/api/front-office/leads/sources");
// Break m2: with no source asked, a slow sources route never holds the board back.
await p.route("**/api/front-office/leads/sources", async (r) => { await new Promise((ok2) => setTimeout(ok2, 8_000)); await r.continue().catch(() => undefined); });
const t0 = Date.now(); await p.goto(`${BASE}/front-office/pipeline`); await p.locator(`[data-card="${num("tPhone")}"]`).waitFor({ timeout: 30_000 });
const secs = (Date.now() - t0) / 1000;
ok("R1.30 DW4 pass (break m2): with no source asked the board draws before a slow sources lookup answers", secs < 6, secs);
await p.unroute("**/api/front-office/leads/sources");

// ------------------------------------------------------------------------------------------- DW5: QA-572
const day = (ago: number) => new Date(Date.now() - ago * 86_400_000).toISOString().slice(0, 10);
let sentBad = 0;
p.on("request", (r) => { const u = new URL(r.url()); const f = u.searchParams.get("from"), t = u.searchParams.get("to"); if (u.pathname.startsWith("/api/") && f && t && f > t) sentBad++; });
await p.goto(`${BASE}/front-office/pipeline?view=list`); await p.locator(`[data-prospect-row="${num("tPhone")}"]`).waitFor({ timeout: 30_000 });
await p.getByLabel("Engaged to").fill(day(0)); await p.locator(`[data-prospect-row="${num("tPhone")}"]`).waitFor({ timeout: 15_000 });
await p.getByLabel("Engaged from").fill(day(-3));
await p.getByText("The from date must be on or before the to date.", { exact: true }).waitFor({ timeout: 10_000 });
const from = p.getByLabel("Engaged from");
await p.locator("[data-empty]").waitFor({ timeout: 10_000 });
ok("R1.30 DW5 pass (QA-572): a from after to is said at the from field (aria-invalid, described), plain words in place of the list, no alert, nothing sent",
  (await from.getAttribute("aria-invalid")) === "true" && /Change the dates/.test(await p.locator("[data-empty]").innerText()) && (await p.locator("[data-prospect-row]").count()) === 0 && (await p.getByRole("alert").count()) === 0 && sentBad === 0, { sentBad });
// Break M1: while the range stands, choosing a source never shows a stale list under the new chip.
await p.locator("[data-source-toggle]").click(); await p.locator(`[data-source="${REF}"]`).click(); await p.locator(`[data-source-chip="${REF}"]`).waitFor({ timeout: 10_000 }); await p.keyboard.press("Escape");
ok("R1.30 DW5 fail (break M1): a source chosen while the range is wrong shows no rows that ignore it, only the words", (await p.locator("[data-prospect-row]").count()) === 0 && (await p.locator("[data-empty]").count()) === 1);
await from.fill(day(1)); await p.getByText("The from date must be on or before the to date.", { exact: true }).waitFor({ state: "detached", timeout: 10_000 });
await p.locator(`[data-prospect-row="${num("tRef")}"]`).waitFor({ timeout: 15_000 }).catch(() => undefined);
const fixed = await rowsShown("data-prospect-row");
ok("R1.30 DW5 pass (QA-572): a from on or before to clears the message and the list follows the range and the source", (await from.getAttribute("aria-invalid")) !== "true" && fixed.has(num("tRef")) && !fixed.has(num("tPhone")), [...fixed]);
// Break m1: a day in the address that is not a real YYYY-MM-DD day is dropped (as Leads does), never a raw error.
for (const bad of ["abc", "2026-02-30", "2026-1-5", "3026-11-20"]) {
  await p.goto(`${BASE}/front-office/pipeline?view=list&from=${bad}&to=${day(0)}`); await p.locator(`[data-prospect-row="${num("tPhone")}"]`).waitFor({ timeout: 30_000 }).catch(() => undefined);
  ok(`R1.30 DW5 fail (break m1): from=${bad} in the address is dropped: the list shows, no alert, no "from after to"`, (await p.locator(`[data-prospect-row="${num("tPhone")}"]`).count()) === 1 && (await p.getByRole("alert").count()) === 0 && (await p.getByText("The from date must be").count()) === 0 && sentBad === 0);
}
await p.goto(`${BASE}/front-office/pipeline?view=list&from=${day(1)}&to=${day(5)}`);
await p.locator("[data-empty]").waitFor({ timeout: 30_000 });
ok("R1.30 DW5 fail (QA-572): a from after to typed into the address shows plain words to change the dates (no raw 'from:'), nothing sent",
  /from date must be on or before the to date/.test(await p.locator("[data-empty]").innerText()) && !/from:/.test(await p.locator("body").innerText()) && sentBad === 0, { sentBad });
// Review round 3 (EXPERIENCE §2.12, BIC-13): a from day typed key by key reaches the address (the year passes 0002…0202).
for (const [url, label] of [["/front-office/pipeline?view=list", "Engaged from"], ["/front-office/leads?view=all", "Arrived from"]] as const) {
  await p.goto(`${BASE}${url}`); await p.getByLabel(label).waitFor({ timeout: 30_000 });
  await p.waitForLoadState("networkidle").catch(() => undefined); await p.getByLabel(label).focus();   // focus starts on the month (a click lands mid-field)
  const target = day(1), [y, m, d] = target.split("-");
  for (const ch of `${m}${d}${y}`) { await p.keyboard.type(ch); await p.waitForTimeout(60); }
  await p.waitForFunction((t) => location.search.includes(`from=${t}`), target, { timeout: 10_000 }).catch(() => undefined);
  ok(`R1.30 DW5 pass (review round 3): ${label} typed key by key keeps what was typed and the address carries from=${target}`,
    (await p.getByLabel(label).inputValue()) === target && p.url().includes(`from=${target}`), [await p.getByLabel(label).inputValue(), p.url()]);
}
ok("R1.30: no page error in the browser", errors.length === 0, errors);
await browser.close(); await db.$disconnect();
process.exit(summary() ? 1 : 0);
