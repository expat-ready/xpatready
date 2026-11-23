// FO-6d (BACKLOG row FO-6d; AG-5-61; P-564): send any PDF for signature. Each Done-when line with a passing and a failing
// case, on one scratch database (every migration, PF-3's and FO-1a's Sample seeds), dropped at the end. A Nest app is
// built from the retainers feature (files, links) and this row's feature beside PF-4's guard and the local sign-in
// stand-in; the provider's webhook goes through FO-6 part 3's own controller. The signers' consent is written as FO-6
// part 4's door will write it (that door is not this part). Fake adapter, fake mail: no vendor call, no network, no model
// call (US$0). Sample values. Legal points (e-signature identity): Unconfirmed: no counsel.
//   npx tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo6d_any_document.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations"), NEW = "20261123120000_fo6d_any_document";
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo6d_${process.pid}`, URL = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `fo6d-check-${process.pid}`), CONSENT = "sign-electronically-v1";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const psql = (args: string[]) => execFileSync(join(BIN, "psql"), [URL, "-v", "ON_ERROR_STOP=1", "-q", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sql = (q: string) => psql(["-Atc", q]);
const count = (t: string, where = "true") => Number(sql(`select count(*) from ${t} where ${where}`));
const refusedSql = (q: string, re: RegExp) => { try { sql(q); return false; } catch (e) { return re.test(String((e as { stderr?: string }).stderr ?? e)); } };
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
mkdirSync(WORK, { recursive: true });
process.env.DATABASE_URL = URL; process.env.FO_FILES_DIR = join(WORK, "files"); process.env.FO_FILES_LINK_KEY = "fo6d-check-link-key-0123456789abcdef";
for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED"]) delete process.env[k];

const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
const { EVERYONE_SEES_ALL, writeSetting } = await import("../api/src/platform/settings.ts");
const { platformAuditWorkspaceId } = await import("../api/src/platform/audit/audit-event.ts");
const { fakeMail } = await import("../ports/mail.ts");
const { SIGNING_EVENT, SigningCompletedPayload } = await import("../ports/events/signing.ts");
const { fakeSigning } = await import("../api/src/front-office/signing/port.ts");
const { useSigningMail, useSigningPort } = await import("../api/src/front-office/signing/handlers.ts");
const { Signing } = await import("../api/src/front-office/signing/service.ts");
const { SigningHooksController } = await import("../api/src/front-office/signing/hooks.ts");
const { LocalFiles } = await import("../api/src/front-office/files.ts");
const retainers = (await import("../api/src/features/front-office-retainers.ts")).default;
const anyDoc = (await import("../api/src/features/front-office-signing-any-document.ts")).default;

const apps: { close(): Promise<void> }[] = [];
try {
  // ------------------------------------------------------------------------------- M: the migration, measured right after it
  const all = readdirSync(MIG).filter((d) => /^\d{14}_/.test(d)).sort();
  for (const d of all.filter((x) => x <= NEW)) psql(["-f", join(MIG, d, "migration.sql")]);
  ok("FO-6d M pass: the migration adds OTHER to the document kinds and the fo_signing_document table, walled (PF-12)",
    sql(`select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'FoSigningDocumentKind'`) === "RETAINER,CONSULTATION,OTHER"
      && sql(`select relrowsecurity and relforcerowsecurity from pg_class where relname = 'fo_signing_document'`) === "t");
  ok("FO-6d M fail: the migration does not apply twice", (() => { try { psql(["-f", join(MIG, NEW, "migration.sql")]); return false; } catch (e) { return /already exists/.test(String((e as { stderr?: string }).stderr)); } })());
  for (const d of all.filter((x) => x > NEW)) psql(["-f", join(MIG, d, "migration.sql")]);
  const db = new Db();
  await seedSampleFirms(db);
  await seedSampleFirmsFrontOffice(db);
  const A = sql(`select id from platform_firm where key='sample-firm'`), B = sql(`select id from platform_firm where key='sample-solo'`);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: false, by: "seed:fo6d", workspaceId: await platformAuditWorkspaceId(db as never) });
  const local = new LocalIdentity("fo6d-check-signing-key-0123456789abcdef", () => Date.now());
  const token = (staffId: string) => local.issue(staffId, { authTimeMs: Date.now() - 60_000, secondStep: true });
  const sid = (actor: string) => sql(`select id from platform_staff where actor_id='${actor}'`);
  const staff = async (firmId: string, name: string, role: string) => {
    const s = await db.platformStaff.create({ data: { firmId, email: `${name}@fo6d.example.com`, displayName: `Sample ${name}`, actorId: `fo6d-${name}`, status: "ACTIVE" } });
    await db.platformRoleGrant.create({ data: { firmId, staffId: s.id, role: role as never, grantedBy: "seed:fo6d" } });
    return { id: s.id, token: token(s.id) };
  };
  const R = { id: sid("user-R"), token: token(sid("user-R")) }, RO = await staff(A, "read-only", "READ_ONLY");
  const other = await staff(A, "case-officer", "CASE_OFFICER");

  const signing = fakeSigning(), mail = fakeMail();
  useSigningPort(signing); useSigningMail(mail);
    const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: { now: () => Date.now() } }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard, { provide: APP_GUARD, useExisting: PlatformGuard },
    ...retainers.providers, ...anyDoc.providers];
  @Module({ controllers: [...retainers.controllers, ...anyDoc.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const app = await NestFactory.create(TestApp, { logger: false });
  await app.listen(0, "127.0.0.1"); apps.push(app);
  const BASE = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}`;
  type Res = { status: number; body: any; text: string; bytes: Buffer };   // eslint-disable-line @typescript-eslint/no-explicit-any -- answers read loosely, as the other suites
  const call = async (method: string, path: string, tok: string | null, body?: Record<string, unknown> | FormData): Promise<Res> => {
    const headers: Record<string, string> = tok ? { authorization: `Bearer ${tok}` } : {};
    if (body && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const r = await fetch(`${BASE}${path}`, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
    const bytes = Buffer.from(await r.arrayBuffer()), text = bytes.toString("utf8"); let b: unknown = text; try { b = JSON.parse(text); } catch { /* bytes */ }
    return { status: r.status, body: b, text, bytes };
  };
  const hooks = new SigningHooksController(new Signing(db, new LocalFiles(join(WORK, "files"))));
  let ip = 0;
  const post = (c: { headers: Record<string, string | undefined>; body: Uint8Array }) => hooks.receive("fake", { ip: `10.0.1.${(++ip % 200) + 1}`, headers: c.headers, body: JSON.parse(new TextDecoder().decode(c.body)) });
  const refusal = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { const x = e as { getStatus?: () => number; getResponse?: () => unknown }; return { status: x.getStatus?.() ?? 0, body: (x.getResponse?.() ?? {}) as Record<string, unknown> }; } };

  // A Corporate prospect owned by user-R: its company has a primary contact (B) and a signatory (C); D is on no prospect.
  const person = (given: string, firm = A) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', '${given}', 'Sample', '${given.toLowerCase()}.fo6d@example.com', 'test', now()) returning id`);
  const PB = person("Bea"), PC = person("Cy"), PD = person("Dee"), PX = person("Xan", B);
  const co = sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Sample Employer FO-6d', 'sample employer fo-6d', 'test', now()) returning id`);
  sql(`insert into fo_company_contact (firm_id, company_id, person_id, role, created_by) values ('${A}', '${co}', '${PB}', 'PRIMARY', 'test'), ('${A}', '${co}', '${PC}', 'SIGNATORY', 'test')`);
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${A}', '${PB}', 'MANUAL', 'WEBSITE', '${R.id}', 'ENGAGED', now(), 'test', 'test', now())`);
  const PRO = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${A}', l.id, 'CORPORATE', (select id from fo_stage where firm_id = '${A}' and pipeline = 'CORPORATE' and key = 'ENGAGED'), '${co}', '${PB}', '${R.id}', 'test', now() from fo_lead l where l.person_id = '${PB}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${PRO}'`);
  const stage = () => sql(`select stage_id from fo_prospect where id = '${PRO}'`), stage0 = stage();

  const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% Sample engagement addendum (FO-6d), not a real document\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
  const form = (o: { bytes?: Buffer; name?: string; title?: string; signers?: string; prospectId?: string; firm?: string; noFile?: boolean } = {}) => {
    const f = new FormData(); f.append("title", o.title ?? "Engagement addendum (Sample)"); f.append("prospectId", o.prospectId ?? PRO); f.append("signerPersonIds", o.signers ?? `${PB},${PC}`);
    if (o.firm) f.append("firmSignerStaffId", o.firm);
    if (!o.noFile) f.append("file", new Blob([new Uint8Array(o.bytes ?? PDF)], { type: "application/pdf" }), o.name ?? "addendum.pdf");
    return f;
  };
  const requests = () => count("fo_signature_request", `firm_id = '${A}'`), docs = () => count("fo_signing_document");

  // ------------------------------------------------------------------------------- S1: send an uploaded PDF to two people
  const sends0 = signing.calls.filter((c) => c.op === "send").length;
  const s1 = await call("POST", "/api/front-office/signature-requests", R.token, form());
  const Q1 = String(s1.body?.id ?? "00000000-0000-4000-8000-000000000000");
  ok("FO-6d S1 pass: an uploaded PDF sent to the prospect's two people → 201, one OTHER request (SENT, 14 days) with two client signers and no firm signer, one adapter send",
    s1.status === 201 && s1.body.status === "SENT" && s1.body.documentKind === "OTHER" && s1.body.signed === "0 of 2 signed"
      && sql(`select document_kind || ':' || status || ':' || round(extract(epoch from expires_at - sent_at) / 86400) || ':' || (select count(*) from fo_signer s where s.request_id = r.id and s.role = 'CLIENT') || ':' || (select count(*) from fo_signer s where s.request_id = r.id and s.role = 'FIRM') from fo_signature_request r where id = '${Q1}'`) === "OTHER:SENT:14:2:0"
      && signing.calls.filter((c) => c.op === "send").length === sends0 + 1, { status: s1.status, body: s1.text.slice(0, 300) });
  ok("FO-6d S1 pass: the uploaded file is kept with its sha256, the prospect named, and one audit line in the send's transaction",
    sql(`select sha256 || ':' || prospect_id || ':' || (file_key like 'signing/documents/%/original.pdf') from fo_signing_document where id = (select document_id from fo_signature_request where id = '${Q1}')`) === `${sha(PDF)}:${PRO}:true`
      && sql(`select (select xmin::text from fo_signature_request where id = '${Q1}') = (select xmin::text from audit_event where entity_key = '${Q1}' and action = 'signing.request_sent')`) === "t");
  const r0 = requests(), d0 = docs();
  const outsider = await call("POST", "/api/front-office/signature-requests", R.token, form({ signers: `${PB},${PD}` }));
  const xfirm = await call("POST", "/api/front-office/signature-requests", R.token, form({ signers: `${PB},${PX}` }));
  ok("FO-6d S1 fail: a signer who is not on the prospect, or firm B's person → 422 named on signerPersonIds, nothing sent",
    outsider.status === 422 && xfirm.status === 422 && outsider.body.code === "SIGNER_NOT_ON_PROSPECT" && requests() === r0 && docs() === d0, [outsider.status, xfirm.status, outsider.text.slice(0, 200)]);

  // ------------------------------------------------------------------------------- S2: only a PDF; never a government form
  const notPdf = await call("POST", "/api/front-office/signature-requests", R.token, form({ bytes: Buffer.from("not a pdf at all"), name: "addendum.pdf" }));
  ok("FO-6d S2 fail: a file that is not a PDF (named .pdf, typed application/pdf) → 422 in words (\"PDF\"), nothing stored or sent",
    notPdf.status === 422 && notPdf.body.code === "NOT_PDF" && /PDF/.test(notPdf.body.detail) && requests() === r0 && docs() === d0, notPdf.text.slice(0, 300));
  const xfa = await call("POST", "/api/front-office/signature-requests", R.token, form({ bytes: Buffer.concat([PDF, Buffer.from("<< /AcroForm << /XFA 5 0 R >> >>")]) }));
  const imm = await call("POST", "/api/front-office/signature-requests", R.token, form({ name: "client_IMM5476.pdf" }));
  ok("FO-6d S2 fail: a government form (an XFA form, or named like IMM 5257) → 422 GOVERNMENT_FORM, nothing sent", xfa.status === 422 && imm.status === 422 && xfa.body.code === "GOVERNMENT_FORM" && imm.body.code === "GOVERNMENT_FORM" && requests() === r0, [xfa.text.slice(0, 200), imm.status]);
  // Review M1 on #3207: a real IRCC form (owner password, its XFA inside encrypted object streams) and an open form whose
  // /XFA sits only inside a deflated object stream are both named as government forms, never "upload an open copy".
  const IRCC = join(STUDIO, "..", "..", "official-sources", "ircc", "forms", "imm5257e.pdf");
  const real = await call("POST", "/api/front-office/signature-requests", R.token, form({ bytes: readFileSync(IRCC), name: "letter.pdf", title: "Letter (Sample)" }));
  const objStm = Buffer.concat([Buffer.from("%PDF-1.7\n5 0 obj << /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode >>\nstream\n", "latin1"), deflateSync(Buffer.from("1 0 << /Fields [] /XFA 6 0 R >>")), Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]);
  const open = await call("POST", "/api/front-office/signature-requests", R.token, form({ bytes: objStm, name: "letter.pdf", title: "Letter (Sample)" }));
  ok("FO-6d S2 fail: a real IRCC form renamed \"letter.pdf\" (imm5257e, protected) and an open form with /XFA only in a deflated stream → 422 GOVERNMENT_FORM, nothing sent",
    real.status === 422 && real.body.code === "GOVERNMENT_FORM" && open.status === 422 && open.body.code === "GOVERNMENT_FORM" && requests() === r0, [real.text.slice(0, 160), open.text.slice(0, 160)]);
  const locked = await call("POST", "/api/front-office/signature-requests", R.token, form({ bytes: Buffer.concat([PDF, Buffer.from("trailer << /Encrypt 9 0 R >>")]) }));
  ok("FO-6d S2 fail: a password-protected PDF → 422 \"This PDF is protected. Upload an open copy.\" (AG-5-61 §12), nothing sent", locked.status === 422 && locked.body.detail === "This PDF is protected. Upload an open copy." && requests() === r0, locked.text.slice(0, 200));
  sql(`update fo_person set email = null where id = '${PC}'`);
  const noMail = await call("POST", "/api/front-office/signature-requests", R.token, form());
  sql(`update fo_person set email = 'cy.fo6d@example.com' where id = '${PC}'`);
  ok("FO-6d S2 fail: a signer with no email → 422 SIGNER_NO_EMAIL naming them (\"Add an email first\", AG-5-61 §12), nothing sent", noMail.status === 422 && noMail.body.code === "SIGNER_NO_EMAIL" && /Cy Sample.*Add an email first/.test(noMail.body.detail) && requests() === r0, noMail.text.slice(0, 200));
  const badTitles = await Promise.all(["Invoice \u0085 x", "Line\u2028two", "Invoice \u202efdp.exe", "\u200b"].map((t) => call("POST", "/api/front-office/signature-requests", R.token, form({ title: t }))));
  ok("FO-6d S2 fail: a title with a C1 control, a line separator, a direction override or nothing readable → 422 at the field, nothing stored or sent (break m1)",
    badTitles.every((x) => x.status === 422 && !!x.body.fields?.title) && requests() === r0 && docs() === d0, badTitles.map((x) => x.status));
  const noFile = await call("POST", "/api/front-office/signature-requests", R.token, form({ noFile: true }));
  ok("FO-6d S2 fail: no file → 422 \"Choose a PDF\"", noFile.status === 422 && noFile.body.code === "FILE_REQUIRED", noFile.text.slice(0, 200));
  const plainZ = Buffer.concat([Buffer.from("%PDF-1.7\n4 0 obj << /Length 20 /Filter /FlateDecode >>\nstream\n", "latin1"), deflateSync(Buffer.from("BT /F1 12 Tf (Sample letter) Tj ET")), Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1")]);
  const s2 = await call("POST", "/api/front-office/signature-requests", R.token, form({ signers: PB, title: "Second addendum (Sample)", bytes: plainZ }));
  ok("FO-6d S2 pass: a plain PDF with a deflated page (no form) to one person is accepted (201, \"0 of 1 signed\")", s2.status === 201 && s2.body.signed === "0 of 1 signed", s2.text.slice(0, 200));

  // ------------------------------------------------------------------------------- S3: the key and the firm walls
  const ro = await call("POST", "/api/front-office/signature-requests", RO.token, form()), anon = await call("POST", "/api/front-office/signature-requests", null, form());
  ok("FO-6d S3 fail: a person without agent/portal:request-work (Read-only) → 403; no session → 401; nothing sent", ro.status === 403 && anon.status === 401 && requests() === r0 + 1, [ro.status, anon.status]);
  const bTok = token(sql(`select id from platform_staff where firm_id = '${B}' order by actor_id limit 1`));
  const bRead = await call("GET", `/api/front-office/signature-requests/${Q1}`, bTok), bSend = await call("POST", "/api/front-office/signature-requests", bTok, form());
  const bLink = await call("POST", `/api/front-office/signature-requests/${Q1}/download-link`, bTok, { file: "original" });
  ok("FO-6d S3 fail: firm B reading firm A's request, sending from firm A's prospect or asking for its file → 404, nothing sent", bRead.status === 404 && bSend.status === 404 && bLink.status === 404 && requests() === r0 + 1, [bRead.status, bSend.status, bLink.status]);
  const notOwn = await call("GET", `/api/front-office/signature-requests/${Q1}`, other.token);
  ok("FO-6d S3 fail: a Case Officer who does not own the prospect (everyone-sees-all off) → 404 on its request", notOwn.status === 404, notOwn.status);
  const mine = await call("GET", `/api/front-office/signature-requests/${Q1}`, R.token), list = await call("GET", `/api/front-office/signature-requests?prospectId=${PRO}`, R.token);
  ok("FO-6d S3 pass: the prospect's owner reads the request (names, \"0 of 2 signed\") and the prospect's list (newest first, two requests); no token, code or provider id",
    mine.status === 200 && mine.body.signers.map((s: { name: string }) => s.name).sort().join(",") === "Bea Sample,Cy Sample" && list.body.requests?.length === 2 && list.body.requests[0].title === "Second addendum (Sample)"
      && !/link_?token|provider_?document|code_?sha|fake-/i.test(mine.text + list.text), mine.text.slice(0, 300));
  const pick = await call("GET", `/api/front-office/prospects/${PRO}/signers`, R.token);
  ok("FO-6d S3 pass: the signer picker lists the prospect's two people (not D) and the firm's active people", pick.status === 200 && pick.body.people.map((p: { personId: string }) => p.personId).sort().join() === [PB, PC].sort().join() && pick.body.firmPeople.length >= 2, pick.text.slice(0, 200));

  // ------------------------------------------------------------------------------- S4: two people sign; the sealed copy is filed
  const pd1 = sql(`select provider_document_id from fo_signature_request where id = '${Q1}'`), signerOf = (p: string) => sql(`select id from fo_signer where request_id = '${Q1}' and person_id = '${p}'`);
  const [early] = await signing.act(A, pd1, signerOf(PB), "signed");
  const noConsent = await refusal(() => post(early));
  ok("FO-6d S4 fail: a signature with no recorded consent → 409 (the provider asks again), the signer unsigned", noConsent?.status === 409 && count("fo_signer", `request_id = '${Q1}' and signed_at is not null`) === 0, noConsent);
  sql(`update fo_signer set consented_at = now(), consent_text_version = '${CONSENT}' where request_id = '${Q1}'`);
  const b1 = await post(early), [c1, done] = await signing.act(A, pd1, signerOf(PC), "signed");
  const c1a = await post(c1), mails0 = mail.sent.length, d1 = await post(done);
  const ev = sql(`select sealed_file_key || '|' || sealed_sha256 || '|' || audit_sha256 from fo_signing_evidence where request_id = '${Q1}'`).split("|");
  ok("FO-6d S4 pass: both people sign, then completed → SIGNED with the sealed copy and the audit file stored with us and hashed",
    b1.applied && c1a.applied && d1.applied && sql(`select status from fo_signature_request where id = '${Q1}'`) === "SIGNED" && /^signing\//.test(ev[0]) && /^[0-9a-f]{64}$/.test(ev[1] ?? ""), { b1, c1a, d1, ev });
  const link = await call("POST", `/api/front-office/signature-requests/${Q1}/download-link`, R.token, { file: "signed" });
  const file = link.status === 200 ? await call("GET", link.body.url, R.token) : null;
  ok("FO-6d S4 pass: the firm downloads the signed copy through a short-lived link; its sha256 is the stored one", file?.status === 200 && sha(file.bytes) === ev[1], { link: link.status, file: file?.status });
  const onB = await call("GET", `/api/front-office/people/${PB}/documents`, R.token), onC = await call("GET", `/api/front-office/people/${PC}/documents`, R.token), onD = await call("GET", `/api/front-office/people/${PD}/documents`, R.token);
  ok("FO-6d S4 pass: the sealed copy is filed on both people (their documents list its sha256); a person on no visible prospect is 404", onB.text.includes(ev[1]) && onC.text.includes(ev[1]) && onD.status === 404, [onB.status, onC.status, onD.status]);
  const evt = await db.moduleEvent.findFirst({ where: { firmId: A, type: SIGNING_EVENT.SIGNING_COMPLETED, subjectId: Q1 } });
  ok("FO-6d S4 pass: one signing.completed of kind OTHER (schema-checked) and \"Your signed document\" emailed once to each signer",
    !!evt && SigningCompletedPayload.safeParse(evt.payload).success && (evt.payload as { documentKind: string }).documentKind === "OTHER"
      && mail.sent.slice(mails0).filter((m) => m.subject === "Your signed document").length === 2, { evt: evt?.payload, mails: mail.sent.slice(mails0).map((m) => m.subject) });
  ok("FO-6d S4 fail: OTHER never moves the prospect or makes a client (stage unchanged; no prospect.won, no retainer, no case)",
    stage() === stage0 && count("audit_event", `firm_id = '${A}' and action = 'prospect.won'`) === 0 && count("fo_retainer", `prospect_id = '${PRO}'`) === 0
      && count("module_event", `firm_id = '${A}' and type = 'prospect.won'`) === 0);
  const again = await post(done);
  ok("FO-6d S4 fail: the same completed event again → handled once (one receipt, one evidence row, one event, no new email)", !!again && count(`fo_signing_hook_receipt`, `request_id = '${Q1}' and event_type = 'completed'`) === 1 && count("module_event", `subject_id = '${Q1}'`) === 1 && count("fo_signing_evidence", `request_id = '${Q1}'`) === 1 && mail.sent.length === mails0 + 2, again);

  // ------------------------------------------------------------------------------- S5: an added firm signer signs last
  const s5 = await call("POST", "/api/front-office/signature-requests", R.token, form({ signers: PB, firm: other.id, title: "Countersigned letter (Sample)" }));
  const Q5 = String(s5.body?.id ?? "00000000-0000-4000-8000-000000000000"), pd5 = sql(`select provider_document_id from fo_signature_request where id = '${Q5}'`);
  ok("FO-6d S5 pass: a send with one firm person added has one client and one firm signer (order 2)", s5.status === 201 && sql(`select string_agg(role || ':' || sign_order, ',' order by sign_order) from fo_signer where request_id = '${Q5}'`) === "CLIENT:1,FIRM:2", s5.text.slice(0, 200));
  sql(`update fo_signer set consented_at = now(), consent_text_version = '${CONSENT}' where request_id = '${Q5}'`);
  const firm5 = sql(`select id from fo_signer where request_id = '${Q5}' and role = 'FIRM'`), client5 = sql(`select id from fo_signer where request_id = '${Q5}' and role = 'CLIENT'`);
  const [f5] = await signing.act(A, pd5, firm5, "signed"), firstFirm = await refusal(() => post(f5));
  ok("FO-6d S5 fail: the firm signing before the client → 409, nothing signed", firstFirm?.status === 409 && count("fo_signer", `request_id = '${Q5}' and signed_at is not null`) === 0, firstFirm);
  const [c5] = await signing.act(A, pd5, client5, "signed"); await post(c5); const f5b = await post(f5);
  ok("FO-6d S5 pass: once the client signed, the firm's redelivered signature applies", f5b.applied && count("fo_signer", `request_id = '${Q5}' and signed_at is not null`) === 2, f5b);
  const badFirm = await call("POST", "/api/front-office/signature-requests", R.token, form({ signers: PB, firm: sql(`select id from platform_staff where firm_id = '${B}' limit 1`) }));
  ok("FO-6d S5 fail: firm B's staff as the firm signer → 422, nothing sent", badFirm.status === 422 && badFirm.body.code === "FIRM_SIGNER_NOT_IN_FIRM", badFirm.text.slice(0, 200));

  // ------------------------------------------------------------------------------- S6: each signed copy follows its own prospect
  // Review M2 on #3207: Cy is the company's signatory, so Cy is on a second Corporate prospect of the same company, owned by
  // a Case Officer. A document signed there is listed on Cy's record for that owner only; user-R (own-only: the firm's
  // "everyone sees all" is off) sees only the copy from user-R's own prospect.
  sql(`insert into fo_lead (id, firm_id, person_id, door, source, owner_staff_id, state, engaged_at, engaged_by, created_by, updated_at) values (gen_random_uuid(), '${A}', '${PC}', 'MANUAL', 'WEBSITE', '${other.id}', 'ENGAGED', now(), 'test', 'test', now())`);
  const PRO2 = sql(`insert into fo_prospect (id, firm_id, lead_id, type, stage_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    select gen_random_uuid(), '${A}', l.id, 'CORPORATE', (select id from fo_stage where firm_id = '${A}' and pipeline = 'CORPORATE' and key = 'ENGAGED'), '${co}', '${PC}', '${other.id}', 'test', now() from fo_lead l where l.person_id = '${PC}' returning id`);
  sql(`insert into fo_stage_move (firm_id, prospect_id, to_stage_id, cause, by_actor) select firm_id, id, stage_id, 'PERSON', 'test' from fo_prospect where id = '${PRO2}'`);
  const s6 = await call("POST", "/api/front-office/signature-requests", other.token, form({ prospectId: PRO2, signers: PC, title: "Employment offer (Sample, other owner)" }));
  const Q6 = String(s6.body?.id ?? "00000000-0000-4000-8000-000000000000"), pd6 = sql(`select provider_document_id from fo_signature_request where id = '${Q6}'`);
  sql(`update fo_signer set consented_at = now(), consent_text_version = '${CONSENT}' where request_id = '${Q6}'`);
  const [c6, done6] = await signing.act(A, pd6, sql(`select id from fo_signer where request_id = '${Q6}'`), "signed"); await post(c6); await post(done6);
  const sealed6 = sql(`select coalesce((select sealed_sha256 from fo_signing_evidence where request_id = '${Q6}'), '')`);
  const asR = await call("GET", `/api/front-office/people/${PC}/documents`, R.token), asOther = await call("GET", `/api/front-office/people/${PC}/documents`, other.token);
  ok("FO-6d S6 pass: the Case Officer sees, on Cy's record, the copy signed from their own prospect (and not user-R's)", /^[0-9a-f]{64}$/.test(sealed6) && asOther.status === 200 && asOther.text.includes(sealed6) && !asOther.text.includes(ev[1]), { s6: s6.status, other: asOther.text.slice(0, 200) });
  ok("FO-6d S6 fail: user-R, own-only, does not see on Cy's record the title or hash of the copy from the Case Officer's prospect", asR.status === 200 && asR.text.includes(ev[1]) && !asR.text.includes(sealed6) && !asR.text.includes("other owner"), asR.text.slice(0, 300));

  // ------------------------------------------------------------------------------- D: the database keeps the rules
  const doc1 = sql(`select document_id from fo_signature_request where id = '${Q1}'`);
  ok("FO-6d D fail: an uploaded document never changes and is never deleted", refusedSql(`update fo_signing_document set title = 'x' where id = '${doc1}'`, /never changes|row-level|policy/) && refusedSql(`delete from fo_signing_document where id = '${doc1}'`, /refused|row-level|policy/));
  // A retainer request still needs its signed firm signer for evidence (the OTHER exception is OTHER's only): a clients-only
  // RETAINER request is made by hand as firm A, all its clients sign, and its evidence is refused.
  const asA = (q: string) => `begin; select set_config('app.firm_id', '${A}', true); ${q}; commit;`;
  const hand = randomUUID(), cs = randomUUID();
  let handMade = true;
  try { sql(asA(`insert into fo_signature_request (id, firm_id, document_kind, document_id, document_version_id, document_version, provider, provider_document_id, sent_by, expires_at, updated_at) values ('${hand}', '${A}', 'RETAINER', gen_random_uuid(), gen_random_uuid(), 1, 'FAKE', 'fake-hand-${hand}', '${R.id}', now() + interval '14 days', now());
    insert into fo_signer (id, firm_id, request_id, role, sign_order, person_id, link_token_sha256) values ('${cs}', '${A}', '${hand}', 'CLIENT', 1, '${PB}', '${"a".repeat(64)}');
    update fo_signer set consented_at = now(), consent_text_version = 'v1', signed_at = now() where id = '${cs}';
    update fo_signature_request set status = 'CLIENT_SIGNED' where id = '${hand}'`)); } catch (e) { handMade = false; console.log(String((e as { stderr?: string }).stderr ?? e).slice(0, 300)); }
  ok("FO-6d D fail: a RETAINER request with no firm signer cannot store evidence (part 1's rule kept for every kind but OTHER)",
    handMade && refusedSql(asA(`insert into fo_signing_evidence (firm_id, request_id, sealed_file_key, sealed_sha256, audit_file_key, audit_sha256, consent_text_version) values ('${A}', '${hand}', 'signing/x/sealed.pdf', '${"b".repeat(64)}', 'signing/x/audit.pdf', '${"c".repeat(64)}', 'v1')`), /every signer of a live request signed/), { handMade });
  ok("FO-6d D pass: the same evidence on the OTHER request of S4 was stored (no firm signer needed)", count("fo_signing_evidence", `request_id = '${Q1}'`) === 1);
} finally {
  for (const a of apps) await a.close().catch(() => undefined);
  rmSync(WORK, { recursive: true, force: true });
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
