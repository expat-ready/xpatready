// R1.60 part a2 (product/screens/R1.60/rules.md R6, R7, R9-R11, R17, B5, B7, B9; cases 8-11 and 16; AG-6-61 §5.4-§5.6,
// §5.11, §6, §8): what a person does with a deposit request a signed retainer prepared, through the routes under
// /api/front-office/money/trust as signed-in staff, behind PF-12's walls (the API connects as xr_app):
//   GET  /trust/requests?state=PREPARED            → { items: [{ id, status: "Prepared", amountMinor, estimatedTaxMinor, totalMinor, … }] }
//   POST /trust/requests/:id/send                  → 200 { id, number, status: "Sent", totalMinor, email }
//   PUT  /trust/requests/:id/amount { amountMinor, estimatedTaxMinor } → 200 (only while prepared)
//   POST /trust/requests/:id/cancel { reason }     → #3033's cancel: Don't send (R11)
// Each with agent/payment:record. Retainers are signed on paper through FO-5's service (part a1's listener prepares the
// request); RetainerVersionSignedPort (gap G5) runs its contract on its fake and its adapter. One scratch database
// (every migration, Sample seeds), dropped at the end. Fake mail, no network, no model call (US$0). Figures Sample.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_r160_prepared_act.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runContract } from "../ports/contracts/contract.ts";
import { retainerVersionSignedPortContract } from "../ports/contracts/retainer-version-signed-port.contract.ts";
import { fakeMail, type SentMail } from "../ports/mail.ts";
import { fakeRetainerVersionSigned } from "../ports/retainer-signed.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_r160a2_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const WORK = join(STUDIO, "var", `r160a2-check-${process.pid}`);
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const count = (t: string, where = "true") => Number(sql(`select count(*) from ${t} where ${where}`));
let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const words = (m: SentMail | undefined) => (m ? `${m.subject}\n${m.text}\n${m.html ?? ""}` : "");
const pdf = (s: string) => { const b = Buffer.from(`%PDF-1.4\n% ${s}\n%%EOF\n`); return { bytes: new Uint8Array(b), size: b.length }; };
async function refusal(fn: () => Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try { await fn(); return null; } catch (e) {
    const x = e as { getStatus?: () => number; getResponse?: () => unknown };
    return x.getStatus ? { status: x.getStatus(), body: x.getResponse!() as Record<string, unknown> } : { status: 0, body: { error: String(e) } };
  }
}

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
const mail = fakeMail();
try {
  for (const d of readdirSync(MIG).filter((x) => /^\d{14}_/.test(x)).sort()) execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-f", join(MIG, d, "migration.sql")], { stdio: ["ignore", "ignore", "pipe"] });
  process.env.DATABASE_URL = urlOf(DB);
  for (const k of ["PLATFORM_IDENTITY", "PLATFORM_ENVIRONMENT", "PLATFORM_SAMPLE_SEED", "PLATFORM_LOCAL_SECRET", "APP_DATABASE_URL"]) delete process.env[k];
  const { ConfigReadGuard, Db } = await import("../api/src/core.ts");
  const { seedSampleFirms } = await import("../api/src/platform/seed-sample-firms.ts");
  const { seedSampleFirmsFrontOffice } = await import("../api/src/front-office/firm-seed.ts");
  const { PlatformClock } = await import("../api/src/platform/identity/port.ts");
  const { LocalIdentity } = await import("../api/src/platform/identity/local.ts");
  const { IDENTITY_PORT, PlatformIdentity } = await import("../api/src/platform/identity/service.ts");
  const { PlatformGuard } = await import("../api/src/platform/identity/guard.ts");
  const { PlatformIdentityController } = await import("../api/src/platform/identity/routes.ts");
  const { FirmWallsInterceptor } = await import("../api/src/features/platform-firm-walls.ts");
  const { MAIL_PORT } = await import("../api/src/platform/identity/session/mail.ts");
  const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
  const { dutiesOf } = await import("../api/src/platform/identity/keys.ts");
  const { LocalFiles } = await import("../api/src/front-office/files.ts");
  const { buildDocx } = await import("../api/src/front-office/retainers/docx.ts");
  const { Retainers } = await import("../api/src/front-office/retainers/service.ts");
  const { PgRetainerVersionSigned, retainerSigned } = await import("../api/src/front-office/retainers/signed-hooks.ts");
  const { Leads } = await import("../api/src/front-office/sales/leads.ts");
  const { Prospects } = await import("../api/src/front-office/sales/prospects.ts");
  const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
  const { PreparedRequests, NOT_SIGNED } = await import("../api/src/client-money/trust/prepared.ts");
  const { clearingConflicts } = await import("./lib/conflict-clear.ts");
  const feature = (await import("../api/src/features/client-money-trust.ts")).default;
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const local = new LocalIdentity("r160a2-check-signing-key-0123456789abcdef", () => clock.now());
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: mail }, ...feature.providers];
  @Module({ controllers: [PlatformIdentityController, ...feature.controllers] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}`;
  const call = async (token: string | undefined, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}/api/front-office/money/trust${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };
  const signIn = async (actorId: string, firmKey: string) => {
    const r = await fetch(`${base}/api/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) });
    const b = await r.json() as { token?: string }; if (!b.token) throw new Error(JSON.stringify(b)); return b.token;
  };

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:R1.60', now())`);
  sql(`update money_payment_settings set tax_registered = true, tax_number = '123456789RT0001', trust_answer = 'YES', trust_answered_by = 'seed:R1.60' where firm_id in ('${A}', '${B}');
       update platform_firm set business_address = coalesce(business_address, '{}'::jsonb) || '{"province_state": "ON"}'::jsonb where id = '${A}'`);
  // user-R: firm A's Owner (agent/payment:record); user-T: a Case Manager without it; user-S: firm B's Owner.
  const tR = await signIn("user-R", "sample-firm"), tT = await signIn("user-T", "sample-firm"), tS = await signIn("user-S", "sample-solo");
  const ctxOf = (actorId: string, firmKey: string) => {
    const [id, firmId] = sql(`select id || '|' || firm_id from platform_staff where actor_id = '${actorId}'`).split("|");
    const roles = sql(`select string_agg(role::text, ',') from platform_role_grant where staff_id = '${id}'`).split(",");
    const keys = sql(`select string_agg(distinct permission_key, ',') from platform_role_permission where role::text = any(string_to_array('${roles.join(",")}', ','))`).split(",");
    return { staffId: id, firmId, firmKey, roles, keys, duties: dutiesOf(new Set(keys)), authTime: 0, via: "local" as const };
  };
  const R = ctxOf("user-R", "sample-firm");

  // Retainers signed on paper through FO-5's service: part a1's listener (armed by the feature) prepares each request.
  const files = new LocalFiles(join(WORK, "files")), svc = new Retainers(owner, files, { now: () => Date.now() });
  clearingConflicts(owner, { retainers: Retainers.prototype, prospects: Prospects.prototype });
  const salesPorts = { audit: auditEvent, consent: new ConsentStore(auditEvent), publicOrigin: "http://localhost:4400" };
  const leads = new Leads(owner, salesPorts), pros = new Prospects(owner, salesPorts);
  const tpl = await svc.uploadTemplate(R, { name: "R1.60 a2 retainer (Sample)" }, { bytes: buildDocx(["Client {client.name}", "{#fees}", "{label}: {amount}", "{/fees}"]), size: 1000 });
  let n = 0;
  const signed = async (given: string) => {
    const l = (await leads.add(R, { requestId: randomUUID(), givenNames: given, familyName: "Sample", email: `r160a2.${given.toLowerCase()}${++n}@example.org`, source: "Phone call" })) as { id: string; person: { id: string } };
    const p = await pros.engage(R, l.id);
    const rid = (await svc.draft(R, p.id, { templateId: tpl.id, fees: [{ label: "Deposit on signing", amountMinor: 100000, when: "ON_SIGNING" }] })).id;
    await svc.signedOffline(R, rid, { expectedVersion: "1", reason: "Signed at the office" }, pdf(`r160a2 ${given}`));
    const q = sql(`select q.id from money_trust_request q join fo_retainer_version v on v.id = q.retainer_version_id where v.retainer_id = '${rid}'`);
    return { rid, personId: l.person.id, q, version: sql(`select retainer_version_id from money_trust_request where id = '${q}'`) };
  };
  const s1 = await signed("Ana"), s2 = await signed("Ben"), s3 = await signed("Cal");
  ok("R1.60 a2 setup: three retainers signed on paper, each with one prepared request (part a1)", [s1, s2, s3].every((s) => s.q && count("money_trust_request", `id = '${s.q}' and prepared_at is not null and sent_at is null`) === 1));

  // ------------------------------------------------------------- the PREPARED list (R6, G1)
  const list = await call(tR, "GET", "/requests?state=PREPARED");
  ok("R1.60 a2 list pass: the Owner (agent/payment:record) lists the three prepared requests, each with its deposit, tax and total (CAD 1,000.00 + 130.00 = 1,130.00)",
    list.status === 200 && [s1, s2, s3].every((s) => list.body.items.some((i: Record<string, unknown>) => i.id === s.q && i.status === "Prepared" && i.amountMinor === 100000 && i.estimatedTaxMinor === 13000 && i.totalMinor === 113000)), list);
  const badList = await Promise.all([call(tR, "GET", "/requests?state=SENT"), call(tR, "GET", "/requests"), call(tT, "GET", "/requests?state=PREPARED"), call(tS, "GET", "/requests?state=PREPARED"), call(undefined, "GET", "/requests?state=PREPARED")]);
  ok("R1.60 a2 list fail: another state or none → 422; a Case Manager without agent/payment:record → 403; firm B lists none of firm A's; no session → 401",
    badList[0].status === 422 && badList[1].status === 422 && badList[2].status === 403 && badList[3].status === 200 && !JSON.stringify(badList[3].body).includes(s1.q) && badList[4].status === 401, badList.map((x) => x.status));

  // ------------------------------------------------------------- case 8: no trust details → refused; then DR-, the email, no card
  const before8 = mail.sent.length;
  const noDetails = await call(tR, "POST", `/requests/${s1.q}/send`);
  ok("R1.60 case 8 fail (R7, B7): Send with the trust details empty → 409 NO_TRUST_DETAILS in words; still prepared, no number, no email",
    noDetails.status === 409 && noDetails.body.code === "NO_TRUST_DETAILS" && /Add your trust payment details/.test(noDetails.body.detail)
      && count("money_trust_request", `id = '${s1.q}' and prepared_at is not null and sent_at is null and number is null`) === 1 && mail.sent.length === before8, noDetails);
  sql(`update money_payment_settings set trust_details = 'Trust account (Sample): Bank 001, transit 00011, account 1234567' where firm_id = '${A}'`);
  const sent1 = await call(tR, "POST", `/requests/${s1.q}/send`);
  const m1 = mail.sent.filter((m) => m.idempotencyKey === `trust-request:${s1.q}`);
  ok("R1.60 case 8 pass (B5): Send takes DR-0001 and answers Sent with the total", sent1.status === 200 && sent1.body.number === "DR-0001" && sent1.body.status === "Sent" && sent1.body.totalMinor === 113000 && sent1.body.email === "SENT", sent1);
  ok("R1.60 case 8 pass (§5.5): one email to the client holds DR-0001, CAD 1,130.00 including CAD 130.00 estimated tax, and the trust details",
    m1.length === 1 && /DR-0001/.test(words(m1[0])) && /CAD 1,130\.00 \(including CAD 130\.00 estimated tax\)/.test(words(m1[0])) && /transit 00011/.test(words(m1[0])), words(m1[0]));
  ok("R1.60 case 8 fail (B9, planted words): the email offers no card and no pay link", m1.length === 1 && !/card|pay link|http/i.test(words(m1[0])), words(m1[0]));
  const read1 = await call(tR, "GET", `/requests/${s1.q}`);
  ok("R1.60 case 8 pass: the request now reads Sent with its number; a second Send → 409 ALREADY_SENT",
    read1.body.status === "Sent" && read1.body.number === "DR-0001" && (await call(tR, "POST", `/requests/${s1.q}/send`)).body.code === "ALREADY_SENT", read1);
  ok("R1.60 case 8 pass (R16): one trust.request_sent audit line by the Owner", count("audit_event", `action = 'trust.request_sent' and entity_key = '${s1.q}' and actor = 'staff:${R.staffId}'`) === 1);

  // ------------------------------------------------------------- review a1 m5: Paid counts the estimated tax
  const dep = (amountMinor: number) => call(tR, "POST", "/deposits", { personId: s1.personId, trustRequestId: s1.q, method: "BANK_TRANSFER", amountMinor, currency: "CAD", idempotencyKey: `r160a2-${amountMinor}-${randomUUID().slice(0, 8)}` });
  const d1 = await dep(100000), afterDeposit = await call(tR, "GET", `/requests/${s1.q}`);
  ok("R1.60 a2 pass (review a1 m5): the deposit row alone (1,000.00 of 1,130.00) reads Part paid, not Paid", d1.status === 201 && afterDeposit.body.status === "Part paid", { d1, afterDeposit });
  await dep(13000);
  ok("R1.60 a2 pass: with the estimated tax paid too (1,130.00) it reads Paid", (await call(tR, "GET", `/requests/${s1.q}`)).body.status === "Paid");

  // ------------------------------------------------------------- case 9: keys, firms, sight
  const keys9 = await Promise.all([call(tT, "POST", `/requests/${s2.q}/send`), call(tT, "PUT", `/requests/${s2.q}/amount`, { amountMinor: 1, estimatedTaxMinor: 0 }), call(tS, "POST", `/requests/${s2.q}/send`), call(tS, "PUT", `/requests/${s2.q}/amount`, { amountMinor: 1, estimatedTaxMinor: 0 }), call(tR, "POST", `/requests/not-an-id/send`)]);
  ok("R1.60 case 9 fail (R9): without agent/payment:record Send and Edit amount → 403; firm B → 404; a malformed id → 404; the request is untouched",
    keys9[0].status === 403 && keys9[1].status === 403 && keys9[2].status === 404 && keys9[3].status === 404 && keys9[4].status === 404 && count("money_trust_request", `id = '${s2.q}' and sent_at is null and amount_minor = 100000`) === 1, keys9.map((k) => k.status));

  // ------------------------------------------------------------- case 10: Edit amount while prepared; never once sent
  const ed = await call(tR, "PUT", `/requests/${s2.q}/amount`, { amountMinor: 120000, estimatedTaxMinor: 15600 });
  ok("R1.60 case 10 pass (R10): Edit amount while prepared stores the new figures with one audit line naming before and after",
    ed.status === 200 && ed.body.changed === true && sql(`select amount_minor || ':' || estimated_tax_minor from money_trust_request where id = '${s2.q}'`) === "120000:15600"
      && sql(`select detail::text from audit_event where action = 'trust.request_amount_edited' and entity_key = '${s2.q}'`) .includes("120000"), { ed, detail: sql(`select detail::text from audit_event where action = 'trust.request_amount_edited' and entity_key = '${s2.q}'`) });
  const bad10 = await Promise.all([call(tR, "PUT", `/requests/${s2.q}/amount`, { amountMinor: 0, estimatedTaxMinor: 0 }), call(tR, "PUT", `/requests/${s2.q}/amount`, { amountMinor: 10.5, estimatedTaxMinor: 0 }),
    call(tR, "PUT", `/requests/${s2.q}/amount`, { amountMinor: 100, estimatedTaxMinor: -1 }), call(tR, "PUT", `/requests/${s2.q}/amount`, { amountMinor: 100, estimatedTaxMinor: 0, currency: "USD" }), call(tR, "PUT", `/requests/${s1.q}/amount`, { amountMinor: 100, estimatedTaxMinor: 0 })]);
  ok("R1.60 case 10 fail: a zero, a fraction, a negative tax or a currency → 422; a sent request (DR-0001) → 409 SENT; nothing changed",
    bad10.slice(0, 4).every((x) => x.status === 422) && bad10[4].status === 409 && bad10[4].body.code === "SENT" && sql(`select amount_minor from money_trust_request where id = '${s1.q}'`) === "100000", bad10.map((x) => [x.status, x.body?.code]));

  // ------------------------------------------------------------- case 11: Don't send with a reason; replay; a sent one keeps its number
  const noReason = await call(tR, "POST", `/requests/${s3.q}/cancel`, { reason: "" });
  const dont = await call(tR, "POST", `/requests/${s3.q}/cancel`, { reason: "Client paid the deposit with the first invoice" });
  ok("R1.60 case 11 pass (R11): Don't send with a reason → Cancelled with no number (an empty reason → 422)",
    noReason.status === 422 && dont.status === 200 && dont.body.status === "Cancelled" && dont.body.number === null && count("money_trust_request", `id = '${s3.q}' and number is null and cancelled_at is not null`) === 1, { noReason, dont });
  ok("R1.60 case 11 fail: a cancelled request can't be sent or edited (409 CANCELLED), and is off the PREPARED list",
    (await call(tR, "POST", `/requests/${s3.q}/send`)).body.code === "CANCELLED" && (await call(tR, "PUT", `/requests/${s3.q}/amount`, { amountMinor: 5, estimatedTaxMinor: 0 })).body.code === "CANCELLED"
      && !JSON.stringify((await call(tR, "GET", "/requests?state=PREPARED")).body).includes(s3.q));
  const facts3 = { retainerId: s3.rid, retainerVersionId: s3.version, version: 1, kind: "RETAINER" as const, via: "E_SIGNED" as const, representativeStaffId: R.staffId, personId: s3.personId, companyId: null,
    prospectId: null, actor: "system:signing-webhook", fees: [{ label: "Deposit on signing", amountMinor: "100000", currency: "CAD", when: "ON_SIGNING" }] };
  await owner.$transaction((tx) => retainerSigned(tx as never, auditEvent, A, facts3));
  ok("R1.60 case 11 pass (B4): a replay of the signing after Don't send writes nothing (the cancelled request keeps its version)", count("money_trust_request", `retainer_version_id = '${s3.version}'`) === 1);
  const cancelSent = await call(tR, "POST", `/requests/${s1.q}/cancel`, { reason: "Planted: a sent request cancelled" });
  ok("R1.60 case 11 pass: a sent request cancelled by a person keeps its DR- number", (cancelSent.status === 200 || cancelSent.status === 409) && sql(`select number from money_trust_request where id = '${s1.q}'`) === "DR-0001", cancelSent);

  // ------------------------------------------------------------- case 16: a retainer no longer signed (R17, gap G5's fake)
  const s4 = await signed("Dee");
  const fake = fakeRetainerVersionSigned([{ firmId: A, retainerVersionId: s4.version }]);
  const seesAll = async () => ({ cases: [], parties: [s4.personId] });
  const svc16 = new PreparedRequests(owner, auditEvent, { now: () => new Date() }, mail, seesAll, fake);
  fake.undo(A, s4.version);
  const r16 = await refusal(() => svc16.send(R as never, s4.q));
  ok("R1.60 case 16 fail (R17): Send of a request whose retainer is no longer signed → 409 RETAINER_NOT_SIGNED, saying why and offering Cancel",
    r16?.status === 409 && r16.body.code === "RETAINER_NOT_SIGNED" && r16.body.detail === NOT_SIGNED && /Cancel this request with a reason/.test(String(r16.body.detail)), r16);
  ok("R1.60 case 16 pass (planted automatic cancel): the undone retainer cancelled nothing: the request is still prepared, no number",
    count("money_trust_request", `id = '${s4.q}' and prepared_at is not null and sent_at is null and cancelled_at is null and number is null`) === 1);
  const c16 = await call(tR, "POST", `/requests/${s4.q}/cancel`, { reason: "Retainer marked signed by mistake" });
  ok("R1.60 case 16 pass: a person cancels it with a reason", c16.status === 200 && c16.body.status === "Cancelled", c16);
  ok("R1.60 case 16 pass: a request already sent (DR-0001) is left as it was", sql(`select number from money_trust_request where id = '${s1.q}'`) === "DR-0001");

  // ------------------------------------------------------------- G5: RetainerVersionSignedPort's contract, on its fake and its adapter
  const fakeH = fakeRetainerVersionSigned();
  await runContract(retainerVersionSignedPortContract, "fakeRetainerVersionSigned", () => ({ port: fakeH, firm: A, otherFirm: B,
    async signedVersion() { const v = randomUUID(); fakeH.sign(A, v); return v; }, async undo(v: string) { fakeH.undo(A, v); } }), ok);
  const adapter = new PgRetainerVersionSigned(owner);
  await runContract(retainerVersionSignedPortContract, "PgRetainerVersionSigned", () => ({ port: adapter, firm: A, otherFirm: B,
    async signedVersion() { return (await signed(`Port${n}`)).version; },
    async undo(v: string) { sql(`set session_replication_role = replica; update fo_retainer set current_version = current_version + 1 where id = (select retainer_id from fo_retainer_version where id = '${v}')`); } }), ok);
  ok("R1.60 G5 pass: the adapter answers the signed paper retainers (s2) as signed", await adapter.versionSigned(A, s2.version) === true);
} catch (e) {
  fail++;
  console.log(`FAIL  R1.60 a2: the check stopped — ${String((e as Error)?.stack ?? e).slice(0, 1500)}`);
} finally {
  await app?.close();
  await owner.$disconnect();
  try { execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]); } catch { /* the prune tool drops it */ }
  rmSync(WORK, { recursive: true, force: true });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
