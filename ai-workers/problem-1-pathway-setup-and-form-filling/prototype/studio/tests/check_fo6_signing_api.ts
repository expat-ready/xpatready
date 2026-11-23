// FO-6 part 3 (brief design/briefs/track-b/FO-6-3.md; BACKLOG row FO-6; contracts §2.4, §7; P-561, P-563): a retainer
// sent for signing on the fake vendor, its state, the webhook that brings the signed file back, `signing.completed` and
// the win it makes. Each case passes and fails as the brief names it, on one scratch database (every migration, PF-3's
// and FO-1a's Sample seeds), dropped at the end. The client's consent is written as part 4's signing door will write it
// (that door is not this part). Fake adapter, fake mail: no vendor call, no network, no model call (US$0). Sample values.
//   tsx studio/tests/check_fo6_signing_api.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AuditPort } from "../ports/audit.ts";
import { SIGNING_EVENT, SigningCompletedPayload } from "../ports/events/signing.ts";
import { fakeMail } from "../ports/mail.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { buildDocx } from "../api/src/front-office/retainers/docx.ts";
import { Retainers } from "../api/src/front-office/retainers/service.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import type { Tx } from "../api/src/front-office/sales/common.ts";
import { registerSigningHandler, useSigningMail, useSigningPort } from "../api/src/front-office/signing/handlers.ts";
import { SigningHooksController } from "../api/src/front-office/signing/hooks.ts";
import { fakeSigning, type SigningHookCall } from "../api/src/front-office/signing/port.ts";
import { SigningController } from "../api/src/front-office/signing/routes.ts";
import { prepareRetainerSigning, Signing } from "../api/src/front-office/signing/service.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, PLATFORM_ACCESS, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo6api_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `fo6api-check-${process.pid}`);
const CONSENT = "sign-electronically-v1";

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail, (_k, v) => (typeof v === "bigint" ? String(v) : v)).slice(0, 500)}` : ""}`); };
const sql = (q: string) => execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8" }).trim();
const count = (t: string, where = "true") => Number(sql(`select count(*) from ${t} where ${where}`));
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    return x.getStatus ? { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> } : { status: 0, body: { error: String(e) } };
  }
}

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  const fo = await seedSampleFirmsFrontOffice(db);
  ok("FO-6 setup: the Sample firms have their pipelines", fo.failed.length === 0);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const ctxOf = (actorId: string, firmKey: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey, roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R", "sample-firm");
  const soloActor = sql(`select actor_id from platform_staff where firm_id = '${B}' order by actor_id limit 1`);
  const RB = ctxOf(soloActor, "sample-solo");
  const ws = await platformAuditWorkspaceId(db as never);
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: ws });

  const signing = fakeSigning(), mail = fakeMail();
  useSigningPort(signing); useSigningMail(mail);
  const files = new LocalFiles(join(WORK, "files")), clock = { now: () => Date.now() };
  const failingOn = (action: string): AuditPort<Tx> => ({ record: async (tx, e) => { if (e.action === action) throw new Error(`forced failure on ${action}`); return auditEvent.record(tx, e); } } as AuditPort<Tx>);
  const svc = new Retainers(db, files, clock), api = new Signing(db, files);
  clearingConflicts(db, { retainers: Retainers.prototype, prospects: Prospects.prototype });   // FO-13c: the conflict check first (Send and the win ask for it)
  const salesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, salesPorts), pros = new Prospects(db, salesPorts);
  const hooks = new SigningHooksController(api), state = new SigningController(api, svc);

  const tpl = await svc.uploadTemplate(R, { name: "FO-6 part 3 retainer (Sample)" }, { bytes: buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"]), size: 1000 });
  let n = 0;
  const prospect = async (given: string) => {
    const l = (await leads.add(R, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}${++n}@example.com`, source: "Phone call" })) as { id: string; person: { id: string } };
    const p = await pros.engage(R, l.id);
    return { id: p.id, personId: l.person.id };
  };
  const draft = async (p: { id: string }) => (await svc.draft(R, p.id, { templateId: tpl.id, fees: [{ label: "Deposit on signing", amountMinor: 150000, when: "ON_SIGNING" }, { label: "On filing", amountMinor: 50000, when: "WHEN_SUBMITTED" }] })).id;
  const reqOf = (rid: string) => sql(`select id || '|' || provider_document_id || '|' || status from fo_signature_request where document_id = '${rid}' order by sent_at desc limit 1`).split("|");
  const signerOf = (reqId: string, role: "CLIENT" | "FIRM") => sql(`select id from fo_signer where request_id = '${reqId}' and role = '${role}'`);
  const consent = (reqId: string) => sql(`update fo_signer set consented_at = now(), consent_text_version = '${CONSENT}' where request_id = '${reqId}' and consented_at is null`);
  /** A webhook through the route itself, as the JSON parser hands it over. */
  const post = (c: SigningHookCall, provider = "fake") => hooks.receive(provider, { ip: `10.0.0.${(n % 200) + 1}`, headers: c.headers }, JSON.parse(new TextDecoder().decode(c.body)));
  const sendIt = (rid: string) => svc.send(R, rid, { expectedVersion: 1 });

  // ------------------------------------------------------------- S1: Send makes one request, the client then the firm
  const p1 = await prospect("Ana"), r1 = await draft(p1);
  const before = signing.calls.length;
  await sendIt(r1);
  const [q1, d1, st1] = reqOf(r1);
  ok("FO-6 S1 pass: Send creates one SENT request for the version (RETAINER, FAKE, 14 days), one adapter send",
    count("fo_signature_request", `document_id = '${r1}'`) === 1 && st1 === "SENT" && signing.calls.slice(before).filter((c) => c.op === "send").length === 1
      && sql(`select document_kind || ':' || provider || ':' || document_version || ':' || round(extract(epoch from expires_at - sent_at) / 86400) from fo_signature_request where id = '${q1}'`) === "RETAINER:FAKE:1:14");
  ok("FO-6 S1 pass: its signers are the client (order 1, the retainer's person) then exactly one firm signer, the representative (order 2)",
    sql(`select string_agg(role || ':' || sign_order || ':' || coalesce(person_id::text, staff_id::text), ',' order by sign_order) from fo_signer where request_id = '${q1}'`)
      === `CLIENT:1:${p1.personId},FIRM:2:${sql(`select representative_staff_id from fo_retainer where id = '${r1}'`)}`);
  ok("FO-6 S1 pass: Send wrote one signing audit line in its transaction (same xmin as the request)", count("audit_event", `entity_key = '${q1}' and action = 'signing.request_sent'`) === 1
    && sql(`select (select xmin::text from fo_signature_request where id = '${q1}') = (select xmin::text from audit_event where entity_key = '${q1}' and action = 'signing.request_sent')`) === "t");
  const again = await refusal(() => sendIt(r1));
  ok("FO-6 S1 fail: a second Send of the same version → 409, still one request, no second adapter send", again?.status === 409 && count("fo_signature_request", `document_id = '${r1}'`) === 1
    && signing.calls.filter((c) => c.op === "send").length === 1, again);

  // ------------------------------------------------------------- S2: a failure after the adapter's send
  const p2 = await prospect("Bea"), r2 = await draft(p2), sends = signing.calls.filter((c) => c.op === "send").length, cancels = signing.calls.filter((c) => c.op === "cancel").length;
  const broken = new Retainers(db, files, clock, failingOn("signing.request_sent"));
  const f2 = await refusal(() => broken.send(R, r2, { expectedVersion: 1 }));
  ok("FO-6 S2 fail: Send failing after the adapter's send leaves no request, the retainer DRAFT, and exactly one cancel at the fake",
    f2 !== null && count("fo_signature_request", `document_id = '${r2}'`) === 0 && sql(`select status from fo_retainer where id = '${r2}'`) === "DRAFT"
      && signing.calls.filter((c) => c.op === "send").length === sends + 1 && signing.calls.filter((c) => c.op === "cancel").length === cancels + 1, { f2, calls: signing.calls.slice(-3) });
  await sendIt(r2);
  ok("FO-6 S2 pass: the same Send then succeeds with one request", count("fo_signature_request", `document_id = '${r2}'`) === 1);

  // ------------------------------------------------------------- S3: plain uuids: another firm's ids are refused
  const ret1 = await db.foRetainer.findFirstOrThrow({ where: { id: r1 } });
  const bPerson = sql(`select id from fo_person where firm_id = '${B}' limit 1`) || (sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${randomUUID()}', '${B}', 'Other', 'Firm', 'other.firm@example.com', 'seed:FO-6-3', now()) returning id`));
  const bStaff = sql(`select id from platform_staff where firm_id = '${B}' limit 1`);
  const bRetainer = { ...ret1, id: randomUUID() };   // an id firm A does not have (as firm B's would be)
  const plain = await Promise.all([
    refusal(() => prepareRetainerSigning(db, files, R, { ...ret1, firmId: B }, { now: () => new Date() })),
    refusal(() => prepareRetainerSigning(db, files, R, bRetainer, { now: () => new Date() })),
    refusal(() => prepareRetainerSigning(db, files, R, { ...ret1, signerPersonId: bPerson }, { now: () => new Date() })),
    refusal(() => prepareRetainerSigning(db, files, R, { ...ret1, representativeStaffId: bStaff }, { now: () => new Date() })),
  ]);
  ok("FO-6 S3 fail: firm A's request naming firm B's retainer, a version it does not have, firm B's person or firm B's staff → 409, nothing sent",
    plain.every((x) => x?.status === 409) && (plain.map((x) => x?.body.code).join(",") === "NOT_IN_FIRM,VERSION_NOT_IN_FIRM,SIGNER_NOT_IN_FIRM,REPRESENTATIVE_NOT_IN_FIRM"), plain.map((x) => x?.body.code));

  // ------------------------------------------------------------- S4: the state read
  const s4 = await state.state({ platform: R }, r1);
  const s4json = JSON.stringify(s4);
  ok("FO-6 S4 pass: the state read: SENT, \"0 of 2 signed\", the client then the representative with names", s4.status === "SENT" && s4.signed === "0 of 2 signed" && s4.signers.map((s) => s.role).join(",") === "CLIENT,FIRM" && s4.signers[0].name === "Ana Sample", s4);
  ok("FO-6 S4 pass: the answer holds no token, code or provider id", !s4json.includes(d1) && !/token|code|provider|sha256":"[0-9a-f]{64}"[^}]*link/i.test(s4json.replace(/sealedSha256|auditSha256/g, "")), s4json.slice(0, 300));
  const b4 = await refusal(() => state.state({ platform: RB }, r1));
  ok("FO-6 S4 fail: firm B reading firm A's retainer's signing → 404", b4?.status === 404, b4);
  ok("FO-6 S4 pass: the route declares agent/retainer:show", JSON.stringify(Reflect.getMetadata(PLATFORM_ACCESS, SigningController.prototype.state) ?? []).includes("agent/retainer:show"));

  // ------------------------------------------------------------- W1: the webhook's door
  const client1 = signerOf(q1, "CLIENT"), firm1 = signerOf(q1, "FIRM");
  const [viewed] = await signing.act(A, d1, client1, "viewed");
  const altered = { headers: viewed.headers, body: new TextEncoder().encode(new TextDecoder().decode(viewed.body).replace("viewed", "signed")) };
  const receipts0 = count("fo_signing_hook_receipt");
  const bad = await refusal(() => post(altered)), unsigned = await refusal(() => post({ headers: {}, body: viewed.body }));
  ok("FO-6 W1 fail: an unverified webhook (an altered body, no signature) → 400 and nothing stored", bad?.status === 400 && unsigned?.status === 400 && count("fo_signing_hook_receipt") === receipts0, { bad, unsigned });
  const wrongProvider = await refusal(() => post(viewed, "boldsign"));
  ok("FO-6 W1 fail: a provider this copy does not run → 404, nothing stored", wrongProvider?.status === 404 && count("fo_signing_hook_receipt") === receipts0);
  const v1 = await post(viewed), v2 = await post(viewed);
  ok("FO-6 W1 pass: viewed moves the client, the request and the retainer to VIEWED with one audit line", v1.applied === true && reqOf(r1)[2] === "VIEWED" && sql(`select status from fo_retainer where id = '${r1}'`) === "VIEWED"
    && sql(`select viewed_at is not null from fo_signer where id = '${client1}'`) === "t" && count("audit_event", `entity_key = '${q1}' and action = 'signing.viewed'`) === 1, v1);
  ok("FO-6 W1 fail: the same event twice → handled once (one receipt, one audit line, duplicate answered 200)", v2.duplicate === true && v2.applied === false
    && count("fo_signing_hook_receipt", `request_id = '${q1}'`) === 1 && count("audit_event", `entity_key = '${q1}' and action = 'signing.viewed'`) === 1, v2);

  // ------------------------------------------------------------- W2: the order and the consent
  consent(q1);
  const firmFirst = await signing.act(A, d1, firm1, "signed");   // the fake lets it through: the order rule is ours
  const receiptsQ1 = count("fo_signing_hook_receipt", `request_id = '${q1}'`);
  const ff = await refusal(() => post(firmFirst[0]));
  ok("FO-6 W2 fail: the firm's signature before every client → refused (409 NOT_YET), state unchanged, nothing kept (request VIEWED, firm signer unsigned, no receipt)",
    ff?.status === 409 && ff.body.code === "NOT_YET" && /firm signs last/.test(String(ff.body.detail)) && reqOf(r1)[2] === "VIEWED" && sql(`select signed_at is null from fo_signer where id = '${firm1}'`) === "t"
      && count("fo_signing_hook_receipt", `request_id = '${q1}'`) === receiptsQ1, ff);
  // break M1: once the client has signed, the provider's redelivery of the firm's signature applies (never a "duplicate")
  const c1 = await post((await signing.act(A, d1, client1, "signed"))[0]);
  const ffAgain = await post(firmFirst[0]);
  ok("FO-6 W2 pass (break M1): after the client's signature, the redelivered firm signature applies (both signed, CLIENT_SIGNED)",
    c1.applied === true && ffAgain.applied === true && sql(`select count(*) from fo_signer where request_id = '${q1}' and signed_at is not null`) === "2" && reqOf(r1)[2] === "CLIENT_SIGNED", { c1, ffAgain });
  // a second request whose client has no consent recorded
  const [q2, d2] = reqOf(r2);
  const ncCall = (await signing.act(A, d2, signerOf(q2, "CLIENT"), "signed"))[0];
  const nc = await refusal(() => post(ncCall));
  ok("FO-6 W2 fail: a signature with no recorded consent → refused (409), the signer unsigned, nothing kept (no consent, no signature)",
    nc?.status === 409 && /consent/.test(String(nc.body.detail)) && sql(`select signed_at is null from fo_signer where request_id = '${q2}' and role = 'CLIENT'`) === "t" && count("fo_signing_hook_receipt", `request_id = '${q2}'`) === 0, nc);
  consent(q2);
  const ncAgain = await post(ncCall);
  ok("FO-6 W2 pass (break M1): once consent is recorded, the redelivered signature applies", ncAgain.applied === true && sql(`select signed_at is not null from fo_signer where request_id = '${q2}' and role = 'CLIENT'`) === "t", ncAgain);
  const late = await post((await (async () => { const [lv] = await signing.act(A, d2, signerOf(q2, "FIRM"), "viewed"); return lv; })()));
  ok("FO-6 W2 pass (break m2): a viewed for a signer is answered 200 even after a signature (never a 500)", late.received === true, late);

  // ------------------------------------------------------------- W3: the client signs, then the firm: completed
  // (a fresh request: the fake kept the firm's out-of-order signature on the first one)
  const p3 = await prospect("Cal"), r3 = await draft(p3);
  await sendIt(r3);
  const [q3, d3] = reqOf(r3), c3 = signerOf(q3, "CLIENT"), f3 = signerOf(q3, "FIRM");
  consent(q3);
  const cs = await post((await signing.act(A, d3, c3, "signed"))[0]);
  ok("FO-6 W3 pass: the client's signature → CLIENT_SIGNED (request and retainer), \"1 of 2 signed\"",
    cs.applied === true && reqOf(r3)[2] === "CLIENT_SIGNED" && sql(`select status from fo_retainer where id = '${r3}'`) === "CLIENT_SIGNED" && (await state.state({ platform: R }, r3)).signed === "1 of 2 signed", cs);
  const last = await signing.act(A, d3, f3, "signed");   // [signed, completed]
  const early = await refusal(() => post(last[1]));
  ok("FO-6 W3 fail: completed before the firm's signature is recorded here → 409, nothing stored (the provider sends it again)",
    early?.status === 409 && count("fo_signing_evidence", `request_id = '${q3}'`) === 0 && count("fo_signing_hook_receipt", `request_id = '${q3}'`) === 1, early);
  const fs = await post(last[0]);
  const mailsBefore = mail.sent.length;
  const done = await post(last[1]);
  const ev = sql(`select sealed_file_key || '|' || sealed_sha256 || '|' || audit_file_key || '|' || audit_sha256 || '|' || consent_text_version from fo_signing_evidence where request_id = '${q3}'`).split("|");
  const sealed = await files.get(A, ev[0]), auditFile = await files.get(A, ev[2]);
  const { sha256Hex } = await import("../ports/files.ts");
  ok("FO-6 W3 pass: completed stores the sealed file and the audit file with us, each sha256 matching its bytes, with the consent text version",
    fs.applied === true && done.applied === true && !!sealed && !!auditFile && (await sha256Hex(sealed!.bytes)) === ev[1] && (await sha256Hex(auditFile!.bytes)) === ev[3] && ev[4] === CONSENT, { fs, done, ev });
  ok("FO-6 W3 pass: the request and the retainer are SIGNED; the state read shows \"2 of 2 signed\" and the evidence's hashes",
    reqOf(r3)[2] === "SIGNED" && sql(`select status from fo_retainer where id = '${r3}'`) === "SIGNED" && await (async () => { const s = await state.state({ platform: R }, r3); return s.signed === "2 of 2 signed" && s.evidence?.sealedSha256 === ev[1]; })());
  ok("FO-6 W3 pass: the evidence is on the person: the signed request's client signer is the retainer's person",
    sql(`select count(*) from fo_signing_evidence e join fo_signer s on s.request_id = e.request_id and s.role = 'CLIENT' where s.person_id = '${p3.personId}'`) === "1");
  const copies = mail.sent.slice(mailsBefore);
  ok("FO-6 W3 pass: \"Your signed agreement\" emailed to the client once, with the sealed copy, Reply-To the firm's contact address",
    copies.length === 1 && copies[0].subject === "Your signed agreement" && copies[0].to === sql(`select lower(email) from fo_person where id = '${p3.personId}'`) && copies[0].replyTo === sql(`select contact_email from platform_firm where id = '${A}'`)
      && copies[0].attachments?.length === 1, copies.map((m) => ({ to: m.to, subject: m.subject })));
  const evs = await db.moduleEvent.findMany({ where: { firmId: A, type: SIGNING_EVENT.SIGNING_COMPLETED, subjectId: q3 } });
  const parsed = evs[0] ? SigningCompletedPayload.safeParse(evs[0].payload) : null;
  ok("FO-6 W3 pass: exactly one signing.completed, its payload schema-checked (kind, version, signers, file keys, sha256, fees, total CAD)",
    evs.length === 1 && parsed?.success === true && parsed.data.documentKind === "RETAINER" && parsed.data.sealedSha256 === ev[1] && parsed.data.agreedTotalMinor === "200000"
      && parsed.data.currency === "CAD" && parsed.data.signerPersonIds.join() === p3.personId && parsed.data.fees.length === 2, parsed && !parsed.success ? parsed.error.issues : evs.length);
  ok("FO-6 W3 pass: signing.completed is the last write of its transaction (same xmin as the evidence; after prospect.won by seq)",
    sql(`select (select xmin::text from fo_signing_evidence where request_id = '${q3}') = (select xmin::text from module_event where subject_id = '${q3}' and type = 'signing.completed')`) === "t"
      && sql(`select (select seq from module_event where subject_id = '${q3}' and type = 'signing.completed') > (select seq from module_event where subject_id = '${p3.id}' and type = 'prospect.won')`) === "t");
  ok("FO-6 W3 pass: every change wrote one audit line in its transaction (sent, signed twice, completed, prospect.won)",
    count("audit_event", `entity_key = '${q3}' and action = 'signing.request_sent'`) === 1 && count("audit_event", `entity_key = '${q3}' and action = 'signing.signed'`) === 2
      && count("audit_event", `entity_key = '${q3}' and action = 'signing.completed'`) === 1 && count("audit_event", `entity_key = '${p3.id}' and action = 'prospect.won' and actor = 'system:signing-webhook'`) === 1);

  // ------------------------------------------------------------- W4: the win, once
  const wonOf = (pid: string) => sql(`select s.kind || ':' || coalesce(p.won_via::text, '-') from fo_prospect p join fo_stage s on s.id = p.stage_id where p.id = '${pid}'`);
  ok("FO-6 W4 pass: signing.completed makes the prospect WON E_SIGNED with one prospect.won naming the retainer",
    wonOf(p3.id) === "WON:E_SIGNED" && count("module_event", `subject_id = '${p3.id}' and type = 'prospect.won'`) === 1
      && sql(`select payload->>'retainer_id' from module_event where subject_id = '${p3.id}' and type = 'prospect.won'`) === r3);
  const dup = await post(last[1]);
  ok("FO-6 W4 fail: the same completion again → handled once: no second evidence, event, email or win",
    dup.duplicate === true && count("fo_signing_evidence", `request_id = '${q3}'`) === 1 && count("module_event", `type = 'signing.completed' and subject_id = '${q3}'`) === 1
      && mail.sent.length === mailsBefore + 1 && count("module_event", `subject_id = '${p3.id}' and type = 'prospect.won'`) === 1, dup);
  // A prospect won another way while its retainer is out for signing (Convert): the completion makes no second win.
  const p5 = await prospect("Dov"), r5b = await draft(p5);
  await sendIt(r5b);
  await pros.convert(R, p5.id, {});
  ok("FO-6 W4 setup: the prospect is won by Convert while its retainer is out for signing", wonOf(p5.id) === "WON:CONVERTED");
  const wonAt = count("module_event", `subject_id = '${p5.id}' and type = 'prospect.won'`);
  const [q5, d5] = reqOf(r5b);
  consent(q5);
  await post((await signing.act(A, d5, signerOf(q5, "CLIENT"), "signed"))[0]);
  for (const c of await signing.act(A, d5, signerOf(q5, "FIRM"), "signed")) await post(c);
  ok("FO-6 W4 fail: a completion on a prospect already won makes no second prospect.won (still CONVERTED), but writes its signing.completed",
    reqOf(r5b)[2] === "SIGNED" && count("module_event", `subject_id = '${p5.id}' and type = 'prospect.won'`) === wonAt && wonOf(p5.id) === "WON:CONVERTED"
      && count("module_event", `subject_id = '${q5}' and type = 'signing.completed'`) === 1);

  // ------------------------------------------------------------- W5: consultation, declined, other
  const consultation = randomUUID(), cv = randomUUID(), cq = randomUUID(), cdoc = (await signing.send({ firmId: A, requestId: cq, title: "Consultation agreement (Sample)", document: { bytes: new Uint8Array([1]), contentType: "application/pdf" },
    signers: [{ signerId: randomUUID(), role: "CLIENT", name: "Client" }, { signerId: randomUUID(), role: "FIRM", name: "Host" }] })).providerDocumentId;
  sql(`set session_replication_role = replica; insert into fo_signature_request (id, firm_id, document_kind, document_id, document_version_id, document_version, provider, provider_document_id, sent_by, expires_at, updated_at) values ('${cq}', '${A}', 'CONSULTATION', '${consultation}', '${cv}', 1, 'FAKE', '${cdoc}', '${R.staffId}', now() + interval '14 days', now())`);
  const cOther = await signing.other(A, cdoc);
  const nh = await post(cOther);
  ok("FO-6 W5 pass: a CONSULTATION request with no registered handler → 200 \"no handler\", stored, request unchanged",
    nh.applied === false && nh.reason === "no handler" && sql(`select status from fo_signature_request where id = '${cq}'`) === "SENT" && count("fo_signing_hook_receipt", `request_id = '${cq}'`) === 1, nh);
  const seen: string[] = [];
  const undo = registerSigningHandler("CONSULTATION", async (_c, firmId) => { seen.push(firmId); });
  const handed = await post(await signing.other(A, cdoc));
  undo();
  ok("FO-6 W5 pass: once FO-3c registers its handler, the call is handed to it with the request's firm", handed.applied === true && seen.join() === A, { handed, seen });
  const p6 = await prospect("Eve"), r6 = await draft(p6);
  await sendIt(r6);
  const [q6, d6] = reqOf(r6);
  const dec = await post((await signing.act(A, d6, signerOf(q6, "CLIENT"), "declined"))[0]);
  ok("FO-6 W5 pass: a declined event → 200, stored, request and retainer unchanged (FO-5d applies it)",
    dec.applied === false && reqOf(r6)[2] === "SENT" && sql(`select status from fo_retainer where id = '${r6}'`) === "SENT" && count("fo_signing_hook_receipt", `request_id = '${q6}'`) === 1, dec);
  const unknown = await post((await (async () => { const f = fakeSigning(); useSigningPort(f); const x = await f.send({ firmId: A, requestId: randomUUID(), title: "x", document: { bytes: new Uint8Array([1]), contentType: "application/pdf" }, signers: [{ signerId: randomUUID(), role: "CLIENT", name: "C" }, { signerId: randomUUID(), role: "FIRM", name: "F" }] }); return f.other(A, x.providerDocumentId); })()));
  useSigningPort(signing);
  ok("FO-6 W5 pass: a verified event for a document no request names → 200, nothing stored", unknown.applied === false && unknown.reason === "unknown document");

  // ------------------------------------------------------------- B: the break report's other cases
  // break M2: the conflict gate refuses the win (the client's email changed after Send): the signature still stands.
  const p7 = await prospect("Fay"), r7 = await draft(p7);
  await sendIt(r7);
  const [q7, d7] = reqOf(r7);
  consent(q7);
  sql(`update fo_person set email = 'fay.changed@example.com' where id = '${p7.personId}'`);
  await post((await signing.act(A, d7, signerOf(q7, "CLIENT"), "signed"))[0]);
  for (const c of await signing.act(A, d7, signerOf(q7, "FIRM"), "signed")) await post(c);
  ok("FO-6 B pass (break M2): a win the conflict gate refuses never undoes the signature: evidence, SIGNED, signing.completed, one win_held line; the prospect not won",
    count("fo_signing_evidence", `request_id = '${q7}'`) === 1 && reqOf(r7)[2] === "SIGNED" && sql(`select status from fo_retainer where id = '${r7}'`) === "SIGNED"
      && count("module_event", `subject_id = '${q7}' and type = 'signing.completed'`) === 1 && count("audit_event", `entity_key = '${q7}' and action = 'signing.win_held'`) === 1
      && count("module_event", `subject_id = '${p7.id}' and type = 'prospect.won'`) === 0, { won: count("module_event", `subject_id = '${p7.id}' and type = 'prospect.won'`), held: count("audit_event", `entity_key = '${q7}' and action = 'signing.win_held'`) });
  // break m4: past the expiry with no client signature, a signature is refused
  const p8 = await prospect("Gus"), r8 = await draft(p8);
  await sendIt(r8);
  const [q8, d8] = reqOf(r8);
  consent(q8);
  sql(`set session_replication_role = replica; update fo_signature_request set sent_at = now() - interval '20 days', expires_at = now() - interval '6 days' where id = '${q8}'`);
  const exp = await post((await signing.act(A, d8, signerOf(q8, "CLIENT"), "signed"))[0]);
  ok("FO-6 B fail (break m4): a signature on day 20 of a 14-day request with no client signature → refused, unsigned", exp.applied === false && /expired/.test(exp.reason ?? "") && sql(`select signed_at is null from fo_signer where request_id = '${q8}' and role = 'CLIENT'`) === "t", exp);
  // break m1: a hostile body too deep to write back is 400, never 500
  let deep: unknown = {}; for (let i = 0; i < 6000; i++) deep = { a: deep };
  const deepR = await refusal(() => hooks.receive("fake", { ip: "10.9.9.9", headers: {} }, deep));
  ok("FO-6 B fail (break m1): a 6000-level nested body → 400, never 500", deepR?.status === 400, deepR);

  // review Major 1: two different events of one request at once (the lock comes before the receipt): no deadlock, both applied
  const p9 = await prospect("Hal"), r9 = await draft(p9);
  await sendIt(r9);
  const [q9, d9] = reqOf(r9);
  consent(q9);
  const [vC] = await signing.act(A, d9, signerOf(q9, "CLIENT"), "viewed"), [vF] = await signing.act(A, d9, signerOf(q9, "FIRM"), "viewed");
  const [sC] = await signing.act(A, d9, signerOf(q9, "CLIENT"), "signed");
  const both = await Promise.allSettled([post(vC), post(vF), post(sC)]);
  ok("FO-6 B pass (review Major 1): three events of one request at once → each answered 200 (no deadlock, no 409), three receipts, the signature applied",
    both.every((x) => x.status === "fulfilled" && (x.value as { received: boolean }).received) && count("fo_signing_hook_receipt", `request_id = '${q9}'`) === 3 && reqOf(r9)[2] === "CLIENT_SIGNED",
    both.map((x) => (x.status === "fulfilled" ? x.value : String((x as PromiseRejectedResult).reason?.getResponse?.()?.code ?? x.reason))));
  // review deviation 4: an Edit makes version 2 and leaves version 1's signing request live; the next Send ends it and its envelope
  const p10 = await prospect("Ida"), r10 = await draft(p10);
  await sendIt(r10);
  const [q10, d10] = reqOf(r10);
  await svc.edit(R, r10, { expectedVersion: 1, expectedStatus: "SENT", fees: [{ label: "Deposit on signing", amountMinor: 160000, when: "ON_SIGNING" }] });
  const cancelsBefore = signing.calls.filter((c) => c.op === "cancel" && c.providerDocumentId === d10).length;
  await svc.send(R, r10, { expectedVersion: 2 });
  ok("FO-6 B pass (deviation 4): Send of version 2 ends version 1's live request (CANCELLED, UPDATED) with one audit line and one cancel at the fake; one live request",
    sql(`select status || ':' || cancel_reason from fo_signature_request where id = '${q10}'`) === "CANCELLED:UPDATED" && count("audit_event", `entity_key = '${q10}' and action = 'signing.request_cancelled'`) === 1
      && signing.calls.filter((c) => c.op === "cancel" && c.providerDocumentId === d10).length === cancelsBefore + 1
      && count("fo_signature_request", `document_id = '${r10}' and status in ('SENT','VIEWED','CLIENT_SIGNED')`) === 1);
  ok("FO-6 B fail (deviation 4): the old envelope gives no signing link any more", (await refusal(() => signing.embeddedLink(A, d10, signerOf(q10, "CLIENT")))) !== null);
  // break m3: a withdrawn retainer's completion is final: stored, 200, no files, never retried as 409
  const p11 = await prospect("Jon"), r11 = await draft(p11);
  await sendIt(r11);
  const [q11, d11] = reqOf(r11);
  consent(q11);
  await post((await signing.act(A, d11, signerOf(q11, "CLIENT"), "signed"))[0]);
  const fin = await signing.act(A, d11, signerOf(q11, "FIRM"), "signed");
  await post(fin[0]);
  await svc.withdraw(R, r11, { expectedVersion: 1, expectedStatus: "CLIENT_SIGNED", reason: "Client changed their mind" });
  const wd = await post(fin[1]);
  ok("FO-6 B fail (break m3): completed after a withdraw → 200 not applied, stored once, no evidence, no files", wd.applied === false && /withdrawn/.test(wd.reason ?? "")
    && count("fo_signing_evidence", `request_id = '${q11}'`) === 0 && count("fo_signing_hook_receipt", `request_id = '${q11}'`) === 3, wd);

  // break R2-M1: a completed that arrives before the signatures is "not yet" (409, nothing kept), then applies
  const p12 = await prospect("Kim"), r12 = await draft(p12);
  await sendIt(r12);
  const [q12, d12] = reqOf(r12);
  consent(q12);
  const [cS12] = await signing.act(A, d12, signerOf(q12, "CLIENT"), "signed"), fin12 = await signing.act(A, d12, signerOf(q12, "FIRM"), "signed");
  const first = await refusal(() => post(fin12[1]));
  await post(cS12); await post(fin12[0]);
  const second = await post(fin12[1]);
  ok("FO-6 B pass (break R2-M1): completed first → 409 NOT_READY, nothing kept; after both signatures its redelivery completes (SIGNED, evidence)",
    first?.status === 409 && second.applied === true && reqOf(r12)[2] === "SIGNED" && count("fo_signing_evidence", `request_id = '${q12}'`) === 1, { first, second });

  process.env.PLATFORM_ENVIRONMENT ??= "local";   // the feature imports the platform's mail feature, which reads the settings at load
  const signingFeature = (await import("../api/src/features/front-office-signing.ts")).default;
  ok("FO-6 G pass: the feature file registers the state read and the webhook door and provides the Signing service",
    (signingFeature.controllers as unknown[]).includes(SigningController) && (signingFeature.controllers as unknown[]).includes(SigningHooksController) && JSON.stringify((signingFeature.providers as { provide?: { name?: string } }[]).map((p) => p.provide?.name)) === '["Signing"]');
  // ------------------------------------------------------------- G: retired names, the bypass use
  const grep = (() => { try { return execFileSync("grep", ["-rlE", "retainer\\.executed|envelope\\.completed", join(STUDIO, "api", "src"), join(STUDIO, "ports"), join(STUDIO, "engine"), join(STUDIO, "contracts")], { encoding: "utf8" }).trim(); } catch { return ""; } })();
  // Event names are written only where events are made and read (the API, the ports, the engine, the contracts); the
  // browser code never names one, and a scan of the browser code would make every page change choose this suite (chooser self-test).
  ok("FO-6 G pass: no retainer.executed or envelope.completed name in the API, the ports, the engine or the contracts (A51 §12: signing.completed is the one)", grep === "", grep);
  const { BYPASS_USES } = await import("../api/src/platform/firm-scope.ts");
  const { SIGNING_WEBHOOK } = await import("../api/src/front-office/signing/webhook.bypass.ts");
  const use = SIGNING_WEBHOOK.entry;
  ok("FO-6 G pass: the webhook's crossing read is a per-firm bypass use declared beside its module (P-785 (2)), for that route only, and not on firm-scope.ts's frozen list",
    SIGNING_WEBHOOK.name === "front-office.signing.webhook" && use.audit === "per-firm" && use.routes.some((r) => r.test("POST /api/hooks/signing/fake")) && !use.routes.some((r) => r.test("POST /api/hooks/stripe")) && !use.outside
      && !Object.prototype.hasOwnProperty.call(BYPASS_USES, "front-office.signing.webhook"));
} finally {
  await db.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
