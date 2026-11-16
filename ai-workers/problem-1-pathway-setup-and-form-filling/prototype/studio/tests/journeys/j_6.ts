// J-6 part 1 (map row 6, R1.6: own versus all; money and licence apart): the join-and-walk row (rows rev 16.11 (b),
// brief lead-b-briefs/J-rows.md J-6 with amendment A6 of P-626-order.md, A6 winning). It adds no feature: it walks
// PF-6b (on main) and FO-4's Leads screen (on main) on an isolated copy of the running app (its own database and port,
// never :4400), on screen and through the API.
//   A1..A4: PF-6b's checks, a pass and a fail per key class (GENERAL, MONEY, LICENCE), plus own versus all by the API;
//   W1..W5: the walk at 1440 px (an Owner sees every lead; a Case Officer with "own" sees only theirs; a wrong person by
//           URL is refused on screen and by the API; ends at row 5's first step, Invite staff, by the API: no screen yet).
// Swaps: none (step 0's grep: no fake in the Leads, identity or role-change path). "Fails on the fake": every judge below
// is also run on the answer a stand-in with no own-versus-all rule would give (the Owner's answer handed to everyone,
// or a 200 where a refusal belongs) and must say FAIL there; PF-6b's own check carries its fail halves (A4).
// "Own" here is the firm setting "everyone sees all" off (SA-6-24: view.all is seeded on all six starter roles, and the
// role editor that removes it from a copy is J-6 part 2, after PF-6 part 2). Sample rows only; US$0, no model call.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j6 4436 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j6 4436 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_6.ts j6 4436
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { platformAuditWorkspaceId } from "../../api/src/platform/audit/audit-event.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../../api/src/platform/settings.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j6", Number(process.argv[3] ?? 4436)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-6", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql } = client(PORT, DBNAME);
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
/** A judge on the real answer must pass and on the fake's answer must fail (P-606 (2): each case fails on the fake). */
const judged = (name: string, judge: (a: any) => boolean, real: any, fake: any) => {   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers are read loosely, as in the other checks
  ok(name, judge(real), real);
  ok(`${name} [fails on the fake]`, !judge(fake), fake);
};

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firmId = (key: string) => sql(`select id from platform_firm where key = '${key}'`);
const A = firmId("sample-firm"), B = firmId("sample-solo");
ok("J-6 setup: both Sample firms and their front office are seeded", !!A && !!B && fo.failed.length === 0, fo.failed);
await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:J-6-test", workspaceId: await platformAuditWorkspaceId(db), reason: "J-6: own versus all" });
const staff = (actor: string) => { const [id, email, name] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = '${actor}'`).split("|"); return { id, email, name }; };
const R = staff("user-R"), T = staff("user-T"), O = staff("user-O"), S = staff("user-S");   // Owner, Case Manager, Case Officer; S: firm B's Owner
// A second Case Officer, made for this run (the seed has none; the Sample plan's 5 seats leave one for W5's invitation).
const addStaff = (tag: string, role: string, name: string) => { const email = `j6-${tag}-${run}@sample-firm.example.com`;
  const id = sql(`insert into platform_staff (id, firm_id, email, display_name, actor_id, updated_at) values (gen_random_uuid(), '${A}', '${email}', '${name}', 'j6-${tag}-${run}', now()) returning id`).split("\n")[0];
  sql(`insert into platform_role_grant (id, firm_id, staff_id, role, granted_by) values (gen_random_uuid(), '${A}', '${id}', '${role}', 'seed:J-6-test')`); return { id, email, name }; };
const O2 = addStaff("co2", "CASE_OFFICER", `Sample Officer Two ${run}`);
async function signIn(firmKey: string, email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  const b = await r.json() as { token?: string; detail?: string }; if (b.token) return b.token;
  console.error(`STOP  local sign-in refused for ${email} (start the copy with PLATFORM_IDENTITY=local): ${b.detail}`); process.exit(2);
}
const tok = { R: await signIn("sample-firm", R.email), T: await signIn("sample-firm", T.email), O: await signIn("sample-firm", O.email), O2: await signIn("sample-firm", O2.email), S: await signIn("sample-solo", S.email) };
const api = async (t: string, method: string, path: string, body?: unknown) => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) as any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- read loosely
};
/** A lead added by `t`, owned by its adder (AG-2-4): each person owns one (the Owner's, both Case Officers', firm B's). */
async function ownLead(t: string, given: string, by: string) {
  const add = await api(t, "POST", "/front-office/leads", { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}@j6.example`, source: "Phone call (Sample)" });
  const id = add.body?.id ?? add.body?.lead?.id;
  const owner = sql(`select coalesce(owner_staff_id::text, '-') from fo_lead where id = '${id}'`);
  return { id: String(id), given, ok: add.status === 201 && owner === by, add: add.status, owner };
}
const L = { R: await ownLead(tok.R, `Rosa${run}`, R.id), O: await ownLead(tok.O, `Omar${run}`, O.id), O2: await ownLead(tok.O2, `Oona${run}`, O2.id), B: await ownLead(tok.S, `Bea${run}`, S.id) };
ok("J-6 setup: the Owner, both Case Officers and firm B's Owner each own one lead", Object.values(L).every((l) => l.ok), L);

// ------------------------------------------------------------------------------------- A: the API, per key class
const ids = (rows: any) => new Set<string>(Array.isArray(rows) ? rows.map((x: { id: string }) => x.id) : []);   // eslint-disable-line @typescript-eslint/no-explicit-any -- read loosely
const ownerAll = await api(tok.R, "GET", "/front-office/leads?view=all"), officerAll = await api(tok.O, "GET", "/front-office/leads?view=all");
judged("J-6 A1 GENERAL (own versus all) pass: the Owner's All open has every firm-A lead and not firm B's",
  (a) => a.status === 200 && [L.R, L.O, L.O2].every((l) => ids(a.body).has(l.id)) && !ids(a.body).has(L.B.id), ownerAll, { status: 200, body: [...ownerAll.body ?? [], { id: L.B.id }] });
judged("J-6 A1 GENERAL (own versus all) fail half: the Case Officer's All open has their own lead and nobody else's",
  (a) => a.status === 200 && ids(a.body).has(L.O.id) && ![L.R, L.O2, L.B].some((l) => ids(a.body).has(l.id)), officerAll, ownerAll);
const theirs = await api(tok.O, "GET", `/front-office/leads/${L.O2.id}`), mine = await api(tok.O, "GET", `/front-office/leads/${L.O.id}`);
judged("J-6 A1 GENERAL by URL: the Case Officer asking for the other Case Officer's lead gets 404, never the lead", (a) => a.status === 404 && !JSON.stringify(a.body).includes(L.O2.given), theirs, await api(tok.R, "GET", `/front-office/leads/${L.O2.id}`));
ok("J-6 A1 GENERAL by URL pass: the same Case Officer opens their own lead (200)", mine.status === 200, mine.status);
const crossFirm = await api(tok.R, "GET", `/front-office/leads/${L.B.id}`);
judged("J-6 A1 GENERAL by URL: firm A's Owner asking for firm B's lead gets 404", (a) => a.status === 404, crossFirm, await api(tok.S, "GET", `/front-office/leads/${L.B.id}`));
const assignee = { staffId: O.id, expectedOwnerStaffId: O.id };
const officerAssign = await api(tok.O, "POST", `/front-office/leads/${L.O.id}/assign`, assignee);
judged("J-6 A2 GENERAL key fail: a Case Officer (no agent/prospect:assign) assigning a lead by API gets 403 MISSING_PERMISSION",
  (a) => a.status === 403 && a.body?.code === "MISSING_PERMISSION", officerAssign, { status: 200 });
const ownerAssign = await api(tok.R, "POST", `/front-office/leads/${L.O2.id}/assign`, { ...assignee, expectedOwnerStaffId: O2.id });
ok("J-6 A2 GENERAL key pass: the Owner (holds agent/prospect:assign, sees all) assigns the other Case Officer's lead to the Case Officer (200)",
  ownerAssign.status === 200 && sql(`select owner_staff_id from fo_lead where id = '${L.O2.id}'`) === O.id, ownerAssign);
await api(tok.R, "POST", `/front-office/leads/${L.O2.id}/assign`, { staffId: O2.id, expectedOwnerStaffId: O.id });   // back to its owner for the walk
const moneyLine = () => sql(`select count(*) from audit_event where action = 'platform.staff.money_keys_granted' and entity_key = '${T.id}'`);
const officerRoles = await api(tok.O, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER", "BILLING_FINANCE"] });
judged("J-6 A3 MONEY fail: a Case Officer giving Billing/Finance by API gets 403 and no money line is written",
  (a) => a.status === 403 && moneyLine() === "0", officerRoles, { status: 200 });
const ownerRoles = await api(tok.R, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER", "BILLING_FINANCE"] });
ok("J-6 A3 MONEY pass: the Owner gives Billing/Finance and it writes its own money-keys audit line, beside the roles line",
  ownerRoles.status === 200 && moneyLine() === "1" && sql(`select count(*) from audit_event where action = 'platform.staff.roles_changed' and entity_key = '${T.id}'`) === "1", { ownerRoles, money: moneyLine() });
await api(tok.R, "PATCH", `/platform/staff/${T.id}/roles`, { roles: ["CASE_MANAGER"] });   // the Case Manager back as seeded
// A4: PF-6b's own check, whole (its scratch database; no server): MONEY DW3/DW4, LICENCE DW5 and the own/all sweep DW6,
// each with its pass and fail. The running app has no LICENCE route yet (no sign-off route is on main), so DW5's test
// route is where R1.6's licence line is proven; this step only re-runs it and reads its lines.
const pf6b = spawnSync("tsx", [join(STUDIO, "tests", "check_pf6b_permission_rules.ts")], { cwd: join(STUDIO, ".."), encoding: "utf8", timeout: 600_000 });
const lines = (pf6b.stdout ?? "").split("\n");
const has = (re: RegExp, verdict: "PASS" | "FAIL") => lines.some((l) => l.startsWith(verdict) && re.test(l));
for (const [cls, re] of [["MONEY", /PF-6b DW[34] /], ["LICENCE", /PF-6b DW5 /], ["own versus all", /PF-6b DW6 /]] as const) {
  const real = { passHalf: lines.some((l) => l.startsWith("PASS") && re.test(l) && / pass[: ]/.test(l)), failHalf: lines.some((l) => l.startsWith("PASS") && re.test(l) && / fail[: ]/.test(l)), anyFail: has(re, "FAIL") };
  judged(`J-6 A4 ${cls}: PF-6b's check passes both its pass half and its fail half`, (a) => a.passHalf && a.failHalf && !a.anyFail, real, { ...real, failHalf: false });
}
ok("J-6 A4: PF-6b's check exits 0", pf6b.status === 0, (pf6b.stdout ?? "").split("\n").filter((l) => l.startsWith("FAIL")).concat(pf6b.stderr?.slice(-400) ?? ""));

// ------------------------------------------------------------------------------------- W: the walk, at 1440 px
const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
async function pageAs(t: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  await ctx.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), t);
  p.on("pageerror", (e) => errors.push(String(e))); return p;
}
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const rowsOn = async (p: Page) => (await p.locator("tr[data-lead-row]").allInnerTexts()).join("\n");
const names = (text: string) => ({ R: text.includes(L.R.given), O: text.includes(L.O.given), O2: text.includes(L.O2.given), B: text.includes(L.B.given) });

// W1: the Owner signs in to Leads › All open and sees every lead of the firm, with its owner.
const owner = await pageAs(tok.R); await owner.goto(`${BASE}/front-office/leads?view=all`);
await owner.locator("tr[data-lead-row]", { hasText: L.O2.given }).first().waitFor({ timeout: 30_000 });
const ownerSees = names(await rowsOn(owner)); await shot(owner, "W1-owner-all-open-1440");
judged("J-6 W1: the Owner's All open lists the Owner's and both Case Officers' leads, not firm B's", (n) => n.R && n.O && n.O2 && !n.B, ownerSees, { ...ownerSees, B: true });
// W2: the Case Officer with "own" sees only their own (Mine and All open).
const officer = await pageAs(tok.O); await officer.goto(`${BASE}/front-office/leads?view=all`);
await officer.locator("tr[data-lead-row]", { hasText: L.O.given }).first().waitFor({ timeout: 30_000 }); await officer.waitForTimeout(500);
const officerSees = names(await rowsOn(officer)); await shot(officer, "W2-case-officer-all-open-1440");
judged("J-6 W2: the Case Officer's All open shows their own lead and no other person's (own versus all on screen)", (n) => n.O && !n.R && !n.O2 && !n.B, officerSees, ownerSees);
await officer.goto(`${BASE}/front-office/leads?view=mine`); await officer.locator("tr[data-lead-row]", { hasText: L.O.given }).first().waitFor({ timeout: 30_000 });
const officerMine = names(await rowsOn(officer)); await shot(officer, "W2-case-officer-mine-1440");
judged("J-6 W2: the Case Officer's Mine shows exactly their own lead", (n) => n.O && !n.R && !n.O2 && !n.B, officerMine, ownerSees);
// W3: the wrong person by URL: another Case Officer's lead and firm B's lead read "Lead not found", and show nothing of them.
for (const [who, lead] of [["the other Case Officer's", L.O2], ["firm B's", L.B], ["the Owner's", L.R]] as const) {
  await officer.goto(`${BASE}/front-office/leads/${lead.id}`); await officer.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
  const seen = { heading: await officer.getByRole("heading", { level: 1 }).innerText(), leak: (await officer.locator("main").innerText()).includes(lead.given) };
  judged(`J-6 W3: the Case Officer typing ${who} lead's address gets "Lead not found" on screen and nothing of it`, (a) => a.heading === "Lead not found" && !a.leak, seen, { heading: lead.given, leak: true });
}
await shot(officer, "W3-case-officer-wrong-lead-by-url-1440");
await officer.goto(`${BASE}/front-office/leads/${L.O.id}`); await officer.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
const ownPage = { heading: await officer.getByRole("heading", { level: 1 }).innerText(), assign: await officer.getByRole("button", { name: /^Assign/ }).count() };
ok("J-6 W3 pass: the Case Officer's own lead opens by its address, with no Assign button (the key they lack)", ownPage.heading !== "Lead not found" && ownPage.assign === 0, ownPage);
await shot(officer, "W3-case-officer-own-lead-1440");
// W4: the Owner opens the other Case Officer's lead by the same kind of address: allowed (all), so the refusal is the rule, not a broken page.
await owner.goto(`${BASE}/front-office/leads/${L.O2.id}`); await owner.getByRole("heading", { level: 1 }).waitFor({ timeout: 20_000 });
const ownerOpens = { heading: await owner.getByRole("heading", { level: 1 }).innerText() };
judged("J-6 W4: the Owner opens the other Case Officer's lead by its address (all), where the Case Officer was refused", (a) => a.heading !== "Lead not found" && a.heading.length > 0, ownerOpens, { heading: "Lead not found" });
await shot(owner, "W4-owner-opens-officer-lead-1440");
// W5: ends at row 5's first step, Invite staff. Its screen is PF-6 part 2 (not on main), so the step is taken by the API:
// the Owner's invitation is accepted, a Case Officer's is refused.
const coInvite = await api(tok.O, "POST", "/platform/staff/invitations", { email: `j6-invitee-co-${run}@sample-firm.example.com`, roles: ["CASE_OFFICER"] });
judged("J-6 W5 fail: a Case Officer inviting staff by API gets 403 (agent/staff:manage)", (a) => a.status === 403, coInvite, { status: 201 });
const ownerInvite = await api(tok.R, "POST", "/platform/staff/invitations", { email: `j6-invitee-${run}@sample-firm.example.com`, roles: ["CASE_OFFICER"] });
ok("J-6 W5 pass: the Owner invites a Case Officer (row 5's first step): the invitation is pending", (ownerInvite.status === 201 || ownerInvite.status === 200) && ownerInvite.body?.status === "PENDING", ownerInvite);
ok("J-6: no page error in the browser", errors.length === 0, errors);
await browser.close();
await db.$disconnect();
process.exit(summary() ? 1 : 0);
