// PF-30s (R1.102 "find a person or case"; BACKLOG row PF-30s; concept screens/PF-30s/concept.md): the find box in the
// staff frames' top bar, against the real API (PF-30a's `GET /api/platform/find`, FO-2's `POST leads`, FO-3's engage) on
// an isolated copy, walked in a browser like a person. Each rule has a pass and a fail:
//   F1 BR-4/5  find by name: the lead's person is listed under "Leads and prospects" with the name highlighted and
//              "Matched: Name"; Enter opens it. A name nobody has shows the empty line and no row
//   F2 BR-5    find by file number: the prospect's P-number lists it; a click opens the prospect. A number nobody has: empty
//   F3         find by email: "Matched: Email"
//   F4 BR-1    "/" focuses the box from a page; "/" typed in another text field stays in that field
//   F5 BR-2    1 character sends no request; 2 characters send one after the pause
//   F6         a view.own user sees no hit for a colleague's lead; the colleague (who owns it) does
//   F7 BR-6    the API failing shows "Search is not available right now. Try again." and keeps the text; it recovers
//   F8 BR-7    a late answer for an older text never replaces the newer one
//   F9 BR-5    keyboard: ArrowDown marks a row (aria-activedescendant), Enter opens that row; Escape closes, then clears
//   F10        the count is said in the live region; the Sales frame has the same box; axe (WCAG 2.1 A/AA) with the list
//              open; no sideways scroll at 375, 1024 and 1440 px; no page error
// Sample rows only; US$0, no model call. Usage, from prototype/:
//   zsh studio/tools/isolated.sh screens_find 4563 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf30s_find_box_browser.ts 4563 xr_studio_screens_find
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { WORDS } from "../web/src/modules/platform/find/find-words.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4563), DBNAME = process.argv[3] ?? "xr_studio_screens_find", BASE = `http://localhost:${PORT}`;
const STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-30s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
// Letters only, so the name search reads the tag as part of the name.
const run = Date.now().toString(36).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
// F6 needs "each person sees their own", so the Case Manager's lead is one the Case Officer may not open.
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:PF-30s-test", workspaceId: await platformAuditWorkspaceId(db as never), reason: "PF-30s: each person sees their own" });
await db.$disconnect();
const staffOf = (actor: string) => { const [id, email] = sql(`select id || '|' || email from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email }; };
const T = staffOf("user-T"), O = staffOf("user-O");   // Case Manager, Case Officer (sees own)
async function signIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { T: await signIn(T.email), O: await signIn(O.email) };
const call = async (t: string, path: string, body?: unknown) => { const r = await fetch(`${BASE}/api/front-office/${path}`, { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as Record<string, unknown> | null }; };

// Sample people: Lena (a lead, the Case Officer's), Omar (engaged: a prospect with a P-number), Hidden (the Case Manager's).
const lena = await call(tok.O, "leads", { requestId: randomUUID(), givenNames: `Lena${run}`, familyName: "Park", email: `lena.${run}@example.org`, source: "Phone call", confirmedNew: true });
const omar = await call(tok.O, "leads", { requestId: randomUUID(), givenNames: `Omar${run}`, familyName: "Haddad", email: `omar.${run}@example.org`, source: "Phone call", confirmedNew: true });
const hidden = await call(tok.T, "leads", { requestId: randomUUID(), givenNames: `Hidden${run}`, familyName: "Sample", email: `hidden.${run}@example.org`, source: "Referral", confirmedNew: true });
const LENA_LEAD = String(lena.body?.id ?? ""), OMAR_LEAD = String(omar.body?.id ?? "");
const prospect = await call(tok.O, `leads/${OMAR_LEAD}/engage`);
const PID = String(prospect.body?.id ?? ""), PNUM = sql(`select number from fo_prospect where id = '${PID}'`);
ok("PF-30s setup: three Sample leads and one prospect with a P-number", lena.status === 201 && omar.status === 201 && hidden.status === 201 && /^P-\d+$/.test(PNUM), { lena: lena.status, omar: omar.status, hidden: hidden.status, prospect: prospect.status, PNUM });

const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") && process.platform !== "darwin" ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {});
const errors: string[] = [], took: number[] = [];
let stubbed = false;   // the timing leaves out the answers this check makes up itself (review m6c)
async function pageAs(t: string, width = 1440): Promise<{ p: Page; asks: string[] }> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e)));
  const asks: string[] = [];
  p.on("request", (r) => { if (r.url().includes("/api/platform/find")) asks.push(new URL(r.url()).searchParams.get("q") ?? ""); });
  p.on("requestfinished", (r) => { if (r.url().includes("/api/platform/find")) { const t = r.timing(); if (t.responseEnd > 0 && !stubbed) took.push(t.responseEnd - t.requestStart); } });
  return { p, asks };
}
const box = (p: Page) => p.locator("[data-find-input]");
const hits = (p: Page) => p.locator("[data-find-hit]");
async function home(p: Page) { await p.goto(`${BASE}/home`); await p.locator("[data-find]").waitFor({ state: "attached", timeout: 30_000 }); }
/** Types like a person (key by key) into the box and waits until the answer for this text has been drawn. */
async function find(p: Page, text: string) {
  if (!(await box(p).isVisible())) await p.locator("[data-find-open]").click();
  await box(p).click(); await box(p).fill(""); await box(p).pressSequentially(text, { delay: 20 });
  await p.waitForFunction(() => { const l = document.querySelector("[data-find-live]")?.textContent ?? ""; return l !== "" && l !== "Searching…"; }, undefined, { timeout: 15_000 });
  await p.waitForTimeout(150);
}
const live = (p: Page) => p.locator("[data-find-live]").innerText();

try {
  const { p: o, asks } = await pageAs(tok.O);
  await home(o);

  ok("PF-30s privacy: the box asks the browser to keep nothing typed (autocomplete off, no name)", (await box(o).getAttribute("autocomplete")) === "off" && (await box(o).getAttribute("name")) === null);
  // ---------------------------------------------------------------- F1 by name
  await find(o, `Lena${run}`);
  const row = hits(o).first();
  ok("PF-30s F1 pass (BR-3, BR-4): a name lists the person under Leads and prospects, the typed text highlighted, \"Matched: Name\"",
    (await hits(o).count()) >= 1 && (await o.locator("[data-find-group='Leads and prospects']").count()) === 1 && (await row.locator("mark").innerText()).toLowerCase() === `lena${run}` && (await row.innerText()).includes("Matched: Name") && (await row.innerText()).includes("Lead L-"), await row.innerText().catch(() => ""));
  await o.screenshot({ path: join(SHOTS, "pf30s-01-by-name-1440.png") });
  await box(o).press("Enter");
  await o.waitForURL(`**/front-office/leads/${LENA_LEAD}`, { timeout: 15_000 }).catch(() => undefined);
  ok("PF-30s F1 pass (BR-5): Enter opens the first row, the lead's page, and the box is cleared", o.url().endsWith(`/front-office/leads/${LENA_LEAD}`) && (await box(o).inputValue()) === "", o.url());
  await find(o, `Zzqx${run}`);
  ok("PF-30s F1 fail: a name nobody has shows \"No matches. Try an email, phone or file number\" and no row",
    (await hits(o).count()) === 0 && (await o.locator("[data-find-line='done']").innerText()) === WORDS.empty);
  await o.screenshot({ path: join(SHOTS, "pf30s-02-empty-1440.png") });

  // ---------------------------------------------------------------- F2 by file number
  await home(o);
  await find(o, PNUM.toLowerCase());
  const prow = o.locator("[data-find-hit='prospect']").first();
  ok("PF-30s F2 pass: the prospect's file number (typed in lower case) lists it, \"Matched: File number\"", (await prow.count()) === 1 && (await prow.innerText()).includes(PNUM) && (await prow.innerText()).includes("Matched: File number"), await prow.innerText().catch(() => ""));
  await o.screenshot({ path: join(SHOTS, "pf30s-03-by-number-1440.png") });
  await prow.click();
  await o.waitForURL(`**/front-office/prospects/${PID}`, { timeout: 15_000 }).catch(() => undefined);
  ok("PF-30s F2 pass: a click opens the prospect's page", o.url().endsWith(`/front-office/prospects/${PID}`), o.url());
  await find(o, "P-99999999");
  ok("PF-30s F2 fail: a file number nobody has shows the empty line", (await hits(o).count()) === 0 && (await o.locator("[data-find-line='done']").innerText()) === WORDS.empty);

  // ---------------------------------------------------------------- F3 by email
  await find(o, `LENA.${run}@EXAMPLE.ORG`);
  ok("PF-30s F3 pass: an email (any case) lists the person with \"Matched: Email\"", (await hits(o).count()) === 1 && (await hits(o).first().innerText()).includes("Matched: Email"));
  await find(o, `nobody.${run}@example.org`);
  ok("PF-30s F3 fail: an email nobody has lists no one", (await hits(o).count()) === 0);

  // ---------------------------------------------------------------- F4 "/"
  await home(o);
  await o.locator("main").click({ position: { x: 5, y: 5 } });
  await o.keyboard.press("/");
  ok("PF-30s F4 pass (BR-1): \"/\" on a page focuses the box, and no \"/\" is typed into it", await box(o).evaluate((el) => el === document.activeElement) && (await box(o).inputValue()) === "");
  await o.evaluate(() => { const i = document.createElement("input"); i.id = "pf30s-other"; i.setAttribute("aria-label", "Other field"); document.querySelector("main")!.prepend(i); });
  await o.locator("#pf30s-other").focus(); await o.keyboard.press("/");
  ok("PF-30s F4 fail (BR-1): \"/\" typed in another text field stays in that field; the box keeps no focus",
    (await o.locator("#pf30s-other").inputValue()) === "/" && !(await box(o).evaluate((el) => el === document.activeElement)));
  await o.keyboard.press("Meta+k"); await o.keyboard.press("Control+k");
  ok("PF-30s F4 (AG-02): Cmd+K and Ctrl+K do not open the box", !(await box(o).evaluate((el) => el === document.activeElement)));

  // ---------------------------------------------------------------- F5 1 character
  await home(o);
  asks.length = 0;
  await box(o).click(); await box(o).pressSequentially("L"); await o.waitForTimeout(800);
  ok("PF-30s F5 fail (BR-2): one character sends no request and shows no list", asks.length === 0 && (await o.locator("[data-find-popup]").count()) === 0, asks);
  await box(o).pressSequentially("e", { delay: 20 }); await o.waitForTimeout(900);
  ok("PF-30s F5 pass (BR-2): a second character sends one request after the pause", asks.length === 1 && asks[0] === "Le", asks);
  asks.length = 0;
  await box(o).fill(""); await box(o).pressSequentially(`Lena${run}`, { delay: 30 }); await o.waitForTimeout(900);
  ok("PF-30s F5 pass (BR-2): typing a whole name key by key sends one request (the pause), not one per key", asks.length === 1, asks);

  // ---------------------------------------------------------------- F6 view.own
  await find(o, `Hidden${run}`);
  ok("PF-30s F6 fail: the Case Officer (each sees their own) gets no hit for the Case Manager's lead", (await hits(o).count()) === 0 && (await o.locator("[data-find-line='done']").innerText()) === WORDS.empty);
  const { p: t } = await pageAs(tok.T); await home(t);
  await find(t, `Hidden${run}`);
  ok("PF-30s F6 pass: the Case Manager, who owns it, finds it", (await hits(t).count()) === 1);
  await t.context().close();

  // ---------------------------------------------------------------- F7 error, then recovery
  await home(o);
  stubbed = true;
  await o.route("**/api/platform/find**", (r) => r.fulfill({ status: 500, contentType: "application/problem+json", body: JSON.stringify({ title: "Server error", status: 500 }) }));
  await find(o, `Lena${run}`);
  ok("PF-30s F7 pass (BR-6): a failing API shows \"Search is not available right now. Try again.\" and keeps the text",
    (await o.locator("[data-find-line='error']").innerText()) === WORDS.error && (await box(o).inputValue()) === `Lena${run}` && (await hits(o).count()) === 0);
  await o.screenshot({ path: join(SHOTS, "pf30s-04-error-1440.png") });
  const asked = asks.length; await box(o).press("Enter"); await o.waitForTimeout(700);
  ok("PF-30s F7 pass (break m5): Enter on the error line asks again (\"Try again\" works from the keyboard)", asks.length === asked + 1, { before: asked, after: asks.length });
  await o.unroute("**/api/platform/find**"); stubbed = false;
  await box(o).press("Backspace");
  await o.waitForFunction(() => (document.querySelector("[data-find-live]")?.textContent ?? "").includes("result"), undefined, { timeout: 15_000 }).catch(() => undefined);
  ok("PF-30s F7 fail: once the API answers again, the next key shows results (the error does not stick)", (await o.locator("[data-find-line='error']").count()) === 0 && (await hits(o).count()) >= 1);

  // ---------------------------------------------------------------- F8 late answer
  await home(o); stubbed = true;
  await o.route("**/api/platform/find**", async (r) => {
    if (new URL(r.request().url()).searchParams.get("q") === "Om") {
      await new Promise((res) => setTimeout(res, 1500));
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ groups: [{ kind: "person", hits: [{ kind: "person", id: randomUUID(), title: "Stale answer", subtitle: null, matched_on: ["NAME"], url: "/home" }] }], partial: false, message: null }) });
    } else await r.continue();
  });
  await box(o).click(); await box(o).pressSequentially("Om"); await o.waitForTimeout(400);
  await box(o).pressSequentially(`ar${run}`, { delay: 20 });
  await o.waitForTimeout(2200);
  const texts = await hits(o).allInnerTexts();
  ok("PF-30s F8 pass (BR-7): the late answer for \"Om\" never replaces the answer for the full name", texts.length >= 1 && texts.every((x) => !x.includes("Stale answer")) && texts.some((x) => x.includes(`Omar${run}`)), texts);
  ok("PF-30s F8 fail: the stale row is nowhere on the page", (await o.getByText("Stale answer").count()) === 0);
  await o.unroute("**/api/platform/find**"); stubbed = false;

  // ---------------------------------------------------------------- F9 keyboard
  await home(o);
  // Two people named Kit<run> so the second row can be chosen with the keyboard.
  const k1 = await call(tok.O, "leads", { requestId: randomUUID(), givenNames: `Kit${run}`, familyName: "Alder", email: `kit.a.${run}@example.org`, source: "Phone call", confirmedNew: true });
  const k2 = await call(tok.O, "leads", { requestId: randomUUID(), givenNames: `Kit${run}`, familyName: "Birch", email: `kit.b.${run}@example.org`, source: "Phone call", confirmedNew: true });
  await o.keyboard.press("/"); await o.keyboard.type(`Kit${run}`, { delay: 20 });
  await o.waitForFunction(() => (document.querySelector("[data-find-live]")?.textContent ?? "").includes("result"), undefined, { timeout: 15_000 });
  const firstMarked = (await hits(o).first().getAttribute("aria-selected")) === "true";
  await o.keyboard.press("ArrowDown");
  const activeId = await box(o).getAttribute("aria-activedescendant");
  const second = hits(o).nth(1);
  const secondTitle = await second.innerText();
  ok("PF-30s F9 pass: the first row is marked as Enter's target, and ArrowDown marks the second (aria-activedescendant, aria-selected)", firstMarked && k1.status === 201 && k2.status === 201 && !!activeId && activeId === await second.getAttribute("id") && (await second.getAttribute("aria-selected")) === "true", { activeId });
  await o.keyboard.press("Enter");
  await o.waitForURL("**/front-office/leads/*", { timeout: 15_000 }).catch(() => undefined);
  const openedId = o.url().split("/").pop();
  const want = secondTitle.includes("Birch") ? k2.body?.id : k1.body?.id;
  ok("PF-30s F9 pass: Enter opens the marked row, not the first", openedId === want, { openedId, want, secondTitle });
  await o.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 30_000 }); await box(o).waitFor({ timeout: 30_000 });
  await o.keyboard.press("/"); await o.keyboard.type(`Kit${run}`, { delay: 20 });
  await o.waitForFunction(() => (document.querySelector("[data-find-live]")?.textContent ?? "").includes("result"), undefined, { timeout: 15_000 });
  await o.keyboard.press("Escape");
  ok("PF-30s F9 fail: the first Escape closes the list and keeps the text", (await o.locator("[data-find-popup]").count()) === 0 && (await box(o).inputValue()) === `Kit${run}` && (await box(o).getAttribute("aria-expanded")) === "false");
  await o.keyboard.press("Escape");
  ok("PF-30s F9 fail: the second Escape clears the box", (await box(o).inputValue()) === "");

  // ---------------------------------------------------------------- F10 live region, Sales frame, axe, widths
  await find(o, `Kit${run}`);
  ok("PF-30s F10: the live region says the count (\"2 results\")", (await live(o)).includes(WORDS.count(2)), await live(o));
  const axe = await new AxeBuilder({ page: o }).include("header").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  ok("PF-30s F10: the top bar with the list open passes axe (WCAG 2.1 A and AA)", axe.violations.length === 0, axe.violations.map((v) => `${v.id}: ${v.help}`));
  await o.goto(`${BASE}/front-office/leads`); await box(o).waitFor({ timeout: 30_000 });
  await find(o, `Lena${run}`);
  ok("PF-30s F10: the Sales frame has the same box, with the same answer", (await hits(o).count()) >= 1 && (await o.locator("header [data-find]").count()) === 1);
  // ---------------------------------------------------------------- F11 stubbed answers: the rules with no real data for them (review m3)
  const stub = async (answer: unknown, status = 200) => { stubbed = true; await o.unroute("**/api/platform/find**").catch(() => undefined); await o.route("**/api/platform/find**", (r) => r.fulfill({ status, contentType: "application/json", body: JSON.stringify(answer) })); };
  const hit = (kind: string, title: string, i = 0) => ({ kind, id: randomUUID(), title, subtitle: null, matched_on: ["NAME"], url: `/home?h=${i}` });
  await home(o);
  await stub({ groups: [{ kind: "widget", hits: [hit("widget", "Gadget one")] }], partial: false, message: null });
  await find(o, "Gadget");
  ok("PF-30s F11 pass (BR-3): a kind the box has no words for shows under \"Other\", never hidden", (await o.locator("[data-find-group='Other']").count()) === 1 && (await hits(o).count()) === 1);
  await stub({ groups: [{ kind: "person", hits: [hit("person", "Gadget two")] }], partial: false, message: null });
  await find(o, "Gadgets");
  ok("PF-30s F11 fail (BR-3): a known kind shows under its own words, not Other", (await o.locator("[data-find-group='Other']").count()) === 0 && (await o.locator("[data-find-group='Leads and prospects']").count()) === 1);
  await stub({ groups: [], partial: true, message: "Some results could not be loaded" });
  await find(o, "Partial");
  ok("PF-30s F11 pass (BR-6): a partial answer with no hits shows the partial line and \"No matches in what loaded.\"", (await o.locator("[data-find-partial]").innerText()) === "Some results could not be loaded" && (await o.locator("[data-find-line='done']").innerText()) === WORDS.emptyPartial);
  await stub({ groups: [{ kind: "person", hits: [hit("person", "Partial one")] }], partial: true, message: "Some results could not be loaded" });
  await find(o, "Partial o");
  ok("PF-30s F11 fail (BR-6): a partial answer with hits shows the line above them, not \"No matches\"", (await o.locator("[data-find-partial]").count()) === 1 && (await hits(o).count()) === 1 && (await o.locator("[data-find-line='done']").count()) === 0);
  await stub({ groups: [{ kind: "person", hits: Array.from({ length: 8 }, (_, i) => hit("person", `Many ${i}`, i)) }], partial: false, message: null });
  await find(o, "Many");
  ok("PF-30s F11 pass (BR-6): a kind at the finder's cap of 8 says \"8 best matches. Type more to narrow.\"", (await live(o)).includes(WORDS.count(8, true)), await live(o));
  // Break M2: on a short window the list scrolls, and the row the arrows mark is always in sight.
  await o.setViewportSize({ width: 1440, height: 400 });
  for (let k = 0; k < 7; k++) await box(o).press("ArrowDown");
  const sight = await o.evaluate(() => { const pop = document.querySelector("[data-find-popup]")!.getBoundingClientRect(), row = document.querySelector("[data-find-hit][aria-selected='true']")!.getBoundingClientRect(); return { inside: row.top >= pop.top - 1 && row.bottom <= pop.bottom + 1, row: Math.round(row.top), pop: [Math.round(pop.top), Math.round(pop.bottom)] }; });
  ok("PF-30s F11 pass (break M2): on a 400 px high window the 8th marked row is scrolled into the list's view", sight.inside, sight);
  await box(o).press("ArrowDown");
  const wrap = await o.evaluate(() => { const pop = document.querySelector("[data-find-popup]")!.getBoundingClientRect(), row = document.querySelector("[data-find-hit][aria-selected='true']")!.getBoundingClientRect(); return row.top >= pop.top - 1 && row.bottom <= pop.bottom + 1; });
  ok("PF-30s F11 fail (break M2): wrapping back to the first row scrolls it back into view", wrap);
  await o.setViewportSize({ width: 1440, height: 900 });
  await stub({ groups: [{ kind: "person", hits: Array.from({ length: 5 }, (_, i) => hit("person", `Many ${i}`, i)) }, { kind: "company", hits: Array.from({ length: 4 }, (_, i) => hit("company", `Many co ${i}`, i)) }], partial: false, message: null });
  await find(o, "Many c");
  ok("PF-30s F11 fail (review r2 n3): 5 people + 4 companies (one finder, 9 rows over its cap of 8) say \"9 best matches\"", (await live(o)).includes(WORDS.count(9, true)), await live(o));
  await stub({ groups: [{ kind: "person", hits: Array.from({ length: 4 }, (_, i) => hit("person", `Many ${i}`, i)) }, { kind: "case", hits: Array.from({ length: 3 }, (_, i) => hit("case", `Many case ${i}`, i)) }], partial: false, message: null });
  await find(o, "Many ca");
  ok("PF-30s F11 fail (review m6b): 7 rows from two finders, neither at its cap, say \"7 results\"", (await live(o)).includes("7 results") && !(await live(o)).includes("best"), await live(o));
  await stub({ groups: [{ kind: "person", hits: [hit("person", "Zoë Ångström")] }], partial: false, message: null });
  await find(o, "zoe");
  ok("PF-30s F11 pass (BR-4): the highlight ignores case and accents (\"zoe\" marks \"Zoë\")", (await hits(o).first().locator("mark").innerText()) === "Zoë");
  await stub({ groups: [{ kind: "person", hits: [{ ...hit("person", "Mira Sample"), matched_on: ["EMAIL"] }] }], partial: false, message: null });
  await find(o, "mira@example.org");
  ok("PF-30s F11 fail (BR-4): an email match marks nothing in the name", (await hits(o).first().locator("mark").count()) === 0 && (await hits(o).first().innerText()).includes("Matched: Email"));
  const before = asks.length;
  await box(o).fill("x".repeat(101)); await o.waitForTimeout(600);
  ok("PF-30s F11 fail (BR-2): over 100 characters sends nothing and says \"Type 2 to 100 characters to search.\"", asks.length === before && (await o.locator("[data-find-line='tooLong']").innerText()) === WORDS.tooLong);
  // Enter during the pause opens the first hit of the answer for what was typed (review m5).
  await o.unroute("**/api/platform/find**"); stubbed = false;
  await box(o).fill(""); await box(o).pressSequentially(`Lena${run}`, { delay: 10 }); await box(o).press("Enter");
  await o.waitForURL(`**/front-office/leads/${LENA_LEAD}`, { timeout: 15_000 }).catch(() => undefined);
  ok("PF-30s F11 pass (review m5): Enter pressed before the answer arrives opens its first hit once it does", o.url().endsWith(`/front-office/leads/${LENA_LEAD}`), o.url());
  await home(o);
  await box(o).click(); await box(o).pressSequentially(`Zzqx${run}`, { delay: 10 }); await box(o).press("Enter"); await o.waitForTimeout(900);
  ok("PF-30s F11 fail (review m5): Enter before an empty answer opens nothing; the empty line shows", new URL(o.url()).pathname === "/home" && (await o.locator("[data-find-line='done']").innerText()) === WORDS.empty);
  // Review r2 n2: Escape cancels an Enter pressed during the pause.
  await o.route("**/api/platform/find**", async (r) => { await new Promise((res) => setTimeout(res, 1200)); await r.continue(); });
  await box(o).fill(""); await box(o).pressSequentially(`Lena${run}`, { delay: 10 }); await box(o).press("Enter"); await box(o).press("Escape"); await o.waitForTimeout(2000);
  ok("PF-30s F11 fail (review r2 n2): Enter during the pause, then Escape, opens nothing", new URL(o.url()).pathname === "/home", o.url());
  await o.unroute("**/api/platform/find**");
  // Review r2 n1: at 1440 px, after "/", three Escapes leave the box (close the list, clear, leave).
  await box(o).press("Escape"); await box(o).press("Escape"); await o.locator("main").click({ position: { x: 5, y: 5 } });
  await o.keyboard.press("/"); await o.keyboard.type("Le"); await o.waitForTimeout(700);
  await o.keyboard.press("Escape"); await o.keyboard.press("Escape"); await o.keyboard.press("Escape");
  ok("PF-30s F11 pass (review r2 n1): at 1440 px three Escapes leave the box, and its text is cleared", !(await box(o).evaluate((el) => el === document.activeElement)) && (await box(o).inputValue()) === "");
  // BR-1: modifier keys and an open dialog keep "/" for the page.
  await box(o).press("Escape"); await box(o).press("Escape"); await o.locator("main").click({ position: { x: 5, y: 5 } });
  await o.keyboard.press("Control+/"); await o.keyboard.press("Alt+/");
  ok("PF-30s F11 fail (BR-1): Ctrl+/ and Alt+/ do not open the box", !(await box(o).evaluate((el) => el === document.activeElement)));
  await o.evaluate(() => { const d = document.createElement("div"); d.setAttribute("role", "dialog"); d.id = "pf30s-dialog"; const b = document.createElement("button"); b.textContent = "In the dialog"; d.append(b); document.body.append(d); b.focus(); });
  await o.keyboard.press("/");
  ok("PF-30s F11 fail (BR-1, review m2): \"/\" while a dialog (role=dialog, no aria-modal, as the team's Dialog) is open does not open the box", !(await box(o).evaluate((el) => el === document.activeElement)) && (await o.locator("[data-find-popup]").count()) === 0);
  await o.evaluate(() => document.getElementById("pf30s-dialog")?.remove());
  await o.locator("main").click({ position: { x: 5, y: 5 } }); await o.keyboard.press("/");
  ok("PF-30s F11 pass (BR-1): with the dialog gone, \"/\" opens the box again", await box(o).evaluate((el) => el === document.activeElement));
  // A 401 hands over to the sign-in card: no error line on top of it (BR-6). Last, as it ends this browser's session.
  await stub({ type: "about:blank", title: "Sign in", status: 401, code: "NOT_SIGNED_IN" }, 401);
  await find(o, "Anyone").catch(() => undefined);
  await o.locator("[data-sign-in-card]").waitFor({ timeout: 15_000 }).catch(() => undefined);
  ok("PF-30s F11 (BR-6): a 401 shows the sign-in card and no error line; the box goes with the session", (await o.locator("[data-sign-in-card]").count()) === 1 && (await o.locator("[data-find-line='error']").count()) === 0 && (await o.locator("[data-find]").count()) === 0);
  stubbed = false;
  await o.context().close();
  for (const w of [375, 640, 700, 768, 1024, 1440]) {
    const { p } = await pageAs(tok.O, w); await home(p);
    await find(p, `Kit${run}`);
    await p.screenshot({ path: join(SHOTS, `pf30s-05-open-${w}.png`) });

    ok(`PF-30s F10: no sideways page scroll with the list open at ${w} px, and the list fits the window`,
      !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) && await p.locator("[data-find-popup]").evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
    if (w < 768) {
      // Break M3: Tab out of the bar closes it, so focus never lands on a control hidden under it.
      await box(p).focus(); await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); await p.waitForTimeout(100);
      const hidden = await p.evaluate(() => { const a = document.activeElement as HTMLElement | null; if (!a || a === document.body) return false; const r = a.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(top === a || a.contains(top)); });
      ok(`PF-30s F10 (break M3): at ${w} px Tab out of the open bar closes it; the focused control is not hidden under it`, !hidden && (await p.locator("[data-find-open]").isVisible()));
      await p.locator("[data-find-open]").click(); await box(p).pressSequentially(`Kit${run}`, { delay: 10 });
      await p.locator("[data-find-close]").click(); await p.waitForTimeout(150);
      ok(`PF-30s F10 (review m4): at ${w} px Close gives focus back to the Find button`, await p.locator("[data-find-open]").evaluate((el) => el === document.activeElement));
      // Review r3-1: three Escapes from the open bar also give focus back to the Find button, never to the page.
      await p.locator("[data-find-open]").click(); await box(p).pressSequentially("Le", { delay: 10 }); await p.waitForTimeout(600);
      for (let k = 0; k < 3; k++) { await p.keyboard.press("Escape"); await p.waitForTimeout(60); }
      await p.waitForTimeout(150);
      ok(`PF-30s F10 (review r3-1): at ${w} px the third Escape gives focus back to the Find button`, await p.locator("[data-find-open]").evaluate((el) => el === document.activeElement));
    } else {
      // Closed box: the input never covers the person's name (review M1: 640-719 px overlapped it).
      await box(p).press("Escape"); await box(p).press("Escape");
      const cover = await p.evaluate(() => { const a = document.querySelector("[data-find-input]")!.getBoundingClientRect(), n = document.querySelector("[data-staff-name]")?.getBoundingClientRect(); return n ? Math.max(0, a.right - n.left) : 0; });
      ok(`PF-30s F10 (review M1): at ${w} px the box does not cover the staff name`, cover === 0, cover);
    }
    await p.context().close();
  }
  const sorted = [...took].sort((x, y) => x - y), p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  ok("PF-30s F10 (STANDARDS §9, search under 200 ms): the find door answered the box's requests on this copy's Sample firms with p95 under 200 ms", took.length >= 10 && p95 < 200, { n: took.length, p95: Math.round(p95), max: Math.round(sorted.at(-1) ?? 0) });
  // Review r4-1/r4-3: with the box closed and a long staff name, every top-bar control is whole, on top (a click on its
  // centre lands on it) and at least 24 px; axe with WCAG 2.2 AA passes on the top bar. The name gives way, never a control.
  const LONG = "Second representative of the Sample firm (Sample)";
  for (const w of [320, 375, 768, 850, 1024]) {
    const { p } = await pageAs(tok.O, w);
    await p.route("**/api/platform/me", async (r) => { const res = await r.fetch(); const j = await res.json() as Record<string, unknown>; await r.fulfill({ response: res, json: { ...j, displayName: LONG } }); });
    await home(p); await p.locator("[data-staff-name], [data-find-open], [data-find-input]").first().waitFor({ state: "attached", timeout: 30_000 });
    ok(`PF-30s F12 (review r5-1): at ${w} px the help button is in the top bar, so this check covers it`, (await p.locator('header [aria-label="Get help with this page"]').count()) === 1);
    // Review r5-2: the placeholder fits its box (measured with the input's own font against its text area).
    const clip = await p.evaluate(() => { const i = document.querySelector<HTMLInputElement>("[data-find-input]"); if (!i || i.getBoundingClientRect().width === 0) return 0; const s = getComputedStyle(i), c = document.createElement("canvas").getContext("2d")!; c.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; return Math.max(0, Math.ceil(c.measureText(i.placeholder).width - (i.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight)))); });
    ok(`PF-30s F12 (review r5-2): at ${w} px the placeholder is not cut off`, clip === 0, clip);
    const hidden = await p.evaluate(() => [...document.querySelectorAll("header button, header a, header input")].filter((el) => { const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return false; const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(at === el || el.contains(at)) || r.width < 24 || r.height < 24; }).map((el) => el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? (el.textContent ?? "").trim()));
    ok(`PF-30s F12 (review r4-1): at ${w} px with a long name every top-bar control is whole and on top (help button, Find, Sign out)`, hidden.length === 0, hidden);
    const axe22 = await new AxeBuilder({ page: p }).include("header").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    ok(`PF-30s F12: at ${w} px the top bar passes axe with WCAG 2.2 AA (target size)`, axe22.violations.length === 0, axe22.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`));
    ok(`PF-30s F12 (review r4-2): at ${w} px no sideways page scroll with a long name`, !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)));
    await p.context().close();
  }
  ok("PF-30s F10: no page error in any browser", errors.length === 0, errors);
} finally { await browser.close(); }
process.exit(summary() ? 1 : 0);
