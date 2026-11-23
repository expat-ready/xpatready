// J-5 part 1 (map row 5, R1.5: staff sign-in with two-step, lock-out on leaving): the join-and-walk row (BACKLOG J-5;
// shape product/screens/J-5/shape.md). It adds no feature: it walks PF-4, PF-4b and PF-6 parts 1, 2a and 2b (all on main)
// on an isolated copy of the running app (its own database and port, never :4400), on screen and through the API.
//   W1: the Owner signs in on the sign-in card → Team → Invite people (Case Officer) → the invitee opens the link from
//       the email (the demo inbox) in a second browser → Accept → signed in, their name in the header.
//   W2: one session at a time (AG-1-55): the invitee signs in on a second device and the first says "Signed in
//       elsewhere"; then the Owner's Person panel → Sign out everywhere → the second device's next click shows the
//       sign-in card; the invitee signs in again.
//   W3: the Owner deactivates them with a reason (AG-1-15) → their next click shows the sign-in card; signing in again is
//       refused on screen in words.
//   W4: the Owner reactivates them → they sign in again with the same role; the walk ends at R1.6's first step (the
//       Person panel's roles).
//   DW1: lock-out at the next request, not at expiry: the deactivated person's token, still unexpired, gets 401 on
//       /api/platform/me at once; the revocation row and the audit line (before and after) are read from the database.
//   DW2: the second step is checked: the sign-in door without it (missing or false) answers 401 TWO_STEP_REQUIRED in
//       words and no token, and the text "true" 422 naming secondStep (PF-28's input rule) and no token; the control, the same request with it, gives a working token. No fake is
//       in this path (the stand-in is the provider here), so this is a pass and its control, not a fake-to-real swap.
//   The race of a sign-in with Deactivate or Sign out everywhere (break B1, B2) is tests/check_pf4r_lockout_race.ts.
//       (The guard's own `amr` check on a token is PF-4's check_pf4_identity.ts.)
// What this cannot show (shape L2, L3): a wrong code, an expired code, repeated wrong tries and a passkey happen on the
// identity provider's own pages (concept pf-6-staff r2); they need a real Cognito pool (the live proof, C21).
// Sample rows only; US$0, no model call. Repeatable on a kept copy.
// Run from prototype/ (HEADED=1 opens a visible browser, slowed; on Linux under xvfb-run):
//   zsh studio/tools/isolated.sh j5 4405 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j5 4405 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_5.ts j5 4405
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j5", Number(process.argv[3] ?? 4405)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-5", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql } = client(PORT, DBNAME);
const run = Date.now().toString(36);
type Ans = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks

// ------------------------------------------------------------------------------------------------ setup (Sample)
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const [R_ID, R_EMAIL, R_NAME] = sql(`select id || '|' || email || '|' || display_name from platform_staff where actor_id = 'user-R'`).split("|");   // the Owner
ok("J-5 setup: the Sample firm and its Owner are seeded", !!A && !!R_ID);
const OMIT = Symbol("no secondStep field");
const signInApi = async (email: string, secondStep: unknown = true) => {
  const r = await fetch(`${BASE}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey: "sample-firm", email, ...(secondStep === OMIT ? {} : { secondStep }) }) });
  return { status: r.status, body: await r.json().catch(() => null) } as Ans;
};
const first = await signInApi(R_EMAIL);
if (!first.body?.token) { console.error(`STOP  local sign-in refused (start the copy with the header's PLATFORM_IDENTITY=local): ${first.body?.detail}`); process.exit(2); }
const api = async (t: string, method: string, path: string, body?: unknown): Promise<Ans> => {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { authorization: `Bearer ${t}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
// Seats lent for the walk (the Sample plan may be full on a kept copy), given back in the finally.
const plan = sql(`select p.id || '|' || p.seats_limit from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = '${A}' and s.status <> 'ENDED' limit 1`).split("|");

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const fresh = async (): Promise<Page> => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e))); return p;
};
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const axeOf = async (p: Page, name: string) => { const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze(); ok(`J-5 ${name}: axe finds no WCAG A/AA violation`, r.violations.length === 0, r.violations.map((v) => v.id)); };
const tokenOf = (p: Page) => p.evaluate(() => (JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}") as { token?: string }).token ?? "");
const card = (p: Page) => p.getByRole("heading", { name: "Sign in to your firm" });
/** The sign-in card, by keyboard: firm key, work email, Enter. */
async function signInOnCard(p: Page, email: string) {
  await card(p).waitFor({ timeout: 30_000 });
  await p.getByLabel("Firm key").fill("sample-firm"); await p.getByLabel("Work email").fill(email); await p.keyboard.press("Enter");
}
/** The next request: a move inside the app (My account's Profile link) makes the frame check the session again. */
async function nextClick(p: Page) { await p.locator('nav[aria-label="My account"] [data-account-section="/account"]').click({ timeout: 15_000 }); }
/** Opens a person's panel from Team (the Owner's page). */
async function openPerson(p: Page, email: string, view: "active" | "inactive" = "active") {
  await p.goto(`${BASE}/platform/team${view === "active" ? "" : `?view=${view}`}`); await p.locator("[data-seat-line]").waitFor({ timeout: 30_000 });
  await p.locator(`[data-team-row="${email}"] button`).first().click();
  await p.locator("[data-person-access]").waitFor({ timeout: 15_000 });
}
async function act(p: Page, button: string, reason?: string) {
  await p.locator(button).click();
  if (reason) await p.locator("[data-act-reason]").fill(reason);
  await p.locator("[data-act-confirm]").click();
  await p.locator("[data-act-confirm]").waitFor({ state: "detached", timeout: 15_000 });
}

const NEW = `j5-officer-${run}@sample-firm.example.com`;
let newId = "";
sql(`update platform_plan set seats_limit = ${Number(plan[1]) + 5} where id = '${plan[0]}'`);   // lent; given back first in the finally
try {
  // ---------------------------------------------------------------------------------------------- W1: invite → accept
  const owner = await fresh();
  await owner.goto(`${BASE}/account`);
  await axeOf(owner, "W1 the sign-in card");
  await shot(owner, "W1-sign-in-card-1440");
  await signInOnCard(owner, R_EMAIL);
  await owner.locator("[data-staff-name]").waitFor({ timeout: 20_000 });
  ok("J-5 W1 step 1: the Owner signs in on the sign-in card (keyboard Enter); their name is in the header", (await owner.locator("[data-staff-name]").innerText()).trim() === R_NAME);
  await owner.goto(`${BASE}/platform/team`); await owner.locator("[data-seat-line]").waitFor({ timeout: 30_000 });
  await owner.locator("[data-invite-open]").click();
  await owner.getByLabel("Email, person 1").fill(NEW);
  const row1 = owner.locator('[data-invite-row="1"]');
  if (!(await row1.locator('[data-role="CASE_OFFICER"]').isChecked())) await row1.locator('[data-role="CASE_OFFICER"]').check();
  await owner.locator("[data-send-invites]").click();
  let invId = ""; for (let i = 0; i < 100 && !invId; i++) { invId = sql(`select coalesce((select id::text from platform_invitation where email = '${NEW}'), '')`); if (!invId) await owner.waitForTimeout(100); }
  ok("J-5 W1 step 2: Team → Invite people makes one Case Officer invitation", !!invId && sql(`select roles::text from platform_invitation where id = '${invId}'`) === "{CASE_OFFICER}");
  // The email itself (demo inbox, the stand-in for a mailbox): its link opens the Accept page.
  let link = "";
  for (let i = 0; i < 150 && !link; i++) {
    const r = await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(NEW)}`);
    const mails = r.status === 200 ? ((await r.json()) as { messages: { body: string }[] }).messages : [];
    link = /\/invitation#t=[A-Za-z0-9_-]{43}/.exec(mails.map((m) => m.body).join("\n"))?.[0] ?? "";
    if (!link) await owner.waitForTimeout(200);
  }
  ok("J-5 W1 step 3: the invitation email reaches the invitee's inbox with its link", !!link);
  const dev1 = await fresh();
  await dev1.goto(`${BASE}${link}`);
  await dev1.locator("[data-accept-continue]").click();
  // PF-18h (#2635): a sign-in through the link lands on the staff Home; the walk then opens My account by its address.
  await dev1.waitForURL(/\/home$/, { timeout: 30_000 }); await dev1.locator("[data-staff-name]").waitFor({ timeout: 30_000 });
  const landedHome = new URL(dev1.url()).pathname === "/home";
  await dev1.goto(`${BASE}/account`); await dev1.locator("[data-account]", { hasText: NEW }).waitFor({ timeout: 30_000 });
  newId = sql(`select coalesce((select id::text from platform_staff where email = '${NEW}'), '')`);
  await shot(dev1, "W1-invitee-signed-in-1440");
  const shownName = (await dev1.locator("[data-staff-name]").innerText()).trim(), storedName = sql(`select coalesce(display_name, '') from platform_staff where id = '${newId}'`);
  ok("J-5 W1 step 4: the invitee accepts in a second browser and is signed in: they land on Home, My account shows them, the header shows their name as stored", !!newId && landedHome && !!shownName && shownName === storedName, { landedHome, shownName, storedName });

  // ------------------------------------------------------------------- W2: one session; sign out everywhere
  const dev2 = await fresh();
  await dev2.goto(`${BASE}/account`); await signInOnCard(dev2, NEW);
  await dev2.locator("[data-staff-name]").waitFor({ timeout: 20_000 });
  await nextClick(dev1);
  await dev1.locator("[data-signed-in-elsewhere]").waitFor({ timeout: 20_000 });
  await shot(dev1, "W2-signed-in-elsewhere-1440");
  ok("J-5 W2 step 1: signing in on a second device ends the first: its next click says \"Signed in elsewhere\" / \"You signed in on another device.\"",
    (await dev1.locator("[data-signed-in-elsewhere]").innerText()).includes("You signed in on another device."));
  await axeOf(dev1, "W2 Signed in elsewhere");
  const dev2Token = await tokenOf(dev2);
  await openPerson(owner, NEW);
  await axeOf(owner, "W2 the Person panel");
  await act(owner, "[data-sign-out-everywhere]");
  ok("J-5 W2 step 2: the Owner's Person panel → Sign out everywhere is done (one revocation row of its own)", Number(sql(`select count(*) from platform_session_revocation where staff_id = '${newId}' and reason <> 'another-device'`)) === 1);
  await nextClick(dev2);
  await card(dev2).waitFor({ timeout: 20_000 });
  const afterSignOut = await api(dev2Token, "GET", "/platform/me");
  await shot(dev2, "W2-signed-out-everywhere-1440");
  ok("J-5 W2 step 3: the second device's next click shows the sign-in card; its old token gets 401 SESSION_REVOKED", afterSignOut.status === 401 && afterSignOut.body?.code === "SESSION_REVOKED", afterSignOut.body);
  await signInOnCard(dev2, NEW);
  await dev2.locator("[data-staff-name]").waitFor({ timeout: 20_000 });
  ok("J-5 W2 step 4: they can sign in again after Sign out everywhere", (await dev2.locator("[data-staff-name]").count()) === 1);

  // ---------------------------------------------------------------------------- W3 + DW1: lock-out on leaving
  const liveToken = await tokenOf(dev2);
  const before = await api(liveToken, "GET", "/platform/me");
  const auditBefore = Number(sql(`select count(*) from audit_event where action = 'platform.staff.deactivated' and entity_key = '${newId}'`));
  await openPerson(owner, NEW);
  await act(owner, "[data-deactivate]", "J-5 walk: leaving the firm (Sample)");
  const status = sql(`select status from platform_staff where id = '${newId}'`);
  ok("J-5 W3 step 1: the Owner deactivates them with a reason; their status is DEACTIVATED", status === "DEACTIVATED", status);
  // DW1: the token was valid a moment ago and has not expired; the next request is refused at once.
  const exp = JSON.parse(Buffer.from(liveToken.split(".")[1] ?? "", "base64url").toString("utf8") || "{}").exp as number;
  const locked = await api(liveToken, "GET", "/platform/me");
  ok("J-5 DW1 pass: the deactivated person's unexpired token (200 before) gets 401 STAFF_NOT_ACTIVE at the next request, in words",
    before.status === 200 && exp * 1000 > Date.now() && locked.status === 401 && locked.body?.code === "STAFF_NOT_ACTIVE" && /deactivated/.test(String(locked.body?.detail)), { before: before.status, locked: locked.body });
  // R1.8's shape: before and after are in the line's detail as `<field>_before` / `<field>_after`.
  const audit = sql(`select coalesce((select json_build_object('actor', actor, 'before', detail->>'status_before', 'after', detail->>'status_after')::text from audit_event where action = 'platform.staff.deactivated' and entity_key = '${newId}' order by at desc limit 1), '{}')`);
  const line = JSON.parse(audit || "{}") as { actor?: string; before?: string; after?: string };
  ok("J-5 DW1: the deactivation wrote one audit line in its transaction: by the Owner, status ACTIVE → DEACTIVATED", Number(sql(`select count(*) from audit_event where action = 'platform.staff.deactivated' and entity_key = '${newId}'`)) === auditBefore + 1 && line.actor === `staff:${R_ID}` && line.before === "ACTIVE" && line.after === "DEACTIVATED", line);
  ok("J-5 DW1: a revocation row ends every session they had (signed in at or before it)", Number(sql(`select count(*) from platform_session_revocation where staff_id = '${newId}' and revoked_at >= (select last_sign_in_at from platform_staff where id = '${newId}')`)) >= 1);
  await nextClick(dev2);
  await card(dev2).waitFor({ timeout: 20_000 });
  await shot(dev2, "W3-deactivated-next-click-1440");
  // The card gives no reason here (the frame keeps only the 401's code: review m1, break B3, a follow-up for the tech
  // lead); the words come when they try to sign in (step 3).
  ok("J-5 W3 step 2: their next click shows the sign-in card (the page's work is gone)", (await dev2.locator("[data-staff-name]").count()) === 0);
  await signInOnCard(dev2, NEW);
  const refusal = dev2.locator("[data-sign-in-card]");
  await dev2.getByText("This staff account is not active. Ask your firm's Owner or Admin.").waitFor({ timeout: 20_000 });
  await shot(dev2, "W3-sign-in-refused-1440");
  ok("J-5 W3 step 3: signing in again is refused on screen: \"This staff account is not active. Ask your firm's Owner or Admin.\"", (await refusal.innerText()).includes("This staff account is not active."));
  await axeOf(dev2, "W3 the refused sign-in");
  const apiRefused = await signInApi(NEW);
  ok("J-5 W3 step 3 (API): the sign-in door answers 401 STAFF_NOT_ACTIVE and no token", apiRefused.status === 401 && apiRefused.body?.code === "STAFF_NOT_ACTIVE" && !apiRefused.body?.token, apiRefused.body);

  // ------------------------------------------------------------------------------------- W4: reactivate, back in
  await openPerson(owner, NEW, "inactive");
  await act(owner, "[data-reactivate]", "J-5 walk: back at the firm (Sample)");
  ok("J-5 W4 step 1: the Owner reactivates them; status ACTIVE", sql(`select status from platform_staff where id = '${newId}'`) === "ACTIVE");
  await dev2.getByLabel("Work email").fill(NEW); await dev2.keyboard.press("Enter");
  await dev2.locator("[data-staff-name]").waitFor({ timeout: 20_000 });
  const back = await api(await tokenOf(dev2), "GET", "/platform/me");
  const oldAfter = await api(liveToken, "GET", "/platform/me");
  ok("J-5 DW1: after reactivation the token from before the deactivation stays dead (401): only a new sign-in brings them back", oldAfter.status === 401, oldAfter.body?.code);
  ok("J-5 W4 step 2: they sign in again with the role they had (Case Officer): reactivation keeps the roles (AG-1-15)", back.status === 200 && JSON.stringify(back.body?.roles) === JSON.stringify(["CASE_OFFICER"]), back.body?.roles);
  // Ends at R1.6's first step: the Owner's Person panel, roles.
  await openPerson(owner, NEW);
  await owner.locator("[data-person-roles]").waitFor({ timeout: 15_000 });
  await shot(owner, "W4-ends-at-person-roles-1440");
  ok("J-5 W4 step 3: the walk ends at R1.6's first step, the Person panel's roles, for the reactivated person", await owner.locator("[data-person-roles]").isVisible());

  // ------------------------------------------------------------------------- DW2: the second step, real and fake
  const noStep = await signInApi(NEW, OMIT), falseStep = await signInApi(NEW, false), textStep = await signInApi(NEW, "true");
  // The text "true" is the wrong type: since PF-28's one input rule it is refused before the door as a field error
  // (422 naming secondStep, the tech lead's ruling on #2619), still in words and still with no token.
  ok("J-5 DW2 pass: the sign-in door without the second step (missing or false) answers 401 TWO_STEP_REQUIRED in words, the text \"true\" 422 naming secondStep, and no token",
    [noStep, falseStep].every((a) => a.status === 401 && a.body?.code === "TWO_STEP_REQUIRED" && /Two-step sign-in is required/.test(String(a.body?.detail)) && !a.body?.token)
      && textStep.status === 422 && !!textStep.body?.fields?.secondStep && !textStep.body?.token, [noStep.body?.code, falseStep.body?.code, `${textStep.status} ${textStep.body?.code} ${JSON.stringify(textStep.body?.fields ?? {})}`]);
  const withStep = await signInApi(NEW, true), mine = withStep.body?.token ? await api(withStep.body.token, "GET", "/platform/me") : { status: 0, body: null };
  ok("J-5 DW2 control: the same request with the second step gives a token that /me accepts as this person, so the refusal above is the second-step check and nothing else",
    withStep.status === 200 && mine.status === 200 && mine.body?.staffId === newId, [withStep.status, mine.status]);
} finally {
  // Repeatable: the lent seats go back first, then the walk's new person leaves (seat freed), whatever failed above;
  // a failed clean-up is its own FAIL line and never hides the first failure (review m3).
  sql(`update platform_plan set seats_limit = ${Number(plan[1])} where id = '${plan[0]}'`);
  let left: Ans = { status: 200, body: null };
  try {
    if (newId && sql(`select status from platform_staff where id = '${newId}'`) === "ACTIVE") left = await api((await signInApi(R_EMAIL)).body?.token as string, "POST", `/platform/staff/${newId}/deactivate`, { reason: "J-5 walk done (Sample)" });
  } catch (e) { left = { status: 0, body: String(e) }; }
  ok("J-5 clean-up: the walk's new person is deactivated and the lent seats are given back", left.status === 200 && sql(`select seats_limit from platform_plan where id = '${plan[0]}'`) === plan[1], left.status);
}
ok("J-5: no page error in the browser", errors.length === 0, errors);
await browser.close();
process.exit(summary() ? 1 : 0);
