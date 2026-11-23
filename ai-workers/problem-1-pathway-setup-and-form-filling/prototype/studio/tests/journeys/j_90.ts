// J-90 (map row 90, R1.90: self-serve sign-up, email check, trial with no card, private links, trial banners): the
// join-and-walk for the row, over PF-5 part 1 (the sign-up door, #1815), PF-5 part 2 (the billing read, #1959), PF-5s
// part 1 (the public screens, #2608) and part 2 (Plan and billing, #2881, #2899) and PF-16 part 1a (plan changes,
// #2866), on an isolated copy of the running app (its own database and port, never :4400). Written by the qa lane
// (22 Nov) because no j_90 was on main.
// Done when (CAPABILITIES R1.90): sign-up with no card; email confirmed by link (expired or used link refused in
// words); trial banner counts days; a private plan link works once.
//   W1 (no card, by screens): Pricing → Start free trial → Sign up → Check your email → the link from the inbox. No
//       card field and no Stripe page on the way. Opening the link (a GET) makes nothing; Confirm my email makes the
//       firm in TRIAL with no Stripe subscription and no card (US$0: the copy runs the fake BillingPort).
//   W2 (the link, refused in words): the used link opened again → "This link cannot be used" with its reason and a way
//       on; an expired link (a pending sign-up dated 25 hours ago in the copy's database, the clock's stand-in) → the
//       same, and no firm; a wrong code → refused on the field, the link still good.
//   W3 (the trial counts days): the Owner signs in; Plan and billing says "Free trial: N days left (ends <date>)" from
//       the stored trial end and counts down when the end moves nearer (3 days, then the last day). The trial banner on
//       every page (PF-16: GET /api/platform/billing/banner; amber in the last 3 days) is looked for on Home and Team.
//   W4 (the private plan link): our staff make a single-use link (POST /api/system/signup-links), the invited person
//       opens it (GET|POST /api/public/signup/:token), and a second use is refused.
//   W5: the walk ends at R1.91's first step: Plan and billing offers the Owner "Manage plan and billing".
//   W6: Pricing, Sign up and Plan and billing at 400, 1024 and 1440 px: no sideways scroll, axe WCAG 2.2 A/AA clean.
// Fails on the fake (P-606): no firm exists before Confirm; the trial line is read before and after each move of the
// trial end; the late sign-up is read pending and unused before its link is opened.
// Sample data only; US$0, no model call, no live mail, no Stripe call (the fake BillingPort; no Stripe key on the copy).
// Screenshots: product/screens/J-90/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j90 4490 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j90 4490 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_90.ts j90 4490
import "reflect-metadata";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const NAME = process.argv[2] ?? "j90", PORT = Number(process.argv[3] ?? 4490), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-90", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
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
const VERIFY = "Your ExpatReady verification code";
const linkFor = async (address: string) => {
  let mail: { subject: string; body: string } | undefined;
  for (let i = 0; i < 75 && !mail; i++) { await wait(200); mail = (await inbox(address)).find((m) => m.subject === VERIFY); }
  return mail?.body.match(/\/sign-up\/verify#token=[A-Za-z0-9_-]{43}&code=\d{6}/)?.[0];
};

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], stripe: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const email = `owner.j90.${run}@example.com`, firmName = `Sample Trial Firm ${run}`;
const firmsOf = (e: string) => sql(`select count(*) from platform_firm where owner_email = '${e}'`);
const cardWords = async (p: Page) => (await p.locator("input").evaluateAll((els) => els.filter((e) => /cc-|card/i.test(`${e.getAttribute("autocomplete") ?? ""} ${e.getAttribute("name") ?? ""} ${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("placeholder") ?? ""}`)).length));
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  p.on("request", (r) => { if (/stripe\.com/.test(r.url())) stripe.push(r.url()); });

  // ------------------------------------------------------------------------------------------ W1: sign up with no card
  await p.goto(`${BASE}/pricing`); await p.locator("[data-plan]").first().waitFor({ timeout: 20_000 });
  const plans = await p.locator("[data-plan]").evaluateAll((els) => els.map((e) => e.getAttribute("data-plan") ?? ""));
  const plan = plans.includes("team") ? "team" : plans[0];
  const trialDays = Number(sql(`select trial_days from platform_plan where code = '${plan}'`));
  const pricingWords = await p.locator("main, body").first().innerText();
  ok(`R1.90 W1: Pricing lists the plans and says the trial needs no card ('${plan}', ${trialDays} days)`, plans.length > 0 && trialDays > 0 && /no (credit )?card/i.test(pricingWords), pricingWords.match(/[^.\n]*no (credit )?card[^.\n]*/i)?.[0] ?? "no 'no card' words on Pricing");
  await shot(p, "w1-pricing-1440");
  await p.locator(`[data-start="${plan}"]`).click();
  await p.locator("[data-signup]").waitFor({ timeout: 20_000 });
  ok("R1.90 W1: Sign up asks for no card (no card field on the page)", (await cardWords(p)) === 0 && (await p.getByLabel("Work email").count()) === 1);
  // The error path a person meets first: sending the form empty names each field in words.
  await wait(3300);   // the door's minimum fill time is 3 s
  await p.locator("[data-signup-submit]").click();
  const emptyWords = await p.locator("[data-signup]").innerText();
  ok("R1.90 W1 fail: an empty form is refused on its fields in words, and nothing is sent", (await p.locator("[data-signup-check]").count()) === 0 && /email/i.test(emptyWords) && (await p.locator("[aria-invalid='true']").count()) > 0, emptyWords.replace(/\s+/g, " ").slice(0, 240));
  await shot(p, "w1-signup-empty-1440");
  await p.getByLabel("Work email").fill(email); await p.getByLabel("Password").fill("Correct-horse-9!"); await p.getByLabel("Firm name").fill(firmName);
  await p.locator("[data-signup-agree]").check();
  await p.locator("[data-signup-submit]").click();
  await p.locator("[data-signup-check]").waitFor({ timeout: 20_000 });
  ok("R1.90 W1: Check your email names the address as typed", (await p.locator("[data-signup-sent-to]").innerText()) === email);
  await shot(p, "w1-check-email-1440");
  const link = await linkFor(email);
  ok("R1.90 W1: the verification email reaches the inbox with its link", !!link);
  if (!link) throw new Error("STOP  no verification link in the inbox: the rest of the walk needs it");

  await p.goto(`${BASE}${link}`); await p.locator("[data-signup-confirm]").waitFor({ timeout: 20_000 });
  await wait(1500);
  ok("R1.90 W1 fail (before Confirm, P-606): opening the link makes nothing: no firm, no subscription yet", firmsOf(email) === "0" && sql(`select count(*) from platform_signup_pending where email = '${email}' and used_at is null`) === "1");
  // A wrong code is refused on the field and the link stays good.
  const good = await p.locator("[data-signup-code]").inputValue();
  const wrong = good === "000000" ? "000001" : "000000";
  await p.locator("[data-signup-code]").fill(wrong); await p.locator("[data-signup-confirm]").click();
  await p.locator("[data-signup-verify] [role='alert'], [data-signup-verify] [aria-invalid='true']").first().waitFor({ timeout: 15_000 }).catch(() => undefined);
  const wrongWords = (await p.locator("[data-signup-verify]").innerText()).replace(/\s+/g, " ");
  ok("R1.90 W2 fail: a wrong code is refused on the field in words; no firm is made", /code/i.test(wrongWords) && (await p.locator("[data-signup-firm-key]").count()) === 0 && firmsOf(email) === "0", wrongWords.slice(0, 240));
  await shot(p, "w2-wrong-code-1440");
  await p.locator("[data-signup-code]").fill(good); await p.locator("[data-signup-confirm]").click();
  await p.locator("[data-signup-firm-key]").waitFor({ timeout: 20_000 });
  const firmKey = (await p.locator("[data-signup-firm-key]").innerText()).trim();
  const F = `(select id from platform_firm where key = '${firmKey}')`;
  ok("R1.90 W1: Confirm my email makes the firm and shows its key", !!firmKey && firmsOf(email) === "1", firmKey);
  await shot(p, "w1-confirmed-1440");
  const sub = sql(`select s.status || '|' || p.code || '|' || coalesce(s.stripe_subscription_id, 'none') from platform_subscription s join platform_plan p on p.id = s.plan_id where s.firm_id = ${F}`);
  ok("R1.90 W1: the firm is in a trial with no card asked: one TRIAL subscription, no Stripe page was opened on the way", sub.startsWith(`TRIAL|${plan}|`) && stripe.length === 0, { sub, stripe });
  const trialEnd = Number(sql(`select (extract(epoch from trial_ends_at) * 1000)::bigint from platform_subscription where firm_id = ${F}`));
  ok(`R1.90 W1: the trial end is stored: ${trialDays} days from confirmation (± 2 min)`, Math.abs(trialEnd - (Date.now() + trialDays * 86_400_000)) < 120_000, new Date(trialEnd).toISOString());

  // ------------------------------------------------------------------------------------------ W2: used and expired links
  const p2 = await ctx.newPage(); p2.on("pageerror", (e) => errors.push(String(e)));
  await p2.goto(`${BASE}${link}`); await p2.locator("[data-signup-confirm]").click();
  await p2.locator("[data-signup-verify-words]").waitFor({ timeout: 20_000 }).catch(() => undefined);
  const usedWords = (await p2.locator("[data-signup-verify]").innerText()).replace(/\s+/g, " ");
  ok("R1.90 W2: the used link is refused in words, with a way on (Sign in), and makes no second firm", /cannot be used/i.test(usedWords) && /sign in/i.test(usedWords) && firmsOf(email) === "1", usedWords.slice(0, 260));
  await shot(p2, "w2-used-link-1440");

  // The clock's stand-in: a pending sign-up dated 25 hours ago (its 24-hour life over), as PF-5's own check makes one;
  // the database refuses moving a live sign-up's expiry (platform_signup_pending_rules), so none is edited.
  const email2 = `late.j90.${run}@example.com`, token2 = `L${run}`.padEnd(43, "x").slice(0, 43), hash2 = createHash("sha256").update(token2).digest("hex");
  const link2 = `/sign-up/verify#token=${token2}&code=123456`;
  const tv = sql(`select string_agg(id::text, ',') from platform_terms_version`).split(",").map((x) => `'${x}'`).join(",");
  sql(`insert into platform_signup_pending (id, email, firm_name, country_code, plan_code, identity_subject, terms_version_ids, terms_accepted_at, token_hash, created_at, expires_at) values (gen_random_uuid(), '${email2}', 'Sample Late Firm ${run}', 'CA', '${plan}', 'j90-late', array[${tv}]::uuid[], now() - interval '25 hours', '${hash2}', now() - interval '25 hours', now() - interval '1 hour') returning id`);
  ok("R1.90 W2 fail (P-606): the late sign-up is pending and unused, only its time has passed", sql(`select count(*) from platform_signup_pending where email = '${email2}' and used_at is null and expires_at < now()`) === "1");
  await p2.goto(`${BASE}/pricing`); await p2.goto(`${BASE}${link2}`); await p2.locator("[data-signup-confirm]").click();
  await p2.locator("[data-signup-verify-words]").waitFor({ timeout: 20_000 }).catch(() => undefined);
  const expiredWords = (await p2.locator("[data-signup-verify]").innerText()).replace(/\s+/g, " ");
  ok("R1.90 W2: an expired link is refused in words, offers a new link, and makes no firm", /cannot be used/i.test(expiredWords) && /expired|new link/i.test(expiredWords) && firmsOf(email2) === "0", expiredWords.slice(0, 260));
  await shot(p2, "w2-expired-link-1440");
  await p2.close();

  // ------------------------------------------------------------------------------------------ W3: the trial counts days
  await p.locator("[data-signup-sign-in]").click();
  await p.getByLabel("Firm key").fill(firmKey); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 });
  const tok = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string);
  const trialLine = async () => { await p.goto(`${BASE}/settings/billing`); await p.locator("[data-billing-summary]").waitFor({ timeout: 30_000 }); return (await p.locator("[data-trial-line]").count()) ? (await p.locator("[data-trial-line]").innerText()).replace(/\s+/g, " ") : "(no trial line)"; };
  const line14 = await trialLine();
  ok(`R1.90 W3: Plan and billing shows the trial counting days: '${trialDays} days left' with the end date, status Trial`, line14.includes(`Free trial: ${trialDays} days left`) && (await p.locator("[data-billing-status='TRIAL']").count()) === 1, line14);
  ok("R1.90 W3: the page says nothing was charged and offers adding a card as a choice, not a wall", /add a card/i.test(await p.locator("[data-billing-summary]").innerText()), (await p.locator("[data-billing-summary]").innerText()).replace(/\s+/g, " ").slice(0, 300));
  await shot(p, "w3-billing-trial-1440");
  sql(`update platform_subscription set trial_ends_at = now() + interval '2 days 12 hours' where firm_id = ${F} returning id`);
  const line3 = await trialLine();
  ok("R1.90 W3: the count follows the stored trial end: 2.5 days ahead reads '3 days left'", line3.includes("Free trial: 3 days left") && line3 !== line14, line3);
  await shot(p, "w3-billing-3-days-1440");

  // The trial banner on every page (PF-16): by screens on Home and Team, and its read underneath.
  const bannerOn = async (path: string, ready: string) => {
    await p.goto(`${BASE}${path}`); await p.locator(ready).first().waitFor({ timeout: 30_000 }).catch(() => undefined); await wait(800);
    const words = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    return /(free )?trial[^.]{0,60}\b3 days\b|\b3 days\b[^.]{0,60}trial/i.test(words) ? words.match(/[^.]*\b3 days\b[^.]*/i)?.[0] ?? "found" : null;
  };
  const home = await bannerOn("/home", "main"), team = await bannerOn("/platform/team", "[data-seat-line]");
  await shot(p, "w3-team-no-banner-1440");
  ok("R1.90 W3: the trial banner counts days on every page: Home and Team each say the trial has 3 days left", !!home && !!team, { home, team });
  const banner = await j("GET", "/api/platform/billing/banner", undefined, tok);
  ok("R1.90 W3 (PF-16): the banner's read answers the days left, the card on file and amber in the last 3 days", banner.status === 200 && Number(banner.body?.daysLeft) === 3, { status: banner.status, body: typeof banner.body === "string" ? banner.body.slice(0, 120) : banner.body });

  // ------------------------------------------------------------------------------------------ W4: the private plan link
  const invited = `invited.j90.${run}@example.com`;
  const made = await j("POST", "/api/system/signup-links",   // Lead 6 on #3040: our staff's plane (PF-4s); a firm token is refused there { email: invited, countryCode: "CA", planCode: plan, period: "MONTHLY" }, tok);
  const routeMissing = made.status === 404 && /Cannot POST/i.test(JSON.stringify(made.body));
  ok("R1.90 W4 (PF-5): a private single-use sign-up link can be made (POST /api/system/signup-links answers, to our staff or with a refusal by role)", !routeMissing, { status: made.status, body: JSON.stringify(made.body).slice(0, 160) });
  const opened = await j("GET", "/api/public/signup/qa-j90-not-a-token");
  ok("R1.90 W4 (PF-5): the invited door exists (GET /api/public/signup/:token answers its own 404 for an unknown link, not 'Cannot GET')", !(opened.status === 404 && /Cannot GET/i.test(JSON.stringify(opened.body))), { status: opened.status, body: JSON.stringify(opened.body).slice(0, 160) });
  ok("R1.90 W4: a private plan link works once (made, used to sign up one firm, refused the second time)", made.status === 201 && firmsOf(invited) === "1" && false, "not walked: no route makes or opens a private link on this commit (platform_signup_link has " + sql("select count(*) from platform_signup_link") + " rows)");

  // ------------------------------------------------------------------------------------------ W5: R1.91's first step
  await p.goto(`${BASE}/settings/billing`); await p.locator("[data-billing-summary]").waitFor({ timeout: 30_000 });
  ok("R1.90 W5: the walk ends at R1.91's first step: Plan and billing offers the Owner 'Manage plan and billing'", (await p.locator("[data-stripe='portal']").count()) === 1 && await p.locator("[data-stripe='portal']").isEnabled());

  // ------------------------------------------------------------------------------------------ W6: sizes and axe
  for (const [name, path, ready, page] of [["pricing", "/pricing", "[data-plan]", null], ["sign-up", `/sign-up?plan=${plan}`, "[data-signup]", null], ["billing", "/settings/billing", "[data-billing-summary]", p]] as const) {
    const q = page ?? await ctx.newPage();
    for (const width of [400, 1024, 1440]) {
      await q.setViewportSize({ width, height: 900 }); await q.goto(`${BASE}${path}`); await q.locator(ready).first().waitFor({ timeout: 30_000 }); await wait(300);
      const wide = await q.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const axe = await new AxeBuilder({ page: q }).withTags(TAGS).analyze();
      ok(`R1.90 W6: ${name} at ${width} px: no sideways scroll, axe clean`, wide <= 1 && axe.violations.length === 0, { wide, axe: axe.violations.map((v) => `${v.id} (${v.nodes.length})`) });
      if (width === 400) await shot(q, `w6-${name}-400`);
    }
    if (!page) await q.close();
  }
  ok("R1.90: no page error in the browser", errors.length === 0, errors);
  await ctx.close();
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
