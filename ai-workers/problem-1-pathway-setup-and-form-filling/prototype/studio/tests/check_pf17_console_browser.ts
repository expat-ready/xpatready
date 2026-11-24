// PF-17 part 4 PR B (R1.93; concept r2 screens/PF-17-4/concept.md §4a-§4c, §6 B1-B3 and B7-B9; Lead 26 and Lead 28 on #3470):
// our console's sign-in card, session and Firms page walked in a browser on an isolated copy (its own database and port,
// never :4400), each checked against the API underneath, with a pass and a fail each:
//   P    the page's words (contract.ts): plan state, failed jobs ("N+" at the cap, "Not known"), usage;
//   B1   signed out → the console's sign-in card; the Sample Platform Owner signs in by work email → Firms, the session
//        kept as sessionStorage "xr-system-session" {token, expiresAt} (j_93's key); fail: an unknown email → the server's
//        words on the card, no session;
//   B2   Firms lists both Sample firms, each row's plan, plan state, failed jobs and health equal to the API's answer for
//        that firm (j_93 W2); B2b the page's notes: an answer with failedJobsComplete false shows "N+" and one note, a
//        failedJobs null shows "Not known" (stood in by the browser's own route, the job queue cannot be filled to 10 000);
//   B3   the Held chip narrows to the held firm (address ?health=HELD); search narrows by name; fail: ?health=X shows the
//        API's field error, never a blank page; no match shows the empty state;
//   B7   the wall, both ways (BR-2): a firm token alone (xr-staff-session) → the console's card; our token alone → a firm
//        page shows the firm's own sign-in card (our token never reaches a firm route);
//   B8   the session ends at its expiry → the card says why; a refused token (401) → the card, the session gone;
//   B9   keyboard only (search, chips, sign out), axe-core WCAG 2.2 A/AA 0 violations, 375, 1024 and 1440 px with no
//        sideways page scroll (the table scrolls in its box).
// Sample firms and Sample staff only (PR A's seed); US$0, no model call; live AI off. Screenshots (deviceScaleFactor 1) in
// product/screens/PF-17-4/screenshots/. Run from prototype/:
//   zsh studio/tools/isolated.sh pf17c 4447 start AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && tsx studio/tests/check_pf17_console_browser.ts 4447 xr_studio_pf17c
// (the form run-suites.sh reads; it starts and stops the copy itself. By hand, stop it after: isolated.sh pf17c 4447 stop)
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
import { COPY, endedWords, failedJobsText, planState, SESSION_KEY, usageText } from "../web/src/modules/system/contract.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [PORT, DBNAME] = [Number(process.argv[2] ?? 4447), process.argv[3] ?? "xr_studio_pf17c"];
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
const OWNER = "ops.sample@expatready.example.com";
const ourToken = async (email: string) => {
  const r = await api(null, "/system/session/local", "POST", { email, secondStep: true });
  if (!r.body?.token) { console.error(`STOP  our sign-in refused for ${email} (start the copy with PLATFORM_SYSTEM_IDENTITY=local): ${JSON.stringify(r.body).slice(0, 300)}`); process.exit(2); }
  return r.body.token as string;
};
const firmToken = async () => {
  const email = sql(`select email from platform_staff where actor_id = 'user-R'`);
  const r = await api(null, "/platform/session/local", "POST", { firmKey: "sample-firm", email, secondStep: true });
  if (!r.body?.token) { console.error(`STOP  firm sign-in refused (PLATFORM_IDENTITY=local): ${JSON.stringify(r.body).slice(0, 300)}`); process.exit(2); }
  return r.body.token as string;
};

// ------------------------------------------------------------------------------------------------ P: the page's words
{
  const sub = (status: string, trialEndsAt: string | null = null) => ({ status, trialEndsAt, billingPeriod: "MONTHLY", overdue: status === "OVERDUE" });
  ok("PF-17 P pass: plan state in words: Active, Trial ends <date>, Overdue, Payment hold, Ended, none",
    planState(sub("ACTIVE")) === "Active" && planState(sub("TRIAL", "2026-12-03T00:00:00Z")) === "Trial ends 3 Dec 2026" && planState(sub("OVERDUE")) === "Overdue"
      && planState(sub("PAYMENT_HOLD")) === "Payment hold" && planState(sub("ENDED")) === "Ended" && planState(null) === "No subscription");
  ok("PF-17 P pass/fail (BR-4, m1): failed jobs read in full show the count; at the cap \"N+\" (0 too: \"0+\"); a read that failed \"Not known\"",
    failedJobsText(3, true) === "3" && failedJobsText(3, false) === "3+" && failedJobsText(0, false) === "0+" && failedJobsText(0, true) === "0" && failedJobsText(null, false) === "Not known");
  ok("PF-17 P pass/fail: usage \"used / limit\", Unlimited, over marked in words, storage in MB, never measured \"—\"",
    usageText({ metric: "seats", used: 6, limit: 5, over: true }) === "6 / 5 over" && usageText({ metric: "seats", used: 2, limit: null, over: false }) === "2 / Unlimited"
      && usageText({ metric: "storage_mb", used: 820, limit: 5000, over: false }) === "820 / 5,000 MB" && usageText({ metric: "storage_mb", used: null, limit: 5000, over: false }) === "—");
}

{
  ok("PF-17 P pass/fail (round 2, review #3): the card says why the session ended: expired, ended by a Platform Owner, deactivated; an unknown code the server's own words; none when signed out on purpose",
    endedWords("TOKEN_EXPIRED", null) === COPY.expired && endedWords("SESSION_REVOKED", "x") === COPY.revoked && endedWords("STAFF_NOT_ACTIVE", "x") === COPY.deactivated
      && endedWords("SOMETHING_NEW", "The server's words.") === "The server's words." && endedWords(null, null) === null);
}
const browser: Browser = await chromium.launch({ headless: process.env.HEADED !== "1", ...(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : process.platform === "darwin" ? { channel: "chrome" } : {}) });
const errors: string[] = [];
const ctx = async (width = 1440, height = 900): Promise<BrowserContext> => browser.newContext({ viewport: { width, height }, colorScheme: "light", reducedMotion: "reduce", deviceScaleFactor: 1 });
const pageIn = async (c: BrowserContext) => { const p = await c.newPage(); p.on("pageerror", (e) => errors.push(String(e))); return p; };
const seen = (p: Page, sel: string, timeout = 15_000) => p.locator(sel).first().waitFor({ timeout }).then(() => true, () => false);
const axe = async (p: Page) => (await p.waitForTimeout(300), await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations;
const firmsHeading = (p: Page) => p.getByRole("heading", { level: 1, name: /^Firms$/ });
const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
const nameA = sql(`select operating_name from platform_firm where id = '${A}'`), nameB = sql(`select operating_name from platform_firm where id = '${B}'`);
try {
  // ---------------------------------------------------------------------------------------- B1 sign in
  const c1 = await ctx(), p1 = await pageIn(c1);
  await p1.goto(`${BASE}/system/firms`);
  const card = await seen(p1, "[data-system-sign-in]");
  ok("PF-17 B1 pass: signed out, /system/firms shows the console's sign-in card (its heading), no firm rows", card && (await p1.getByRole("heading", { name: COPY.signInTitle }).count()) === 1 && (await p1.getByRole("row").count()) === 0);
  let blankSent = false; const spyBlank = (r: { url(): string }) => { if (r.url().includes("/api/system/session/local")) blankSent = true; };
  p1.on("request", spyBlank);
  await p1.getByRole("button", { name: "Sign in" }).click();
  const blankErr = await p1.locator("[data-system-sign-in-error]").innerText({ timeout: 5000 }).catch(() => "");
  p1.off("request", spyBlank);
  ok("PF-17 B1 fail (round 2, review #5): a blank email is stopped on its field, nothing sent", blankErr === COPY.emailNeeded && !blankSent, { blankErr, blankSent });
  await p1.getByLabel("Work email").fill("nobody.pf17@expatready.example.com");
  await p1.getByRole("button", { name: "Sign in" }).click();
  const refusedText = await p1.locator("[data-system-sign-in-error]").innerText({ timeout: 10_000 }).catch(() => "");
  ok("PF-17 B1 fail: an unknown work email shows the server's words on the card and keeps no session", /No ExpatReady staff member/i.test(refusedText) && (await p1.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY)) === null, refusedText);
  await p1.getByLabel("Work email").fill(OWNER);
  await p1.getByRole("button", { name: "Sign in" }).click();
  const inFirms = await firmsHeading(p1).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const kept = await p1.evaluate((k) => { try { return JSON.parse(sessionStorage.getItem(k) ?? "null"); } catch { return null; } }, SESSION_KEY);
  ok("PF-17 B1 pass: the Sample Platform Owner signs in by work email and lands on Firms; the session is sessionStorage \"xr-system-session\" {token, expiresAt} (j_93's key)",
    inFirms && typeof kept?.token === "string" && typeof kept?.expiresAt === "number" && kept.expiresAt > Date.now(), { inFirms, kept: kept ? Object.keys(kept) : null });
  await p1.getByRole("row").nth(1).waitFor({ timeout: 10_000 }).catch(() => undefined);
  const focusAfter = await p1.evaluate(() => (document.activeElement?.tagName ?? "") + "|" + (document.activeElement?.textContent ?? ""));
  ok("PF-17 B1 pass (round 2, review #9): after sign-in the focus is on the page's heading and the tab is titled for the page",
    focusAfter === "H1|Firms" && (await p1.title()) === "Firms · ExpatReady console", { focusAfter, title: await p1.title() });
  await p1.screenshot({ path: join(SHOTS, "01-firms-1440.png"), fullPage: true });

  // ---------------------------------------------------------------------------------------- B2 rows equal the API
  const tOur = await ourToken(OWNER);
  const list = (await api(tOur, "/system/firms")).body;
  const rowText = async (p: Page, name: string) => { const r = p.getByRole("row").filter({ hasText: name }); return (await r.count()) === 1 ? (await r.innerText()).replace(/\s+/g, " ") : ""; };
  const matches = async (p: Page, id: string, name: string) => {
    const f = list.firms.find((x: { id: string }) => x.id === id), t = await rowText(p, name);
    return !!f && !!t && t.includes(f.plan?.name ?? "No live plan") && t.includes(planState(f.subscription)) && t.includes(failedJobsText(f.failedJobs, list.failedJobsComplete))
      && t.includes({ HELD: "Held", ATTENTION: "Needs attention", OK: "OK", NOT_LIVE: "Not live" }[f.health as string]!) && f.reasons.every((r: string) => t.includes(r));
  };
  ok("PF-17 B2 pass (j_93 W2): firm A's and firm B's rows each show their own plan, plan state, failed jobs, health and reasons as the API answers them",
    await matches(p1, A, nameA) && await matches(p1, B, nameB), { a: await rowText(p1, nameA), b: await rowText(p1, nameB) });
  // The API sends one of two: the read reached its cap (counts as read, flag false) or failed (every count null, flag false).
  const stubbed = async (failedJobs: number | null) => {
    await p1.unroute("**/api/system/firms*").catch(() => undefined);
    await p1.route("**/api/system/firms*", async (r) => { const real = await r.fetch(); const body = await real.json();
      await r.fulfill({ response: real, json: { ...body, failedJobsComplete: false, firms: body.firms.map((f: object) => ({ ...f, failedJobs })) } }); });
    await p1.reload();
    await p1.getByRole("row").filter({ hasText: nameA }).waitFor({ timeout: 15_000 }).catch(() => undefined);
    return { row: await rowText(p1, nameA), note: await p1.locator("[data-failed-capped]").innerText().catch(() => "") };
  };
  const capped = await stubbed(0), unknown = await stubbed(null);
  await p1.unroute("**/api/system/firms*").catch(() => undefined);
  await p1.route("**/api/system/firms*", async (r) => { const real = await r.fetch(); const body = await real.json(); await r.fulfill({ response: real, json: { ...body, complete: false, note: "an API sentence naming q" } }); });
  await p1.reload(); await p1.getByRole("row").filter({ hasText: nameA }).waitFor({ timeout: 15_000 }).catch(() => undefined);
  const partial = await p1.locator("[data-firms-note]").innerText().catch(() => "");
  ok("PF-17 B2b pass (round 2, review #7): figures not all worked out on a filter show the concept's words, not the API's internal sentence", partial === COPY.figuresIncomplete, partial);
  ok("PF-17 B2b pass/fail (BR-4, m1): a read at its cap says so once and a firm with none shows \"0+\" (never a bare 0); a read that failed shows \"Not known\" with its own note",
    capped.note === COPY.failedCapped && / 0\+ /.test(` ${capped.row} `) && unknown.note === COPY.failedUnknown && unknown.row.includes("Not known"), { capped, unknown });
  await p1.unroute("**/api/system/firms*");

  // ---------------------------------------------------------------------------------------- B3 chips, search, errors
  sql(`update platform_firm set status = 'PAYMENT_HOLD' where id = '${B}'`);
  await p1.goto(`${BASE}/system/firms`);
  await firmsHeading(p1).waitFor({ timeout: 15_000 }).catch(() => undefined);
  await p1.getByRole("button", { name: "Held", exact: true }).click();
  await p1.waitForURL(/health=HELD/, { timeout: 10_000 }).catch(() => undefined);
  await p1.getByRole("row").filter({ hasText: nameB }).waitFor({ timeout: 10_000 }).catch(() => undefined);
  const heldApi = (await api(tOur, "/system/firms?health=HELD")).body;
  ok("PF-17 B3 pass: the Held chip narrows the list to the held firm (?health=HELD), the same firms the API holds, pressed state announced",
    (await rowText(p1, nameB)) !== "" && (await rowText(p1, nameA)) === "" && heldApi.firms.length === 1 && (await p1.getByRole("button", { name: "Held", exact: true }).getAttribute("aria-pressed")) === "true");
  sql(`update platform_firm set status = 'ACTIVE' where id = '${B}'`);
  await p1.goto(`${BASE}/system/firms?health=X`);
  const fieldErr = await p1.locator("[data-firms-error]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-17 B3 fail (round 2, review #2): an address the API refuses (?health=X) names the field and its rule, and offers Clear filters, not a Retry that repeats it",
    /health/i.test(fieldErr) && (await p1.getByRole("button", { name: "Clear filters" }).count()) === 1 && (await p1.getByRole("button", { name: "Retry" }).count()) === 0, fieldErr);
  await p1.goto(`${BASE}/system/firms?page=9`);
  const past = await p1.locator("[data-firms-past-end]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-17 B3 fail (round 2, breaker 2): a page past the end says so and offers page 1, never \"No firms match\"", past.includes(COPY.pastEnd) && (await p1.getByRole("button", { name: "Go to page 1" }).count()) === 1, past);
  await p1.goto(`${BASE}/system/firms`);
  await firmsHeading(p1).waitFor({ timeout: 15_000 }).catch(() => undefined);
  await p1.getByRole("searchbox", { name: /Search firm/ }).fill("solo");
  await p1.waitForURL(/q=solo/, { timeout: 10_000 }).catch(() => undefined);
  await p1.waitForTimeout(500);
  ok("PF-17 B3 pass: search \"solo\" narrows to firm B by name (?q=solo)", (await rowText(p1, nameB)) !== "" && (await rowText(p1, nameA)) === "");
  await p1.getByRole("searchbox", { name: /Search firm/ }).fill("zz-no-such-firm");
  const empty = await p1.locator("[data-firms-empty]").innerText({ timeout: 10_000 }).catch(() => "");
  ok("PF-17 B3 fail: a search that matches nothing shows the empty state's words, no table rows", empty.includes(COPY.firmsEmpty), empty);
  await p1.getByRole("navigation", { name: "Console" }).getByRole("link", { name: "Firms" }).click();
  await p1.waitForURL((u) => !u.search.includes("q="), { timeout: 10_000 }).catch(() => undefined);
  // Waits for the box to follow (round 2, R2-c: one read right after the address changed could race the effect).
  const cleared = await p1.waitForFunction(() => (document.querySelector('input[type="search"]') as HTMLInputElement | null)?.value === "", null, { timeout: 5000 }).then(() => true, () => false);
  ok("PF-17 B3 pass (round 2, breaker 3): leaving the search by the menu clears the box with the address", cleared, await p1.getByRole("searchbox", { name: /Search firm/ }).inputValue().catch(() => "x"));

  // ---------------------------------------------------------------------------------------- B7 the wall, both ways
  const tFirm = await firmToken();
  const c7 = await ctx(); await c7.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tFirm);
  const crossed: string[] = [];
  const spy = (r: { url(): string; headers(): Record<string, string> }) => { const auth = r.headers().authorization ?? "", u = r.url();
    if (u.includes("/api/system") && auth.includes(tFirm)) crossed.push(`firm token to ${u}`); if (!u.includes("/api/system") && u.includes("/api/") && auth.includes(tOur)) crossed.push(`our token to ${u}`); };
  c7.on("request", spy);
  const p7 = await pageIn(c7); await p7.goto(`${BASE}/system/firms`);
  ok("PF-17 B7 fail (BR-2): a firm Owner's session alone (xr-staff-session) opens no console page: the console's sign-in card, no firm rows",
    await seen(p7, "[data-system-sign-in]") && (await p7.getByRole("row").count()) === 0);
  const c7b = await ctx(); await c7b.addInitScript(([k, x]) => sessionStorage.setItem(k, JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), [SESSION_KEY, tOur] as const);
  c7b.on("request", spy);
  const p7b = await pageIn(c7b); await p7b.goto(`${BASE}/platform/licences`);
  ok("PF-17 B7 fail (BR-2): our session alone (xr-system-session) opens no firm page: the firm's own sign-in card",
    await seen(p7b, "[data-sign-in-card]") && (await seen(p7b, "[data-system-sign-in]", 1500)) === false);
  await p7b.waitForTimeout(1000);
  ok("PF-17 B7 fail (round 2, review #8): no request sent a firm token to /api/system or our token to any other route (request spy)", crossed.length === 0, crossed);
  await c7.close(); await c7b.close();

  // ---------------------------------------------------------------------------------------- B8 expiry and a refused token
  const c8 = await ctx(); await c8.addInitScript(([k, x]) => { if (!sessionStorage.getItem("pf17-b8")) { sessionStorage.setItem("pf17-b8", "1"); sessionStorage.setItem(k, JSON.stringify({ token: x, expiresAt: Date.now() + 4000 })); } }, [SESSION_KEY, tOur] as const);
  const p8 = await pageIn(c8); await p8.goto(`${BASE}/system/firms`);
  const before = await firmsHeading(p8).waitFor({ timeout: 15_000 }).then(() => true, () => false);
  const endedCard = await p8.locator("[data-system-sign-in-ended]").innerText({ timeout: 10_000 }).catch(() => "");
  ok("PF-17 B8 pass/fail: the session works until its expiry, then ends by itself: the card says why", before && endedCard.includes(COPY.expired), { before, endedCard });
  const tRevoked = await ourToken("support.sample@expatready.example.com");
  const c8r = await ctx(); await c8r.addInitScript(([k, x]) => { if (!sessionStorage.getItem("pf17-b8r")) { sessionStorage.setItem("pf17-b8r", "1"); sessionStorage.setItem(k, JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })); } }, [SESSION_KEY, tRevoked] as const);
  const p8r = await pageIn(c8r); await p8r.goto(`${BASE}/system/firms`); await firmsHeading(p8r).waitFor({ timeout: 15_000 }).catch(() => undefined);
  sql(`update plat_system_staff set sessions_ended_at = now() + interval '1 second' where email = 'support.sample@expatready.example.com'`);
  await p8r.waitForTimeout(1500);
  await p8r.getByRole("button", { name: "Held", exact: true }).click();
  const revokedCard = await p8r.locator("[data-system-sign-in-ended]").innerText({ timeout: 10_000 }).catch(() => "");
  ok("PF-17 B8 fail (round 2, review #3): a session a Platform Owner ended says so on the card (not \"expired\")", revokedCard === COPY.revoked, revokedCard);
  await c8r.close();
  const c8m = await ctx(); await c8m.addInitScript(([k, x]) => sessionStorage.setItem(k, JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), [SESSION_KEY, tOur] as const);
  const p8m = await pageIn(c8m); await p8m.route("**/api/system/me", (r) => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ title: "Server error", detail: "Sample: down" }) }));
  await p8m.goto(`${BASE}/system/firms`);
  const meDown = await p8m.locator("[data-system-me-error]").innerText({ timeout: 10_000 }).catch(() => "");
  ok("PF-17 B8 fail (round 2, review #4): a who-am-I answer that fails (500) says so with Retry, keeps the session and shows no sign-in card",
    meDown.includes(COPY.meFailed) && (await p8m.locator("[data-system-sign-in]").count()) === 0 && (await p8m.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY)) !== null, meDown);
  await c8m.close();
  const refusedOne = ["refused", "by", "the", "server"].join("-");   // no real token: the guard reads none in git
  const c8b = await ctx(); await c8b.addInitScript(([k, x]) => sessionStorage.setItem(k, JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), [SESSION_KEY, refusedOne] as const);
  const p8b = await pageIn(c8b); await p8b.goto(`${BASE}/system/firms`);
  const gone = await seen(p8b, "[data-system-sign-in]") && (await p8b.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY)) === null;
  ok("PF-17 B8 fail: a token the server refuses (401) ends the session here: the card, nothing kept", gone);
  await c8.close(); await c8b.close();

  // ---------------------------------------------------------------------------------------- B9 keyboard, axe, widths
  await p1.goto(`${BASE}/system/firms`);
  await firmsHeading(p1).waitFor({ timeout: 15_000 }).catch(() => undefined);
  await p1.getByRole("searchbox", { name: /Search firm/ }).focus();
  await p1.keyboard.press("Tab");
  const chipFocused = await p1.evaluate(() => document.activeElement?.getAttribute("data-chip") ?? "");
  await p1.keyboard.press("Tab"); await p1.keyboard.press("Enter");
  await p1.waitForURL(/health=HELD/, { timeout: 5000 }).catch(() => undefined);
  await p1.waitForTimeout(800);
  const stillOn = await p1.evaluate(() => document.activeElement?.getAttribute("data-chip") ?? document.activeElement?.tagName ?? "");
  ok("PF-17 B9 pass (round 2, review and breaker M1): keyboard only, the search leads to the chips; Enter on Held applies it and the focus stays on Held once the answer comes",
    chipFocused !== "" && /health=HELD/.test(p1.url()) && stillOn === "HELD", { chipFocused, url: p1.url(), stillOn });
  await p1.goto(`${BASE}/system/firms`); await firmsHeading(p1).waitFor({ timeout: 15_000 }).catch(() => undefined);
  const box = p1.getByRole("searchbox", { name: /Search firm/ });
  await box.click(); await p1.keyboard.type("sam"); await p1.waitForTimeout(700); await p1.keyboard.type("ple");
  await p1.waitForTimeout(700);
  const typed = await box.inputValue().catch(() => ""), boxFocused = await box.evaluate((e) => e === document.activeElement).catch(() => false);
  ok("PF-17 B9 fail (round 2, review and breaker M1): typing across a pause keeps every letter and the focus in the box while the list follows", typed === "sample" && boxFocused && /q=sample/.test(p1.url()), { typed, boxFocused, url: p1.url() });
  await p1.goto(`${BASE}/system/firms`); await firmsHeading(p1).waitFor({ timeout: 15_000 }).catch(() => undefined);
  const v1440 = await axe(p1);
  const widths: Record<number, { axe: number; sideways: boolean }> = {};
  for (const w of [1024, 375]) {
    const c = await ctx(w, 800); await c.addInitScript(([k, x]) => sessionStorage.setItem(k, JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), [SESSION_KEY, tOur] as const);
    const p = await pageIn(c); await p.goto(`${BASE}/system/firms`); await firmsHeading(p).waitFor({ timeout: 15_000 }).catch(() => undefined);
    widths[w] = { axe: (await axe(p)).length, sideways: await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) };
    await p.screenshot({ path: join(SHOTS, `02-firms-${w}.png`), fullPage: true }); await c.close();
  }
  const signInHeight = await (async () => { const c = await ctx(375, 800); const p = await pageIn(c); await p.goto(`${BASE}/system/firms`); await seen(p, "[data-system-sign-in]"); const h = (await p.getByRole("button", { name: "Sign in" }).boundingBox())?.height ?? 0; await c.close(); return h; })();
  ok("PF-17 B9 pass (round 2, review #6, UXL-09): at 375 px the card's Sign in button is at least 44 px tall", signInHeight >= 44, signInHeight);
  const pubEmail = "publisher.pf17b@expatready.example.com";
  sql(`with s as (insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${pubEmail}', 'Content publisher (Sample)') on conflict (email) do update set display_name = excluded.display_name returning id)
       insert into plat_system_role_grant (id, staff_id, role_code) select gen_random_uuid(), id, 'platform-content-publisher' from s where not exists (select 1 from plat_system_role_grant g where g.staff_id = s.id) returning staff_id`);
  const tPub = await ourToken(pubEmail);
  const cpub = await ctx(); await cpub.addInitScript(([k, x]) => sessionStorage.setItem(k, JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), [SESSION_KEY, tPub] as const);
  const ppub = await pageIn(cpub); await ppub.goto(`${BASE}/system/firms`);
  const noKey = await ppub.locator("[data-firms-error]").innerText({ timeout: 15_000 }).catch(() => "");
  ok("PF-17 B9 fail (round 2, breaker 5; BR-1): a staff member without system/firm:read reads the API's words, with no search, chips, Retry or empty menu",
    /system\/firm:read|firm read key/i.test(noKey) && (await ppub.getByRole("searchbox").count()) === 0 && (await ppub.locator("[data-chip]").count()) === 0 && (await ppub.getByRole("button", { name: "Retry" }).count()) === 0 && (await ppub.getByRole("navigation", { name: "Console" }).count()) === 0, noKey);
  await cpub.close();
  const cardAxe = (await (async () => { const c = await ctx(); const p = await pageIn(c); await p.goto(`${BASE}/system/firms`); await seen(p, "[data-system-sign-in]"); await p.screenshot({ path: join(SHOTS, "00-sign-in-1440.png") }); const v = await axe(p); await c.close(); return v; })()).length;
  ok("PF-17 B9 pass: axe-core WCAG 2.2 A/AA finds nothing on Firms at 1440, 1024 and 375 px or on the sign-in card; no sideways page scroll at 375 or 1024",
    v1440.length === 0 && widths[1024].axe === 0 && widths[375].axe === 0 && cardAxe === 0 && !widths[375].sideways && !widths[1024].sideways, { v1440: v1440.map((v) => v.id), widths, cardAxe });
  await p1.getByRole("button", { name: "Sign out" }).click();
  ok("PF-17 B9 pass/fail: Sign out ends the session here: the card, nothing kept", await seen(p1, "[data-system-sign-in]") && (await p1.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY)) === null);
  ok("PF-17: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  sql(`update platform_firm set status = 'ACTIVE' where id = '${B}'`);
  await browser.close();
}
process.exit(summary() ? 1 : 0);
