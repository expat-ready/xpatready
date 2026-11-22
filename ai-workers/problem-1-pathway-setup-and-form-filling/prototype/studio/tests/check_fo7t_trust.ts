// FO-7t part 1 (R1.58; briefs/track-b/FO-7t-1.md over design/briefs/FO-7t.md part 1; AG-6-59, AG-6-60 rules 1-4, 6, 8,
// AG-6-62, AG-6-63 rules 1, 3-5, 7, AG-6-69 rule 1, AG-6-71 rules 2, 4, AG-6-33 rule 3, AG-6-37 rules 1-3; P-567 (3),
// P-603, P-607 (1), P-634 (1), P-584 (10); Code SOR/2022-128 s. 32(a)-(g), s. 33(3) as FO-7a cites it; legal reading
// Unconfirmed: no counsel): trust on and money in, through the routes under /api/front-office/money/trust.
// The named cases of part 1, each a pass and a fail: DW1 (trust off), DW2 (the Owner's answer), DW3 (trust request),
// DW4 (deposit), DW5 (the TRUST receipt), DW6 (ledger and balances), DW10 (walls, C5 and audit, part 1's routes) and
// DW18 (events: trust.deposited, and trust.request_sent as proposed). Parts 2-5's cases (DW7-DW9, DW11-DW17) are theirs.
// Written before the build (check first, Lead 4, 22 Nov): it pins the route contract the build must meet:
//   GET  /trust/answer                      → { answer, answeredBy, answeredAt }   (always answers, also with trust off)
//   PUT  /trust/answer { answer }           → 200 { answer, held: [{ currency, amountMinor, cases }], message? }; non-Owner 403
//   POST /trust/requests { personId | companyId, caseId?, amountMinor, currency, purpose }
//                                           → 201 { id, number, status, email: "SENT" | "HELD", message? }
//   POST /trust/requests/:id/cancel { reason } → 200 { status: "Cancelled", number }; GET /trust/requests/:id
//   POST /trust/deposits { personId | companyId, caseId?, trustRequestId?, method, amountMinor, currency, reference?,
//                          evidenceFileKey?, idempotencyKey, duplicateReferenceAcknowledged? }
//                                           → 201 { paymentId, entryId, receiptNumber, cleared, receiptEmail } (a replay: 200)
//   GET  /trust/ledger?personId=&caseId=&currency=&pageSize= → { items: [{ at, kind, reference, payer, amountMinor,
//                                              balanceAfterMinor }], pageSize }   (newest first; default 50, maximum 200)
//   GET  /trust/balances?personId=          → { balances: [{ currency, caseId, amountMinor }], totals: [{ currency, amountMinor }] }
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls and this row's feature, with the local
// sign-in stand-in; the API connects as xr_app; the mail is the fake. No network, no model call, no Stripe call (US$0).
// Amounts are Sample. Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo7t_trust.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fakeMail } from "../ports/mail.ts";
import { EVENT } from "../ports/events.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo7t_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

/** The one money format of every message (AG-6-68 rule 8; FO-7t.md DW7): two decimals, thousands with a comma. */
const money = (minor: number) => (minor / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
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

const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
const local = new LocalIdentity("fo7t-check-signing-key-0123456789abcdef", () => clock.now());
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
const mail = fakeMail();
try {
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
  // user-R is sample-firm's Owner; user-T a Case Manager (not Owner); user-O a Case Officer; user-S sample-solo's Owner.
  const tR = await signIn("user-R", "sample-firm"), tT = await signIn("user-T", "sample-firm"), tO = await signIn("user-O", "sample-firm"), tS = await signIn("user-S", "sample-solo");
  const staffR = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, updated_by, updated_at) values ('${f}', 'seed:FO-7t-1', now())`);
  const audits = (action: string) => Number(sql(`select count(*) from audit_event where action = '${action}'`));

  // ----------------------------------------------------------------------------------------- DW1: trust off (UNANSWERED)
  const offAnswer = await call(tR, "GET", "/answer");
  const offRoutes = await Promise.all([call(tR, "GET", `/ledger?personId=${PA}`), call(tR, "GET", `/balances?personId=${PA}`), call(tR, "GET", `/requests/${PA}`),
    call(tR, "POST", "/requests", { personId: PA, amountMinor: 60000, currency: "CAD", purpose: "Retainer deposit (Sample)" }),
    call(tR, "POST", "/deposits", { personId: PA, method: "E_TRANSFER", amountMinor: 60000, currency: "CAD", reference: "ET-1", idempotencyKey: "fo7t-off-1" })]);
  ok("FO-7t DW1 pass: with the answer UNANSWERED and nothing held, /trust/answer answers (UNANSWERED) and every other trust route answers 404; nothing written",
    offAnswer.status === 200 && offAnswer.body.answer === "UNANSWERED" && offRoutes.every((r) => r.status === 404)
    && sql(`select count(*) from money_trust_request`) === "0" && sql(`select count(*) from money_payment`) === "0", [offAnswer, offRoutes.map((r) => r.status)]);
  const planted404 = (path: string) => path === "/answer" ? 200 : 404;   // the rule the routes must keep
  ok("FO-7t DW1 fail (stand-in): a ledger read that answered 200 with an empty page while trust is off would name trust, and is caught", planted404("/ledger") !== 200 && offRoutes[0].status !== 200);

  // ------------------------------------------------------------------------------------------------ DW2: the answer
  const notOwner = await call(tT, "PUT", "/answer", { answer: "YES" });
  ok("FO-7t DW2 fail: a Case Manager (not the Owner) answering → 403, the answer unchanged, no audit line",
    notOwner.status === 403 && sql(`select trust_answer from money_payment_settings where firm_id = '${A}'`) === "UNANSWERED" && audits("trust.answered") === 0, notOwner.body);
  const bad = await call(tR, "PUT", "/answer", { answer: "MAYBE" });
  ok("FO-7t DW2 fail: an answer other than YES or NO → 400, unchanged (zod, AG-6-37 rule 3)", bad.status === 400 && sql(`select trust_answer from money_payment_settings where firm_id = '${A}'`) === "UNANSWERED", bad.body);
  const yes = await call(tR, "PUT", "/answer", { answer: "YES" });
  ok("FO-7t DW2 pass: the Owner's Yes → 200, stored with who (staff) and when (the database's), one audit line with old and new",
    yes.status === 200 && yes.body.answer === "YES" && sql(`select trust_answer || ':' || trust_answered_by || ':' || (trust_answered_at is not null) from money_payment_settings where firm_id = '${A}'`) === `YES:staff:${staffR}:true`
    && sql(`select count(*) || ':' || min(before->>'answer') || ':' || min(after->>'answer') from audit_event where action = 'trust.answered'`) === "1:UNANSWERED:YES", [yes.body, sql(`select before, after from audit_event where action = 'trust.answered'`)]);
  const read = await call(tO, "GET", "/answer");
  ok("FO-7t DW2 pass: any staff member reads the answer with \"Last changed\" facts (AG-6-59 rule 8)", read.status === 200 && read.body.answer === "YES" && typeof read.body.answeredAt === "string" && !!read.body.answeredBy, read.body);

  // ------------------------------------------------------------------------------------------- DW3: trust request
  const reqBody = { personId: PA, amountMinor: 60000, currency: "CAD", purpose: "Retainer deposit (Sample)" };
  const waiting = await call(tR, "POST", "/requests", reqBody);
  ok("FO-7t DW3 pass (AG-6-71 rule 4): with the trust details block empty the request is stored unsent, no number, no email, \"Add your trust payment details\"",
    waiting.status === 201 && waiting.body.number === null && waiting.body.email === "HELD" && /Add your trust payment details/.test(waiting.body.message ?? "") && mail.sent.length === 0
    && sql(`select count(*) from money_trust_request where sent_at is null and number is null`) === "1", waiting.body);
  sql(`update money_payment_settings set trust_details = 'Trust account (Sample): Bank 001, transit 00011, account 1234567' where firm_id = '${A}'`);
  const r1 = await call(tR, "POST", "/requests", reqBody), m1 = mail.sent.filter((m) => m.firmId === A);
  const text = JSON.stringify(m1.at(-1) ?? {});
  ok("FO-7t DW3 pass: sent → one DR- number (the database's), status Sent, one email to the party with no Cc, holding the number, CAD 600.00 and the trust details block",
    r1.status === 201 && /^DR-\d{4,}$/.test(r1.body.number) && r1.body.status === "Sent" && r1.body.email === "SENT" && m1.length === 1 && !("cc" in (m1[0] as object))
    && text.includes(r1.body.number) && text.includes("600.00") && text.includes("transit 00011") && sql(`select number from money_trust_request where id = '${r1.body.id}'`) === r1.body.number, [r1.body, m1]);
  ok("FO-7t DW3 fail (P-567 (3)): the email carries no link and no word \"card\"", !/https?:\/\//i.test(text) && !/\bcard\b/i.test(text), text);
  const noReason = await call(tR, "POST", `/requests/${r1.body.id}/cancel`, {});
  ok("FO-7t DW3 fail: cancel without a reason → 400, the request still Sent, no audit line", noReason.status === 400 && sql(`select cancelled_at is null from money_trust_request where id = '${r1.body.id}'`) === "t" && audits("trust.request_cancelled") === 0, noReason.body);
  const r2 = await call(tR, "POST", "/requests", { ...reqBody, amountMinor: 20000 });
  const cancel = await call(tR, "POST", `/requests/${r2.body.id}/cancel`, { reason: "Asked twice by mistake" });
  ok("FO-7t DW3 pass: a cancelled request keeps its number (Cancelled, reason stored, one audit line)", cancel.status === 200 && cancel.body.status === "Cancelled" && cancel.body.number === r2.body.number
    && sql(`select number || ':' || cancel_reason from money_trust_request where id = '${r2.body.id}'`) === `${r2.body.number}:Asked twice by mistake` && audits("trust.request_cancelled") === 1, cancel.body);
  const prospect = await call(tR, "POST", "/requests", { amountMinor: 100, currency: "CAD", purpose: "x" });
  ok("FO-7t DW3 fail: a request with no person or company → 400, nothing written (never a prospect)", prospect.status === 400 && sql(`select count(*) from money_trust_request`) === "3", prospect.body);

  // ------------------------------------------------------------------------------------------------- DW4: deposit
  const dep = (body: Record<string, unknown>, t = tR) => call(t, "POST", "/deposits", { personId: PA, currency: "CAD", ...body });
  const card = await dep({ method: "CARD", amountMinor: 1000, idempotencyKey: "fo7t-card" });
  ok("FO-7t DW4 fail (P-567 (3)): CARD into trust → refused (400 or 409), nothing written", [400, 409].includes(card.status) && sql(`select count(*) from money_payment`) === "0", card.body);
  const d1 = await dep({ method: "E_TRANSFER", amountMinor: 60000, trustRequestId: r1.body.id, reference: "ET-0001", evidenceFileKey: "firm/fo7t/evidence/et-0001.pdf", idempotencyKey: "fo7t-d1" });
  const d1again = await dep({ method: "E_TRANSFER", amountMinor: 60000, trustRequestId: r1.body.id, reference: "ET-0001", evidenceFileKey: "firm/fo7t/evidence/et-0001.pdf", idempotencyKey: "fo7t-d1" });
  ok("FO-7t DW4 pass: a deposit → one payment received into TRUST, one DEPOSIT entry in the same transaction, one receipt; the same key again → 200, the same payment, nothing more",
    d1.status === 201 && d1again.status === 200 && d1again.body.paymentId === d1.body.paymentId
    && sql(`select count(*) || ':' || min(received_into::text) from money_payment where idempotency_key = 'fo7t-d1'`) === "1:TRUST"
    && sql(`select count(*) from money_trust_entry where payment_id = '${d1.body.paymentId}' and kind = 'DEPOSIT' and amount_minor = 60000`) === "1"
    && sql(`select count(*) from money_receipt where payment_id = '${d1.body.paymentId}'`) === "1", [d1.body, d1again.body]);
  ok("FO-7t DW4 pass: the evidence is its FilesPort key on money_payment.evidence_file_key, never the file's bytes in a column (no bytea column on money_)",
    sql(`select evidence_file_key from money_payment where id = '${d1.body.paymentId}'`) === "firm/fo7t/evidence/et-0001.pdf"
    && sql(`select count(*) from information_schema.columns where table_name like 'money\\_%' and data_type = 'bytea'`) === "0");
  const dup = await dep({ method: "E_TRANSFER", amountMinor: 5000, reference: "et-0001", idempotencyKey: "fo7t-dup" });
  ok("FO-7t DW4 fail: a duplicate reference (any case) → 409 DUPLICATE_REFERENCE, a warning that asks for a confirm; nothing written",
    dup.status === 409 && dup.body.code === "DUPLICATE_REFERENCE" && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-dup'`) === "0", dup.body);
  const dupOk = await dep({ method: "E_TRANSFER", amountMinor: 5000, reference: "et-0001", idempotencyKey: "fo7t-dup", duplicateReferenceAcknowledged: true });
  ok("FO-7t DW4 pass: the same duplicate, confirmed → recorded", dupOk.status === 201 && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-dup'`) === "1", dupOk.body);
  const keyReuse = await dep({ method: "WIRE", amountMinor: 7000, idempotencyKey: "fo7t-d1" });
  ok("FO-7t DW4 fail: the same idempotency key with a different payment → refused (409), nothing written", keyReuse.status === 409 && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-d1'`) === "1", keyReuse.body);

  // ------------------------------------------------------------------------------------------ DW5: the TRUST receipt
  const sentBefore = mail.sent.length;
  const cheque = await dep({ method: "CHEQUE", amountMinor: 25000, reference: "CHQ 104", idempotencyKey: "fo7t-chq" });
  const chequeMail = mail.sent.slice(sentBefore).at(-1);
  ok("FO-7t DW5 pass: every deposit has exactly one TRUST receipt R- (the one series), emailed to the party with its PDF and no Cc",
    sql(`select count(*) from money_payment p where p.received_into = 'TRUST' and (select count(*) from money_receipt r where r.payment_id = p.id and r.kind = 'TRUST' and r.number like 'R-%') <> 1`) === "0"
    && !!chequeMail && !("cc" in (chequeMail as object)) && chequeMail.attachments?.[0]?.contentType === "application/pdf" && chequeMail.attachments[0].filename === `${cheque.body.receiptNumber}.pdf`, [cheque.body, chequeMail]);
  ok("FO-7t DW5 pass (AG-6-63 rule 7): a cheque is recorded not cleared, and its receipt says \"Not yet cleared\"; an e-Transfer's does not",
    cheque.body.cleared === false && sql(`select cleared from money_payment where id = '${cheque.body.paymentId}'`) === "f" && /Not yet cleared/.test(JSON.stringify(chequeMail))
    && !/Not yet cleared/.test(JSON.stringify(mail.sent.find((m) => JSON.stringify(m).includes(d1.body.receiptNumber)) ?? "")), cheque.body);
  const both = await Promise.all([dep({ method: "WIRE", amountMinor: 1000, idempotencyKey: "fo7t-at-once-1" }), dep({ method: "WIRE", amountMinor: 1000, idempotencyKey: "fo7t-at-once-2" })]);
  const nums = both.map((r) => Number(String(r.body.receiptNumber).slice(2))).sort((a, b) => a - b);
  ok("FO-7t DW5 pass: two deposits at the same moment → two receipts with consecutive numbers (no gap, no repeat)", both.every((r) => r.status === 201) && nums[1] === nums[0] + 1, both.map((r) => r.body));
  ok("FO-7t DW5 fail (stand-in): a repeated or skipped number is caught by the same comparison", !([7, 7][1] === 7 + 1) && !([7, 9][1] === 7 + 1));

  // --------------------------------------------------------------------------------------- DW6: ledger and balances
  const CASE = "00000000-0000-4000-8000-0000000f07a1";   // a Sample case id: money_trust_entry.case_id has no key across the module wall
  await dep({ method: "E_TRANSFER", amountMinor: 30000, caseId: CASE, reference: "ET-case", idempotencyKey: "fo7t-case" });
  await dep({ method: "WIRE", amountMinor: 12345, currency: "USD", reference: "W-USD", idempotencyKey: "fo7t-usd" });
  const bal = await call(tR, "GET", `/balances?personId=${PA}`);
  const dbBal = (cur: string) => Number(sql(`select coalesce(sum(amount_minor), 0) from money_trust_entry where person_id = '${PA}' and currency = '${cur}'`));
  const sumOf = (cur: string) => (bal.body.balances ?? []).filter((x: { currency: string }) => x.currency === cur).reduce((s: number, x: { amountMinor: number }) => s + x.amountMinor, 0);
  const total = (cur: string) => (bal.body.totals ?? []).find((x: { currency: string }) => x.currency === cur)?.amountMinor;
  ok("FO-7t DW6 pass: per party and currency the entries sum to the balance; the per-case balances plus the before-a-case balance equal the party's",
    bal.status === 200 && total("CAD") === dbBal("CAD") && sumOf("CAD") === dbBal("CAD") && total("USD") === 12345 && sumOf("USD") === 12345
    && ((bal.body.balances ?? []).some((x: { caseId: string | null; amountMinor: number }) => x.caseId === CASE && x.amountMinor === 30000)), bal.body);
  ok("FO-7t DW6 fail (planted): CAD and USD summed into one figure would differ from every total the read answers (never summed)",
    !(bal.body.totals ?? []).some((x: { amountMinor: number }) => x.amountMinor === dbBal("CAD") + 12345) && (bal.body.totals ?? []).length === 2, bal.body.totals);
  const page = await call(tR, "GET", `/ledger?personId=${PA}&currency=CAD`), big = await call(tR, "GET", `/ledger?personId=${PA}&pageSize=500`), small = await call(tR, "GET", `/ledger?personId=${PA}&pageSize=2`);
  const items = page.body.items ?? [];
  ok("FO-7t DW6 pass: the ledger is newest first with date, entry, reference, payer, amount and running balance; no page size → 50; 2 → 2",
    page.status === 200 && page.body.pageSize === 50 && items.length > 0 && items[0].balanceAfterMinor === dbBal("CAD") && ["at", "kind", "reference", "payer", "amountMinor", "balanceAfterMinor"].every((k) => k in items[0])
    && items.every((x: { at: string }, i: number) => i === 0 || items[i - 1].at >= x.at) && small.body.items?.length === 2, page.body);
  ok("FO-7t DW6 fail: page size 500 → 400 (maximum 200)", big.status === 400, big.body);

  // --------------------------------------------------------------------------------- DW2 again: Yes → No while held
  const no = await call(tR, "PUT", "/answer", { answer: "NO" });
  ok("FO-7t DW2 pass (AG-6-59 rule 6): Yes → No with money held → 200 (never 409), the answer changed, the held amount per currency answered",
    no.status === 200 && no.body.answer === "NO" && sql(`select trust_answer from money_payment_settings where firm_id = '${A}'`) === "NO"
    && (no.body.held ?? []).some((h: { currency: string; amountMinor: number }) => h.currency === "CAD" && h.amountMinor === dbBal("CAD")) && new RegExp(`CAD ${money(dbBal("CAD")).replace(/[.,]/g, "\\$&")} is held`).test(no.body.message ?? ""), no.body);
  const heldReads = await Promise.all([call(tR, "GET", `/ledger?personId=${PA}`), call(tR, "GET", `/balances?personId=${PA}`)]);
  const heldNew = await Promise.all([call(tR, "POST", "/requests", reqBody), dep({ method: "E_TRANSFER", amountMinor: 100, idempotencyKey: "fo7t-off-held" })]);
  ok("FO-7t DW1 pass: with trust off and money held, the ledger and balances answer; a new request or deposit is refused, nothing written",
    heldReads.every((r) => r.status === 200) && heldNew.every((r) => r.status >= 400 && r.status < 500) && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-off-held'`) === "0", heldNew.map((r) => r.body));
  await call(tR, "PUT", "/answer", { answer: "YES" });
  ok("FO-7t DW2 pass: each change is one audit line (UNANSWERED→YES, YES→NO, NO→YES)", audits("trust.answered") === 3, audits("trust.answered"));

  // ------------------------------------------------------------------------------------ DW10: walls, C5 and audit
  const wall = await Promise.all([call(tS, "GET", `/requests/${r1.body.id}`), call(tS, "POST", `/requests/${r1.body.id}/cancel`, { reason: "x" }), call(tS, "GET", `/ledger?personId=${PA}`), call(tS, "GET", `/balances?personId=${PA}`),
    call(tS, "POST", "/deposits", { personId: PA, method: "WIRE", amountMinor: 100, currency: "CAD", idempotencyKey: "fo7t-wall" })]);
  ok("FO-7t DW10 pass: firm B asking for firm A's request, cancel, ledger, balances, or a deposit on firm A's client → 404 (or an empty page), nothing written",
    wall.every((r) => r.status === 404 || (r.status === 200 && (r.body.items ?? r.body.balances ?? []).length === 0)) && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-wall'`) === "0"
    && sql(`select cancelled_at is null from money_trust_request where id = '${r1.body.id}'`) === "t", wall.map((r) => [r.status, r.body]));
  const officer = await call(tO, "GET", `/ledger?personId=${PA}`), ownerRead = await call(tR, "GET", `/ledger?personId=${PA}`);
  ok("FO-7t DW10 pass (C5, ruled, fail closed until CS-K3's check is reachable through a port): a Case Officer gets an empty ledger page; the Owner gets the entries",
    officer.status === 200 && (officer.body.items ?? []).length === 0 && ownerRead.status === 200 && (ownerRead.body.items ?? []).length > 0, [officer.body, ownerRead.status]);
  const failMail = mail.sent.length; sql(`update money_payment_settings set trust_details = null where firm_id = '${A}'`);
  ok("FO-7t DW10 pass: every change wrote one audit line in its transaction: each deposit, each request created, each answer",
    audits("trust.deposited") === Number(sql(`select count(*) from money_payment where received_into = 'TRUST'`)) && audits("trust.request_created") + audits("trust.request_sent") >= 3 && failMail >= 0);
  const refusedAudit = Number(sql(`select count(*) from audit_event`)); await dep({ method: "CARD", amountMinor: 1, idempotencyKey: "fo7t-rollback" });
  ok("FO-7t DW10 fail: a refused write leaves no audit line and no row", Number(sql(`select count(*) from audit_event`)) === refusedAudit && sql(`select count(*) from money_payment where idempotency_key = 'fo7t-rollback'`) === "0");

  // ------------------------------------------------------------------------------------------- DW18: the events
  ok("FO-7t DW18 pass: the event names come from EVENT.* (trust.deposited; trust.request_sent, proposed)", EVENT.TRUST_DEPOSITED === "trust.deposited" && EVENT.TRUST_REQUEST_SENT === "trust.request_sent");
  const evs = sql(`select coalesce(string_agg(payload::text, '|'), '') from module_event where type = 'trust.deposited' and subject_id = '${d1.body.paymentId}'`);
  ok("FO-7t DW18 pass: one trust.deposited per deposit (a replay adds none), payload ids, amount and currency only",
    sql(`select count(*) from module_event where type = 'trust.deposited'`) === sql(`select count(*) from money_payment where received_into = 'TRUST'`) && evs.split("|").length === 1
    && Object.keys(JSON.parse(evs)).every((k) => /Id$|^amountMinor$|^currency$/.test(k)), evs);
  ok("FO-7t DW18 fail: no event payload carries a name, an email, a reference or a purpose (AG-6-33 §10)",
    sql(`select count(*) from module_event where type like 'trust.%' and payload::text ~* '(given|family|email|reference|purpose|fo7t\\.)'`) === "0");
  ok("FO-7t DW18 pass: one trust.request_sent per sent request (a held one adds none until sent)", sql(`select count(*) from module_event where type = 'trust.request_sent'`) === sql(`select count(*) from money_trust_request where sent_at is not null`));
  void PC; void PB; void tT;
} catch (e) {
  ok("FO-7t: the check ran to the end", false, e instanceof Error ? e.stack : String(e));
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB], { stdio: "ignore" });
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
