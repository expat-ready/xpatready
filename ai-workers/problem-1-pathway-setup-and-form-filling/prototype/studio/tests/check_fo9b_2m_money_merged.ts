// FO-9b part 2m (R1.29; BACKLOG "FO-9b part 2m", AG-2-16 r5, P-574 (2)): no money is ever written on a merged-away
// person or company. Each client-money writer that names a party checks, under the party's lock it already takes
// (FO-7lk's order) and holding the party row FOR KEY SHARE (api/src/client-money/live-party.ts), that the party is
// live; merged away → 409 PARTY_MERGED, nothing written, naming the survivor's id only when the caller sees it.
// Writers, one fail line each: draft create, issue, record payment, credit note, refund, the extra's choice, trust
// request, trust deposit, pay from trust, trust refund (the payer, and a payee on file), reversal. Then: a live party
// unchanged; Undo of the merge (the tombstone cleared) makes the party payable again; another firm's id 404; a merged
// company 409; and planted two-session races: a merge holding the person's row (FOR UPDATE, as duplicates/merge/
// service.ts takes it) while a deposit, a draft create, a refund and a payee refund wait → each answers 409 once the
// merge commits and writes nothing (red before this part: the writer did not wait and wrote on the merged-away record).
// Last, the other way round: a money write holding the row makes the merge's NOWAIT lock fail (55P03, busy), so a
// merge can never pass its HAS_MONEY read while a money write is still open.
// A scratch database (every migration), a Nest app of PF-4's guard, PF-12's walls, FO-7b's invoices and refunds, FO-7t's
// trust and FO-7v's reversals, with the local sign-in stand-in; the mail is the fake. No network, no model call, no
// Stripe call (US$0). Amounts are Sample. Dropped at the end.
//   tsx --tsconfig studio/api/tsconfig.json studio/tests/check_fo9b_2m_money_merged.ts
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, NestFactory } from "@nestjs/core";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { fakeMail } from "../ports/mail.ts";

const STUDIO = join(import.meta.dirname, ".."), MIG = join(STUDIO, "prisma", "migrations");
const BIN = "/opt/homebrew/opt/postgresql@18/bin", PG = ["-h", "127.0.0.1", "-p", "54329", "-U", "xr_studio"];
const DB = `xr_studio_fo9b2m_scratch_${process.pid}`, urlOf = (db: string) => `postgresql://xr_studio@127.0.0.1:54329/${db}`;
const sql = (q: string) => execFileSync(join(BIN, "psql"), [urlOf(DB), "-v", "ON_ERROR_STOP=1", "-q", "-Atc", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name: string, c: unknown, detail?: unknown) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${name}${!c && detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`); };

execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", DB]); execFileSync(join(BIN, "createdb"), [...PG, DB]);
const owner = new PrismaClient({ adapter: new PrismaPg({ connectionString: urlOf(DB), options: "-c TimeZone=UTC" }) });
type Res = { status: number; body: any };   // eslint-disable-line @typescript-eslint/no-explicit-any -- API answers are read loosely, as in the other checks
let app: { close(): Promise<void> } | null = null;
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
  const { liveParty } = await import("../api/src/client-money/live-party.ts");
  const { mergeRecords, MergeBusy } = await import("../api/src/front-office/duplicates/merge/service.ts");
  const { MERGE_KEY } = await import("../ports/person-merge.ts");
  const { auditEvent } = await import("../api/src/platform/audit/audit-event.ts");
  const { ConsentStore } = await import("../api/src/platform/messages/consent/consent-store.ts");
  const features = await Promise.all(["client-money-trust", "client-money-invoices", "client-money-refunds", "client-money-reversals", "client-money-write-offs"].map(async (n) => (await import(`../api/src/features/${n}.ts`)).default));
  const clock = new (class extends PlatformClock { override now() { return Date.now(); } })();
  const local = new LocalIdentity("fo9b2m-check-signing-key-0123456789abcdef", () => clock.now());
  const providers = [Db, { provide: APP_GUARD, useClass: ConfigReadGuard }, { provide: PlatformClock, useValue: clock }, { provide: IDENTITY_PORT, useValue: local }, PlatformIdentity, PlatformGuard,
    { provide: APP_GUARD, useExisting: PlatformGuard }, { provide: APP_INTERCEPTOR, useClass: FirmWallsInterceptor }, { provide: MAIL_PORT, useValue: fakeMail() }, ...features.flatMap((f) => f.providers)];
  @Module({ controllers: [PlatformIdentityController, ...features.flatMap((f) => f.controllers)] as never[], providers: providers as never[] }) class TestApp {}
  const nest = await NestFactory.create(TestApp, { logger: false }); await nest.listen(0, "127.0.0.1"); app = nest;
  const base = `http://127.0.0.1:${(nest.getHttpServer().address() as { port: number }).port}/api/front-office/money`;
  const raw = async (token: string | null, method: string, path: string, body?: unknown): Promise<Res> => {
    const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let b: unknown = t; try { b = JSON.parse(t); } catch { /* text */ } return { status: r.status, body: b };
  };
  const signIn = async (actorId: string, firmKey: string) => {
    const r = await fetch(`${base.replace("/front-office/money", "")}/platform/session/local`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ firmKey, actorId, secondStep: true }) });
    const b = await r.json() as { token?: string }; if (!b.token) throw new Error(JSON.stringify(b)); return b.token;
  };

  await seedSampleFirms(owner); await seedSampleFirmsFrontOffice(owner);
  const A = sql(`select id from platform_firm where key = 'sample-firm'`), B = sql(`select id from platform_firm where key = 'sample-solo'`);
  const person = (firm: string, n: string) => sql(`insert into fo_person (id, firm_id, given_names, family_name, email, created_by, updated_at) values (gen_random_uuid(), '${firm}', 'Client ${n}', 'Sample', 'fo9b2m.${n}@example.org', 'seed:FO-9b-2m', now()) returning id`);
  const PA = person(A, "a"), PM = person(A, "m"), PB = person(B, "b");
  const R = { dep: person(A, "r1"), draft: person(A, "r2"), refund: person(A, "r3"), payee: person(A, "r4"), busy: person(A, "r5") };
  const CO = sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Company m (Sample)', 'company m sample', 'seed:FO-9b-2m', now()) returning id`);
  const CS = sql(`insert into fo_company (id, firm_id, operating_name, normalised_name, created_by, updated_at) values (gen_random_uuid(), '${A}', 'Company s (Sample)', 'company s sample', 'seed:FO-9b-2m', now()) returning id`);
  // The Owner sees a client through its prospect (C5's party half, visibility-adapter.ts).
  const staffR = sql(`select id from platform_staff where actor_id = 'user-R' and firm_id = '${A}'`);
  let pn = 9200;
  const prospect = (kind: "person" | "company", id: string) => sql(`set session_replication_role = replica; insert into fo_prospect (id, firm_id, number, lead_id, type, stage_id, subject_person_id, subject_company_id, primary_contact_person_id, owner_staff_id, created_by, updated_at)
    values (gen_random_uuid(), '${A}', 'P-0${++pn}', gen_random_uuid(), '${kind === "person" ? "INDIVIDUAL" : "CORPORATE"}', gen_random_uuid(), ${kind === "person" ? `'${id}'` : "null"}, ${kind === "company" ? `'${id}'` : "null"}, ${kind === "person" ? `'${id}'` : `'${PA}'`}, '${staffR}', 'seed:FO-9b-2m', now())`);
  for (const id of [PA, PM, ...Object.values(R)]) prospect("person", id);
  for (const id of [CO, CS]) prospect("company", id);
  for (const f of [A, B]) sql(`insert into money_payment_settings (firm_id, trust_details, updated_by, updated_at) values ('${f}', 'Trust account (Sample)', 'seed:FO-9b-2m', now())`);
  // user-R: sample-firm's Owner (every money key, sees every client: the survivor's id is named to it).
  // user-O: a Case Officer given agent/payment:record here but seeing no case and no client (C5 fails closed).
  sql(`delete from platform_role_permission where role = 'CASE_OFFICER' and permission_key in ('agent/case:view.all', 'agent/prospect:view.all');
    insert into platform_role_permission (role, permission_key) values ('CASE_OFFICER', 'agent/payment:record') on conflict do nothing`);
  const tR = await signIn("user-R", "sample-firm"), tS = await signIn("user-S", "sample-solo"), tO = await signIn("user-O", "sample-firm");
  await raw(tR, "PUT", "/trust/answer", { answer: "YES" }); await raw(tS, "PUT", "/trust/answer", { answer: "YES" });

  // The tombstone a merge writes (duplicates/merge/service.ts: merged_into_id, merged_at), planted; Undo clears it.
  const tomb = (kind: "person" | "company", id: string, into: string | null) => sql(`set session_replication_role = replica; update fo_${kind} set merged_into_id = ${into ? `'${into}'` : "null"}, merged_at = ${into ? "now()" : "null"} where id = '${id}'`);
  const writes = () => sql(`select (select count(*) from money_invoice) || '/' || (select count(*) from money_invoice_line) || '/' || (select count(*) from money_payment) || '/' || (select count(*) from money_trust_entry) || '/' || (select count(*) from money_trust_request)
    || '/' || (select count(*) from money_credit_note) || '/' || (select count(*) from money_refund) || '/' || (select count(*) from money_credit_entry) || '/' || (select count(*) from audit_event where action like 'invoice.%' or action like 'trust_money.%' or action like 'payment.%' or action like 'refund.%')
    || '/' || (select count(*) from money_invoice where issued_at is not null) || '/' || (select count(*) from money_write_off)`);
  let k = 0; const key = (w: string) => `fo9b2m-${w}-${++k}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const draft = async (party: Record<string, string>) => { const d = await raw(tR, "POST", "/invoices", { ...party, currency: "CAD" }); if (d.status !== 201) throw new Error(`draft: ${JSON.stringify(d.body)}`); return d.body.id as string; };
  const line = async (id: string, unitMinor: number) => { const l = await raw(tR, "POST", `/invoices/${id}/lines`, { kind: "FEE", description: "Professional fee (Sample)", unitMinor, ratePpm: 0 }); if (l.status >= 300) throw new Error(`line: ${JSON.stringify(l.body)}`); };
  const issued = async (party: Record<string, string>, unitMinor: number) => { const id = await draft(party); await line(id, unitMinor); const i = await raw(tR, "POST", `/invoices/${id}/issue`); if (i.status !== 200) throw new Error(`issue: ${JSON.stringify(i.body)}`); return id; };
  const pay = (inv: string, amountMinor: number) => raw(tR, "POST", `/invoices/${inv}/payments`, { method: "BANK_TRANSFER", amountMinor, receivedOn: today(), reference: `REF-${++k}`, idempotencyKey: key("pay") });
  const deposit = (party: Record<string, string>, amountMinor: number) => raw(tR, "POST", "/trust/deposits", { ...party, method: "BANK_TRANSFER", amountMinor, currency: "CAD", reference: `DEP-${++k}`, idempotencyKey: key("dep") });
  const trustRefund = (party: Record<string, string>, amountMinor: number, payee?: Record<string, string>) => raw(tR, "POST", "/trust/refunds",
    { ...party, currency: "CAD", amountMinor, reason: "Client asked (Sample)", reference: `TR-${++k}`, method: "BANK_TRANSFER", ...(payee ? { payee: { ...payee, reason: "Paid to the client's spouse (Sample)" } } : {}) });
  const refund = (payment: string, amountMinor: number) => raw(tR, "POST", `/payments/${payment}/refunds`, { amountMinor, method: "BANK_TRANSFER", reason: "Paid twice (Sample)", idempotencyKey: key("refund") });
  const must = (r: Res, what: string) => { if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body)}`); return r.body; };
  const merged = (r: Res, survivor: string | null) => r.status === 409 && r.body.code === "PARTY_MERGED" && /merged into another record/.test(r.body.detail) && /Nothing was saved/.test(r.body.detail)
    && (survivor === null ? r.body.survivorId === undefined : r.body.survivorId === survivor);

  // ------------------------------------------------------------------------------------- money on PM, then the merge
  const invM = await issued({ personId: PM }, 50000), invM2 = await issued({ personId: PM }, 10000), invM3 = await issued({ personId: PM }, 20000);
  const dM = await draft({ personId: PM }); await line(dM, 7000);
  const opM = must(await pay(invM, 10000), "operating payment").id as string;
  const over = must(await pay(invM2, 15000), "overpayment");   // 50.00 past what invoice 2 asked: the extra, waiting
  const depM = must(await deposit({ personId: PM }, 30000), "PM deposit").paymentId as string;
  must(await deposit({ personId: PA }, 20000), "PA deposit");
  const prev = must(await raw(tR, "GET", `/payments/${depM}/reverse-preview`), "reverse preview");
  tomb("person", PM, PA);
  const before = writes();

  // ------------------------------------------------------------------------------------- each writer: 409 PARTY_MERGED
  const cases: [string, () => Promise<Res>][] = [
    ["draft create (POST /invoices)", () => raw(tR, "POST", "/invoices", { personId: PM, currency: "CAD" })],
    ["a line on the party's draft (POST /invoices/:id/lines)", () => raw(tR, "POST", `/invoices/${dM}/lines`, { kind: "FEE", description: "Another fee (Sample)", unitMinor: 1000, ratePpm: 0 })],
    ["the draft's Bill-to (PUT /invoices/:id/bill-to)", () => raw(tR, "PUT", `/invoices/${dM}/bill-to`, { province: "BC" })],
    ["issue (POST /invoices/:id/issue) of the party's draft", () => raw(tR, "POST", `/invoices/${dM}/issue`)],
    ["record a payment (POST /invoices/:id/payments)", () => pay(invM, 5000)],
    ["credit note (POST /invoices/:id/credit-notes)", () => raw(tR, "POST", `/invoices/${invM}/credit-notes`, { amountMinor: 1000, reason: "Fee reduced (Sample)" })],
    ["refund (POST /payments/:id/refunds)", () => refund(opM, 1000)],
    ["the extra's choice (POST /payments/:id/extra)", () => raw(tR, "POST", `/payments/${over.id}/extra`, { choice: "KEEP_AS_CREDIT" })],
    ["trust request (POST /trust/requests)", () => raw(tR, "POST", "/trust/requests", { personId: PM, amountMinor: 1000, currency: "CAD", purpose: "Retainer (Sample)" })],
    ["trust deposit (POST /trust/deposits)", () => deposit({ personId: PM }, 1000)],
    ["pay from trust (POST /trust/applications)", () => raw(tR, "POST", "/trust/applications", { invoiceId: invM3, amountMinor: 1000 })],
    ["trust refund, the payer (POST /trust/refunds)", () => trustRefund({ personId: PM }, 1000)],
    ["trust refund, a payee on file (POST /trust/refunds, payee)", () => trustRefund({ personId: PA }, 1000, { personId: PM })],
    ["write-off (POST /invoices/:id/write-off)", () => raw(tR, "POST", `/invoices/${invM}/write-off`, { reason: "Client cannot pay (Sample)" })],
    ["reversal (POST /payments/:id/reverse)", () => raw(tR, "POST", `/payments/${depM}/reverse`, { reasonCode: "RECORDED_BY_MISTAKE", previewHash: prev.hash })],
  ];
  ok("FO-9b 2m setup: the extra waits on the overpayment (so its choice is a real write)", over.extra?.waitingMinor === 5000, over.extra);
  for (const [name, call] of cases) {
    const r = await call();
    ok(`FO-9b 2m fail: ${name} on a merged-away person → 409 PARTY_MERGED naming the survivor (the Owner sees it); nothing written`, merged(r, PA) && writes() === before, { status: r.status, body: r.body, writes: [before, writes()] });
  }
  // The survivor's id only to a caller who sees it (C5): the same check with a scope that does not hold the survivor.
  const hidden = await owner.$transaction((tx) => liveParty(tx, A, PM, { parties: [PM] })).then(() => null, (e: { getStatus?: () => number; getResponse?: () => Record<string, unknown> }) => ({ status: e.getStatus?.(), body: e.getResponse?.() }));
  ok("FO-9b 2m pass: a caller who does not see the survivor gets the same 409 PARTY_MERGED without survivorId", hidden?.status === 409 && hidden.body?.code === "PARTY_MERGED" && hidden.body.survivorId === undefined && /Ask someone who sees/.test(String(hidden.body.detail)), hidden);

  const od = await raw(tO, "POST", "/trust/deposits", { personId: PM, method: "BANK_TRANSFER", amountMinor: 1000, currency: "CAD", idempotencyKey: key("dep-o") });
  const oq = await raw(tO, "POST", "/trust/requests", { personId: PM, amountMinor: 1000, currency: "CAD", purpose: "Retainer (Sample)" });
  ok("FO-9b 2m fail (review M1): a caller who does not see the merged-away person gets 404, the same as a missing person, for a deposit and a trust request; nothing written",
    od.status === 404 && oq.status === 404 && od.body.code !== "PARTY_MERGED" && writes() === before, [od, oq]);
  const unseen = await owner.$transaction((tx) => liveParty(tx, A, PM, { parties: [] })).then(() => null, (e: { getStatus?: () => number }) => e.getStatus?.());
  ok("FO-9b 2m fail (review m1): a payee or payer named by id that the caller does not see answers 404 when merged away, never 409", unseen === 404, unseen);

  // ------------------------------------------------------------------------------------- live, Undo, firm B, a company
  const live = await deposit({ personId: PA }, 1500);
  ok("FO-9b 2m pass: the survivor (a live party) is unchanged: a deposit on it → 201", live.status === 201, live.body);
  tomb("person", PM, null);
  const again = await deposit({ personId: PM }, 1500), againPay = await pay(invM, 1000);
  ok("FO-9b 2m pass: Undo of the merge (the tombstone cleared) makes the party payable again: a deposit and a payment → 201", again.status === 201 && againPay.status === 201, [again.body, againPay.body]);
  const fb = await raw(tR, "POST", "/invoices", { personId: PB, currency: "CAD" }), fbd = await deposit({ personId: PB }, 1000);
  ok("FO-9b 2m fail: another firm's person → 404 (draft and deposit), never a 409 that tells it exists", fb.status === 404 && fbd.status === 404, [fb, fbd]);
  {   // a chain (break m2): PM → PA, then PA → PC: the survivor named is PC, the live end
    const PC = person(A, "c"); prospect("person", PC);
    tomb("person", PM, PA); tomb("person", PA, PC);
    const ch = await deposit({ personId: PM }, 1000);
    ok("FO-9b 2m fail (break m2): a chain of merges (M into A, then A into C) names the live end, C, as the survivor", merged(ch, PC), ch.body);
    tomb("person", PA, null); tomb("person", PM, null);
  }
  tomb("company", CO, CS);
  const co = await deposit({ companyId: CO }, 1000), cod = await raw(tR, "POST", "/invoices", { companyId: CO, currency: "CAD" });
  ok("FO-9b 2m fail: a merged-away company → 409 PARTY_MERGED naming its survivor (deposit and draft create)", merged(co, CS) && merged(cod, CS) && /This company/.test(co.body.detail), [co.body, cod.body]);

  // ------------------------------------------------------------------------------------- planted two-session races
  const holdMerge = async (id: string, into: string) => {   // the merge's own lock on the record, held open
    const c = new pg.Client({ connectionString: urlOf(DB) }); await c.connect();
    await c.query("begin"); await c.query("set local session_replication_role = replica");
    await c.query(`select 1 from fo_person where firm_id = $1 and id = $2 for update nowait`, [A, id]);
    await c.query(`update fo_person set merged_into_id = $1, merged_at = clock_timestamp() where firm_id = $2 and id = $3`, [into, A, id]);
    return c;
  };
  const rInv = await issued({ personId: R.refund }, 30000), rPay = must(await pay(rInv, 10000), "race payment").id as string;
  must(await deposit({ personId: R.payee }, 5000), "race payee's own deposit");
  const races: [string, string, () => Promise<Res>][] = [
    ["a deposit", R.dep, () => deposit({ personId: R.dep }, 2500)],
    ["a draft create", R.draft, () => raw(tR, "POST", "/invoices", { personId: R.draft, currency: "CAD" })],
    ["a refund", R.refund, () => refund(rPay, 1000)],
    ["a trust refund to a payee", R.payee, () => trustRefund({ personId: PA }, 1000, { personId: R.payee })],
  ];
  for (const [name, who, call] of races) {
    const c = await holdMerge(who, PA), w0 = writes();
    let settled = false; const p = call().then((r) => { settled = true; return r; });
    // The writer is shown waiting on the row lock (review m2): a lock request not granted, held by the merge's session.
    let waited = false;
    for (let i = 0; i < 100 && !waited && !settled; i++) {
      waited = Number(sql(`select count(*) from pg_locks w join pg_locks h on h.locktype = w.locktype and h.relation is not distinct from w.relation and h.page is not distinct from w.page and h.tuple is not distinct from w.tuple and h.transactionid is not distinct from w.transactionid and h.granted
        where not w.granted and h.pid = ${(c as unknown as { processID: number }).processID}`)) > 0;
      if (!waited) await sleep(50);
    }
    waited &&= !settled;
    await c.query("commit"); await c.end();
    const r = await p;
    ok(`FO-9b 2m race: a merge holding its locks while ${name} waits → ${name} waits for it (not answered while the merge is open), then 409 PARTY_MERGED and writes nothing`, waited && merged(r, PA) && writes() === w0, { waited, status: r.status, body: r.body, writes: [w0, writes()] });
  }
  // The other way round, through the merge itself (review m3): while a money write holds the person, mergeRecords is
  // Busy (its NOWAIT locks, retried, then MergeBusy); nothing is merged.
  {
    const other = person(A, "r6");
    let out = "";
    await owner.$transaction(async (tx) => {
      await liveParty(tx, A, R.busy, "ALL");
      out = await owner.$transaction((m) => mergeRecords(m as never, { staffId: staffR, firmId: A, firmKey: "sample-firm", roles: [], keys: [MERGE_KEY], duties: [], authTime: 0, via: "local" } as never,
        { kind: "PERSON", survivor_fo_id: other, loser_fo_id: R.busy, reason: "FO-9b 2m busy check (Sample)" }, { audit: auditEvent, consent: new ConsentStore(auditEvent) }))
        .then(() => "merged", (e: Error) => e instanceof MergeBusy ? "busy" : `other: ${e.message}`);
    }, { timeout: 60_000 });
    ok("FO-9b 2m race: while a money write holds the person (FOR KEY SHARE), the merge itself (mergeRecords) answers Busy and merges nothing; the guided merge re-reads money under its locks (review.ts, HAS_MONEY)",
      out === "busy" && sql(`select coalesce(merged_into_id::text, '-') from fo_person where id = '${R.busy}'`) === "-", out);
  }
  // The other way round: an open money write holds the row FOR KEY SHARE; the merge's NOWAIT lock is refused (busy).
  {
    const c = new pg.Client({ connectionString: urlOf(DB) }); await c.connect();
    let busy = "";
    await owner.$transaction(async (tx) => {
      await liveParty(tx, A, R.busy, "ALL");
      try { await c.query("begin"); await c.query(`select 1 from fo_person where firm_id = $1 and id = $2 for update nowait`, [A, R.busy]); } catch (e) { busy = String((e as { code?: string }).code); }
      await c.query("rollback");
    });
    await c.end();
    ok("FO-9b 2m race: while a money write holds the party (FOR KEY SHARE), the merge's FOR UPDATE NOWAIT is refused (55P03, busy: the merge retries and then reads the money, HAS_MONEY)", busy === "55P03", busy);
  }
} catch (e) {
  fail++; console.log(`FAIL  the check itself threw — ${(e as Error).stack ?? e}`);
} finally {
  await app?.close(); await owner.$disconnect();
  execFileSync(join(BIN, "dropdb"), [...PG, "--if-exists", "--force", DB]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
