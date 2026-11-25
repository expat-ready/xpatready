// FO-6 part 4d (BACKLOG row FO-6; AG-5-31 §8 "Download: `agent/retainer:download` (agreements)", §10 "staff download it
// from the agreement", §11 "Given someone re-hashes the downloaded signed PDF, then the hash equals the certificate's";
// AG-5-41 short-lived links): an e-signed retainer's sealed copy and audit file through the retainer's own download link
// (`POST retainers/:id/download-link` with `file: "signed"` or `"evidence"`) and its files route (`GET files/:token`).
// Each rule passes and fails, on one scratch database (every migration, PF-3's and FO-1a's Sample seeds), dropped at the
// end. Signed on the fake vendor through part 3's webhook route, consent written as part 4's door writes it. Fake adapter,
// fake mail: no vendor call, no network, no model call (US$0). Sample values. Legal points: Unconfirmed: no counsel.
//   tsx studio/tests/check_fo6_4d_signed_downloads.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";
import { FileLinks, LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { buildDocx } from "../api/src/front-office/retainers/docx.ts";
import { RetainerSignedFiles } from "../api/src/front-office/retainers/e-signed-files.ts";
import { RetainersController } from "../api/src/front-office/retainers/routes.ts";
import { Retainers } from "../api/src/front-office/retainers/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import { AnyDocuments } from "../api/src/front-office/signing/any-document/service.ts";
import { AnyDocumentCompletion } from "../api/src/front-office/signing/any-document/completion.ts";
import { registerSigningHandler, useSigningMail, useSigningPort } from "../api/src/front-office/signing/handlers.ts";
import { SigningHooksController } from "../api/src/front-office/signing/hooks.ts";
import { fakeSigning, type SigningHookCall } from "../api/src/front-office/signing/port.ts";
import { Signing } from "../api/src/front-office/signing/service.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo64d_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `fo64d-check-${process.pid}`);
const CONSENT = "sign-electronically-v1";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    return x.getStatus ? { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> } : { status: 0, body: { error: String(e) } };
  }
}
/** A response the files route writes to (headers, type, bytes). */
const resOf = () => ({ headers: {} as Record<string, string>, ct: "", body: undefined as unknown,
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; }, type(t: string) { this.ct = t; return this; }, send(b: unknown) { this.body = b; return this; } });

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-6 4d setup: the Sample firms have their pipelines", fo.failed.length === 0);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const ctxOf = (actorId: string, firmKey: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey, roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R", "sample-firm");
  // A colleague in the same firm who holds the download key but neither owns the prospect nor represents the retainer.
  const otherActor = sql(`select s.actor_id from platform_staff s where s.firm_id = '${A}' and s.id <> '${R.staffId}' and exists (select 1 from platform_role_grant g join platform_role_permission p on p.role = g.role where g.staff_id = s.id and p.permission_key = 'agent/retainer:download') order by s.actor_id limit 1`);
  const O = ctxOf(otherActor, "sample-firm");
  const RB = ctxOf(sql(`select actor_id from platform_staff where firm_id = '${B}' order by actor_id limit 1`), "sample-solo");
  const ws = await platformAuditWorkspaceId(db as never);
  const seesAll = (value: boolean) => writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value, by: "system:test", workspaceId: ws });
  await seesAll(true);

  const signing = fakeSigning(), mail = fakeMail();
  useSigningPort(signing); useSigningMail(mail);
  const files = new LocalFiles(join(WORK, "files")), clock = { now: () => Date.now() }, links = new FileLinks();
  const svc = new Retainers(db, files, clock), api = new Signing(db, files), docs = new AnyDocuments(db, files);
  const completion = new AnyDocumentCompletion(db, files);
  registerSigningHandler("OTHER", (call, firmId) => completion.onHook(call, firmId));   // as the any-document feature registers it
  const signedFiles = new RetainerSignedFiles(db, svc);
  const ctrl = new RetainersController(svc, files, links, clock as never, signedFiles);
  clearingConflicts(db, { retainers: Retainers.prototype, prospects: Prospects.prototype });   // FO-13c: the conflict check first (Send and the win ask for it)
  const salesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, salesPorts), pros = new Prospects(db, salesPorts), hooks = new SigningHooksController(api);

  const tpl = await svc.uploadTemplate(R, { name: "FO-6 part 4d retainer (Sample)" }, { bytes: buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"]), size: 1000 });
  let n = 0;
  const prospect = async (given: string) => {
    const l = (await leads.add(R, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}${++n}@example.com`, source: "Phone call" })) as { id: string; person: { id: string } };
    const p = await pros.engage(R, l.id);
    return { id: p.id, personId: l.person.id };
  };
  const draft = async (p: { id: string }) => (await svc.draft(R, p.id, { templateId: tpl.id, fees: [{ label: "Deposit on signing", amountMinor: 150000, when: "ON_SIGNING" }] })).id;
  const reqOf = (rid: string) => sql(`select id || '|' || provider_document_id || '|' || status from fo_signature_request where document_id = '${rid}' order by sent_at desc limit 1`).split("|");
  const signerOf = (reqId: string, role: "CLIENT" | "FIRM") => sql(`select id from fo_signer where request_id = '${reqId}' and role = '${role}'`);
  const consent = (reqId: string) => sql(`update fo_signer set consented_at = now(), consent_text_version = '${CONSENT}' where request_id = '${reqId}' and consented_at is null`);
  const post = (c: SigningHookCall) => hooks.receive("fake", { ip: `10.0.0.${(n % 200) + 1}`, headers: c.headers, body: JSON.parse(new TextDecoder().decode(c.body)) });
  /** The link route, as the controller answers it; then the files route with that link's token. */
  const link = (who: StaffContext, id: string, body: unknown) => ctrl.link({ platform: who }, id, body as Record<string, unknown>);
  const fetchFile = async (who: StaffContext, url: string) => { const res = resOf(); await ctrl.download({ platform: who }, url.split("/").pop()!, res as never); return res; };

  // ------------------------------------------------------------- a retainer signed electronically by the client, then the firm
  const p1 = await prospect("Ines"), r1 = await draft(p1);
  await svc.send(R, r1, { expectedVersion: 1 });
  const [q1, d1] = reqOf(r1);
  consent(q1);
  await post((await signing.act(A, d1, signerOf(q1, "CLIENT"), "signed"))[0]);
  const notYet = await refusal(() => link(R, r1, { file: "signed" }));
  ok("FO-6 4d fail: while only the client has signed (CLIENT_SIGNED) → 409 NOT_SIGNED in words, no link", notYet?.status === 409 && notYet.body.code === "NOT_SIGNED" && /not signed electronically by everyone yet/.test(String(notYet.body.detail)), notYet);
  for (const c of await signing.act(A, d1, signerOf(q1, "FIRM"), "signed")) await post(c);   // [signed, completed]
  const ev = sql(`select sealed_file_key || '|' || sealed_sha256 || '|' || audit_file_key || '|' || audit_sha256 from fo_signing_evidence where request_id = '${q1}'`).split("|");
  ok("FO-6 4d setup: the retainer is SIGNED with its evidence stored (part 3)", reqOf(r1)[2] === "SIGNED" && ev.length === 4 && /^[0-9a-f]{64}$/.test(ev[1]), { req: reqOf(r1), ev });

  // ------------------------------------------------------------- D1-D2: the signed copy and the evidence, downloaded and re-hashed
  const l1 = await link(R, r1, { file: "signed" });
  const f1 = await fetchFile(R, l1.url);
  ok("FO-6 4d pass (AG-5-31 §11): file \"signed\" gives a short-lived link whose file is the sealed PDF, its sha256 the stored one",
    /^\/api\/front-office\/files\/[^/]+$/.test(l1.url) && !!l1.expiresAt && Buffer.isBuffer(f1.body) && f1.ct === "application/pdf" && sha(f1.body as Buffer) === ev[1], { url: l1.url, ct: f1.ct });
  ok("FO-6 4d pass: it is an attachment named signed-agreement.pdf, nosniff, no-store",
    f1.headers["content-disposition"] === 'attachment; filename="signed-agreement.pdf"' && f1.headers["x-content-type-options"] === "nosniff" && f1.headers["cache-control"] === "no-store", f1.headers);
  const l2 = await link(R, r1, { file: "evidence" });
  const f2 = await fetchFile(R, l2.url);
  ok("FO-6 4d pass: file \"evidence\" gives the provider's audit file, its sha256 the stored one, named signing-evidence.pdf",
    Buffer.isBuffer(f2.body) && sha(f2.body as Buffer) === ev[3] && ev[3] !== ev[1] && f2.headers["content-disposition"] === 'attachment; filename="signing-evidence.pdf"', { h: f2.headers });

  // ------------------------------------------------------------- D3: the body and the id, before anything is looked up (PF-28)
  const extra = await refusal(() => link(R, r1, { file: "signed", version: 1 }));
  ok("FO-6 4d fail: a field beside file \"signed\" (version) → 422 naming it, no link", extra?.status === 422 && JSON.stringify(extra.body).includes("version"), extra);
  const malformed = await refusal(() => link(R, "not-a-uuid", { file: "evidence", junk: 1 }));
  ok("FO-6 4d fail: a malformed retainer id → the one 404, before the body is read", malformed?.status === 404 && malformed.body.code === "NOT_FOUND", malformed);
  const unknown = await refusal(() => link(R, randomUUID(), { file: "signed" }));
  const orderX = await refusal(() => link(RB, r1, { file: "signed", junk: 1 })), orderU = await refusal(() => link(R, randomUUID(), { file: "evidence", junk: 1 }));
  ok("FO-6 4d fail (review M3, PF-28): a bad body is 422 named before the read rule, on another firm's retainer and on an unknown id (never their 404)",
    orderX?.status === 422 && orderU?.status === 422 && JSON.stringify(orderX.body).includes("junk"), [orderX, orderU]);
  ok("FO-6 4d fail: an unknown retainer id → 404", unknown?.status === 404, unknown);

  // ------------------------------------------------------------- D4: who may ask, and the second check at download
  const xfirm = await refusal(() => link(RB, r1, { file: "signed" }));
  ok("FO-6 4d fail: another firm's staff → 404, no link", xfirm?.status === 404, xfirm);
  const ol = await link(O, r1, { file: "signed" });   // the colleague sees it while everyone sees all
  await seesAll(false);
  const hidden = await refusal(() => link(O, r1, { file: "evidence" }));
  ok("FO-6 4d fail: a colleague who does not see the retainer (everyone-sees-all off, not owner or representative) → 404, no link", hidden?.status === 404, hidden);
  const later = await refusal(() => fetchFile(O, ol.url));
  ok("FO-6 4d fail: a link made while they saw it, used after they no longer do → 404 at the download (the second check)", later?.status === 404, later);
  const theirs = await refusal(() => fetchFile(O, l1.url));
  ok("FO-6 4d fail: another person's link → 404 (the link is the person's own)", theirs?.status === 404, theirs);
  await seesAll(true);

  // ------------------------------------------------------------- D5: only a retainer's stored evidence goes through this route
  const forge = async (key: string) => refusal(() => fetchFile(R, `/api/front-office/files/${links.sign(A, R.staffId, key, clock.now()).token}`));
  // Review M1: part 3 stores the files before its transaction (signing/service.ts), so a refused or repeated completed
  // leaves real files in other attempt folders of the same request.
  const stray = await files.put(A, ev[0].replace(/\/[0-9a-f]+\/sealed\.pdf$/, "/abcdef/sealed.pdf"), new Uint8Array(Buffer.from("%PDF-1.4\n% another attempt (Sample)\n%%EOF\n")), "application/pdf");
  const wrongAttempt = await forge(stray.key);
  ok("FO-6 4d fail (review M1): a file stored in another attempt folder of the same request is not the evidence → 404", !!(await files.get(A, stray.key)) && wrongAttempt?.status === 404, wrongAttempt);
  const p2 = await prospect("Omar");
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n% Sample addendum (FO-6 4d), not a real document\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
  const other = await docs.send(R, { title: "Addendum (Sample)", prospectId: p2.id, signerPersonIds: [p2.personId] }, { bytes: new Uint8Array(PDF), size: PDF.length, name: "addendum.pdf" }) as { id: string };
  const qo = other.id, dO = sql(`select provider_document_id from fo_signature_request where id = '${qo}'`);
  consent(qo);
  for (const c of await signing.act(A, dO, signerOf(qo, "CLIENT"), "signed")) await post(c);
  const oKey = sql(`select coalesce((select sealed_file_key from fo_signing_evidence where request_id = '${qo}'), '')`);
  const otherKind = await forge(oKey);
  ok("FO-6 4d fail: an uploaded document's (OTHER) sealed copy through the retainer's files route → 404 (it keeps FO-6d's own route)", !!oKey && otherKind?.status === 404, { oKey, otherKind });
  const original = await forge(sql(`select file_key from fo_signing_document where id = (select document_id from fo_signature_request where id = '${qo}')`));
  ok("FO-6 4d fail: an uploaded document's original through the retainer's files route → 404", original?.status === 404, original);
  const pOff = await prospect("Pia"), rOff = await draft(pOff);
  const offline = await refusal(() => link(R, rOff, { file: "signed" }));
  ok("FO-6 4d fail (breaker m1): a retainer that is not out for signing (a draft) → 409 NO_E_SIGNED_COPY \"has no electronically signed copy here\" (no \"yet\"); a paper copy stays file \"signed-offline\"", offline?.status === 409 && offline.body.code === "NO_E_SIGNED_COPY" && /has no electronically signed copy here/.test(String(offline.body.detail)), offline);

  // Review M2, breaker m2: a consultation agreement is an fo_retainer row of kind CONSULTATION whose request is kind
  // CONSULTATION naming that row (booking/consultation-agreement/service.ts); its signed copy is FO-3c's own route. Made
  // row by row as that service writes them, signed in the signing tables' own order, its files stored as part 3 stores them.
  const ctpl = await svc.uploadTemplate(R, { name: "FO-6 4d consultation (Sample)", kind: "CONSULTATION" }, { bytes: buildDocx(["Client {client.name}"]), size: 1000 });
  const pc = await prospect("Quin"), rc = (await svc.draft(R, pc.id, { kind: "CONSULTATION", templateId: ctpl.id })).id, qc = randomUUID();
  sql(`insert into fo_signature_request (id, firm_id, document_kind, document_id, document_version_id, document_version, provider, provider_document_id, sent_by, sent_at, expires_at, updated_at)
       select '${qc}', firm_id, 'CONSULTATION', retainer_id, id, 1, 'FAKE', 'fake-consult-${qc}', '${R.staffId}', now(), now() + interval '14 days', now() from fo_retainer_version where retainer_id = '${rc}' and n = 1`);
  sql(`insert into fo_signer (id, firm_id, request_id, role, sign_order, person_id, link_token_sha256) values (gen_random_uuid(), '${A}', '${qc}', 'CLIENT', 1, '${pc.personId}', '${sha(Buffer.from(`c-${qc}`))}')`);
  sql(`insert into fo_signer (id, firm_id, request_id, role, sign_order, staff_id, link_token_sha256) values (gen_random_uuid(), '${A}', '${qc}', 'FIRM', 2, '${R.staffId}', '${sha(Buffer.from(`f-${qc}`))}')`);
  sql(`update fo_retainer_version set sent_at = now() where retainer_id = '${rc}' and n = 1; update fo_retainer set status = 'SENT' where id = '${rc}'`);   // as FO-3c's send
  const cLive = await refusal(() => link(R, rc, { file: "signed" }));
  ok("FO-6 4d fail (breaker m2): a consultation agreement out for signing → 409 NO_E_SIGNED_COPY (never \"yet\": its copy is not on this link)", cLive?.status === 409 && cLive.body.code === "NO_E_SIGNED_COPY", cLive);
  for (const role of ["CLIENT", "FIRM"]) sql(`update fo_signer set consented_at = now(), consent_text_version = '${CONSENT}', signed_at = now() where request_id = '${qc}' and role = '${role}'`);
  sql(`update fo_signature_request set status = 'CLIENT_SIGNED' where id = '${qc}'`);
  const cs = await files.put(A, `signing/${qc}/c0ffee/sealed.pdf`, new Uint8Array(PDF), "application/pdf"), ca = await files.put(A, `signing/${qc}/c0ffee/audit.pdf`, new Uint8Array(PDF), "application/pdf");
  sql(`insert into fo_signing_evidence (id, firm_id, request_id, sealed_file_key, sealed_sha256, audit_file_key, audit_sha256, consent_text_version) values (gen_random_uuid(), '${A}', '${qc}', '${cs.key}', '${cs.sha256}', '${ca.key}', '${ca.sha256}', '${CONSENT}')`);
  sql(`update fo_signature_request set status = 'SIGNED', ended_at = now() where id = '${qc}'`);
  const cSigned = await refusal(() => link(R, rc, { file: "signed" })), cSealed = await forge(cs.key), cAudit = await forge(ca.key);
  ok("FO-6 4d fail (review M2): an e-signed consultation agreement (its CONSULTATION request SIGNED, with evidence) → 409 NO_E_SIGNED_COPY, no link",
    sql(`select status from fo_signature_request where id = '${qc}'`) === "SIGNED" && cSigned?.status === 409 && cSigned.body.code === "NO_E_SIGNED_COPY", cSigned);
  ok("FO-6 4d fail (review M2): a link naming that consultation agreement's sealed or audit file → 404 at the retainer's files route", cSealed?.status === 404 && cAudit?.status === 404, [cSealed, cAudit]);

  // ------------------------------------------------------------- D6: the link's other files are unchanged (Retainers.fileKey)
  const v1 = await link(R, r1, { version: 1 }), fv = await fetchFile(R, v1.url);
  ok("FO-6 4d pass: { version: 1 } still names version 1's document (not the signed copy)",
    Buffer.isBuffer(fv.body) && sha(fv.body as Buffer) === sql(`select original_sha256 from fo_retainer_version where retainer_id = '${r1}' and n = 1`) && sha(fv.body as Buffer) !== ev[1]);
  const bad = await refusal(() => link(R, r1, { file: "certificate" }));
  ok("FO-6 4d fail: any other file name → 422 on the field, as before", bad?.status === 422 && JSON.stringify(bad.body).includes("file"), bad);
  const noOffline = await refusal(() => link(R, r1, { file: "signed-offline" }));
  ok("FO-6 4d fail: \"signed-offline\" on an e-signed retainer → 404 (no paper copy), as before", noOffline?.status === 404, noOffline);

  // ------------------------------------------------------------- G: the wiring
  const feature = (await import("../api/src/features/front-office-retainers.ts")).default;
  const injected = (Reflect.getMetadata("self:paramtypes", RetainersController) as { index: number; param: unknown }[] | undefined) ?? [];
  ok("FO-6 4d G pass: the retainer feature provides RetainerSignedFiles and the controller's fifth argument is injected with it",
    (feature.providers as unknown[]).includes(RetainerSignedFiles) && injected.some((p) => p.index === 4 && p.param === RetainerSignedFiles), injected.map((p) => p.index));
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
