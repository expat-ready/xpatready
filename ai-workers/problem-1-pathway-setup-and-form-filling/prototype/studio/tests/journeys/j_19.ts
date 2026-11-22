// J-19 (map row 19, R1.19: a firm is created once, with plan, trial and owner): the join-and-walk for the item, over
// PF-5 part 1 (the sign-up door and its verification, #1815), PF-5v part 2 (the sign-up mail reaches the demo inbox,
// QA-481), PF-5s part 1 (the public sign-up screens, #2608) and PF-5 part 2 (the trial end stored at sign-up, #1959), on
// an isolated copy of the running app (its own database and port, never :4400), at 1440 px. Written by the qa lane (Q9)
// because no j_19 was on main (BACKLOG J-19: "sign up → trial → first staff invite (walk to row 5)").
// Done when (CAPABILITIES R1.19, QA-483's wording): self-serve sign-up makes exactly one firm with plan, trial end and
// one Owner; the same verified email again is refused in words; firm, subscription and Owner stored as entered, with
// audit lines.
//   W1 (screens): Pricing → Yearly → Start free trial on a plan → Sign up (plan line carried) → Check your email → the link from
//       the inbox → Confirm my email: the firm key is shown.
//   W2 (underneath): exactly one firm for that email, as typed (name, country), one Owner (ACTIVE, role OWNER), one
//       TRIAL subscription on the chosen plan and period, trial end = confirmation time + the plan's trial days (± 2 min),
//       and the audit lines firm.created, platform.staff.owner_created, platform.terms.accepted,
//       platform.subscription.created (its after-values carry the plan, the period chosen (Yearly) and the same trial end).
//       PF-5 part 3 (#2870): the period is stored on platform_subscription.billing_period ('YEARLY' here), and a sign-up
//       that names no period stores the default 'MONTHLY' (W2b, by the public door).
//   W2b: a second sign-up by the public door with no period: its subscription's billing_period is 'MONTHLY'.
//   W3 (once): signing up again with the same, now verified, email answers the same "check your email" (no account
//       enumeration) and the person's inbox gets "You already have an ExpatReady account"; no second pending sign-up,
//       no second firm. A Confirm link used twice makes no second firm.
//   W4 (trial): the Owner signs in on screen with the firm key; the billing read (GET /api/platform/billing, by API with
//       the Owner's session; no billing screen is in Release 1's parts here) shows the plan, TRIAL and the stored trial end (US$0: Stripe is not set up on the copy, so Stripe's own trial end, card and Checkout are not shown).
//   W5: the walk ends at R1.5's first step: Team → Invite people opens the invite form for the new firm's Owner.
// Fails on the fake (P-606): each W2 judge is read before Confirm (no firm, no subscription, no audit line), and the W3
// inbox is read before the second sign-up (no "already" mail).
// Sample data only; US$0, no model call, no live mail (the local email adapter, read at GET /api/demo/platform-inbox).
// Screenshots: product/screens/J-19/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j19 4419 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j19 4419 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_19.ts j19 4419
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";

const NAME = process.argv[2] ?? "j19", PORT = Number(process.argv[3] ?? 4419), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-19", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
const j = async (method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const inbox = async (address: string) => ((await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).body.messages ?? []) as { subject: string; body: string }[];
const VERIFY = "Your ExpatReady verification code", ALREADY = "You already have an ExpatReady account";

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const email = `owner.j19.${run}@example.com`, firmName = `Sample Évora Firm 移民 ${run}`;
const safeSql = (q: string) => { try { return sql(q); } catch (e) { return `ERROR ${String(e).split("\n")[0].slice(0, 120)}`; } };   // a missing column (before #2870) is a FAIL, not a crash
const firmsOf = () => sql(`select count(*) from platform_firm where owner_email = '${email}'`);
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));

  // ------------------------------------------------------------------------------------------ W1: the screens, to Confirm
  await p.goto(`${BASE}/pricing`); await p.locator("[data-plan]").first().waitFor({ timeout: 20_000 });
  const plans = await p.locator("[data-plan]").evaluateAll((els) => els.map((e) => e.getAttribute("data-plan") ?? ""));
  const plan = plans.includes("team") ? "team" : plans[0];
  const trialDays = Number(sql(`select trial_days from platform_plan where code = '${plan}'`));
  ok(`R1.19 W1: Pricing lists the active plans; the chosen plan '${plan}' has a trial (${trialDays} days)`, plans.length > 0 && trialDays > 0, plans);
  await shot(p, "w1-pricing-1440");
  await p.getByRole("radio", { name: "Yearly" }).check({ force: true });
  await p.locator(`[data-start="${plan}"]`).click();
  await p.locator("[data-signup]").waitFor({ timeout: 20_000 });
  const planLine = (await p.locator("[data-signup-plan-line]").innerText()).toLowerCase();
  ok("R1.19 W1: Start free trial opens Sign up with that plan carried", planLine.includes(plan), planLine);
  const period = "YEARLY";
  ok("R1.19 W1: the period chosen on Pricing (Yearly) is carried to Sign up", planLine.includes("yearly"), planLine);
  await p.getByLabel("Work email").fill(email); await p.getByLabel("Password").fill("Correct-horse-9!"); await p.getByLabel("Firm name").fill(firmName);
  await p.locator("[data-signup-agree]").check();
  await wait(3300);   // the door's minimum fill time is 3 s; a person takes longer
  await p.locator("[data-signup-submit]").click();
  await p.locator("[data-signup-check]").waitFor({ timeout: 20_000 });
  ok("R1.19 W1: Check your email names the address as typed", (await p.locator("[data-signup-sent-to]").innerText()) === email);
  await shot(p, "w1-check-email-1440");
  let mail: { subject: string; body: string } | undefined;
  for (let i = 0; i < 75 && !mail; i++) { await wait(200); mail = (await inbox(email)).find((m) => m.subject === VERIFY); }
  const link = mail?.body.match(/\/sign-up\/verify#token=[A-Za-z0-9_-]{43}&code=\d{6}/)?.[0];
  ok("R1.19 W1: the verification email reaches the inbox with its link", !!link);
  if (!link) throw new Error("STOP  no verification link in the inbox: the rest of the walk needs it");

  // P-606: the judges of W2, before Confirm (must all be empty).
  ok("R1.19 W2 fail (before Confirm): no firm, no Owner, no subscription and no audit line exist yet for this email",
    firmsOf() === "0" && sql(`select count(*) from platform_staff where email = '${email}'`) === "0" && sql(`select count(*) from platform_subscription s join platform_firm f on f.id = s.firm_id where f.owner_email = '${email}'`) === "0" && sql(`select count(*) from audit_event where action = 'platform.staff.owner_created' and detail::text like '%${email}%'`) === "0");

  await p.goto(`${BASE}${link}`); await p.locator("[data-signup-confirm]").click();
  const confirmedAt = Date.now();
  await p.locator("[data-signup-firm-key]").waitFor({ timeout: 20_000 });
  const firmKey = (await p.locator("[data-signup-firm-key]").innerText()).trim();
  ok("R1.19 W1: Confirm my email makes the firm and shows its key", !!firmKey, firmKey);
  await shot(p, "w1-confirmed-1440");

  // ------------------------------------------------------------------------------------------ W2: stored, once, as entered
  const F = `(select id from platform_firm where key = '${firmKey}')`;
  ok("R1.19 W2: exactly one firm for the email, its name and country as entered", firmsOf() === "1" && sql(`select operating_name from platform_firm where key = '${firmKey}'`) === firmName && sql(`select country_code from platform_firm where key = '${firmKey}'`) === "CA",
    sql(`select operating_name || ' | ' || country_code || ' | ' || status from platform_firm where key = '${firmKey}'`));
  ok("R1.19 W2: exactly one Owner, active, with the email as typed", sql(`select count(*) from platform_staff where firm_id = ${F}`) === "1" && sql(`select count(*) from platform_staff where firm_id = ${F} and email = '${email}' and status = 'ACTIVE'`) === "1" && sql(`select string_agg(g.role::text, ',') from platform_role_grant g join platform_staff s on s.id = g.staff_id where g.firm_id = ${F} and g.ended_at is null and s.email = '${email}'`) === "OWNER",
    sql(`select string_agg(s.email || ':' || s.status || ':' || g.role::text, ',') from platform_staff s left join platform_role_grant g on g.staff_id = s.id and g.ended_at is null where s.firm_id = ${F}`));
  ok(`R1.19 W2: exactly one subscription, TRIAL on '${plan}'`, sql(`select count(*) from platform_subscription where firm_id = ${F}`) === "1" && sql(`select s.status || ':' || p.code from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = ${F}`) === `TRIAL:${plan}`,
    sql(`select s.status || ':' || p.code from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = ${F}`));
  const trialEnd = sql(`select coalesce((extract(epoch from trial_ends_at) * 1000)::bigint::text, '') from platform_subscription where firm_id = ${F}`);
  const expected = confirmedAt + trialDays * 86_400_000;
  ok(`R1.19 W2 (PF-5 part 2): the trial end is stored: confirmation + ${trialDays} days (± 2 min)`, !!trialEnd && Math.abs(Number(trialEnd) - expected) < 120_000, { trialEnd: trialEnd ? new Date(Number(trialEnd)).toISOString() : null, expected: new Date(expected).toISOString() });
  const actions = sql(`select string_agg(action, ',' order by action) from audit_event where firm_id = ${F} and action in ('firm.created','platform.staff.owner_created','platform.terms.accepted','platform.subscription.created')`);
  ok("R1.19 W2: one audit line each: firm.created, platform.staff.owner_created, platform.terms.accepted, platform.subscription.created", actions === "firm.created,platform.staff.owner_created,platform.subscription.created,platform.terms.accepted", actions);
  const subAfter = sql(`select coalesce(detail->>'trialEndsAt_after', '') || '|' || coalesce(detail->>'plan_after', '') || '|' || coalesce(detail->>'period_after', '') from audit_event where firm_id = ${F} and action = 'platform.subscription.created'`);
  ok("R1.19 W2: the subscription's audit line carries the plan, the period chosen (YEARLY) and the same trial end", !!trialEnd && subAfter === `${new Date(Number(trialEnd)).toISOString()}|${plan}|${period}`, subAfter);

  const storedPeriod = safeSql(`select billing_period::text from platform_subscription where firm_id = ${F}`);
  ok("R1.19 W2 (PF-5 part 3): the period chosen is stored on the subscription: billing_period = 'YEARLY'", storedPeriod === "YEARLY", storedPeriod);

  // ------------------------------------------------------------------------------------------ W2b: the Monthly default
  {
    const e2 = `monthly.j19.${run}@example.com`;
    const pub0 = await j("GET", "/api/public/plans");
    await wait(3300);
    const s2 = await j("POST", "/api/public/signup", { email: e2, password: "Correct-horse-9!", firmName: `Sample Monthly Firm ${run}`, countryCode: "CA", planCode: plan, acceptedTerms: (pub0.body.terms ?? []).map((t: { id: string }) => t.id), formStamp: pub0.body.formStamp });
    let m2: { subject: string; body: string } | undefined;
    for (let i = 0; i < 75 && !m2; i++) { await wait(200); m2 = (await inbox(e2)).find((m) => m.subject === VERIFY); }
    const l2 = m2?.body.match(/sign-up\/verify#token=([A-Za-z0-9_-]{43})&code=(\d{6})/);
    const v2 = l2 ? await j("POST", "/api/public/signup/verify", { token: l2[1], code: l2[2] }) : { status: 0, body: {} };
    const p2 = safeSql(`select coalesce(string_agg(s.billing_period::text, ','), '') from platform_subscription s join platform_firm f on f.id = s.firm_id where f.owner_email = '${e2}'`);
    ok("R1.19 W2b (PF-5 part 3): a sign-up that names no period stores the default: billing_period = 'MONTHLY'", s2.status === 202 && !!v2.body.firmKey && p2 === "MONTHLY", { signup: s2.status, verify: v2.status, period: p2 });
  }

  // ------------------------------------------------------------------------------------------ W3: the same email again
  const again = await j("POST", `/api/public/signup/verify`, { token: link.match(/token=([A-Za-z0-9_-]{43})/)?.[1], code: link.match(/code=(\d{6})/)?.[1] });
  ok("R1.19 W3 fail: the same Confirm link used again makes no second firm", again.status >= 400 && firmsOf() === "1", { status: again.status, code: again.body?.code });
  ok("R1.19 W3 fail (before the second sign-up, P-606): no 'already have an account' mail yet", !(await inbox(email)).some((m) => m.subject === ALREADY));
  const pub = await j("GET", "/api/public/plans");
  const terms: { id: string }[] = pub.body.terms ?? [];
  await wait(3300);
  const second = await j("POST", "/api/public/signup", { email, password: "Correct-horse-9!", firmName: `Second ${firmName}`, countryCode: "CA", planCode: plan, period, acceptedTerms: terms.map((t) => t.id), formStamp: pub.body.formStamp });
  let already: { subject: string; body: string } | undefined;
  for (let i = 0; i < 50 && !already; i++) { await wait(200); already = (await inbox(email)).find((m) => m.subject === ALREADY); }
  ok("R1.19 W3: signing up again with the verified email answers the same 'check your email' (no account enumeration)", second.status === 202 && second.body.status === "check-email", second.body);
  ok("R1.19 W3: the refusal reaches the person in words: 'You already have an ExpatReady account' in their inbox", !!already, already?.body.slice(0, 200));
  ok("R1.19 W3: no second pending sign-up and still exactly one firm", sql(`select count(*) from platform_signup_pending where email = '${email}' and used_at is null`) === "0" && firmsOf() === "1" && sql(`select count(*) from platform_firm where operating_name = 'Second ${firmName}'`) === "0");

  // ------------------------------------------------------------------------------------------ W4: the trial, signed in
  await p.locator("[data-signup-sign-in]").click();
  await p.getByLabel("Firm key").fill(firmKey); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 });
  ok("R1.19 W4: the Owner signs in with the firm key and is not asked to accept the terms again", (await p.locator("[data-account]").count()) === 1 && (await p.locator("[data-terms-page]").count()) === 0);
  const tok = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string);
  const bill = await j("GET", "/api/platform/billing", undefined, tok);
  ok("R1.19 W4 (PF-5 part 2): the billing read shows the plan, TRIAL and the stored trial end", bill.status === 200 && bill.body.plan?.code === plan && bill.body.status === "TRIAL" && !!trialEnd && new Date(bill.body.trialEndsAt).getTime() === Number(trialEnd), { status: bill.status, plan: bill.body.plan?.code, sub: bill.body.status, trialEndsAt: bill.body.trialEndsAt, firm: bill.body.firmStatus });
  await shot(p, "w4-signed-in-1440");

  // ------------------------------------------------------------------------------------------ W5: R1.5's first step
  await p.goto(`${BASE}/platform/team`); await p.locator("[data-seat-line]").waitFor({ timeout: 30_000 });
  await p.locator("[data-invite-open]").click();
  await p.getByLabel("Email, person 1").waitFor({ timeout: 15_000 });
  ok("R1.19 W5: the walk ends at R1.5's first step: Team → Invite people opens the invite form for the new firm's Owner", await p.getByLabel("Email, person 1").isVisible() && (await p.locator("[data-send-invites]").count()) === 1);
  await shot(p, "w5-invite-open-1440");
  ok("R1.19: no page error in the browser", errors.length === 0, errors);
  await ctx.close();
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
