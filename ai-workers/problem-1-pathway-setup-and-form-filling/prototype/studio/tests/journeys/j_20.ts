// J-20 (map row 20, R1.20: one entitlement check; seat and plan limits; downgrade check; invite many): the join-and-walk
// for the item's last part, the Invite people form on PF-4c part 1b's batch route (P-727), on an isolated copy of the
// running app (its own database and port, never :4400), at 1440 px. No j_20 was on main; written from CAPABILITIES
// R1.20's Done when: "an invite past the seat limit refused naming the limit; ... a 1-50 row invite accepts the good rows
// and names each bad row's reason".
//   W1 (screens): the Owner signs in on the card → Team → Invite people → five rows: A (named, Case Officer), B (no name,
//       Read only), C (an email already on the staff), D (an email already invited), E (A's email again, in capitals: named
//       on its row before Send) → Send (QA-773: a duplicate never stops Send): "2 invitations sent.", A and B leave the
//       form, C, D and E stay, each with its own words on its own row, and the form says 3 were not invited.
//   W2 (underneath): one batch call for the whole form (five rows, the duplicate too; no second invitation for A); A and B each one pending invitation with the roles chosen; A's
//       name stored as the invitation's display name, B none; one audit line each (batch); no invitation for C; D still
//       has exactly one.
//   W3 (fix and send again): C's email corrected, D removed → Send → invited, the panel closes.
//   W4 (the seat limit, the server's row flag): two seats left, two rows typed (the form fits: "n of n seats after these
//       invites"); someone else takes a seat before Send → the first row is invited, the second stays with the server's
//       words naming the plan and its seat count; nothing past the limit is stored.
//       Then (QA-774) a lower Sample plan booked for the renewal: Team's seat line, the form's free seats and the gate's row
//       words all say the booked plan's limit and name that plan; withdrawn, the plan's own limit again.
//   W5 (the seat limit, P-727 over PF-6 BR-2, Lead 19 on #3370): 2 seats free, 3 valid rows and a staff member's row →
//       the form says "2 free seats" beforehand and Send stays on → 2 invited; the staff row (flagged for itself, using no
//       seat) and the third valid row (OVER_SEAT_LIMIT) stay, each with its words; a seat is added and the row is sent.
//   W6: A opens the link from the email (the demo inbox) → Accept → signed in; A's staff record carries the name typed on
//       the form. The walk ends at the next step (R1.5/R1.6): Team lists A as active.
//   W7: at 50 rows the form offers no 51st (break m2). W1 also checks focus lands on the first flagged row (break m5); W3
//       that the form is locked while the batch is in flight (break M1).
//   DW1 (API): a single invite past the seat limit is refused 409 naming the limit, nothing stored.
// qa's acceptance steps (qa 7, 24 Nov; from qa's draft 0a9b3ed54, merged here so R1.20 has one j_20 (#3430 item 3)):
//   W8 the API's 1-50 rows: the single invite past the limit 409 PLAN_LIMIT_REACHED (metric, limit, used) and the batch
//      row OVER_SEAT_LIMIT; a batch with a duplicate flags DUPLICATE_IN_FORM and INVALID_EMAIL per row and accepts the
//      good rows; 50 rows filled on the screen go in one batch and all 50 are invited; the API refuses 51 (422 ROWS_COUNT).
//   W9 "a downgrade that breaks a limit refused listing what to remove": Plan and billing by screen (no change of plan
//      on our own screens yet: R1.91 / PF-16's screen; a NOTE); the change-plan route on a local copy answers 409
//      NO_BILLING_ACCOUNT before its downgrade check (QA-775, Gap · Minor, open: a NOTE, not a judge); judged through
//      PlanBookings.book, the check that route calls: refused 409 DOWNGRADE_CONFLICTS listing used, limit and the amount to
//      remove in SA-4-56's words, nothing booked; a lower plan that breaks nothing is booked with its audit line.
//   W10 "every gated action asks one check": in the code the seat gate (single and batch), the case gate and the storage
//      gate each call EntitlementPort.check on PgEntitlements and read no limit column themselves, and Team's seat line
//      reads the gate's own reader (seatLimitOf); in the running app the one booked lower plan (W9) is read at once by the
//      invite gate and the case gate, and Team's seat line says that limit; withdrawn, both gates allow again.
//   W11 the wrong roles and another firm: a Case Officer opening Team by URL sees the refusal; Case Officer and Case
//      Manager are refused the batch invite and the change of plan (403); the Solo firm's Owner cannot revoke or see this
//      firm's invitation; the downgrade check refuses another firm's usage.
//   W12 400, 1024 and 1440 px: Invite people's flagged rows, no sideways scroll, axe clean.
//   Labelled setup for W9-W10 (Sample, no product route): a second Sample plan "Sample Lower 2 (J-20)" with its limits;
//   W10's case gate needs the configured checkpoint, loaded through the copy's own POST /api/demo/load.
// Fails on the fake (P-606): W2's judges are read before Send (no invitation for A or B), W4's before Send (no invitation
// for the second row), W6's before Accept (no staff row for A).
// Not here (their own suites): the change-plan route's own downgrade refusal with fake Stripe (check_pf16_billing_rules.ts
// :220-222; on a local copy the route stops at 409 NO_BILLING_ACCOUNT first, QA-775, so W9 judges the rule through
// PlanBookings.book, the service that route calls) and the case limits (PF-15c, check_pf15c_case_limits.ts).
// Sample rows only; US$0, no model call, no live mail (the local email adapter, read at GET /api/demo/platform-inbox).
// Screenshots: product/screens/J-20/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j20 4420 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j20 4420 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_20.ts j20 4420
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page, type Response } from "playwright";
import { PgCaseCount } from "../../api/src/case-count.ts";
import { checkDowngrade } from "../../api/src/platform/entitlements/limits.ts";
import { PlanBookings } from "../../api/src/platform/entitlements/plan-booking.ts";
import { chooseFiles } from "../../api/src/platform/files/choose.ts";
import { withFirm } from "../../api/src/platform/firm-scope.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j20", Number(process.argv[3] ?? 4420)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-20", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const { sql: rawSql, call } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys

// ------------------------------------------------------------------------------------------------ setup (Sample)
const A_FIRM = sql(`select id from platform_firm where key = 'sample-firm'`);
const [R_EMAIL] = sql(`select email from platform_staff where actor_id = 'user-R'`).split("|");   // the Owner (Sample)
const STAFF = sql(`select email from platform_staff where firm_id = '${A_FIRM}' and status = 'ACTIVE' and actor_id <> 'user-R' order by email limit 1`);
ok("J-20 setup: the Sample firm, its Owner and another active staff member are seeded", !!A_FIRM && !!R_EMAIL && !!STAFF);
const signIn = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email: R_EMAIL, secondStep: true }) });
let tR = ((await signIn.json().catch(() => ({}))) as { token?: string; detail?: string }).token ?? "";
if (!tR) { console.error("STOP  local sign-in refused (start the copy with the header's PLATFORM_IDENTITY=local)"); process.exit(2); }
const api = async (method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${tR}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const plan = sql(`select p.id || '|' || p.seats_limit || '|' || p.name from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = '${A_FIRM}' and s.status <> 'ENDED' limit 1`).split("|");
const used = () => Number(sql(`select ((select count(*) from platform_staff where firm_id = '${A_FIRM}' and status in ('ACTIVE','SUSPENDED')) + (select count(*) from platform_invitation where firm_id = '${A_FIRM}' and accepted_at is null and revoked_at is null and expires_at > now()))`));
const limit = (n: number) => sql(`update platform_plan set seats_limit = ${n} where id = '${plan[0]}'`);
const invitations = (email: string) => Number(sql(`select count(*) from platform_invitation where email = '${email}'`));
const invited: string[] = [];   // revoked in the finally: the walk is repeatable on a kept copy

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 200 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const fresh = async (): Promise<Page> => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e))); return p;
};
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const batchCalls: { page: Page; rows: number }[] = [];
const watch = (p: Page) => p.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/platform/staff/invitations/batch") batchCalls.push({ page: p, rows: ((r.postDataJSON() as { rows?: unknown[] }).rows ?? []).length }); });
const team = async (p: Page) => { await p.goto(`${BASE}/platform/team`); await p.locator("[data-seat-line]").waitFor({ timeout: 30_000 }); };
const openInvite = async (p: Page) => { await team(p); await p.locator("[data-invite-open]").click(); await p.getByLabel("Email, person 1").waitFor({ timeout: 15_000 }); };
const row = (p: Page, n: number) => p.locator(`[data-invite-row="${n}"]`);
const tick = async (p: Page, n: number, role: string) => { const r = row(p, n); if (await r.locator('[data-role="CASE_OFFICER"]').isChecked() && role !== "CASE_OFFICER") await r.locator('[data-role="CASE_OFFICER"]').uncheck(); if (!(await r.locator(`[data-role="${role}"]`).isChecked())) await r.locator(`[data-role="${role}"]`).check(); };
const until = async (what: string, test: () => boolean | Promise<boolean>, ms = 15_000) => { for (let t = 0; t < ms; t += 100) { if (await test()) return; await new Promise((r) => setTimeout(r, 100)); } throw new Error(`STOP  timed out waiting for ${what}`); };
// qa's W8-W12 helpers (from qa's draft 0a9b3ed54)
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mail = (k: string) => `j20-${k}-${run}@sample-firm.example.com`;
const BAD = `not-an-email-${run}`;
const B_FIRM = sql(`select id from platform_firm where key = 'sample-solo'`);
const O_EMAIL = sql(`select email from platform_staff where actor_id = 'user-O'`);   // a Case Officer (Sample)
const T_EMAIL = sql(`select email from platform_staff where actor_id = 'user-T'`);   // a Case Manager (Sample)
const S_EMAIL = sql(`select email from platform_staff where actor_id = 'user-S'`);   // the Solo firm's Owner (Sample)
ok("J-20 setup (W8-W12): the Solo firm, its Owner, a Case Officer and a Case Manager are seeded", !!B_FIRM && !!O_EMAIL && !!T_EMAIL && !!S_EMAIL);
const PLAN_ID = plan[0], PLAN_NAME = plan[2];
const pending = (email: string) => Number(sql(`select count(*) from platform_invitation where email = '${email}' and accepted_at is null and revoked_at is null`));
const bookings = new PlanBookings({ db, now: () => Date.now(), files: chooseFiles({ PLATFORM_FILES: "local" }), cases: (key) => new PgCaseCount(db as never, key) });
const OWNER_ACTOR = `staff:${sql(`select id from platform_staff where actor_id = 'user-R'`)}`;
const LOWER2 = `j20-lower2-${run}`;
const localToken = async (firmKey: string, email: string) => {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  return ((await r.json().catch(() => ({}))) as { token?: string }).token ?? "";
};
const apiAs = async (token: string, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
/** A service refusal (HttpException) as { status, body }, or the value. */
const outcome = async (f: () => Promise<unknown>): Promise<{ status: number; body: any; value?: unknown }> => {   // eslint-disable-line @typescript-eslint/no-explicit-any -- as Ans
  try { return { status: 200, body: null, value: await f() }; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => unknown }; return { status: x.getStatus?.() ?? 0, body: x.getResponse?.() ?? String(e) }; }
};
const signInAs = async (firmKey: string, email: string): Promise<Page> => {
  const p = await fresh(); p.on("dialog", (d) => void d.accept());
  await p.goto(`${BASE}/account`);
  await p.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 30_000 });
  await p.getByLabel("Firm key").fill(firmKey); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 30_000 });
  return p;
};
const pageToken = (p: Page) => p.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
const batchAnswer = (p: Page) => p.waitForResponse((r: Response) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/platform/staff/invitations/batch", { timeout: 60_000 });
const addRows = async (p: Page, emails: string[]) => { for (const [i, e] of emails.entries()) { if (i > 0) await p.locator("[data-add-row]").click(); await p.getByLabel(`Email, person ${i + 1}`).fill(e); } };
const closePanel = async (p: Page) => { await p.keyboard.press("Escape"); await p.getByLabel("Email, person 1").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined); };
const noSideways = (p: Page) => p.evaluate(() => {
  const d = document.documentElement, dlg = document.querySelector<HTMLElement>('[role="dialog"]');
  return d.scrollWidth <= d.clientWidth + 1 && (!dlg || dlg.scrollWidth <= dlg.clientWidth + 1);
});
const axeSerious = async (p: Page) => (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);
const keep = (email: string) => { const id = sql(`select coalesce((select id::text from platform_invitation where email = '${email}' and revoked_at is null and accepted_at is null limit 1), '')`); if (id) invited.push(id); };
// The configured checkpoint (W10's case gate needs a released individual combination): loaded now, awaited at W10.
const comboId = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id) limit 1`);
const loading = comboId() ? Promise.resolve({ status: 200, body: null }) : call("POST", "/demo/load", { sample: "configured" }, "user-A").catch((e) => ({ status: 0, body: String(e) }));

const A = `j20-a-${run}@sample-firm.example.com`, B = `j20-b-${run}@sample-firm.example.com`, D = `j20-d-${run}@sample-firm.example.com`, C2 = `j20-c2-${run}@sample-firm.example.com`;
const A_NAME = `Client A Staff ${run}`, A_TWICE = A.toUpperCase();
const LOWER = `j20-lower-${run}`, LOWER_NAME = `Sample Lower (J-20 ${run})`;
const withdraw = () => sql(`update platform_subscription_change set withdrawn_at = now() where firm_id = '${A_FIRM}' and withdrawn_at is null and applied_at is null`);
limit(used() + 20);   // lent for the walk; given back in the finally
try {
  const dInv = await api("POST", "/platform/staff/invitations", { email: D, roles: ["READ_ONLY"] });
  if (dInv.body?.id) invited.push(dInv.body.id);
  ok("J-20 setup: D already has a pending invitation", dInv.status === 201 || dInv.status === 200, dInv.status);

  // ---------------------------------------------------------------------------------- W1: four rows, two good, two flagged
  const owner = await fresh(); watch(owner); owner.on("dialog", (d) => void d.accept());
  await owner.goto(`${BASE}/account`);
  await owner.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 30_000 });
  await owner.getByLabel("Firm key").fill("sample-firm"); await owner.getByLabel("Work email").fill(R_EMAIL); await owner.keyboard.press("Enter");
  await owner.locator("[data-staff-name]").waitFor({ timeout: 30_000 });
  // One session at a time (AG-1-55): the card's sign-in ended the API session above, so the API steps use this one.
  tR = await owner.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
  ok("J-20 W1: the Owner signs in on the card", !!tR);
  await openInvite(owner);
  await owner.getByLabel("Email, person 1").fill(A); await owner.getByLabel("Name, person 1 (optional)").fill(A_NAME);
  for (const [n, email] of [[2, B], [3, STAFF], [4, D], [5, A_TWICE]] as const) { await owner.locator("[data-add-row]").click(); await owner.getByLabel(`Email, person ${n}`).fill(email); }
  await tick(owner, 2, "READ_ONLY");
  ok("J-20 W1: the form counts five people against the seats", (await owner.locator("[data-send-invites]").innerText()).trim() === "Send 5 invitations");
  ok("J-20 W1 (BR-3): before Send, A's email typed again is named on the later row", (await row(owner, 5).innerText()).includes("This email is already on another row."));
  const preview = (await owner.locator("[data-invite-seats]").innerText()).trim();
  ok("J-20 W1 (review m3): the seat line counts four people, not the duplicate row (the server gives it no seat)", preview.startsWith(`${used() + 4} of `) && preview.endsWith("seats after these invites"), preview);
  await shot(owner, "W1-four-rows-1440");
  // P-606: W2's judges before Send.
  ok("J-20 W2 fail (before Send): no invitation exists for A or B", invitations(A) === 0 && invitations(B) === 0);
  await owner.locator("[data-send-invites]").click();
  // QA-773: on main Send stopped here; the wait is a check of its own, so a timeout fails loudly and W2 and W4 still report.
  ok("J-20 W1 fail (QA-773): Send answers within 20 s with the form's \"not everyone was invited\" words", await owner.locator("[data-invite-form-error]").waitFor({ timeout: 20_000 }).then(() => true, () => false));
  const toast = await owner.getByText("2 invitations sent.").count();
  const rowsLeft = await owner.locator("[data-invite-row]").count();
  const words1 = await row(owner, 1).innerText(), words2 = await row(owner, 2).innerText();
  ok("J-20 W1: Send invites the two good rows (\"2 invitations sent.\"); they leave the form and the two flagged rows stay", toast === 1 && rowsLeft === 3 && (await owner.getByLabel("Email, person 1").inputValue()) === STAFF && (await owner.getByLabel("Email, person 2").inputValue()) === D, { toast, rowsLeft });
  const words3 = await row(owner, 3).innerText().catch(() => "");
  ok("J-20 W1 fail (QA-773): the duplicate row does not stop Send; it stays with the server's words (an earlier row of this form, which counts for this person)", rowsLeft === 3 && (await owner.getByLabel("Email, person 3").inputValue().catch(() => "")) === A_TWICE && words3.includes("This email is also on an earlier row of this form, which counts for this person, so this row was not sent."), words3);
  ok("J-20 W1: each flagged row shows its own reason on its own row (already staff; already invited)", words1.includes("This person is already on your firm's staff.") && !words1.includes("invitation") && /already (has a pending invitation|invited)/i.test(words2) && !words2.includes("already on your firm's staff"), { words1, words2 });
  ok("J-20 W1 (break m5): focus goes to the first flagged row's Email field, not the panel", await owner.evaluate(() => document.activeElement?.getAttribute("aria-invalid") === "true" && !!document.activeElement?.closest('[data-invite-row="1"]')));
  ok("J-20 W1: the form says how many were not invited", (await owner.locator("[data-invite-form-error]").innerText({ timeout: 2_000 }).catch(() => "")).includes("3 people were not invited."));
  ok("J-20 W1: each flagged row's Email field is marked invalid for screen readers", await owner.getByLabel("Email, person 1").getAttribute("aria-invalid") === "true" && await owner.getByLabel("Email, person 2").getAttribute("aria-invalid") === "true");
  const axe = await new AxeBuilder({ page: owner }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok("J-20 W1: Invite people with flagged rows: axe finds no serious or critical WCAG A/AA violation", serious.length === 0, serious.map((v) => v.id));
  await shot(owner, "W1-flagged-rows-1440");

  // ------------------------------------------------------------------------------------------------- W2: underneath
  ok("J-20 W2 fail (QA-773): the whole form, the duplicate row too, was one batch call of five rows", batchCalls.filter((c) => c.page === owner).length === 1 && batchCalls[0]?.rows === 5, batchCalls.map((c) => c.rows));
  ok("J-20 W2: the duplicate row made no second invitation for A's email", sql(`select count(*) from platform_invitation where lower(email) = '${A}'`) === "1");
  ok("J-20 W2: A and B each have one pending invitation with the roles chosen", invitations(A) === 1 && invitations(B) === 1 && sql(`select roles::text from platform_invitation where email = '${A}'`) === "{CASE_OFFICER}" && sql(`select roles::text from platform_invitation where email = '${B}'`) === "{READ_ONLY}");
  ok("J-20 W2: A's name is stored as the invitation's display name; B (no name) has none", sql(`select coalesce(display_name, 'NULL') from platform_invitation where email = '${A}'`) === A_NAME && sql(`select coalesce(display_name, 'NULL') from platform_invitation where email = '${B}'`) === "NULL");
  ok("J-20 W2: one audit line each for A and B, marked as one form", sql(`select count(*) from audit_event where action = 'platform.invitation.created' and detail->>'batch' = 'true' and entity_key in (select id::text from platform_invitation where email in ('${A}','${B}'))`) === "2");
  ok("J-20 W2: no invitation for the staff member (C); D still has exactly one", invitations(STAFF) === 0 && invitations(D) === 1);
  for (const e of [A, B]) invited.push(sql(`select id from platform_invitation where email = '${e}'`));

  // ------------------------------------------------------------------------------------------ W3: fix and send again
  if (rowsLeft === 3) {   // W1's Send went; when it did not (QA-773 on main) W3 has nothing to fix, and W4 still runs
    await owner.getByLabel("Email, person 1").fill(C2);
    await owner.getByRole("button", { name: "Remove person 3" }).click();   // the duplicate row
    await owner.getByRole("button", { name: "Remove person 2" }).click();
    ok("J-20 W3: correcting a flagged row clears its words", !(await row(owner, 1).innerText()).includes("already on your firm's staff"));
    // Break M1: while the batch is in flight the form is locked, so nothing typed then can be lost or get another row's words.
    let release!: () => void; const held = new Promise<void>((r) => { release = r; });
    await owner.route("**/api/platform/staff/invitations/batch", async (r) => { await held; await r.continue(); }, { times: 1 });
    await owner.locator("[data-send-invites]").click();
    await owner.locator("[data-invite-form]:disabled").waitFor({ timeout: 10_000 });
    ok("J-20 W3 fail (break M1): while sending, the rows cannot be edited, removed or added to", await owner.getByLabel("Email, person 1").isDisabled() && await owner.locator("[data-add-row]").isDisabled());
    release();
    await until("the corrected row's invitation", () => invitations(C2) === 1);
    await owner.getByLabel("Email, person 1").waitFor({ state: "detached", timeout: 15_000 });
    invited.push(sql(`select id from platform_invitation where email = '${C2}'`));
    ok("J-20 W3: the corrected row is invited and the panel closes", invitations(C2) === 1 && (await owner.locator("[data-invite-row]").count()) === 0);
  } else { ok("J-20 W3: not walked: W1's Send did not go (QA-773)", false); await owner.keyboard.press("Escape"); }

  // ------------------------------------------------------------------- W4: the seat taken while the form was open (server)
  const S1 = `j20-s1-${run}@sample-firm.example.com`, S2 = `j20-s2-${run}@sample-firm.example.com`, X = `j20-x-${run}@sample-firm.example.com`;
  limit(used() + 2);
  await openInvite(owner);
  await owner.getByLabel("Email, person 1").fill(S1); await owner.locator("[data-add-row]").click(); await owner.getByLabel("Email, person 2").fill(S2);
  ok("J-20 W4: two rows fit the two seats left", (await owner.locator("[data-invite-seats]").innerText()) === `${used() + 2} of ${used() + 2} seats after these invites` && await owner.locator("[data-send-invites]").isEnabled());
  const xInv = await api("POST", "/platform/staff/invitations", { email: X, roles: ["READ_ONLY"] });   // someone else takes a seat
  if (xInv.body?.id) invited.push(xInv.body.id);
  ok("J-20 W4: someone else's invite takes one of the two seats", xInv.status === 201 || xInv.status === 200, xInv.status);
  ok("J-20 W4 fail (before Send): no invitation exists for either row", invitations(S1) === 0 && invitations(S2) === 0);
  await owner.locator("[data-send-invites]").click();
  await owner.locator("[data-invite-form-error]").waitFor({ timeout: 20_000 });
  const seatWords = await row(owner, 1).innerText();
  ok("J-20 W4: the first row is invited; the second stays with the server's words naming the plan and its seats", invitations(S1) === 1 && invitations(S2) === 0 && (await owner.getByLabel("Email, person 1").inputValue()) === S2
    && seatWords.includes(`No seat left for this person: your plan (${plan[2]}) has ${used()} seats`), seatWords);
  invited.push(sql(`select id from platform_invitation where email = '${S1}'`));
  await shot(owner, "W4-seat-taken-1440");
  await owner.keyboard.press("Escape");   // "Discard the people you typed?" is accepted by the page's dialog handler

  // ------------- W4 (QA-774, "every gated action asks one check"): a lower plan booked for the renewal (SA-3-59) lowers the
  // seat limit the gate uses; Team's seat line, the form's free seats and the gate's words follow that one limit and name
  // that plan. Labelled setup (Sample): the plan row and the booking are inserted (the booking through its table's trigger).
  limit(used() + 5);
  const lowSeats = used() + 1, [L1, L2] = [1, 2].map((k) => `j20-l${k}-${run}@sample-firm.example.com`);
  sql(`insert into platform_plan (id, code, name, seats_limit) values (gen_random_uuid(), '${LOWER}', '${LOWER_NAME}', ${lowSeats})`);
  sql(`insert into platform_subscription_change (id, firm_id, subscription_id, from_plan_id, to_plan_id, booked_by, booked_at, effective_at) select gen_random_uuid(), s.firm_id, s.id, s.plan_id, p.id, 'seed:j20', now(), now() from platform_subscription s, platform_plan p where s.firm_id = '${A_FIRM}' and s.status <> 'ENDED' and p.code = '${LOWER}'`);
  ok("J-20 W4 setup: a lower Sample plan is booked for the renewal, one seat above today's use", sql(`select count(*) from platform_subscription_change where firm_id = '${A_FIRM}' and withdrawn_at is null and applied_at is null`) === "1");
  await team(owner);
  const bookedLine = (await owner.locator("[data-seat-line]").innerText()).trim();
  ok("J-20 W4 fail (QA-774): while the lower plan is booked, Team's seat line says the limit the gate uses and names that plan", bookedLine.startsWith(`${used()} of ${lowSeats} seats used`) && bookedLine.includes(LOWER_NAME), { bookedLine, lowSeats });
  await owner.locator("[data-invite-open]").click(); await owner.getByLabel("Email, person 1").waitFor({ timeout: 15_000 });
  await owner.getByLabel("Email, person 1").fill(L1); await owner.locator("[data-add-row]").click(); await owner.getByLabel("Email, person 2").fill(L2);
  ok("J-20 W4 fail (QA-774): Invite people says the one free seat the gate allows", (await owner.locator("[data-invite-seat-warning]").count()) === 1 && (await owner.locator("[data-invite-seat-warning]").innerText()).includes("Your plan has 1 free seat."));
  await shot(owner, "W4-seat-line-while-booked-1440");
  await owner.locator("[data-send-invites]").click();
  await owner.locator("[data-invite-form-error]").waitFor({ timeout: 20_000 });
  const lowWords = await row(owner, 1).innerText();
  ok("J-20 W4 fail (QA-774): the first row is invited; the second stays with the gate's words naming the booked plan and its seats, never the current plan",
    invitations(L1) === 1 && invitations(L2) === 0 && lowWords.includes(`your booked plan (${LOWER_NAME}) has ${lowSeats} seats`) && !lowWords.includes(plan[2]), lowWords);
  invited.push(sql(`select id from platform_invitation where email = '${L1}'`));
  await owner.keyboard.press("Escape");
  withdraw();
  await team(owner);
  ok("J-20 W4: the booking withdrawn, Team's seat line is the plan's own limit and name again", (await owner.locator("[data-seat-line]").innerText()).trim() === `${used()} of ${used() + 4} seats used on ${plan[2]}`);

  // ------------------------------------------------- W5: more valid rows than free seats (P-727 over PF-6 BR-2)
  const [Y1, Y2, Y3] = [1, 2, 3].map((k) => `j20-y${k}-${run}@sample-firm.example.com`);
  limit(used() + 2);
  await openInvite(owner);
  await owner.getByLabel("Email, person 1").fill(Y1);
  for (const [n, email] of [[2, STAFF], [3, Y2], [4, Y3]] as const) { await owner.locator("[data-add-row]").click(); await owner.getByLabel(`Email, person ${n}`).fill(email); }
  ok("J-20 W5: before Send the form says 2 seats are free, and Send stays on", (await owner.locator("[data-invite-seat-warning]").innerText()).includes("Your plan has 2 free seats.") && await owner.locator("[data-send-invites]").isEnabled());
  ok("J-20 W5: over the free seats the seat line counts what is used and what is on the form (never \"n+2 of n\")", (await owner.locator("[data-invite-seats]").innerText()) === `${used()} of ${used() + 2} seats used · 4 on this form`);
  ok("J-20 W5 fail (before Send): none of the three valid rows is invited", [Y1, Y2, Y3].every((e) => invitations(e) === 0));
  await owner.locator("[data-send-invites]").click();
  await owner.locator("[data-invite-form-error]").waitFor({ timeout: 20_000 });
  const staffWords = await row(owner, 1).innerText(), overWords = await row(owner, 2).innerText();
  ok("J-20 W5: the two free seats go to the first two valid rows; the staff row uses no seat", invitations(Y1) === 1 && invitations(Y2) === 1 && invitations(Y3) === 0 && invitations(STAFF) === 0);
  ok("J-20 W5: the staff row and the third valid row stay in the form, each with its own words on its own row",
    (await owner.locator("[data-invite-row]").count()) === 2 && (await owner.getByLabel("Email, person 1").inputValue()) === STAFF && (await owner.getByLabel("Email, person 2").inputValue()) === Y3
    && staffWords.includes("This person is already on your firm's staff.") && !staffWords.includes("No seat left") && overWords.includes(`your plan (${plan[2]}) has ${used()} seats`), { staffWords, overWords });
  for (const e of [Y1, Y2]) invited.push(sql(`select id from platform_invitation where email = '${e}'`));
  await shot(owner, "W5-over-the-seats-1440");
  limit(used() + 1);   // a seat is freed (or the plan upgraded)
  await owner.getByRole("button", { name: "Remove person 1" }).click();
  await owner.locator("[data-send-invites]").click();
  await until("the over-seat row's invitation", () => invitations(Y3) === 1);
  await owner.getByLabel("Email, person 1").waitFor({ state: "detached", timeout: 15_000 });
  invited.push(sql(`select id from platform_invitation where email = '${Y3}'`));
  ok("J-20 W5: with a seat free, the row left in the form is sent again and the panel closes", invitations(Y3) === 1);

  // ------------------------------------------------------------------------- DW1: a single invite past the limit (API)
  limit(used());
  const Z = `j20-z-${run}@sample-firm.example.com`, over = await api("POST", "/platform/staff/invitations", { email: Z, roles: ["READ_ONLY"] });
  ok("J-20 DW1: a single invite past the seat limit is refused 409 naming the limit; nothing stored", over.status === 409 && String(over.body?.detail ?? "").includes(String(used())) && invitations(Z) === 0, { status: over.status, detail: over.body?.detail });
  limit(used() + 20);

  // ======================================== W8 (qa): the API's seat refusals, its duplicate flag, 50 rows on the screen, 51 by API
  limit(used());
  const P1 = mail("p1"), one = await api("POST", "/platform/staff/invitations", { email: P1, roles: ["READ_ONLY"] });
  const batch1 = await api("POST", "/platform/staff/invitations/batch", { rows: [{ email: P1, roles: ["READ_ONLY"] }] });
  ok("J-20 W8 (API): past the limit the single invite is 409 PLAN_LIMIT_REACHED (seats, its limit, used) and the batch row is OVER_SEAT_LIMIT naming the limit; nothing stored",
    one.status === 409 && one.body?.code === "PLAN_LIMIT_REACHED" && one.body?.metric === "seats" && one.body?.limit === used() && one.body?.used === used()
    && batch1.status === 200 && (batch1.body?.invited ?? []).length === 0 && batch1.body?.flagged?.[0]?.reason === "OVER_SEAT_LIMIT" && String(batch1.body?.flagged?.[0]?.detail ?? "").includes(`has ${used()} seats`) && invitations(P1) === 0,
    { one: [one.status, one.body?.code, one.body?.limit], batch: batch1.body?.flagged?.[0] });
  const [E1, E2] = [mail("e1"), mail("e2")];
  limit(used() + 2);

  const dup = await api("POST", "/platform/staff/invitations/batch", { rows: [{ email: E1, roles: ["READ_ONLY"] }, { email: E1, roles: ["READ_ONLY"] }, { email: BAD, roles: ["READ_ONLY"] }, { email: E2, roles: ["READ_ONLY"] }] });
  ok("J-20 W8 (API): a batch with a duplicate accepts the good rows and flags row 2 DUPLICATE_IN_FORM and row 3 INVALID_EMAIL, each with its words",
    dup.status === 200 && dup.body?.invited?.map((i: { row: number }) => i.row).join() === "1,4" && dup.body?.flagged?.find((f: { row: number }) => f.row === 2)?.reason === "DUPLICATE_IN_FORM"
    && dup.body?.flagged?.find((f: { row: number }) => f.row === 3)?.reason === "INVALID_EMAIL" && /earlier row/.test(dup.body?.flagged?.find((f: { row: number }) => f.row === 2)?.detail ?? "") && invitations(E1) === 1 && invitations(E2) === 1, dup.body);
  for (const e of [E1, E2]) keep(e);
  // The 50-row edge on the screen.
  const FIFTY = Array.from({ length: 50 }, (_, k) => mail(`f${k + 1}`));
  limit(used() + 50);
  await openInvite(owner);
  await addRows(owner, FIFTY);
  ok("J-20 W8 (50 rows): at 50 rows the form offers no 51st and says why", (await owner.locator("[data-invite-row]").count()) === 50 && (await owner.locator("[data-add-row]").count()) === 0 && (await owner.locator("[data-invite-max]").innerText()).includes("50 people is the most in one form"));
  await shot(owner, "W8-fifty-rows-1440");
  const c50 = batchCalls.filter((c) => c.page === owner).length, a50 = batchAnswer(owner);
  await owner.locator("[data-send-invites]").click();
  const b50 = await (await a50).json().catch(() => null) as { invited?: unknown[]; flagged?: { reason: string }[] } | null;
  await owner.getByLabel("Email, person 1").waitFor({ state: "detached", timeout: 60_000 }).catch(() => undefined);
  const n50 = Number(sql(`select count(*) from platform_invitation where email like 'j20-f%-${run}@sample-firm.example.com' and revoked_at is null`));
  ok("J-20 W8 (50 rows): the 50 rows go in one batch call; all 50 are invited and the panel closes", batchCalls.filter((c) => c.page === owner).slice(c50).map((c) => c.rows).join() === "50" && n50 === 50 && (await owner.locator("[data-invite-row]").count()) === 0, { calls: batchCalls.filter((c) => c.page === owner).slice(c50).map((c) => c.rows), n50, invited: b50?.invited?.length, flagged: b50?.flagged?.slice(0, 2) });
  for (const e of FIFTY) keep(e);
  const FIFTY_ONE = Array.from({ length: 51 }, (_, k) => ({ email: mail(`g${k + 1}`), roles: ["READ_ONLY"] }));
  limit(used() + 51);
  const r51 = await api("POST", "/platform/staff/invitations/batch", { rows: FIFTY_ONE });
  ok("J-20 W8 (51 rows, API): 51 rows are refused 422 ROWS_COUNT naming 1 to 50; nothing stored", r51.status === 422 && r51.body?.code === "ROWS_COUNT" && r51.body?.maxRows === 50
    && Number(sql(`select count(*) from platform_invitation where email like 'j20-g%-${run}@sample-firm.example.com'`)) === 0, { status: r51.status, code: r51.body?.code, detail: r51.body?.detail });

  // ========================================================== W9: a downgrade that breaks a limit is refused with the list
  const billingLink = owner.locator('[data-account-section="/settings/billing"]:visible').first();
  if (await billingLink.count()) await billingLink.click(); else await owner.goto(`${BASE}/settings/billing`);
  await owner.locator("[data-billing-summary], [data-billing-refused]").first().waitFor({ timeout: 30_000 });
  await shot(owner, "W9-plan-and-billing-1440");
  console.log(`NOTE  W9 (screen): Plan and billing shows "${(await owner.locator("[data-billing-summary] h2").innerText().catch(() => "?")).trim()}"; there is no change of plan on our own screens yet (R1.91 / PF-16's screen, not built), so the refusal's list is not walked on a screen.`);
  const target = sql(`select code || '|' || name || '|' || seats_limit from platform_plan where code = 'solo' and active`).split("|");
  const u3 = used(), changesBefore = sql(`select count(*) from platform_subscription_change where firm_id = '${A_FIRM}'`);
  const planPreview = await api("POST", "/platform/billing/change-plan/preview", { plan: target[0], period: "month" });
  console.log(`NOTE  W9 (API, QA-775 Gap · Minor, open): the change-plan preview to Solo answers ${planPreview.status} ${planPreview.body?.code ?? ""} (conflicts: ${JSON.stringify(planPreview.body?.conflicts ?? null)}); on a local copy no Sample firm has a billing subscription, so the route stops before its downgrade check, which is judged below through PlanBookings.book.`);
  const planChange = await api("POST", "/platform/billing/change-plan", { plan: target[0], period: "month", prorationDate: new Date(Math.floor(Date.now() / 1000) * 1000).toISOString(), kind: "renewal", amountDueNowCents: 0 });
  console.log(`NOTE  W9 (API, QA-775): the change of plan to Solo answers ${planChange.status} ${planChange.body?.code ?? ""}.`);
  // Judged only when the route reached its check: a 409 NO_BILLING_ACCOUNT stops it before any check, so "nothing booked" would
  // pass whatever the downgrade logic did (fresh reader on #3480; Lead 26: a 409 is never counted as a pass).
  if (planChange.body?.code === "NO_BILLING_ACCOUNT") console.log("NOTE  W9 (API, QA-775): the change-plan route stopped at NO_BILLING_ACCOUNT before its check, so its \"books nothing\" is not judged here (check_pf16_billing_rules.ts judges it with fake Stripe).");
  else ok("J-20 W9 (API): the change-plan route books nothing for a move that breaks a limit", sql(`select count(*) from platform_subscription_change where firm_id = '${A_FIRM}'`) === changesBefore, { status: planChange.status, code: planChange.body?.code });
  const solo = await outcome(() => withFirm(A_FIRM, () => bookings.book(A_FIRM, target[0], OWNER_ACTOR)));
  const seatC = (solo.body?.conflicts ?? []).find((c: { metric: string }) => c.metric === "seats");
  ok("J-20 W9 (underneath: PlanBookings.book, the route's check): the move to Solo is refused 409 DOWNGRADE_CONFLICTS listing each conflict (seats: used, limit, the amount to remove, SA-4-56's words); nothing booked",
    solo.status === 409 && solo.body?.code === "DOWNGRADE_CONFLICTS" && seatC?.used === u3 && seatC?.limit === Number(target[2]) && seatC?.reduce === u3 - Number(target[2])
    && String(solo.body?.detail ?? "").includes(`You have ${u3} staff; ${target[1]} allows ${target[2]}. Remove ${u3 - Number(target[2])} staff or choose a larger plan.`) && sql(`select count(*) from platform_subscription_change where firm_id = '${A_FIRM}'`) === changesBefore, solo.body);
  // A lower Sample plan that breaks nothing: the seats in use now, no active cases, the same storage as the firm's plan.
  limit(used() + 5);
  const lowerSeats = used(), storage = sql(`select coalesce(limit_value::text, 'null') from platform_plan_limit where plan_id = '${PLAN_ID}' and metric = 'STORAGE_MB'`);
  sql(`insert into platform_plan (id, code, name, seats_limit) values (gen_random_uuid(), '${LOWER2}', 'Sample Lower 2 (J-20)', ${lowerSeats})`);
  sql(`insert into platform_plan_limit (plan_id, metric, limit_value) select id, m::platform_limit_metric, v from platform_plan, (values ('ACTIVE_INDIVIDUAL_CASES', 0), ('ACTIVE_CORPORATE_CASES', 0), ('STORAGE_MB', ${storage})) x(m, v) where code = '${LOWER2}'`);
  const fine = await outcome(() => withFirm(A_FIRM, () => bookings.book(A_FIRM, LOWER2, OWNER_ACTOR)));
  const booking = fine.value as { id?: string; toPlan?: string; atOnce?: boolean; effectiveAt?: string } | undefined;
  ok("J-20 W9 (underneath): a lower plan that breaks no limit is booked for the renewal, with one audit line",
    fine.status === 200 && booking?.toPlan === LOWER2 && booking?.atOnce === false && new Date(booking?.effectiveAt ?? 0).getTime() > Date.now()
    && sql(`select count(*) from audit_event where action = 'plan.change.booked' and entity_key = '${booking?.id}'`) === "1", fine.status === 200 ? booking : fine.body);

  // ================================================================= W10: every gated action asks one check
  const src = (p: string) => readFileSync(join(STUDIO, "api", "src", p), "utf8");
  const identity = src("platform/identity/service.ts"), runtime = src("runtime.ts"), storageSrc = src("platform/entitlements/storage.ts"), bind = src("features/platform-entitlements.ts"), retainers = src("features/front-office-retainers.ts"), limitsSrc = src("platform/entitlements/limits.ts"), staffRead = src("platform/staff-read/service.ts");
  const seatRoomBody = /private async seatRoom\([\s\S]*?\n {2}\}/.exec(identity)?.[0] ?? "";
  const LIMIT_READ = /seats_limit|seatsLimit:\s*true|platform_plan_limit|platformPlanLimit|platformPlan\./;
  ok("J-20 W10 (code): seats (single and batch invite), active cases (opening a case) and storage (a new upload) each call EntitlementPort.check on PgEntitlements, no gate reads a limit column itself, and Team's seat line reads the gate's own reader (seatLimitOf)",
    /new PgEntitlements\(tx/.test(seatRoomBody) && /limits\.check\(firmId, "seats"/.test(seatRoomBody) && (identity.match(/this\.seatRoom\(/g) ?? []).length >= 2 && /inviteBatch[\s\S]*?this\.seatRoom\(tx/.test(identity)
    && /this\.entitlements\(tx\)\.check\(firm!\.key, group === "corporate" \? "active_corporate_cases" : "active_individual_cases"/.test(runtime) && /runtime\.useEntitlements\(\(tx\) => new PgEntitlements\(tx/.test(bind)
    && /new PgEntitlements\(this\.db, this\.now\)\.check\(firmId, "storage_mb"/.test(storageSrc) && /new EntitledFiles\(/.test(retainers)
    && /platform_entitlement_limit\(/.test(limitsSrc) && /seatLimitOf\(this\.db, firmId\)/.test(staffRead) && !LIMIT_READ.test(/async seats\([\s\S]*?\n {2}\}/.exec(staffRead)?.[0] ?? "seats_limit") && !LIMIT_READ.test(seatRoomBody) && !LIMIT_READ.test(/class EntitledFiles[\s\S]*$/.exec(storageSrc)?.[0] ?? "x"), { seatRoom: seatRoomBody.length });
  const cfg = await Promise.race([loading, wait(240_000).then(() => ({ status: 0, body: "timed out" }))]);
  const VV = comboId();
  ok("J-20 W10 setup: the configured checkpoint is loaded (an individual combination with a release)", !!VV, { status: cfg.status });
  const firmRt = await call("GET", "/runtime/firm", undefined, "user-O");
  const rep = (firmRt.body?.users ?? []).find((u: { duties: string[] }) => u.duties.includes("represent"))?.id ?? "user-R";
  const openCase = () => call("POST", "/runtime/cases", { combinationId: VV, clientActor: "user-P", principal: { displayName: `Sample Client J20 ${run}` }, representative: rep, caseOfficers: ["user-O"] }, "user-O");
  const W10P = mail("w4");
  const seatGate = await api("POST", "/platform/staff/invitations", { email: W10P, roles: ["READ_ONLY"] });
  const caseGate = await openCase();
  ok("J-20 W10: the one booked lower plan is read at once by both gates: the invite 409 PLAN_LIMIT_REACHED (seats, its limit) and the case 409 PLAN_LIMIT_REACHED (active individual cases, 0); nothing stored",
    seatGate.status === 409 && seatGate.body?.metric === "seats" && seatGate.body?.limit === lowerSeats && caseGate.status === 409 && caseGate.body?.code === "PLAN_LIMIT_REACHED" && caseGate.body?.metric === "active_individual_cases" && caseGate.body?.limit === 0 && invitations(W10P) === 0,
    { seat: [seatGate.status, seatGate.body?.limit, seatGate.body?.detail], case: [caseGate.status, caseGate.body?.metric, caseGate.body?.limit] });
  await team(owner);
  const line = (await owner.locator("[data-seat-line]").innerText()).trim();
  await owner.locator("[data-invite-open]").click(); await owner.getByLabel("Email, person 1").waitFor({ timeout: 15_000 });
  const formSeats = (await owner.locator("[data-invite-seats]").innerText()).trim(), warned = await owner.locator("[data-invite-seat-warning]").count();
  await shot(owner, "W10-seat-line-while-booked-1440");
  await closePanel(owner);
  ok("J-20 W10 (screen): while the lower plan is booked, Team's seat line and Invite people say the limit the gate uses (no free seat), not the plan row's",
    line.startsWith(`${lowerSeats} of ${lowerSeats} seats used`) && warned === 1, { line, formSeats, gateLimit: lowerSeats, gateWords: seatGate.body?.detail });
  const back = await outcome(() => withFirm(A_FIRM, () => bookings.withdraw(A_FIRM, OWNER_ACTOR)));
  const seatAgain = await api("POST", "/platform/staff/invitations", { email: W10P, roles: ["READ_ONLY"] });
  const caseAgain = await openCase();
  ok("J-20 W10: the booking withdrawn, both gates allow again (the invite 201, the case 201)", back.status === 200 && (seatAgain.status === 201 || seatAgain.status === 200) && caseAgain.status === 201, { withdraw: back.status, seat: seatAgain.status, case: [caseAgain.status, caseAgain.body?.detail] });
  keep(W10P);

  // ================================================================= W11: another firm and the wrong roles
  const officer = await signInAs("sample-firm", O_EMAIL);
  await officer.goto(`${BASE}/platform/team`);
  await officer.locator("[data-team-refused], [data-seat-line]").first().waitFor({ timeout: 30_000 });
  ok("J-20 W11: a Case Officer opening Team by URL sees the refusal, no Invite people", (await officer.locator("[data-team-refused]").count()) === 1 && (await officer.locator("[data-invite-open]").count()) === 0
    && (await officer.locator('[data-account-section="/platform/team"]').count()) === 0);
  const tO = await pageToken(officer), tT = await localToken("sample-firm", T_EMAIL), W11P = mail("w5");
  const oBatch = await apiAs(tO, "POST", "/platform/staff/invitations/batch", { rows: [{ email: W11P, roles: ["READ_ONLY"] }] });
  const tBatch = await apiAs(tT, "POST", "/platform/staff/invitations/batch", { rows: [{ email: W11P, roles: ["READ_ONLY"] }] });
  const tPlan = await apiAs(tT, "POST", "/platform/billing/change-plan/preview", { plan: "solo", period: "month" });
  const oPlan = await apiAs(tO, "POST", "/platform/billing/change-plan", { plan: "solo", period: "month", prorationDate: new Date().toISOString(), kind: "renewal", amountDueNowCents: 0 });
  ok("J-20 W11 (API): Case Officer and Case Manager are refused the batch invite (403) and the change of plan (403); nothing stored",
    oBatch.status === 403 && tBatch.status === 403 && tPlan.status === 403 && oPlan.status === 403 && invitations(W11P) === 0, [oBatch.status, tBatch.status, tPlan.status, oPlan.status]);
  const aId = sql(`select id from platform_invitation where email = '${A}'`);
  const soloOwner = await signInAs("sample-solo", S_EMAIL);
  const tS = await pageToken(soloOwner);
  const sRevoke = await apiAs(tS, "POST", `/platform/staff/invitations/${aId}/revoke`, {});
  const sList = await apiAs(tS, "GET", "/platform/staff/invitations");
  await soloOwner.goto(`${BASE}/platform/team?view=invited&invitation=${aId}`);
  await soloOwner.locator("[data-seat-line], [data-team-refused]").first().waitFor({ timeout: 30_000 });
  const soloSees = await soloOwner.getByText(A).count();
  const cross = await outcome(() => withFirm(B_FIRM, () => db.$transaction((tx) => checkDowngrade(tx, { files: chooseFiles({ PLATFORM_FILES: "local" }), cases: new PgCaseCount(db as never, "sample-firm") }, A_FIRM, "solo"))));
  ok("J-20 W11: the Solo firm's Owner cannot revoke or see this firm's invitation (API 404, not listed; by URL not shown), and the downgrade check refuses another firm's usage",
    sRevoke.status === 404 && !JSON.stringify(sList.body ?? "").includes(A) && soloSees === 0 && pending(A) === 1 && cross.status >= 400 && cross.status < 500, { revoke: sRevoke.status, soloSees, cross: cross.status });

  // ================================================================= W12: 400, 1024 and 1440 px
  limit(used());
  await openInvite(owner);
  await addRows(owner, [BAD, STAFF, mail("w12")]);
  const w6 = batchAnswer(owner); await owner.locator("[data-send-invites]").click(); await w6;
  await owner.locator("[data-invite-form-error]").waitFor({ timeout: 20_000 });
  for (const width of [400, 1024, 1440]) {
    await owner.setViewportSize({ width, height: 900 }); await wait(300);
    const wide = await noSideways(owner), serious = await axeSerious(owner);
    ok(`J-20 W12: at ${width} px Team with Invite people's flagged rows has no sideways scroll and axe finds no serious or critical WCAG A/AA violation`, wide && serious.length === 0, { wide, serious });
    await shot(owner, `W12-flagged-rows-${width}`);
  }
  await closePanel(owner);
  limit(used() + 5);

  // ------------------------------------------------------------------------------- W6: A accepts; the name is theirs
  let link = "";
  for (let i = 0; i < 150 && !link; i++) {
    const r = await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(A)}`);
    const mails = r.status === 200 ? ((await r.json()) as { messages: { body: string }[] }).messages : [];
    link = /\/invitation#t=[A-Za-z0-9_-]{43}/.exec(mails.map((m) => m.body).join("\n"))?.[0] ?? "";
    if (!link) await new Promise((res) => setTimeout(res, 100));
  }
  ok("J-20 W6: A's invitation email reaches the inbox with its link", !!link);
  if (!link) throw new Error("STOP  no invitation link for A in the inbox");
  ok("J-20 W6 fail (before Accept): A has no staff record yet", sql(`select count(*) from platform_staff where email = '${A}'`) === "0");
  const a = await fresh(); await a.goto(`${BASE}${link}`);
  await a.locator("[data-accept-continue]").click();
  await a.locator("[data-staff-name]").waitFor({ timeout: 30_000 });
  ok("J-20 W6: A accepts and is signed in, with the name typed on the form in the header", (await a.locator("[data-staff-name]").innerText()).trim() === A_NAME && sql(`select display_name from platform_staff where email = '${A}'`) === A_NAME);
  await shot(a, "W6-accepted-1440");
  await team(owner);
  ok("J-20 W6: the walk ends at the next step: Team lists A as active staff", await owner.locator(`[data-team-row="${A}"]`).isVisible());
  // ---------------------------------------------------------------- W7: at most 50 people in one form (break m2, P-727)
  await openInvite(owner);
  for (let k = 1; k < 50; k++) await owner.locator("[data-add-row]").click();
  ok("J-20 W7 fail (break m2): at 50 rows the form offers no 51st and says why", (await owner.locator("[data-invite-row]").count()) === 50 && (await owner.locator("[data-add-row]").count()) === 0 && (await owner.locator("[data-invite-max]").innerText()).includes("50 people is the most in one form"));
  await owner.keyboard.press("Escape");
  ok("J-20: no page error", errors.length === 0, errors);
} finally {
  withdraw(); sql(`update platform_plan set active = false where code in ('${LOWER}', '${LOWER2}')`);
  limit(Number(plan[1]));
  for (const id of invited.filter(Boolean)) await api("POST", `/platform/staff/invitations/${id}/revoke`, {}).catch(() => undefined);
  const aId = sql(`select coalesce((select id::text from platform_staff where email = '${A}'), '')`);
  if (aId) await api("POST", `/platform/staff/${aId}/deactivate`, { reason: "J-20 walk done" }).catch(() => undefined);
  await browser.close().catch(() => undefined);
  await db.$disconnect().catch(() => undefined);
}
process.exit(summary() ? 1 : 0);
