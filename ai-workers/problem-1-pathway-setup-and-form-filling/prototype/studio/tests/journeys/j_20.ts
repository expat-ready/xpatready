// J-20 (map row 20, R1.20: one entitlement check; seat and plan limits; downgrade check; invite many): the join-and-walk
// for the item's last part, the Invite people form on PF-4c part 1b's batch route (P-727), on an isolated copy of the
// running app (its own database and port, never :4400), at 1440 px. No j_20 was on main; written from CAPABILITIES
// R1.20's Done when: "an invite past the seat limit refused naming the limit; ... a 1-50 row invite accepts the good rows
// and names each bad row's reason".
//   W1 (screens): the Owner signs in on the card → Team → Invite people → four rows: A (named, Case Officer), B (no name,
//       Read only), C (an email already on the staff), D (an email already invited) → Send: "2 invitations sent.", A and
//       B leave the form, C and D stay, each with its own words on its own row, and the form says 2 were not invited.
//   W2 (underneath): one batch call for the whole form; A and B each one pending invitation with the roles chosen; A's
//       name stored as the invitation's display name, B none; one audit line each (batch); no invitation for C; D still
//       has exactly one.
//   W3 (fix and send again): C's email corrected, D removed → Send → invited, the panel closes.
//   W4 (the seat limit, the server's row flag): two seats left, two rows typed (the form fits: "n of n seats after these
//       invites"); someone else takes a seat before Send → the first row is invited, the second stays with the server's
//       words naming the plan and its seat count; nothing past the limit is stored.
//   W5 (the seat limit, the form's own count, PF-6 BR-2): one row more than the seats left → "Remove 1 person or
//       upgrade your plan." and Send is disabled; no batch call.
//   W6: A opens the link from the email (the demo inbox) → Accept → signed in; A's staff record carries the name typed on
//       the form. The walk ends at the next step (R1.5/R1.6): Team lists A as active.
//   DW1 (API): a single invite past the seat limit is refused 409 naming the limit, nothing stored.
// Fails on the fake (P-606): W2's judges are read before Send (no invitation for A or B), W4's before Send (no invitation
// for the second row), W6's before Accept (no staff row for A).
// Not here (their own suites, named in the PR): the downgrade check (PF-15 part 2, check_pf15_limits.ts; the plan change
// needs Stripe, not on the copy) and the case limits (PF-15c, check_pf15c_case_limits.ts).
// Sample rows only; US$0, no model call, no live mail (the local email adapter, read at GET /api/demo/platform-inbox).
// Screenshots: product/screens/J-20/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j20 4420 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j20 4420 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_20.ts j20 4420
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const [NAME, PORT] = [process.argv[2] ?? "j20", Number(process.argv[3] ?? 4420)];
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..", "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "J-20", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
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

const A = `j20-a-${run}@sample-firm.example.com`, B = `j20-b-${run}@sample-firm.example.com`, D = `j20-d-${run}@sample-firm.example.com`, C2 = `j20-c2-${run}@sample-firm.example.com`;
const A_NAME = `Client A Staff ${run}`;
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
  for (const [n, email] of [[2, B], [3, STAFF], [4, D]] as const) { await owner.locator("[data-add-row]").click(); await owner.getByLabel(`Email, person ${n}`).fill(email); }
  await tick(owner, 2, "READ_ONLY");
  ok("J-20 W1: the form counts four people against the seats", (await owner.locator("[data-send-invites]").innerText()).trim() === "Send 4 invitations");
  await shot(owner, "W1-four-rows-1440");
  // P-606: W2's judges before Send.
  ok("J-20 W2 fail (before Send): no invitation exists for A or B", invitations(A) === 0 && invitations(B) === 0);
  await owner.locator("[data-send-invites]").click();
  await owner.locator("[data-invite-form-error]").waitFor({ timeout: 20_000 });
  const toast = await owner.getByText("2 invitations sent.").count();
  const rowsLeft = await owner.locator("[data-invite-row]").count();
  const words1 = await row(owner, 1).innerText(), words2 = await row(owner, 2).innerText();
  ok("J-20 W1: Send invites the two good rows (\"2 invitations sent.\"); they leave the form and the two flagged rows stay", toast === 1 && rowsLeft === 2 && (await owner.getByLabel("Email, person 1").inputValue()) === STAFF && (await owner.getByLabel("Email, person 2").inputValue()) === D, { toast, rowsLeft });
  ok("J-20 W1: each flagged row shows its own reason on its own row (already staff; already invited)", words1.includes("This person is already on your firm's staff.") && !words1.includes("invitation") && /already (has a pending invitation|invited)/i.test(words2) && !words2.includes("already on your firm's staff"), { words1, words2 });
  ok("J-20 W1: the form says how many were not invited", (await owner.locator("[data-invite-form-error]").innerText()).includes("2 people were not invited."));
  ok("J-20 W1: each flagged row's Email field is marked invalid for screen readers", await owner.getByLabel("Email, person 1").getAttribute("aria-invalid") === "true" && await owner.getByLabel("Email, person 2").getAttribute("aria-invalid") === "true");
  const axe = await new AxeBuilder({ page: owner }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok("J-20 W1: Invite people with flagged rows: axe finds no serious or critical WCAG A/AA violation", serious.length === 0, serious.map((v) => v.id));
  await shot(owner, "W1-flagged-rows-1440");

  // ------------------------------------------------------------------------------------------------- W2: underneath
  ok("J-20 W2: the whole form was one batch call of four rows", batchCalls.filter((c) => c.page === owner).length === 1 && batchCalls[0]?.rows === 4, batchCalls.map((c) => c.rows));
  ok("J-20 W2: A and B each have one pending invitation with the roles chosen", invitations(A) === 1 && invitations(B) === 1 && sql(`select roles::text from platform_invitation where email = '${A}'`) === "{CASE_OFFICER}" && sql(`select roles::text from platform_invitation where email = '${B}'`) === "{READ_ONLY}");
  ok("J-20 W2: A's name is stored as the invitation's display name; B (no name) has none", sql(`select coalesce(display_name, 'NULL') from platform_invitation where email = '${A}'`) === A_NAME && sql(`select coalesce(display_name, 'NULL') from platform_invitation where email = '${B}'`) === "NULL");
  ok("J-20 W2: one audit line each for A and B, marked as one form", sql(`select count(*) from audit_event where action = 'platform.invitation.created' and detail->>'batch' = 'true' and entity_key in (select id::text from platform_invitation where email in ('${A}','${B}'))`) === "2");
  ok("J-20 W2: no invitation for the staff member (C); D still has exactly one", invitations(STAFF) === 0 && invitations(D) === 1);
  for (const e of [A, B]) invited.push(sql(`select id from platform_invitation where email = '${e}'`));

  // ------------------------------------------------------------------------------------------ W3: fix and send again
  await owner.getByLabel("Email, person 1").fill(C2);
  await owner.getByRole("button", { name: "Remove person 2" }).click();
  ok("J-20 W3: correcting a flagged row clears its words", !(await row(owner, 1).innerText()).includes("already on your firm's staff"));
  await owner.locator("[data-send-invites]").click();
  await until("the corrected row's invitation", () => invitations(C2) === 1);
  await owner.getByLabel("Email, person 1").waitFor({ state: "detached", timeout: 15_000 });
  invited.push(sql(`select id from platform_invitation where email = '${C2}'`));
  ok("J-20 W3: the corrected row is invited and the panel closes", invitations(C2) === 1 && (await owner.locator("[data-invite-row]").count()) === 0);

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

  // ---------------------------------------------------------------------------------- W5: the form's own count (BR-2)
  limit(used() + 1);
  await openInvite(owner);
  await owner.getByLabel("Email, person 1").fill(`j20-y1-${run}@sample-firm.example.com`); await owner.locator("[data-add-row]").click(); await owner.getByLabel("Email, person 2").fill(`j20-y2-${run}@sample-firm.example.com`);
  const callsBefore = batchCalls.length;
  await owner.locator("[data-send-invites]").click({ force: true }); await owner.waitForTimeout(500);
  ok("J-20 W5: one more row than the seats left: \"Remove 1 person or upgrade your plan.\", Send disabled, no call", (await owner.getByText("Remove 1 person or upgrade your plan.").count()) === 1 && await owner.locator("[data-send-invites]").isDisabled() && batchCalls.length === callsBefore);
  await shot(owner, "W5-over-the-limit-1440");

  // ------------------------------------------------------------------------- DW1: a single invite past the limit (API)
  limit(used());
  const Z = `j20-z-${run}@sample-firm.example.com`, over = await api("POST", "/platform/staff/invitations", { email: Z, roles: ["READ_ONLY"] });
  ok("J-20 DW1: a single invite past the seat limit is refused 409 naming the limit; nothing stored", over.status === 409 && String(over.body?.detail ?? "").includes(String(used())) && invitations(Z) === 0, { status: over.status, detail: over.body?.detail });
  limit(used() + 20);

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
  ok("J-20: no page error", errors.length === 0, errors);
} finally {
  limit(Number(plan[1]));
  for (const id of invited.filter(Boolean)) await api("POST", `/platform/staff/invitations/${id}/revoke`, {}).catch(() => undefined);
  const aId = sql(`select coalesce((select id::text from platform_staff where email = '${A}'), '')`);
  if (aId) await api("POST", `/platform/staff/${aId}/deactivate`, { reason: "J-20 walk done" }).catch(() => undefined);
  await browser.close().catch(() => undefined);
}
process.exit(summary() ? 1 : 0);
