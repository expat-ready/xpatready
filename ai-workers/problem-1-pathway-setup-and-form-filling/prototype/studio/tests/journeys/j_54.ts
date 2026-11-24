// J-54 (map row 54, R1.54: "E-signature with evidence; send any document for signature"), written by the qa lane (22 Nov)
// BEFORE its parts merge, so qa only has to run it when they do. It walks the firm's Owner (a licensed representative) and
// two clients (Sample) on an isolated copy of the running app (its own database and port, never :4400), by screens where
// they exist and on the routes and the database underneath.
// Done when (CAPABILITIES R1.54), word for word as the steps:
//   "Signing in the vendor's sandbox (no priced call)"   W1: Send makes one signing request carried by the vendor's
//        sandbox adapter (FO-6v, held P-561); this copy has no vendor key, so no call is made or priced here and the step
//        fails on an isolated copy until FO-6v merges and runs with the sandbox key (a Mac check); W2-W3 walk the signature
//        on the fake adapter that stands in for it (client at the door, then the firm last).
//   "returns the signed file"                              W4: the sealed copy is stored and hashed (fo_signing_evidence)
//        and the firm downloads it: the bytes' sha256 is the stored one, a PDF.
//   "and its evidence"                                     W5: the provider's audit file is stored and hashed with the
//        consent text version the signer agreed to; the firm downloads it and its sha256 matches.
//   "stored on the person"                                 W6: the signed copy is listed on the client's person record
//        (the person's documents, read back by sha256) and the prospect's page offers the signed copy.
//   "any uploaded PDF can be sent for signature"           W7: an uploaded PDF (not a retainer) is sent to two people on a
//        prospect, kind OTHER; each signs by their own link; the sealed copy is filed on both people; the prospect does
//        not move; W8: a file that is not a PDF is refused in words; no session is 401; W9: the prospect page offers
//        "Send for signature" (FO-6ds).
// Parts (MVP-CHECKLIST row 54: FO-6, FO-6v (held, P-561), FO-6d, FO-6ds): FO-6's routes (Send makes the request and its
// email; the public door GET/POST /api/public/sign/:token[/code|/code/verify|/consent|/session] from BACKLOG row FO-6),
// FO-6 part 3 (the evidence: sealed and audit files stored, hashed, downloadable, on the person), FO-6v, FO-6d, FO-6ds.
// Each failing step names its part. Guessed routes (said): the firm signer's link POST /api/front-office/retainers/:id/
// firm-signing-link; the downloads through the existing POST /api/front-office/retainers/:id/download-link with
// file "signed" and "evidence"; the person's documents GET /api/front-office/people/:id/documents; FO-6d's send
// POST /api/front-office/signature-requests (multipart: file, title, prospectId, signerPersonIds). The fake adapter's
// signing link (port.ts) points at signing.fake.invalid, which no browser opens: W2's label names the missing page.
// Parts as of 24 Nov (qa 11, run on #3490's head 9b3ac365a: 14/21 twice): the door FO-6 part 4b #3460 and the stand-in page
// and firm link 4c #3490 (W2-W3); the e-signed retainer's downloads 4d #3536 (W4-W5); FO-5s's signed-copy button on the card
// (W6, no PR); QA-782, no OTHER signer is emailed a link (W7, no part); FO-6v, the vendor's sandbox (W1, held P-561).
// Sample values only; US$0, no model call, no live mail, no vendor call (the browser refuses the vendor and fake hosts).
// No screenshots are written. Legal points (e-signature identity): Unconfirmed: no counsel. Run from prototype/:
//   zsh studio/tools/isolated.sh j54 4454 start --ttl 30 PLATFORM_IDENTITY=local && trap 'zsh studio/tools/isolated.sh j54 4454 stop' EXIT && npx tsx --tsconfig studio/api/tsconfig.json studio/tests/journeys/j_54.ts j54 4454
import "reflect-metadata";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { chromium, type BrowserContext, type Page } from "playwright";
import { seedSampleFirmsFrontOffice } from "../../api/src/front-office/firm-seed.ts";
import { seedSampleFirms } from "../../api/src/platform/seed-sample-firms.ts";
import { client, recorder } from "../runtime/api.ts";

const [NAME, PORT] = [process.argv[2] ?? "j54", Number(process.argv[3] ?? 4454)];
if (PORT === 4400) { console.log("refused: never the demo on :4400"); process.exit(2); }
const DBNAME = `xr_studio_${NAME}`, BASE = `http://localhost:${PORT}`;
const HEADED = process.env.HEADED === "1";
const { ok, summary } = recorder();
const { sql: rawSql, until } = client(PORT, DBNAME);
const sql = (q: string) => rawSql(q).split("\n")[0].trim();
const run = Date.now().toString(36);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://xr_studio@127.0.0.1:54329/${DBNAME}`, options: "-c TimeZone=UTC" }) });
type Ans = { status: number; body: any; text: string; bytes: Buffer; type: string; cookies: string[] };   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other journeys
/** One "browser" for the API: its own cookie jar (the door's signing session is an http-only cookie). */
const jar = () => {
  const c = new Map<string, string>();
  return async (method: string, path: string, body?: unknown, token?: string, form?: FormData): Promise<Ans> => {
    const headers: Record<string, string> = { ...(form ? {} : { "content-type": "application/json" }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(c.size ? { cookie: [...c].map(([k, v]) => `${k}=${v}`).join("; ") } : {}) };
    const r = await fetch(`${BASE}${path}`, { method, redirect: "manual", headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const cookies = r.headers.getSetCookie(); for (const s of cookies) { const [kv] = s.split(";"); const i = kv.indexOf("="); if (i > 0) c.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim()); }
    const bytes = Buffer.from(await r.arrayBuffer()), text = bytes.toString("utf8"); let b: unknown = null; try { b = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, body: b, text, bytes, type: r.headers.get("content-type") ?? "", cookies };
  };
};
const api = jar();
const brief = (a: Ans) => ({ status: a.status, body: a.text.slice(0, 160) });
type Mail = { subject: string; body: string };
/** The demo inbox (SI-20), newest first (demo-inbox.ts). */
const inbox = async (address: string): Promise<Mail[]> => ((await (await fetch(`${BASE}/api/demo/platform-inbox?address=${encodeURIComponent(address)}`)).json().catch(() => ({}))) as { messages?: Mail[] }).messages ?? [];
const SIGN_LINK = /https?:\/\/[^\s)>"]+\/sign\/[^\s)>"]+/;
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const PDF = Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% Sample letter of engagement addendum (J-54 ${run}), not a real document\ntrailer << /Root 1 0 R >>\n%%EOF\n`, "latin1");

// ------------------------------------------------------------------------------------------------ setup (Sample)
await seedSampleFirms(db);
const fo = await seedSampleFirmsFrontOffice(db);
const firmId = sql(`select id from platform_firm where key = 'sample-firm'`);
ok("J-54 setup: the Sample firm and its front office are seeded", !!firmId && fo.failed.length === 0, fo.failed);
const [ownerId, ownerEmail] = sql(`select id || '|' || email from platform_staff where actor_id = 'user-R'`).split("|");   // Owner + Case Manager, licensed
const person = (tag: string) => {
  const given = `Client${tag}${run}`, email = `j54.${tag.toLowerCase()}.${run}@example.com`;
  const pid = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${given}', 'Sample', '${email}', 'test', now()) returning id`);
  return { pid, email, given };
};
/** An engaged individual prospect (its one person is subject and primary contact, the database's rule). */
const prospect = (subject: ReturnType<typeof person>) => {
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${subject.pid}', 'MANUAL', 'WEBSITE', '${ownerId}', 'ENGAGED', now(), 'test', 'test', now())`);
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${firmId}', l.id, 'INDIVIDUAL', (select id from fo_stage where firm_id = '${firmId}' and pipeline = 'INDIVIDUAL' and key = 'ENGAGED'), '${subject.pid}', '${subject.pid}', '${ownerId}', 'test', now() from fo_lead l where l.person_id = '${subject.pid}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  return { id, ...subject };
};
/** An engaged Corporate prospect (Sample company) with two people on it: its primary contact and a signatory. */
const corporate = (primary: ReturnType<typeof person>, signatory: ReturnType<typeof person>) => {
  const co = sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${firmId}', 'Sample Employer ${run}', 'sample employer ${run}', 'test', now()) returning id`);
  sql(`insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${firmId}', '${co}', '${primary.pid}', 'PRIMARY', 'test'), ('${firmId}', '${co}', '${signatory.pid}', 'SIGNATORY', 'test'); select 1`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${firmId}', '${primary.pid}', 'MANUAL', 'WEBSITE', '${ownerId}', 'ENGAGED', now(), 'test', 'test', now())`);
  const id = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${firmId}', l.id, 'CORPORATE', (select id from fo_stage where firm_id = '${firmId}' and pipeline = 'CORPORATE' and key = 'ENGAGED'), '${co}', '${primary.pid}', '${ownerId}', 'test', now() from fo_lead l where l.person_id = '${primary.pid}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${id}'`);
  return { id };
};
const PA = person("A"), PB = person("B"), PC = person("C");
const A = prospect(PA), B = corporate(PB, PC);   // B (Corporate) has two people on it: its primary contact (B) and a signatory (C)
const tok = (await api("POST", "/api/platform/session/local", { firmKey: "sample-firm", email: ownerEmail, secondStep: true })).body?.token as string | undefined;
if (!tok) { console.error("STOP  local sign-in refused (start the copy with PLATFORM_IDENTITY=local)"); process.exit(2); }
sql(`update fo_retainer_template set active = false where firm_id = '${firmId}'`);   // re-runnable: one active template

const browser = await chromium.launch({ headless: !HEADED, slowMo: HEADED ? 250 : 0, ...(process.platform === "darwin" ? { channel: "chrome" } : existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {}) });
const errors: string[] = [];
const fresh = async (): Promise<{ ctx: BrowserContext; page: Page }> => {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 900 }, reducedMotion: "reduce" });
  await ctx.route(/boldsign\.com|signing\.fake\.invalid/, (r) => r.abort());   // no vendor call, ever
  const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(String(e))); return { ctx, page };
};
const staff = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", reducedMotion: "reduce", acceptDownloads: true });
await staff.route(/boldsign\.com|signing\.fake\.invalid/, (r) => r.abort());
await staff.addInitScript((x) => sessionStorage.setItem("xr-staff-session", JSON.stringify({ token: x, expiresAt: Date.now() + 3_600_000 })), tok);
const p: Page = await staff.newPage(); p.on("pageerror", (e) => errors.push(String(e)));
const card = p.locator("[data-retainer-card]"), status = p.locator("[data-retainer-status]");
const retOf = (prospectId: string) => db.foRetainer.findMany({ where: { firmId, prospectId }, orderBy: { createdAt: "asc" } });
const conflictCheck = async (pr: { id: string }) => {
  await p.goto(`${BASE}/front-office/prospects/${pr.id}`);
  const panel = p.locator("[data-conflict-panel]"); await panel.getByRole("button", { name: "Run a check" }).click({ timeout: 30_000 });
  const check = p.getByRole("dialog", { name: "Run a conflict check" }); await check.locator("[data-searched]").waitFor({ timeout: 15_000 });
  await check.getByLabel("No conflict").check(); await check.getByRole("button", { name: "Save check" }).click(); await check.waitFor({ state: "detached", timeout: 15_000 });
};
/** Prepare from the prospect's card (screens), save the fee as version 2, Check and send (J-53 W2-W3's path). */
const prepareAndSend = async (pr: { id: string }, fee: string) => {
  await p.goto(`${BASE}/front-office/prospects/${pr.id}`);
  await card.getByRole("button", { name: "Prepare retainer" }).click({ timeout: 30_000 });
  const prep = p.getByRole("dialog", { name: "Prepare retainer" });
  await prep.getByLabel("Template").locator("option", { hasText: `Standard retainer ${run}` }).waitFor({ state: "attached", timeout: 10_000 });
  await prep.getByRole("button", { name: "Prepare retainer" }).click();
  await p.waitForURL(/\/front-office\/retainers\//, { timeout: 15_000 }); await status.waitFor({ timeout: 15_000 });
  await p.getByLabel("Fee 1: amount").fill(fee);
  await p.getByRole("button", { name: /^Save as version \d+$/ }).click();
  await p.locator("[data-version]", { hasText: "Version 2" }).waitFor({ timeout: 15_000 });
  await p.locator("[data-check-and-send]").click(); const s = p.getByRole("dialog", { name: /^Send to .* to sign$/ }); await s.waitFor();
  await s.getByRole("button", { name: /^Send to / }).click(); await status.filter({ hasText: "Sent" }).waitFor({ timeout: 15_000 });
};
/** The newest signing request of a document: id|kind|status|provider|clients|firm signers ('' when none). */
const requestOf = (docId: string) => sql(`select r.id || '|' || r.document_kind || '|' || r.status || '|' || r.provider || '|' || (select count(*) from fo_signer s where s.request_id = r.id and s.role = 'CLIENT') || '|' || (select count(*) from fo_signer s where s.request_id = r.id and s.role = 'FIRM') from fo_signature_request r where r.firm_id = '${firmId}' and r.document_id = '${docId}' order by r.sent_at desc limit 1`);
const signedOf = (reqId: string, personId: string) => reqId ? sql(`select count(*) from fo_signer where request_id = '${reqId}' and person_id = '${personId}' and signed_at is not null`) === "1" : false;
/** Finishes a signing session link on the copy's own page (the fake adapter's, once FO-6's routes give it one). */
const finish = async (pg: Page, url: string, done: () => boolean): Promise<string> => {
  if (!url) return "no session link";
  const u = new URL(url, BASE);
  if (u.origin !== new URL(BASE).origin) return `the session link points off the copy (${u.host})`;
  await pg.goto(u.toString()); await pg.getByRole("button", { name: /^sign/i }).first().click({ timeout: 15_000 }).catch(() => undefined);
  return (await until(async () => done(), 30_000)) ? "signed" : "clicked, not recorded";
};
/** A client signs by their emailed link through the public door: code by email (P-564), consent, session, sign. */
const signByEmail = async (who: { email: string }, reqId: string, personId: string) => {
  let link = "";
  await until(async () => { link = (await inbox(who.email)).map((m) => m.body.match(SIGN_LINK)?.[0]).find(Boolean) ?? ""; return !!link; }, 15_000);
  const token = link.match(/\/sign\/([^/?#\s]+)/)?.[1] ?? `j54-none-${run}`;
  const door = jar(), st = await door("GET", `/api/public/sign/${token}`), ask = await door("POST", `/api/public/sign/${token}/code`, {});
  let code = "";
  if (ask.status < 300) await until(async () => { const m = (await inbox(who.email))[0]; code = /code/i.test(`${m?.subject} ${m?.body}`) ? (m.body.match(/\b(\d{6})\b/)?.[1] ?? "") : ""; return !!code; }, 15_000);
  const verify = await door("POST", `/api/public/sign/${token}/code/verify`, { code });
  const consent = await door("POST", `/api/public/sign/${token}/consent`, { agree: true, consentTextVersion: st.body?.consentTextVersion ?? st.body?.consent?.textVersion });
  const session = await door("GET", `/api/public/sign/${token}/session`);
  const c = await fresh(); const how = await finish(c.page, String(session.body?.url ?? ""), () => signedOf(reqId, personId)); await c.ctx.close();
  return { link: !!link, door: st.status, code: ask.status, gotCode: !!code, verify: verify.status, consent: consent.status, session: session.status, how, signed: signedOf(reqId, personId) };
};

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
  await prepareAndSend(A, "1500");
  const [ra] = await retOf(A.id);
  ok("J-54 setup: client A's retainer is Sent (version 2, by screens, as J-53 ends)", ra?.status === "SENT" && ra.currentVersion === 2, ra?.status);

  // ---------------------------------------------------------------------------------------------- W1 signing in the vendor's sandbox (no priced call)
  const r1 = requestOf(ra.id), REQ = r1.split("|")[0] ?? "";
  ok("J-54 W1 (FO-6 part 3, on main): Send made one live RETAINER signing request with one client signer and the firm signer", /^[0-9a-f-]{36}\|RETAINER\|SENT\|\w+\|1\|1$/.test(r1), r1 || "no fo_signature_request row");
  ok("J-54 W1 (part missing: FO-6v, the vendor's sandbox adapter, held P-561; fails on every isolated copy, which has no sandbox key and so prices no call, until FO-6v runs on the Mac with the sandbox key): the request is carried by the vendor's sandbox (provider BOLDSIGN)",
    r1.split("|")[3] === "BOLDSIGN", r1 || "no request");

  // ---------------------------------------------------------------------------------------------- W2-W3 the signature (fake adapter standing in for the sandbox)
  const w2 = await signByEmail(PA, REQ, PA.pid);
  ok("J-54 W2 (FO-6 part 4b, the public door, #3460): client A opens their emailed link, verifies the code, consents, and the signing session opens",
    w2.link && w2.door === 200 && w2.gotCode && w2.verify < 300 && w2.consent < 300 && w2.session === 200, w2);
  ok("J-54 W2 (FO-6 part 4c, the fake's stand-in signing page, #3490, on 4b #3460): client A signs; their signer row is signed and the request reads CLIENT_SIGNED",
    w2.signed && REQ !== "" && requestOf(ra.id).split("|")[2] === "CLIENT_SIGNED", { how: w2.how, request: requestOf(ra.id) || "none" });
  // The firm signer agrees to sign electronically on the way in: FO-6 part 4c's strict body (#3490, routes.ts
  // FirmSigningLinkBody; the words' version is door.ts's CONSENT_TEXT_VERSION). Aligned by qa 8, 24 Nov: it posted {}
  // before, which part 4c answers 422.
  const fl = await api("POST", `/api/front-office/retainers/${ra.id}/firm-signing-link`, { consent: true, consentTextVersion: "sign-electronically-v1" }, tok);
  const fc = await fresh(); const firmHow = await finish(fc.page, String(fl.body?.url ?? ""), () => requestOf(ra.id).split("|")[2] === "SIGNED"); await fc.ctx.close();
  ok("J-54 W3 (FO-6 part 4c, the firm signer's link and the stand-in page, #3490): the representative signs last; the request reads SIGNED",
    fl.status === 200 && requestOf(ra.id).split("|")[2] === "SIGNED", { link: brief(fl), how: firmHow });

  // ---------------------------------------------------------------------------------------------- W4 returns the signed file
  const ev = REQ ? sql(`select coalesce((select sealed_file_key || '|' || sealed_sha256 || '|' || audit_file_key || '|' || audit_sha256 || '|' || consent_text_version from fo_signing_evidence where request_id = '${REQ}'), '')`) : "";
  const [sealedKey, sealedSha, auditKey, auditSha, consentV] = ev.split("|");
  ok("J-54 W4 (FO-6 part 3, the evidence, on main; signed through 4b #3460 and 4c #3490): the sealed copy is stored with us under signing/ and hashed (fo_signing_evidence)", !!sealedKey && /^[0-9a-f]{64}$/.test(sealedSha ?? ""), ev || "no evidence row");
  const download = async (file: string) => {
    const l = await api("POST", `/api/front-office/retainers/${ra.id}/download-link`, { file }, tok);
    const f = l.status === 200 && l.body?.url ? await api("GET", String(l.body.url), undefined, tok) : null;
    return { link: l.status, file: f?.status ?? 0, type: f?.type ?? "", sha: f ? sha256(f.bytes) : "" };
  };
  const signedFile = await download("signed");
  ok("J-54 W4 (part missing: FO-6 part 4d, the e-signed retainer's downloads, #3536; body file \"signed\"): the firm downloads the signed file: a PDF whose sha256 is the stored one",
    !!sealedSha && signedFile.file === 200 && /pdf/.test(signedFile.type) && signedFile.sha === sealedSha, signedFile);

  // ---------------------------------------------------------------------------------------------- W5 and its evidence
  const signerConsent = REQ ? sql(`select coalesce(string_agg(distinct consent_text_version, ','), '') from fo_signer where request_id = '${REQ}'`) : "";
  ok("J-54 W5 (FO-6 part 3, the evidence, on main): the provider's audit file is stored and hashed, with the consent text version every signer agreed to",
    !!auditKey && auditKey !== sealedKey && /^[0-9a-f]{64}$/.test(auditSha ?? "") && !!consentV && signerConsent === consentV, { ev: ev || "none", signerConsent });
  const auditFile = await download("evidence");
  ok("J-54 W5 (part missing: FO-6 part 4d, #3536; body file \"evidence\"): the firm downloads the evidence file and its sha256 is the stored one",
    !!auditSha && auditFile.file === 200 && auditFile.sha === auditSha, auditFile);

  // ---------------------------------------------------------------------------------------------- W6 stored on the person
  const docs = await api("GET", `/api/front-office/people/${PA.pid}/documents`, undefined, tok);
  ok("J-54 W6 (FO-6d, the person's documents, on main): client A's person record lists the signed copy (its sha256)",
    !!sealedSha && docs.status === 200 && docs.text.includes(sealedSha), brief(docs));
  await p.goto(`${BASE}/front-office/prospects/${A.id}`); await card.waitFor({ timeout: 30_000 }).catch(() => undefined);
  const cardWords = (await card.innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("J-54 W6 (part missing: FO-5s, the retainer card's signed-copy button; no open PR): the prospect's page says the retainer is signed and offers the signed copy",
    requestOf(ra.id).split("|")[2] === "SIGNED" && /signed/i.test(cardWords) && (await card.getByRole("button", { name: /signed copy/i }).or(card.getByRole("link", { name: /signed copy/i })).count()) >= 1, cardWords.slice(0, 200));

  // ---------------------------------------------------------------------------------------------- W7 any uploaded PDF can be sent for signature (FO-6d)
  const stageBefore = sql(`select stage_id from fo_prospect where id = '${B.id}'`);
  const send = (file: { name: string; type: string; bytes: Buffer } | null, token?: string) => {
    const f = new FormData(); f.append("title", `Engagement addendum (Sample ${run})`); f.append("prospectId", B.id); f.append("signerPersonIds", `${PB.pid},${PC.pid}`);
    if (file) f.append("file", new Blob([new Uint8Array(file.bytes)], { type: file.type }), file.name);
    return api("POST", "/api/front-office/signature-requests", undefined, token, f);
  };
  const other = await send({ name: "addendum.pdf", type: "application/pdf", bytes: PDF }, tok);
  const OTHER_ID = String(other.body?.id ?? other.body?.requestId ?? "");
  const ro = OTHER_ID ? sql(`select coalesce((select document_kind || '|' || status || '|' || (select count(*) from fo_signer s where s.request_id = r.id and s.role = 'CLIENT') from fo_signature_request r where r.id = '${OTHER_ID}'), '')`) : "";
  ok("J-54 W7 (FO-6d, on main): an uploaded PDF is sent to the prospect's two people: one OTHER request with two client signers",
    (other.status === 201 || other.status === 200) && ro === "OTHER|SENT|2", { send: brief(other), row: ro || "none" });
  const sb = await signByEmail(PB, OTHER_ID, PB.pid), sc = await signByEmail(PC, OTHER_ID, PC.pid);
  ok("J-54 W7 (part missing: QA-782, no OTHER signer is emailed a link; no part named): each of the two people signs by their own emailed link", sb.signed && sc.signed, { B: sb, C: sc });
  const oev = OTHER_ID ? sql(`select coalesce((select sealed_sha256 from fo_signing_evidence where request_id = '${OTHER_ID}'), '')`) : "";
  const docsB = await api("GET", `/api/front-office/people/${PB.pid}/documents`, undefined, tok), docsC = await api("GET", `/api/front-office/people/${PC.pid}/documents`, undefined, tok);
  ok("J-54 W7 (part missing: QA-782; FO-6d files it once signed): the sealed copy of the uploaded PDF is filed, hashed, and listed on both people",
    /^[0-9a-f]{64}$/.test(oev) && docsB.text.includes(oev) && docsC.text.includes(oev), { sealed: oev || "none", B: docsB.status, C: docsC.status });
  ok("J-54 W7 (part missing: QA-782): an OTHER document never moves the prospect (its stage unchanged, no prospect.won)",
    !!OTHER_ID && sb.signed && sc.signed && sql(`select stage_id from fo_prospect where id = '${B.id}'`) === stageBefore
      && sql(`select count(*) from audit_event where firm_id = '${firmId}' and action = 'prospect.won' and (entity_key = '${B.id}' or detail::text like '%${B.id}%')`) === "0", { sent: !!OTHER_ID, signed: sb.signed && sc.signed });

  // ---------------------------------------------------------------------------------------------- W8 fails: not a PDF, no session
  const before8 = sql(`select count(*) from fo_signature_request where firm_id = '${firmId}'`);
  const notPdf = await send({ name: "addendum.pdf", type: "application/pdf", bytes: Buffer.from("not a pdf at all") }, tok);
  ok("J-54 W8 fail (FO-6d, on main): a file that is not a PDF (named .pdf) is refused in words (422, \"PDF\"); nothing is sent",
    notPdf.status === 422 && /PDF/.test(notPdf.text) && sql(`select count(*) from fo_signature_request where firm_id = '${firmId}'`) === before8, brief(notPdf));
  const anon = await send({ name: "addendum.pdf", type: "application/pdf", bytes: PDF });
  ok("J-54 W8 fail (FO-6d, on main): with no session the send is refused (401); nothing is sent",
    anon.status === 401 && sql(`select count(*) from fo_signature_request where firm_id = '${firmId}'`) === before8, anon.status);

  // ---------------------------------------------------------------------------------------------- W9 by screens (FO-6ds)
  await p.goto(`${BASE}/front-office/prospects/${B.id}`); await p.locator("main").waitFor({ timeout: 30_000 }); await card.waitFor({ timeout: 15_000 }).catch(() => undefined);
  const offer = await p.getByRole("button", { name: /send for signature/i }).count();
  ok("J-54 W9 (FO-6ds, on main): the prospect's page offers Send for signature", offer >= 1, `${offer} buttons`);

  ok("J-54: no page error during the walk", errors.length === 0, errors.slice(0, 5));
} finally {
  await browser.close();
  await db.$disconnect();
}
process.exit(summary() ? 1 : 0);
