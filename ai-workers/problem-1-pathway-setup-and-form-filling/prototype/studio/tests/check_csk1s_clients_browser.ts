// CS-K1s (R1.72, QA-593, P-560; brief design/build-lead-c-briefs/CS-K1s.md): the staff Clients list and the client page
// with "Open a case?", walked in a browser on an isolated copy (its own database and port, never :4400), with the API and
// the database read underneath. Each DW line has a pass and its stand-in that must fail:
//   DW1 a staff member without agent/case:show gets no "Clients" menu entry, and /clients shows the no-access page;
//   DW2 the list searches by name and by client code; "Show more" shows each client once;
//   DW3 a won client with no case shows the card with the offer's three values; one click opens exactly one case and lands
//       on it (also when the browser's simulated person is another firm's: breaker M1); a double click makes no second case;
//   DW4 a used, withdrawn or changed offer shows the opening's own words, and no case is made;
//   DW5 firm B's staff get 404 on firm A's client, through the page and through GET …/offer;
//   DW6 without agent/case:create the card shows with no button (and the server refuses the opening);
//   DW7 the offer read returns no prospect answers (e-mail, phone).
// Keyboard on the card's button; axe clean (WCAG 2.2 A/AA); 1024 and 1440 px with no sideways scroll. Sample rows only;
// US$0, no model call; live AI off. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh csk1s_clients 4643 start PLATFORM_IDENTITY=local PROSPECT_WON_POLL_MS=500 && tsx studio/tests/check_csk1s_clients_browser.ts 4643 xr_studio_csk1s_clients
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { OFFER_REFUSED } from "../api/src/case-clients/prospect-won.ts";
import { ClientOfferView } from "../contracts/runtime.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4643), process.argv[3] ?? "xr_studio_csk1s_clients"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "CS-K1s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const POLL = Number(process.env.PROSPECT_WON_POLL_MS) || 500;
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown, actor?: string): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}), ...(actor ? { "x-actor": actor } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const vv = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id)`);
if (!vv()) await api(null, "POST", "/demo/load", { sample: "configured" }, "user-A");
const VV = vv(), VV_LABEL = sql(`select label from combination where id = '${VV}'`);
const service = sql(`select id from fo_service where firm_id = '${A}' and combination_id = '${VV}'`)
  || sql(`insert into fo_service (firm_id, label, combination_id, sort_order, created_by) values ('${A}', 'Sample service', '${VV}', 900, 'seed:csk1s') returning id`);
ok("CS-K1s setup: both Sample firms, their front office, a released Visitor visa and a service on it are on the copy", !!A && !!B && fo.failed.length === 0 && !!VV && !!service, fo.failed);
const staff = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const R = staff("user-R"), T = staff("user-T");
const signIn = async (firmKey: string, actorId: string): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, actorId, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${actorId} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};
/** A Sample staff member of firm A with the given role, or none at all. */
const member = async (tag: string, role: string | null) => {
  const s = await db.platformStaff.create({ data: { firmId: A, actorId: `csk1s-${tag}-${run}`, email: `csk1s-${tag}-${run}@sample.invalid`, displayName: `Sample ${tag}` } });
  if (role) await db.platformRoleGrant.create({ data: { firmId: A, staffId: s.id, role: role as never, grantedBy: "seed:csk1s" } });
  return signIn("sample-firm", s.actorId!);
};
const TA = await signIn("sample-firm", "user-R"), TB = await signIn("sample-solo", "user-S");
const TRO = await member("reader", "READ_ONLY"), TNONE = await member("norole", null);
let n = 0;
/** A Sample lead of firm A interested in the Visitor visa service, engaged into a prospect through the API. */
const prospect = async (given: string) => {
  const email = `csk1s.${++n}.${run}@example.org`, phone = `+1416555${String(1000 + n).slice(-4)}`;
  const p = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, phone, created_by, updated_at) values (gen_random_uuid(), '${A}', '${given}${run}', 'Sample', '${email}', '${phone}', 'seed:csk1s', now()) returning id`);
  const lead = sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, interested_in_service_id, created_by, updated_at) values (gen_random_uuid(), '${A}', '${p}', 'MANUAL', 'Phone call', '${R.id}', '${service}', 'seed:csk1s', now()) returning id`);
  const e = await api(TA, "POST", `/front-office/leads/${lead}/engage`);
  return { id: e.body?.id as string, personId: p, name: `${given}${run} Sample`, email, phone };
};
/** The client appears by itself (the app's poll), at most a few poll intervals after the win. */
const appears = async (name: string) => {
  const until = Date.now() + 20 * POLL;
  for (;;) {
    const r = await api(TA, "GET", `/runtime/clients?query=${encodeURIComponent(name)}`);
    const c = (r.body?.clients ?? []).find((x: { display_name: string }) => x.display_name === name);
    if (c || Date.now() > until) return c as { id: string; number: string } | undefined;
    await new Promise((res) => setTimeout(res, 100));
  }
};
// FO-13c: no client without a recorded conflict check; recorded through its API right before Convert (the panel is FO-13s).
const convert = async (prospectId: string) => {
  const c = await api(TA, "POST", "/front-office/conflict-checks", { prospectId, requestId: crypto.randomUUID(), result: "NO_CONFLICT" });
  if (c.status !== 201) throw new Error(`conflict check for ${prospectId}: ${c.status}`);
  return api(TA, "POST", `/front-office/prospects/${prospectId}/convert`, {});
};
const wonClient = async (given: string) => { const p = await prospect(given); const c = await convert(p.id); if (c.status !== 200) throw new Error(`convert ${given}: ${c.text.slice(0, 200)}`); const cl = await appears(p.name); if (!cl) throw new Error(`no client for ${given}`); return { ...p, client: cl }; };
const casesOf = (clientId: string) => Number(sql(`select count(*) from runtime_case where client_id = '${clientId}'`));

// ------------------------------------------------------------------------------------------------ the browser
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", slowMo: process.env.HEADED === "1" ? 200 : 0, ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
/** A tab signed in as one staff session, acting on the case pages as `actor` (the simulated person of the same firm). */
const tab = async (token: string, actor = "user-O") => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((x) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x.token, expiresAt: Date.now() + 3_600_000 })); localStorage.setItem("xr-actor", x.actor); }, { token, actor });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `csk1s-${name}.png`), fullPage: true });
const axe = async (p: Page, what: string) => { const v = (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations; ok(`CS-K1s axe: ${what}: no WCAG 2.2 A/AA violation`, v.length === 0, v.map((x) => `${x.id}: ${x.nodes[0]?.target}`)); };
const sizes = async (p: Page, what: string) => {
  const fits: boolean[] = [];
  for (const width of [1024, 1440]) { await p.setViewportSize({ width, height: 900 }); fits.push(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); }
  ok(`CS-K1s ${what}: no sideways page scroll at 1024 and 1440 px`, fits.every(Boolean), fits);
};
/** Tab to a control and press Enter (keyboard only). */
const press = async (p: Page, target: ReturnType<Page["getByRole"]>, max = 80) => {
  for (let i = 0; i < max; i++) { if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return p.keyboard.press("Enter"); await p.keyboard.press("Tab"); }
  throw new Error("not reached by Tab");
};
const card = (p: Page) => p.locator("[data-offer-card]");
const openClient = async (p: Page, id: string) => { await p.goto(`${BASE}/clients/${id}`); await p.locator("[data-client-page]").waitFor({ timeout: 60_000 }); await p.locator("[data-offer-card], [data-no-cases], [data-client-case], [data-offer-gone]").first().waitFor({ timeout: 30_000 }); };

try {
  const page = await tab(TA);

  // ------------------------------------------------------------------------------------------- DW1: the key
  const none = await tab(TNONE);
  await none.goto(`${BASE}/cases`); await none.locator("[data-frame]").waitFor({ timeout: 60_000 });
  await none.waitForResponse((r) => r.url().endsWith("/api/platform/me"), { timeout: 30_000 }).catch(() => null);
  await none.waitForTimeout(300);
  const noneMenu = await none.locator('[data-nav="clients"]').count();
  await none.goto(`${BASE}/clients`); await none.locator("[data-no-access]").waitFor({ timeout: 30_000 });
  const noneApi = await api(TNONE, "GET", "/runtime/clients");
  ok("CS-K1s DW1 pass: a staff member without agent/case:show has no Clients menu entry; /clients shows the no-access page (a heading and why), never a blank one; the API refuses the list (403)",
    noneMenu === 0 && (await none.getByRole("heading", { name: "Clients" }).count()) === 1 && /Clients are for staff who can see cases/.test(await none.locator("main").innerText()) && noneApi.status === 403, [noneMenu, noneApi.status]);
  await shot(none, "dw1-no-access"); await axe(none, "DW1 the no-access page");
  await page.goto(`${BASE}/cases`); await page.locator('[data-nav="clients"]').waitFor({ timeout: 60_000 });
  ok("CS-K1s DW1 fail (stand-in): a staff member with the key has the Clients entry beside Cases", (await page.locator('[data-nav="cases"]').count()) === 1);
  await none.context().close();

  // ------------------------------------------------------------------------------------------- the won clients
  const ana = await wonClient("Ana");   // DW3 double click (Convert: no retainer)
  const cyd = await wonClient("Cyd");   // DW4 used
  const dee = await wonClient("Dee");   // DW4 withdrawn
  const eve = await wonClient("Eve");   // DW4 changed
  const fay = await wonClient("Fay");   // DW6 read-only
  // Ben: a Signed offline win on a Sample retainer whose sent version names user-T as the representative (as J-72 W5).
  const ben = await prospect("Ben");
  const [RET, VER, TPL] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()], hex = "ab".repeat(32);
  sql(`insert into fo_retainer_template (id, firm_id, name, kind, file_key, file_sha256, placeholders, created_by, updated_by, updated_at) values ('${TPL}', '${A}', 'Retainer (Sample CS-K1s ${run})', 'RETAINER', 'retainer-templates/${TPL}/v1.docx', '${hex}', '{client.name}', 'seed:csk1s', 'seed:csk1s', now())`);
  sql(`insert into fo_retainer (id, firm_id, kind, prospect_id, subject, signer_person_id, representative_staff_id, template_id, template_version, template_file_key, created_by, updated_at) values ('${RET}', '${A}', 'RETAINER', '${ben.id}', 'PERSON', '${ben.personId}', '${R.id}', '${TPL}', 1, 'retainer-templates/${TPL}/v1.docx', 'staff:${R.id}', now()); insert into fo_retainer_version (id, firm_id, retainer_id, n, merge_values, file_key, original_sha256, created_by) values ('${VER}', '${A}', '${RET}', 1, '{"client.name":"Sample","representative.staff_id":"${T.id}","signer.person_id":"${ben.personId}"}', 'retainers/${RET}/v1.docx', '${hex}', 'staff:${R.id}')`);
  sql(`update fo_retainer_version set sent_at = now() where id = '${VER}'; update fo_retainer set status = 'SENT' where id = '${RET}'`);
  await api(TA, "POST", "/front-office/conflict-checks", { prospectId: ben.id, requestId: crypto.randomUUID(), result: "NO_CONFLICT" });   // FO-13c: the check before the paper win
  const f = new FormData(); f.set("reason", "Signed at the office (Sample)"); f.set("expectedVersion", "1"); f.set("file", new Blob(["%PDF-1.4\n%%EOF\n"], { type: "application/pdf" }), "signed.pdf");
  const off = await fetch(`${BASE}/api/front-office/retainers/${RET}/signed-offline`, { method: "POST", headers: { authorization: `Bearer ${TA}` }, body: f }).then((r) => r.status);
  const benClient = await appears(ben.name);
  ok("CS-K1s setup: six won clients of firm A appear by themselves (five by Convert, one by Signed offline)", off === 200 && !!benClient && [ana, cyd, dee, eve, fay].every((x) => !!x.client.id), off);

  // ------------------------------------------------------------------------------------------- DW2: the list
  const ws = sql(`select workspace_id from case_client where id = '${ana.client.id}'`);
  // 55 Sample clients of firm A, each linked to its own fo_person (the database's link rule), for "Show more".
  sql(`with p as (insert into fo_person (id, firm_id, given_names, family_name, created_by, updated_at) select gen_random_uuid(), '${A}', 'Bulk${run}', lpad(g::text, 2, '0'), 'seed:csk1s', now() from generate_series(1, 55) g returning id, family_name)
    insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) select gen_random_uuid(), '${ws}', 'sample-firm', '${A}', case_client_next_number('${ws}'::uuid, 'sample-firm'), 'Bulk${run} ' || p.family_name, 'PERSON', p.id, 'seed:csk1s' from p`);
  await page.goto(`${BASE}/cases`); await press(page, page.getByRole("link", { name: "Clients", exact: true }));
  await page.locator("[data-clients-list]").waitFor({ timeout: 30_000 }); await page.locator("[data-client-row]").first().waitFor({ timeout: 30_000 });
  ok("CS-K1s DW2: the Clients entry opens /clients by keyboard, with the columns Client code, Name, Person or Company, Cases", new URL(page.url()).pathname === "/clients"
    && (await page.locator("thead").innerText()).replace(/\s+/g, " ").trim() === "Client code Name Person or Company Cases", page.url());
  await shot(page, "dw2-list"); await axe(page, "DW2 the Clients list"); await sizes(page, "DW2 the Clients list"); await page.setViewportSize({ width: 1440, height: 900 });
  const search = page.getByRole("searchbox", { name: "Search clients" });
  await search.fill(ana.name); await page.waitForURL((u) => u.searchParams.get("q") === ana.name); await page.locator(`[data-client-row="${ana.client.number}"]`).waitFor({ timeout: 30_000 });
  const byName = await page.locator("[data-client-row]").count();
  await search.fill(ana.client.number); await page.waitForURL((u) => u.searchParams.get("q") === ana.client.number); await page.waitForFunction((x) => { const rows = [...document.querySelectorAll("[data-client-row]")]; return rows.length > 0 && rows.every((r) => r.getAttribute("data-client-row") === x); }, ana.client.number, { timeout: 30_000 });
  const byCode = await page.locator("[data-client-row]").count();
  ok("CS-K1s DW2 pass: the list finds a client by its name and by its client code (one row each, that client)", byName === 1 && byCode === 1, [byName, byCode]);
  await search.fill(`nobody${run}`); await page.getByText(`No client matches "nobody${run}"`).waitFor({ timeout: 30_000 });
  ok("CS-K1s DW2 fail (stand-in): a search that matches nobody shows no row and names the search", (await page.locator("[data-client-row]").count()) === 0);
  await shot(page, "dw2-no-match");
  await search.fill(`Bulk${run}`); await page.waitForURL((u) => u.searchParams.get("q") === `Bulk${run}`); await page.locator("[data-show-more]").waitFor({ timeout: 30_000 });
  const firstPage = await page.locator("[data-client-row]").count();
  await press(page, page.getByRole("button", { name: "Show more" })); await page.waitForFunction(() => document.querySelectorAll("[data-client-row]").length > 50, null, { timeout: 30_000 });
  const codes = await page.locator("[data-client-row]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-client-row")));
  ok("CS-K1s DW2 pass: \"Show more\" shows the next page, each of the 55 clients once, and then goes away", codes.length === 55 && new Set(codes).size === 55 && (await page.locator("[data-show-more]").count()) === 0, [codes.length, new Set(codes).size]);
  ok("CS-K1s DW2 fail (stand-in): before \"Show more\" only the first 50 showed", firstPage === 50, firstPage);

  // ------------------------------------------------------------------------------------------- DW3: one click, one case
  await openClient(page, benClient!.id);
  const benText = await card(page).innerText();
  const tName = sql(`select display_name from platform_staff where id = '${T.id}'`);
  ok("CS-K1s DW3 pass: a won client with no case shows \"Open a case?\" with the offer's three values: the program, the principal applicant and the representative the signed retainer names",
    (await card(page).getByRole("heading", { name: "Open a case?" }).count()) === 1 && (await page.locator("[data-offer-program]").innerText()) === VV_LABEL
    && (await page.locator("[data-offer-principal]").innerText()) === ben.name && (await page.locator("[data-offer-representative]").innerText()) === tName, benText);
  await shot(page, "dw3-card"); await axe(page, "DW3 the client page with its card"); await sizes(page, "DW3 the client page"); await page.setViewportSize({ width: 1440, height: 900 });
  await press(page, page.getByRole("button", { name: "Open the case" }));
  await page.waitForURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const benCase = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByText(`Client: ${ben.name}`).first().waitFor({ timeout: 60_000 });
  const benRep = sql(`select user_id from case_team_member where case_id = '${benCase}' and role = 'LEAD_REPRESENTATIVE' and ended_at is null`);
  ok("CS-K1s DW3 pass: one press of \"Open the case\" opens exactly one case for the client, on the offer's program and representative, and lands on it",
    casesOf(benClient!.id) === 1 && sql(`select client_id from runtime_case where id = '${benCase}'`) === benClient!.id && sql(`select combination_id from runtime_case where id = '${benCase}'`) === VV && benRep === "user-T",
    [casesOf(benClient!.id), benRep]);
  await shot(page, "dw3-landed");
  await openClient(page, ana.client.id);
  // A double click: the second click must send nothing (the button is off while the first request runs).
  const posts: string[] = []; page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/open-case")) posts.push(r.url()); });
  await page.getByRole("button", { name: "Open the case" }).dblclick();
  await page.waitForURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await page.waitForTimeout(500);
  ok("CS-K1s DW3 fail: a double click on \"Open the case\" sends one request and makes no second case", posts.length === 1 && casesOf(ana.client.id) === 1, [posts.length, casesOf(ana.client.id)]);
  await openClient(page, ana.client.id);
  ok("CS-K1s DW3: once opened, the client page lists the case (a link to it) and shows no card", (await card(page).count()) === 0 && (await page.locator("[data-client-case]").count()) === 1);

  // ------------------------------------------------------------------------------------------- DW4: used, withdrawn, changed
  await openClient(page, cyd.client.id);
  const usedMeanwhile = await api(TA, "POST", `/runtime/clients/${cyd.client.id}/open-case`, { clientActor: "user-P" });
  await page.getByRole("button", { name: "Open the case" }).click();
  const usedAlert = page.locator('[data-offer-refusal="OFFER_USED"]'); await usedAlert.waitFor({ timeout: 30_000 });
  ok("CS-K1s DW4 pass (used): a case opened meanwhile (another tab) → the click shows the opening's own words in an alert, the button goes off, and no second case is made",
    usedMeanwhile.status === 201 && (await usedAlert.innerText()) === OFFER_REFUSED.USED && (await usedAlert.getAttribute("role")) === "alert" && await page.getByRole("button", { name: "Open the case" }).isDisabled() && casesOf(cyd.client.id) === 1, [usedMeanwhile.status]);
  await shot(page, "dw4-used");
  await openClient(page, dee.client.id);
  const undo = await api(TA, "POST", `/front-office/prospects/${dee.id}/undo-convert`, { reason: "Converted by mistake (Sample)" });
  await page.getByRole("button", { name: "Open the case" }).click();
  const wAlert = page.locator('[data-offer-refusal="OFFER_WITHDRAWN"]'); await wAlert.waitFor({ timeout: 30_000 });
  const wText = await wAlert.innerText();
  await openClient(page, dee.client.id);
  ok("CS-K1s DW4 pass (withdrawn): a Convert undone meanwhile → the click shows the opening's words; on a fresh read the card is gone and the same words say why; no case",
    undo.status === 200 && wText === OFFER_REFUSED.WITHDRAWN && (await card(page).count()) === 0 && (await page.locator('[data-offer-gone="WITHDRAWN"]').innerText()) === OFFER_REFUSED.WITHDRAWN && casesOf(dee.client.id) === 0, [undo.status, undo.text.slice(0, 120)]);
  await shot(page, "dw4-withdrawn");
  // Changed: the server's 409 OFFER_CHANGED (a prospect won again as the other type) is answered in the browser, so the
  // card's handling is walked without racing the app's poll: its words and a fresh read of the offer.
  await openClient(page, eve.client.id);
  let reads = 0; page.on("request", (r) => { if (r.method() === "GET" && r.url().endsWith(`/clients/${eve.client.id}/offer`)) reads++; });
  await page.route(`**/api/runtime/clients/${eve.client.id}/open-case`, (r) => r.fulfill({ status: 409, contentType: "application/problem+json", body: JSON.stringify({ status: 409, title: "Not possible now", detail: OFFER_REFUSED.CHANGED, code: "OFFER_CHANGED" }) }));
  await page.getByRole("button", { name: "Open the case" }).click();
  const cAlert = page.locator('[data-offer-refusal="OFFER_CHANGED"]'); await cAlert.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  ok("CS-K1s DW4 pass (changed): a 409 OFFER_CHANGED shows the opening's words and reads the offer again", (await cAlert.innerText()) === OFFER_REFUSED.CHANGED && reads >= 1, reads);
  await page.unroute(`**/api/runtime/clients/${eve.client.id}/open-case`);
  ok("CS-K1s DW4 fail (stand-in): no case was made for the withdrawn or the changed offer", casesOf(dee.client.id) === 0 && casesOf(eve.client.id) === 0);

  // DW3, breaker M1: the case pages read the simulated person. A firm A sign-in in a browser whose simulated person is the
  // solo firm's must still land on a case it can see: the page acts as the staff member's own case-side person first.
  const mixed = await tab(TA, "user-S");
  await openClient(mixed, eve.client.id);
  await mixed.getByRole("button", { name: "Open the case" }).click();
  await mixed.waitForURL(/\/cases\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await mixed.getByText(`Client: ${eve.name}`).first().waitFor({ timeout: 60_000 });
  const mixedActor = await mixed.evaluate(() => localStorage.getItem("xr-actor"));
  ok("CS-K1s DW3 pass (breaker M1): signed in as firm A while acting as the solo firm's person, \"Open the case\" lands on the case it opened (not \"No such case\"), acting as the staff member's own person (user-R), said by the person notice",
    !/No such case/.test(await mixed.locator("main").innerText()) && mixedActor === "user-R" && casesOf(eve.client.id) === 1 && (await mixed.getByText("Now: Representative (simulated)").count()) >= 1, mixedActor);
  await shot(mixed, "dw3-mixed-landed");
  await openClient(mixed, eve.client.id);
  await mixed.evaluate(() => localStorage.setItem("xr-actor", "user-S"));
  await mixed.locator("[data-client-case]").first().click();
  await mixed.getByText(`Client: ${eve.name}`).first().waitFor({ timeout: 60_000 });
  ok("CS-K1s DW3 pass (breaker M1): a case link on the client page opens the case as the staff member's own person too", !/No such case/.test(await mixed.locator("main").innerText()));
  await mixed.context().close();

  // ------------------------------------------------------------------------------------------- DW5: another firm
  const pb = await tab(TB, "user-S");
  await pb.goto(`${BASE}/clients/${fay.client.id}`); await pb.locator("[data-no-client]").waitFor({ timeout: 60_000 });
  const bOffer = await api(TB, "GET", `/runtime/clients/${fay.client.id}/offer`), bRead = await api(TB, "GET", `/runtime/clients/${fay.client.id}`), aOffer = await api(TA, "GET", `/runtime/clients/${fay.client.id}/offer`);
  ok("CS-K1s DW5 pass: firm B's staff get 404 on firm A's client: the page says \"No such client\" and GET …/offer and the client read answer 404",
    (await pb.getByRole("heading", { name: "No such client" }).count()) === 1 && bOffer.status === 404 && bRead.status === 404 && !/Fay/.test(await pb.locator("main").innerText()), [bOffer.status, bRead.status]);
  await shot(pb, "dw5-other-firm"); await axe(pb, "DW5 the no-such-client page");
  ok("CS-K1s DW5 fail (stand-in): firm A's own GET …/offer is 200 with the offer", aOffer.status === 200 && !!aOffer.body?.offer, aOffer.status);
  await pb.context().close();

  // ------------------------------------------------------------------------------------------- DW6: no create key
  const pro = await tab(TRO);
  await openClient(pro, fay.client.id);
  const roOpen = await api(TRO, "POST", `/runtime/clients/${fay.client.id}/open-case`, { clientActor: "user-P" });
  ok("CS-K1s DW6 pass: without agent/case:create the card shows its values with no button, saying \"Ask someone who can open cases.\"; the server refuses the opening (403)",
    (await card(pro).count()) === 1 && (await pro.getByRole("button", { name: "Open the case" }).count()) === 0 && (await pro.locator("[data-offer-ask]").innerText()) === "Ask someone who can open cases." && roOpen.status === 403 && casesOf(fay.client.id) === 0, roOpen.status);
  await shot(pro, "dw6-read-only"); await axe(pro, "DW6 the card without the create key");
  await openClient(page, fay.client.id);
  ok("CS-K1s DW6 fail (stand-in): a staff member with the key sees the button on the same client", (await page.getByRole("button", { name: "Open the case" }).count()) === 1);
  await pro.context().close();

  // ------------------------------------------------------------------------------------------- DW7: no prospect answers
  const offer = await api(TA, "GET", `/runtime/clients/${fay.client.id}/offer`);
  const parsed = ClientOfferView.safeParse(offer.body);
  ok("CS-K1s DW7 pass: the offer read returns ids and names only (strict schema), never the prospect's e-mail or phone",
    offer.status === 200 && parsed.success && !offer.text.includes(fay.email) && !offer.text.includes(fay.phone) && !/answers|email|phone/i.test(offer.text), offer.text.slice(0, 300));
  const payload = sql(`select payload::text from module_event where type = 'prospect.won' and subject_id = '${fay.id}' order by seq desc limit 1`);
  ok("CS-K1s DW7 fail (stand-in): the prospect.won the offer is read from does hold that e-mail (so a leak would be caught)", payload.includes(fay.email), payload.slice(0, 120));

  ok("CS-K1s: no error on any page walked", errs.length === 0, errs);
} finally {
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
