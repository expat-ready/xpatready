// R1.60 part a1 (product/screens/R1.60/rules.md on #3371: R1-R6, R8, R16, B1-B6, cases 1-7 and 15, O5; AG-6-61
// §5.1-§5.7, §9, §13; Lead 4 approved the shape on #3371, 25 Nov): a signed retainer version prepares one trust
// deposit request (PREPARED, Ask me first, no DR- number, never an invoice); the same signature again prepares none.
// Through the real paths: Send and the fake vendor's webhook for an e-signature (FO-6), and Signed offline (FO-5),
// each calling the front office's signed-version listeners (retainers/signed-hooks.ts) in its own transaction; the
// listener is client money's, armed as the app arms it (features/client-money-trust.ts DepositOnSigning). Each case a
// pass and a fail. One scratch database (every migration, PF-3's and FO-1a's Sample seeds), dropped at the end. Fake
// vendor, fake mail, fake NotificationPort: no network, no model call (US$0). Figures Sample (Ontario, 13 %).
//   tsx studio/tests/check_r160_deposit_prepare.ts
import "reflect-metadata";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";
import { fakeNotifications, NOTIFICATION_KIND } from "../ports/notifications.ts";
import type { RetainerSigned } from "../ports/retainer-signed.ts";
import { LocalFiles } from "../api/src/front-office/files.ts";
import { seedSampleFirmsFrontOffice } from "../api/src/front-office/firm-seed.ts";
import { buildDocx } from "../api/src/front-office/retainers/docx.ts";
import { Retainers } from "../api/src/front-office/retainers/service.ts";
import { onRetainerSigned, retainerSigned } from "../api/src/front-office/retainers/signed-hooks.ts";
import { Leads } from "../api/src/front-office/sales/leads.ts";
import { Prospects } from "../api/src/front-office/sales/prospects.ts";
import { useSigningMail, useSigningPort } from "../api/src/front-office/signing/handlers.ts";
import { SigningHooksController } from "../api/src/front-office/signing/hooks.ts";
import { fakeSigning, type SigningHookCall } from "../api/src/front-office/signing/port.ts";
import { Signing } from "../api/src/front-office/signing/service.ts";
import { DEPOSIT_LISTENER, notDue, prepareDepositOnSigning } from "../api/src/client-money/trust/on-signed.ts";
import { TrustReads } from "../api/src/client-money/trust/reads.ts";
import { TrustMoney } from "../api/src/client-money/trust/service.ts";
import { DepositOnSigning } from "../api/src/features/client-money-trust.ts";
import trustFeature from "../api/src/features/client-money-trust.ts";
import { auditEvent, platformAuditWorkspaceId } from "../api/src/platform/audit/audit-event.ts";
import { dutiesOf, type StaffContext } from "../api/src/platform/identity/keys.ts";
import { ConsentStore } from "../api/src/platform/messages/consent/consent-store.ts";
import { seedSampleFirms } from "../api/src/platform/seed-sample-firms.ts";
import { EVERYONE_SEES_ALL, writeSetting } from "../api/src/platform/settings.ts";
import { clearingConflicts } from "./lib/conflict-clear.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_r160a1_${process.pid}`, URL_ = `postgresql://xr_studio@127.0.0.1:54329/${DB}`;
const WORK = join(STUDIO, "var", `r160a1-check-${process.pid}`);
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
const pdf = (s = "signed") => { const b = Buffer.from(`%PDF-1.4\n% ${s}\n%%EOF\n`); return { bytes: new Uint8Array(b), size: b.length }; };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]);
execFileSync(join(BIN, "createdb"), [...PG, DB]);
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: URL_, options: "-c TimeZone=UTC" }) });
let disarm: (() => void) | null = null;
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  await seedSampleFirms(db);
  ok("R1.60 a1 setup: the Sample firms have their pipelines", (await seedSampleFirmsFrontOffice(db)).failed.length === 0);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const ctxOf = (actorId: string, firmKey: string): StaffContext => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey, roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" };
  };
  const R = ctxOf("user-R", "sample-firm");
  await writeSetting(db, { firmId: A, key: EVERYONE_SEES_ALL.key, value: true, by: "system:test", workspaceId: await platformAuditWorkspaceId(db as never) });
  // Firm A: payments set up, registered for tax in Ontario (Sample tax number), trust answered YES by its Owner.
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:R1.60', now())`);
  sql(`update money_payment_settings set tax_registered = true, tax_number = '123456789RT0001' where firm_id = '${A}';
       update platform_firm set business_address = coalesce(business_address, '{}'::jsonb) || '{"province_state": "ON"}'::jsonb where id = '${A}'`);
  const trust = new TrustMoney(db, auditEvent, { now: () => new Date() }, null, async () => ({ cases: [], parties: [] }));
  await trust.setAnswer(R, { answer: "YES" });
  ok("R1.60 a1 setup: firm A's trust answer is YES; firm B's is UNANSWERED", sql(`select string_agg(trust_answer::text, ',' order by firm_id = '${A}' desc) from money_payment_settings where firm_id in ('${A}', '${B}')`) === "YES,UNANSWERED");

  // The listener armed as the app arms it, with a fake NotificationPort.
  const notes = fakeNotifications();
  const armed = new DepositOnSigning(notes as never);
  armed.onModuleInit();
  disarm = () => armed.onModuleDestroy();
  ok("R1.60 a1 setup: the trust feature registers DepositOnSigning (the listener is armed at start)", (trustFeature.providers as unknown[]).includes(DepositOnSigning));

  const signing = fakeSigning(), mail = fakeMail();
  useSigningPort(signing); useSigningMail(mail);
  const files = new LocalFiles(join(WORK, "files")), clock = { now: () => Date.now() };
  const svc = new Retainers(db, files, clock), api = new Signing(db, files);
  clearingConflicts(db, { retainers: Retainers.prototype, prospects: Prospects.prototype });
  const salesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(db, salesPorts), pros = new Prospects(db, salesPorts);
  const hooks = new SigningHooksController(api);
  const tpl = await svc.uploadTemplate(R, { name: "R1.60 retainer (Sample)" }, { bytes: buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"]), size: 1000 });
  let n = 0;
  const prospect = async (given: string) => {
    const l = (await leads.add(R, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `${given.toLowerCase()}${++n}@example.com`, source: "Phone call" })) as { id: string; person: { id: string } };
    return { id: (await pros.engage(R, l.id)).id, personId: l.person.id };
  };
  type Fee = { label: string; amountMinor: number | null; when: string };
  const DEPOSIT: Fee[] = [{ label: "Deposit on signing", amountMinor: 100000, when: "ON_SIGNING" }, { label: "On filing", amountMinor: 50000, when: "WHEN_SUBMITTED" }];
  const draft = async (p: { id: string }, fees: Fee[] = DEPOSIT) => (await svc.draft(R, p.id, { templateId: tpl.id, fees })).id;
  const reqOf = (rid: string) => sql(`select id || '|' || provider_document_id from fo_signature_request where document_id = '${rid}' order by sent_at desc limit 1`).split("|");
  const signerOf = (reqId: string, role: "CLIENT" | "FIRM") => sql(`select id from fo_signer where request_id = '${reqId}' and role = '${role}'`);
  const post = (c: SigningHookCall) => hooks.receive("fake", { ip: `10.0.1.${(n % 200) + 1}`, headers: c.headers, body: JSON.parse(new TextDecoder().decode(c.body)) });
  /** Send, then the client and the firm sign on the fake vendor: the completion is the last call answered. */
  const eSign = async (rid: string) => {
    await svc.send(R, rid, { expectedVersion: 1 });
    const [q, d] = reqOf(rid);
    sql(`update fo_signer set consented_at = now(), consent_text_version = '${CONSENT}' where request_id = '${q}'`);
    await post((await signing.act(A, d, signerOf(q, "CLIENT"), "signed"))[0]);
    const last = await signing.act(A, d, signerOf(q, "FIRM"), "signed");
    await post(last[0]);
    const done = await post(last[1]);
    return { q, done, last };
  };
  const reqFor = (rid: string) => sql(`select coalesce(string_agg(q.id::text, ','), '') from money_trust_request q join fo_retainer_version v on v.id = q.retainer_version_id where v.retainer_id = '${rid}'`);
  const reads = new TrustReads(db, async () => ({ cases: [], parties: [...new Set(sql(`select string_agg(distinct coalesce(person_id, company_id)::text, ',') from money_trust_request`).split(",").filter(Boolean))] }));
  const invoices0 = count("money_invoice");

  // ------------------------------------------------------------- case 1: e-signed → one PREPARED request, no invoice
  const p1 = await prospect("Ada"), r1 = await draft(p1);
  const e1 = await eSign(r1);
  const q1 = reqFor(r1);
  ok("R1.60 case 1 setup: the e-signature completed (retainer SIGNED, prospect won)", e1.done.applied === true && sql(`select status from fo_retainer where id = '${r1}'`) === "SIGNED", e1.done);
  ok("R1.60 case 1 pass (R3, R4): one request for the deposit row CAD 1,000.00 with CAD 130.00 estimated tax (Ontario 13 %, Sample), on the client, no case",
    q1 !== "" && !q1.includes(",") && sql(`select amount_minor || ':' || estimated_tax_minor || ':' || currency || ':' || coalesce(person_id::text, '-') || ':' || coalesce(case_id::text, 'none') from money_trust_request where id = '${q1}'`) === `100000:13000:CAD:${p1.personId}:none`);
  ok("R1.60 case 1 pass (B5, R6): it is PREPARED (prepared_at set, not sent, not cancelled) and has no DR- number",
    sql(`select (prepared_at is not null)::text || (sent_at is null)::text || (cancelled_at is null)::text || coalesce(number, 'none') from money_trust_request where id = '${q1}'`) === "truetruetruenone");
  const read1 = await reads.request(R, q1) as Record<string, unknown>;
  ok("R1.60 case 1 pass (B6): the request read says Prepared, with its estimated tax and its retainer version", read1.status === "Prepared" && read1.estimatedTaxMinor === 13000 && read1.number === null && typeof read1.retainerVersionId === "string", read1);
  const items1 = notes.sent().filter((x) => x.item.id === q1);
  ok("R1.60 case 1 pass (R6, G1): one Needs you item to the representative (the file owner before a case), on the request",
    items1.length === 1 && items1[0].kind === NOTIFICATION_KIND.DEPOSIT_REQUEST_PREPARED && items1[0].item.kind === "trust-request" && items1[0].staffId === sql(`select representative_staff_id from fo_retainer where id = '${r1}'`), items1);
  ok("R1.60 case 1 pass (R6): nothing was emailed for the request (Ask me first: a person sends it)", !mail.sent.some((m) => /trust|deposit/i.test(`${m.subject} ${m.templateKey ?? ""}`)), mail.sent.map((m) => m.subject));
  ok("R1.60 case 1 pass (R1, case 15): no money_invoice row was written", count("money_invoice") === invoices0);
  ok("R1.60 case 1 pass (R16): one trust.request_prepared audit line, by the signing webhook, in the completion's transaction (its now() falls after the firm's signature line and before the completion's line)",
    count("audit_event", `action = 'trust_money.request_prepared' and entity_key = '${q1}' and actor = 'system:signing-webhook'`) === 1
      && sql(`select (q.created_at > (select max(at) from audit_event where entity_key = '${e1.q}' and action = 'signing.signed') and q.created_at <= (select at from audit_event where entity_key = '${e1.q}' and action = 'signing.completed'))::text from money_trust_request q where q.id = '${q1}'`) === "true",
    sql(`select string_agg(action || '@' || at::text, ' ; ') from audit_event where entity_key in ('${e1.q}', '${q1}')`) + " / " + sql(`select created_at from money_trust_request where id = '${q1}'`));
  const signingSrc = readFileSync(join(STUDIO, "api", "src", "front-office", "signing", "service.ts"), "utf8"), offlineSrc = readFileSync(join(STUDIO, "api", "src", "front-office", "retainers", "service.ts"), "utf8");
  ok("R1.60 case 1 pass (contracts §0.5): both callers run the listeners before their event row (signing.completed, retainer.signed_offline stay last)",
    signingSrc.indexOf("await retainerSigned(") > 0 && signingSrc.indexOf("await retainerSigned(") < signingSrc.indexOf("SIGNING_EVENT.SIGNING_COMPLETED, subjectId")
      && offlineSrc.indexOf("await retainerSigned(") > 0 && offlineSrc.indexOf("await retainerSigned(") < offlineSrc.indexOf("EVENT.RETAINER_SIGNED_OFFLINE, { retainerId"));
  // planted fail: the "no invoice" check catches an invoice row when one is written
  sql(`insert into money_invoice (firm_id, person_id, currency, created_by, due_date, updated_at) values ('${A}', '${p1.personId}', 'CAD', 'planted:R1.60', current_date, now())`);
  ok("R1.60 case 1 fail (planted): an invoice row written beside the request is seen by the check", count("money_invoice") === invoices0 + 1);
  sql(`delete from money_invoice where created_by = 'planted:R1.60'`);

  // ------------------------------------------------------------- O5: both paths key the request by the signed version's id
  ok("R1.60 O5 pass: the e-signature's request names the signing request's version id, the retainer's version 1",
    sql(`select retainer_version_id::text from money_trust_request where id = '${q1}'`) === sql(`select document_version_id::text from fo_signature_request where id = '${e1.q}'`)
      && sql(`select retainer_version_id::text from money_trust_request where id = '${q1}'`) === sql(`select id::text from fo_retainer_version where retainer_id = '${r1}' and n = 1`));

  // ------------------------------------------------------------- case 2: the same completion again → nothing new
  const audits1 = count("audit_event", `action = 'trust_money.request_prepared'`), notes1 = notes.sent().length;
  const again = await post(e1.last[1]);
  ok("R1.60 case 2 pass (B4, R8): the same signing.completed delivered again → still one request, one audit line, one item",
    again.duplicate === true && reqFor(r1) === q1 && count("audit_event", `action = 'trust_money.request_prepared'`) === audits1 && notes.sent().length === notes1, again);
  const facts1: RetainerSigned = { retainerId: r1, retainerVersionId: sql(`select retainer_version_id from money_trust_request where id = '${q1}'`), version: 1, kind: "RETAINER", via: "E_SIGNED",
    representativeStaffId: R.staffId, personId: p1.personId, companyId: null, prospectId: p1.id, actor: "system:signing-webhook", fees: DEPOSIT.map((f) => ({ label: f.label, amountMinor: String(f.amountMinor), currency: "CAD", when: f.when })) };
  await db.$transaction((tx) => retainerSigned(tx, auditEvent, A, facts1));
  ok("R1.60 case 2 pass (R8): the listeners called again for the same version → a quiet no-op (no row, no audit line, no held line)",
    reqFor(r1) === q1 && count("audit_event", `action = 'trust_money.request_prepared'`) === audits1 && count("audit_event", `action = 'retainer.signed_listener_held'`) === 0);
  // planted fail: without the one-per-version guard the second call is not a quiet no-op
  const unguarded = await refusal(() => db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`drop index "money_trust_request_one_per_retainer_version"`);
    const second = await prepareDepositOnSigning(tx, { audit: auditEvent, notifications: null }, A, facts1);
    throw new Error(`no guard: ${second ? "a second request" : "nothing"}`);
  }));
  ok("R1.60 case 2 fail (planted): with the unique guard removed, the second call does not pass quietly (the guard holds B4)",
    unguarded !== null && !/no guard: nothing/.test(String(unguarded.body.error)) && count("money_trust_request", `retainer_version_id = '${facts1.retainerVersionId}'`) === 1, unguarded);

  // ------------------------------------------------------------- case 3: signed on paper → one request; an e-signature after it → none
  const p3 = await prospect("Bo"), r3 = await draft(p3);
  await svc.signedOffline(R, r3, { expectedVersion: "1", reason: "Signed at the office" }, pdf("r160 paper"));
  const q3 = reqFor(r3);
  ok("R1.60 case 3 pass (B2): Signed offline prepares one request, by the person who recorded the paper",
    q3 !== "" && !q3.includes(",") && count("audit_event", `action = 'trust_money.request_prepared' and entity_key = '${q3}' and actor = 'staff:${R.staffId}'`) === 1);
  ok("R1.60 O5 pass: Signed offline keys it by the filed version's id (version 1)", sql(`select retainer_version_id::text from money_trust_request where id = '${q3}'`) === sql(`select id::text from fo_retainer_version where retainer_id = '${r3}' and n = 1`));
  await db.$transaction((tx) => retainerSigned(tx, auditEvent, A, { ...facts1, retainerId: r3, retainerVersionId: sql(`select retainer_version_id from money_trust_request where id = '${q3}'`), personId: p3.personId, prospectId: p3.id }));
  ok("R1.60 case 3 fail: an e-signature of the same version after the paper one → still one request (B4)", reqFor(r3) === q3);

  // ------------------------------------------------------------- case 4: trust NO or UNANSWERED → nothing
  ok("R1.60 case 4 pass (B1): trust UNANSWERED (firm B) → nothing is due", notDue({ ...facts1 }, "UNANSWERED") === "trust is not on" && notDue({ ...facts1 }, "NO") === "trust is not on" && notDue(facts1, "YES") === null);
  const rowsB = count("money_trust_request", `firm_id = '${B}'`);
  const bPerson = sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values ('${randomUUID()}', '${B}', 'Other', 'Firm', 'r160.b@example.org', 'seed:R1.60', now()) returning id`);
  await db.$transaction((tx) => retainerSigned(tx, auditEvent, B, { ...facts1, retainerId: randomUUID(), retainerVersionId: randomUUID(), personId: bPerson, representativeStaffId: sql(`select id from platform_staff where firm_id = '${B}' limit 1`) }));
  ok("R1.60 case 4 fail: a retainer signed at firm B (trust UNANSWERED) prepares nothing, and nothing is held", count("money_trust_request", `firm_id = '${B}'`) === rowsB && count("audit_event", `action = 'retainer.signed_listener_held'`) === 0);
  await trust.setAnswer(R, { answer: "NO" });
  const p4 = await prospect("Cy"), r4 = await draft(p4);
  await svc.signedOffline(R, r4, { expectedVersion: "1", reason: "Signed at the office" }, pdf("r160 no"));
  ok("R1.60 case 4 pass: firm A with trust NO: a signed retainer with a deposit row prepares nothing (the row stays for Bill this)", reqFor(r4) === "" && count("money_invoice") === invoices0);
  await trust.setAnswer(R, { answer: "YES" });

  // ------------------------------------------------------------- case 5: not a deposit row → nothing
  const p5 = await prospect("Di"), r5 = await draft(p5, [{ label: "On filing", amountMinor: 50000, when: "WHEN_SUBMITTED" }, { label: "Deposit on signing", amountMinor: 100000, when: "ON_SIGNING" }]);
  await svc.signedOffline(R, r5, { expectedVersion: "1", reason: "Signed at the office" }, pdf("r160 later"));
  ok("R1.60 case 5 pass (B1): a first row that is not On signing prepares nothing (an On signing row further down is not the deposit row)", reqFor(r5) === "");
  const p5b = await prospect("Ed"), r5b = await draft(p5b, [{ label: "Deposit on signing", amountMinor: null, when: "ON_SIGNING" }]);
  await svc.signedOffline(R, r5b, { expectedVersion: "1", reason: "Signed at the office" }, pdf("r160 empty"));
  ok("R1.60 case 5 fail: an On signing row with no amount prepares nothing; 0 is not due either", reqFor(r5b) === ""
    && notDue({ ...facts1, fees: [{ ...facts1.fees[0], amountMinor: "0" }] }, "YES") === "the deposit row has no amount");

  // ------------------------------------------------------------- case 6: a consultation agreement → nothing
  ok("R1.60 case 6 pass (B3): a consultation agreement is never due", notDue({ ...facts1, kind: "CONSULTATION" }, "YES") === "not a retainer");
  const before6 = count("money_trust_request");
  await db.$transaction((tx) => retainerSigned(tx, auditEvent, A, { ...facts1, kind: "CONSULTATION", retainerVersionId: randomUUID() }));
  ok("R1.60 case 6 fail: a consultation agreement signed with an On signing row prepares nothing", count("money_trust_request") === before6);

  // ------------------------------------------------------------- case 7: #3033's unsent request is never PREPARED
  const staffTrust = new TrustMoney(db, auditEvent, { now: () => new Date() }, null, async () => ({ cases: [], parties: [p1.personId] }));
  const staff7 = await staffTrust.createRequest(R, { personId: p1.personId, amountMinor: 20000, currency: "CAD", purpose: "Retainer top-up (Sample)" }) as { id: string; number: string | null };
  ok("R1.60 case 7 setup: with no trust details, #3033's staff request is stored unsent (no number)", staff7.number === null && count("money_trust_request", `id = '${staff7.id}' and sent_at is null`) === 1, staff7);
  const read7 = await reads.request(R, staff7.id) as Record<string, unknown>;
  ok("R1.60 case 7 pass (B6): it reads Waiting, never Prepared, and carries no estimated tax", read7.status === "Waiting" && !("estimatedTaxMinor" in read7), read7);
  const preparedSet = sql(`select string_agg(id::text, ',') from money_trust_request where prepared_at is not null and sent_at is null and cancelled_at is null`);
  ok("R1.60 case 7 pass: the PREPARED set (prepared_at set) holds the signing ones and not the staff one", preparedSet.includes(q1) && preparedSet.includes(q3) && !preparedSet.includes(staff7.id));
  const planted = sql(`select string_agg(id::text, ',') from money_trust_request where number is null and sent_at is null and cancelled_at is null`);
  ok("R1.60 case 7 fail (planted): PREPARED read as \"number is null and sent_at is null\" would take the staff request in", planted.includes(staff7.id));

  // ------------------------------------------------------------- the database's rules on the two new columns
  const dbRule = (q: string) => { try { sql(q); return "ok"; } catch (e) { return String((e as { stderr?: string }).stderr ?? e); } };
  ok("R1.60 a1 DB pass: prepared_at is the database's clock and never changes after (a typed time is refused on update)",
    /the times are the database/.test(dbRule(`update money_trust_request set prepared_at = now() - interval '1 day' where id = '${q1}'`)));
  ok("R1.60 a1 DB fail: a prepared request with no retainer version, or a negative estimated tax, is refused",
    /prepared_check/.test(dbRule(`insert into money_trust_request (firm_id, person_id, amount_minor, purpose, created_by, prepared_at, estimated_tax_minor, updated_at) values ('${A}', '${p1.personId}', 100, 'x', 'test', now(), 0, now())`))
      && /estimated_tax_check/.test(dbRule(`update money_trust_request set estimated_tax_minor = -1 where id = '${q1}'`))
      && /estimated_tax_check/.test(dbRule(`update money_trust_request set estimated_tax_minor = 5 where id = '${staff7.id}'`)));

  ok("R1.60 B4 fail (break a1 m5): the database never deletes a prepared request, so its version stays held (B4)",
    /of a signed retainer is never deleted/.test(dbRule(`delete from money_trust_request where id = '${q1}'`)) && count("money_trust_request", `id = '${q1}'`) === 1);
  ok("R1.60 B4 pass: #3033's unsent request may still be deleted, and FO-7ts's version rules are unchanged (an unsent request's version may change)",
    dbRule(`begin; delete from money_trust_request where id = '${staff7.id}'; rollback`) === "ok"
      && dbRule(`begin; update money_trust_request set retainer_version_id = gen_random_uuid() where id = '${staff7.id}'; rollback`) === "ok");
  // break a1 m4: the size check counts the estimated tax (13 % on 21,474,836.47 is past one request)
  const big = await db.$transaction((tx) => prepareDepositOnSigning(tx, { audit: auditEvent, notifications: null }, A, { ...facts1, retainerVersionId: randomUUID(), fees: [{ ...facts1.fees[0], amountMinor: "2147483647" }] }));
  const fits = await db.$transaction((tx) => prepareDepositOnSigning(tx, { audit: auditEvent, notifications: null }, A, { ...facts1, retainerVersionId: randomUUID(), fees: [{ ...facts1.fees[0], amountMinor: "1900000000" }] }));
  ok("R1.60 R4 fail (break a1 m4): a deposit row whose amount with tax is past one request prepares nothing, with one not-prepared line naming why",
    big === null && count("audit_event", `action = 'trust_money.request_not_prepared' and summary like '%with the estimated tax%'`) === 1);
  ok("R1.60 R4 pass: a large row whose amount with tax still fits is prepared (19,000,000.00 + 2,470,000.00)", fits?.amountMinor === 1900000000 && fits.estimatedTaxMinor === 247000000, fits);

  // ------------------------------------------------------------- the signing never fails because of the listener
  const boom = onRetainerSigned("r160.planted-fault", async () => { throw new Error("planted listener fault"); });
  const p8 = await prospect("Fay"), r8 = await draft(p8);
  const e8 = await eSign(r8);
  boom();
  ok("R1.60 a1 pass: a listener's fault never undoes the signature: SIGNED, signing.completed written, the deposit request still prepared, one held line",
    e8.done.applied === true && sql(`select status from fo_retainer where id = '${r8}'`) === "SIGNED" && count("module_event", `subject_id = '${e8.q}' and type = 'signing.completed'`) === 1
      && reqFor(r8) !== "" && count("audit_event", `action = 'retainer.signed_listener_held' and entity_key = '${r8}'`) === 1, e8.done);

  // ------------------------------------------------------------- review a1 m3: a malformed call is held, never undoes the signing
  const before9 = count("money_trust_request");
  await db.$transaction((tx) => retainerSigned(tx, auditEvent, A, { ...facts1, retainerVersionId: "not-a-uuid" } as RetainerSigned));
  ok("R1.60 a1 pass (review m3): a call the port's schema refuses is held in its savepoint (one held line), and the transaction still commits",
    count("money_trust_request") === before9 && count("audit_event", `action = 'retainer.signed_listener_held' and entity_key = '${r1}'`) === 1);

  // ------------------------------------------------------------- R4: a firm not registered for tax adds no estimated tax
  sql(`update money_payment_settings set tax_registered = false where firm_id = '${A}'`);
  const p10 = await prospect("Gil"), r10 = await draft(p10);
  await svc.signedOffline(R, r10, { expectedVersion: "1", reason: "Signed at the office" }, pdf("r160 untaxed"));
  ok("R1.60 R4 pass: a firm not registered for tax prepares the deposit row with 0 estimated tax", sql(`select amount_minor || ':' || estimated_tax_minor from money_trust_request where id = '${reqFor(r10)}'`) === "100000:0");
  ok("R1.60 R4 fail: the registered firm's request (case 1) carried 13 %, not 0", sql(`select estimated_tax_minor from money_trust_request where id = '${q1}'`) === "13000");
  sql(`update money_payment_settings set tax_registered = true where firm_id = '${A}'`);

  // ------------------------------------------------------------- case 15: no invoice anywhere, and none in the code path
  ok("R1.60 case 15 pass (R1): after every case, no money_invoice row exists beyond the ones before", count("money_invoice") === invoices0);
  const src = readFileSync(join(STUDIO, "api", "src", "client-money", "trust", "on-signed.ts"), "utf8");
  ok("R1.60 case 15 pass (R1): the listener's code names no invoice table or service", !/money_invoice|moneyInvoice|InvoiceDrafts|InvoiceMoney/.test(src.replace(/^\/\/.*$/gm, "")));

  // ------------------------------------------------------------- review a1 M1: the recorded rollback, then forward again
  const migDir = join(MIG, "20261125060000_client-money__r160_trust_request_prepared");
  const cols = () => sql(`select coalesce(string_agg(column_name, ',' order by column_name), '') from information_schema.columns where table_name = 'money_trust_request' and column_name in ('prepared_at', 'estimated_tax_minor')`);
  ok("R1.60 a1 M1 fail: before the rollback both columns are there", cols() === "estimated_tax_minor,prepared_at");
  execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", join(migDir, "rollback.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  ok("R1.60 a1 M1 pass: rollback.sql drops both columns and puts back fo7ts's function as a definer owned by xr_wall_reader",
    cols() === "" && sql(`select (prosecdef and pg_get_userbyid(proowner) = 'xr_wall_reader' and pg_get_functiondef(oid) not like '%prepared_at%')::text from pg_proc where proname = 'money_trust_request_write'`) === "true");
  const after = await staffTrust.createRequest(R, { personId: p1.personId, amountMinor: 3000, currency: "CAD", purpose: "After the rollback (Sample)" }) as { id: string };
  ok("R1.60 a1 M1 pass: after the rollback #3033's request still saves (the old function), and the prepared request's row is kept", typeof after.id === "string" && sql(`select count(*) from money_trust_request where id = '${q1}'`) === "1");
  execFileSync(join(BIN, "psql"), [URL_, "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", join(migDir, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  ok("R1.60 a1 M1 pass: the migration applies again after its rollback (expand once more)", cols() === "estimated_tax_minor,prepared_at");
} catch (e) {
  fail++;
  console.log(`FAIL  R1.60 a1: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  disarm?.();
  await db.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the prune tool drops it */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
