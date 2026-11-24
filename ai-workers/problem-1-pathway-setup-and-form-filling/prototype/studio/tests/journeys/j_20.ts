// J-20 (map row 20, R1.20: "One entitlement check; seat and plan limits; downgrade check; invite many"), the qa lane's
// acceptance journey (24 Nov), after PF-15 (EntitlementPort, the downgrade check, the booking), PF-4c parts 1 and 1b (the
// batch invite) and #3370 (Invite people sends one batch) merged. It replaces the builder's join-and-walk of #3370 (its
// screen steps live on as W1-W2 here). The firm's Owner walks by screens on an isolated copy of the running app (its own
// database and port, never :4400), with the API and the database read underneath.
// Done when (CAPABILITIES R1.20), word for word: "Every gated action asks one check; an invite past the seat limit refused
// naming the limit; a downgrade that breaks a limit refused listing what to remove; a 1-50 row invite accepts the good
// rows and names each bad row's reason". The steps:
//   W1 "an invite past the seat limit refused naming the limit": every seat taken; the Owner (signed in on the sign-in
//      card) opens Team › Invite people, which says beforehand there is no free seat; one valid row is sent and stays,
//      marked with the server's words naming the plan and its seat count; the single invite API is refused 409
//      PLAN_LIMIT_REACHED with the limit, the batch API flags the row OVER_SEAT_LIMIT; nothing stored.
//   W2 "a 1-50 row invite accepts the good rows and names each bad row's reason": two free seats, seven rows (two good, the
//      same email twice, a bad email, a staff member, a person already invited, a third good row past the seats). The
//      duplicate is named on its row before Send; Send sends the good rows (P-727); each bad row stays with its own words
//      on its own row; underneath one batch call, its answer's flag per row, the stored invitations. The API's duplicate
//      flag per row. The 50-row edge: 50 rows filled on the screen go in one batch and all 50 are invited; the form offers
//      no 51st and says why; the API refuses 51 rows 422 ROWS_COUNT with nothing stored.
//   W3 "a downgrade that breaks a limit refused listing what to remove": Plan and billing by screen (there is no change
//      of plan on our own screens yet: R1.91 / PF-16's screen, not built; said as a NOTE, no step). The change-plan API
//      (POST /api/platform/billing/change-plan, preview and change) to the Solo plan: refused 409 DOWNGRADE_CONFLICTS with
//      the list. Underneath, the same check through PlanBookings.book (what the change-plan route calls for a move at the
//      renewal) on the copy's database: refused with each conflict (used, limit, amount to remove, SA-4-56's words),
//      nothing booked; a lower Sample plan that breaks nothing is booked, with its audit line.
//   W4 "every gated action asks one check": in the code, the three gates (seats on the single and batch invite, active
//      cases on opening a case, storage on a new upload) each call EntitlementPort.check on PgEntitlements, the one
//      reader of the limits, and read no limit column themselves; in the running app, the one booked lower plan (W3) is
//      read at once by the invite gate and the case gate (both 409 PLAN_LIMIT_REACHED with their metric), and the Team
//      screen's seat line says the limit the gate uses; withdrawn, both gates allow again.
//   W5 another firm and the wrong roles: a Case Officer opening Team by URL sees the refusal; Case Officer and Case
//      Manager are refused the batch invite (403) and the change of plan (403); the Solo firm's Owner cannot revoke or
//      see this firm's invitation (API and URL), and the downgrade check refuses another firm's usage.
//   W6 400, 1024 and 1440 px: Team with Invite people's flagged rows has no sideways scroll; axe finds no serious or
//      critical WCAG A/AA violation; no page error.
//   W7 the next step: the invited person (W2's first row) opens the invitation email's link, accepts, is signed in under
//      the name typed on the form, and Team lists them as active staff.
// On main a79e246c6 (qa, 24 Nov) 35/39, the same four lines twice: W2 a duplicate row stops Send for the whole form
// (invite-panel.tsx send(): `if (rows.some(twice)) return;`); W3 both change-plan calls answer 409 NO_BILLING_ACCOUNT on a
// local copy (PlanChanges.plan() reads billing before the downgrade check; no local firm has a billing subscription and
// the local PlanChangePort is an empty fake); W4 Team's seat line reads platform_plan.seats_limit (staff-read seats()),
// not PgEntitlements.limitOf, so it says free seats the gate refuses while a lower plan is booked.
// Labelled setup (Sample, no product route exists): the seat limit is set on the firm's plan row (platform_plan.seats_limit;
// PF-15 part 2's limit change has no route until PF-17's console), lent for the walk and given back in the finally; W3
// adds one Sample plan "Sample Lower (J-20)" (no plan admin route); W4's case gate needs the configured checkpoint, loaded
// through the copy's own POST /api/demo/load. Sample firms and people only; US$0, no model call, live AI off, no live mail.
// Screenshots: product/screens/J-20/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh qa_j20 4479 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh qa_j20 4479 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_20.ts qa_j20 4479
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

const [NAME, PORT] = [process.argv[2] ?? "qa_j20", Number(process.argv[3] ?? 4479)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
if (PORT === 4400 || DBNAME === "xr_studio_demo") { console.log("refused: never the demo on :4400"); process.exit(2); }
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-20", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql, call } = client(PORT, DBNAME);
const sql = (q: string) => (rawSql(q) ?? "").split("\n")[0].trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const run = Date.now().toString(36).slice(-6);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean | Promise<boolean>, ms = 20_000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(200); } return false; };
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other journeys
const api = async (token: string, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { "content-type": "application/json" } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const localToken = async (firmKey: string, email: string) => {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, email, secondStep: true }) });
  return ((await r.json().catch(() => ({}))) as { token?: string }).token ?? "";
};
/** A service refusal (HttpException) as { status, body }, or the value. */
const outcome = async (f: () => Promise<unknown>): Promise<{ status: number; body: any; value?: unknown }> => {   // eslint-disable-line @typescript-eslint/no-explicit-any -- as Ans
  try { return { status: 200, body: null, value: await f() }; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => unknown }; return { status: x.getStatus?.() ?? 0, body: x.getResponse?.() ?? String(e) }; }
};

// ------------------------------------------------------------------------------------------------ setup (Sample)
const A_FIRM = sql(`select id from platform_firm where key = 'sample-firm'`), B_FIRM = sql(`select id from platform_firm where key = 'sample-solo'`);
const R_EMAIL = sql(`select email from platform_staff where actor_id = 'user-R'`);   // the Owner (Sample)
const O_EMAIL = sql(`select email from platform_staff where actor_id = 'user-O'`);   // a Case Officer (Sample)
const T_EMAIL = sql(`select email from platform_staff where actor_id = 'user-T'`);   // a Case Manager (Sample)
const S_EMAIL = sql(`select email from platform_staff where actor_id = 'user-S'`);   // the Solo firm's Owner (Sample)
const STAFF = O_EMAIL;
const plan = sql(`select p.id || '|' || p.seats_limit || '|' || p.name || '|' || p.code from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = '${A_FIRM}' and s.status <> 'ENDED' limit 1`).split("|");
const [PLAN_ID, PLAN_SEATS, PLAN_NAME] = [plan[0], Number(plan[1]), plan[2]];
ok("J-20 setup: the Sample firm on its live plan, its Owner, a Case Officer, a Case Manager and the Solo firm's Owner are seeded", !!A_FIRM && !!B_FIRM && !!R_EMAIL && !!O_EMAIL && !!T_EMAIL && !!S_EMAIL && !!PLAN_ID, { plan });
const used = () => Number(sql(`select ((select count(*) from platform_staff where firm_id = '${A_FIRM}' and status in ('ACTIVE','SUSPENDED')) + (select count(*) from platform_invitation where firm_id = '${A_FIRM}' and accepted_at is null and revoked_at is null and expires_at > now()))`));
const limit = (n: number) => sql(`update platform_plan set seats_limit = ${n} where id = '${PLAN_ID}'`);   // labelled setup (header)
const invitations = (email: string) => Number(sql(`select count(*) from platform_invitation where email = '${email}'`));
const pending = (email: string) => Number(sql(`select count(*) from platform_invitation where email = '${email}' and accepted_at is null and revoked_at is null`));
const mail = (k: string) => `j20-${k}-${run}@sample-firm.example.com`;
const bookings = new PlanBookings({ db, now: () => Date.now(), files: chooseFiles({ PLATFORM_FILES: "local" }), cases: (key) => new PgCaseCount(db as never, key) });
const OWNER_ACTOR = `staff:${sql(`select id from platform_staff where actor_id = 'user-R'`)}`;
const LOWER = `j20-lower-${run}`;

// The configured checkpoint (W4's case gate needs a released individual combination): loaded now, awaited at W4.
const comboId = () => sql(`select c.id from combination c where c.combination_key = 'vv.single' and exists (select 1 from config_release r where r.combination_id = c.id) limit 1`);
const loading = comboId() ? Promise.resolve({ status: 200, body: null }) : call("POST", "/demo/load", { sample: "configured" }, "user-A").catch((e) => ({ status: 0, body: String(e) }));

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const newPage = async (): Promise<Page> => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e))); p.on("dialog", (d) => void d.accept()); return p;
};
/** A person signs in on the sign-in card (PF-4's local stand-in: firm key and work email). */
const signIn = async (firmKey: string, email: string): Promise<Page> => {
  const p = await newPage();
  await p.goto(`${BASE}/account`);
  await p.getByRole("heading", { name: "Sign in to your firm" }).waitFor({ timeout: 30_000 });
  await p.getByLabel("Firm key").fill(firmKey); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.getByLabel("Firm key").waitFor({ state: "detached", timeout: 30_000 });
  return p;
};
const pageToken = (p: Page) => p.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const batchCalls: number[] = [];
const watch = (p: Page) => p.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/platform/staff/invitations/batch") batchCalls.push(((r.postDataJSON() as { rows?: unknown[] }).rows ?? []).length); });
const batchAnswer = (p: Page) => p.waitForResponse((r: Response) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/platform/staff/invitations/batch", { timeout: 30_000 });
/** Team from the My account menu, as a person reaches it. */
const team = async (p: Page) => {
  const link = p.locator('[data-account-section="/platform/team"]:visible').first();
  if (await link.count()) await link.click(); else await p.goto(`${BASE}/platform/team`);
  await p.locator("[data-seat-line]").waitFor({ timeout: 30_000 });
  // The walk changes the seat limit underneath (labelled setup), which no screen hears of: the page is read afresh.
  await p.reload(); await p.locator("[data-seat-line]").waitFor({ timeout: 30_000 });
};
const openInvite = async (p: Page) => { await team(p); await p.locator("[data-invite-open]").click(); await p.getByLabel("Email, person 1").waitFor({ timeout: 15_000 }); };
const row = (p: Page, n: number) => p.locator(`[data-invite-row="${n}"]`);
const addRows = async (p: Page, emails: string[]) => { for (const [i, e] of emails.entries()) { if (i > 0) await p.locator("[data-add-row]").click(); await p.getByLabel(`Email, person ${i + 1}`).fill(e); } };
const tick = async (p: Page, n: number, role: string) => { const r = row(p, n); if (await r.locator('[data-role="CASE_OFFICER"]').isChecked() && role !== "CASE_OFFICER") await r.locator('[data-role="CASE_OFFICER"]').uncheck(); if (!(await r.locator(`[data-role="${role}"]`).isChecked())) await r.locator(`[data-role="${role}"]`).check(); };
const closePanel = async (p: Page) => { await p.keyboard.press("Escape"); await p.getByLabel("Email, person 1").waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined); };
const noSideways = (p: Page) => p.evaluate(() => {
  const d = document.documentElement, dlg = document.querySelector<HTMLElement>('[role="dialog"]');
  return d.scrollWidth <= d.clientWidth + 1 && (!dlg || dlg.scrollWidth <= dlg.clientWidth + 1);
});
const axeSerious = async (p: Page) => (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id);

const invited: string[] = [];   // revoked in the finally: the walk is repeatable on a kept copy
const keep = (email: string) => { const id = sql(`select coalesce((select id::text from platform_invitation where email = '${email}' and revoked_at is null and accepted_at is null limit 1), '')`); if (id) invited.push(id); };
let tR = "";
const A = mail("a"), B = mail("b"), D = mail("d"), C3 = mail("c3"), BAD = `not-an-email-${run}`, P1 = mail("p1");
const A_NAME = `Client A Staff ${run}`;
try {
  // ======================================================================= W1: an invite past the seat limit (screens + API)
  const owner = await signIn("sample-firm", R_EMAIL); watch(owner);
  // One session at a time (AG-1-55): the card's session is the Owner's; the API steps use it.
  tR = await pageToken(owner);
  ok("J-20 W1: the Owner signs in on the sign-in card and is in the app", !!tR && await owner.locator("[data-staff-name]").isVisible());
  limit(used());   // every seat taken (labelled setup)
  const full = used();
  await openInvite(owner);
  await owner.getByLabel("Email, person 1").fill(P1);
  ok("J-20 W1: before Send, Invite people says the plan has no free seat (and that the row will stay)", (await owner.locator("[data-invite-seat-warning]").innerText()).includes("Your plan has no free seat") && (await owner.locator("[data-invite-seats]").innerText()) === `${full} of ${full} seats used · 1 on this form`);
  ok("J-20 W1 fail (before Send): no invitation exists for the row", invitations(P1) === 0);
  const w1 = batchAnswer(owner);
  await owner.locator("[data-send-invites]").click();
  const w1Body = await (await w1).json() as { invited: unknown[]; flagged: { row: number; reason: string; detail: string }[] };
  await owner.locator("[data-invite-form-error]").waitFor({ timeout: 20_000 });
  const w1Words = await row(owner, 1).innerText();
  ok("J-20 W1: the row is refused on screen and stays, its words naming the plan and its seat limit; nothing stored",
    w1Words.includes(`No seat left for this person: your plan (${PLAN_NAME}) has ${full} seats`) && (await owner.getByLabel("Email, person 1").inputValue()) === P1
    && (await owner.locator("[data-invite-form-error]").innerText()).includes("1 person was not invited.") && invitations(P1) === 0, w1Words);
  ok("J-20 W1 (underneath): the screen's batch answer invites no one and flags the row OVER_SEAT_LIMIT naming the limit", w1Body.invited.length === 0 && w1Body.flagged.length === 1 && w1Body.flagged[0].reason === "OVER_SEAT_LIMIT" && w1Body.flagged[0].detail.includes(`has ${full} seats`), w1Body);
  await shot(owner, "W1-past-the-seat-limit-1440");
  await closePanel(owner);
  const single = await api(tR, "POST", "/platform/staff/invitations", { email: P1, roles: ["READ_ONLY"] });
  ok("J-20 W1 (API): the single invite past the limit is refused 409 PLAN_LIMIT_REACHED naming the limit (seats, limit, used, the words); nothing stored",
    single.status === 409 && single.body?.code === "PLAN_LIMIT_REACHED" && single.body?.metric === "seats" && single.body?.limit === full && single.body?.used === full
    && String(single.body?.detail ?? "").includes(`allows ${full} people`) && invitations(P1) === 0, { status: single.status, body: single.body });

  // ============================================================ W2: a 1-50 row invite accepts the good rows (screens + API)
  const dInv = await api(tR, "POST", "/platform/staff/invitations", { email: D, roles: ["READ_ONLY"] });   // D already invited (needs a seat: lent first)
  if (dInv.status !== 201 && dInv.status !== 200) { limit(used() + 1); const again = await api(tR, "POST", "/platform/staff/invitations", { email: D, roles: ["READ_ONLY"] }); ok("J-20 W2 setup: D already has a pending invitation", again.status === 201 || again.status === 200, again.status); }
  else ok("J-20 W2 setup: D already has a pending invitation", true);
  keep(D);
  limit(used() + 2);   // two free seats (labelled setup)
  await openInvite(owner);
  await addRows(owner, [A, B, A, BAD, STAFF, D, C3]);
  await owner.getByLabel("Name, person 1 (optional)").fill(A_NAME);
  await tick(owner, 2, "READ_ONLY");
  ok("J-20 W2: before Send, the duplicate is named on its own row (and only there)", (await row(owner, 3).innerText()).includes("This email is already on another row.") && !(await row(owner, 1).innerText()).includes("already on another row"));
  ok("J-20 W2: before Send, the form says 2 seats are free for 7 rows", (await owner.locator("[data-invite-seat-warning]").innerText()).includes("Your plan has 2 free seats."));
  await shot(owner, "W2-seven-rows-1440");
  ok("J-20 W2 fail (before Send): no invitation exists for A, B or the third good row", invitations(A) === 0 && invitations(B) === 0 && invitations(C3) === 0);
  const callsBefore = batchCalls.length, w2Answer = batchAnswer(owner);
  await owner.locator("[data-send-invites]").click();
  await until(() => batchCalls.length > callsBefore, 4_000);
  const sentWithDup = batchCalls.length > callsBefore;
  ok("J-20 W2: Send with the same email on two rows still sends the good rows and flags the later row (P-727: valid rows invited at once, each flagged row with its reason)",
    sentWithDup && await until(() => invitations(A) === 1, 15_000), { batchSent: sentWithDup, aInvitations: invitations(A), formError: await owner.locator("[data-invite-form-error]").count() });
  let w2Rows = 7;
  if (!sentWithDup) {   // the screen sent nothing: the duplicate row is removed so the walk measures the rest
    await owner.getByRole("button", { name: "Remove person 3" }).click(); w2Rows = 6;
    await owner.locator("[data-send-invites]").click();
  }
  const w2Body = await (await w2Answer).json() as { invited: { row: number; email: string }[]; flagged: { row: number; email: string | null; reason: string; detail: string }[] };
  await owner.locator("[data-invite-form-error]").waitFor({ timeout: 20_000 });
  for (const e of [A, B]) keep(e);
  const left = await owner.locator("[data-invite-row]").count();
  const words: Record<string, string> = {};
  for (let n = 1; n <= left; n++) words[await owner.getByLabel(`Email, person ${n}`).inputValue()] = await row(owner, n).innerText();
  const only = (w: string | undefined, has: string, others: string[]) => !!w && w.includes(has) && others.every((o) => !w.includes(o));
  const PHRASES = ["That is not an email address", "already on your firm's staff", "already has a pending invitation", "No seat left for this person"];
  ok("J-20 W2: the good rows are sent (\"2 invitations sent.\") and leave the form; the four bad rows stay",
    (await owner.getByText("2 invitations sent.").count()) === 1 && left === 4 && !(A in words) && !(B in words), { left, rows: Object.keys(words) });
  ok("J-20 W2: each bad row names its own reason on its own row (bad email; already staff; already invited; no seat left, naming the plan's seats)",
    only(words[BAD], PHRASES[0], PHRASES.filter((x) => x !== PHRASES[0])) && only(words[STAFF], PHRASES[1], PHRASES.filter((x) => x !== PHRASES[1]))
    && only(words[D], PHRASES[2], PHRASES.filter((x) => x !== PHRASES[2])) && only(words[C3], `your plan (${PLAN_NAME}) has ${used()} seats`, PHRASES.filter((x) => x !== PHRASES[3])), words);
  const formEmails = w2Rows === 7 ? [A, B, A, BAD, STAFF, D, C3] : [A, B, BAD, STAFF, D, C3];   // a row the server cannot read an email from answers email: null, so rows are matched by number
  const flagOf = (email: string) => w2Body.flagged.find((f) => formEmails[f.row - 1] === email)?.reason;
  ok("J-20 W2 (underneath): one batch call for the whole form; its answer invites A and B and flags each bad row with its code",
    batchCalls.slice(callsBefore).includes(w2Rows) && w2Body.invited.map((i) => i.email).sort().join() === [A, B].sort().join()
    && flagOf(BAD) === "INVALID_EMAIL" && flagOf(STAFF) === "ALREADY_STAFF" && flagOf(D) === "ALREADY_INVITED" && flagOf(C3) === "OVER_SEAT_LIMIT", { calls: batchCalls.slice(callsBefore), invited: w2Body.invited.map((i) => i.email), flagged: w2Body.flagged.map((f) => [f.email, f.reason]) });
  ok("J-20 W2 (underneath): A and B each have one pending invitation with the roles chosen and A's name; none for the bad rows; D still one",
    invitations(A) === 1 && invitations(B) === 1 && sql(`select roles::text from platform_invitation where email = '${A}'`) === "{CASE_OFFICER}" && sql(`select roles::text from platform_invitation where email = '${B}'`) === "{READ_ONLY}"
    && sql(`select coalesce(display_name, '') from platform_invitation where email = '${A}'`) === A_NAME && invitations(STAFF) === 0 && invitations(C3) === 0 && invitations(BAD) === 0 && invitations(D) === 1);
  await shot(owner, "W2-bad-rows-kept-1440");
  await closePanel(owner);
  // The API's own duplicate flag (the screen stops a duplicate before Send).
  const [E1, E2] = [mail("e1"), mail("e2")];
  limit(used() + 2);
  const dup = await api(tR, "POST", "/platform/staff/invitations/batch", { rows: [{ email: E1, roles: ["READ_ONLY"] }, { email: E1, roles: ["READ_ONLY"] }, { email: BAD, roles: ["READ_ONLY"] }, { email: E2, roles: ["READ_ONLY"] }] });
  ok("J-20 W2 (API): a batch with a duplicate accepts the good rows and flags row 2 DUPLICATE_IN_FORM and row 3 INVALID_EMAIL, each with its words",
    dup.status === 200 && dup.body?.invited?.map((i: { row: number }) => i.row).join() === "1,4" && dup.body?.flagged?.find((f: { row: number }) => f.row === 2)?.reason === "DUPLICATE_IN_FORM"
    && dup.body?.flagged?.find((f: { row: number }) => f.row === 3)?.reason === "INVALID_EMAIL" && /earlier row/.test(dup.body?.flagged?.find((f: { row: number }) => f.row === 2)?.detail ?? "") && invitations(E1) === 1 && invitations(E2) === 1, dup.body);
  for (const e of [E1, E2]) keep(e);
  // The 50-row edge on the screen.
  const FIFTY = Array.from({ length: 50 }, (_, k) => mail(`f${k + 1}`));
  limit(used() + 50);
  await openInvite(owner);
  await addRows(owner, FIFTY);
  ok("J-20 W2 (50 rows): at 50 rows the form offers no 51st and says why", (await owner.locator("[data-invite-row]").count()) === 50 && (await owner.locator("[data-add-row]").count()) === 0 && (await owner.locator("[data-invite-max]").innerText()).includes("50 people is the most in one form"));
  await shot(owner, "W2-fifty-rows-1440");
  const c50 = batchCalls.length, a50 = batchAnswer(owner);
  await owner.locator("[data-send-invites]").click();
  const b50 = await (await a50).json().catch(() => null) as { invited?: unknown[]; flagged?: { reason: string }[] } | null;
  await owner.getByLabel("Email, person 1").waitFor({ state: "detached", timeout: 60_000 }).catch(() => undefined);
  const n50 = Number(sql(`select count(*) from platform_invitation where email like 'j20-f%-${run}@sample-firm.example.com' and revoked_at is null`));
  ok("J-20 W2 (50 rows): the 50 rows go in one batch call; all 50 are invited and the panel closes", batchCalls.slice(c50).join() === "50" && n50 === 50 && (await owner.locator("[data-invite-row]").count()) === 0, { calls: batchCalls.slice(c50), n50, invited: b50?.invited?.length, flagged: b50?.flagged?.slice(0, 2) });
  for (const e of FIFTY) keep(e);
  const FIFTY_ONE = Array.from({ length: 51 }, (_, k) => ({ email: mail(`g${k + 1}`), roles: ["READ_ONLY"] }));
  limit(used() + 51);
  const r51 = await api(tR, "POST", "/platform/staff/invitations/batch", { rows: FIFTY_ONE });
  ok("J-20 W2 (51 rows, API): 51 rows are refused 422 ROWS_COUNT naming 1 to 50; nothing stored", r51.status === 422 && r51.body?.code === "ROWS_COUNT" && r51.body?.maxRows === 50
    && Number(sql(`select count(*) from platform_invitation where email like 'j20-g%-${run}@sample-firm.example.com'`)) === 0, { status: r51.status, code: r51.body?.code, detail: r51.body?.detail });

  // ========================================================== W3: a downgrade that breaks a limit is refused with the list
  const billingLink = owner.locator('[data-account-section="/settings/billing"]:visible').first();
  if (await billingLink.count()) await billingLink.click(); else await owner.goto(`${BASE}/settings/billing`);
  await owner.locator("[data-billing-summary], [data-billing-refused]").first().waitFor({ timeout: 30_000 });
  await shot(owner, "W3-plan-and-billing-1440");
  console.log(`NOTE  W3 (screen): Plan and billing shows "${(await owner.locator("[data-billing-summary] h2").innerText().catch(() => "?")).trim()}"; there is no change of plan on our own screens yet (R1.91 / PF-16's screen, not built), so the refusal's list is not walked on a screen.`);
  const target = sql(`select code || '|' || name || '|' || seats_limit from platform_plan where code = 'solo' and active`).split("|");
  const u3 = used(), changesBefore = sql(`select count(*) from platform_subscription_change where firm_id = '${A_FIRM}'`);
  const preview = await api(tR, "POST", "/platform/billing/change-plan/preview", { plan: target[0], period: "month" });
  ok("J-20 W3 (API): the change-plan preview to Solo lists what to remove (seats: used, limit, the amount)", preview.status === 200 && (preview.body?.conflicts ?? []).some((c: { metric: string; reduce: number }) => c.metric === "seats" && c.reduce === u3 - Number(target[2])), { status: preview.status, code: preview.body?.code, detail: preview.body?.detail });
  const change = await api(tR, "POST", "/platform/billing/change-plan", { plan: target[0], period: "month", prorationDate: new Date(Math.floor(Date.now() / 1000) * 1000).toISOString(), kind: "renewal", amountDueNowCents: 0 });
  ok("J-20 W3 (API): the change of plan to Solo is refused 409 DOWNGRADE_CONFLICTS listing what to remove; nothing booked", change.status === 409 && change.body?.code === "DOWNGRADE_CONFLICTS"
    && (change.body?.conflicts ?? []).some((c: { metric: string; reduce: number }) => c.metric === "seats" && c.reduce === u3 - Number(target[2])) && sql(`select count(*) from platform_subscription_change where firm_id = '${A_FIRM}'`) === changesBefore, { status: change.status, code: change.body?.code, detail: change.body?.detail });
  const solo = await outcome(() => withFirm(A_FIRM, () => bookings.book(A_FIRM, target[0], OWNER_ACTOR)));
  const seatC = (solo.body?.conflicts ?? []).find((c: { metric: string }) => c.metric === "seats");
  ok("J-20 W3 (underneath: PlanBookings.book, the route's check): the move to Solo is refused 409 DOWNGRADE_CONFLICTS listing each conflict (seats: used, limit, the amount to remove, SA-4-56's words); nothing booked",
    solo.status === 409 && solo.body?.code === "DOWNGRADE_CONFLICTS" && seatC?.used === u3 && seatC?.limit === Number(target[2]) && seatC?.reduce === u3 - Number(target[2])
    && String(solo.body?.detail ?? "").includes(`You have ${u3} staff; ${target[1]} allows ${target[2]}. Remove ${u3 - Number(target[2])} staff or choose a larger plan.`) && sql(`select count(*) from platform_subscription_change where firm_id = '${A_FIRM}'`) === changesBefore, solo.body);
  // A lower Sample plan that breaks nothing: the seats in use now, no active cases, the same storage as the firm's plan.
  limit(used() + 5);
  const lowerSeats = used(), storage = sql(`select coalesce(limit_value::text, 'null') from platform_plan_limit where plan_id = '${PLAN_ID}' and metric = 'STORAGE_MB'`);
  sql(`insert into platform_plan (id, code, name, seats_limit) values (gen_random_uuid(), '${LOWER}', 'Sample Lower (J-20)', ${lowerSeats})`);
  sql(`insert into platform_plan_limit (plan_id, metric, limit_value) select id, m::platform_limit_metric, v from platform_plan, (values ('ACTIVE_INDIVIDUAL_CASES', 0), ('ACTIVE_CORPORATE_CASES', 0), ('STORAGE_MB', ${storage})) x(m, v) where code = '${LOWER}'`);
  const fine = await outcome(() => withFirm(A_FIRM, () => bookings.book(A_FIRM, LOWER, OWNER_ACTOR)));
  const booking = fine.value as { id?: string; toPlan?: string; atOnce?: boolean; effectiveAt?: string } | undefined;
  ok("J-20 W3 (underneath): a lower plan that breaks no limit is booked for the renewal, with one audit line",
    fine.status === 200 && booking?.toPlan === LOWER && booking?.atOnce === false && new Date(booking?.effectiveAt ?? 0).getTime() > Date.now()
    && sql(`select count(*) from audit_event where action = 'plan.change.booked' and entity_key = '${booking?.id}'`) === "1", fine.status === 200 ? booking : fine.body);

  // ================================================================= W4: every gated action asks one check
  const src = (p: string) => readFileSync(join(STUDIO, "api", "src", p), "utf8");
  const identity = src("platform/identity/service.ts"), runtime = src("runtime.ts"), storageSrc = src("platform/entitlements/storage.ts"), bind = src("features/platform-entitlements.ts"), retainers = src("features/front-office-retainers.ts"), limitsSrc = src("platform/entitlements/limits.ts");
  const seatRoomBody = /private async seatRoom\([\s\S]*?\n {2}\}/.exec(identity)?.[0] ?? "";
  const LIMIT_READ = /seats_limit|seatsLimit:\s*true|platform_plan_limit|platformPlanLimit|platformPlan\./;
  ok("J-20 W4 (code): seats (single and batch invite), active cases (opening a case) and storage (a new upload) each call EntitlementPort.check on PgEntitlements, and no gate reads a limit column itself",
    /new PgEntitlements\(tx/.test(seatRoomBody) && /limits\.check\(firmId, "seats"/.test(seatRoomBody) && (identity.match(/this\.seatRoom\(/g) ?? []).length >= 2 && /inviteBatch[\s\S]*?this\.seatRoom\(tx/.test(identity)
    && /this\.entitlements\(tx\)\.check\(firm!\.key, group === "corporate" \? "active_corporate_cases" : "active_individual_cases"/.test(runtime) && /runtime\.useEntitlements\(\(tx\) => new PgEntitlements\(tx/.test(bind)
    && /new PgEntitlements\(this\.db, this\.now\)\.check\(firmId, "storage_mb"/.test(storageSrc) && /new EntitledFiles\(/.test(retainers)
    && /platform_entitlement_limit\(/.test(limitsSrc) && !LIMIT_READ.test(seatRoomBody) && !LIMIT_READ.test(/class EntitledFiles[\s\S]*$/.exec(storageSrc)?.[0] ?? "x"), { seatRoom: seatRoomBody.length });
  const cfg = await Promise.race([loading, wait(240_000).then(() => ({ status: 0, body: "timed out" }))]);
  const VV = comboId();
  ok("J-20 W4 setup: the configured checkpoint is loaded (an individual combination with a release)", !!VV, { status: cfg.status });
  const firmRt = await call("GET", "/runtime/firm", undefined, "user-O");
  const rep = (firmRt.body?.users ?? []).find((u: { duties: string[] }) => u.duties.includes("represent"))?.id ?? "user-R";
  const openCase = () => call("POST", "/runtime/cases", { combinationId: VV, clientActor: "user-P", principal: { displayName: `Sample Client J20 ${run}` }, representative: rep, caseOfficers: ["user-O"] }, "user-O");
  const W4P = mail("w4");
  const seatGate = await api(tR, "POST", "/platform/staff/invitations", { email: W4P, roles: ["READ_ONLY"] });
  const caseGate = await openCase();
  ok("J-20 W4: the one booked lower plan is read at once by both gates: the invite 409 PLAN_LIMIT_REACHED (seats, its limit) and the case 409 PLAN_LIMIT_REACHED (active individual cases, 0); nothing stored",
    seatGate.status === 409 && seatGate.body?.metric === "seats" && seatGate.body?.limit === lowerSeats && caseGate.status === 409 && caseGate.body?.code === "PLAN_LIMIT_REACHED" && caseGate.body?.metric === "active_individual_cases" && caseGate.body?.limit === 0 && invitations(W4P) === 0,
    { seat: [seatGate.status, seatGate.body?.limit, seatGate.body?.detail], case: [caseGate.status, caseGate.body?.metric, caseGate.body?.limit] });
  await team(owner);
  const line = (await owner.locator("[data-seat-line]").innerText()).trim();
  await owner.locator("[data-invite-open]").click(); await owner.getByLabel("Email, person 1").waitFor({ timeout: 15_000 });
  const formSeats = (await owner.locator("[data-invite-seats]").innerText()).trim(), warned = await owner.locator("[data-invite-seat-warning]").count();
  await shot(owner, "W4-seat-line-while-booked-1440");
  await closePanel(owner);
  ok("J-20 W4 (screen): while the lower plan is booked, Team's seat line and Invite people say the limit the gate uses (no free seat), not the plan row's",
    line.startsWith(`${lowerSeats} of ${lowerSeats} seats used`) && warned === 1, { line, formSeats, gateLimit: lowerSeats, gateWords: seatGate.body?.detail });
  const back = await outcome(() => withFirm(A_FIRM, () => bookings.withdraw(A_FIRM, OWNER_ACTOR)));
  const seatAgain = await api(tR, "POST", "/platform/staff/invitations", { email: W4P, roles: ["READ_ONLY"] });
  const caseAgain = await openCase();
  ok("J-20 W4: the booking withdrawn, both gates allow again (the invite 201, the case 201)", back.status === 200 && (seatAgain.status === 201 || seatAgain.status === 200) && caseAgain.status === 201, { withdraw: back.status, seat: seatAgain.status, case: [caseAgain.status, caseAgain.body?.detail] });
  keep(W4P);

  // ================================================================= W5: another firm and the wrong roles
  const officer = await signIn("sample-firm", O_EMAIL);
  await officer.goto(`${BASE}/platform/team`);
  await officer.locator("[data-team-refused], [data-seat-line]").first().waitFor({ timeout: 30_000 });
  ok("J-20 W5: a Case Officer opening Team by URL sees the refusal, no Invite people", (await officer.locator("[data-team-refused]").count()) === 1 && (await officer.locator("[data-invite-open]").count()) === 0
    && (await officer.locator('[data-account-section="/platform/team"]').count()) === 0);
  const tO = await pageToken(officer), tT = await localToken("sample-firm", T_EMAIL), W5P = mail("w5");
  const oBatch = await api(tO, "POST", "/platform/staff/invitations/batch", { rows: [{ email: W5P, roles: ["READ_ONLY"] }] });
  const tBatch = await api(tT, "POST", "/platform/staff/invitations/batch", { rows: [{ email: W5P, roles: ["READ_ONLY"] }] });
  const tPlan = await api(tT, "POST", "/platform/billing/change-plan/preview", { plan: "solo", period: "month" });
  const oPlan = await api(tO, "POST", "/platform/billing/change-plan", { plan: "solo", period: "month", prorationDate: new Date().toISOString(), kind: "renewal", amountDueNowCents: 0 });
  ok("J-20 W5 (API): Case Officer and Case Manager are refused the batch invite (403) and the change of plan (403); nothing stored",
    oBatch.status === 403 && tBatch.status === 403 && tPlan.status === 403 && oPlan.status === 403 && invitations(W5P) === 0, [oBatch.status, tBatch.status, tPlan.status, oPlan.status]);
  const aId = sql(`select id from platform_invitation where email = '${A}'`);
  const soloOwner = await signIn("sample-solo", S_EMAIL);
  const tS = await pageToken(soloOwner);
  const sRevoke = await api(tS, "POST", `/platform/staff/invitations/${aId}/revoke`, {});
  const sList = await api(tS, "GET", "/platform/staff/invitations");
  await soloOwner.goto(`${BASE}/platform/team?view=invited&invitation=${aId}`);
  await soloOwner.locator("[data-seat-line], [data-team-refused]").first().waitFor({ timeout: 30_000 });
  const soloSees = await soloOwner.getByText(A).count();
  const cross = await outcome(() => withFirm(B_FIRM, () => db.$transaction((tx) => checkDowngrade(tx, { files: chooseFiles({ PLATFORM_FILES: "local" }), cases: new PgCaseCount(db as never, "sample-firm") }, A_FIRM, "solo"))));
  ok("J-20 W5: the Solo firm's Owner cannot revoke or see this firm's invitation (API 404, not listed; by URL not shown), and the downgrade check refuses another firm's usage",
    sRevoke.status === 404 && !JSON.stringify(sList.body ?? "").includes(A) && soloSees === 0 && pending(A) === 1 && cross.status >= 400 && cross.status < 500, { revoke: sRevoke.status, soloSees, cross: cross.status });

  // ================================================================= W6: 400, 1024 and 1440 px
  limit(used());
  await openInvite(owner);
  await addRows(owner, [BAD, STAFF, mail("w6")]);
  const w6 = batchAnswer(owner); await owner.locator("[data-send-invites]").click(); await w6;
  await owner.locator("[data-invite-form-error]").waitFor({ timeout: 20_000 });
  for (const width of [400, 1024, 1440]) {
    await owner.setViewportSize({ width, height: 900 }); await wait(300);
    const wide = await noSideways(owner), serious = await axeSerious(owner);
    ok(`J-20 W6: at ${width} px Team with Invite people's flagged rows has no sideways scroll and axe finds no serious or critical WCAG A/AA violation`, wide && serious.length === 0, { wide, serious });
    await shot(owner, `W6-flagged-rows-${width}`);
  }
  await closePanel(owner);
  limit(used() + 5);

  // ================================================================= W7: the next step: the invited person accepts
  let link = "";
  await until(async () => {
    const r = await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(A)}`);
    const mails = r.status === 200 ? ((await r.json()) as { messages: { body: string }[] }).messages : [];
    link = /\/invitation#t=[A-Za-z0-9_-]{43}/.exec(mails.map((m) => m.body).join("\n"))?.[0] ?? "";
    return !!link;
  }, 20_000);
  ok("J-20 W7 fail (before Accept): A's invitation email carries its link and A has no staff record yet", !!link && sql(`select count(*) from platform_staff where email = '${A}'`) === "0");
  if (!link) throw new Error("STOP  no invitation link for A in the inbox");
  const a = await newPage(); await a.goto(`${BASE}${link}`);
  await a.locator("[data-accept-continue]").click();
  await a.locator("[data-staff-name]").waitFor({ timeout: 30_000 });
  ok("J-20 W7: A accepts and is signed in under the name typed on the form", (await a.locator("[data-staff-name]").innerText()).trim() === A_NAME && sql(`select display_name from platform_staff where email = '${A}'`) === A_NAME);
  await shot(a, "W7-accepted-1440");
  await owner.setViewportSize({ width: 1440, height: 900 });
  await team(owner);
  ok("J-20 W7: the walk ends at the next step: Team lists A as active staff", await owner.locator(`[data-team-row="${A}"]`).isVisible());
  ok("J-20: no page error", errors.length === 0, errors);
} finally {
  limit(PLAN_SEATS);
  await withFirm(A_FIRM, () => bookings.withdraw(A_FIRM, OWNER_ACTOR)).catch(() => undefined);
  sql(`update platform_plan set active = false where code = '${LOWER}'`);
  if (tR) for (const id of invited.filter(Boolean)) await api(tR, "POST", `/platform/staff/invitations/${id}/revoke`, {}).catch(() => undefined);
  const aStaff = sql(`select coalesce((select id::text from platform_staff where email = '${A}'), '')`);
  if (aStaff && tR) await api(tR, "POST", `/platform/staff/${aStaff}/deactivate`, { reason: "J-20 walk done" }).catch(() => undefined);
  await browser.close().catch(() => undefined);
  await db.$disconnect().catch(() => undefined);
}
process.exit(summary() ? 1 : 0);
