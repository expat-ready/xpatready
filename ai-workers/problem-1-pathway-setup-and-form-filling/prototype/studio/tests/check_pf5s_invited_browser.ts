// PF-5s S8 invited sign-up (concept screens/pf-5s-saas/concept.md r2 §4 S8, BR-13, §5, §7b m8; R1.90 "a private plan
// link works once"): the page our staff's private link opens, in a real browser on an isolated copy, over PF-5's real
// doors (#3040: POST /api/system/signup-links, GET|POST /api/public/signup/:token), the local identity stand-ins, the
// demo inbox and the fake BillingPort. A pass and a fail each:
//   IV1 pass: our staff make a link; the invited person opens it: the token leaves the address before anything is sent,
//       the email, Canada, the plan and the period are shown fixed (no email input, no plan picker); password, firm name
//       and the tick → Check your email naming the link's email → the inbox's link → Confirm → one firm in TRIAL on the
//       link's plan and period, the link used with its firm. Opening the page made nothing.
//   IV2 fail on the form: the tick unticked and the password short → the words on each field and in the summary, no
//       POST leaves the page, nothing stored.
//   IV3 the dead link, one page for all four: used (IV1's link again), expired (a link dated past its 14 days in the
//       copy's database, the clock's stand-in), malformed (#token=abc, and a 43-character token with a dot) and no token
//       → "This sign-up link doesn't work…", "reply to the invitation email", "Already set up? Sign in"; no firm.
//   IV4 a link that dies between opening and sending (marked expired in the database) → the dead page, no pending row.
//   IV5 1280 and 375 px: no sideways scroll, axe (WCAG 2.2 A/AA, no serious or critical) on the form, the refused form,
//       Check your email and the dead page; keyboard only from the password to Check your email; no page error; no
//       request to any host but the app's; the password never in an address or in storage.
// Sample data only; US$0, no model call, no live mail, no Stripe call. Screenshots: product/screens/PF-5s/screenshots-invited/.
//   zsh studio/tools/isolated.sh screens_pf5si 4611 start PLATFORM_IDENTITY=local PLATFORM_SYSTEM_IDENTITY=local && tsx studio/tests/check_pf5s_invited_browser.ts 4611 xr_studio_screens_pf5si
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { client, recorder } from "./runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");
const PORT = Number(process.argv[2] ?? 4611), DBNAME = process.argv[3] ?? "xr_studio_screens_pf5si";
const BASE = `http://localhost:${PORT}`, STUDIO = join(import.meta.dirname, "..");
const SHOTS = join(STUDIO, "..", "..", "product", "screens", "PF-5s", "screenshots-invited"); mkdirSync(SHOTS, { recursive: true });
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const DEAD = "This sign-up link doesn't work. It may have been used or expired. Ask us for a new one.";
const TERMS_REQUIRED = "Please accept the terms to continue.";
const PASS_WORDS = "Correct-horse-pf5si-9!";   // Sample sign-up password
const VERIFY = "Your ExpatReady verification code";
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other checks
const j = async (method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; body: any }> => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const inbox = async (address: string) => ((await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).body?.messages ?? []) as { subject: string; body: string }[];
async function verifyLink(address: string) {
  for (let i = 0; i < 75; i++) { const m = (await inbox(address)).find((x) => x.subject === VERIFY)?.body.match(/\/sign-up\/verify#token=[A-Za-z0-9_-]{43}&code=\d{6}/)?.[0]; if (m) return m; await wait(200); }
  throw new Error(`STOP  no "${VERIFY}" in the inbox of ${address}`);
}
const firms = (email: string) => sql(`select count(*) from platform_firm where owner_email = '${email}'`);
const pending = (email: string) => sql(`select count(*) from platform_signup_pending where email = '${email}'`);
const browser: Browser = await chromium.launch({ headless: !process.env.HEADED, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [], hosts = new Set<string>(), urls: string[] = [];
let posts = 0;
async function newPage(width = 1280): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light", reducedMotion: "reduce" }), p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("request", (r) => { hosts.add(new URL(r.url()).host); if (/\/api\/public\/signup\/[^/]+$/.test(r.url()) && r.method() === "POST") posts++; });
  p.on("framenavigated", (f) => { if (f === p.mainFrame()) urls.push(f.url()); });
  return p;
}
const axe = async (name: string, p: Page) => { const r = await new AxeBuilder({ page: p }).withTags(TAGS).analyze();
  const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`PF-5s S8 IV5: ${name}: axe finds no serious or critical WCAG A/AA violation`, bad.length === 0, bad.map((v) => `${v.id}: ${v.nodes[0]?.target?.join(" ")}`).join(" | ") || undefined); };
const noSideways = async (name: string, p: Page) => ok(`PF-5s S8 IV5: ${name}: no sideways page scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const form = (p: Page) => p.locator("[data-invited='form']").waitFor({ timeout: 20_000 });
const dead = (p: Page) => p.locator("[data-invited='gone']").waitFor({ timeout: 20_000 });

try {
  // Our staff: a Platform Owner on the local stand-in (PF-4s), as check_r190_invited_signup.ts does.
  const staffEmail = `pf5si-owner-${run}@expatready.example`;
  const staffId = sql(`insert into plat_system_staff (id, email, display_name) values (gen_random_uuid(), '${staffEmail}', 'Sample Owner ${run}') returning id`);
  sql(`insert into plat_system_role_grant (id, staff_id, role_code) values (gen_random_uuid(), '${staffId}', 'platform-owner') returning id`);
  const session = await j("POST", "/api/system/session/local", { email: staffEmail, secondStep: true });
  if (session.status !== 200 || !session.body?.token) throw new Error(`STOP  our staff's local sign-in refused (start the copy with PLATFORM_SYSTEM_IDENTITY=local): ${JSON.stringify(session.body).slice(0, 200)}`);
  const PLAN = sql("select code from platform_plan where active and trial_days > 0 order by code limit 1"), PLAN_NAME = sql(`select name from platform_plan where code = '${PLAN}'`);
  const makeLink = async (email: string) => {
    const r = await j("POST", "/api/system/signup-links", { email, countryCode: "CA", planCode: PLAN, period: "YEARLY", reason: "Sales-led firm (Sample)" }, session.body.token);
    const link = String(r.body?.link ?? ""), path = link.match(/\/sign-up\/invited#token=[A-Za-z0-9_-]{43}$/)?.[0];
    if (r.status !== 201 || !path) throw new Error(`STOP  no link made: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    return { path, id: String(r.body.id) };
  };

  // ------------------------------------------------------------------------------------------ IV2: refused on the form
  const e2 = `invited2.pf5si.${run}@example.com`, l2 = await makeLink(e2);
  const q = await newPage();
  await q.goto(`${BASE}${l2.path}`); await form(q);
  const before = posts;
  await q.getByLabel("Password").fill("short"); await q.getByLabel("Firm name").fill(`Sample Refused Firm ${run}`);
  await q.locator("[data-signup-submit]").click(); await q.locator("[data-signup-terms-error]").waitFor({ timeout: 10_000 });
  const sum2 = await q.locator("[data-signup-summary]").innerText();
  ok("PF-5s S8 IV2 fail (BR-3): the tick unticked and a short password → the words on each field and in the summary, each summary line naming its field (break m4); no POST leaves the page; nothing stored",
    (await q.locator("[data-signup-terms-error]").innerText()) === TERMS_REQUIRED && sum2.includes(TERMS_REQUIRED) && sum2.includes("Password: At least 12 characters.") && sum2.includes(`Terms: ${TERMS_REQUIRED}`) && posts === before && pending(e2) === "0" && firms(e2) === "0", { sum2, posts: posts - before });
  await shot(q, "iv2-refused-1280"); await axe("the refused form at 1280 px", q); await noSideways("the refused form at 1280 px", q);

  // ------------------------------------------------------------------------------------------ IV1: the link signs up once
  const e1 = `invited1.pf5si.${run}@example.com`, l1 = await makeLink(e1);
  const p = await newPage();
  await p.goto(`${BASE}${l1.path}`); await form(p);
  ok("PF-5s S8 IV1: the token leaves the address before anything is sent (no #token in the page's address)", !p.url().includes("token="), p.url());
  ok("PF-5s S8 IV1 (BR-13): the link's email, Canada, the plan and the period are shown fixed: no email input, no plan picker",
    (await p.locator("[data-invited-email]").innerText()) === e1 && (await p.locator("[data-signup-country]").innerText()) === "Canada" && (await p.locator("[data-invited-plan]").innerText()) === `${PLAN_NAME}, yearly`
      && (await p.getByLabel("Work email").count()) === 0 && (await p.locator("select").count()) === 0, { plan: await p.locator("[data-invited-plan]").innerText() });
  ok("PF-5s S8 IV1 fail: opening the link made nothing (no pending sign-up, no firm, the link unused)", pending(e1) === "0" && firms(e1) === "0" && sql(`select used_at is null from platform_signup_link where id = '${l1.id}'`) === "t");
  await shot(p, "iv1-form-1280"); await axe("the form at 1280 px", p); await noSideways("the form at 1280 px", p);
  await p.getByLabel("Password").fill(PASS_WORDS); await p.getByLabel("Firm name").fill(`Sample Invited Firm ${run}`);
  await p.locator("[data-signup-agree]").check(); await p.locator("[data-signup-submit]").click();
  await p.locator("[data-invited='sent']").waitFor({ timeout: 20_000 });
  ok("PF-5s S8 IV1: Check your email names the link's email; one pending sign-up tied to the link", (await p.locator("[data-signup-sent-to]").innerText()) === e1 && sql(`select count(*) from platform_signup_pending where email = '${e1}' and signup_link_id = '${l1.id}'`) === "1");
  await shot(p, "iv1-check-email-1280"); await axe("Check your email at 1280 px", p);
  await p.goto(`${BASE}${await verifyLink(e1)}`); await p.locator("[data-signup-confirm]").click();
  await p.locator("[data-signup-verify='done']").waitFor({ timeout: 30_000 });
  ok("PF-5s S8 IV1: Confirm makes one firm in TRIAL on the link's plan and period; the link is used with that firm",
    firms(e1) === "1" && sql(`select s.status || ' ' || s.billing_period || ' ' || p.code from platform_subscription s join platform_firm f on f.id = s.firm_id join platform_plan p on p.id = s.plan_id where f.owner_email = '${e1}'`) === `TRIAL YEARLY ${PLAN}`
      && sql(`select l.firm_id = f.id and l.used_at is not null from platform_signup_link l join platform_firm f on f.owner_email = '${e1}' where l.id = '${l1.id}'`) === "t");

  // ------------------------------------------------------------------------------------------ IV3: one dead page for all
  const d = await newPage();
  const deadWords = async (name: string, path: string, email?: string) => {
    await d.goto(`${BASE}${path}`); await dead(d);
    const text = await d.locator("[data-invited='gone']").innerText();
    ok(`PF-5s S8 IV3 (BR-13, m8): ${name} → "This sign-up link doesn't work…", reply to the invitation email, Already set up? Sign in${email ? "; no other firm" : ""}`,
      text.includes(DEAD) && /reply to the invitation email/.test(text) && (await d.locator("[data-invited-sign-in]").innerText()) === "Already set up? Sign in" && (await d.locator("form").count()) === 0 && (!email || firms(email) === (email === e1 ? "1" : "0")), text.slice(0, 200));
  };
  await deadWords("the used link", l1.path, e1);
  await shot(d, "iv3-dead-1280"); await axe("the dead page at 1280 px", d); await noSideways("the dead page at 1280 px", d);
  const e3 = `invited3.pf5si.${run}@example.com`, l3 = await makeLink(e3);
  sql(`update platform_signup_link set created_at = now() - interval '15 days', expires_at = now() - interval '1 day' where id = '${l3.id}' returning id`);
  await deadWords("an expired link (past its 14 days)", l3.path, e3);
  await deadWords("a malformed token (#token=abc)", "/sign-up/invited#token=abc");
  await deadWords("a malformed token (43 characters with a dot)", `/sign-up/invited#token=${"a".repeat(42)}.`);
  await d.goto(`${BASE}/sign-up/invited`); await dead(d);
  const noToken = await d.locator("[data-invited='gone']").innerText();
  ok("PF-5s S8 IV3 (break m1): no token (a reload drops it) → 'Open your invitation link', never the dead link's title nor 'ask for a new link'", noToken.startsWith("Open your invitation link") && noToken.includes("it still works") && !noToken.includes(DEAD) && !/reply to the invitation email/.test(noToken), noToken.slice(0, 200));
  let reads = 0; const countReads = (r: { url: () => string; method: () => string }) => { if (/\/api\/public\/signup\/[^/]+$/.test(r.url()) && r.method() === "GET") reads++; };
  d.on("request", countReads);
  await deadWords("a 20,000-character token (break m3: the shape is checked before any request)", `/sign-up/invited#token=${"a".repeat(20_000)}`);
  ok("PF-5s S8 IV3 fail (break m3): a token not of the link's shape sends no request (no 431 'could not be read')", reads === 0, { reads });
  d.off("request", countReads);

  // ------------------------------------------------------------------------------------------ IV4b: a failed first read
  const e6 = `invited6.pf5si.${run}@example.com`, l6 = await makeLink(e6);
  const f = await newPage();
  await f.route(/\/api\/public\/signup\/[^/]+$/, (route) => route.abort("internetdisconnected"));
  await f.goto(`${BASE}${l6.path}`); await f.locator("[data-invited-retry]").waitFor({ timeout: 20_000 });
  ok("PF-5s S8 IV4b fail (break M1): the first read fails (no connection) → 'could not be loaded' with Try again, never the dead page", (await f.locator("[data-invited='gone']").count()) === 0 && !f.url().includes("token="));
  await f.unroute(/\/api\/public\/signup\/[^/]+$/); await f.locator("[data-invited-retry]").click(); await form(f);
  ok("PF-5s S8 IV4b (break M1): Try again reads the link held in memory → the form with the link's email", (await f.locator("[data-invited-email]").innerText()) === e6);

  // ------------------------------------------------------------------------------------------ IV4: dies while open
  const e4 = `invited4.pf5si.${run}@example.com`, l4 = await makeLink(e4);
  const g = await newPage();
  await g.goto(`${BASE}${l4.path}`); await form(g);
  sql(`update platform_signup_link set created_at = now() - interval '14 days', expires_at = now() - interval '1 second' where id = '${l4.id}' returning id`);
  await g.getByLabel("Password").fill(PASS_WORDS); await g.getByLabel("Firm name").fill(`Sample Late Firm ${run}`);
  await g.locator("[data-signup-agree]").check(); await g.locator("[data-signup-submit]").click(); await dead(g);
  ok("PF-5s S8 IV4: a link expired between opening and sending → the dead page; no pending sign-up, no firm", (await g.locator("[data-invited-words]").innerText()) === DEAD && pending(e4) === "0" && firms(e4) === "0");

  // ------------------------------------------------------------------------------------------ IV5: 375 px and keyboard
  const e5 = `invited5.pf5si.${run}@example.com`, l5 = await makeLink(e5);
  const k = await newPage(375);
  await k.goto(`${BASE}${l5.path}`); await form(k);
  await noSideways("the form at 375 px", k); await axe("the form at 375 px", k); await shot(k, "iv5-form-375");
  await k.getByLabel("Password").focus(); await k.keyboard.type(PASS_WORDS); await k.keyboard.press("Tab"); await k.keyboard.type(`Sample Keyboard Firm ${run}`);
  const tabTo = async (sel: string) => { for (let i = 0; i < 30 && !(await k.evaluate((x) => !!document.activeElement?.matches(x), sel)); i++) await k.keyboard.press("Tab"); };
  await k.keyboard.press("Enter"); await k.locator("[data-signup-terms-error]").waitFor({ timeout: 10_000 });
  await noSideways("the refused form at 375 px", k); await axe("the refused form at 375 px", k);
  await tabTo("[data-signup-agree]"); await k.keyboard.press("Space"); await tabTo("[data-signup-submit]"); await k.keyboard.press("Enter");
  await k.locator("[data-invited='sent']").waitFor({ timeout: 20_000 });
  ok("PF-5s S8 IV5: keyboard only at 375 px: type, Enter refuses with the tick unticked, Space ticks, Enter sends → Check your email", (await k.locator("[data-signup-sent-to]").innerText()) === e5);
  await noSideways("Check your email at 375 px", k); await axe("Check your email at 375 px", k); await shot(k, "iv5-check-email-375");
  await k.goto(`${BASE}/sign-up/invited#token=abc`); await dead(k);   // the same path: only the hash changes, no page load
  ok("PF-5s S8 IV3 fail (break round 0): another link opened in the same tab (a hash change, no page load) replaces Check your email with that link's answer", (await k.locator("[data-invited-words]").innerText()) === DEAD && (await k.locator("[data-invited='sent']").count()) === 0);
  await noSideways("the dead page at 375 px", k); await axe("the dead page at 375 px", k); await shot(k, "iv5-dead-375");
  ok("PF-5s S8 IV5: no request to any host but the app's", [...hosts].every((h) => h === `localhost:${PORT}`), [...hosts]);
  const stores = await p.evaluate(() => JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage }));
  ok("PF-5s S8 IV5 fail: the password is never in an address the browser visited, nor in its storage", !urls.some((u) => u.includes(encodeURIComponent(PASS_WORDS)) || u.includes(PASS_WORDS)) && !stores.includes(PASS_WORDS));
  ok("PF-5s S8 IV5: no page error on any page", errors.length === 0, errors);
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
