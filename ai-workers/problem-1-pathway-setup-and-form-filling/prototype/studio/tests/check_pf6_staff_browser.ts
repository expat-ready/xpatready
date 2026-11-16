// PF-6 part 2a (brief lead-b-briefs/PF-6p2.md; concept pf-6-staff r2 §3, §4, §6; R1.6): Team, Invite people with
// Compare roles, and the Person panel in a real browser against PF-4/PF-4b/PF-6r's real routes on the local stand-in
// (no fake API; one stubbed answer only for the step-up, whose 5 minutes a test cannot wait). DW1-DW4 and DW8, each a
// pass and a fail; DW9 is the named suites run unchanged. Seeds the Sample firms. US$0.
//   zsh studio/tools/isolated.sh screens_pf6s 4571 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf6_staff_browser.ts 4571 xr_studio_screens_pf6s
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4571), DBNAME = process.argv[3] ?? "xr_studio_screens_pf6s";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "pf-6-staff", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
await seedSampleFirms(db);
const staffOf = (where: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where ${where}`).split("|"); return { id, email, name }; };
const R = staffOf("actor_id = 'user-R'"), O = staffOf("actor_id = 'user-O'"), T = staffOf("actor_id = 'user-T'");   // Owner + Case Manager, Case Officer, Case Manager
const rolesOf = (id: string) => sql(`select coalesce(string_agg(role::text, ',' order by role::text), '') from platform_role_grant where staff_id = '${id}' and ended_at is null`);
async function signIn(email: string): Promise<{ status: number; token?: string; detail?: string }> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, secondStep: true }) });
  return { status: r.status, ...(await r.json() as { token?: string; detail?: string }) };
}
const apiSignIn = async (email: string) => { const s = await signIn(email); if (!s.token) throw new Error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${s.detail}`); return s.token; };
const staffCall = (tok: string, method: string, path: string, body?: unknown) => fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${tok}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
/** Accepts the invitation with this id (its token set to one the test knows; the mail is in memory); returns the hand-off link. */
async function accept(invitationId: string): Promise<string> {
  const known = randomBytes(32).toString("base64url");
  sql(`update platform_invitation set token_hash = '${createHash("sha256").update(known).digest("hex")}' where id = '${invitationId}'`);
  const acc = await (await fetch(`${BASE}/api/public/invitations/${known}/accept`, { method: "POST" })).json() as { handOff?: { url: string }; detail?: string };
  if (!acc.handOff) throw new Error(`accept refused: ${acc.detail}`);
  return acc.handOff.url;
}
const browser: Browser = await chromium.launch({ headless: true, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
type Seen = { page: Page; method: string; path: string; status?: number };
const seen: Seen[] = [];
async function newPage(width = 1440, tok: string | null = null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  if (tok) await ctx.addInitScript((t) => { if (!sessionStorage.getItem("xr-staff-session")) sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })); }, tok);
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("request", (r) => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) seen.push({ page: p, method: r.method(), path: u.pathname }); });
  p.on("response", (res) => { const u = new URL(res.url()); const s = [...seen].reverse().find((x) => x.page === p && x.path === u.pathname && x.status === undefined); if (s) s.status = res.status(); });
  return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const team = async (p: Page) => { await p.goto(`${BASE}/platform/team`); await p.locator("[data-seat-line]").waitFor({ timeout: 30_000 }); };
const row = (p: Page, email: string) => p.locator(`[data-team-row="${email}"]`);
async function openPerson(p: Page, email: string) { await row(p, email).getByRole("button").click(); await p.locator("[data-person-roles]").waitFor({ timeout: 15_000 }); }
async function act(p: Page, button: string, reason: string | null) {
  await p.locator(`[data-${button}]`).click();
  if (reason !== null) await p.locator("[data-act-reason]").fill(reason);
  await p.locator("[data-act-confirm]").click();
}
const posts = (p: Page, re: RegExp) => seen.filter((s) => s.page === p && s.method !== "GET" && re.test(s.path));
const settle = async (p: Page, re: RegExp, n: number) => { for (let i = 0; i < 100 && posts(p, re).filter((s) => s.status !== undefined).length < n; i++) await p.waitForTimeout(100); };
const signInCard = (p: Page) => p.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 15_000 });
const clickProfile = (p: Page) => p.locator('nav[aria-label="My account"] [data-account-section="/account"]').click();

const plan = sql(`select p.id || '|' || p.seats_limit from platform_subscription s join platform_plan p on p.id = s.plan_id join platform_firm f on f.id = s.firm_id where f.key = 'sample-firm' and s.status <> 'ENDED' limit 1`).split("|");
const used = () => Number(sql(`select ((select count(*) from platform_staff s join platform_firm f on f.id = s.firm_id where f.key = 'sample-firm' and s.status in ('ACTIVE','SUSPENDED')) + (select count(*) from platform_invitation i join platform_firm f on f.id = i.firm_id where f.key = 'sample-firm' and accepted_at is null and revoked_at is null and expires_at > now()))`));
const limit = (n: number) => sql(`update platform_plan set seats_limit = ${n} where id = '${plan[0]}'`);
limit(Number(plan[1]) + 100);   // lent for this run, given back in the finally (the suite reruns on one copy)
try {
const rTok = await apiSignIn(R.email);
const p = await newPage(1440, rTok);

// ------------------------------------------------------------------------------------------------------------- DW1
const X = `pf6-x-${run}@example.com`;
await team(p);
ok("PF-6 DW1 pass: Team shows the seat line from the server", (await p.locator("[data-seat-line]").innerText()).startsWith(`${used()} of ${Number(plan[1]) + 100} seats used`));
await p.locator("[data-invite-open]").click(); await p.getByLabel("Email, person 1").fill(X);
ok("PF-6 DW1/BR-1 pass: Case Officer is ticked first", await p.locator('[data-invite-row="1"] [data-role="CASE_OFFICER"]').isChecked());
await p.locator("[data-send-invites]").click(); await settle(p, /\/staff\/invitations$/, 1);
const invX = sql(`select id from platform_invitation where email = '${X}'`);
ok("PF-6 DW1 pass: Invite people sends one invitation for the row (Case Officer)", posts(p, /\/staff\/invitations$/).length === 1 && !!invX && sql(`select roles::text from platform_invitation where id = '${invX}'`) === "{CASE_OFFICER}");
await p.locator('[data-chip="invited"]').click(); await row(p, X).waitFor({ timeout: 10_000 });
ok("PF-6 DW1 pass: the Invited chip lists the pending invitation", (await row(p, X).innerText()).includes("Invited"));
const x = await newPage(); await x.goto(`${BASE}${await accept(invX)}`); await x.locator("[data-account]", { hasText: X }).waitFor({ timeout: 20_000 });
const Xs = staffOf(`email = '${X}'`);
await team(p); await row(p, X).waitFor({ timeout: 10_000 });
ok("PF-6 DW1 pass: after the second browser accepts, Team shows the person Active", (await row(p, X).locator("[data-status]").innerText()) === "Active");
await openPerson(p, X); await p.locator('[data-person-roles] [data-role="READ_ONLY"]').check();
ok("PF-6 DW3 fail: adding Read only (no money key) shows no money line", (await p.locator("[data-person-roles] [data-money-line]").count()) === 0);
await p.locator("[data-save-roles]").click(); await settle(p, /\/roles$/, 1);
ok("PF-6 DW1 pass: the role change is saved (Case Officer + Read only)", rolesOf(Xs.id) === "CASE_OFFICER,READ_ONLY", rolesOf(Xs.id));
await act(p, "sign-out-everywhere", null); await settle(p, /sign-out-everywhere$/, 1);
await clickProfile(x); await signInCard(x);
ok("PF-6 DW1 pass: Sign out everywhere ends the person's session (their next click shows the sign-in card)", (await x.locator("[data-sign-in-card]").count()) === 1);
const xTok = await apiSignIn(X);
await act(p, "deactivate", ""); await p.locator("[data-act-error]").waitFor({ timeout: 10_000 });
ok("PF-6 DW2/BR-7 fail: Deactivate without a reason shows the server's words and changes nothing", (await p.locator("[data-act-error]").innerText()).includes("Give a deactivation reason (1 to 200 characters).") && sql(`select status from platform_staff where id = '${Xs.id}'`) === "ACTIVE");
await p.locator("[data-act-reason]").fill("Left the firm"); await p.locator("[data-act-confirm]").click(); await settle(p, /deactivate$/, 2);
ok("PF-6 DW1 pass: Deactivate with a reason: their next request is refused", (await staffCall(xTok, "GET", "/platform/me")).status === 401 && (await signIn(X)).status === 401);
await team(p); await p.locator('[data-chip="inactive"]').click(); await row(p, X).waitFor({ timeout: 10_000 });
ok("PF-6 DW2/BR-7 pass: the Inactive chip shows \"(Inactive) Name\"", (await row(p, X).innerText()).includes(`(Inactive) ${Xs.name}`));
await openPerson(p, X); await act(p, "reactivate", "Came back"); await settle(p, /reactivate$/, 1);
ok("PF-6 DW1 pass: Reactivate: the person signs in again", (await signIn(X)).status === 200);

// ------------------------------------------------------------------------------------------------------------- DW3
await team(p); await p.locator("[data-invite-open]").click();
await p.locator("[data-compare-roles]").click(); await p.locator("[data-compare]").waitFor();
const apiRoles = (await (await staffCall(rTok, "GET", "/platform/roles")).json() as { roles: { role: string; moneyKeys: number; licenceKeys: number }[] }).roles;
let groups = true;
for (const r of apiRoles) {
  const box = p.locator(`[data-compare-role="${r.role}"]`);
  groups &&= (await box.locator('[data-key-group="MONEY"] summary').innerText()).endsWith(`: ${r.moneyKeys}`) && (await box.locator('[data-key-group="LICENCE"] summary').innerText()).endsWith(`: ${r.licenceKeys}`);
}
ok("PF-6 DW3 pass: Compare roles shows the six roles, each with money permissions and licence actions in their own groups, counted by PF-6r's class", apiRoles.length === 6 && groups && (await p.locator("[data-compare-role]").count()) === 6);
await axe("PF-6 DW8 Compare roles (1440)", p); await shot(p, "compare-roles-1440");
await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
await team(p); await openPerson(p, T.email); await p.locator('[data-person-roles] [data-role="BILLING_FINANCE"]').check();
const billing = apiRoles.find((r) => r.role === "BILLING_FINANCE")!.moneyKeys;
ok("PF-6 DW3 pass: giving Billing and finance shows \"This gives <name> 12 money permissions.\" before Save", (await p.locator("[data-person-roles] [data-money-line]").innerText()) === `This gives ${T.name} ${billing} money permissions.` && billing === 12);
const linesBefore = Number(sql(`select count(*) from audit_event where action = 'platform.staff.money_keys_granted' and entity_key = '${T.id}'`));
await p.locator("[data-save-roles]").click(); await settle(p, /\/roles$/, 2);
ok("PF-6 DW3 pass: saving it writes the money_keys_granted line (PF-6m), read through the audit", Number(sql(`select count(*) from audit_event where action = 'platform.staff.money_keys_granted' and entity_key = '${T.id}'`)) === linesBefore + 1);
await staffCall(rTok, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER"] });

// ------------------------------------------------------------------------------------------------- DW2 (BR-1 to BR-6)
const A = `pf6-a-${run}@example.com`;
const invA = await (await staffCall(rTok, "POST", "/platform/staff/invitations", { email: A, roles: ["ADMIN"] })).json() as { id: string };
await accept(invA.id);
const aTok = await apiSignIn(A), ap = await newPage(1440, aTok);
await team(ap); await ap.locator("[data-invite-open]").click();
const offered = await ap.locator('[data-invite-row="1"] [data-role]').evaluateAll((els) => els.map((e) => e.getAttribute("data-role")));
// The picker offers exactly what the server allows: each role it hides, the server refuses for the Admin (403).
const hidden: string[] = [];
for (const r of apiRoles.map((x) => x.role).filter((x) => !offered.includes(x))) if ((await staffCall(aTok, "POST", "/platform/staff/invitations", { email: `pf6-c-${r.toLowerCase()}-${run}@example.com`, roles: [r] })).status === 403) hidden.push(r);
ok("PF-6 DW2/BR-1 fail: an Admin's picker offers no Owner and no role holding keys it lacks (Case Manager)", !offered.includes("OWNER") && !offered.includes("CASE_MANAGER") && offered.includes("READ_ONLY"), offered);
ok("PF-6 DW2/BR-1 fail: every role the Admin's picker hides is refused by the server when crafted (403); nothing is pre-ticked that is not offered", hidden.length === apiRoles.length - offered.length && hidden.includes("OWNER") && (await ap.locator('[data-invite-row="1"] [data-role]:checked').count()) === (offered.includes("CASE_OFFICER") ? 1 : 0), hidden);
await ap.keyboard.press("Escape");
await openPerson(ap, R.email);
ok("PF-6 DW2/BR-5 fail: an Admin sees the Owner's Owner role as one it cannot give or remove", (await ap.locator("[data-fixed-roles]").innerText()).includes("Owner") && (await ap.locator('[data-person-roles] [data-role="OWNER"]').count()) === 0);
await team(p); await p.locator("[data-invite-open]").click();
const ownerOffered = await p.locator('[data-invite-row="1"] [data-role]').evaluateAll((els) => els.map((e) => e.getAttribute("data-role")));
ok("PF-6 DW2/BR-1 pass: an Owner's invite picker offers every role but Owner", !ownerOffered.includes("OWNER") && ownerOffered.length === 5, ownerOffered);
// BR-3: the same email twice is flagged and nothing is sent; an existing staff member is flagged with the server's words.
await p.getByLabel("Email, person 1").fill(O.email); await p.locator("[data-add-row]").click(); await p.getByLabel("Email, person 2").fill(O.email.toUpperCase());
const sentBefore = posts(p, /\/staff\/invitations$/).length;
await p.locator("[data-send-invites]").click(); await p.waitForTimeout(500);
ok("PF-6 DW2/BR-3 fail: a duplicate row is flagged on its row and nothing is sent", (await p.locator('[data-invite-row="2"]').innerText()).includes("This email is already on another row.") && posts(p, /\/staff\/invitations$/).length === sentBefore);
await p.getByRole("button", { name: "Remove person 2" }).click(); await p.locator("[data-send-invites]").click(); await settle(p, /\/staff\/invitations$/, sentBefore + 1);
ok("PF-6 DW2/BR-3 fail: an existing staff member's row keeps the server's words; no invitation is made", (await p.locator('[data-invite-row="1"]').innerText()).includes("This person is already on your firm's staff.") && sql(`select count(*) from platform_invitation where email = '${O.email}'`) === "0");
// BR-2: over the limit nothing is sent; the whole form is counted.
await p.keyboard.press("Escape"); limit(used() + 1);
await team(p); await p.locator("[data-invite-open]").click(); await p.getByLabel("Email, person 1").fill(`pf6-s1-${run}@example.com`);
ok("PF-6 DW2/BR-2 pass: one more person fits: the seat line counts the form", (await p.locator("[data-invite-seats]").innerText()) === `${used() + 1} of ${used() + 1} seats after these invites`);
await p.locator("[data-add-row]").click(); await p.getByLabel("Email, person 2").fill(`pf6-s2-${run}@example.com`);
const before2 = posts(p, /\/staff\/invitations$/).length;
await p.locator("[data-send-invites]").click({ force: true }); await p.waitForTimeout(500);
ok("PF-6 DW2/BR-2 fail: over the limit it says \"Remove 1 person or upgrade\" and sends nothing", (await p.getByText("Remove 1 person or upgrade your plan.").count()) === 1 && posts(p, /\/staff\/invitations$/).length === before2);
await p.keyboard.press("Escape");
await staffCall(rTok, "POST", `/platform/staff/${Xs.id}/deactivate`, { reason: "seat test" }); limit(used());
await team(p); await p.locator('[data-chip="inactive"]').click(); await openPerson(p, X); await act(p, "reactivate", "Back again"); await p.locator("[data-act-error]").waitFor({ timeout: 10_000 });
ok("PF-6 DW2/BR-2 fail: Reactivate over the limit shows the server's seat words and changes nothing", (await p.locator("[data-act-error]").innerText()).includes("counting active, suspended and invited people") && sql(`select status from platform_staff where id = '${Xs.id}'`) === "DEACTIVATED");
await p.keyboard.press("Escape"); limit(Number(plan[1]) + 100);
// BR-5: own roles; the Owner role needs a reason, then "Confirm it's you" (the 5 minutes cannot pass in a test: one stubbed 401).
await team(p); await openPerson(p, R.email);
ok("PF-6 DW2/BR-5 fail: nobody changes their own roles (no Save, the rule in words)", (await p.locator("[data-own-roles]").count()) === 1 && (await p.locator("[data-save-roles]").count()) === 0);
await p.keyboard.press("Escape"); await openPerson(p, T.email); await p.locator('[data-person-roles] [data-role="OWNER"]').check(); await p.locator("[data-save-roles]").click();
await p.locator("[data-roles-error]").waitFor({ timeout: 10_000 });
ok("PF-6 DW2/BR-5 fail: giving Owner without a reason shows the server's words and saves nothing", (await p.locator("[data-roles-error]").innerText()) === "Giving or removing the Owner role needs a written reason." && !rolesOf(T.id).includes("OWNER"));
await p.route("**/api/platform/staff/*/roles", (r) => r.fulfill({ status: 401, contentType: "application/problem+json", body: JSON.stringify({ status: 401, title: "Confirm it's you", detail: "Confirm it's you: sign in again, then try once more. Giving or removing the Owner role needs a sign-in in the last 5 minutes.", code: "STEP_UP_REQUIRED" }) }), { times: 1 });
await p.locator("[data-roles-reason]").fill("Second Owner for cover"); await p.locator("[data-save-roles]").click();
await p.locator("[data-step-up-words]").waitFor({ timeout: 10_000 });
ok("PF-6 DW2/BR-5 fail: an old sign-in shows \"Confirm it's you\" with the server's words, the session kept, nothing saved", !rolesOf(T.id).includes("OWNER") && (await p.locator("[data-staff-name]").innerText()) === R.name);
await p.locator("[data-sign-in-again]").click();
for (let i = 0; i < 100 && !rolesOf(T.id).includes("OWNER"); i++) await p.waitForTimeout(100);
ok("PF-6 DW2/BR-5 pass: after signing in again the same change is sent once more and saved (Owner given with its reason)", rolesOf(T.id) === "CASE_MANAGER,OWNER" && (await p.locator("[data-person-roles]").count()) === 1);
const pTok = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session")!).token as string);
await staffCall(pTok, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER"], reason: "cover ended" });
// BR-6: the only active Owner cannot deactivate themself.
await team(p); await openPerson(p, R.email); await act(p, "deactivate", "Leaving"); await p.locator("[data-act-error]").waitFor({ timeout: 10_000 });
ok("PF-6 DW2/BR-6 fail: the only active Owner deactivating themself sees SA-6-44's words, and stays active", (await p.locator("[data-act-error]").innerText()) === "This is your firm's only active Owner. Give the Owner role to another person first." && sql(`select status from platform_staff where id = '${R.id}'`) === "ACTIVE");
await p.keyboard.press("Escape");

// ------------------------------------------------------------------------------------------------------------- DW4
const op = await newPage(1440, await apiSignIn(O.email)); await op.goto(`${BASE}/platform/team`); await op.locator("[data-team-refused]").waitFor({ timeout: 20_000 });
const refused = await staffCall(await op.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session")!).token as string), "GET", "/platform/staff");
const words = (await refused.json() as { detail: string }).detail;
ok("PF-6 DW4 fail: a Case Officer opening /platform/team by URL sees the server's refusal on screen, and the API answers 403", refused.status === 403 && (await op.locator("[data-team-refused]").innerText()) === words && seen.some((s) => s.page === op && s.path === "/api/platform/staff" && s.status === 403), words);
ok("PF-6 DW4 pass: the Case Officer's menu has no Team entry; the Owner's has", (await op.locator('[data-account-section="/platform/team"]').count()) === 0 && (await p.locator('nav[aria-label="My account"] [data-account-section="/platform/team"]').count()) === 1);

// ------------------------------------------------------------------------------------------------------------- DW8
await team(p); await p.locator("body").click({ position: { x: 5, y: 400 } });
let reached = false;
for (let i = 0; i < 25 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate(() => document.activeElement?.textContent?.trim() === "Invite people"); }
await p.keyboard.press("Enter"); await p.getByLabel("Email, person 1").waitFor();
ok("PF-6 DW8 keyboard: Tab reaches Invite people and Enter opens the panel on its first field", reached && (await p.evaluate(() => document.activeElement?.getAttribute("type"))) === "email");
await axe("PF-6 DW8 Invite people (1440)", p); await shot(p, "invite-people-1440");
await p.keyboard.press("Escape");
reached = false;
for (let i = 0; i < 30 && !reached; i++) { await p.keyboard.press("Tab"); reached = await p.evaluate((n) => document.activeElement?.textContent?.trim() === n, T.name); }
await p.keyboard.press("Enter"); await p.locator("[data-person-roles]").waitFor({ timeout: 10_000 });
ok("PF-6 DW8 keyboard: a person's name is reached by Tab and Enter opens the Person panel", reached);
await axe("PF-6 DW8 Person panel (1440)", p); await shot(p, "person-panel-1440");
await p.keyboard.press("Escape");
for (const w of [375, 1024, 1440]) {
  const v = await newPage(w, await apiSignIn(R.email)); await team(v);
  await axe(`PF-6 DW8 Team (${w} px)`, v); await noSideways(`PF-6 DW8 Team (${w} px)`, v); await shot(v, `team-${w}`);
}
ok("PF-6: no page error in any browser", errors.length === 0, errors);
} finally {
  limit(Number(plan[1]));
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
