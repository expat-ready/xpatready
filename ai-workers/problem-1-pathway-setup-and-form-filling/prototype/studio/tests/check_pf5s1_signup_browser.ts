// PF-5s part 1 (brief lead-b-briefs/PF-5s1.md; concept screens/pf-5s-saas/concept.md r2 §4 S1-S3b, BR-1 to BR-5, §7b M1,
// m2, m4, m7; R1.19, R1.100): the public sign-up pages in a real browser on an isolated copy, over PF-5's real doors on
// main (no fake API), the local identity stand-in and the demo inbox. A pass and a fail each:
//   DW1 Pricing → Start free trial (plan carried) → Sign up → Check your email → the inbox's link → Confirm: one firm,
//       its Owner and three acceptances; opening the link changes nothing until Confirm (M1); the Owner signs in; the
//       same email again → the same screen and "You already have an ExpatReady account" in the inbox.
//   DW2 the tick unticked → "Please accept the terms to continue." on the tick, no request leaves the page, nothing
//       stored; a version published while the page is open → the door refuses, the page shows its words on the tick,
//       clears the tick and lists the new version; ticked again → Check your email.
//   DW3 a wrong code → the door's words on the field and no firm; the right code then confirms; the used link again →
//       "This link has expired or was already used."; no link → "Open the link from your email again."; "Send it
//       again" waits a minute (Sample) and then sends one more email.
//   DW4 keyboard only; axe-core (no serious or critical) on every page and state; 375, 1024 and 1440 with no sideways
//       scroll; no request to any host but the app's; the password never in the address, history or storage.
//   DW5 the three paths are not App.tsx routes (APP_ROUTES), and every page opens with no page error.
// Publishes Sample terms versions (insert-only table). Wording and versions Sample; Unconfirmed: no counsel. US$0.
//   zsh studio/tools/isolated.sh screens_pf5s1 4593 start PLATFORM_IDENTITY=local && tsx studio/tests/check_pf5s1_signup_browser.ts 4593 xr_studio_screens_pf5s1
import "reflect-metadata";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4593), DBNAME = process.argv[3] ?? "xr_studio_screens_pf5s1";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-5s", "screenshots"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const TERMS_REQUIRED = "Please accept the terms to continue.";
const PASS_WORDS = "Correct-horse-pf5s1-9!";   // Sample sign-up password
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inbox = async (address: string) => ((await (await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).json()) as { messages?: { subject: string; body: string }[] }).messages ?? [];
async function mailOf(address: string, subject: string, count = 1) {
  for (let i = 0; i < 75; i++) { const m = (await inbox(address)).filter((x) => x.subject === subject); if (m.length >= count) return m; await wait(200); }
  throw new Error(`STOP  no "${subject}" (${count}) in the inbox of ${address}`);
}
const linkOf = (body: string) => { const m = body.match(/\/sign-up\/verify#token=[A-Za-z0-9_-]{43}&code=(\d{6})/); if (!m) throw new Error("STOP  no verification link in the email"); return { path: m[0], code: m[1] }; };
const VERIFY = "Your ExpatReady verification code";
const browser: Browser = await chromium.launch({ headless: !process.env.HEADED, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], hosts = new Set<string>(), urls: string[] = [];
let signupPosts = 0;
async function newPage(width = 1440): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("request", (r) => { hosts.add(new URL(r.url()).host); if (r.url().endsWith("/api/public/signup") && r.method() === "POST") signupPosts++; });
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) urls.push(f.url()); });
  return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`PF-5s1 DW4: ${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`PF-5s1 DW4: ${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const pending = (email: string) => sql(`select count(*) from platform_signup_pending where email = '${email}'`);
const firms = (email: string) => sql(`select count(*) from platform_firm where owner_email = '${email}'`);
async function fill(p: Page, email: string, firm: string) {
  await p.getByLabel("Work email").fill(email); await p.getByLabel("Password").fill(PASS_WORDS); await p.getByLabel("Firm name").fill(firm);
}
const submit = (p: Page) => p.locator("[data-signup-submit]").click();
const checkScreen = (p: Page) => p.locator("[data-signup-check]").waitFor({ timeout: 20_000 });

try {
  // ------------------------------------------------------------------------------------------- DW5: routes are the module's
  const app = readFileSync(join(STUDIO, "web", "src", "modules.tsx"), "utf8").match(/APP_ROUTES = \[([\s\S]*?)\]/)?.[1] ?? "";
  ok("PF-5s1 DW5: /pricing, /sign-up and /sign-up/verify are not App.tsx routes (APP_ROUTES)", app.length > 0 && !["\"/pricing\"", "\"/sign-up", "\"/signup"].some((s) => app.includes(s)));
  ok("PF-5s1 DW5 fail: the check reads APP_ROUTES (it holds /sign-in)", app.includes("\"/sign-in\""));

  // ----------------------------------------------------------------------------------- DW1: pricing to a confirmed firm
  const p = await newPage();
  await p.goto(`${BASE}/pricing`); await p.locator("[data-plan]").first().waitFor({ timeout: 20_000 });
  const planCodes = await p.locator("[data-plan]").evaluateAll((els) => els.map((e) => e.getAttribute("data-plan")));
  const active = sql("select string_agg(code, ',' order by seats_limit) from platform_plan where active");
  ok("PF-5s1 DW1 (BR-1): Pricing shows the active plans from GET /api/public/plans, each with its trial and 'no card needed'", planCodes.join(",") === active && (await p.locator("[data-plan]", { hasText: "no card needed" }).count()) === planCodes.length, { planCodes, active });
  const filled = await p.locator("[data-start]").evaluateAll((els) => els.map((e) => e.className.includes("bg-primary ")));
  ok("PF-5s1 DW1 (m2): one filled Start free trial button (the middle plan), the others outlined", filled.filter(Boolean).length === 1 && filled[Math.floor((filled.length - 1) / 2)], filled);
  const pricesShown = await p.locator("[data-price]").count(), missing = await p.locator("[data-price-missing]").count();
  ok("PF-5s1 DW1 fail (BR-1): every plan shows its price or \"Price not shown\", never both or neither", pricesShown + missing === planCodes.length, { pricesShown, missing });
  await axe("Pricing", p); await shot(p, "s1-pricing-1440");
  // ------------------------------------------------- R1.89 QA-741, QA-742: the price and the trial line, from the plan table
  {
    const q = await newPage();
    const card = async (code: string) => { const c = q.locator(`[data-plan="${code}"]`); return { price: await c.locator("[data-price]").count() ? await c.locator("[data-price]").innerText() : null, text: await c.innerText(), start: await c.locator("[data-start]").innerText() }; };
    const load = async () => { await q.goto(`${BASE}/pricing`); await q.locator("[data-plan]").first().waitFor({ timeout: 20_000 }); };
    const cad = (cents: string) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: Number(cents) % 100 ? 2 : 0 }).format(Number(cents) / 100);
    const [m, y] = sql("select monthly_price_cents || ',' || yearly_price_cents from platform_plan where code = 'solo'").split(",");
    try {
      sql("update platform_plan set monthly_price_cents = null, yearly_price_cents = null where code = 'team'; update platform_plan set trial_days = 0 where code = 'firm'");
      await load();
      const soloM = await card("solo"), teamM = await card("team"), firm = await card("firm");
      await q.getByRole("radio", { name: "Yearly" }).check({ force: true });
      const soloY = await card("solo"), teamY = await card("team");
      ok(`R1.89 QA-741 pass: a plan with cents in the plan table shows that price (solo: ${cad(m)} per month, ${cad(y)} per year, CAD, "+ applicable taxes"; Sample)`,
        Number(m) > 0 && soloM.price === cad(m) && /per month, CAD/.test(soloM.text) && soloM.text.includes("+ applicable taxes") && soloY.price === cad(y) && /per year, CAD/.test(soloY.text) && await q.locator("[data-prices-unavailable]").count() === 0, { soloM, soloY });
      const digits = (t: string) => (t.match(/\d+/g) ?? []).filter((d) => !["5", "14"].includes(d));   // team's own seats and trial days
      ok("R1.89 QA-741 fail: a plan with no cents shows no price and no other digit, Monthly or Yearly (team: \"Price not shown\")",
        teamM.price === null && teamY.price === null && teamM.text.includes("Price not shown") && digits(teamM.text).length === 0 && digits(teamY.text).length === 0, { teamM, teamY });
      ok("R1.89 QA-742 fail: a plan with 0 trial days is not offered as a free trial (no trial line, the button reads \"Sign up\", the page's lead does not say every plan has one)",
        !/free trial/i.test(firm.text) && !/0-day/.test(firm.text) && firm.start === "Sign up" && !(await q.locator("[data-pricing] > p").first().innerText()).includes("Every plan starts with a free trial"), firm);
      ok("R1.89 QA-742 pass: a plan with trial days keeps its trial line and button (solo: 14-day free trial, Start free trial)", soloM.text.includes("14-day free trial · no card needed") && soloM.start === "Start free trial", soloM);
      await q.locator('[data-start="firm"]').click(); await q.locator("[data-signup-submit]").waitFor({ timeout: 20_000 });
      const zero = await q.locator("[data-signup]").innerText();
      ok("R1.89 QA-742 fail: Sign up for the 0-day plan says neither \"0 days free\" nor \"free trial\" (heading and button read \"Sign up\")", !/0 days free/.test(zero) && !/free trial/i.test(zero) && (await q.locator("[data-signup-submit]").innerText()) === "Sign up", zero);
    } finally {
      sql(`update platform_plan set monthly_price_cents = 9900, yearly_price_cents = 99000 where code = 'team'; update platform_plan set trial_days = 14 where code = 'firm'`);
      await q.close();
    }
  }
  await p.getByRole("radio", { name: "Yearly" }).check({ force: true });
  await p.locator('[data-start="team"]').click();
  await p.locator("[data-signup]").waitFor({ timeout: 20_000 });
  ok("PF-5s1 DW1 (BR-1, m7): Start free trial opens Sign up with that plan and period carried", (await p.locator("[data-signup-plan-line]").innerText()).toLowerCase().includes("team") && (await p.locator("[data-signup-plan-line]").innerText()).includes("yearly"), await p.locator("[data-signup-plan-line]").innerText());
  ok("PF-5s1 DW1 (BR-2): Canada is shown fixed with 'can't be changed later'; no web address, address or card asked", (await p.locator("[data-signup-country]").innerText()) === "Canada" && (await p.getByText("can't be changed later").count()) === 1 && (await p.locator("[data-signup] form > div:not([aria-hidden]) input:not([type=checkbox])").count()) === 3);
  const termLinks = await p.locator("[data-signup-term]").allInnerTexts();
  const current = sql("select string_agg(version, ',') from (select distinct on (kind) kind, version from platform_terms_version where published_at <= now() order by kind, published_at desc) v");
  ok("PF-5s1 DW1 (BR-3): one tick names the three current versions, each a link", (await p.locator("[data-signup-agree]").count()) === 1 && termLinks.length === 3 && current.split(",").every((v) => termLinks.some((t) => t.includes(v))) && (await p.locator("[data-signup-term] a[href]").count()) === 3, termLinks);
  await p.locator("[data-signup-plan-change]").click();
  await p.getByLabel("Choose a plan").selectOption("team"); await p.getByLabel("Billing").selectOption("MONTHLY"); await p.getByRole("button", { name: "Done" }).click();
  ok("PF-5s1 DW1 (m7): Change is an in-place picker; the plan line follows it", (await p.locator("[data-signup-plan-line]").innerText()).includes("monthly"));
  const email = `owner.pf5s1.${run}@example.com`;
  await fill(p, email, `Sample Screens Firm ${run}`);
  await p.locator("[data-signup-agree]").check();
  await axe("Sign up (filled)", p); await shot(p, "s2-sign-up-filled-1440");
  await submit(p); await checkScreen(p);
  ok("PF-5s1 DW1 (BR-4, m4): Check your email names the address as typed", (await p.locator("[data-signup-sent-to]").innerText()) === email);
  await axe("Check your email", p); await shot(p, "s3-check-your-email-1440");
  const mail = (await mailOf(email, VERIFY))[0], link = linkOf(mail.body);
  ok("PF-5s1 DW1: no firm exists before the confirmation", firms(email) === "0" && pending(email) === "1");
  await p.goto(`${BASE}${link.path}`); await p.locator('[data-signup-verify="form"]').waitFor({ timeout: 20_000 });
  ok("PF-5s1 DW1 (M1): the link opens Confirm with the code filled in; the token is taken out of the address", (await p.locator("[data-signup-code]").inputValue()) === link.code && !p.url().includes("#") && !p.url().includes("token"), p.url());
  await wait(500);
  ok("PF-5s1 DW1 fail (M1): opening the link changes nothing: still no firm until Confirm my email", firms(email) === "0");
  await axe("Confirm (form)", p); await shot(p, "s3b-confirm-1440");
  await p.locator("[data-signup-confirm]").click(); await p.locator('[data-signup-verify="done"]').waitFor({ timeout: 20_000 });
  const firmKey = (await p.locator("[data-signup-firm-key]").innerText()).trim();
  const stored = sql(`select count(*) from platform_terms_acceptance a join platform_firm f on f.id = a.firm_id join platform_staff s on s.id = a.staff_id where f.key = '${firmKey}' and s.email = '${email}'`);
  ok("PF-5s1 DW1 (R1.19, R1.100): Confirm makes one firm and its Owner, and stores the acceptance of the three versions; the firm key is shown", firms(email) === "1" && !!firmKey && sql(`select owner_email from platform_firm where key = '${firmKey}'`) === email && stored === "3", { firmKey, stored });
  await axe("Confirm (done)", p); await shot(p, "s3b-confirmed-1440");
  await p.locator("[data-signup-sign-in]").click();
  await p.locator("[data-sign-in-card]").waitFor({ timeout: 20_000 });
  await p.getByLabel("Firm key").fill(firmKey); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
  await p.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 });
  ok("PF-5s1 DW1: the Owner lands on the sign-in and signs in; the terms accepted at sign-up are not asked again", (await p.locator("[data-account]").count()) === 1 && (await p.locator("[data-terms-page]").count()) === 0);
  await shot(p, "s4-signed-in-1440");
  const p2 = await newPage();
  await p2.goto(`${BASE}/sign-up`); await p2.locator("[data-signup-agree]").waitFor({ timeout: 20_000 });
  await fill(p2, email, `Sample Screens Firm again ${run}`); await p2.locator("[data-signup-agree]").check(); await submit(p2); await checkScreen(p2);
  await mailOf(email, "You already have an ExpatReady account");
  ok("PF-5s1 DW1 (G7): the same email again → the same Check your email screen, and the inbox gets 'You already have an ExpatReady account'; still one firm", firms(email) === "1");

  // ------------------------------------------------------------------------------------------------- DW2: the terms tick
  const e2 = `owner2.pf5s1.${run}@example.com`;
  const q = await newPage();
  await q.goto(`${BASE}/sign-up`); await q.locator("[data-signup-agree]").waitFor({ timeout: 20_000 });
  await fill(q, e2, `Sample Unticked Firm ${run}`);
  const before = signupPosts;
  await submit(q); await q.locator("[data-signup-terms-error]").waitFor({ timeout: 10_000 });
  await wait(4000);
  ok("PF-5s1 DW2 fail (BR-3, R1.100): the tick unticked → 'Please accept the terms to continue.' on the tick and in the summary; no sign-up request leaves the page; nothing stored, nothing sent",
    (await q.locator("[data-signup-terms-error]").innerText()) === TERMS_REQUIRED && (await q.locator("[data-signup-summary]").innerText()).includes(TERMS_REQUIRED) && signupPosts === before && pending(e2) === "0" && (await inbox(e2)).length === 0 && (await q.locator("[data-signup-check]").count()) === 0);
  ok("PF-5s1 DW2: the answers typed are kept", (await q.getByLabel("Work email").inputValue()) === e2 && (await q.getByLabel("Password").inputValue()) === PASS_WORDS);
  await axe("Sign up (terms refused)", q); await shot(q, "s2-terms-refused-1440");
  const v2 = `sample-pf5s1-${run}`;
  sql(`insert into platform_terms_version (id, kind, version, url, published_at) values (gen_random_uuid(), 'PRIVACY_NOTICE', '${v2}', 'https://example.com/sample-privacy/${run}', now() - interval '1 second') returning id`);
  await q.locator("[data-signup-agree]").check(); await submit(q);
  await q.locator("[data-signup-terms-error]").waitFor({ timeout: 20_000 });
  await q.locator(`[data-signup-term="PRIVACY_NOTICE"]:has-text("${v2}")`).waitFor({ timeout: 10_000 });
  ok("PF-5s1 DW2 fail (R1.100: the current versions): a version published while the page is open → the door refuses; the tick shows its words and is cleared, and the new version is listed; nothing stored",
    (await q.locator("[data-signup-terms-error]").innerText()).startsWith("Accept the current terms") && !(await q.locator("[data-signup-agree]").isChecked()) && signupPosts === before + 1 && pending(e2) === "0", await q.locator("[data-signup-terms-error]").innerText());
  await q.locator("[data-signup-agree]").check(); await submit(q); await checkScreen(q);
  await mailOf(e2, VERIFY);
  ok("PF-5s1 DW2: ticked again → Check your email; the pending sign-up holds the new version", sql(`select count(*) from platform_signup_pending p join platform_terms_version v on v.id = any(p.terms_version_ids) where p.email = '${e2}' and p.used_at is null and v.version = '${v2}'`) === "1");

  // ------------------------------------------------------------------------------ DW3: wrong code, dead link, send again
  const resend = q.locator("[data-signup-resend]");
  ok("PF-5s1 DW3 fail (BR-4): Send it again waits a minute (Sample)", await resend.isDisabled());
  const l2 = linkOf((await mailOf(e2, VERIFY))[0].body);
  const r = await newPage();
  await r.goto(`${BASE}${l2.path.replace(/code=\d{6}/, `code=${l2.code === "000000" ? "111111" : "000000"}`)}`); await r.locator('[data-signup-verify="form"]').waitFor({ timeout: 20_000 });
  await r.locator("[data-signup-confirm]").click();
  await r.getByText("That code is not the one we sent").waitFor({ timeout: 20_000 });
  ok("PF-5s1 DW3 fail (BR-5): a wrong code → the door's words on the field; no firm", firms(e2) === "0" && (await r.locator("[data-signup-code]").getAttribute("aria-invalid")) === "true");
  await axe("Confirm (wrong code)", r); await shot(r, "s3b-wrong-code-1440");
  await r.locator("[data-signup-code]").fill(l2.code); await r.locator("[data-signup-confirm]").click(); await r.locator('[data-signup-verify="done"]').waitFor({ timeout: 20_000 });
  ok("PF-5s1 DW3: the right code then confirms: one firm", firms(e2) === "1");
  const d = await newPage();
  await d.goto(`${BASE}${l2.path}`); await d.locator("[data-signup-confirm]").click(); await d.locator('[data-signup-verify="closed"]').waitFor({ timeout: 20_000 });
  ok("PF-5s1 DW3 fail (BR-5): the used link again → 'This link has expired or was already used.' with Send a new link and Sign in", (await d.locator("[data-signup-verify-words]").innerText()) === "This link has expired or was already used." && (await d.getByRole("link", { name: "Already confirmed? Sign in" }).count()) === 1);
  await axe("Confirm (link used)", d); await shot(d, "s3b-link-used-1440");
  await d.goto(`${BASE}/sign-up/verify`); await d.locator('[data-signup-verify="closed"]').waitFor({ timeout: 20_000 });
  ok("PF-5s1 DW3 fail: no link in the address → 'Open the link from your email again.' and nothing is sent", (await d.locator("[data-signup-verify-words]").innerText()) === "Open the link from your email again.");
  // Send it again on a third person (the second one is confirmed now): one more email after the minute.
  const e3 = `owner3.pf5s1.${run}@example.com`;
  const s = await newPage();
  await s.goto(`${BASE}/sign-up`); await s.locator("[data-signup-agree]").waitFor({ timeout: 20_000 });
  await fill(s, e3, `Sample Resend Firm ${run}`); await s.locator("[data-signup-agree]").check(); await submit(s); await checkScreen(s);
  await mailOf(e3, VERIFY);
  await s.locator("[data-signup-resend]:not([disabled])").waitFor({ timeout: 75_000 });
  await s.locator("[data-signup-resend]").click();
  await mailOf(e3, VERIFY, 2);
  ok("PF-5s1 DW3 (BR-4): after the minute, Send it again sends one more email; still one live pending sign-up", (await inbox(e3)).filter((m) => m.subject === VERIFY).length === 2 && sql(`select count(*) from platform_signup_pending where email = '${e3}' and used_at is null`) === "1");
  await s.locator("[data-signup-start-again]").click(); await s.locator("[data-signup]").waitFor({ timeout: 10_000 });
  ok("PF-5s1 DW3: Wrong email? Start again → the form with the answers kept and the tick cleared", (await s.getByLabel("Work email").inputValue()) === e3 && !(await s.locator("[data-signup-agree]").isChecked()));

  // ------------------------------------------------------------------------------------- DW4: keyboard, widths, hosts
  // The page moves focus to the error summary one animation frame after a refusal (signup-page.tsx focusSummary). On a
  // busy runner that frame can land after the step has tabbed on, taking the Space or Enter meant for the tick or the
  // button (#3040's batch, shard 4, job 138117798714; #3065). `holdFrame` reproduces the worst case: once armed, the
  // page's animation frames wait and run just before the next key pressed on the tick or the button (else after 1.5 s),
  // so the summary takes focus from under that key. A string, not a function: tsx's compiled functions call a helper
  // (__name) the page does not have.
  const holdFrame = `(() => {
    const raf = window.requestAnimationFrame.bind(window), held = [];
    let armed = false;
    const release = () => { if (!armed) return; armed = false; for (const cb of held.splice(0)) cb(performance.now()); };
    window.requestAnimationFrame = (cb) => (armed ? (held.push(cb), 0) : raf(cb));
    document.addEventListener("keydown", (e) => { if (armed && e.target && e.target.matches && e.target.matches("[data-signup-agree], [data-signup-submit]")) release(); }, true);
    window.__pf5s1Arm = () => { armed = true; setTimeout(release, 1500); };
  })();`;
  const keyboardSignUp = async (k: Page, email: string, held: boolean) => {
    if (held) await k.addInitScript({ content: holdFrame });
    await k.goto(`${BASE}/sign-up`); await k.locator("[data-signup-agree]").waitFor({ timeout: 20_000 });
    await k.keyboard.press("Tab");
    for (let i = 0; i < 40 && !(await k.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type === "email")); i++) await k.keyboard.press("Tab");
    await k.keyboard.type(email); await k.keyboard.press("Tab"); await k.keyboard.type(PASS_WORDS); await k.keyboard.press("Tab"); await k.keyboard.type(`Sample Keyboard Firm ${run}`);
    const tabTo = async (sel: string) => { for (let i = 0; i < 30 && !(await k.evaluate((x) => !!document.activeElement?.matches(x), sel)); i++) await k.keyboard.press("Tab"); };
    if (held) await k.evaluate(() => (window as unknown as { __pf5s1Arm: () => void }).__pf5s1Arm());
    await k.keyboard.press("Enter");   // from the firm name: the form is sent, the tick still unticked
    await k.locator("[data-signup-terms-error]").waitFor({ timeout: 10_000 });
    await tabTo("[data-signup-agree]"); await k.keyboard.press("Space");
    await tabTo("[data-signup-submit]"); await k.keyboard.press("Enter");
    await checkScreen(k);
    return (await k.locator("[data-signup-sent-to]").innerText()) === email;
  };
  const e4 = `owner4.pf5s1.${run}@example.com`, e4h = `owner4h.pf5s1.${run}@example.com`;
  const k = await newPage();
  ok("PF-5s1 DW4: keyboard only: Tab to each field, Enter refuses with the tick unticked, Space ticks, Enter sends", await keyboardSignUp(k, e4, false));
  ok("PF-5s1 DW4 fail (#3040 shard 4): the same, when the page's focus move to the summary lands just as the tick has focus (a slow frame)", await keyboardSignUp(await newPage(), e4h, true).catch((x: Error) => { console.log(`  held-frame run: ${String(x.message).split("\n")[0]}`); return false; }));
  for (const width of [375, 1024]) {
    const w = await newPage(width);
    for (const [name, path, ready] of [["Pricing", "/pricing", "[data-plan]"], ["Sign up", "/sign-up", "[data-signup-agree]"]] as const) {
      await w.goto(`${BASE}${path}`); await w.locator(ready).first().waitFor({ timeout: 20_000 });
      await noSideways(`${name} at ${width} px`, w); await shot(w, `${path.slice(1)}-${width}`);
    }
    await w.locator("[data-signup-submit]").click(); await w.locator("[data-signup-terms-error]").waitFor({ timeout: 10_000 });
    await noSideways(`Sign up (refused) at ${width} px`, w); await axe(`Sign up (refused) at ${width} px`, w);
  }
  await noSideways("Pricing at 1440 px", (await (async () => { const w = await newPage(); await w.goto(`${BASE}/pricing`); await w.locator("[data-plan]").first().waitFor(); return w; })()));
  ok("PF-5s1 DW4: no request to any host but the app's", [...hosts].every((h) => h === `localhost:${PORT}`), [...hosts]);
  const stores = await p.evaluate(() => JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage }));
  ok("PF-5s1 DW4 fail: the password is never in an address the browser visited, nor in its storage", !urls.some((u) => u.includes(encodeURIComponent(PASS_WORDS)) || u.includes(PASS_WORDS)) && !stores.includes(PASS_WORDS));
  ok("PF-5s1 DW5: no page error on any page", errors.length === 0, errors);
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
