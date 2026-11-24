// PF-17 part 4 PR C (R1.93; concept r2 screens/PF-17-4/concept.md §4d, §4e, §6 B4-B6; Lead 15 on #3225; Lead 30 on #3489):
// our console's Support page and its ticket panel, walked in a browser on an isolated copy (its own database and port,
// never :4400), each checked against the API and the database underneath, with a pass and a fail each:
//   P    the page's words (contract.ts): ticket status, age;
//   B4   the queue lists a firm's "?" ticket with the firm's name and live plan (j_93 W4; BR-5), in the server's order,
//        with its status, raiser, page and messages; B4b the status chips and the firm filter narrow it as the API does;
//        fail: a status the API refuses names its field;
//   B5   a row opens the ticket's panel (thread in order, firm and plan in its header); a reply is sent and the ticket is
//        then "Waiting on firm", stored once as ours (SUPPORT); fail: a blank reply shows the API's words on the box and
//        stores nothing; B5b a closed ticket's panel offers no reply and says why;
//   B6   keys (BR-1): Billing (no system/support:list) has no Support in the menu and reads the API's words by address;
//        an Auditor (list, no manage) reads the ticket and gets no composer, with the reason;
//   B9c  keyboard only (a row opens with Enter, Escape closes and the focus returns to it), axe-core WCAG 2.2 A/AA 0 on
//        the page and the panel at 1440, 1024 and 375 px, no sideways page scroll.
// Sample firms, staff and tickets only (written into the copy like check_pf17_support.ts does); US$0, no model call; live
// AI off. Screenshots (deviceScaleFactor 1) in product/screens/PF-17-4/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh pf17s 4465 start AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && tsx studio/tests/check_pf17_support_browser.ts 4465 xr_studio_pf17s
// (the form run-suites.sh reads; it starts and stops the copy itself. By hand, stop it after: isolated.sh pf17s 4465 stop)
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
import { ageWords, SESSION_KEY, STATUS_WORDS, SUPPORT_COPY } from "../web/src/modules/system/contract.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4465), process.argv[3] ?? "xr_studio_pf17s"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-17-4", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, path: string, method = "GET", body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j };
};
const ourToken = async (email: string) => {
  const r = await api(null, "/system/session/local", "POST", { email, secondStep: true });
  if (!r.body?.token) { console.error(`STOP  our sign-in refused for ${email} (PLATFORM_SYSTEM_IDENTITY=local): ${JSON.stringify(r.body).slice(0, 300)}`); process.exit(2); }
  return r.body.token as string;
};
const seedStaff = (email: string, name: string, role: string) => sql(`with s as (insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${email}', '${name}') on conflict (email) do update set display_name = excluded.display_name returning id)
  insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), id, '${role}' from s where not exists (select 1 from plat_system_role_grant g where g.staff_id = s.id) returning staff_id`);

// ------------------------------------------------------------------------------------------------ P: the page's words
{
  const now = Date.UTC(2026, 10, 24, 12);
  ok("PF-17 P pass: ticket status in words: New, Waiting on us, Waiting on firm, Closed",
    STATUS_WORDS.OPEN === "New" && STATUS_WORDS.WAITING_ON_SUPPORT === "Waiting on us" && STATUS_WORDS.WAITING_ON_FIRM === "Waiting on firm" && STATUS_WORDS.CLOSED === "Closed");
  ok("PF-17 P pass/fail: age in whole minutes, hours, then days (rounded down; never negative)",
    ageWords(new Date(now - 5 * 60_000).toISOString(), now) === "5 min" && ageWords(new Date(now - 125 * 60_000).toISOString(), now) === "2 h"
      && ageWords(new Date(now - 50 * 3_600_000).toISOString(), now) === "2 d" && ageWords(new Date(now + 60_000).toISOString(), now) === "0 min");
}

// ------------------------------------------------------------------------------------------------ setup (Sample)
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const nameA = sql(`select operating_name from platform_firm where id = '${A}'`);
const staffOf = (f: string) => sql(`select id from platform_staff where firm_id = '${f}' order by display_name limit 1`);
const run = Date.now().toString(36);
const raise = (firm: string, words: string, page: string, status = "OPEN") => {
  // Raised open with its first message (a closed ticket takes no message: the database refuses it), then moved.
  const id = sql(`insert into platform_support_ticket (id, firm_id, raised_by, page, status, created_at, updated_at) values (gen_random_uuid(), '${firm}', '${staffOf(firm)}', '${page}', 'OPEN', now(), now()) returning id`);
  sql(`insert into platform_support_message (id, firm_id, ticket_id, author_kind, author_id, body, created_at) values (gen_random_uuid(), '${firm}', '${id}', 'FIRM_STAFF', '${staffOf(firm)}', '${words.replace(/'/g, "''")}', now()) returning id`);
  if (status !== "OPEN") sql(`update platform_support_ticket set status = '${status}', updated_at = now() where id = '${id}' returning id`);
  return id;
};
const tA = raise(A, `Sample ${run} one: the licences page shows two seats`, "/platform/licences");
const tB = raise(B, `Sample ${run} two: a booking question`, "/front-office/bookings", "WAITING_ON_FIRM");
const tC = raise(A, `Sample ${run} three: done already`, "/platform/me", "CLOSED");
const tD = raise(B, `Sample ${run} four: closed while we write`, "/platform/billing");
const tLong = raise(B, `Sample${run}five${"x".repeat(180)}`, "/platform/me", "WAITING_ON_FIRM");
seedStaff("auditor.pf17c@expatready.example.com", "Auditor (Sample)", "platform-auditor");
seedStaff("billing.pf17c@expatready.example.com", "Billing (Sample)", "platform-billing-ops");

const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errors: string[] = [];
const ctxAs = async (token: string, width = 1440, height = 900): Promise<BrowserContext> => {
  const c = await browser.newContext({ viewport: { width, height }, colorScheme: "light", reducedMotion: "reduce", deviceScaleFactor: 1 });
  await c.addInitScript(([k, x]) => sessionStorage.setItem(k, JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), [SESSION_KEY, token] as const);
  return c;
};
const pageIn = async (c: BrowserContext) => { const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
const axe = async (p: Page) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const heading = (p: Page) => p.getByRole("heading", { level: 1, name: /^Support$/ });
const rowOf = (p: Page, words: string) => p.getByRole("row").filter({ hasText: words });
const textOf = async (p: Page, words: string) => { const r = rowOf(p, words); return (await r.count()) === 1 ? (await r.innerText()).replace(/\s+/g, " ") : ""; };
try {
  const tSup = await ourToken("support.sample@expatready.example.com");
  // ---------------------------------------------------------------------------------------- B4 the queue
  const c4 = await ctxAs(tSup), p4 = await pageIn(c4);
  await p4.goto(`${BASE}/system/support`);
  const seen = await heading(p4).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  await rowOf(p4, `Sample ${run} one`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  const q = (await api(tSup, "/system/support/tickets")).body, itemA = q.tickets.find((t: { id: string }) => t.id === tA);
  const rA = await textOf(p4, `Sample ${run} one`);
  ok("PF-17 B4 pass (j_93 W4; Lead 15, BR-5): the queue shows firm A's ticket with firm A's name and its live plan, status New, raiser, page and messages as the API answers them",
    seen && !!itemA && rA.includes(nameA) && rA.includes(itemA.firm.plan?.name ?? SUPPORT_COPY.noPlan) && rA.includes("New") && rA.includes("/platform/licences") && rA.includes(itemA.raisedByName ?? "") && / 1 ?$/.test(rA), { rA, plan: itemA?.firm?.plan });
  const order = await p4.getByRole("row").allInnerTexts(), iOpen = order.findIndex((t) => t.includes(`Sample ${run} one`)), iFirm = order.findIndex((t) => t.includes(`Sample ${run} two`)), iClosed = order.findIndex((t) => t.includes(`Sample ${run} three`));
  ok("PF-17 B4 pass (BR-6): the page keeps the server's order: waiting on us before waiting on the firm before closed", iOpen > 0 && iOpen < iFirm && iFirm < iClosed, { iOpen, iFirm, iClosed });
  await p4.screenshot({ path: join(SHOTS, "03-support-1440.png"), fullPage: true });
  // B4b chips and the firm filter
  await p4.getByRole("button", { name: "Waiting on firm", exact: true }).click();
  await p4.waitForURL(/status=WAITING_ON_FIRM/, { timeout: 10_000 }).catch(() => undefined);
  await rowOf(p4, `Sample ${run} one`).waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);   // the last answer stays until the next arrives
  ok("PF-17 B4b pass: the \"Waiting on firm\" chip narrows to firm B's ticket (?status=WAITING_ON_FIRM), pressed state announced",
    (await textOf(p4, `Sample ${run} two`)) !== "" && (await textOf(p4, `Sample ${run} one`)) === "" && (await p4.getByRole("button", { name: "Waiting on firm", exact: true }).getAttribute("aria-pressed")) === "true");
  await p4.getByRole("button", { name: "All", exact: true }).click();
  await rowOf(p4, `Sample ${run} one`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  await rowOf(p4, `Sample ${run} one`).getByRole("link", { name: nameA }).click();
  await p4.waitForURL(new RegExp(`firm=${A}`), { timeout: 10_000 }).catch(() => undefined);
  await rowOf(p4, `Sample ${run} two`).waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
  ok("PF-17 B4b pass: the firm's name on a row filters by that firm (?firm=), and \"Clear firm\" shows its name",
    (await textOf(p4, `Sample ${run} one`)) !== "" && (await textOf(p4, `Sample ${run} two`)) === "" && (await p4.getByRole("button", { name: new RegExp(`Clear firm.*${nameA}`) }).count()) === 1);
  await p4.goto(`${BASE}/system/support?status=NOPE`);
  const refused = await p4.locator("[data-support-error]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-17 B4b fail (round 2, review #2): a status the API refuses names its field in words (\"Status:\"), with Clear filters", refused.includes("Status:") && (await p4.getByRole("button", { name: "Clear filters" }).count()) === 1, refused);
  await p4.goto(`${BASE}/system/support?page=9`);
  const past = await p4.locator("[data-support-past-end]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-17 B4b fail (round 2, review #3): a page past the end says so and offers page 1", past.includes(SUPPORT_COPY.pastEnd) && (await p4.getByRole("button", { name: "Go to page 1" }).count()) === 1, past);
  await p4.goto(`${BASE}/system/support?status=WAITING_ON_SUPPORT&firm=${A}`);
  const emptyNow = await p4.locator("[data-support-empty]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-17 B4b fail (round 2, review #7): an empty filtered list offers the way back to every ticket", emptyNow !== "" && (await p4.getByRole("button", { name: "Show every ticket" }).count()) === 1, emptyNow);

  // ---------------------------------------------------------------------------------------- B5 the ticket panel and a reply
  await p4.goto(`${BASE}/system/support`);
  await rowOf(p4, `Sample ${run} one`).waitFor({ timeout: 15_000 }).catch(() => undefined);
  await rowOf(p4, `Sample ${run} one`).locator("td").nth(5).click();   // the Age cell: the whole row opens it (concept §4d)
  const panel = p4.getByRole("dialog");
  const opened = await panel.locator("[data-ticket-head]").waitFor({ timeout: 10_000 }).then(() => true, () => false);
  const head = opened ? (await panel.innerText()).replace(/\s+/g, " ") : "";
  ok("PF-17 B5 pass (SA-10 §3.4; round 2, review #6): a click anywhere on the row opens the ticket's panel: its subject, firm A's name and plan, status and the firm's message",
    opened && head.includes(`Sample ${run} one`) && head.includes(nameA) && head.includes(itemA?.firm?.plan?.name ?? "—") && head.includes("New") && head.includes("shows two seats"), head.slice(0, 300));
  await p4.screenshot({ path: join(SHOTS, "04-ticket-1440.png") });
  await panel.getByRole("button", { name: "Send reply" }).click();
  const blankErr = await panel.locator("[data-reply-error]").innerText({ timeout: 10_000 }).catch(() => "");
  const msgs = () => Number(sql(`select count(*) from platform_support_message where ticket_id = '${tA}'`));
  ok("PF-17 B5 fail (BR-7): a blank reply shows the API's words on the box and stores nothing", blankErr !== "" && msgs() === 1, { blankErr, msgs: msgs() });
  await panel.getByLabel(SUPPORT_COPY.replyLabel).fill(`Sample ${run}: thanks, we are looking at your seats.`);
  await panel.getByRole("button", { name: "Send reply" }).click();
  await p4.waitForFunction((w) => { const d = document.querySelector('[role="dialog"]'); return !!d && d.textContent!.includes(w) && d.textContent!.includes("Waiting on firm"); }, `Sample ${run}: thanks`, { timeout: 10_000 }).catch(() => undefined);
  const after = (await panel.innerText()).replace(/\s+/g, " ");
  ok("PF-17 B5 pass: the reply shows in the thread as ExpatReady support, the ticket is then Waiting on firm, stored once as ours (SUPPORT)",
    after.includes(`Sample ${run}: thanks`) && after.includes("ExpatReady support") && after.includes("Waiting on firm")
      && sql(`select status from platform_support_ticket where id = '${tA}'`) === "WAITING_ON_FIRM" && sql(`select count(*) from platform_support_message where ticket_id = '${tA}' and author_kind = 'SUPPORT'`) === "1", after.slice(0, 300));
  await p4.keyboard.press("Escape");
  await rowOf(p4, `Sample ${run} one`).filter({ hasText: "Waiting on firm" }).waitFor({ timeout: 10_000 }).catch(() => undefined);
  ok("PF-17 B5 pass: closing the panel, the row now reads Waiting on firm (the list follows the reply)", (await textOf(p4, `Sample ${run} one`)).includes("Waiting on firm"));
  // B5b a closed ticket
  await p4.goto(`${BASE}/system/support?ticket=${tC}`);
  const closedNote = await p4.getByRole("dialog").locator("[data-reply-closed]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-17 B5b fail: a closed ticket's panel (opened by address) offers no reply box and says why", closedNote === SUPPORT_COPY.closed && (await p4.getByRole("dialog").getByRole("button", { name: "Send reply" }).count()) === 0, closedNote);
  // B5c (round 2, review and breaker M1): the ticket is closed while we write: the refused reply says so in our words,
  // the panel turns to the closed ticket (no box) and the row follows.
  await p4.goto(`${BASE}/system/support?ticket=${tD}`);
  await p4.getByRole("dialog").getByLabel(SUPPORT_COPY.replyLabel).fill(`Sample ${run}: a reply that will be refused`);
  sql(`update platform_support_ticket set status = 'CLOSED', updated_at = now() where id = '${tD}' returning id`);
  await p4.getByRole("dialog").getByRole("button", { name: "Send reply" }).click();
  const gone = await p4.getByRole("dialog").locator("[data-reply-closed-now]").innerText({ timeout: 10_000 }).catch(() => "");
  await p4.getByRole("dialog").locator("[data-reply-closed]").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const head409 = await p4.getByRole("dialog").locator("[data-ticket-head]").innerText().catch(() => "");
  ok("PF-17 B5c fail (BR-7): a reply refused because the ticket closed meanwhile says so in our words; the panel shows it Closed with no box; nothing stored",
    gone === SUPPORT_COPY.closedWhileWriting && head409.includes("Closed") && (await p4.getByRole("dialog").getByRole("button", { name: "Send reply" }).count()) === 0
      && sql(`select count(*) from platform_support_message where ticket_id = '${tD}'`) === "1", { gone, head409 });
  // B5d (round 2, breaker m1): a subject with no spaces wraps inside the panel and never covers its Close button
  await p4.goto(`${BASE}/system/support?ticket=${tLong}`);
  await p4.getByRole("dialog").locator("[data-ticket-head]").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const fits = await p4.getByRole("dialog").evaluate((d) => { const t = d.querySelector("h2"); const x = d.querySelector('button[aria-label="Close"]'); if (!t || !x) return false; const a = t.getBoundingClientRect(), b = x.getBoundingClientRect(); return a.right <= b.left + 1 && t.scrollWidth <= t.clientWidth + 1; }).catch(() => false);
  ok("PF-17 B5d pass (round 2, breaker m1): a long subject with no spaces wraps and stays clear of the panel's Close button", fits);
  await c4.close();

  // ---------------------------------------------------------------------------------------- B6 keys
  const cb = await ctxAs(await ourToken("billing.pf17c@expatready.example.com")), pb = await pageIn(cb);
  await pb.goto(`${BASE}/system/firms`);
  await pb.getByRole("heading", { level: 1, name: /^Firms$/ }).waitFor({ timeout: 15_000 }).catch(() => undefined);
  const billingNav = await pb.getByRole("navigation", { name: "Console" }).getByRole("link", { name: "Support" }).count();
  await pb.goto(`${BASE}/system/support`);
  const billingWords = await pb.locator("[data-support-error]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-17 B6 fail (BR-1): Billing (no system/support:list) has no Support in the menu and reads the API's words by address, with no chips",
    billingNav === 0 && /system\/support:list|support queue key/i.test(billingWords) && (await pb.locator("[data-chip]").count()) === 0, { billingNav, billingWords });
  await cb.close();
  const ca = await ctxAs(await ourToken("auditor.pf17c@expatready.example.com")), pa = await pageIn(ca);
  await pa.goto(`${BASE}/system/support?ticket=${tB}`);
  const auditorNote = await pa.getByRole("dialog").locator("[data-reply-no-manage]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-17 B6 pass/fail (BR-1): an Auditor (list, no manage) reads the ticket and gets no reply box, with the reason",
    auditorNote === SUPPORT_COPY.noManage && (await pa.getByRole("dialog").getByText(`Sample ${run} two`).count()) > 0 && (await pa.getByRole("dialog").getByRole("button", { name: "Send reply" }).count()) === 0, auditorNote);
  await ca.close();

  // ---------------------------------------------------------------------------------------- B9c keyboard, axe, widths
  const ck = await ctxAs(tSup), pk = await pageIn(ck);
  await pk.goto(`${BASE}/system/support`); await rowOf(pk, `Sample ${run} two`).waitFor({ timeout: 15_000 }).catch(() => undefined);
  const opener = rowOf(pk, `Sample ${run} two`).getByRole("button", { name: new RegExp(`Sample ${run} two`) });
  await opener.focus(); await pk.keyboard.press("Enter");
  const kOpen = await pk.getByRole("dialog").waitFor({ timeout: 10_000 }).then(() => true, () => false);
  const panelAxe = kOpen ? (await axe(pk)).length : -1;
  await pk.keyboard.press("Escape"); await pk.waitForTimeout(400);
  const back = await opener.evaluate((e) => e === document.activeElement).catch(() => false);
  ok("PF-17 B9c pass: keyboard only, Enter on a row opens its ticket and Escape closes it with the focus back on that row", kOpen && back, { kOpen, back });
  const tE = raise(A, `Sample ${run} six: focus after a reply`, "/platform/me");
  await pk.goto(`${BASE}/system/support?status=OPEN`); await rowOf(pk, `Sample ${run} six`).waitFor({ timeout: 15_000 }).catch(() => undefined);
  await rowOf(pk, `Sample ${run} six`).getByRole("button", { name: new RegExp(`Sample ${run} six`) }).focus(); await pk.keyboard.press("Enter");
  await pk.getByRole("dialog").getByLabel(SUPPORT_COPY.replyLabel).fill(`Sample ${run}: on it.`);
  await pk.getByRole("dialog").getByRole("button", { name: "Send reply" }).click();
  await pk.getByRole("dialog").locator("[data-reply-sent]").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const sentSaid = await pk.getByRole("dialog").locator("[data-reply-sent]").innerText().catch(() => "");
  await pk.keyboard.press("Escape"); await pk.waitForTimeout(600);
  const landed = await pk.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName}|${e.closest("table") ? "table" : ""}` : ""; });
  ok("PF-17 B9c fail (round 2, breaker M2): after a reply that takes the ticket out of the filter, the reply is announced and Escape puts the focus on the list (the next row) or its heading, never the page body",
    sentSaid === SUPPORT_COPY.sent && tE !== "" && (landed === "BUTTON|table" || landed.startsWith("H1")), { sentSaid, landed });
  await pk.goto(`${BASE}/system/support`); await heading(pk).waitFor({ timeout: 15_000 }).catch(() => undefined);
  const pageAxe = (await axe(pk)).length;
  const widths: Record<number, { axe: number; sideways: boolean }> = {};
  for (const w of [1024, 375]) {
    const c = await ctxAs(tSup, w, 800), p = await pageIn(c); await p.goto(`${BASE}/system/support`); await heading(p).waitFor({ timeout: 15_000 }).catch(() => undefined);
    widths[w] = { axe: (await axe(p)).length, sideways: await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) };
    if (w === 375) await p.screenshot({ path: join(SHOTS, "05-support-375.png"), fullPage: true });
    await c.close();
  }
  ok("PF-17 B9c pass: axe-core WCAG 2.2 A/AA finds nothing on the page (1440, 1024, 375) or the open panel; no sideways page scroll",
    pageAxe === 0 && panelAxe === 0 && widths[1024].axe === 0 && widths[375].axe === 0 && !widths[1024].sideways && !widths[375].sideways, { pageAxe, panelAxe, widths });
  await ck.close();
  ok("PF-17: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
