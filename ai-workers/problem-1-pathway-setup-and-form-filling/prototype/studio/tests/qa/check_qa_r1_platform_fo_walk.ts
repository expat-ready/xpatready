// qa 16 Nov (/qa capability, batch of Release 1 map rows 19, 21, 100, 28, 30, 31, 59): what a person and an API client
// can do today on a running copy, as each row's acceptance line asks. PASS lines are what works; FAIL lines are the
// open findings (QA-n in product/qa/BUGS.md) and the missing parts, so this check fails while they are open and passes
// when built. No model call, no Stripe call (US$0, P-175); the identity side is the local stand-in.
//   zsh studio/tools/isolated.sh qa_r1d 4472 start --ttl 30 PLATFORM_IDENTITY=local && tsx studio/tests/qa/check_qa_r1_platform_fo_walk.ts 4472 xr_studio_qa_r1d
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { auditEvent } from "../../api/src/platform/audit/audit-event.ts";
import { ConsentStore } from "../../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";
const { default: AxeBuilder } = createRequire(import.meta.url)("@axe-core/playwright") as typeof import("@axe-core/playwright");

const PORT = Number(process.argv[2] ?? 4472), DBNAME = process.argv[3] ?? "xr_studio_qa_r1d", BASE = `http://localhost:${PORT}`;
const SHOTS = join(import.meta.dirname, "..", "..", "..", "..", "product", "qa", "reports", "2026-11-16-capability-r1-batch"); mkdirSync(SHOTS, { recursive: true });
const { ok, summary } = recorder();
const { sql: rawSql } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
const j = async (method: string, path: string, body?: unknown, token?: string) => {
  const r = await fetch(`${BASE}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let b: any = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- Map rows 19 and 100: the self-serve sign-up door (PF-5 part 1) -------------------------------------------------
const plans = await j("GET", "/api/public/plans");
const terms: { id: string; kind: string; version: string }[] = plans.body.terms ?? [];
ok("R1.100: the pricing read names the current terms of service, privacy notice and data-processing terms with versions", plans.status === 200 && ["TERMS_OF_SERVICE", "PRIVACY_NOTICE", "DATA_PROCESSING"].every((k) => terms.some((t) => t.kind === k && t.version)), terms.map((t) => `${t.kind}@${t.version}`));
ok("R1.19: three Sample plans with a 14-day trial and seat limits are offered", plans.body.plans?.length === 3 && plans.body.plans.every((p: any) => p.trialDays === 14 && p.seatsLimit > 0), plans.body.plans?.map((p: any) => p.name));
const email = `owner.${run}@example.com`;
const form = { email, password: "Correct-horse-9!", firmName: "Cabinet Évora Immigration 移民", countryCode: "CA", planCode: "team", period: "MONTHLY", acceptedTerms: terms.map((t) => t.id), formStamp: plans.body.formStamp };
await wait(3300);   // the door's minimum fill time is 3 s
const noTerms = await j("POST", "/api/public/signup", { ...form, acceptedTerms: [] });
ok("R1.100 fail: sign-up without accepting the terms is refused at the field, in plain words", noTerms.status === 422 && noTerms.body.errors?.[0]?.startsWith("acceptedTerms: accept the current terms"), noTerms.body.errors);
const twoOfThree = await j("POST", "/api/public/signup", { ...form, acceptedTerms: form.acceptedTerms.slice(0, 2) });
ok("R1.100 fail: accepting two of the three current versions is refused", twoOfThree.status === 422, twoOfThree.body.errors);
const oldVersion = await j("POST", "/api/public/signup", { ...form, acceptedTerms: [...form.acceptedTerms.slice(0, 2), "00000000-0000-4000-8000-000000000000"] });
ok("R1.100 fail: a version that is not current is refused", oldVersion.status === 422, oldVersion.body.errors);
const longName = await j("POST", "/api/public/signup", { ...form, email: `long.${run}@example.com`, firmName: "x".repeat(5000) });
ok("R1.19 fail: a 5,000-character firm name is refused at the field", longName.status === 422 && String(longName.body.errors).includes("firmName: 2 to 120 characters"), longName.body.errors);
const empty = await j("POST", "/api/public/signup", {});
ok("R1.19 (QA-484): an empty sign-up names each missing field in plain words, not the validator's", empty.status === 422 && !String(empty.body.errors).includes("Invalid input"), empty.body.errors);
const valid = await j("POST", "/api/public/signup", form);
ok("R1.19 pass: a complete sign-up (accents and CJK in the firm name) is answered 'check your email'", valid.status === 202 && valid.body.status === "check-email", valid.body);
await wait(1500);
const pending = sql(`select firm_name || '|' || plan_code || '|' || period || '|' || array_length(terms_version_ids, 1) from platform_signup_pending where email = '${email}' and used_at is null`);
ok("R1.19, R1.100: the pending sign-up keeps the firm name as typed, the plan, the period and all three accepted versions", pending === "Cabinet Évora Immigration 移民|team|MONTHLY|3", pending);
const inbox = await j("GET", `/api/demo/platform-inbox?address=${encodeURIComponent(email)}`);
ok("R1.19 (QA-481): on a running copy the verification email reaches an inbox the person can open (it stays in the identity stand-in's memory; no route, no screen)", inbox.status === 200 && (inbox.body.messages?.length ?? 0) > 0, { messages: inbox.body.messages?.length ?? null });
const pages = await Promise.all(["/sign-up", "/pricing"].map(async (p) => { const r = await fetch(`${BASE}${p}`); const t = await r.text(); return { p, status: r.status, hasForm: /sign.?up/i.test(t) && /password/i.test(t) }; }));
ok("R1.19, R1.100: a person can sign up from a page (PF-5s, the sign-up screens, not on main)", pages.some((x) => x.hasForm), pages);
const sub = sql(`select count(*) from platform_subscription where trial_ends_at is not null`);
ok("R1.19: a self-serve firm's trial end is stored (set by PF-5 part 2's Stripe webhook; part 1 stores status TRIAL with no end)", Number(sub) > 0, { subscriptionsWithTrialEnd: sub });
const signInAgain = sql(`select count(*) from information_schema.columns where table_name = 'platform_terms_acceptance'`);
ok("R1.100: an acceptance table exists (kind, version, time, who)", Number(signInAgain) > 0);
const src = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? src(join(dir, d.name)) : /\.tsx?$/.test(d.name) ? [join(dir, d.name)] : []);
const API = join(import.meta.dirname, "..", "..", "api", "src"), callers = (re: RegExp, skip: RegExp) => src(API).filter((f) => !skip.test(f) && re.test(readFileSync(f, "utf8"))).map((f) => f.slice(API.length + 1));
const termsReaders = callers(/platformTermsAcceptance\.(findFirst|findMany|count)/, /firms\/signup\.ts$/);
ok("R1.100: a new terms version asks again at the next sign-in (nothing outside sign-up reads the acceptances; in no PF-5 part)", termsReaders.length > 0, termsReaders);

// ---- Map row 21: our own invoices with sales tax (PF-5 parts 2-3) --------------------------------------------------
const inv = await j("GET", "/api/platform/billing/invoices");
ok("R1.21: GET /api/platform/billing/invoices exists (PF-5 part 2: billing routes, Stripe Tax)", inv.status !== 404, { status: inv.status });

// ---- Map row 28: consent per purpose (PF-19a store, FO-2 arrival, FO-4 form) ----------------------------------------
await seedSampleFirms(db); await seedSampleFirmsFrontOffice(db);
const A = sql(`select id from platform_firm where key = 'sample-firm'`);
const consent = new ConsentStore(auditEvent);
const wording = await db.$transaction((tx) => consent.publishWording(tx, { firmId: A, channel: "EMAIL", purpose: "MARKETING", locale: "en", text: `Send me news from Sample Firm by email. I can stop at any time. (Sample; Unconfirmed: no counsel) ${run}`, by: "seed:qa-r1-walk" }));
const token = sql(`update fo_web_form set enabled = true, consent_wording_version_id = '${wording.id}' where firm_id = '${A}' returning public_token`);
const browser = await chromium.launch({ headless: !process.env.HEADED, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const shot = async (p: Page, name: string) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const page = async (w: number) => { const c = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 }); return c.newPage(); };
const send = async (p: Page, given: string, mail: string, tick: boolean) => {
  await p.goto(`${BASE}/front-office/web-form/${token}`); await p.getByLabel("First name").waitFor({ timeout: 30_000 });
  await p.getByLabel("First name").fill(given); await p.getByLabel("Email", { exact: true }).fill(mail);
  if (tick) await p.getByRole("checkbox").check(); await p.waitForTimeout(2300);
  await p.getByRole("button", { name: "Send my enquiry" }).click(); await p.locator('[data-form-state="thanks"], [role="alert"]').first().waitFor({ timeout: 15_000 });
};
const v = await page(400);
await send(v, `Ticked${run}`, `ticked.${run}@example.org`, true); await shot(v, "r1-28-web-form-thanks-400");
await send(v, `Unticked${run}`, `unticked.${run}@example.org`, false);
const personOf = (given: string) => sql(`select id from fo_person where firm_id = '${A}' and given_names = '${given}'`);
const tickedRow = sql(`select channel || '|' || purpose || '|' || (wording_id is not null) || '|' || source || '|' || (given_at is not null) || '|' || (withdrawn_at is null) from msg_consent where subject_id = '${personOf(`Ticked${run}`)}'`);
ok("R1.28 pass: a ticked web form writes one consent with channel, purpose, wording, source and time", tickedRow === "EMAIL|MARKETING|true|WEB_FORM|true|true", tickedRow);
ok("R1.28 fail: an unticked form writes no consent", sql(`select count(*) from msg_consent where subject_id = '${personOf(`Unticked${run}`)}'`) === "0");
let edit = ""; try { edit = rawSql(`update msg_consent set purpose = 'SERVICE' where subject_id = '${personOf(`Ticked${run}`)}'`); } catch (e) { edit = `refused: ${String((e as { stderr?: string }).stderr ?? e).split("\n")[0]}`; }
ok("R1.28 fail: a consent record cannot be edited (only superseded or withdrawn)", !/^UPDATE [1-9]/m.test(edit), edit.slice(0, 160));
const withdrawCallers = callers(/\.withdraw\(\s*tx/, /messages\/consent\//);
ok("R1.28: withdrawing one purpose is reachable (ConsentPort.withdraw has no caller in the app; PF-19b part 2's one-click unsubscribe would be the first)", withdrawCallers.length > 0, withdrawCallers);

// ---- Map rows 30 and 31: lead lists, filters, board; stage kinds, won by signature (FO-2, FO-4) ------------------
const signIn = async (actor: string) => { const em = sql(`select email from platform_staff where actor_id = '${actor}'`);
  const r = await j("POST", "/api/platform/session/local", { firmKey: "sample-firm", email: em, secondStep: true }); return r.body.token as string; };
const tm = await signIn("user-T");
const views: Record<string, number> = {};
for (const view of ["unassigned", "mine", "all", "closed"]) { const r = await j("GET", `/api/front-office/leads?view=${view}`, undefined, tm); views[view] = r.status; }
ok("R1.30 pass: the lead lists answer for Unassigned, Mine, All open and Closed", Object.values(views).every((s) => s === 200), views);
const all = await j("GET", `/api/front-office/leads?view=all`, undefined, tm);
const sources = await j("GET", `/api/front-office/leads/sources`, undefined, tm);
const firstSource = (Array.isArray(sources.body) ? sources.body[0] : sources.body?.sources?.[0]) as unknown;
const bySource = await j("GET", `/api/front-office/leads?view=all&source=${encodeURIComponent(String((firstSource as { value?: string; label?: string })?.value ?? (firstSource as { label?: string })?.label ?? firstSource))}`, undefined, tm);
ok("R1.30 pass (FO-4sf #1962): the lead list filters by source", sources.status === 200 && bySource.status === 200, { sources: sources.status, bySource: bySource.status, first: firstSource });
const unknownSource = await j("GET", `/api/front-office/leads?view=all&source=no-such-source-${run}`, undefined, tm);
ok("R1.30 fail (FO-4sf): an unknown source is refused (400)", unknownSource.status === 400, { status: unknownSource.status });
for (const [k, v] of [["stage", "NEW"], ["owner", "nobody"], ["from", "2099-01-01"]]) {
  const r = await j("GET", `/api/front-office/leads?view=all&${k}=${v}`, undefined, tm);
  ok(`R1.30: the lead list filters by ${k === "from" ? "date" : k} (the query is ignored: the same list comes back)`, r.status === 200 && JSON.stringify(r.body) !== JSON.stringify(all.body), { status: r.status });
}
for (const w of [400, 1024, 1440]) {
  const p = await page(w); await p.addInitScript((t) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: t, expiresAt: Date.now() + 3_600_000 })), tm);
  await p.goto(`${BASE}/front-office/leads`); await p.getByRole("heading", { name: "Leads" }).waitFor({ timeout: 30_000 }); await p.waitForTimeout(500);
  await shot(p, `r1-30-leads-${w}`);
  const sideways = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(`R1.30 pass: Leads at ${w} px shows the list with no sideways scroll`, !sideways && (await p.getByText(`Ticked${run}`).count()) > 0);
  const axe = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  ok(`R1.30 pass: Leads at ${w} px is axe clean`, axe.violations.length === 0, axe.violations.map((x) => x.id));
  if (w === 1440) {
    ok("R1.30 pass (FO-4sf): Leads has a Source filter", (await p.getByRole("button", { name: /source/i }).count()) > 0);
    const other = await p.getByLabel(/stage|owner|from|date/i).count() + await p.getByRole("button", { name: /stage|owner|date/i }).count();
    ok("R1.30: Leads has filters by stage, owner and date (FO-4 part 2)", other >= 3, { controls: other });
    const boardLink = await p.getByRole("link", { name: /pipeline|board|prospects/i }).count();
    ok("R1.30: a pipeline board can be opened from the sales screens (FO-4 part 2 / FO-4c not on main)", boardLink > 0, { links: boardLink });
  }
  await p.context().close();
}
const prospects = await j("GET", "/api/front-office/prospects", undefined, tm);
ok("R1.31: a prospects API with stages exists (Engage, move, won: FO-2's prospect part not on main)", prospects.status !== 404, { status: prospects.status });
const stageKinds = sql(`select count(*) from information_schema.tables where table_name like 'fo_pipeline%' or table_name like 'fo_stage%'`);
ok("R1.31 pass (schema): stage tables exist (FO-1a)", Number(stageKinds) > 0, { tables: stageKinds });

// ---- Map row 59: money arithmetic (FO-7a's database rules; the rounding rule is FO-7b's) --------------------------
const rounding = callers(/round(Half|Tax|Line)|halfEven|half_even/i, /^$/);
ok("R1.59: the money code that rounds tax per line by one stated rule exists (QA-482; the schema comment says 'rounded per line by FO-7b'; FO-7b not on main)", rounding.length > 0, rounding);

await browser.close(); await db.$disconnect();
process.exit(summary() ? 1 : 0);
