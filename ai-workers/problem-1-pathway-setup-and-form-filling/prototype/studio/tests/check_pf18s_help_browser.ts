// PF-18s part 2 (concept screens/PF-18s §4 boards D and E, approved by Lead 19 on #2332 with the challenge's Majors; AG-16-63; R1.92):
// the "?" in PF-6's frame and My account → Help & support, walked in a browser on an isolated copy (its own database and port, never
// :4400), with the API and the database read underneath. Each line has a pass and a fail:
//   DW1 the "?" on two pages (Home, Licence with a query and fragment) notes only the path; Escape returns focus to the "?";
//       fail: the query and fragment never reach the panel or the ticket;
//   DW2 (#2064, challenge M3) one send: the first POST is held until a second click, a forced click and a second submit in the
//       same moment were dispatched → one POST at the network, one ticket; fail: the same two sends straight to the API make two
//       tickets, so the guard is what stops the second (the run with the guard line removed is recorded in the build notes);
//   DW3 the error state: the POST answers 500 once → "Not sent. Your message is still here; try again.", the text kept, Send
//       enabled; the retry sends one ticket; fail: no ticket was written by the failed send;
//   DW4 (M4, M5) the list: the Case Officer sees their own tickets by subject (first line), never the Owner's; the Owner sees all,
//       with "Raised by" names;
//   DW5 one ticket: support's reply (seeded by SQL: scaffolding standing in for PF-17's console, P-33) shows "ExpatReady support"
//       and "Waiting on firm"; a double reply under a held response lands one message; the Owner's reply shows the Owner's name to
//       the Case Officer; fail: a Closed ticket has no reply box and the API refuses a message (409);
//   DW6 keyboard only (Tab to "?", Enter opens on the box), axe clean (WCAG 2.2 A/AA) on the panel, the list and a ticket at 375,
//       1024 and 1440 px with no sideways scroll; fail: the same axe run finds an unlabelled button we add.
// Sample firm only. US$0, no model call; live AI off. Screenshots (deviceScaleFactor 1) in product/screens/PF-18s/screenshots/. From prototype/:
//   zsh studio/tools/isolated.sh pf18s2 4721 start AI_LIVE=off PLATFORM_IDENTITY=local && tsx studio/tests/check_pf18s_help_browser.ts 4721 xr_studio_pf18s2
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4721), process.argv[3] ?? "xr_studio_pf18s2"];
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-18s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
type Ans = { status: number; body: any; text: string };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
const api = async (t: string | null, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { "content-type": "application/json", ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text(); let j: unknown = null; try { j = JSON.parse(text); } catch { /* not JSON */ }
  return { status: r.status, body: j, text };
};
const signIn = async (firmKey: string, who: { actorId?: string }): Promise<string> => {
  const r = await api(null, "POST", "/platform/session/local", { firmKey, ...who, secondStep: true });
  if (r.body?.token) return r.body.token as string;
  console.error(`STOP  local sign-in refused for ${JSON.stringify(who)} (start the copy with PLATFORM_IDENTITY=local): ${r.text.slice(0, 300)}`); process.exit(2);
};

// ------------------------------------------------------------------------------------------------ setup (Sample)
await api(null, "GET", "/platform/me");   // the app seeds the Sample firms at start; this only waits for it
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const TOWNER = await signIn("sample-firm", { actorId: "user-R" }), TOFF = await signIn("sample-firm", { actorId: "user-O" });
const OWN = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`), OFF = sql(`select id from platform_staff where actor_id = 'user-O' and firm_id = '${A}'`);
const OWNNAME = sql(`select display_name from platform_staff where id = '${OWN}'`), OFFNAME = sql(`select display_name from platform_staff where id = '${OFF}'`);
const tickets = (who: string) => Number(sql(`select count(*) from platform_support_ticket where raised_by = '${who}'`));
ok("PF-18s part 2 setup: the Sample firm's Owner (user-R) and Case Officer (user-O) signed in", !!A && !!OWN && !!OFF && !!OWNNAME && !!OFFNAME);

const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errs: string[] = [];
const tab = async (token: string, width = 1440) => {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  await ctx.addInitScript((t) => { sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, token);
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p;
};
const go = async (p: Page, path: string, ready: string) => { await p.goto(`${BASE}${path}`); await p.locator(ready).first().waitFor({ timeout: 60_000 }); };
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `pf18s-help-${name}.png`), fullPage: true });
const axe = async (p: Page, scope: string) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const ids = (v: { id: string; nodes: { target: unknown }[] }[]) => v.map((x) => `${x.id}: ${x.nodes[0]?.target}`);
const dialog = (p: Page) => p.locator('[role="dialog"]');
const help = (p: Page) => p.locator("[data-help-button]");
const focused = (p: Page, sel: string) => p.locator(sel).first().evaluate((el) => el === document.activeElement);
/** Holds every matching request until released; counts them as they reach the network. */
const hold = async (p: Page, url: RegExp, method: string) => {
  const h = { seen: 0, release: () => {} }; const gate = new Promise<void>((r) => { h.release = r; });
  await p.route(url, async (route: Route) => { if (route.request().method() !== method) return route.continue(); h.seen++; await gate; await route.continue(); });
  return h;
};

let failed = 0;
try {
  // ---------------------------------------------------------------------------------------------- DW1 the "?" on two pages
  const p = await tab(TOFF);
  await go(p, "/home", "[data-help-button]");
  await help(p).click(); await dialog(p).waitFor();
  const onHome = await p.locator("[data-raise-page]").innerText();
  await p.keyboard.press("Escape"); await dialog(p).waitFor({ state: "detached" });
  await p.waitForFunction(() => document.activeElement?.hasAttribute("data-help-button"), null, { timeout: 5_000 }).catch(() => undefined);
  const backOnHelp = await focused(p, "[data-help-button]");
  await go(p, "/account/licence?view=secret-token#frag", "[data-help-button]");
  await help(p).click(); await dialog(p).waitFor();
  const onLicence = await p.locator("[data-raise-page]").innerText(), panelText = await dialog(p).innerText();
  ok("PF-18s DW1: the \"?\" opens Ask for help on Home and on Licence, each noting its own path; Escape returns focus to the \"?\"", onHome === "/home" && onLicence === "/account/licence" && backOnHelp, { onHome, onLicence, backOnHelp });
  ok("PF-18s DW1 fail: the query and fragment never reach the panel", !/secret-token|frag/.test(panelText), panelText.slice(0, 200));
  await p.locator("[data-raise-body]").fill("half a thought");
  let asked = false; p.once("dialog", (d) => { asked = true; void d.dismiss(); });
  await dialog(p).getByRole("button", { name: "Close", exact: true }).last().click(); await p.waitForTimeout(300);
  ok("PF-18s DW1 (break m2): the footer's Close asks before discarding a typed message; dismissed, the panel and the text stay", asked && await dialog(p).count() === 1 && (await p.locator("[data-raise-body]").inputValue()) === "half a thought", { asked });
  const lines = Array.from({ length: 50 }, () => "x".repeat(99)).join("\n");   // 4,999 characters with 49 line breaks
  const fdl = new FormData(); fdl.set("body", lines); fdl.set("page", "/home");
  const longR = await fetch(`${BASE}/api/platform/support/tickets`, { method: "POST", headers: { authorization: `Bearer ${TOFF}` }, body: fdl });
  const longId = ((await longR.json()) as { id?: string }).id;
  ok("PF-18s DW1 (break m1): a 4,999-character message with line breaks, sent as multipart (CRLF), is accepted and stored with one character per break", longR.status === 201 && sql(`select char_length(body) from platform_support_message where ticket_id = '${longId}'`) === "4999", { status: longR.status });
  ok("PF-18s DW1: the Case Officer's My account menu has Help & support", await p.locator('nav[aria-label="My account"] [data-account-section="/platform/support"]').count() === 1);

  // ---------------------------------------------------------------------------------------------- DW2 one send (#2064)
  const before = tickets(OFF);
  await p.locator("[data-raise-body]").fill("I cannot find the licence upload (Sample)\nIt was there yesterday.");
  await shot(p, "1-ask-for-help-1440");
  const raise = await hold(p, /\/api\/platform\/support\/tickets$/, "POST");
  await p.locator("[data-raise-send]").click();
  await p.locator("[data-raise-send]").click({ force: true, timeout: 2_000 }).catch(() => undefined);   // a second click inside the guard window (the busy button is disabled, so it never reaches the handler: review m-5)
  await p.evaluate(() => { const f = document.getElementById("raise-form") as HTMLFormElement; f.requestSubmit(); f.requestSubmit(); });   // two submits in one moment: only the ref stops these
  await p.waitForTimeout(400);
  const seenWhileHeld = raise.seen; raise.release();
  await p.locator("[data-raise-sent]").waitFor({ timeout: 30_000 });
  await p.waitForTimeout(500);
  const t1 = sql(`select id from platform_support_ticket where raised_by = '${OFF}' order by created_at desc limit 1`);
  ok("PF-18s DW2: with the first POST held, a second click on the busy Send and two submits in one moment (which only the guard's ref can stop) send nothing: one POST at the network, one ticket, \"Ticket sent\" shown",
    seenWhileHeld === 1 && raise.seen === 1 && tickets(OFF) === before + 1 && sql(`select page from platform_support_ticket where id = '${t1}'`) === "/account/licence", { seenWhileHeld, seen: raise.seen, made: tickets(OFF) - before });
  await shot(p, "2-ticket-sent-1440");
  await p.unroute(/\/api\/platform\/support\/tickets$/);
  const [d1, d2] = await Promise.all([api(TOFF, "POST", "/platform/support/tickets", { body: "Twice by hand (Sample)", page: "/home" }), api(TOFF, "POST", "/platform/support/tickets", { body: "Twice by hand (Sample)", page: "/home" })]);
  ok("PF-18s DW2 fail: the same two sends straight to the API make two tickets (the server does not deduplicate: the screen's guard is what stops the second)", d1.status === 201 && d2.status === 201 && tickets(OFF) === before + 3, { d1: d1.status, d2: d2.status });
  await p.locator("[data-raise-open-ticket]").click();
  await p.locator("[data-ticket-subject]").waitFor();
  ok("PF-18s DW2: \"Open your ticket\" lands on it, headed by its first line, \"Raised from /account/licence\"", (await p.locator("[data-ticket-subject]").innerText()) === "I cannot find the licence upload (Sample)" && (await p.locator("[data-ticket-page]").innerText()).startsWith("Raised from /account/licence"));

  // ---------------------------------------------------------------------------------------------- DW3 the error state
  const beforeErr = tickets(OFF);
  await help(p).click(); await dialog(p).waitFor();
  await p.locator("[data-raise-body]").fill("Second question (Sample)");
  let fails = 1;
  await p.route(/\/api\/platform\/support\/tickets$/, (r) => (r.request().method() === "POST" && fails-- > 0 ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ title: "Server error", status: 500, detail: "boom" }) }) : r.continue()));
  await p.locator("[data-raise-send]").click();
  await p.locator("[data-raise-problem]").waitFor({ timeout: 30_000 });
  const errWords = await p.locator("[data-raise-problem]").innerText(), kept = await p.locator("[data-raise-body]").inputValue(), enabled = await p.locator("[data-raise-send]").isEnabled();
  ok("PF-18s DW3: a failed send says \"Not sent. Your message is still here; try again.\", keeps the text and lets the person send again", errWords === "Not sent. Your message is still here; try again." && kept === "Second question (Sample)" && enabled, { errWords, kept, enabled });
  ok("PF-18s DW3 fail: the failed send wrote no ticket", tickets(OFF) === beforeErr);
  await shot(p, "3-not-sent-1440");
  await p.locator("[data-raise-send]").click(); await p.locator("[data-raise-sent]").waitFor({ timeout: 30_000 });
  ok("PF-18s DW3: the retry sends one ticket", tickets(OFF) === beforeErr + 1);
  await p.unroute(/\/api\/platform\/support\/tickets$/);
  await p.keyboard.press("Escape");

  // ---------------------------------------------------------------------------------------------- DW4 the list
  const own = await api(TOWNER, "POST", "/platform/support/tickets", { body: "Owner's question about billing (Sample)", page: "/settings/billing" });
  await go(p, "/platform/support", "[data-ticket-row], [data-empty]");
  const coRows = await p.locator("[data-ticket-link]").allInnerTexts();
  ok("PF-18s DW4: the Case Officer's list shows their tickets by subject, no \"Raised by\" column", coRows.includes("I cannot find the licence upload (Sample)") && coRows.includes("Second question (Sample)") && await p.locator("[data-ticket-raised-by]").count() === 0, coRows);
  ok("PF-18s DW4 fail: the Owner's ticket is not in the Case Officer's list", !coRows.includes("Owner's question about billing (Sample)"));
  await shot(p, "4-list-case-officer-1440");
  const po = await tab(TOWNER); await go(po, "/platform/support", "[data-ticket-row]");
  const ownerRows = await po.locator("[data-ticket-row]").allInnerTexts();
  ok("PF-18s DW4: the Owner sees the firm's tickets, with \"Raised by\" naming the Case Officer and \"You\"", own.status === 201 && ownerRows.some((r) => r.includes("I cannot find the licence upload") && r.includes(OFFNAME)) && ownerRows.some((r) => r.includes("Owner's question") && r.includes("You")), ownerRows.slice(0, 4));

  // ---------------------------------------------------------------------------------------------- DW5 one ticket
  // Scaffolding for PF-17's console (P-33): support's reply as replyAsSupport writes it.
  sql(`insert into platform_support_message (id, firm_id, ticket_id, author_kind, author_id, body) values (gen_random_uuid(), '${A}', '${t1}', 'SUPPORT', 'support', 'Please open Licence and press Upload (Sample).'); update platform_support_ticket set status = 'WAITING_ON_FIRM' where id = '${t1}'; select 1`);
  await go(p, `/platform/support/${t1}`, "[data-ticket-subject]");
  const status = await p.locator("[data-ticket-status]").first().getAttribute("data-ticket-status"), authors = await p.locator("[data-message-author]").allInnerTexts();
  ok("PF-18s DW5: support's reply shows as \"ExpatReady support\" and the ticket is \"Waiting on firm\"", status === "WAITING_ON_FIRM" && authors[0].startsWith("You") && authors[1].startsWith("ExpatReady support"), { status, authors });
  await shot(p, "5-ticket-waiting-on-firm-1440");
  const msgs = () => Number(sql(`select count(*) from platform_support_message where ticket_id = '${t1}'`)), m0 = msgs();
  await p.locator("[data-reply-body]").fill("Thanks, found it (Sample).");
  const reply = await hold(p, /\/messages$/, "POST");
  await p.locator("[data-reply-send]").focus();
  await p.keyboard.press("Enter"); await p.keyboard.press("Enter");   // Enter twice on the focused Send (the second meets a disabled button)
  await p.evaluate(() => { const f = document.querySelector("[data-reply-form]") as HTMLFormElement; f.requestSubmit(); });
  await p.waitForTimeout(400);
  const replySeen = reply.seen; reply.release();
  await p.waitForFunction(() => document.querySelectorAll("[data-message]").length === 3, null, { timeout: 30_000 });
  ok("PF-18s DW5: Enter twice on the focused Send and a second submit (only the guard's ref can stop it), under a held response, land one reply; the status is \"Waiting on support\"",
    replySeen === 1 && reply.seen === 1 && msgs() === m0 + 1 && sql(`select status from platform_support_ticket where id = '${t1}'`) === "WAITING_ON_SUPPORT", { replySeen, seen: reply.seen, added: msgs() - m0 });
  await p.unroute(/\/messages$/);
  const byOwner = await api(TOWNER, "POST", `/platform/support/tickets/${t1}/messages`, { body: "Owner here: shout if not (Sample)." });
  await p.reload(); await p.locator("[data-message]").nth(3).waitFor({ timeout: 30_000 });
  const lastAuthor = (await p.locator("[data-message-author]").allInnerTexts())[3];
  ok("PF-18s DW5: the Owner's reply on the Case Officer's ticket shows the Owner's name to the Case Officer", byOwner.status === 200 && lastAuthor.startsWith(OWNNAME), { status: byOwner.status, lastAuthor });
  // Review M-1: an attachment opens as a download with the bearer, never a 401 page.
  const fd = new FormData(); fd.set("body", "Screenshot attached (Sample)"); fd.set("page", "/home");
  fd.append("files", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), "shot.png");
  const withFile = await (await fetch(`${BASE}/api/platform/support/tickets`, { method: "POST", headers: { authorization: `Bearer ${TOFF}` }, body: fd })).json() as { id: string };
  await go(p, `/platform/support/${withFile.id}`, "[data-message-file]");
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 30_000 }), p.locator("[data-message-file]").first().click()]);
  const dlPath = await dl.path(), dlBytes = dlPath ? (await import("node:fs")).readFileSync(dlPath) : Buffer.alloc(0);
  ok("PF-18s DW5: \"Attachment 1\" downloads the file (a PNG, its bytes) and the person stays on the ticket", dlBytes[0] === 0x89 && dlBytes[1] === 0x50 && p.url().endsWith(`/platform/support/${withFile.id}`), { first: dlBytes[0], url: p.url() });
  ok("PF-18s DW5 fail: the file route without the bearer is refused (401), so a plain link would have failed", (await fetch(`${BASE}${(await api(TOFF, "POST", `/platform/support/tickets/${withFile.id}/files/1/link`)).body.url}`)).status === 401);
  // Review m-1: closed while the person types: the text and "Not sent" stay, read-only, with no Send.
  await go(p, `/platform/support/${t1}`, "[data-reply-body]");
  await p.locator("[data-reply-body]").fill("A last note (Sample).");
  sql(`update platform_support_ticket set status = 'CLOSED' where id = '${t1}'; select 1`);   // scaffolding for PF-17 (no close route yet)
  await p.locator("[data-reply-send]").click(); await p.locator("[data-reply-problem]").waitFor({ timeout: 30_000 });
  await p.waitForFunction(() => !document.querySelector("[data-reply-send]"), null, { timeout: 30_000 });
  ok("PF-18s DW5: a ticket closed while the person types keeps the text (read-only) and says why it was not sent", (await p.locator("[data-reply-body]").inputValue()) === "A last note (Sample)." && await p.locator("[data-reply-body]").getAttribute("readonly") !== null && /closed/i.test(await p.locator("[data-reply-problem]").innerText()));
  await p.reload(); await p.locator("[data-ticket-closed]").waitFor({ timeout: 30_000 });
  const closedMsg = await api(TOFF, "POST", `/platform/support/tickets/${t1}/messages`, { body: "One more (Sample)" });
  ok("PF-18s DW5 fail: a Closed ticket has no reply box, says to raise a new one, and the API refuses a message (409)", await p.locator("[data-reply-form]").count() === 0 && closedMsg.status === 409);
  const otherT = sql(`select id from platform_support_ticket where raised_by = '${OWN}' limit 1`);
  await go(p, `/platform/support/${otherT}`, "[data-ticket-error]");
  ok("PF-18s DW5 fail: the Case Officer opening the Owner's ticket by address sees \"Ticket not found\"", (await p.locator("[data-ticket-error]").innerText()).startsWith("There is no such ticket"));
  await po.context().close();

  // ---------------------------------------------------------------------------------------------- DW6 keyboard, axe, widths
  await go(p, "/home", "[data-help-button]");
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) { await p.keyboard.press("Tab"); reached = await focused(p, "[data-help-button]"); }
  await p.keyboard.press("Enter"); await dialog(p).waitFor();
  await p.waitForTimeout(300);
  ok("PF-18s DW6: Tab reaches the \"?\" and Enter opens Ask for help on the text box", reached && await focused(p, "[data-raise-body]"), { reached });
  const vPanel = await axe(p, '[role="dialog"]'); ok("PF-18s DW6: the Ask for help panel has no WCAG 2.2 A/AA violation", vPanel.length === 0, ids(vPanel));
  await p.keyboard.press("Escape"); await p.context().close();
  for (const w of [375, 1024, 1440]) {
    const q = await tab(TOFF, w);
    await go(q, "/platform/support", "[data-ticket-row]");
    const vList = await axe(q, "main"), wideList = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    await go(q, `/platform/support/${t1}`, "[data-ticket-subject]");
    const vTicket = await axe(q, "main"), wideTicket = await q.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), hasHelp = await help(q).isVisible();
    ok(`PF-18s DW6: at ${w} px the list and a ticket have no WCAG 2.2 A/AA violation, no sideways scroll, and the "?" stays in the header`, !vList.length && !vTicket.length && wideList && wideTicket && hasHelp, { list: ids(vList), ticket: ids(vTicket), wideList, wideTicket, hasHelp });
    if (w !== 1440) await shot(q, `6-ticket-${w}`);
    if (w === 375) {
      await q.evaluate(() => { document.querySelector("main")!.appendChild(document.createElement("button")); });
      const bad = await axe(q, "main");
      ok("PF-18s DW6 fail: the same axe run finds the unlabelled button we add (the check can fail)", bad.some((x) => x.id === "button-name"), bad.map((x) => x.id));
    }
    await q.context().close();
  }
  ok("PF-18s part 2: no page error in any tab", errs.length === 0, errs);
} catch (e) {
  failed++; console.log(`FAIL  PF-18s part 2: the check stopped: ${(e as Error).stack?.slice(0, 600)}`);
} finally {
  await browser.close();
}
process.exit(summary() + failed ? 1 : 0);
