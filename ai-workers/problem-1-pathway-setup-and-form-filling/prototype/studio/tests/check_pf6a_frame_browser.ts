// PF-6 part 1 (brief lead-b-briefs/PF-6.md; concept pf-6-staff r2 §1, §4; AG-1-55, AG-1-41): the platform frame and the
// staff session holder in a real browser against PF-4/PF-4b's real routes on the local stand-in (no fake API): DW1-DW6
// and DW8 (DW7 is FO-4's and PF-1's own suites, run unchanged), each a pass and a fail where the brief names one;
// keyboard-only, axe-core (WCAG 2.2 AA), no sideways scroll, screenshots at 375, 1024, 1440 px. Seeds the Sample firms. US$0.
//   zsh studio/tools/isolated.sh screens_pf6a 4561 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf6a_frame_browser.ts 4561 xr_studio_screens_pf6a
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page, type Request } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { ACCOUNT_SECTIONS, visibleSections } from "../web/src/modules/platform/account-sections.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4561), DBNAME = process.argv[3] ?? "xr_studio_screens_pf6a";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "pf-6-staff", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const ELSEWHERE = "You signed in on another device.", USED = "This sign-in link has been used or has expired. Sign in again.";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const staffOf = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
const R = staffOf("user-R"), O = staffOf("user-O"), T = staffOf("user-T");   // Owner + Case Manager, Case Officer, Case Manager
ok("PF-6a setup: the Sample firm's staff are seeded", !!R.id && !!O.id && !!T.id);
async function apiSignIn(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`);   // a throw, so the seat finally runs (PF-6f review m2)
}
const staffCall = (tok: string, method: string, path: string, body?: unknown) => fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
/** A real hand-off link: an invitation made by the Owner, its token set to one this test knows (the mail is in memory), accepted. */
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
/** Every API request any page makes, for DW1, DW5 and DW6. */
type Seen = { page: Page; method: string; path: string; auth: string | null; actor: string | null; status?: number };
const seen: Seen[] = [];
async function newPage(width = 1440, tok: string | null = null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  if (tok) await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("request", (r: Request) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) seen.push({ page: p, method: r.method(), path: u.pathname, auth: r.headers().authorization ?? null, actor: r.headers()["x-actor"] ?? null }); });
  p.on("response", (res) => { const u = new URL(res.url()); const s = [...seen].reverse().find((x) => x.page === p && x.path === u.pathname && x.status === undefined); if (s) s.status = res.status(); });
  return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const header = (p: Page) => p.locator("header").innerText();
async function signInByCard(p: Page, email: string) {
  await p.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 30_000 });
  await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(email);
  await p.getByRole("button", { name: "Sign in" }).click();
}
const profileShown = (p: Page, name: string) => p.locator("[data-account]", { hasText: name }).waitFor({ timeout: 20_000 });
const clickProfile = (p: Page) => p.locator('nav[aria-label="My account"] [data-account-section="/account"]').click();

// ------------------------------------------------------------------------------------------------------------- DW1
const p1 = await newPage();
await p1.goto(`${BASE}/account`); await p1.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 30_000 });
await p1.waitForTimeout(500);
const before = seen.filter((s) => s.page === p1 && /^\/api\/(platform|front-office)\//.test(s.path));
ok("PF-6a DW1 pass: with no session the frame shows the sign-in card and makes no platform or front-office call except /me's refusal", before.every((s) => s.path === "/api/platform/me" && s.status === 401), before.map((s) => `${s.method} ${s.path} ${s.status}`));
await p1.getByLabel("Firm key").fill("sample-firm"); await p1.getByLabel("Work email").fill(`nobody-${run}@sample-firm.example.com`); await p1.getByRole("button", { name: "Sign in" }).click();
await p1.getByText("Not signed in").waitFor({ timeout: 15_000 });
ok("PF-6a DW1 fail: an unknown email stays on the sign-in card with the server's refusal and no name in the header", !(await header(p1)).includes(R.name) && (await p1.locator("[data-sign-in-card]").count()) === 1);
await signInByCard(p1, R.email); await profileShown(p1, R.email);
ok("PF-6a DW1 pass: signing in through the frame shows the /me display name in the header", (await p1.locator("[data-staff-name]").innerText()) === R.name, await header(p1));
await shot(p1, "my-account-1440");

// ------------------------------------------------------------------------------------------------------------- DW6
const meR = await (await staffCall((await p1.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session")!).token)) as string, "GET", "/platform/me")).json() as { keys: string[] };
const items = await p1.locator('nav[aria-label="My account"] [data-account-section]').allInnerTexts();
const want = visibleSections(ACCOUNT_SECTIONS, meR.keys).map((s) => s.label);
ok("PF-6a DW6: the frame renders one My account item per ACCOUNT_SECTIONS entry the person sees", JSON.stringify(items) === JSON.stringify(want) && want.length >= 1, { items, want });
const extra = [...ACCOUNT_SECTIONS, { label: "Test entry", path: "/account/test", key: null }, { label: "Needs a key", path: "/account/locked", key: "agent/test:not-held" }];
const shown = visibleSections(extra, meR.keys).map((s) => s.label);
ok("PF-6a DW6: a test entry added to the list shows; one whose key the person lacks does not", shown.includes("Test entry") && !shown.includes("Needs a key") && shown.length === ACCOUNT_SECTIONS.length + 1, shown);
ok("PF-6a DW6: no simulated-person control in the frame (the demo menu's test id is absent)", (await p1.locator("[data-person-picker]").count()) === 0 && (await p1.getByLabel("Simulated person").count()) === 0);

// ------------------------------------------------------------------------------------------------------------- DW2
// Fail first: another person (T) signing in leaves O's session open.
const a1 = await newPage();
await a1.goto(`${BASE}/account`); await signInByCard(a1, O.email); await profileShown(a1, O.email);
const b = await newPage(); await b.goto(`${BASE}/account`); await signInByCard(b, T.email); await profileShown(b, T.email);
await clickProfile(a1); await a1.waitForTimeout(1500);
ok("PF-6a DW2 fail: person B signing in leaves person A's session open (A's next click still shows A's account)", (await a1.locator("[data-signed-in-elsewhere]").count()) === 0 && (await a1.locator("[data-staff-name]").innerText()) === O.name);
// Pass: O signs in again in a second browser; O's first browser says so on its next click (AG-1-55).
const a2 = await newPage(); await a2.goto(`${BASE}/account`); await signInByCard(a2, O.email); await profileShown(a2, O.email);
await clickProfile(a1);
await a1.locator("[data-signed-in-elsewhere]").waitFor({ timeout: 15_000 });
ok("PF-6a DW2 pass: A's first browser, on its next click, shows \"You signed in on another device.\" and \"Sign in again here\"", (await a1.getByText(ELSEWHERE).count()) === 1 && (await a1.getByRole("button", { name: "Sign in again here" }).count()) === 1 && (await a1.locator("[data-staff-name]").count()) === 0);
await axe("PF-6a DW8 Signed in elsewhere (1440)", a1); await noSideways("PF-6a DW8 Signed in elsewhere (1440)", a1); await shot(a1, "signed-in-elsewhere-1440");
// DW8 keyboard: the button is reached and named by the keyboard alone, and Enter opens the sign-in card.
await a1.keyboard.press("Tab");
const focusedName = await a1.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim());
ok("PF-6a DW8 keyboard: on Signed in elsewhere the next Tab reaches \"Sign in again here\"", focusedName === "Sign in again here", focusedName);
await a1.keyboard.press("Enter"); await a1.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 10_000 });
ok("PF-6a DW2 pass: \"Sign in again here\" opens the sign-in card", (await a1.locator("[data-sign-in-card]").count()) === 1);
// Fail: a session ended for another reason (SESSION_REVOKED by Sign out everywhere; TOKEN_EXPIRED) shows the sign-in card.
const rTok = await apiSignIn(R.email);
const t1 = await newPage(1440, await apiSignIn(T.email)); await t1.goto(`${BASE}/account`); await profileShown(t1, T.email);
const soe = await staffCall(rTok, "POST", `/platform/staff/${T.id}/sign-out-everywhere`);
await clickProfile(t1); await t1.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 15_000 });
ok("PF-6a DW2 fail: a SESSION_REVOKED end (Sign out everywhere) shows the sign-in card, never Signed in elsewhere", soe.status === 200 && (await t1.locator("[data-signed-in-elsewhere]").count()) === 0 && seen.some((s) => s.page === t1 && s.status === 401));
const ex = await newPage(1440, await apiSignIn(T.email)); await ex.goto(`${BASE}/account`); await profileShown(ex, T.email);
await ex.route("**/api/platform/me", (r) => r.fulfill({ status: 401, contentType: "application/problem+json", body: JSON.stringify({ status: 401, title: "Sign in again", detail: "Your session has ended. Sign in again.", code: "TOKEN_EXPIRED" }) }));
await clickProfile(ex); await ex.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 15_000 });
ok("PF-6a DW2 fail: a TOKEN_EXPIRED end shows the sign-in card, never Signed in elsewhere", (await ex.locator("[data-signed-in-elsewhere]").count()) === 0);

// ------------------------------------------------------------------------------------------------- DW4 and DW3
const newEmail = `pf6a-${run}@example.com`;
// Three invitees: the Sample firm's Team plan holds 5 people, so this run lends it seats (enough for earlier runs on the same copy too), given back at the end.
const plan = sql(`select p.id || '|' || p.seats_limit from platform_subscription s join platform_plan p on p.id = s.plan_id join platform_firm f on f.id = s.firm_id where f.key = 'sample-firm' and s.status <> 'ENDED' limit 1`).split("|");
sql(`update platform_plan set seats_limit = ${Number(plan[1]) + 100} where id = '${plan[0]}'`);
// The lend is given back in the finally, whatever fails below, so the suite reruns on one copy (PF-6f DW3).
try {
const link = await handOffLink(rTok, newEmail);
const link2 = await handOffLink(rTok, `pf6a-b-${run}@example.com`);
const link3 = await handOffLink(rTok, `pf6a-c-${run}@example.com`);
ok("PF-6a DW4 setup: PF-4b's hand-off gives /sign-in/callback#code=…", /^\/sign-in\/callback#code=[\w-]{20,}$/.test(link), link);
// DW3: the tab is signed in as R (My account shows R), then the link signs in the new person in the same tab.
const sw = await newPage(1440, await apiSignIn(R.email)); await sw.goto(`${BASE}/account`); await profileShown(sw, R.email);
await sw.evaluate(() => { (window as unknown as { __rSeen: boolean }).__rSeen = false; });
const posts = () => seen.filter((s) => s.page === sw && s.method === "POST" && s.path === "/api/platform/session/callback");
await sw.goto(`${BASE}${link}`);
await sw.evaluate((rEmail) => { const w = window as unknown as { __rSeen: boolean }; w.__rSeen = false; new MutationObserver(() => { if (document.body.innerText.includes(rEmail)) w.__rSeen = true; }).observe(document.body, { childList: true, subtree: true, characterData: true }); }, R.email);
// PF-18h: the callback lands on Home (the staff's first page); My account then shows the new person.
const homeShown = async (p: Page) => { await p.waitForURL(`${BASE}/home`, { timeout: 20_000 }); await p.locator("[data-needs-you]").waitFor({ timeout: 20_000 }); };
await homeShown(sw);
ok("PF-6a DW4 pass: the callback signs in once and opens Home (PF-18h) as the new person", posts().length === 1 && posts()[0].status === 200 && new URL(sw.url()).pathname === "/home", posts().map((s) => s.status));
await clickProfile(sw); await profileShown(sw, newEmail);
ok("PF-6a DW4 pass: the address bar no longer holds the code (nor does the history entry)", !sw.url().includes("code=") && (await sw.evaluate(() => window.location.hash)) === "", sw.url());
ok("PF-6a DW3 pass: after the change of person no answer of the last person shows (R's email never on the new person's My account)", !(await sw.evaluate(() => (window as unknown as { __rSeen: boolean }).__rSeen)) && !(await sw.locator("main").innerText()).includes(R.email) && (await sw.locator("[data-staff-name]").innerText()) !== R.name);
await sw.goto(`${BASE}/sign-in/callback`); await homeShown(sw); await sw.reload(); await homeShown(sw); await clickProfile(sw); await profileShown(sw, newEmail);
ok("PF-6a DW4 pass: opening and reloading the callback page again makes no second post", posts().length === 1, posts().length);
// Fail: the same code again shows the server's refusal words with the sign-in card, and a reload posts nothing more.
const again = await newPage(); const againPosts = () => seen.filter((s) => s.page === again && s.method === "POST" && s.path === "/api/platform/session/callback");
await again.goto(`${BASE}${link}`); await again.locator("[data-callback-refused]").waitFor({ timeout: 15_000 });
ok("PF-6a DW4 fail: the same code again shows the server's refusal words and the sign-in card", (await again.locator("[data-callback-refused]").innerText()) === USED && (await again.locator("[data-sign-in-card]").count()) === 1 && againPosts().length === 1 && againPosts()[0].status === 401);
await again.reload(); await again.locator("[data-callback-refused]").waitFor({ timeout: 15_000 });
ok("PF-6a DW4 fail: a reload of the refused callback page makes no second post and keeps no code in the address", againPosts().length === 1 && !again.url().includes("code="), againPosts().length);
// Break M1: signing in from the card the refused link offers opens My account (the page leaves its refused state).
await signInByCard(again, O.email); await homeShown(again);
ok("PF-6a DW4 (break M1): after a refused link, signing in from its card opens Home (PF-18h)", new URL(again.url()).pathname === "/home");
// Break M2: a second link opened in the same tab while the callback page shows (only the "#" part changes) is taken too.
const hop = await newPage(); const hopPosts = () => seen.filter((s) => s.page === hop && s.method === "POST" && s.path === "/api/platform/session/callback");
await hop.goto(`${BASE}/sign-in/callback`); await hop.locator("[data-callback-refused]").waitFor({ timeout: 15_000 });
await hop.evaluate((h) => { window.location.hash = h; }, link2.split("#")[1]); await homeShown(hop); await clickProfile(hop); await profileShown(hop, `pf6a-b-${run}@example.com`);
ok("PF-6a DW4 (break M2): a code arriving by a hash change on the open callback page is posted once and leaves the address", hopPosts().length === 1 && !hop.url().includes("code="), hopPosts().length);
// Break M3: storage that refuses writes but still reads an older session: the newer sign-in (and a sign-out) wins.
const full = await newPage(1440, await apiSignIn(T.email));
await full.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("full", "QuotaExceededError"); }; Storage.prototype.removeItem = () => { throw new DOMException("full", "QuotaExceededError"); }; });
await full.goto(`${BASE}${link3}`); await homeShown(full); await clickProfile(full); await profileShown(full, `pf6a-c-${run}@example.com`);
ok("PF-6a DW3 (break M3): with storage writes refused, the new person's account shows, never the older stored person", !(await full.locator("main").innerText()).includes(T.email));
const meCalls = () => seen.filter((s) => s.page === full && s.path === "/api/platform/me").length, m0 = meCalls();
await full.locator("header").getByRole("button", { name: "Sign out" }).click(); await full.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 15_000 }); await full.waitForTimeout(1500);
ok("PF-6a DW5 (break M3): with storage writes refused, Sign out ends the session with no call loop", meCalls() - m0 < 5 && (await full.locator("[data-staff-name]").count()) === 0, meCalls() - m0);
// Break m2: a late 401 for a session already replaced leaves the newer session alone.
const late = await newPage(1440, await apiSignIn(T.email)); await late.goto(`${BASE}/account`); await profileShown(late, T.email);
const lateOld = await late.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session")!).token as string);
const newerTok = await apiSignIn(O.email);
await late.route("**/api/platform/me", async (r) => {
  if (r.request().headers().authorization !== `Bearer ${lateOld}`) return r.continue();
  // While the old token's answer is held back, the tab takes a newer session; then the old one is refused.
  await late.evaluate((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), newerTok);
  await r.fulfill({ status: 401, contentType: "application/problem+json", body: JSON.stringify({ status: 401, title: "Sign in again", detail: "You signed in on another device", code: "SIGNED_IN_ELSEWHERE" }) });
}, { times: 1 });
await clickProfile(late); await late.waitForTimeout(1500);
ok("PF-6a DW2 (break m2): a late 401 for a replaced session leaves the newer session (no Signed in elsewhere, the newer token kept)", (await late.locator("[data-signed-in-elsewhere]").count()) === 0 && (await late.evaluate(() => sessionStorage.getItem("xr-staff-session") ?? "")).includes(newerTok));
// DW3 fail side: the holder's drop is what keeps it out: an answer kept under ["pf"] for R would have shown (checked above by
// the observer); here the reverse: signing back in as R shows R, never the new person.
await sw.locator("header").getByRole("button", { name: "Sign out" }).click(); await signInByCard(sw, R.email); await profileShown(sw, R.email);
ok("PF-6a DW3 pass: signing out and in as another person shows only that person's account", !(await sw.locator("main").innerText()).includes(newEmail));

// ------------------------------------------------------------------------------------------------------------- DW5
const so = await newPage(); await so.goto(`${BASE}/account`); await signInByCard(so, T.email); await profileShown(so, T.email);
const oldTok = await so.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session")!).token as string);
// DW8 keyboard: Sign out is reached and named by Tab alone.
await so.locator("body").click({ position: { x: 5, y: 300 } });
let reached = false;
for (let i = 0; i < 25 && !reached; i++) { await so.keyboard.press("Tab"); reached = await so.evaluate(() => document.activeElement?.textContent?.trim() === "Sign out"); }
ok("PF-6a DW8 keyboard: Sign out is reachable by Tab and named", reached);
const mark = seen.length;
await so.keyboard.press("Enter"); await so.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 15_000 });
const out = seen.slice(mark).filter((s) => s.page === so && s.path === "/api/platform/session/sign-out");
ok("PF-6a DW5 pass: Sign out posts session/sign-out with the session and ends the session here", out.length === 1 && out[0].method === "POST" && out[0].status === 200 && out[0].auth === `Bearer ${oldTok}` && (await so.evaluate(() => sessionStorage.getItem("xr-staff-session"))) === null, out.map((s) => `${s.method} ${s.status}`));
await so.goto(`${BASE}/front-office/leads`); await so.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 15_000 });
await so.goto(`${BASE}/account`); await so.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 15_000 });
const later = seen.slice(mark).filter((s) => s.page === so && s.path !== "/api/platform/session/sign-out");
ok("PF-6a DW5 fail: no later staff call is sent with the old token", later.every((s) => s.auth !== `Bearer ${oldTok}`), later.filter((s) => s.auth).map((s) => s.path));
ok("PF-6a DW5: the server refuses the old token after Sign out", (await staffCall(oldTok, "GET", "/platform/me")).status === 401);

// ------------------------------------------------------------------------------------------------------- DW8, DW6
for (const w of [375, 1024, 1440]) {
  const p = await newPage(w, await apiSignIn(O.email)); await p.goto(`${BASE}/account`); await profileShown(p, O.email);
  ok(`PF-6a DW8 My account (${w} px): the person's name and Sign out are in the header`, (await p.locator("[data-staff-name]").innerText()) === O.name && (await p.locator("header").getByRole("button", { name: "Sign out" }).isVisible()));
  ok(`PF-6a DW8 My account (${w} px): the My account menu is reachable at this width`, (await p.locator("[data-account-section]:visible").count()) >= 1);
  await axe(`PF-6a DW8 My account (${w} px)`, p); await noSideways(`PF-6a DW8 My account (${w} px)`, p); await shot(p, `my-account-${w}`);
  const e = await newPage(w, await apiSignIn(T.email)); await e.goto(`${BASE}/account`); await profileShown(e, T.email);
  await apiSignIn(T.email); await e.reload(); await e.locator("[data-signed-in-elsewhere]").waitFor({ timeout: 15_000 });
  await axe(`PF-6a DW8 Signed in elsewhere (${w} px)`, e); await noSideways(`PF-6a DW8 Signed in elsewhere (${w} px)`, e); await shot(e, `signed-in-elsewhere-${w}`);
}
const actors = seen.filter((s) => s.actor !== null && /^\/api\/(platform|front-office)\//.test(s.path));
ok("PF-6a DW6: no request from the frame carries the simulated person (x-actor)", actors.length === 0 && seen.length > 20, actors.map((s) => s.path));
ok("PF-6a: no page error in any browser", errors.length === 0, errors);
} finally {
  sql(`update platform_plan set seats_limit = ${plan[1]} where id = '${plan[0]}'`);
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
