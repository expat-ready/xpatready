// FO-7t part 1 (R1.58; briefs/track-b/FO-7t-1.md over design/briefs/FO-7t.md part 1; AG-6-59, AG-6-60 rules 1-4, 6, 8,
// AG-6-62, AG-6-63 rules 1, 3-5, 7, AG-6-69 rule 1, AG-6-71 rules 2, 4, AG-6-33 rule 3, AG-6-37 rules 1-3; P-567 (3),
// P-603, P-607 (1), P-634 (1), P-584 (10); Code SOR/2022-128 s. 32(a)-(g), s. 33(3) as FO-7a cites it; legal reading
// Unconfirmed: no counsel): trust on and money in, through the routes under /api/front-office/money/trust.
// The named cases of part 1, each a pass and a fail: DW1 (trust off), DW2 (the Owner's answer), DW3 (trust request),
// DW4 (deposit), DW5 (the TRUST receipt), DW6 (ledger and balances), DW10 (walls, C5 and audit, part 1's routes) and
// DW18 (the trust.deposited event). Parts 2-5's cases (DW7-DW9, DW11-DW17) are theirs. Left to part 2: DW1's "an invoice
// read names no trust field" (FO-7b's invoice read is the place; part 2 edits it). trust.request_sent (proposed in
// FO-7t.md) waits on Lead B's confirmation and is not asserted (FO-7t-1 allows the trust.deposited line only).
// Written before the build (check first, Lead 4, 22 Nov). It pins the route contract the build must meet:
//   GET  /trust/answer                      → { answer, answeredBy, answeredAt }   (always answers, also with trust off)
//   PUT  /trust/answer { answer }           → 200 { answer, held: [{ currency, amountMinor, cases }], message? }; non-Owner 403
//   POST /trust/requests { personId | companyId, caseId?, amountMinor, currency, purpose }   (agent/payment:record)
//                                           → 201 { id, number, status, email: "SENT" | "HELD", message? }
//   POST /trust/requests/:id/cancel { reason } → 200 { status: "Cancelled", number }
//   GET  /trust/requests/:id                → { id, number, status: Waiting | Sent | Part paid | Paid | Cancelled, paidMinor, extraNote? }
//   POST /trust/deposits { personId | companyId, caseId?, trustRequestId?, method, amountMinor, currency, reference?,
//                          evidenceFileKey?, idempotencyKey, duplicateReferenceAcknowledged? }   (agent/payment:record)
//                                           → 201 { paymentId, entryId, receiptNumber, cleared, receiptEmail } (a replay: 200)
//     A duplicate reference is any trust deposit of the same party with that reference, any case (as FO-7b's payments).
//     evidenceFileKey is a FilesPort key the screen got from its upload; only the key is stored (the route never reads bytes).
//     A cheque's TRUST receipt says "Not yet cleared" on the receipt PDF and in its email's text (the check reads the text).
//   GET  /trust/ledger?personId=&caseId=&currency=&pageSize= → { items: [{ at, kind, reference, payer, amountMinor,
//                                              balanceAfterMinor }], pageSize }   (newest first; default 50, maximum 200)
//   GET  /trust/balances?personId=          → { balances: [{ currency, caseId, amountMinor }], totals: [{ currency, amountMinor }] }
//   (FO-7t.md names the query party=&case=; personId=/companyId=/caseId= are the same, as FO-7b's routes spell them.)
// Field errors answer 422 (PF-28 part 6; Lead 10, 23 Nov; FO-7t.md's "400" predates it). A non-Owner may read the answer (AG-6-59
// rule 8: "Last changed <date> by <person>" is shown to staff). Audit lines: trust.answered, trust.request_created (one
// per request, sent or held), trust.request_cancelled, trust.deposited; old and new in `detail` as <field>_before/_after.
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls and this row's feature, with the local
// sign-in stand-in; the API connects as xr_app; the mail is the fake. No network, no model call, no Stripe call (US$0).
// Amounts are Sample. Dropped at the end, also when the feature is missing.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo7t_trust.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail, type SentMail } from "../ports/mail.ts";
import { TRUST_EVENT } from "../ports/events/client-money-trust.ts";   // ports/events.ts is frozen since #2919 (P-785 (2)): the trust names live in their own file (review m11)
import { runContract } from "../ports/contracts/contract.ts";
import { documentRenderPortContract } from "../ports/contracts/document-render-port.contract.ts";
import { TrustDocuments } from "../api/src/client-money/trust/documents.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7t_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };
const fieldError = (status: number) => status === 422;   // PF-28 part 6; Lead 10, 23 Nov
/** The one money format of every message (AG-6-68 rule 8; FO-7t.md DW7): two decimals, thousands with a comma. */
const money = (minor: number) => (minor / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** What a person reads in an email: subject and text (never the attachment's bytes). */
const words = (m: SentMail | undefined) => (m ? `${m.subject}\n${m.text}\n${m.html ?? ""}` : "");

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
  const feature = (await import("../api/src/features/client-money-trust.ts")).default;
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const local = new LocalIdentity("fo7t-check-signing-key-0123456789abcdef", () => clock.now());

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
  ok("setup: the feature registers its controllers and providers in its own file (P-214)", feature.controllers.length >= 1 && feature.providers.length >= 1);

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo7t.${n}@example.org', 'seed:FO-7t-1', now()) returning id`);
  const PA = person(A, "a"), PC = person(A, "c"), PB = person(B, "b");
  // user-R: sample-firm's Owner (holds agent/payment:record); user-T: a Case Manager and user-O: a Case Officer (neither
  // holds agent/payment:record, PF-3's role keys); user-S: sample-solo's Owner.
  const tR = await signIn("user-R", "sample-firm"), tT = await signIn("user-T", "sample-firm"), tO = await signIn("user-O", "sample-firm"), tS = await signIn("user-S", "sample-solo");
  const staffR = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`);
  // C5 through MoneyVisibilityPort (CS-MV1, on main since this check was approved; it replaces "fail closed until CS-K3's
  // check is reachable"): an entry is visible when its case is (the case side's caseScope), or its party, with no case,
  // is (the front office's own-versus-all on prospects). A bare fo_person with no prospect and no case is seen by nobody,
  // and PF-3's seed gives every role agent/case:view.all and agent/prospect:view.all. So, truthfully for DW6 and DW10:
  // PA is the subject of a prospect user-R owns; CASE (below) is a real case of firm A on PA; and the Case Officer role
  // sees only its own (agent/case:view.all and agent/prospect:view.all taken from CASE_OFFICER), with user-O on no team
  // and owning no prospect: "a Case Officer who cannot see a case gets an empty ledger page" (FO-7t.md DW10).
  const CASE = "00000000-0000-4000-8000-0000000f07a1", W = "00000000-0000-4000-8000-0000000f07a2", CLIENT = "00000000-0000-4000-8000-0000000f07a3";
  // Build round 1 (M1): CASE2, a second case of PA; CASE_C, PC's case; CASE_B, firm B's case on PB.
  const CASE2 = "00000000-0000-4000-8000-0000000f07a4", CASE_C = "00000000-0000-4000-8000-0000000f07a5", CASE_B = "00000000-0000-4000-8000-0000000f07a6";
  const CLIENT_C = "00000000-0000-4000-8000-0000000f07a7", CLIENT_B = "00000000-0000-4000-8000-0000000f07a8";
  sql(`set session_replication_role = replica;
    insert into workspace (id, key, label) values ('${W}', 'fo7t-check', 'FO-7t (Sample)');
    insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values ('${CLIENT}', '${W}', 'sample-firm', '${A}', 1, 'Client a (Sample)', 'PERSON', '${PA}', 'seed:FO-7t-1');
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status)
      values ('${CASE}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07001', 'sample-firm', '${A}', '${CLIENT}', 'OPEN'),
             ('${CASE2}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07002', 'sample-firm', '${A}', '${CLIENT}', 'OPEN');
    insert into case_client (id, workspace_id, firm_key, firm_id, client_number, display_name, display_kind, fo_person_id, created_by) values
      ('${CLIENT_C}', '${W}', 'sample-firm', '${A}', 2, 'Client c (Sample)', 'PERSON', '${PC}', 'seed:FO-7t-1'), ('${CLIENT_B}', '${W}', 'sample-solo', '${B}', 1, 'Client b (Sample)', 'PERSON', '${PB}', 'seed:FO-7t-1');
    insert into runtime_case (id, workspace_id, combination_id, client_actor_id, created_by, case_number, firm_key, firm_id, client_id, status)
      values ('${CASE_C}', '${W}', gen_random_uuid(), 'user-P', 'user-R', 'C-2026-07003', 'sample-firm', '${A}', '${CLIENT_C}', 'OPEN'),
             ('${CASE_B}', '${W}', gen_random_uuid(), 'user-P', 'user-S', 'C-2026-07001', 'sample-solo', '${B}', '${CLIENT_B}', 'OPEN');
    insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
      values (gen_random_uuid(), '${A}', 'P-07001', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${PA}', '${PA}', '${staffR}', 'seed:FO-7t-1', now()),
             (gen_random_uuid(), '${A}', 'P-07002', gen_random_uuid(), 'INDIVIDUAL', gen_random_uuid(), '${PC}', '${PC}', '${staffR}', 'seed:FO-7t-1', now());   -- PC too (Lead B: a write with no case needs a party the writer sees)
    delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key in ('agent/case:view.all', 'agent/prospect:view.all')`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7t-1', now())`);
  const audits = (action: string) => Number(sql(`select count(*) from audit_event where action = '${action}'`));
  const answerOf = (f: string) => sql(`select trust_answer from money_payment_settings where firm_id = '${f}'`);
  /** The TRUST receipt of a deposit: through its DEPOSIT entry (a TRUST receipt names the entry, never the payment). */
  const receiptsOf = (paymentId: string) => sql(`select count(*) from money_receipt r join money_trust_entry e on e.firm_id = r.firm_id and e.id = r.trust_entry_id where r.kind = 'TRUST' and e.payment_id = '${paymentId}'`);

  // ------------------------------------------------------------------------------------------------ DW1: trust off
  // Firm B (nothing held) asks every part 1 route while UNANSWERED, then while NO; then the same routes with YES answer.
  const routesB = (id = "00000000-0000-4000-8000-000000000001") => Promise.all([call(tS, "GET", `/ledger?personId=${PB}`), call(tS, "GET", `/balances?personId=${PB}`), call(tS, "GET", `/requests/${id}`),
    call(tS, "POST", "/requests", { personId: PB, amountMinor: 60000, currency: "CAD", purpose: "Retainer deposit (Sample)" }),
    call(tS, "POST", "/deposits", { personId: PB, method: "E_TRANSFER", amountMinor: 60000, currency: "CAD", reference: "ET-B", idempotencyKey: `fo7t-off-${Math.random()}` })]);
  const unanswered = await call(tS, "GET", "/answer"), offU = await routesB();
  ok("FO-7t DW1 pass: UNANSWERED and nothing held: /trust/answer answers (UNANSWERED); ledger, balances, a request read, a new request and a deposit all answer 404; nothing written",
    unanswered.status === 200 && unanswered.body.answer === "UNANSWERED" && offU.every((r) => r.status === 404) && sql(`select count(*) from money_trust_request`) === "0" && sql(`select count(*) from money_payment`) === "0", offU.map((r) => r.status));
  await call(tS, "PUT", "/answer", { answer: "NO" }); const offN = await routesB();
  ok("FO-7t DW1 pass: NO and nothing held: the same five answer 404; nothing written", answerOf(B) === "NO" && offN.every((r) => r.status === 404) && sql(`select count(*) from money_payment`) === "0", offN.map((r) => r.status));
  await call(tS, "PUT", "/answer", { answer: "YES" }); const onB = await call(tS, "GET", `/ledger?personId=${PB}`);
  ok("FO-7t DW1 fail (the same route, trust on): with YES the ledger read answers 200, so its 404 above was trust off, not a missing route", onB.status === 200 && Array.isArray(onB.body.items), onB);

  // ------------------------------------------------------------------------------------------------ DW2: the answer
  const notOwner = await call(tT, "PUT", "/answer", { answer: "YES" });
  ok("FO-7t DW2 fail: a Case Manager (not the Owner) answering → 403, the answer unchanged, no audit line for firm A",
    notOwner.status === 403 && answerOf(A) === "UNANSWERED" && sql(`select count(*) from audit_event where action = 'trust.answered' and firm_id = '${A}'`) === "0", notOwner.body);
  const bad = await call(tR, "PUT", "/answer", { answer: "MAYBE" });
  ok("FO-7t DW2 fail: an answer other than YES or NO → a field error (422), unchanged (zod, AG-6-37 rule 3)", fieldError(bad.status) && answerOf(A) === "UNANSWERED", bad.body);
  const yes = await call(tR, "PUT", "/answer", { answer: "YES" });
  const yesAudit = sql(`select count(*) || ':' || min(actor) || ':' || min(detail->>'answer_before') || ':' || min(detail->>'answer_after') from audit_event where action = 'trust.answered' and firm_id = '${A}'`);
  ok("FO-7t DW2 pass: the Owner's Yes → 200, stored with who (staff) and when (the database's), one audit line by the Owner with old and new",
    yes.status === 200 && yes.body.answer === "YES" && sql(`select trust_answer || ':' || trust_answered_by || ':' || (trust_answered_at is not null) from money_payment_settings where firm_id = '${A}'`) === `YES:staff:${staffR}:true`
    && yesAudit === `1:staff:${staffR}:UNANSWERED:YES`, [yes.body, yesAudit]);
  const read = await call(tO, "GET", "/answer");
  ok("FO-7t DW2 pass: a staff member reads the answer with its \"Last changed\" facts (AG-6-59 rule 8)", read.status === 200 && read.body.answer === "YES" && typeof read.body.answeredAt === "string" && !!read.body.answeredBy, read.body);

  // ------------------------------------------------------------------------------------------- DW3: trust request
  const reqBody = { personId: PA, amountMinor: 60000, currency: "CAD", purpose: "Retainer deposit (Sample)" };
  const keyless = await Promise.all([call(tT, "POST", "/requests", reqBody), call(tO, "POST", "/requests", reqBody)]);
  ok("FO-7t DW3 fail (keys): a Case Manager and a Case Officer (no agent/payment:record) → 403, nothing written", keyless.every((r) => r.status === 403) && sql(`select count(*) from money_trust_request where firm_id = '${A}'`) === "0", keyless.map((r) => r.status));
  const waiting = await call(tR, "POST", "/requests", reqBody);
  ok("FO-7t DW3 pass (AG-6-71 rule 4): with the trust details block empty the request is stored unsent, no number, no email, \"Add your trust payment details\"",
    waiting.status === 201 && waiting.body.number === null && waiting.body.email === "HELD" && /Add your trust payment details/.test(waiting.body.message ?? "") && mail.sent.length === 0
    && sql(`select count(*) from money_trust_request where sent_at is null and number is null`) === "1", waiting.body);
  sql(`update money_payment_settings set trust_details = 'Trust account (Sample): Bank 001, transit 00011, account 1234567' where firm_id = '${A}'`);
  const r1 = await call(tR, "POST", "/requests", reqBody), m1 = mail.sent.filter((m) => "firmId" in m && m.firmId === A);
  const text = words(m1.at(-1));
  ok("FO-7t DW3 pass: sent → one DR- number (the database's), status Sent, one email to the party (fo7t.a@example.org) with no Cc, holding the number, 600.00 and the trust details block",
    r1.status === 201 && /^DR-\d{4,}$/.test(r1.body.number) && r1.body.status === "Sent" && r1.body.email === "SENT" && m1.length === 1 && m1[0].to === "fo7t.a@example.org" && !("cc" in (m1[0] as object))
    && text.includes(r1.body.number) && text.includes("600.00") && text.includes("transit 00011") && sql(`select number from money_trust_request where id = '${r1.body.id}'`) === r1.body.number, [r1.body, m1.map(words)]);
  ok("FO-7t DW3 fail (P-567 (3)): the email carries no link and no word \"card\"", !/https?:\/\//i.test(text) && !/\bcard\b/i.test(text), text);
  const noReason = await call(tR, "POST", `/requests/${r1.body.id}/cancel`, {});
  ok("FO-7t DW3 fail: cancel without a reason → a field error (422), the request still Sent, no audit line", fieldError(noReason.status) && sql(`select cancelled_at is null from money_trust_request where id = '${r1.body.id}'`) === "t" && audits("trust.request_cancelled") === 0, noReason.body);
  const r2 = await call(tR, "POST", "/requests", { ...reqBody, amountMinor: 20000 });
  const cancel = await call(tR, "POST", `/requests/${r2.body.id}/cancel`, { reason: "Asked twice by mistake" });
  ok("FO-7t DW3 pass: a cancelled request keeps its number (Cancelled, reason stored, one audit line)", cancel.status === 200 && cancel.body.status === "Cancelled" && cancel.body.number === r2.body.number
    && sql(`select number || ':' || cancel_reason from money_trust_request where id = '${r2.body.id}'`) === `${r2.body.number}:Asked twice by mistake` && audits("trust.request_cancelled") === 1, cancel.body);
  const prospect = await call(tR, "POST", "/requests", { amountMinor: 100, currency: "CAD", purpose: "x" }), otherFirm = await call(tR, "POST", "/requests", { ...reqBody, personId: PB });
  ok("FO-7t DW3 fail: a request with no person or company (a field error), or on another firm's person (404, as DW10) → nothing written",
    fieldError(prospect.status) && otherFirm.status === 404 && sql(`select count(*) from money_trust_request where firm_id = '${A}'`) === "3", [prospect.body, otherFirm.body]);

  // ------------------------------------------------------------------------------------------------- DW4: deposit
  const dep = (body: Record<string, unknown>, t = tR) => call(t, "POST", "/deposits", { personId: PA, currency: "CAD", ...body });
  const keylessD = await Promise.all([dep({ method: "WIRE", amountMinor: 100, idempotencyKey: "fo7t-k1" }, tT), dep({ method: "WIRE", amountMinor: 100, idempotencyKey: "fo7t-k2" }, tO)]);
  ok("FO-7t DW4 fail (keys): a Case Manager and a Case Officer recording a deposit → 403, nothing written", keylessD.every((r) => r.status === 403) && sql(`select count(*) from money_payment`) === "0", keylessD.map((r) => r.status));
  const cards = await Promise.all([dep({ method: "CARD", amountMinor: 1000, idempotencyKey: "fo7t-card" }), dep({ method: "CARD_TERMINAL", amountMinor: 1000, idempotencyKey: "fo7t-card-terminal" })]);
  ok("FO-7t DW4 fail (P-567 (3)): CARD or CARD_TERMINAL into trust → refused with a field error (422), nothing written", cards.every((r) => fieldError(r.status)) && sql(`select count(*) from money_payment`) === "0", cards.map((r) => r.body));
  const d1body = { method: "E_TRANSFER", amountMinor: 60000, trustRequestId: r1.body.id, reference: "ET-0001", evidenceFileKey: "firm/fo7t/evidence/et-0001.pdf", idempotencyKey: "fo7t-dep1" };
  const d1 = await dep(d1body), d1again = await dep(d1body);
  ok("FO-7t DW4 pass: a deposit → one payment received into TRUST, one DEPOSIT entry in the same transaction, one TRUST receipt; the same key again → 200, the same payment, nothing more",
    d1.status === 201 && d1again.status === 200 && d1again.body.paymentId === d1.body.paymentId
    && sql(`select count(*) || ':' || min(received_into::text) from money_payment where idempotency_key = 'fo7t-dep1'`) === "1:TRUST"
    && sql(`select count(*) from money_trust_entry where payment_id = '${d1.body.paymentId}' and kind = 'DEPOSIT' and amount_minor = 60000`) === "1" && receiptsOf(d1.body.paymentId) === "1", [d1.body, d1again.body]);
  const raced = await Promise.all([dep({ method: "WIRE", amountMinor: 1500, idempotencyKey: "fo7t-replay" }), dep({ method: "WIRE", amountMinor: 1500, idempotencyKey: "fo7t-replay" })]);
  ok("FO-7t DW4 pass: the same new key sent twice at once → one payment (201 and 200)", raced.map((r) => r.status).sort().join() === "200,201" && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-replay'`) === "1", raced.map((r) => r.status));
  ok("FO-7t DW4 pass: the evidence is its FilesPort key on money_payment.evidence_file_key, never the file's bytes in a column (no bytea column on money_)",
    sql(`select evidence_file_key from money_payment where id = '${d1.body.paymentId}'`) === "firm/fo7t/evidence/et-0001.pdf"
    && sql(`select count(*) from information_schema.columns where table_name like 'money\\_%' and data_type = 'bytea'`) === "0");
  const dup = await dep({ method: "E_TRANSFER", amountMinor: 5000, reference: "et-0001", idempotencyKey: "fo7t-dup" });
  ok("FO-7t DW4 fail: a duplicate reference (the same party, any case, any letter case) → 409 DUPLICATE_REFERENCE, a warning asking for a confirm; nothing written",
    dup.status === 409 && dup.body.code === "DUPLICATE_REFERENCE" && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-dup'`) === "0", dup.body);
  const looks = await Promise.all(["ＥＴ-0001", "ET-0001\u200b", " et-0001\u00a0"].map((reference, i) => dep({ method: "E_TRANSFER", amountMinor: 5000, reference, idempotencyKey: `fo7t-look-${i}` })));
  ok("FO-7t DW4 fail (build round 1): a look-alike reference (full-width letters, a zero-width space, a no-break space) is the same duplicate → 409; nothing written",
    looks.every((r) => r.status === 409 && r.body.code === "DUPLICATE_REFERENCE") && sql(`select count(*) from money_payment where idempotency_key like 'fo7t-look-%'`) === "0", looks.map((r) => r.body));
  const dupOk = await dep({ method: "E_TRANSFER", amountMinor: 5000, reference: "et-0001", idempotencyKey: "fo7t-dup", duplicateReferenceAcknowledged: true });
  ok("FO-7t DW4 pass: the same duplicate, confirmed → recorded", dupOk.status === 201 && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-dup'`) === "1", dupOk.body);
  const keyReuse = await dep({ method: "WIRE", amountMinor: 7000, idempotencyKey: "fo7t-dep1" });
  ok("FO-7t DW4 fail: the same idempotency key with a different payment → 409, nothing written", keyReuse.status === 409 && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-dep1'`) === "1", keyReuse.body);

  // ------------------------------------------------------------------------------------------ DW5: the TRUST receipt
  const receiptMail = (number: string) => mail.sent.find((m) => m.attachments?.some((a) => a.filename === `${number}.pdf`));
  const cheque = await dep({ method: "CHEQUE", amountMinor: 25000, reference: "CHQ 104", idempotencyKey: "fo7t-chq" }), chequeMail = receiptMail(cheque.body.receiptNumber), etMail = receiptMail(d1.body.receiptNumber);
  ok("FO-7t DW5 pass: every trust deposit has exactly one TRUST receipt R- (the one series), emailed to the party with its PDF and no Cc",
    sql(`select count(*) from money_payment p where p.received_into = 'TRUST' and (select count(*) from money_receipt r join money_trust_entry e on e.firm_id = r.firm_id and e.id = r.trust_entry_id where e.payment_id = p.id and r.kind = 'TRUST' and r.number like 'R-%') <> 1`) === "0"
    && !!chequeMail && chequeMail.to === "fo7t.a@example.org" && !("cc" in (chequeMail as object)) && chequeMail.attachments?.[0]?.contentType === "application/pdf", [cheque.body, words(chequeMail)]);
  ok("FO-7t DW5 pass (AG-6-63 rule 7): a cheque is recorded not cleared, and its receipt email says \"Not yet cleared\"; the e-Transfer's receipt email (found by its own PDF) does not",
    cheque.body.cleared === false && sql(`select cleared from money_payment where id = '${cheque.body.paymentId}'`) === "f" && /Not yet cleared/.test(words(chequeMail))
    && !!etMail && !/Not yet cleared/.test(words(etMail)), [words(chequeMail), words(etMail)]);
  const both = await Promise.all([dep({ method: "WIRE", amountMinor: 1000, idempotencyKey: "fo7t-at-once-a" }), dep({ personId: PC, method: "WIRE", amountMinor: 1000, idempotencyKey: "fo7t-at-once-c" })]);
  const nums = both.map((r) => Number(String(r.body.receiptNumber).slice(2))).sort((a, b) => a - b);
  ok("FO-7t DW5 pass: two deposits at the same moment on two parties (no shared party lock) → two receipts with consecutive numbers", both.every((r) => r.status === 201) && nums[1] === nums[0] + 1, both.map((r) => r.body));
  ok("FO-7t DW5 fail: across the firm the TRUST and PAYMENT receipts share one R- series with no gap and no repeat",
    sql(`select count(*) = max(substr(number, 3)::int) and count(*) = count(distinct number) from money_receipt where firm_id = '${A}'`) === "t");

  // --------------------------------------------------------------------------------------- DW6: ledger and balances
  // CASE: firm A's Sample case on PA (set up above, for C5); money_trust_entry.case_id has no key across the module wall.
  const onCase = await dep({ method: "E_TRANSFER", amountMinor: 30000, caseId: CASE, reference: "ET-case", idempotencyKey: "fo7t-case" }), usd = await dep({ method: "WIRE", amountMinor: 12345, currency: "USD", reference: "W-USD", idempotencyKey: "fo7t-usd" });
  ok("FO-7t DW6 setup: a deposit on a case and a deposit in USD are recorded", onCase.status === 201 && usd.status === 201, [onCase.body, usd.body]);
  // Build round 1, M1: a case is one the caller sees (MoneyVisibilityPort), of this firm, of this client, and a deposit on
  // a request keeps the request's case. Each refusal leaves nothing written.
  const before = () => sql(`select (select count(*) from money_payment) || ':' || (select count(*) from money_trust_request) || ':' || (select count(*) from audit_event)`), was = before();
  const rCase = await call(tR, "POST", "/requests", { ...reqBody, amountMinor: 1000, caseId: CASE }), mid = before();
  const caseBad = [await dep({ method: "WIRE", amountMinor: 100, caseId: "00000000-0000-4000-8000-00000000dead", idempotencyKey: "fo7t-case-madeup" }),
    await dep({ method: "WIRE", amountMinor: 100, caseId: CASE_B, idempotencyKey: "fo7t-case-firmb" }),
    await dep({ method: "WIRE", amountMinor: 100, caseId: CASE_C, idempotencyKey: "fo7t-case-other-client" }),
    await dep({ method: "WIRE", amountMinor: 100, caseId: CASE2, trustRequestId: rCase.body.id, idempotencyKey: "fo7t-case-not-request" }),
    await call(tR, "POST", "/requests", { ...reqBody, caseId: "00000000-0000-4000-8000-00000000dead" })];
  // A case the caller cannot see: user-R's roles (Owner, Case Manager) with their own cases only (CASE has no file owner
  // and no team) for this one call, then put back.
  sql(`delete from platform_role_permission where role in ('OWNER', 'CASE_MANAGER') and permission_key = 'agent/case:view.all'`);
  const unseen = await dep({ method: "WIRE", amountMinor: 100, caseId: CASE, idempotencyKey: "fo7t-case-unseen" });
  sql(`insert into platform_role_permission (role, permission_key) values ('OWNER', 'agent/case:view.all'), ('CASE_MANAGER', 'agent/case:view.all')`);
  ok("FO-7t DW6 fail (build round 1, M1): a made-up case, another firm's case, another client's case, a case other than the request's, a request on a made-up case, a case the caller cannot see → 404 or a field error; nothing written",
    rCase.status === 201 && [...caseBad, unseen].every((r) => r.status === 404 || fieldError(r.status)) && before() === mid && mid !== was, [rCase.body, ...[...caseBad, unseen].map((r) => [r.status, r.body?.code])]);
  // Lead B's money read: with no case, a request or deposit needs a party the writer sees (MoneyVisibilityPort), else 404.
  // user-R (Owner + Case Manager, agent/payment:record) sees PA through its own prospect; with both roles' prospect view
  // keys taken for these two calls (then put back), it sees no party.
  const seenReq = await call(tR, "POST", "/requests", { ...reqBody, amountMinor: 700 }), seenDep = await dep({ method: "WIRE", amountMinor: 700, idempotencyKey: "fo7t-party-seen" }), was2 = before();
  sql(`delete from platform_role_permission where role in ('OWNER', 'CASE_MANAGER') and permission_key in ('agent/prospect:view.all', 'agent/prospect:view.own')`);
  const unseenParty = [await call(tR, "POST", "/requests", { ...reqBody, amountMinor: 700 }), await dep({ method: "WIRE", amountMinor: 700, idempotencyKey: "fo7t-party-unseen" })];
  sql(`insert into platform_role_permission (role, permission_key) values ('OWNER', 'agent/prospect:view.all'), ('OWNER', 'agent/prospect:view.own'), ('CASE_MANAGER', 'agent/prospect:view.all'), ('CASE_MANAGER', 'agent/prospect:view.own')`);
  ok("FO-7t DW3/DW4 pass (Lead B's money read): a writer who sees the party (no case) → request 201 and deposit 201", seenReq.status === 201 && seenDep.status === 201, [seenReq.body, seenDep.body]);
  ok("FO-7t DW3/DW4 fail (Lead B's money read): the same writer holding agent/payment:record but seeing no party → request 404 and deposit 404, nothing written",
    unseenParty.every((r) => r.status === 404) && before() === was2, unseenParty.map((r) => r.body));
  const bal = await call(tR, "GET", `/balances?personId=${PA}`);
  const dbBal = (cur: string) => Number(sql(`select coalesce(sum(amount_minor), 0) from money_trust_entry where person_id = '${PA}' and currency = '${cur}'`));
  const sumOf = (cur: string) => (bal.body.balances ?? []).filter((x: { currency: string }) => x.currency === cur).reduce((s: number, x: { amountMinor: number }) => s + x.amountMinor, 0);
  const total = (cur: string) => (bal.body.totals ?? []).find((x: { currency: string }) => x.currency === cur)?.amountMinor;
  ok("FO-7t DW6 pass: per party and currency the entries sum to the balance; the per-case balances plus the before-a-case balance equal the party's",
    bal.status === 200 && total("CAD") === dbBal("CAD") && sumOf("CAD") === dbBal("CAD") && total("USD") === 12345 && sumOf("USD") === 12345
    && (bal.body.balances ?? []).some((x: { caseId: string | null; amountMinor: number }) => x.caseId === CASE && x.amountMinor === 30000)
    && (bal.body.balances ?? []).some((x: { caseId: string | null; currency: string; amountMinor: number }) => x.caseId === null && x.currency === "CAD" && x.amountMinor === dbBal("CAD") - 30000), bal.body);
  ok("FO-7t DW6 fail: CAD and USD are never summed: two totals, and none equal to CAD + USD",
    !(bal.body.totals ?? []).some((x: { amountMinor: number }) => x.amountMinor === dbBal("CAD") + 12345) && (bal.body.totals ?? []).length === 2, bal.body.totals);
  const [page, big, max, small] = await Promise.all([call(tR, "GET", `/ledger?personId=${PA}&currency=CAD`), call(tR, "GET", `/ledger?personId=${PA}&pageSize=500`), call(tR, "GET", `/ledger?personId=${PA}&pageSize=200`), call(tR, "GET", `/ledger?personId=${PA}&pageSize=2`)]);
  const items = page.body.items ?? [];
  ok("FO-7t DW6 pass: the ledger is newest first with date, entry, reference, payer, amount and running balance; no page size → 50; 200 → 200; 2 → 2",
    page.status === 200 && page.body.pageSize === 50 && items.length > 0 && items[0].balanceAfterMinor === dbBal("CAD") && ["at", "kind", "reference", "payer", "amountMinor", "balanceAfterMinor"].every((k) => k in items[0])
    && items.every((x: { at: string }, i: number) => i === 0 || items[i - 1].at >= x.at) && max.status === 200 && max.body.pageSize === 200 && small.body.items?.length === 2, page.body);
  ok("FO-7t DW6 fail: page size 500 → a field error (422; maximum 200)", fieldError(big.status), big.body);

  // ------------------------------------------------------------------------- DW3 again: the request's derived status
  const r3 = await call(tR, "POST", "/requests", { ...reqBody, amountMinor: 10000 });
  await dep({ method: "E_TRANSFER", amountMinor: 5000, trustRequestId: r3.body.id, reference: "ET-r3a", idempotencyKey: "fo7t-r3a" }); const part = await call(tR, "GET", `/requests/${r3.body.id}`);
  await dep({ method: "E_TRANSFER", amountMinor: 7000, trustRequestId: r3.body.id, reference: "ET-r3b", idempotencyKey: "fo7t-r3b" }); const paid = await call(tR, "GET", `/requests/${r3.body.id}`);
  const [g1, g2] = await Promise.all([call(tR, "GET", `/requests/${r1.body.id}`), call(tR, "GET", `/requests/${r2.body.id}`)]);
  ok("FO-7t DW3 pass (AG-6-61 rule 8): status from facts: CAD 50 of 100 → Part paid; 120 of 100 → Paid with \"CAD 20.00 more than requested\"; r1 Paid; r2 Cancelled",
    part.status === 200 && part.body.status === "Part paid" && paid.body.status === "Paid" && /CAD 20\.00 more than requested/.test(paid.body.extraNote ?? "") && g1.body.status === "Paid" && g2.body.status === "Cancelled", [part.body, paid.body, g1.body.status, g2.body.status]);
  const onCancelled = Number(sql(`select count(*) from audit_event`)), dc = await dep({ method: "E_TRANSFER", amountMinor: 100, trustRequestId: r2.body.id, idempotencyKey: "fo7t-cancelled" });
  ok("FO-7t DW3 fail: a deposit against a cancelled request is refused (409), and the refusal leaves no row and no audit line (one transaction)",
    dc.status === 409 && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-cancelled'`) === "0" && Number(sql(`select count(*) from audit_event`)) === onCancelled, dc.body);

  // --------------------------------------------------------------------------------- DW2 again: Yes → No while held
  const no = await call(tR, "PUT", "/answer", { answer: "NO" });
  const held = (no.body.held ?? []).find((h: { currency: string }) => h.currency === "CAD");
  ok("FO-7t DW2 pass (AG-6-59 rule 6): Yes → No with money held → 200 (never 409), the answer changed, the held amount per currency and its cases answered",
    no.status === 200 && no.body.answer === "NO" && answerOf(A) === "NO" && held?.amountMinor === Number(sql(`select coalesce(sum(amount_minor), 0) from money_trust_entry where firm_id = '${A}' and currency = 'CAD'`)) && Number.isInteger(held?.cases)
    && (no.body.held ?? []).some((h: { currency: string }) => h.currency === "USD") && (no.body.message ?? "").includes(`CAD ${money(held?.amountMinor ?? 0)} is held`), no.body);
  const heldReads = await Promise.all([call(tR, "GET", `/ledger?personId=${PA}`), call(tR, "GET", `/balances?personId=${PA}`)]);
  const heldNew = await Promise.all([call(tR, "POST", "/requests", reqBody), dep({ method: "E_TRANSFER", amountMinor: 100, idempotencyKey: "fo7t-off-held" })]);
  ok("FO-7t DW1 pass: trust off with money held: the ledger and balances answer; a new request or deposit is refused, nothing written",
    heldReads.every((r) => r.status === 200) && heldNew.every((r) => r.status >= 400 && r.status < 500) && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-off-held'`) === "0", heldNew.map((r) => r.body));
  await call(tR, "PUT", "/answer", { answer: "YES" });
  ok("FO-7t DW2 pass: each change of firm A's answer is one audit line (UNANSWERED→YES, YES→NO, NO→YES)", sql(`select count(*) from audit_event where action = 'trust.answered' and firm_id = '${A}'`) === "3");

  // ------------------------------------------------------------------------------------ DW10: walls, C5 and audit
  // Firm B has trust YES (above), so a 404 here is the wall, not trust off.
  const wallStrict = await Promise.all([call(tS, "GET", `/requests/${r1.body.id}`), call(tS, "POST", `/requests/${r1.body.id}/cancel`, { reason: "x" }),
    call(tS, "POST", "/deposits", { personId: PA, method: "WIRE", amountMinor: 100, currency: "CAD", idempotencyKey: "fo7t-wall" }), call(tS, "POST", "/requests", { ...reqBody })]);
  const wallReads = await Promise.all([call(tS, "GET", `/ledger?personId=${PA}`), call(tS, "GET", `/balances?personId=${PA}`)]);
  ok("FO-7t DW10 pass: firm B (trust YES) asking for firm A's request, its cancel, or writing on firm A's client → 404; nothing written, r1 still not cancelled",
    wallStrict.every((r) => r.status === 404) && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-wall'`) === "0" && sql(`select count(*) from money_trust_request where firm_id = '${B}'`) === "0"
    && sql(`select cancelled_at is null from money_trust_request where id = '${r1.body.id}'`) === "t", wallStrict.map((r) => [r.status, r.body]));
  ok("FO-7t DW10 fail: firm B reading firm A's client's ledger or balances gets 404 or an empty answer, never a figure",
    wallReads.every((r) => r.status === 404 || (r.status === 200 && (r.body.items ?? r.body.balances ?? []).length === 0 && !(r.body.totals ?? []).length)), wallReads.map((r) => r.body));
  const officer = await call(tO, "GET", `/ledger?personId=${PA}`), ownerRead = await call(tR, "GET", `/ledger?personId=${PA}`);
  ok("FO-7t DW10 pass (C5 through MoneyVisibilityPort): a Case Officer who sees neither PA's case nor PA gets an empty ledger page; the Owner, who sees both, gets the entries",
    officer.status === 200 && (officer.body.items ?? []).length === 0 && ownerRead.status === 200 && (ownerRead.body.items ?? []).length > 0, [officer.body, ownerRead.status]);
  // Lead 10 (23 Nov) ruling 3: the visibility rule covers the balances and the request read too.
  const [offBal, ownBal, offReq, ownReq] = await Promise.all([call(tO, "GET", `/balances?personId=${PA}`), call(tR, "GET", `/balances?personId=${PA}`), call(tO, "GET", `/requests/${r1.body.id}`), call(tR, "GET", `/requests/${r1.body.id}`)]);
  ok("FO-7t DW10 fail (C5, balances; Lead 10 ruling 3): a Case Officer who sees neither PA nor PA's case gets no balances and no totals",
    offBal.status === 200 && (offBal.body.balances ?? [1]).length === 0 && (offBal.body.totals ?? [1]).length === 0, offBal.body);
  ok("FO-7t DW10 pass (C5, balances): the Owner, who sees both, gets PA's figures", ownBal.status === 200 && (ownBal.body.totals ?? []).find((x: { currency: string }) => x.currency === "CAD")?.amountMinor === dbBal("CAD"), ownBal.body);
  ok("FO-7t DW10 fail (C5, request read; Lead 10 ruling 3): that Case Officer reading r1 (PA's, no case) → 404", offReq.status === 404, offReq.body);
  ok("FO-7t DW10 pass (C5, request read): the Owner reads r1", ownReq.status === 200 && ownReq.body.number === r1.body.number, ownReq.body);
  // Build round 1, M2: a Case Officer on CASE's team sees CASE's entries only, and their running balance is CASE's own
  // money (summed over what they see), never the party's whole balance (which includes money outside their view).
  sql(`insert into case_team_member (id, workspace_id, case_id, user_id, role, assigned_by) values (gen_random_uuid(), '${W}', '${CASE}', 'user-O', 'OFFICER', 'user-R')`);
  const caseSum = Number(sql(`select sum(amount_minor) from money_trust_entry where case_id = '${CASE}' and currency = 'CAD'`));
  const [onTeam, onTeamBal] = await Promise.all([call(tO, "GET", `/ledger?personId=${PA}`), call(tO, "GET", `/balances?personId=${PA}`)]);
  const ti = onTeam.body.items ?? [];
  ok("FO-7t DW10 pass (C5, any role; build round 1, M2): a Case Officer on the case's team gets the case's entries only, the newest running balance the case's own (as /balances says), never the party's",
    onTeam.status === 200 && ti.length > 0 && ti.every((x: { caseId: string }) => x.caseId === CASE) && ti[0].balanceAfterMinor === caseSum && caseSum !== dbBal("CAD")
    && (onTeamBal.body.balances ?? []).every((x: { caseId: string }) => x.caseId === CASE) && (onTeamBal.body.totals ?? []).find((x: { currency: string }) => x.currency === "CAD")?.amountMinor === caseSum, [ti, onTeamBal.body, caseSum]);
  ok("FO-7t DW10 pass: one audit line per change, by staff: each trust deposit, each request (held or sent), each cancel",
    audits("trust.deposited") === Number(sql(`select count(*) from money_payment where received_into = 'TRUST'`)) && audits("trust.request_created") === Number(sql(`select count(*) from money_trust_request`))
    && audits("trust.request_cancelled") === Number(sql(`select count(*) from money_trust_request where cancelled_at is not null`))
    && sql(`select count(*) from audit_event where action like 'trust.%' and actor not like 'staff:%'`) === "0");

  // ------------------------------------------------------------------------------------------- DW18: the events
  const EVENT = TRUST_EVENT as Record<string, string>;
  ok("FO-7t DW18 pass: the event name comes from TRUST_EVENT.* in ports/events/client-money-trust.ts (trust.deposited, contracts §8)", EVENT.TRUST_DEPOSITED === "trust.deposited");
  const evs = sql(`select coalesce(string_agg(payload::text, '|'), '') from module_event where type = 'trust.deposited' and subject_id = '${d1.body.paymentId}'`);
  ok("FO-7t DW18 pass: one trust.deposited per deposit (a replay adds none), payload ids, amount and currency only",
    sql(`select count(*) from module_event where type = 'trust.deposited'`) === sql(`select count(*) from money_payment where received_into = 'TRUST'`) && evs.split("|").length === 1
    && Object.keys(JSON.parse(evs || "{}")).length > 0 && Object.keys(JSON.parse(evs || "{}")).every((k) => /Id$|^amountMinor$|^currency$/.test(k)), evs);
  ok("FO-7t DW18 fail: no trust event payload carries a name, an email, a reference or a purpose (AG-6-33 §10)",
    sql(`select count(*) from module_event where type like 'trust.%' and payload::text ~* '(given|family|email|reference|purpose|fo7t\\.)'`) === "0");

  // ------------------------------------------------------------------- build round 1: the ledger's order (break Major 1)
  // A writer that starts first and takes PA's lock last (its entry's created_at is older, its seq newer): the newest row is
  // the one with the highest seq, carrying the party's balance. The slow writer is a trust refund written by hand (Sample).
  const late = await owner.$transaction(async (tx) => {
    await tx.$queryRaw`select now()`;   // the transaction's start: the slow writer's created_at
    const r = await dep({ method: "WIRE", amountMinor: 500, idempotencyKey: "fo7t-order-late" });   // starts later, commits first
    await tx.$executeRawUnsafe(`insert into money_trust_entry (firm_id, person_id, kind, amount_minor, currency, reason, refund_method, refunded_on, created_by)
      values ('${A}', '${PA}', 'REFUND_TO_CLIENT', -200, 'CAD', 'Sample refund (order probe)', 'E_TRANSFER', current_date, 'seed:FO-7t-1')`);
    return r;
  }, { timeout: 20000 });
  const newest = await call(tR, "GET", `/ledger?personId=${PA}&currency=CAD&pageSize=1`);
  ok("FO-7t DW6 pass (build round 1, break Major 1): the newest ledger row is the last in the lock's order (seq), with the party's balance, though its transaction started first",
    late.status === 201 && newest.body.items?.[0]?.kind === "REFUND_TO_CLIENT" && newest.body.items[0].balanceAfterMinor === dbBal("CAD")
    && sql(`select (select created_at from money_trust_entry where kind = 'REFUND_TO_CLIENT') < (select e.created_at from money_trust_entry e join money_payment p on p.id = e.payment_id where p.idempotency_key = 'fo7t-order-late')`) === "t", [newest.body, late.body]);
} catch (e) {
  ok("FO-7t: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
// PF-0c DW1 (fast: check-port-contracts.mjs): TrustDocuments is a real DocumentRenderPort adapter, so it runs the port's
// contract here, read back with FO-7b's text-page reader. Pure: no database.
const receipt = { firmName: "Sample Firm", number: "R-000001", issuedOn: "2026-11-23", party: "Client A", currency: "CAD", amount: "600.00", method: "e-Transfer", receivedOn: "2026-11-23", reference: "", request: "", cleared: "" };
const pdfText = (bytes: Uint8Array) => [...Buffer.from(bytes).toString("latin1").matchAll(/^\((.*)\) Tj T\*$/gm)].map((m) => m[1]).join("\n");
await runContract(documentRenderPortContract, "TrustDocuments", () => ({ render: new TrustDocuments(), template: "client_money.trust_receipt", data: receipt, reordered: Object.fromEntries(Object.entries(receipt).reverse()), other: { ...receipt, amount: "600.01" }, text: pdfText }), ok);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
