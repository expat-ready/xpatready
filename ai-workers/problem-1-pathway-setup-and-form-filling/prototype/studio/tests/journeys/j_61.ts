// J-61 (map row 61, R1.61: "Sign and pay by single-use link"), written by the qa lane (22 Nov) BEFORE its parts merge, so
// qa only has to run it when they do. It walks the firm's Owner and a client (Sample) on an isolated copy of the running
// app (its own database and port, never :4400), by screens where they exist and on the routes and the database underneath.
// Done when (CAPABILITIES R1.61), word for word as the steps:
//   "One link"                      W1: the client's email holds one link, and no second link for paying.
//   "opens the document to sign"    W2: the link's door (API and page) shows the agreement to sign; W3: the client signs
//                                   through it (email code, consent, the signing session).
//   "then the invoice to pay"       W4: the same link now shows the client's invoice (its number and amount) to pay;
//                                   W5: the client pays by card through it and the payment is recorded by the processor's
//                                   event (never by the redirect), once.
//   "it works once"                 W6: the used link, opened again in the same browser, signs and pays nothing more.
//   "and expires"                   W8: an expired link is refused in words.
//   "a used or forwarded-after-use link refused in words"
//                                   W6 (used, same browser) and W7 (forwarded after use: a fresh browser) are each tried
//                                   and must answer in words, with no personal data, no Sign and no card form.
// Parts (MVP-CHECKLIST row 61: FO-6, FO-7c): FO-6's routes (Send makes the signing request and its email; the public door
// GET/POST /api/public/sign/:token[/code|/code/verify|/consent|/session], from BACKLOG row FO-6), the door's page, FO-7b
// part 1b (#2953, issue), FO-7c's later part (the pay page and the processor's event; #2938 is part 1, the account only),
// and the row that joins signing to paying (review gap G2: no backlog row yet). Each failing step names its part.
// Stand-ins, said and not hidden: the firm's payment settings and an ACTIVE connected account are written by SQL (FO-7c
// part 1's onboarding needs Stripe's key, which an isolated copy never has); W8's expired link is a signing request
// written by SQL with its time already past (no clock can be moved on a running copy, and expires_at never changes), its
// token's sha256 by this journey's reading of FO-6 (sha256 hex of the token). Guessed: the session link of the fake
// adapter is finished on the copy's own page (the fake's link today points at signing.fake.invalid: see W3's label).
// Sample values only; US$0, no model call, no live mail, no Stripe or vendor call (the browser refuses stripe.com and the
// fake hosts). No screenshots are written. Run from prototype/:
//   zsh studio/tools/isolated.sh j61 4461 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j61 4461 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_61.ts j61 4461
import "reflect-metadata";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type BrowserContext, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j61", Number(process.argv[3] ?? 4461)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql, until } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any; text: string; cookies: string[] };   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
/** One "browser" for the API side of the door: its own cookie jar (the door's signing session is an http-only cookie). */
const jar = () => {
  const c = new Map<string, string>();
  return async (method: string, path: string, body?: unknown, token?: string): Promise<Ans> => {
    const r = await fetch(`${BASE}${path}`, { method, redirect: "manual", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(c.size ? { cookie: [...c].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const cookies = r.headers.getSetCookie(); for (const s of cookies) { const [kv] = s.split(";"); const i = kv.indexOf("="); if (i > 0) c.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
    const text = await r.text(); let b: unknown = null; try { b = JSON.parse(text); } catch { /* text */ } return { status: r.status, body: b, text, cookies };
  };
};
const staffApi = jar();
type Mail = { subject: string; body: string; sent_at: string | null };
/** The demo inbox (SI-20), newest first (demo-inbox.ts). */
const inbox = async (address: string): Promise<Mail[]> => ((await (await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).json().catch(() => ({}))) as { messages?: Mail[] }).messages ?? [];
const linksIn = (mails: Mail[], re: RegExp) => [...new Set(mails.flatMap((m) => m.body.match(re) ?? []))];
const SIGN_LINK = /https?:\/\/[^\s)>"]+\/sign\/[^\s)>"]+/g, PAY_LINK = /https?:\/\/[^\s)>"]+\/pay\/[^\s)>"]+/g;
const tokenOf = (link: string) => link.match(/\/sign\/([^/?#\s]+)/)?.[1] ?? "";
const words = async (pg: Page) => (await pg.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const REFUSED = /(already (been )?used|no longer works|no longer valid|does not work|has been signed|was signed|already signed|already paid|expired|ended)/i;

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firmId = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("J-61 setup: the Sample firm and its front office are seeded", !!firmId && fo.failed.length === 0, fo.failed);
const [ownerId, ownerEmail] = sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`).split("|");   // Owner + Case Manager, licensed
const prospect = (tag: string) => {
  const given = `Client${tag}${run}`, email = `j61.${tag.toLowerCase()}.${run}@example.com`;
  const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${given}', 'Sample', '${email}', 'test', now()) returning id`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${pid}', 'MANUAL', 'WEBSITE', '${ownerId}', 'ENGAGED', now(), 'test', 'test', now())`);
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${firmId}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${firmId}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${pid}', '${pid}', '${ownerId}', 'test', now() from fo_lead l where l.person_id = '${pid}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  return { id, pid, email, given };
};
const A = prospect("A"), B = prospect("B");
const tok = (await staffApi("POST", "/api/platform/session/local", { firmKey: "sample-firm", email: ownerEmail, secondStep: true })).body?.token as string | undefined;
if (!tok) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
sql(`update fo_retainer_template set active = false where firm_id = '${firmId}'`);   // re-runnable: one active template
// Stand-in (said): the firm's payment settings and an ACTIVE connected account with charges on (FO-7c part 1's onboarding
// needs Stripe's key; a fake account id, never a real one).
sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${firmId}', 'seed:J-61', now()) on conflict (firm_id) do nothing; select 1`);
sql(`insert into money_payment_account (firm_id, stripe_account_id, status, charges_enabled, payouts_enabled, updated_at) values ('${firmId}', 'acct_j61${run}', 'ACTIVE', true, true, now())
  on conflict (firm_id) do update set stripe_account_id = excluded.stripe_account_id, status = 'ACTIVE', charges_enabled = true, payouts_enabled = true, updated_at = now(); select 1`);

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const fresh = async (): Promise<{ ctx: BrowserContext; page: Page }> => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 }, reducedMotion: "reduce" });
  await ctx.route(/stripe\.com|fake-rail\.example|signing\.fake\.invalid/, (r) => r.abort());   // no processor or vendor call, ever
  const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(String(e))); return { ctx, page };
};
const staff = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true });
await staff.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tok);
const p: Page = await staff.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
const card = p.locator("[data-retainer-card]"), status = p.locator("[data-retainer-status]");
const retOf = (prospectId: string) => db.foRetainer.findMany({ where: { firmId, prospectId }, orderBy: { createdAt: "asc" }, include: { versions: { orderBy: { n: "asc" } } } });
const conflictCheck = async (pr: { id: string }) => {
  await p.goto(`${BASE}/front-office/prospects/${pr.id}`);
  const panel = p.locator("[data-conflict-panel]"); await panel.getByRole("button", { name: "Run a check" }).click({ timeout: 30_000 });
  const check = p.getByRole("dialog", { name: "Run a conflict check" }); await check.locator("[data-searched]").waitFor({ timeout: 15_000 });
  await check.getByLabel("No conflict").check(); await check.getByRole("button", { name: "Save check" }).click(); await check.waitFor({ state: "detached", timeout: 15_000 });
};
/** Prepare from the prospect's card (screens), set the fee as version 2; Send only when asked (J-53 W2-W3's path). */
const prepare = async (pr: { id: string }, fee: string, send: boolean) => {
  await p.goto(`${BASE}/front-office/prospects/${pr.id}`);
  await card.getByRole("button", { name: "Prepare retainer" }).click({ timeout: 30_000 });
  const prep = p.getByRole("dialog", { name: "Prepare retainer" });
  await prep.getByLabel("Template").locator("option", { hasText: `Standard retainer ${run}` }).waitFor({ state: "attached", timeout: 10_000 });
  await prep.getByRole("button", { name: "Prepare retainer" }).click();
  await p.waitForURL(/\/front-office\/retainers\//, { timeout: 15_000 }); await status.waitFor({ timeout: 15_000 });
  await p.getByLabel("Fee 1: amount").fill(fee);
  await p.getByRole("button", { name: /^Save as version \d+$/ }).click();
  await p.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
  if (!send) return;
  await p.locator("[data-check-and-send]").click(); const s = p.getByRole("dialog", { name: /^Send to .* to sign$/ }); await s.waitFor();
  await s.getByRole("button", { name: /^Send to / }).click(); await status.filter({ hasText: "Sent" }).waitFor({ timeout: 15_000 });
};
/** The signing request of a document and its client signer, read back from the database ('' when none). */
const requestOf = (docId: string) => sql(`select r.id || '|' || r.status || '|' || coalesce(s.id::text, '') || '|' || coalesce(s.signed_at::text, '') from fo_signature_request r left join fo_signer s on s.request_id = r.id and s.role = 'CLIENT' where r.firm_id = '${firmId}' and r.document_id = '${docId}' order by r.sent_at desc limit 1`);
/** A door step's answer, short. */
const brief = (a: Ans) => ({ status: a.status, body: (a.text ?? "").slice(0, 160) });

try {
  // ---------------------------------------------------------------------------------------------- set-up by screens (J-53's walk): a template, a cleared conflict check, a sent retainer
  await p.goto(`${BASE}/front-office/settings/retainer-templates`);
  await p.getByRole("heading", { name: "Retainer templates" }).waitFor({ timeout: 30_000 });
  const dlS = p.waitForEvent("download"); await p.getByRole("button", { name: "Download a starter template" }).click();
  const starterFile = await (await dlS).path();
  await p.getByRole("button", { name: "Upload template" }).click();
  const up = p.getByRole("dialog", { name: "Upload template" });
  await up.getByLabel("Name").fill(`Standard retainer ${run}`); await up.getByLabel("Template file (.docx)").setInputFiles(starterFile);
  await up.getByRole("button", { name: "Upload template" }).click(); await up.waitFor({ state: "detached", timeout: 15_000 });
  await conflictCheck(A);

  // The client's invoice for a service already given (Sample: the paid consultation), drafted before the retainer is sent
  // so the one link can carry it. Card is never offered on a deposit (advance) invoice (BACKLOG FO-7c; contracts §2.5),
  // so the invoice is a FEE for a service given, not the retainer's deposit (see the report's conflict note).
  const RETAINER_FEE = "1500", FEE_MINOR = 25000;
  await prepare(A, RETAINER_FEE, true);
  const [ra] = await retOf(A.id);
  ok("J-61 setup: client A's retainer is Sent (version 2, by screens, as J-53 ends)", ra?.status === "SENT" && ra.currentVersion === 2, ra?.status);
  const draft = await staffApi("POST", "/api/front-office/money/invoices", { personId: A.pid, currency: "CAD", retainerId: ra.id }, tok);
  const d0 = draft.status === 201 ? draft : await staffApi("POST", "/api/front-office/money/invoices", { personId: A.pid, currency: "CAD" }, tok);
  const INV: string = d0.body?.id ?? "";
  const line = INV ? await staffApi("POST", `/api/front-office/money/invoices/${INV}/lines`, { kind: "FEE", description: `Consultation given (Sample ${run})`, unitMinor: FEE_MINOR }, tok) : null;
  ok("J-61 setup: client A's invoice draft with one fee line for a service given (FO-7b part 1a; started from the retainer when that part merges, else a plain draft)", !!INV && (line?.status === 201 || line?.status === 200), { draft: draft.status, fallback: d0.status, line: line?.status, retainerAccepted: draft.status === 201 });
  const issued = INV ? await staffApi("POST", `/api/front-office/money/invoices/${INV}/issue`, {}, tok) : null;
  const NUMBER = String(issued?.body?.invoice?.number ?? issued?.body?.number ?? "");   // issue answers { invoice, email } (FO-7b part 1b)
  ok("J-61 setup (FO-7b part 1b, #2953, on main): the invoice issues with an INV- number (only an issued invoice is paid)", issued?.status === 200 && /^INV-/.test(NUMBER), issued ? brief(issued) : "no draft");
  const total = INV ? Number(sql(`select coalesce(sum(amount_minor + tax_minor), 0) from money_invoice_line where invoice_id = '${INV}'`)) : 0;
  const amountWords = (total / 100).toFixed(2);   // the open amount the pay step must show (tax as the firm's default adds it)

  // ---------------------------------------------------------------------------------------------- W1 One link
  const req0 = requestOf(ra.id);
  ok("J-61 W1 (part missing: FO-6's routes, Send makes the signing request): Send made one live signing request for version 2 with a client signer", /^[0-9a-f-]{36}\|SENT\|[0-9a-f-]{36}\|$/.test(req0), req0 || "no fo_signature_request row");
  let mails: Mail[] = [];
  await until(async () => { mails = await inbox(A.email); return linksIn(mails, SIGN_LINK).length > 0; }, 15_000);
  const signLinks = linksIn(mails, SIGN_LINK), payLinks = linksIn(mails, PAY_LINK);
  ok("J-61 W1 (part missing: FO-6's routes, the signing email by MailPort): the client's email holds exactly one link to sign", signLinks.length === 1, { subjects: mails.map((m) => m.subject), signLinks: signLinks.length });
  ok("J-61 W1 (parts missing: FO-6's signing email; the row joining signing to paying, review gap G2): one link only, no second link to pay (the pay step rides on the signing link)",
    signLinks.length === 1 && payLinks.length === 0, { signLinks: signLinks.length, payLinks: payLinks.length });
  const LINK = signLinks[0] ? signLinks[0].replace(/^https?:\/\/[^/]+/, BASE) : "";
  const TOKEN = LINK ? tokenOf(LINK) : `j61-none-${run}`;

  // ---------------------------------------------------------------------------------------------- W2 opens the document to sign
  const door = jar();   // the client's browser, API side
  const st0 = await door("GET", `/api/public/sign/${TOKEN}`);
  ok("J-61 W2 (part missing: FO-6's public door GET /api/public/sign/:token): the link opens the agreement to sign (200, waiting for this client's signature, the firm named)",
    !!LINK && st0.status === 200 && /sign/i.test(st0.text) && !REFUSED.test(String(st0.body?.state ?? st0.body?.status ?? "")), { link: !!LINK, ...brief(st0) });
  const client = await fresh();
  if (LINK) { await client.page.goto(LINK); await client.page.waitForLoadState("networkidle").catch(() => undefined); }
  const w2 = await words(client.page);
  ok("J-61 W2 (part missing: FO-6's door page): the link's page shows the agreement and asks the client to sign, with no card form yet",
    !!LINK && /retainer|agreement/i.test(w2) && /sign/i.test(w2) && (await client.page.locator("input[autocomplete='cc-number'], iframe[src*='stripe']").count()) === 0, w2.slice(0, 200));

  // ---------------------------------------------------------------------------------------------- W3 the client signs through the link
  const codeAsk = await door("POST", `/api/public/sign/${TOKEN}/code`, {});
  let code = "";
  if (codeAsk.status < 300) await until(async () => { const m = (await inbox(A.email))[0]; code = /code/i.test(m?.subject + m?.body) ? (m.body.match(/\b(\d{6})\b/)?.[1] ?? "") : ""; return !!code; }, 15_000);
  const verify = await door("POST", `/api/public/sign/${TOKEN}/code/verify`, { code });
  const consent = await door("POST", `/api/public/sign/${TOKEN}/consent`, { agree: true, consentTextVersion: st0.body?.consentTextVersion ?? st0.body?.consent?.textVersion });
  const session = await door("GET", `/api/public/sign/${TOKEN}/session`);
  ok("J-61 W3 (part missing: FO-6's door, email code (P-564), consent and signing session): the code by email verifies, consent is recorded, the signing session opens",
    codeAsk.status < 300 && !!code && verify.status < 300 && verify.cookies.length > 0 && consent.status < 300 && session.status === 200 && !!session.body?.url,
    { code: codeAsk.status, gotCode: !!code, verify: verify.status, cookie: verify.cookies.length > 0, consent: consent.status, session: brief(session) });
  // The fake adapter's link (port.ts) is https://signing.fake.invalid/…, which no browser opens: a running copy needs FO-6's
  // routes to give the fake a page of its own (on this copy) where the signer signs, the copy then sending itself the
  // fake's signed event. Until then nothing can sign on a running copy.
  const sUrl = String(session.body?.url ?? "");
  const onCopy = !!sUrl && new URL(sUrl, BASE).origin === new URL(BASE).origin;
  if (onCopy) {
    await client.page.goto(new URL(sUrl, BASE).toString()); await client.page.getByRole("button", { name: /^sign/i }).first().click({ timeout: 15_000 }).catch(() => undefined);
    await until(async () => (requestOf(ra.id).split("|")[3] ?? "") !== "", 30_000);
  }
  const req1 = requestOf(ra.id);
  ok("J-61 W3 (part missing: FO-6's routes, a signing page for the fake adapter on the running copy; the fake's link points at signing.fake.invalid): the client signs; the client signer is signed and the request reads CLIENT_SIGNED",
    onCopy && /\|CLIENT_SIGNED\|[0-9a-f-]{36}\|\d/.test(req1), { sessionUrlHost: sUrl ? new URL(sUrl, BASE).host : "none", request: req1 || "none" });

  // ---------------------------------------------------------------------------------------------- W4 then the invoice to pay (the same link)
  const st1 = await door("GET", `/api/public/sign/${TOKEN}`);
  ok("J-61 W4 (parts missing: the row joining signing to paying, review gap G2; FO-7c's pay step): after the signature the same link answers the invoice to pay: its number and open amount",
    st1.status === 200 && !!NUMBER && st1.text.includes(NUMBER) && (st1.text.includes(String(total)) || st1.text.includes(amountWords)), { number: NUMBER, total, ...brief(st1) });
  if (LINK) { await client.page.goto(LINK); await client.page.waitForLoadState("networkidle").catch(() => undefined); }
  const w4 = await words(client.page);
  const payBtn = client.page.getByRole("button", { name: /^pay/i }).or(client.page.getByRole("link", { name: /^pay/i }));
  ok("J-61 W4 (parts missing: G2's joining row; FO-7c's pay page): the link's page now shows the invoice (number, amount) and offers Pay",
    !!NUMBER && w4.includes(NUMBER) && w4.includes(amountWords) && (await payBtn.count()) >= 1, w4.slice(0, 200));

  // ---------------------------------------------------------------------------------------------- W5 the client pays by card through the link
  const paidBefore = INV ? sql(`select count(*) from money_payment where firm_id = '${firmId}' and invoice_id = '${INV}' and method = 'CARD'`) : "0";
  let payUrl = "";
  if (await payBtn.count()) {
    const nav = client.page.waitForRequest((r) => /fake-rail\.example|stripe\.com|\/pay\//.test(r.url()), { timeout: 15_000 }).catch(() => null);
    await payBtn.first().click().catch(() => undefined); payUrl = (await nav)?.url() ?? "";
  }
  const payOnCopy = !!payUrl && new URL(payUrl).origin === new URL(BASE).origin;
  if (payOnCopy) { await client.page.getByRole("button", { name: /^pay/i }).first().click({ timeout: 15_000 }).catch(() => undefined); }
  const paid = INV ? await until(async () => sql(`select count(*) from money_payment where firm_id = '${firmId}' and invoice_id = '${INV}' and method = 'CARD' and amount_minor = ${total} and stripe_payment_intent_id is not null`) === "1", payOnCopy ? 30_000 : 1_000) : false;
  ok("J-61 W5 (parts missing: FO-7c's later part, the hosted payment and the processor's event; a fake pay page on the running copy): the client pays the full open amount by card through the link; one CARD payment is recorded from the processor's event",
    paidBefore === "0" && paid, { payUrlHost: payUrl ? new URL(payUrl).host : "none", paidBefore });

  // ---------------------------------------------------------------------------------------------- W6 it works once: the used link, same browser
  const signedNow = requestOf(ra.id).split("|")[3] ?? "";   // the client signer's signed_at, "" when none (or no request)
  const mailsBefore = (await inbox(A.email)).length;
  if (LINK) { await client.page.goto(LINK); await client.page.waitForLoadState("networkidle").catch(() => undefined); }
  const w6 = await words(client.page);
  const st6 = await door("GET", `/api/public/sign/${TOKEN}`), code6 = await door("POST", `/api/public/sign/${TOKEN}/code`, {}), sess6 = await door("GET", `/api/public/sign/${TOKEN}/session`);
  const formsLeft = (await client.page.getByRole("button", { name: /^(sign|pay)/i }).count()) + (await client.page.locator("input[autocomplete='cc-number']").count());
  ok("J-61 W6 (parts missing: FO-6's door, G2's joining row, FO-7c): the used link, opened again in the same browser, is refused in words (used / signed and paid), with no Sign, no Pay and no card form",
    signedNow !== "" && paid && REFUSED.test(w6) && formsLeft === 0, { page: w6.slice(0, 200), formsLeft, signed: signedNow !== "", paid });
  ok("J-61 W6 (part missing: FO-6's door): on the API the used link gives its ended state in words, sends no new code and opens no signing session; no personal data",
    signedNow !== "" && st6.status < 500 && REFUSED.test(st6.text) && !st6.text.includes(A.given) && !st6.text.includes(A.email) && code6.status >= 400 && sess6.status >= 400 && (await inbox(A.email)).length === mailsBefore,
    { state: brief(st6), code: code6.status, session: sess6.status });

  // ---------------------------------------------------------------------------------------------- W7 forwarded after use: a fresh browser
  const fwd = await fresh(), fwdApi = jar();
  if (LINK) { await fwd.page.goto(LINK); await fwd.page.waitForLoadState("networkidle").catch(() => undefined); }
  const w7 = await words(fwd.page);
  const st7 = await fwdApi("GET", `/api/public/sign/${TOKEN}`), code7 = await fwdApi("POST", `/api/public/sign/${TOKEN}/code`, {}), cons7 = await fwdApi("POST", `/api/public/sign/${TOKEN}/consent`, { agree: true });
  ok("J-61 W7 (parts missing: FO-6's door, G2's joining row, FO-7c): the link forwarded after use, opened in a fresh browser, is refused in words, with no personal data, no Sign, no Pay, no card form",
    signedNow !== "" && paid && REFUSED.test(w7) && !w7.includes(A.given) && (await fwd.page.getByRole("button", { name: /^(sign|pay)/i }).count()) === 0 && (await fwd.page.locator("input[autocomplete='cc-number']").count()) === 0,
    { page: w7.slice(0, 200) });
  ok("J-61 W7 (part missing: FO-6's door): on the API the forwarded used link is refused the same way: no code is sent, consent is refused",
    signedNow !== "" && REFUSED.test(st7.text) && code7.status >= 400 && cons7.status >= 400 && (await inbox(A.email)).length === mailsBefore, { state: brief(st7), code: code7.status, consent: cons7.status });
  await fwd.ctx.close();

  // ---------------------------------------------------------------------------------------------- W8 and expires
  // Stand-in (said): a signing request for client B's retainer written by SQL with its time already past (sent 15 days ago,
  // expired 1 day ago, Sample), as FO-6 would leave it on day 15; its token's sha256 by this journey's reading of FO-6.
  await conflictCheck(B); await prepare(B, "1800", false);
  const [rb] = await retOf(B.id);
  const T_EXP = randomBytes(24).toString("base64url"), sha = createHash("sha256").update(T_EXP).digest("hex");
  let expWritten = false;
  try {
    const vId = rb.versions.find((v) => v.n === rb.currentVersion)!.id;
    const rq = sql(`insert into fo_signature_request (id, firm_id, document_kind, document_id, document_version_id, document_version, provider, provider_document_id, sent_by, sent_at, expires_at, updated_at)
      values (gen_random_uuid(), '${firmId}', 'RETAINER', '${rb.id}', '${vId}', ${rb.currentVersion}, 'FAKE', 'fake-j61-expired-${run}', '${ownerId}', now() - interval '15 days', now() - interval '1 day', now()) returning id`);
    sql(`insert into fo_signer (id, firm_id, request_id, role, sign_order, person_id, link_token_sha256) values (gen_random_uuid(), '${firmId}', '${rq}', 'CLIENT', 1, '${B.pid}', '${sha}');
      insert into fo_signer (id, firm_id, request_id, role, sign_order, staff_id, link_token_sha256) values (gen_random_uuid(), '${firmId}', '${rq}', 'FIRM', 2, '${ownerId}', '${createHash("sha256").update(`${T_EXP}-firm`).digest("hex")}'); select 1`);
    expWritten = true;
  } catch (e) { console.log(`  note: the expired request could not be written: ${String((e as { stderr?: string }).stderr ?? e).split("\n")[0]}`); }
  const exp = await fresh(), expApi = jar();
  const st8 = await expApi("GET", `/api/public/sign/${T_EXP}`), code8 = await expApi("POST", `/api/public/sign/${T_EXP}/code`, {});
  await exp.page.goto(`${BASE}/sign/${T_EXP}`); await exp.page.waitForLoadState("networkidle").catch(() => undefined);
  const w8 = await words(exp.page);
  ok("J-61 W8 (parts missing: FO-6's door and its page; stand-in: the expired request written by SQL): an expired link is refused in words (\"expired\"), sends no code, shows no Sign and no personal data",
    expWritten && st8.status < 500 && /expired/i.test(st8.text) && code8.status >= 400 && /expired/i.test(w8) && !w8.includes(B.given) && (await exp.page.getByRole("button", { name: /^sign/i }).count()) === 0,
    { written: expWritten, state: brief(st8), code: code8.status, page: w8.slice(0, 160) });
  await exp.ctx.close(); await client.ctx.close();

  ok("J-61: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
