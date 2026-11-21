// PF-6f (PF-6 part 1's follow-ups; brief rev 16.59): the sign-in callback page in a real browser on an isolated copy.
//   DW1 refused link, Open My account, Back → My account, never left on "Signing you in…"; signed out → the refusal and
//       the sign-in card; a code is posted once (the network log) · DW2 the refused-while-signed-in state shows one notice,
//       "This link was not used. You are still signed in." with Open My account, never "Not signed in", axe-clean.
// The seats this run lends the Sample firm's plan are given back in a finally. Seeds the Sample firms. US$0, no model call.
//   zsh studio/tools/isolated.sh screens_pf6f 4562 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf6f_callback_browser.ts 4562 xr_studio_screens_pf6f
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page, type Request } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4562), DBNAME = process.argv[3] ?? "xr_studio_screens_pf6f";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "pf-6-staff", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const NOTICE = "This link was not used. You are still signed in.";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const R = sql(`select email from platform_staff where actor_id = 'user-R'`), T = sql(`select email from platform_staff where actor_id = 'user-T'`);
async function apiSignIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);   // a throw, so the seat finally runs (PF-6f review m2)
}
const staffCall = (tok: string, method: string, path: string, body?: unknown) => fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
async function handOffLink(ownerToken: string, email: string): Promise<string> {
  const inv = await (await staffCall(ownerToken, "POST", "/platform/staff/invitations", { email, roles: ["CASE_OFFICER"] })).json() as { id?: string; detail?: string };
  if (!inv.id) throw new Error(`invitation refused: ${inv.detail}`);
  const known = randomBytes(32).toString("base64url");
  sql(`update platform_invitation set token_hash = '${createHash("sha256").update(known).digest("hex")}' where id = '${inv.id}'`);
  const acc = await (await fetch(`${BASE}/api/public/invitations/${known}/accept`, { method: "POST" })).json() as { handOff?: { url: string }; detail?: string };
  if (!acc.handOff) throw new Error(`accept refused: ${acc.detail}`);
  return acc.handOff.url;
}
const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
type Seen = { page: Page; method: string; path: string };
const seen: Seen[] = [];
async function newPage(tok: string | null = null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  if (tok) await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("request", (r: Request) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) seen.push({ page: p, method: r.method(), path: u.pathname }); });
  return p;
}
const posts = (p: Page) => seen.filter((s) => s.page === p && s.method === "POST" && s.path === "/api/platform/session/callback").length;
const profileShown = (p: Page, email: string) => p.locator("[data-account]", { hasText: email }).waitFor({ timeout: 20_000 });
/** Whether "Signing you in…" is still showing after the page has had time to decide (3 s). */
/** PF-18h: a callback that signs in lands on Home; My account then shows who it is. */
const landed = async (p: Page, email: string) => { await p.waitForURL(`${BASE}/home`, { timeout: 20_000 }); await p.locator('nav[aria-label="My account"] [data-account-section="/account"]').click(); await profileShown(p, email); };
const stuck = async (p: Page) => { await p.waitForTimeout(3000); return (await p.locator("[data-loading]").count()) > 0; };

// One invitee: the run lends the Sample firm's plan seats and gives them back in the finally, whatever fails.
const plan = sql(`select p.id || '|' || p.seats_limit from platform_subscription s join platform_plan p on p.id = s.plan_id join platform_firm f on f.id = s.firm_id where f.key = 'sample-firm' and s.status <> 'ENDED' limit 1`).split("|");
sql(`update platform_plan set seats_limit = ${Number(plan[1]) + 100} where id = '${plan[0]}'`);
try {
  const rTok = await apiSignIn(R);
  const link = await handOffLink(rTok, `pf6f-${run}@example.com`);
  const first = await newPage(); await first.goto(`${BASE}${link}`); await landed(first, `pf6f-${run}@example.com`);
  ok("PF-6f setup: the link signs its person in once (it is used now)", posts(first) === 1);

  // ------------------------------------------------------------------------------------------------- DW2
  const p = await newPage(await apiSignIn(T)); await p.goto(`${BASE}/account`); await profileShown(p, T);
  await p.goto(`${BASE}${link}`); await p.locator("[data-callback-refused]").waitFor({ timeout: 15_000 });
  const noticeEl = p.locator("[data-callback-notice]"), main = await p.locator("main").innerText();
  const notice = ((await noticeEl.count()) ? await noticeEl.innerText() : "").replace(/\s+/g, " ").trim();
  ok("PF-6f DW2 pass: a used link while signed in shows one notice, \"This link was not used. You are still signed in.\", with Open My account",
    notice.startsWith(NOTICE) && (await p.getByRole("link", { name: "Open My account" }).count()) === 1, notice);
  ok("PF-6f DW2 fail: it never shows \"Not signed in\", the server's \"Sign in again\" or the sign-in card beside it",
    !main.includes("Not signed in") && !main.includes("Sign in again") && (await p.locator("[data-sign-in-card]").count()) === 0, main);
  const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze(), bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok("PF-6f DW2: axe finds no serious or critical WCAG A/AA violation on the refused-while-signed-in state", bad.length === 0, bad.map((v) => v.id).join(" | ") || undefined);
  await p.screenshot({ path: join(SHOTS, "callback-refused-signed-in-1440.png"), fullPage: true });

  // ------------------------------------------------------------------------------------------------- DW1
  await p.getByRole("link", { name: "Open My account" }).click(); await profileShown(p, T);
  await p.goBack();
  const backStuck = await stuck(p);
  // PF-18h: a signed-in callback page lands on Home (the staff's first page), no longer My account.
  ok("PF-6f DW1 pass (Devin, #1912): refused link, Open My account, Back → Home (PF-18h), never left on \"Signing you in…\"",
    !backStuck && new URL(p.url()).pathname === "/home" && (await p.locator("[data-needs-you]").count()) > 0, { url: p.url(), backStuck });
  ok("PF-6f DW1: the used code was posted once on that page, never again on Back", posts(p) === 1, posts(p));
  // The same path signed out: Back lands on the callback page with no session → the refusal and the sign-in card.
  await p.goto(`${BASE}${link}`); await p.locator("[data-callback-refused]").waitFor({ timeout: 15_000 });
  await p.getByRole("link", { name: "Open My account" }).click(); await profileShown(p, T);
  await p.locator("header").getByRole("button", { name: "Sign out" }).click(); await p.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 15_000 });
  await p.goBack();
  const outStuck = await stuck(p);
  ok("PF-6f DW1 fail: the same path signed out → the refusal and the sign-in card, never left on \"Signing you in…\"",
    !outStuck && (await p.locator("[data-callback-refused]").count()) === 1 && (await p.locator("[data-sign-in-card]").count()) === 1, { url: p.url(), outStuck });
  ok("PF-6f DW1: a second post of the same code is never sent (the network log)", posts(p) === 2, posts(p));   // one per address visit, none on Back
  // Breaker M1: an earlier link's late answer never replaces a later sign-in (the newest code decides).
  const L1 = await handOffLink(rTok, `pf6f-a-${run}@example.com`), L2 = await handOffLink(rTok, `pf6f-b-${run}@example.com`);
  const race = await newPage(); let held = 0;
  await race.route("**/api/platform/session/callback", async (r) => { if (held++ === 0) await new Promise((res) => setTimeout(res, 4000)); await r.continue(); });
  await race.goto(`${BASE}${L1}`); await race.waitForTimeout(300);
  await race.evaluate((h) => { window.location.hash = h; }, L2.split("#")[1]); await landed(race, `pf6f-b-${run}@example.com`);
  await race.waitForTimeout(5000);
  ok("PF-6f (breaker M1): a held earlier link answers after a later one → the tab stays the later person",
    (await race.locator("[data-account]", { hasText: `pf6f-b-${run}@example.com` }).count()) > 0 && !(await race.locator("main").innerText()).includes(`pf6f-a-${run}@example.com`) && posts(race) === 2, posts(race));
  // Breaker m3: a post that never reached the server can be sent again from the same tab.
  const L3 = await handOffLink(rTok, `pf6f-c-${run}@example.com`);
  const flaky = await newPage(); let tries = 0;
  await flaky.route("**/api/platform/session/callback", async (r) => { if (tries++ === 0) return r.abort("failed"); await r.continue(); });
  await flaky.goto(`${BASE}${L3}`); await flaky.getByText("Could not reach the server").waitFor({ timeout: 15_000 });
  await flaky.evaluate((h) => { window.location.hash = h; }, L3.split("#")[1]); await landed(flaky, `pf6f-c-${run}@example.com`);
  ok("PF-6f (breaker m3): after a send that never reached the server, the same link opened again in the tab signs in", posts(flaky) === 2, posts(flaky));
  ok("PF-6f: no page error in any browser", errors.length === 0, errors);
} finally {
  sql(`update platform_plan set seats_limit = ${plan[1]} where id = '${plan[0]}'`);
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
