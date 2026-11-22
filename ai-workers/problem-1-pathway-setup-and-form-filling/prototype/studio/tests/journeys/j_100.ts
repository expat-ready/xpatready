// J-100 (map row 100, R1.100: recorded acceptance of our terms, privacy notice and data agreement): the join-and-walk
// for the item, over PF-5 part 1's sign-up door, PF-5t's terms gate and screens, and PF-5v part 2's sign-up mail
// (QA-481: the verification email reaches the demo inbox) and PF-5s part 1's sign-up screens, on an isolated copy of the running app (its own database
// and port, never :4400), at 1440 px. Wording and versions Sample; legal points Unconfirmed: no counsel. US$0, no model
// call, no live mail (the local email adapter, read at GET /api/demo/platform-inbox).
//   W0 (PF-5s part 1, the screen): a person on Sign up presses Start free trial with the terms tick unticked: the screen
//       refuses in plain words on the tick, nothing leaves the page and nothing is stored or sent; they tick it and
//       finish: Check your email, the link from the inbox, Confirm my email: the firm, its Owner and the three
//       acceptances are made, the firm key is shown, and the Owner signs in without being asked again. The screen has
//       ONE tick for the three documents (concept pf-5s-saas r2 BR-3), so "two of three" is the door's, in W1;
//   W1: sign-up cannot finish without accepting the current versions: refused with none, with two of three (the public
//       door, as any form or script would send them);
//   W2: a complete sign-up's verification email reaches the inbox, with the code and the link (QA-481);
//   W3: the code confirms the sign-up: the firm and its Owner are made, and one acceptance per current version is
//       stored with who, when and which version; a wrong code is refused and makes nothing;
//   W4: the Owner signs in by the sign-in card and is not asked again (all accepted); Settings → Terms shows who
//       accepted which version and when;
//   W5: a new terms-of-service version is published; at the next sign-in the Owner is asked again (the terms page; the
//       firm's calls answer 428 TERMS_PENDING), accepts, and Settings → Terms shows the new acceptance.
// Fails on the fake (P-606): the inbox is read before the sign-up (must be empty), and each W4/W5 judge on the terms
// list is also run before the step that makes it true.
// Screenshots: product/screens/J-100/screenshots/. Run from prototype/ (HEADED=1 opens a visible browser):
//   zsh studio/tools/isolated.sh j100 4436 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j100 4436 stop' EXIT && tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_100.ts j100 4436
import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { client, recorder } from "../runtime/api.ts";

const NAME = process.argv[2] ?? "j100", PORT = Number(process.argv[3] ?? 4436), DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "screens", "J-100", "screenshots"); mkdirSync(SHOTS, { recursive: true });
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
const inbox = async (address: string) => (await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).body.messages as { subject: string; body: string }[] ?? [];

const browser = await chromium.launch({ headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const shot = (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const termsPage = (p: Page) => p.locator("[data-terms-page]").waitFor({ timeout: 20_000 });
const items = (p: Page) => p.locator("[data-terms-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-terms-item")).sort());
let firmKey = "", ownerId = "";
try {
  // ------------------------------------------------------------------------------- W0: the sign-up screen refuses (PF-5s)
  const se = `screen.j100.${run}@example.com`;
  const sctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  const sp = await sctx.newPage(); sp.on("pageerror", (e) => errors.push(String(e)));
  let posts = 0; sp.on("request", (r) => { if (r.method() === "POST" && r.url().endsWith("/api/public/signup")) posts++; });
  await sp.goto(`${BASE}/sign-up`); await sp.locator("[data-signup-agree]").waitFor({ timeout: 20_000 });
  await sp.getByLabel("Work email").fill(se); await sp.getByLabel("Password").fill("Correct-horse-9!"); await sp.getByLabel("Firm name").fill(`Sample Screen Firm ${run}`);
  await sp.locator("[data-signup-submit]").click();
  await sp.locator("[data-signup-terms-error]").waitFor({ timeout: 10_000 });
  await wait(3500);   // longer than the door's minimum fill time: a request, had one left, would have been answered
  ok("R1.100 W0 fail (screen): Start free trial with the terms unticked is refused on the screen, in plain words on the tick: 'Please accept the terms to continue.'",
    (await sp.locator("[data-signup-terms-error]").innerText()) === "Please accept the terms to continue." && (await sp.locator("[data-signup-check]").count()) === 0, await sp.locator("[data-signup-terms-error]").innerText());
  ok("R1.100 W0 fail (screen): nothing is created: no request left the page, no pending sign-up, no firm, no email", posts === 0 && sql(`select count(*) from platform_signup_pending where email = '${se}'`) === "0" && sql(`select count(*) from platform_firm where owner_email = '${se}'`) === "0" && (await inbox(se)).length === 0);
  await shot(sp, "w0-terms-refused-1440");
  const shown = await sp.locator("[data-signup-term]").allInnerTexts();
  await sp.locator("[data-signup-agree]").check(); await sp.locator("[data-signup-submit]").click();
  await sp.locator("[data-signup-check]").waitFor({ timeout: 20_000 });
  ok("R1.100 W0 (screen): ticked (the tick names the three current versions), Start free trial answers Check your email", shown.length === 3 && posts === 1 && (await sp.locator("[data-signup-sent-to]").innerText()) === se, shown);
  let smail: { subject: string; body: string } | undefined;
  for (let i = 0; i < 75 && !smail; i++) { await wait(200); smail = (await inbox(se)).find((m) => m.subject === "Your ExpatReady verification code"); }
  const slink = smail?.body.match(/\/sign-up\/verify#token=[A-Za-z0-9_-]{43}&code=\d{6}/)?.[0];
  if (!slink) throw new Error("STOP  no verification link in the screen sign-up's inbox");
  await sp.goto(`${BASE}${slink}`); await sp.locator("[data-signup-confirm]").click();
  await sp.locator("[data-signup-firm-key]").waitFor({ timeout: 20_000 });
  const sKey = (await sp.locator("[data-signup-firm-key]").innerText()).trim();
  ok("R1.100 W0 (screen): Confirm my email makes the firm and its Owner with one acceptance per current version; the firm key is shown",
    !!sKey && sql(`select count(*) from platform_terms_acceptance a join platform_firm f on f.id = a.firm_id where f.key = '${sKey}' and f.owner_email = '${se}'`) === "3", sKey);
  await shot(sp, "w0-confirmed-1440");
  await sp.locator("[data-signup-sign-in]").click();
  await sp.getByLabel("Firm key").fill(sKey); await sp.getByLabel("Work email").fill(se); await sp.getByRole("button", { name: "Sign in" }).click();
  await sp.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 });
  ok("R1.100 W0 (screen): the Owner signs in and is not asked to accept again", (await sp.locator("[data-account]").count()) === 1 && (await sp.locator("[data-terms-page]").count()) === 0);
  await sctx.close();

  // ---------------------------------------------------------------------------------------------- W1: the door refuses
  const plans = await j("GET", "/api/public/plans");
  const terms: { id: string; kind: string; version: string }[] = plans.body.terms ?? [];
  ok("R1.100 W1: the pricing read names the current terms of service, privacy notice and data-processing terms, each with its version (Sample)", plans.status === 200 && ["TERMS_OF_SERVICE", "PRIVACY_NOTICE", "DATA_PROCESSING"].every((k) => terms.some((t) => t.kind === k && t.version)), terms.map((t) => `${t.kind}@${t.version}`));
  const email = `owner.j100.${run}@example.com`;
  const form = { email, password: "Correct-horse-9!", firmName: `Sample Terms Firm ${run}`, countryCode: "CA", planCode: plans.body.plans?.[0]?.code ?? "solo", period: "MONTHLY", acceptedTerms: terms.map((t) => t.id), formStamp: plans.body.formStamp };
  await wait(3300);   // the door's minimum fill time is 3 s
  const none = await j("POST", "/api/public/signup", { ...form, acceptedTerms: [] });
  ok("R1.100 W1 fail: a sign-up that accepts nothing is refused at the field, in plain words", none.status === 422 && String(none.body.errors?.[0]).startsWith("acceptedTerms: accept the current terms"), none.body.errors);
  const two = await j("POST", "/api/public/signup", { ...form, acceptedTerms: form.acceptedTerms.slice(0, 2) });
  ok("R1.100 W1 fail: a sign-up that accepts two of the three current versions is refused", two.status === 422, two.body.errors);
  await wait(1000);
  ok("R1.100 W1 fail: a refused sign-up stores nothing and sends nothing (the inbox is empty; P-606: read before the sign-up)", sql(`select count(*) from platform_signup_pending where email = '${email}'`) === "0" && (await inbox(email)).length === 0);

  // ------------------------------------------------------------------------------------- W2: the email reaches the inbox
  const valid = await j("POST", "/api/public/signup", form);
  ok("R1.100 W2: a sign-up that accepts all three current versions is answered 'check your email'", valid.status === 202 && valid.body.status === "check-email", valid.body);
  let mails: { subject: string; body: string }[] = [];
  for (let i = 0; i < 50 && mails.length === 0; i++) { await wait(200); mails = await inbox(email); }
  const mail = mails.find((m) => m.subject === "Your ExpatReady verification code");
  const link = mail?.body.match(/sign-up\/verify#token=([A-Za-z0-9_-]{43})&code=(\d{6})/);
  ok("R1.100 W2 (QA-481): the verification email reaches the inbox the person reads, with the 6-digit code and the link", !!mail && !!link && mail.body.includes(`Your verification code is ${link[2]}.`), mails.map((m) => m.subject));
  ok("R1.100 W2: the pending sign-up keeps all three accepted versions", sql(`select array_length(terms_version_ids, 1) from platform_signup_pending where email = '${email}' and used_at is null`) === "3");
  if (!link) throw new Error("STOP  no verification link in the inbox: the rest of the walk needs it");
  const [, token, code] = link;

  // ------------------------------------------------------------------------------------------------ W3: confirm, stored
  const wrong = await j("POST", "/api/public/signup/verify", { token, code: code === "000000" ? "111111" : "000000" });
  ok("R1.100 W3 fail: a wrong code is refused in plain words and makes no firm", wrong.status === 422 && wrong.body.code === "CODE_WRONG" && sql(`select count(*) from platform_firm where owner_email = '${email}'`) === "0", wrong.body);
  const done = await j("POST", "/api/public/signup/verify", { token, code });
  firmKey = done.body.firmKey ?? ""; ownerId = done.body.ownerStaffId ?? "";
  ok("R1.100 W3: the code from the email confirms the sign-up: one firm and its Owner are made", done.status === 201 || done.status === 200 ? !!firmKey && !!ownerId : false, done.body);
  const stored = sql(`select string_agg(v.kind || '@' || v.version || '@' || (a.accepted_at is not null)::text || '@' || (a.staff_id = '${ownerId}')::text, ',' order by v.kind) from platform_terms_acceptance a join platform_terms_version v on v.id = a.version_id where a.firm_id = (select id from platform_firm where key = '${firmKey}')`);
  ok("R1.100 W3: one acceptance per current version is stored with who (the Owner), when, and which version", terms.every((t) => stored.includes(`${t.kind}@${t.version}@true@true`)) && stored.split(",").length === 3, stored);
  ok("R1.100 W3: the acceptance has its audit line", sql(`select count(*) from audit_event where action = 'platform.terms.accepted' and firm_id = (select id from platform_firm where key = '${firmKey}')`) === "1");
  // The door's other email (PF-5v part 2): signing up again with the same address answers the same, and the person's
  // inbox gets "You already have an ExpatReady account" (it went to PF-0p's fakeMail before, read by no one).
  const again = await j("POST", "/api/public/signup", form);
  let already = false;
  for (let i = 0; i < 50 && !already; i++) { await wait(200); already = (await inbox(email)).some((m) => m.subject === "You already have an ExpatReady account"); }
  ok("R1.100 W3 (PF-5v part 2): signing up again with the Owner's address answers the same and the inbox gets 'You already have an ExpatReady account'; no second pending sign-up", again.status === 202 && already && sql(`select count(*) from platform_signup_pending where email = '${email}' and used_at is null`) === "0");
  ok("R1.100 W3 (review M1 of #2456): that email is our platform account email, not the firm's: no outbox row of the firm, so the public form never spends the firm's daily cap", sql(`select count(*) from msg_outbox where address = '${email}' and firm_id is null`) === "2" && sql(`select count(*) from msg_outbox where firm_id = (select id from platform_firm where key = '${firmKey}')`) === "0");

  // ------------------------------------------------------------------------- W4: sign in, not asked again, shown
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce" });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
  const signIn = async () => {
    await p.goto(`${BASE}/account`);
    await p.getByLabel("Firm key").fill(firmKey); await p.getByLabel("Work email").fill(email); await p.getByRole("button", { name: "Sign in" }).click();
    await p.locator("[data-account], [data-terms-page]").first().waitFor({ timeout: 20_000 });
  };
  await signIn();
  ok("R1.100 W4: the Owner signs in by the sign-in card and is not asked again (every current version was accepted at sign-up)", (await p.locator("[data-terms-page]").count()) === 0 && (await p.locator("[data-account]").count()) === 1);
  await shot(p, "w4-signed-in-1440");
  await p.locator('nav[aria-label="My account"] [data-account-section="/platform/terms"]').click();
  await p.locator("[data-acceptance]").first().waitFor({ timeout: 20_000 });
  const rows = await p.locator("[data-acceptance]").allInnerTexts();
  const who = email.split("@")[0];   // the Owner's display name (the sign-up's email before the @)
  const shows = (r: string, label: string, version: string) => r.includes(who) && r.toLowerCase().includes(label) && r.includes(version) && /\d{1,2}:\d{2}/.test(r);
  const LABEL: Record<string, string> = { TERMS_OF_SERVICE: "terms of service", PRIVACY_NOTICE: "privacy notice", DATA_PROCESSING: "data processing" };
  ok("R1.100 W4: Settings → Terms shows the Owner's three acceptances: who (the Owner), which document and version, and when", rows.length === 3 && terms.every((t) => rows.some((r) => shows(r, LABEL[t.kind] ?? t.kind, t.version))), rows);
  await shot(p, "w4-settings-terms-1440");

  // --------------------------------------------------------------- W5: a new version asks again at the next sign-in
  const v2 = `sample-j100-${run}`;
  ok("R1.100 W5 fail (P-606, before the new version): signing in does not ask (W4 above), and the database holds no version of that name yet", sql(`select count(*) from platform_terms_version where version = '${v2}'`) === "0");
  const tos2 = sql(`insert into platform_terms_version (id, kind, version, url, published_at) values (gen_random_uuid(), 'TERMS_OF_SERVICE', '${v2}', 'https://example.com/sample-terms/${run}', now() - interval '1 second') returning id`);
  await p.evaluate(() => sessionStorage.clear());   // the next sign-in: a new browser session (the old one simply ends)
  await signIn();
  await termsPage(p);
  ok("R1.100 W5: at the next sign-in the Owner is asked again: the terms page lists the new terms of service with its link", JSON.stringify(await items(p)) === '["TERMS_OF_SERVICE"]' && (await p.locator("[data-terms-item] a").count()) === 1, await items(p));
  const tok = await p.evaluate(() => JSON.parse(sessionStorage.getItem("xr-staff-session") ?? "{}").token as string);
  const blocked = await j("GET", "/api/platform/staff", undefined, tok);
  ok("R1.100 W5 fail: until accepted, the firm's calls answer 428 TERMS_PENDING", blocked.status === 428 && blocked.body.code === "TERMS_PENDING", blocked.body);
  await shot(p, "w5-asked-again-1440");
  await p.locator("[data-terms-accept]").click(); await p.locator("[data-terms-page]").waitFor({ state: "detached", timeout: 20_000 });
  ok("R1.100 W5: I accept records the new version for the Owner, with the time", sql(`select count(*) from platform_terms_acceptance where staff_id = '${ownerId}' and version_id = '${tos2}' and accepted_at is not null`) === "1");
  ok("R1.100 W5: the firm's calls answer 200 again", (await j("GET", "/api/platform/staff", undefined, tok)).status === 200);
  await p.goto(`${BASE}/platform/terms`); await p.locator("[data-acceptance]").first().waitFor({ timeout: 20_000 });
  const after = await p.locator("[data-acceptance]").allInnerTexts();
  ok("R1.100 W5: Settings → Terms now shows the new version's acceptance too, with who and when", after.length === 4 && after.some((r) => shows(r, "terms of service", v2)), after);
  await shot(p, "w5-settings-terms-1440");
  ok("R1.100: no page error in the browser", errors.length === 0, errors);
  await ctx.close();
} finally {
  await browser.close();
}
process.exit(summary() ? 1 : 0);
