// PF-6 part 2a (brief lead-b-briefs/PF-6p2.md; concept pf-6-staff r2 §3, §4, §6; R1.6): Team, Invite people with
// Compare roles, and the Person panel in a real browser against PF-4/PF-4b/PF-6r's real routes on the local stand-in
// (no fake API; one stubbed answer only for the step-up, whose 5 minutes a test cannot wait). DW1-DW4 and DW8 (part 2a), DW5-DW8 (part 2b:
// Accept invitation, Licences, My account's licence, Security), each a pass and a fail; DW9 is the named suites run unchanged. Seeds the Sample firms. US$0.
//   zsh studio/tools/isolated.sh screens_pf6s 4571 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf6_staff_browser.ts 4571 xr_studio_screens_pf6s
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
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
  p.on("dialog", (d) => void d.accept());   // "Discard the people you typed?" when a filled Invite people closes
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
/** PF-18h: a sign-in hand-off lands on Home; My account (opened from the menu) then shows who signed in. */
const landedAs = async (p: Page, email: string) => { await p.waitForURL(`${BASE}/home`, { timeout: 20_000 }); await clickProfile(p); await p.locator("[data-account]", { hasText: email }).waitFor({ timeout: 20_000 }); };

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
const Y = `pf6-y-${run}@example.com`, invY = (await (await staffCall(rTok, "POST", "/platform/staff/invitations", { email: Y, roles: ["READ_ONLY"] })).json() as { id: string }).id;
await p.goto(`${BASE}/platform/team?view=invited&invitation=${invY}`); await p.locator("[data-revoke]").click(); await p.locator("[data-act-confirm]").waitFor();
ok("PF-6 DW1 fail: Revoke asks first; Cancel leaves the invitation pending", (await p.locator("[data-act-confirm]").innerText()) === "Revoke invitation" && sql(`select revoked_at is null from platform_invitation where id = '${invY}'`) === "t");
await p.locator("[data-act-confirm]").click(); await settle(p, /revoke$/, 1);
await p.goto(`${BASE}/platform/team?view=invited&invitation=${invY}`); await p.locator("[data-seat-line]").waitFor(); await p.waitForTimeout(500);
ok("PF-6 DW1 pass: Revoke confirmed revokes it; its address no longer opens a live-looking panel", sql(`select revoked_at is not null from platform_invitation where id = '${invY}'`) === "t" && (await p.locator("[data-person-invitation]").count()) === 0);
const x = await newPage(); await x.goto(`${BASE}${await accept(invX)}`); await landedAs(x, X);
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
ok("PF-6 DW2/BR-1 fail: every role the Admin's picker hides is refused by the server when crafted (403)", hidden.length === apiRoles.length - offered.length && hidden.includes("OWNER"), hidden);
// Pinned on purpose (Build Lead A, #2044 comment 6931260376; founder question pending): as Admin, Case Officer is not in the
// picker (SA-6-29's ceiling: Admin lacks agent/sqr:verify, party:view.own) and nothing is pre-ticked. A later row changes this knowingly.
ok("PF-6 DW2/BR-1 pinned: as Admin, Case Officer is not offered and nothing is pre-ticked (as Owner it is pre-ticked: DW1)", !offered.includes("CASE_OFFICER") && hidden.includes("CASE_OFFICER") && (await ap.locator('[data-invite-row="1"] [data-role]:checked').count()) === 0);
await ap.keyboard.press("Escape");
await openPerson(ap, R.email);
ok("PF-6 DW2/BR-5 fail: an Admin sees the Owner's Owner role as one it cannot give or remove", (await ap.locator("[data-fixed-roles]").innerText()).includes("Owner") && (await ap.locator('[data-person-roles] [data-role="OWNER"]').count()) === 0);
ok("PF-6 DW2/BR-10 fail: an Admin sees no Sign out everywhere or Deactivate on an Owner, only why", (await ap.locator("[data-owner-access]").count()) === 1 && (await ap.locator("[data-deactivate], [data-sign-out-everywhere]").count()) === 0);
// Review MJ-1 / break M1: a panel read before someone else's change saves nothing and shows the roles now.
await team(p); await openPerson(p, T.email); await p.locator('[data-person-roles] [data-role="BILLING_FINANCE"]').check();
await staffCall(rTok, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER", "READ_ONLY"] });
await p.locator("[data-save-roles]").click(); await p.locator("[data-roles-error]").waitFor({ timeout: 10_000 });
ok("PF-6 DW2/BR-5 fail (conflict): saving from an older read changes nothing and says someone else changed the roles", (await p.locator("[data-roles-error]").innerText()).startsWith("Someone else changed") && rolesOf(T.id) === "CASE_MANAGER,READ_ONLY" && await p.locator('[data-person-roles] [data-role="READ_ONLY"]').isChecked());
await staffCall(rTok, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER"] });
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
await p.keyboard.press("Escape"); await p.waitForTimeout(300);
ok("PF-6 DW8 keyboard (review MJ-2): closing Invite people returns focus to its button", (await p.evaluate(() => document.activeElement?.textContent?.trim())) === "Invite people");
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

// ------------------------------------------------------------------------------------- part 2b: DW5, DW6, DW7, DW8
/** Gives the invitation a token the test knows (the mail is in memory) and returns the email's link. */
const linkOf = (invitationId: string) => { const known = randomBytes(32).toString("base64url"); sql(`update platform_invitation set token_hash = '${createHash("sha256").update(known).digest("hex")}' where id = '${invitationId}'`); return { known, url: `${BASE}/invitation#t=${known}` }; };
// One session per person (AG-1-55): the width checks above signed the Owner in again, so part 2b takes its own session.
const r2Tok = await apiSignIn(R.email), rp = await newPage(1440, r2Tok);
const invite = async (email: string) => (await (await staffCall(r2Tok, "POST", "/platform/staff/invitations", { email, roles: ["READ_ONLY"] })).json() as { id: string }).id;
// DW5 (BR-4): valid → Continue → signed in; the same link again, an expired one and a revoked one show the fixed words.
const W = `pf6-w-${run}@example.com`, invW = await invite(W), lW = linkOf(invW);
const wp = await newPage(); await wp.goto(lW.url); await wp.locator('[data-accept="valid"]').waitFor({ timeout: 20_000 });
ok("PF-6 DW5/BR-4 pass: a valid link shows the firm, the invitee's email and \"Continue to set your password\"; the token leaves the address", (await wp.locator("[data-accept-email]").innerText()) === W && (await wp.locator("[data-accept-firm]").innerText()).length > 0 && (await wp.locator("[data-accept-continue]").innerText()) === "Continue to set your password" && !wp.url().includes(lW.known));
await wp.locator("[data-accept-continue]").click(); await landedAs(wp, W);
ok("PF-6 DW5/BR-4 pass: Continue accepts once and the hand-off signs the new person in (My account shows them)", sql(`select count(*) from platform_staff where email = '${W}'`) === "1" && posts(wp, /\/accept$/).length === 1);
const again = await newPage(); await again.goto(lW.url); await again.locator('[data-accept="closed"]').waitFor({ timeout: 20_000 });
ok("PF-6 DW5/BR-4 fail: the same link again (used) shows \"This invitation is no longer valid.\" and no Continue", (await again.locator("[data-accept-words]").innerText()) === "This invitation is no longer valid." && (await again.locator("[data-accept-continue]").count()) === 0);
const E = `pf6-e-${run}@example.com`, invE = await invite(E), lE = linkOf(invE);
sql(`update platform_invitation set created_at = now() - interval '73 hours', expires_at = now() - interval '1 hour' where id = '${invE}'`);   // inside the 72-hour check
const ep = await newPage(); await ep.goto(lE.url); await ep.locator('[data-accept="closed"]').waitFor({ timeout: 20_000 });
const expiredWords = await ep.locator("[data-accept-words]").innerText();
ok("PF-6 DW5/BR-4 fail: an expired link shows \"This invitation has expired. Ask <firm> to send a new one.\" and makes no staff member", /^This invitation has expired\. Ask .+ to send a new one\.$/.test(expiredWords) && sql(`select count(*) from platform_staff where email = '${E}'`) === "0", expiredWords);
await axe("PF-6 DW8 Accept invitation, expired (1440)", ep); await shot(ep, "accept-expired-1440");
const V = `pf6-v-${run}@example.com`, invV = await invite(V), lV = linkOf(invV);
await staffCall(r2Tok, "POST", `/platform/staff/invitations/${invV}/revoke`, {});
const vp = await newPage(375); await vp.goto(lV.url); await vp.locator('[data-accept="closed"]').waitFor({ timeout: 20_000 });
ok("PF-6 DW5/BR-4 fail: a revoked link shows \"This invitation is no longer valid.\"", (await vp.locator("[data-accept-words]").innerText()) === "This invitation is no longer valid.");
await noSideways("PF-6 DW8 Accept invitation (375 px)", vp);
const getsBefore = seen.filter((x) => x.page === vp && x.path.startsWith("/api/public/invitations/")).length;
await vp.reload(); await vp.locator('[data-accept="closed"]').waitFor({ timeout: 20_000 });
ok("PF-6 DW5 fail: a reload of the cleaned address sends nothing and asks for the email's link again", seen.filter((x) => x.page === vp && x.path.startsWith("/api/public/invitations/")).length === getsBefore && (await vp.locator("[data-accept-words]").innerText()) === "Open the invitation link from your email again.");
// A valid link, before Continue, for the axe and width checks.
const lQ = linkOf(await invite(`pf6-q-${run}@example.com`));
for (const w of [375, 1024, 1440]) { const v = await newPage(w); await v.goto(lQ.url); await v.locator('[data-accept="valid"]').waitFor({ timeout: 20_000 }); await axe(`PF-6 DW8 Accept invitation, valid (${w} px)`, v); await noSideways(`PF-6 DW8 Accept invitation (${w} px)`, v); await shot(v, `accept-valid-${w}`); }

// DW7: My account → Licence, the person's own; the two-step state and the Security line.
// PF-4c part 2 (R1.92): the College's numbers are "R and 6 numbers" (college-ic.ca), so a College record here uses that shape: any
// other shape now saves with the soft warning, and on Licences the panel then stays open (a later click would hit it). Each is
// distinct per run, so the leak checks below still find only this run's numbers.
const licBase = Date.now() % 900_000, licOf = (k: number) => `R${String(100_000 + ((licBase + k * 1009) % 900_000)).padStart(6, "0")}`;
const LIC = licOf(0), LIC2 = licOf(1), LIC_OLD = licOf(2), LIC_NEW = licOf(3), LIC_A = licOf(4);
sql(`delete from platform_staff_credential where staff_id = '${O.id}'`);   // the suite reruns on one copy
const oTok = await apiSignIn(O.email), lp = await newPage(1440, oTok);
await lp.goto(`${BASE}/account/licence`); await lp.locator("[data-licence-form]").waitFor({ timeout: 20_000 });
ok("PF-6 DW7 pass: My account has a Licence entry for everyone, and the page shows the two-step state", (await lp.locator('nav[aria-label="My account"] [data-account-section="/account/licence"]').count()) === 1 && (await lp.locator("[data-two-step-state]").innerText()).length > 0);
await lp.locator("[data-licence-type]").selectOption("College member (CICC)");
ok("PF-6 DW7 pass: a College member's body is set to the College (the only body for that type)", (await lp.locator("[data-licence-body]").inputValue()) === "College of Immigration and Citizenship Consultants");
await lp.locator("[data-licence-number]").fill("   "); await lp.locator("[data-licence-save]").click(); await lp.locator("[data-licence-error]").waitFor({ timeout: 10_000 });
ok("PF-6 DW7 fail: a blank number shows the server's words and saves nothing", (await lp.locator("[data-licence-error]").innerText()) === "Give the licence number (1 to 100 characters)." && sql(`select count(*) from platform_staff_credential where staff_id = '${O.id}'`) === "0");
await lp.locator("[data-licence-number]").fill(LIC); await lp.locator("[data-licence-save]").click();
for (let i = 0; i < 100 && sql(`select count(*) from platform_staff_credential where staff_id = '${O.id}'`) === "0"; i++) await lp.waitForTimeout(100);
const toastO = await lp.getByText("Your licence record was saved.").innerText({ timeout: 10_000 }).catch(() => "");
ok("PF-6 DW7 pass: Save keeps the own licence (type, body, number) and the toast says so without the number", sql(`select representative_type || '|' || licensing_body || '|' || licence_number from platform_staff_credential where staff_id = '${O.id}'`) === `College member (CICC)|College of Immigration and Citizenship Consultants|${LIC}` && toastO.length > 0 && !toastO.includes(LIC));
ok("PF-6 DW8 keyboard (review MJ-2): after Save the focus stays on Save (the form is not rebuilt)", await lp.evaluate(() => document.activeElement?.hasAttribute("data-licence-save") ?? false));
const putsO = () => posts(lp, /\/me\/account$/).length, putsBefore = putsO();
await lp.locator("[data-licence-save]").click(); await lp.locator("[data-licence-note]").waitFor({ timeout: 10_000 });
ok("PF-6 DW7 fail (break m4): Save with nothing changed sends nothing and says so", putsO() === putsBefore && (await lp.locator("[data-licence-note]").innerText()) === "Nothing to save: the licence is as it was.");
// Review MJ-1 / break M1: a form opened before someone else's save does not undo it.
await staffCall(oTok, "PUT", "/platform/me/account", { licence: { representativeType: "Notary (Chambre des notaires du Québec)", licensingBody: "Chambre des notaires du Québec", licenceNumber: LIC2 } });
await lp.locator("[data-licence-number]").fill(LIC_OLD); await lp.locator("[data-licence-save]").click(); await lp.locator("[data-licence-error]").waitFor({ timeout: 10_000 });
ok("PF-6 DW7 fail (conflict): saving from an older read saves nothing, says someone else changed it, and shows the record as it is", (await lp.locator("[data-licence-error]").innerText()).startsWith("Someone else changed this licence") && sql(`select licence_number from platform_staff_credential where staff_id = '${O.id}'`) === LIC2 && (await lp.locator("[data-licence-number]").inputValue()) === LIC2);
await staffCall(oTok, "PUT", "/platform/me/account", { licence: { representativeType: "College member (CICC)", licensingBody: "College of Immigration and Citizenship Consultants", licenceNumber: LIC } });
await lp.reload(); await lp.locator("[data-licence-form]").waitFor({ timeout: 20_000 });
await lp.locator("[data-licence-type]").selectOption("Lawyer (law society)");
const lawBodies = await lp.locator("[data-licence-body] option").allInnerTexts();
ok("PF-6 DW7 pass: a lawyer is offered the law societies only (marked Sample until read), not the College", !lawBodies.some((b) => b.startsWith("College")) && lawBodies.some((b) => b === "Law Society of Ontario (Sample)"), lawBodies);
await axe("PF-6 DW8 My account, Licence (1440)", lp); await shot(lp, "my-licence-1440");
await lp.reload(); await lp.locator("[data-licence-form]").waitFor({ timeout: 20_000 });
await lp.locator("body").click({ position: { x: 5, y: 600 } });
let kb = false;
for (let i = 0; i < 30 && !kb; i++) { await lp.keyboard.press("Tab"); kb = await lp.evaluate(() => document.activeElement?.hasAttribute("data-licence-type") ?? false); }
ok("PF-6 DW8 keyboard: Tab reaches the licence's type, body, number and Save, each named", kb && (await lp.getByLabel("Representative type").count()) === 1 && (await lp.getByLabel("Licensing body").count()) === 1 && (await lp.getByLabel("Licence number").count()) === 1);
await lp.goto(`${BASE}/platform/security`); await lp.locator("[data-security-refused]").waitFor({ timeout: 20_000 });
const secRefused = await staffCall(oTok, "GET", "/platform/settings/two-step");
ok("PF-6 DW7 fail: a Case Officer opening Security by URL sees the server's refusal (403); no Security or Licences in their menu", secRefused.status === 403 && (await lp.locator("[data-security-refused]").innerText()) === (await secRefused.json() as { detail: string }).detail && (await lp.locator('[data-account-section="/platform/security"], [data-account-section="/platform/licences"]').count()) === 0);
await rp.goto(`${BASE}/platform/security`); await rp.locator("[data-security-line]").waitFor({ timeout: 20_000 });
ok("PF-6 DW7 pass: the Owner's Security shows only the line \"Two-step sign-in is required for everyone.\", no switch", (await rp.locator("[data-security-line]").innerText()) === "Two-step sign-in is required for everyone." && (await rp.locator("main input, main [role=switch]").count()) === 0 && (await rp.locator('nav[aria-label="My account"] [data-account-section="/platform/security"]').count()) === 1);
await axe("PF-6 DW8 Security (1440)", rp); await shot(rp, "security-1440");

// DW6 (BR-8): everyone's licences for agent/firm-credential:manage; the number never in a toast, a log line or an email.
await lp.goto(`${BASE}/platform/licences`); await lp.locator("[data-licences-refused]").waitFor({ timeout: 20_000 });
ok("PF-6 DW6/BR-8 fail: a Case Officer opening Licences by URL sees the server's refusal and the API answers 403", seen.some((x) => x.page === lp && x.path === "/api/platform/licences" && x.status === 403) && (await lp.locator("[data-licence-row]").count()) === 0);
ok("PF-6 DW6/BR-8 fail: a Case Officer's crafted change of another's licence is refused (403)", (await staffCall(oTok, "PUT", `/platform/staff/${R.id}/credential`, { representativeType: "College member (CICC)", licensingBody: "College of Immigration and Citizenship Consultants", licenceNumber: "X1" })).status === 403);
await rp.goto(`${BASE}/platform/licences`); await rp.locator(`[data-licence-row="${O.id}"]`).waitFor({ timeout: 20_000 });
ok("PF-6 DW6/BR-8 pass: the Owner's Licences shows the Case Officer's record with the number in full", (await rp.locator(`[data-licence-row="${O.id}"] [data-licence-number-cell]`).innerText()) === LIC);
await rp.locator(`[data-licence-row="${O.id}"] [data-licence-change]`).click(); await rp.locator("[data-licence-form]").waitFor();
// Review MJ-1 / break M1: another tab saves first; this panel's save changes nothing and shows the newer record.
await staffCall(oTok, "PUT", "/platform/me/account", { licence: { representativeType: "College member (CICC)", licensingBody: "College of Immigration and Citizenship Consultants", licenceNumber: LIC_NEW } });
await rp.locator("[data-licence-number]").fill(LIC2); await rp.locator("[data-licence-save]").click(); await rp.locator("[data-licence-error]").waitFor({ timeout: 10_000 });
ok("PF-6 DW6 fail (conflict): the Owner's panel opened before the person's own save changes nothing and shows the newer number", (await rp.locator("[data-licence-error]").innerText()).startsWith("Someone else changed this licence") && sql(`select licence_number from platform_staff_credential where staff_id = '${O.id}'`) === LIC_NEW && (await rp.locator("[data-licence-number]").inputValue()) === LIC_NEW);
await rp.locator("[data-licence-number]").fill(LIC2); await rp.locator("[data-licence-save]").click();
for (let i = 0; i < 100 && !sql(`select licence_number from platform_staff_credential where staff_id = '${O.id}'`).includes(LIC2); i++) await rp.waitForTimeout(100);
const toastR = await rp.getByText(`The licence record for ${O.name} was saved.`).innerText({ timeout: 10_000 }).catch(() => "");
ok("PF-6 DW6/BR-8 pass: the Owner changes another's licence in the panel; the toast names the person, not the number", sql(`select licence_number from platform_staff_credential where staff_id = '${O.id}'`) === LIC2 && toastR.length > 0 && !toastR.includes(LIC2));
const aId = staffOf(`email = '${A}'`).id;
ok("PF-6 DW6 pass: a person with no record is listed with Add licence", (await rp.locator(`[data-no-licence="${aId}"] [data-licence-add]`).count()) === 1);
await rp.locator(`[data-no-licence="${aId}"] [data-licence-add]`).click(); await rp.locator("[data-licence-form]").waitFor();
await rp.locator("[data-licence-type]").selectOption("College member (CICC)"); await rp.locator("[data-licence-number]").fill(LIC_A); await rp.locator("[data-licence-save]").click();
await rp.locator(`[data-licence-row="${aId}"]`).waitFor({ timeout: 10_000 }); await rp.waitForTimeout(300);
ok("PF-6 DW8 keyboard (review MJ-2): after Add licence and Save, focus is on that person's new Change button, not the page", await rp.evaluate((id) => !!document.activeElement?.closest(`[data-licence-row="${id}"]`) && document.activeElement?.hasAttribute("data-licence-change"), aId));
await rp.locator(`[data-licence-row="${aId}"] [data-licence-change]`).click(); await rp.locator("[data-licence-number]").fill("typed, not saved");
let asked = false; rp.once("dialog", (d) => { asked = d.message() === "Discard the licence you typed?"; });
await rp.keyboard.press("Escape"); await rp.waitForTimeout(300);
ok("PF-6 DW6 fail (break m6): closing the panel with typed changes asks first", asked);
await axe("PF-6 DW8 Licences (1440)", rp); await shot(rp, "licences-1440");
for (const w of [375, 1024]) { const v = await newPage(w, await apiSignIn(R.email)); await v.goto(`${BASE}/platform/licences`); await v.locator(`[data-licence-row="${O.id}"]`).waitFor({ timeout: 20_000 }); await axe(`PF-6 DW8 Licences (${w} px)`, v); await noSideways(`PF-6 DW8 Licences (${w} px)`, v); await shot(v, `licences-${w}`); }
const leaks = [LIC, LIC2].map((n) => sql(`select (select count(*) from audit_event a where a::text like '%${n}%') + (select count(*) from module_event m where m::text like '%${n}%') + (select count(*) from msg_outbox o where o::text like '%${n}%')`));
const inUrl = seen.some((x) => x.path.includes(LIC) || x.path.includes(LIC2));
// The copy's own API log (tools/isolated.sh writes var/isolated-<name>/api.log); staff mail is held in the API's memory,
// which no saving path here reaches (a licence save sends no mail), so the stored rows and the log are what can be read.
const LOG = join(STUDIO, "var", `isolated-${DBNAME.replace(/^xr_studio_/, "")}`, "api.log");
const log = existsSync(LOG) ? readFileSync(LOG, "utf8") : null;
ok("PF-6 DW6/BR-8 fail: neither number is in an audit line, an event, an outbox row, the API log or any request's address", leaks.every((n) => n === "0") && !inUrl && log !== null && !log.includes(LIC) && !log.includes(LIC2), { leaks, inUrl, log: log === null ? `no log at ${LOG}` : "read" });
ok("PF-6: no page error in any browser", errors.length === 0, errors);
} finally {
  limit(Number(plan[1]));
  await browser.close(); await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
