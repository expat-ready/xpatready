// J-6 part 1 (map row 6, R1.6: own versus all; money and licence apart): the join-and-walk row (rows rev 16.11 (b),
// brief lead-b-briefs/J-rows.md J-6 with amendment A6 of P-626-order.md, A6 winning). It adds no feature: it walks
// PF-6b (on main) and FO-4's Leads screen (on main) on an isolated copy of the running app (its own database and port,
// never :4400), on screen and through the API. Names carry "P1-" so part 2 (the role editor) keeps the brief's W1..W5.
// Part 2 (rows rev 16.54; PF-6 part 2a/2b on screen): J-6 DW1 (PF-6m's money line read back from the audit), DW2
// (FO-2v's rule on Leads: the Owner with "everyone sees all" off sees only their own) and walk W1 (Team → Compare roles
// → invite Billing and finance with its money line → accept → refused Team → a Case Officer with "own" → My account).
//   P1-A1..A4: own versus all by the API, and PF-6b's checks with a pass and a fail per key class (GENERAL, MONEY, LICENCE);
//   P1-W1..W5: the walk at 1440 px (an Owner sees every lead; a Case Officer with "own" sees only theirs; a wrong person
//              or a wrong role by URL is refused on screen and by the API; ends at row 5's first step, Invite staff).
// "Own" is walked both ways the product has (review M1):
//   ROLE: "everyone sees all" on, and the Case Officer role without agent/prospect:view.all (SA-6-24: a firm makes a role
//         own-only by removing view.all from a copy; the role editor is part 2, so the copy is stood in by SQL on the
//         copy's starter rows, as PF-6b DW6 does, and put back at the end);
//   SETTING: "everyone sees all" off, view.all kept: the Case Officer sees their own and Unassigned leads (AG-2-13c rule 6),
//         never another person's (break F1).
// Fails on the fake (P-606): no fake is in this path (step 0's grep), so the stand-in replaced is "no own rule": the same
// copy with the setting on and view.all kept. Every own-versus-all judge is run there too and must fail (P1-NR lines).
// Sample rows only; US$0, no model call. Repeatable on a kept copy (counts are read before and after).
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j6 4436 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j6 4436 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_6.ts j6 4436
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../../api/src/platform/settings.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j6", Number(process.argv[3] ?? 4436)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-6", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql } = client(PORT, DBNAME);
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firmId = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
const A = firmId("sample-firm"), B = firmId("sample-solo");
ok("J-6 setup: both Sample firms and their front office are seeded", !!A && !!B && fo.failed.length === 0, fo.failed);
const ws = await platformAuditWorkspaceId(db);
const seesAll = (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "seed:J-6-test", workspaceId: ws, reason: "J-6: own versus all" });
const VIEW_ALL = "agent/prospect:view.all";
const officerViewAll = (on: boolean) => sql(on
  ? `insert into platform_role_permission (role, permission_key) select 'CASE_OFFICER', '${VIEW_ALL}' where not exists (select 1 from platform_role_permission where role = 'CASE_OFFICER' and permission_key = '${VIEW_ALL}')`
  : `delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key = '${VIEW_ALL}'`);
const staff = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
const R = staff("user-R"), T = staff("user-T"), O = staff("user-O"), S = staff("user-S");   // Owner, Case Manager, Case Officer; S: firm B's Owner
// A second Case Officer, made once per copy (the seed has none; the Sample plan's 5 seats leave one for W5's invitation).
const O2email = "j6-officer-two@sample-firm.example.com";
if (!sql(`select id from platform_staff where email = '${O2email}'`)) {
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${O2email}', 'Sample Officer Two', 'j6-officer-two', now()) returning id`).split("\n")[0];
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', 'CASE_OFFICER', 'seed:J-6-test')`);
}
const O2 = staff("j6-officer-two");
async function signIn(firmKey: string, email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn("sample-firm", R.email), T: await signIn("sample-firm", T.email), O: "", O2: await signIn("sample-firm", O2.email), S: await signIn("sample-solo", S.email) };
const api = async (t: string, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};

// The browser; the Case Officer signs in through the sign-in card (review m6) and the walk then uses that session.
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(t: string | null): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  if (t) await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const officer = await pageAs(null);
await officer.goto(`${BASE}/front-office/leads`); await officer.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 30_000 });
await officer.getByLabel("Firm key").fill("sample-firm"); await officer.getByLabel("Work email").fill(O.email); await officer.keyboard.press("Enter");
await officer.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 20_000 });
tok.O = await officer.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
ok("J-6 P1-W2 setup: the Case Officer signs in through the sign-in card (keyboard Enter) and lands on Leads", !!tok.O);

/** A lead added by `t`, owned by its adder (AG-2-4). */
async function ownLead(t: string, given: string, by: string) {
  const add = await api(t, "POST", "/front-office/leads", { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}@j6.example`, source: "Phone call (Sample)" });
  const id = String(add.body?.id ?? add.body?.lead?.id);
  return { id, given, ok: add.status === 201 && sql(`select coalesce(owner_staff_id::text, '-') from fo_lead where id = '${id}'`) === by, add: add.status };
}
const L = { R: await ownLead(tok.R, `Rosa${run}`, R.id), O: await ownLead(tok.O, `Omar${run}`, O.id), O2: await ownLead(tok.O2, `Oona${run}`, O2.id), B: await ownLead(tok.S, `Bea${run}`, S.id) };
// One lead nobody owns (a web-form arrival's state, made by SQL: Sample).
const U = await ownLead(tok.R, `Una${run}`, R.id); sql(`update fo_lead set owner_staff_id = null where id = '${U.id}'`);
ok("J-6 setup: the Owner, both Case Officers and firm B's Owner each own one lead; one lead is unassigned", Object.values(L).every((l) => l.ok) && U.ok, { L, U });

// ------------------------------------------------------------------- own versus all: the judges, run in three worlds
const ids = (a: Ans) => new Set<string>(Array.isArray(a.body) ? a.body.map((x: { id: string }) => x.id) : []);
const owners = (a: Ans) => (Array.isArray(a.body) ? a.body.map((x: { ownerStaffId: string | null }) => x.ownerStaffId) : ["not a list"]);
const rowsOn = async (p: Page) => (await p.locator("tr[data-lead-row]").allInnerTexts()).join("\n");
const names = (text: string) => ({ R: text.includes(L.R.given), O: text.includes(L.O.given), O2: text.includes(L.O2.given), B: text.includes(L.B.given), U: text.includes(U.given) });
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const leadsOn = async (p: Page, view: string, waitFor: string) => { await p.goto(`${BASE}/front-office/leads?view=${view}`); await p.locator("tr[data-lead-row]", { hasText: waitFor }).first().waitFor({ timeout: 30_000 }); await p.waitForTimeout(400); return names(await rowsOn(p)); };
const headingAt = async (p: Page, id: string) => { await p.goto(`${BASE}/front-office/leads/${id}`); const h = p.getByRole("heading", { level: 1 }); await h.waitFor({ timeout: 20_000 }); return { heading: (await h.innerText()).trim(), text: await p.locator("main").innerText() }; };
const owner = await pageAs(tok.R);
/** Every own-versus-all judge: each returns [name, verdict, evidence]. `world` names the set-up. */
async function ownVersusAll(world: "ROLE" | "SETTING" | "NO RULE", shoot: boolean) {
  const out: [string, boolean, unknown][] = [];
  const officerAll = await api(tok.O, "GET", "/front-office/leads?view=all");
  const unassignedSeen = world !== "ROLE";   // AG-2-13c rule 6: Unassigned with view.all or assign
  out.push(["P1-A1 API: the Case Officer's All open has their own lead and no other person's lead",
    officerAll.status === 200 && ids(officerAll).has(L.O.id) && owners(officerAll).every((o: string | null) => o === O.id || o === null) && ids(officerAll).has(U.id) === unassignedSeen, owners(officerAll)]);
  for (const [who, l] of [["the other Case Officer's", L.O2], ["the Owner's", L.R], ["firm B's", L.B]] as const) {
    const a = await api(tok.O, "GET", `/front-office/leads/${l.id}`);
    out.push([`P1-A1 API by URL: the Case Officer asking for ${who} lead gets 404 and nothing of it`, a.status === 404 && !JSON.stringify(a.body).includes(l.given), a.status]);
  }
  const unassignedApi = await api(tok.O, "GET", "/front-office/leads?view=unassigned");
  if (world === "ROLE") out.push(["P1-A1 API, wrong role by URL: the Case Officer (no view.all, no assign) asking for Unassigned leads gets 403", unassignedApi.status === 403, unassignedApi]);
  const all = await leadsOn(officer, "all", L.O.given); if (shoot) await shot(officer, `P1-W2-${world.toLowerCase()}-case-officer-all-open-1440`);
  out.push(["P1-W2 screen: the Case Officer's All open shows their own lead and no other person's", all.O && !all.R && !all.O2 && !all.B && all.U === unassignedSeen, all]);
  for (const [who, l] of [["the other Case Officer's", L.O2], ["the Owner's", L.R], ["firm B's", L.B]] as const) {
    const h = await headingAt(officer, l.id);
    out.push([`P1-W3 screen by URL: the Case Officer typing ${who} lead's address gets "Lead not found" and nothing of it`, h.heading === "Lead not found" && !h.text.includes(l.given), h.heading]);
  }
  if (shoot) await shot(officer, `P1-W3-${world.toLowerCase()}-wrong-lead-by-url-1440`);
  if (world === "ROLE") {
    await officer.goto(`${BASE}/front-office/leads?view=unassigned`); await officer.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 20_000 }); await officer.waitForTimeout(400);
    const chip = { unassignedChip: await officer.locator('[data-chip="unassigned"]').count(), pressed: await officer.locator('[data-chip][aria-pressed="true"]').getAttribute("data-chip"), rows: names(await rowsOn(officer)) };
    out.push(["P1-W3 screen, wrong role by URL: the Case Officer typing ?view=unassigned gets no Unassigned chip, lands on Mine and sees no unassigned lead", chip.unassignedChip === 0 && chip.pressed === "mine" && !chip.rows.U, chip]);
    if (shoot) await shot(officer, "P1-W3-role-unassigned-by-url-1440");
  }
  return out;
}
const report = (world: string, rs: [string, boolean, unknown][]) => { for (const [n, v, e] of rs) ok(`J-6 ${n} [own by ${world}]`, v, e); };

// W1: the Owner sees every lead of the firm (view.all with "everyone sees all" on: AG-2-64, FO-2v), never firm B's.
await seesAll(true); officerViewAll(false);   // ROLE world first
const ownerSees = await leadsOn(owner, "all", L.O2.given); await shot(owner, "P1-W1-owner-all-open-1440");
ok("J-6 P1-W1: the Owner's All open lists the Owner's, both Case Officers' and the unassigned lead, not firm B's", ownerSees.R && ownerSees.O && ownerSees.O2 && ownerSees.U && !ownerSees.B, ownerSees);
const ownerAll = await api(tok.R, "GET", "/front-office/leads?view=all");
ok("J-6 P1-A1 API: the Owner's All open has every firm-A lead and not firm B's", ownerAll.status === 200 && [L.R, L.O, L.O2, U].every((l) => ids(ownerAll).has(l.id)) && !ids(ownerAll).has(L.B.id), ownerAll.status);
const ownerOpens = await headingAt(owner, L.O2.id); await shot(owner, "P1-W4-owner-opens-officer-lead-1440");
ok("J-6 P1-W4: the Owner opens the other Case Officer's lead by its address (the lead's own page)", ownerOpens.heading === `${L.O2.given} Sample`, ownerOpens.heading);
const crossFirm = await api(tok.R, "GET", `/front-office/leads/${L.B.id}`);
ok("J-6 P1-A1 API by URL: firm A's Owner asking for firm B's lead gets 404", crossFirm.status === 404, crossFirm.status);
const axeOf = async (p: Page, name: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`J-6 ${name}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => v.id)); };
// Own by role, then own by setting, then the stand-in with no own rule (every judge must fail there).
const roleWorld = await ownVersusAll("ROLE", true); report("role", roleWorld);
const own = await headingAt(officer, L.O.id); await shot(officer, "P1-W3-case-officer-own-lead-1440");
ok("J-6 P1-W3: the Case Officer's own lead opens by its address (the lead's own page), with no Assign button (the key they lack)", own.heading === `${L.O.given} Sample` && (await officer.getByRole("button", { name: /^Assign/ }).count()) === 0, own.heading);
await headingAt(officer, L.O2.id); await axeOf(officer, "P1-W3 \"Lead not found\"");
await leadsOn(officer, "all", L.O.given); await axeOf(officer, "P1-W2 Leads (Case Officer)");
for (const w of [1024, 400]) { await officer.setViewportSize({ width: w, height: 800 }); ok(`J-6 P1-W2 Leads at ${w} px: no sideways page scroll`, await officer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); }
await officer.setViewportSize({ width: 1440, height: 900 });
officerViewAll(true); await seesAll(false);
report("setting", await ownVersusAll("SETTING", true));
await seesAll(true);   // no own rule: setting on, view.all kept
const noRule = await ownVersusAll("NO RULE", false);
// Firm B's lead stays 404 with no own rule too (firms apart is not own versus all), so only the in-firm judges must fail.
for (const [n, v, e] of noRule.filter(([n]) => !n.includes("firm B"))) ok(`J-6 P1-NR ${n} [fails with no own rule]`, !v, e);
ok("J-6 P1-NR: with no own rule, firms stay apart (firm B's lead is still 404 and \"Lead not found\")", noRule.filter(([n]) => n.includes("firm B")).every(([, v]) => v));
// The setting stays on for the Owner's assign below: the Owner sees another person's lead only with view.all and
// "everyone sees all" on (FO-2v, QA-477: no Owner override).

// ------------------------------------------------------------------------------------ P1-A2..A4: the key classes
const assign = await api(tok.O, "POST", `/front-office/leads/${L.O.id}/assign`, { staffId: O.id, expectedOwnerStaffId: O.id });
ok("J-6 P1-A2 GENERAL key fail: a Case Officer (no agent/prospect:assign) assigning a lead by API gets 403 MISSING_PERMISSION", assign.status === 403 && assign.body?.code === "MISSING_PERMISSION", assign);
const ownerAssign = await api(tok.R, "POST", `/front-office/leads/${L.O2.id}/assign`, { staffId: O.id, expectedOwnerStaffId: O2.id });
ok("J-6 P1-A2 GENERAL key pass: the Owner (holds agent/prospect:assign) assigns the other Case Officer's lead to the Case Officer (200)", ownerAssign.status === 200 && sql(`select owner_staff_id from fo_lead where id = '${L.O2.id}'`) === O.id, ownerAssign);
await seesAll(false);
const count = (action: string) => Number(sql(`select count(*) from audit_event where action = '${action}' and entity_key = '${T.id}'`));
const MONEY = "platform.staff.money_keys_granted", ROLES = "platform.staff.roles_changed";
const before = { money: count(MONEY), roles: count(ROLES) };
const officerRoles = await api(tok.O, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER", "BILLING_FINANCE"] });
ok("J-6 P1-A3 GENERAL key fail: a Case Officer (no agent/role:assign) giving any role, here Billing/Finance, gets 403 and nothing is written", officerRoles.status === 403 && count(MONEY) === before.money && count(ROLES) === before.roles, officerRoles.status);
const noMoney = await api(tok.R, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER", "READ_ONLY"] });
ok("J-6 P1-A3 MONEY fail: the Owner giving Read-only (no money key) writes the roles line and no money-keys line", noMoney.status === 200 && count(ROLES) === before.roles + 1 && count(MONEY) === before.money, { noMoney: noMoney.status, money: count(MONEY) - before.money });
await api(tok.R, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER"] });
const bf = await api(tok.R, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER", "BILLING_FINANCE"] });
const line = sql(`select detail::text from audit_event where action = '${MONEY}' and entity_key = '${T.id}' order by at desc limit 1`);
ok("J-6 P1-A3 MONEY pass: the Owner gives Billing/Finance and it writes its own money-keys audit line (Billing/Finance only, its money keys), beside the roles line",
  bf.status === 200 && count(MONEY) === before.money + 1 && count(ROLES) === before.roles + 3 && JSON.parse(line || "{}").roles?.join() === "BILLING_FINANCE" && (JSON.parse(line || "{}").moneyKeys ?? []).length > 0, { bf: bf.status, line });
await api(tok.R, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER"] });   // the Case Manager back as seeded
// P1-W5: ends at row 5's first step, Invite staff. Its screen is PF-6 part 2 (not on main), so the step is taken by the API.
const coInvite = await api(tok.O, "POST", "/platform/staff/invitations", { email: `j6-invitee-co-${run}@sample-firm.example.com`, roles: ["CASE_OFFICER"] });
ok("J-6 P1-W5 fail: a Case Officer inviting staff by API gets 403 (agent/staff:manage)", coInvite.status === 403, coInvite.status);
const invite = await api(tok.R, "POST", "/platform/staff/invitations", { email: `j6-invitee-${run}@sample-firm.example.com`, roles: ["CASE_OFFICER"] });
ok("J-6 P1-W5 pass: the Owner invites a Case Officer (row 5's first step): the invitation is pending", invite.status === 201 && invite.body?.status === "PENDING", invite);
if (invite.body?.id) await api(tok.R, "POST", `/platform/staff/invitations/${invite.body.id}/revoke`, {});   // frees the seat: repeatable

// ------------------------------------------------------------------ part 2 (rows rev 16.54): DW1, DW2 and walk W1
// Now that PF-6 part 2a (Team, Invite people, Compare roles) and part 2b (Accept invitation) are on screen, the walk
// takes row 6's role steps by screens, with the money line read back from the audit and FO-2v's rule on Leads.
const plan = sql(`select p.id || '|' || p.seats_limit from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = '${A}' and s.status <> 'ENDED' limit 1`).split("|");
sql(`update platform_plan set seats_limit = ${Number(plan[1]) + 10} where id = '${plan[0]}'`);   // lent for the walk (the screenshots show the lent figure), given back in the finally
const leavers: string[] = [];
try {
const moneyFor = (staffId: string) => sql(`select coalesce(json_agg(json_build_object('actor', actor, 'detail', detail))::text, '[]') from audit_event where action = '${MONEY}' and entity_key = '${staffId}'`);
/** Gives the invitation a token the walk knows (the mail is held in memory; the token has the server's shape, 43 base64url). */
const knownLink = (invitationId: string) => { const known = randomBytes(32).toString("base64url"); sql(`update platform_invitation set token_hash = '${createHash("sha256").update(known).digest("hex")}' where id = '${invitationId}'`); return `${BASE}/invitation#t=${known}`; };
// W1 step 1: the Owner opens Team, then Compare roles: money permissions and licence actions in their own groups.
await owner.goto(`${BASE}/platform/team`); await owner.locator("[data-seat-line]").waitFor({ timeout: 30_000 });
await owner.locator("[data-invite-open]").click(); await owner.locator("[data-compare-roles]").click(); await owner.locator("[data-compare]").waitFor({ timeout: 10_000 });
// Each role's two group counts equal PF-6r's class counts (review m1): Billing and finance 12 money; Case Manager 3 licence.
const rolesApi = (await api(tok.R, "GET", "/platform/roles")).body?.roles as { role: string; moneyKeys: number; licenceKeys: number }[] ?? [];
const groupCount = async (role: string, cls: string) => Number(/: (\d+)$/.exec(await owner.locator(`[data-compare-role="${role}"] [data-key-group="${cls}"] summary`).innerText())?.[1] ?? -1);
const groups: Record<string, [number, number, number, number]> = {};
for (const r of rolesApi) groups[r.role] = [await groupCount(r.role, "MONEY"), r.moneyKeys, await groupCount(r.role, "LICENCE"), r.licenceKeys];
await shot(owner, "P2-W1-compare-roles-1440");
ok("J-6 W1 step 1: the Owner's Team → Invite people → Compare roles shows each role's money permissions and licence actions in their own groups, counted as PF-6r's classes (Billing and finance 12 money; Case Manager 3 licence)",
  rolesApi.length === 6 && Object.values(groups).every(([m, mApi, l, lApi]) => m === mApi && l === lApi) && groups.BILLING_FINANCE?.[0] === 12 && groups.CASE_MANAGER?.[2] === 3, groups);
await owner.keyboard.press("Escape"); await owner.waitForTimeout(300);
// W1 step 2: the Owner invites a Billing and finance person; the money line shows before Send.
const BF = `j6-billing-${run}@sample-firm.example.com`;
await owner.getByLabel("Email, person 1").fill(BF);
const row1 = owner.locator('[data-invite-row="1"]');
if (await row1.locator('[data-role="CASE_OFFICER"]').isChecked()) await row1.locator('[data-role="CASE_OFFICER"]').uncheck();
await row1.locator('[data-role="BILLING_FINANCE"]').check();
const moneyShown = await row1.locator("[data-money-line]").innerText().catch(() => "");
await row1.locator("[data-money-line]").scrollIntoViewIfNeeded().catch(() => undefined);   // for the screenshot only; the line's words are checked just above
await shot(owner, "P2-W1-invite-billing-money-line-1440");
ok("J-6 W1 step 2: inviting Billing and finance shows its own money line naming the count before Send", moneyShown === `This gives ${BF} 12 money permissions.`, moneyShown);
await owner.locator("[data-send-invites]").click();
let invBF = ""; for (let i = 0; i < 100 && !invBF; i++) { invBF = sql(`select coalesce((select id::text from platform_invitation where email = '${BF}'), '')`); if (!invBF) await owner.waitForTimeout(100); }
ok("J-6 W1 step 2: Send makes one invitation, Billing and finance only", !!invBF && sql(`select roles::text from platform_invitation where id = '${invBF}'`) === "{BILLING_FINANCE}");
// The new person accepts on the Accept invitation page (PF-6 part 2b) and is signed in.
const bfPage = await pageAs(null); await bfPage.goto(knownLink(invBF));
await bfPage.locator("[data-accept-continue]").click(); await bfPage.locator("[data-account]", { hasText: BF }).waitFor({ timeout: 30_000 });
const BFs = { id: sql(`select coalesce((select id::text from platform_staff where email = '${BF}'), '')`).split("\n")[0] };
if (BFs.id) leavers.push(BFs.id);
ok("J-6 W1 step 3: the invitee accepts on the Accept invitation page and is signed in (My account shows them)", !!BFs.id && (await bfPage.locator("[data-staff-name]").count()) === 1);
// DW1: PF-6m's money line is real, read back from the audit: one line, by the inviter, Billing and finance's 12 keys.
const bfLines = JSON.parse(moneyFor(BFs.id)) as { actor: string; detail: { roles?: string[]; moneyKeys?: string[] } }[];
ok("J-6 DW1 pass: the accepted invitation wrote PF-6m's money-keys line, read back from the audit: by the Owner, Billing and finance, 12 money keys", bfLines.length === 1 && bfLines[0].actor === `staff:${R.id}` && bfLines[0].detail.roles?.join() === "BILLING_FINANCE" && (bfLines[0].detail.moneyKeys ?? []).length === 12, bfLines);
const RO = `j6-readonly-${run}@sample-firm.example.com`, invRO = await api(tok.R, "POST", "/platform/staff/invitations", { email: RO, roles: ["READ_ONLY"] });
const roAcc = await fetch(knownLink(String(invRO.body?.id)).replace("/invitation#t=", "/api/public/invitations/") + "/accept", { method: "POST" });
const ROid = sql(`select coalesce((select id::text from platform_staff where email = '${RO}'), '')`);
if (ROid) leavers.push(ROid);
ok("J-6 DW1 fail: an accepted Read only invitation (no money key) writes no money-keys line", roAcc.status === 200 && !!ROid && JSON.parse(moneyFor(ROid)).length === 0, roAcc.status);
// W1 step 4: the new person opens /platform/team: refused on screen and by the API.
const bfTok = await bfPage.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
await bfPage.goto(`${BASE}/platform/team`); await bfPage.locator("[data-team-refused]").waitFor({ timeout: 20_000 });
const bfTeam = await api(bfTok, "GET", "/platform/staff");
await shot(bfPage, "P2-W1-billing-team-refused-1440");
ok("J-6 W1 step 4: the Billing and finance person opening /platform/team sees the server's refusal, and the API answers 403", bfTeam.status === 403 && (await bfPage.locator("[data-team-refused]").innerText()) === bfTeam.body?.detail && (await bfPage.locator('[data-account-section="/platform/team"]').count()) === 0, bfTeam.status);
// DW2 (FO-2v's single rule on Leads): with "everyone sees all" off the Owner sees only their own leads; on, every lead.
await seesAll(false);
const ownerOff = await leadsOn(owner, "all", L.R.given); await shot(owner, "P2-DW2-owner-setting-off-1440");
ok("J-6 DW2 pass: with \"everyone sees all\" off, the Owner's All open on Leads shows the Owner's lead and no Case Officer's", ownerOff.R && !ownerOff.O && !ownerOff.B, ownerOff);
await seesAll(true);
const ownerOn = await leadsOn(owner, "all", L.O.given);
ok("J-6 DW2 fail: with it on, the same screen shows the Case Officer's lead too (the rule, not a fixed list)", ownerOn.R && ownerOn.O && !ownerOn.B, ownerOn);
// W1 step 5: a Case Officer with "own" (the role without view.all) sees only their own leads.
officerViewAll(false);
const officerOwn = await leadsOn(officer, "all", L.O.given); await shot(officer, "P2-W1-case-officer-own-1440");
ok("J-6 W1 step 5: a Case Officer with \"own\" sees only their own leads (not the Owner's, not firm B's)", officerOwn.O && !officerOwn.R && !officerOwn.B && !officerOwn.U, officerOwn);
officerViewAll(true);
// W1 step 6: ends at the next capability's first step, My account (row 5).
await bfPage.locator('nav[aria-label="My account"] [data-account-section="/account"]').click(); await bfPage.locator("[data-account]", { hasText: BF }).waitFor({ timeout: 20_000 });
ok("J-6 W1 step 6: the walk ends on My account (row 5's first step) for the new person", await bfPage.getByRole("heading", { name: "Profile" }).isVisible());
await axeOf(bfPage, "W1 My account (Billing and finance)");
} finally {
  // Repeatable (review m2): the new people leave (seats freed) and the lent seats go back, whatever failed above.
  const left = await Promise.all(leavers.map((id) => api(tok.R, "POST", `/platform/staff/${id}/deactivate`, { reason: "J-6 walk done (Sample)" })));
  sql(`update platform_plan set seats_limit = ${Number(plan[1])} where id = '${plan[0]}'`);
  ok("J-6 part 2 clean-up: the walk's new people are deactivated and the lent seats are given back", left.every((a) => a.status === 200) && sql(`select seats_limit from platform_plan where id = '${plan[0]}'`) === plan[1], left.map((a) => a.status));
}
ok("J-6: no page error in the browser", errors.length === 0, errors);
await browser.close();   // before PF-6b's check: the copy, the browser and the check's own database together are too much for one small machine
// P1-A4: PF-6b's own check, whole (its scratch database; no server), each Done-when line needing both its halves. The
// running app has no LICENCE route yet (no sign-off route is on main), so DW5's test route is where the licence line is proven.
const pf6b = spawnSync("tsx", [join(STUDIO, "tests", "check_pf6b_permission_rules.ts")], { cwd: join(STUDIO, ".."), encoding: "utf8", timeout: 600_000 });
const lines = (pf6b.stdout ?? "").split("\n");
for (const [cls, dw] of [["MONEY (no bundle hands out a money key)", "DW3"], ["MONEY (its own audit line)", "DW4"], ["LICENCE (403 \"Only a licensed consultant can do this\" without the licence record)", "DW5"], ["own versus all (the @OwnOrAll sweep)", "DW6"]] as const) {
  const mine = lines.filter((l) => l.includes(`PF-6b ${dw} `));
  ok(`J-6 P1-A4 ${cls}: PF-6b ${dw} passes its pass half and its fail half, and nothing fails`,
    mine.some((l) => l.startsWith("PASS") && l.includes(`${dw} pass`)) && mine.some((l) => l.startsWith("PASS") && l.includes(`${dw} fail`)) && !mine.some((l) => l.startsWith("FAIL")), mine.map((l) => l.slice(0, 90)));
}
ok("J-6 P1-A4: PF-6b's check exits 0", pf6b.status === 0, lines.filter((l) => l.startsWith("FAIL")));

await db.$disconnect();
process.exit(summary() ? 1 : 0);
