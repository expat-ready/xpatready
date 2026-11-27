// FO-7r part 3 (R1.111; AG-6-31@c963bccc rules 1-4, 10, 12; AG-6-30@3033b800; AG-6-25 rules 1-3; AG-6-59 rules 5-6):
// the period exports for the firm's bookkeeper. One CSV each for invoices, payments, refunds, credit notes, write-offs,
// credits (AG-6-29's credit kept, applied, refunded, reversed: Lead 1 on #3887) and the trust ledger, for a period of the
// firm's days (platform.time_zone, kept in the request, Lead 1 on #3887; a payment recorded by its day keeps that day, as
// reports/metrics.ts), built in the background by one JobPort job and stored through FilesPort; the link expires
// (EXPORT_DAYS, Sample).
// * Who: `agent/billing:export`, firm-wide. AG-6-31 rule 10: "Personal data in full, governed by the key only (AG7-D10)",
//   so an export is not narrowed by C5 (the summary and statement are). The firm is the session's (the job's), never
//   the request's; another firm's export id is the same 404 as a missing one (FilesPort reads another firm's key as absent).
// * State without a table (brief contract gap (4); AG-6-31 §7's ExportJob has no table on main): write-once files under
//   `money-exports/<id>/`: request.json (the period, the kinds, who, when), one <kind>.csv per kind, done.json (row
//   counts) last, failed.json when a run threw. READY = done.json; FAILED = failed.json and no done.json; else QUEUED.
// * Facts as the statement dates them (statement.ts ledgerCtes): an invoice by its issue, a fact on an invoice at
//   greatest(its own time, the issue), a trust entry by its time: the `counted_on` column, which the period cuts by;
//   `date` is the fact's own day (a payment received before its invoice was issued shows when it came: break M2). So for
//   one client and currency the files reconcile across kinds with the statement's INVOICES change: invoices − payments
//   into operating + refunds − credit notes + their returned_from_trust − write-offs + the trust ledger's withdrawals to
//   invoices and their corrections + credits applied or kept and their reversals (all signed as stored); the trust
//   ledger's amounts are its TRUST change (check E1, E13). Facts the statement counts twice (a credit entry naming two
//   invoices) are not reproduced.
// * As of the request: a row recorded after the request is left out (rows are insert-only), so a retried run writes the
//   same bytes under the same keys (FilesPort is write-once).
// * Read by keyset pages of PAGE rows in one repeatable-read snapshot (AG-6-30: no in-memory scan of the tables; the
//   invoices through (firm_id, issued_at, id), every other kind through its (firm_id, id) or primary key). Each file is
//   at most FilesPort's FILE_MAX_BYTES (25 MB): a bigger one fails the export (FAILED), "choose a shorter period".
// * CSV: RFC 4180 quoting; a text cell starting with = + - @, a tab or a carriage return is prefixed with ' (formula
//   injection); amounts are plain decimals in their own currency, never converted or totalled. A UTF-8 byte-order mark
//   first, so a spreadsheet reads accented names right (review m7). Rows in date order (the trust ledger: per holder and
//   currency in the ledger's seq, its running balance's own order); only invoices page on an index, every other kind
//   sorts its period's rows per page (top-N), bounded by the 25 MB file.
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuditPort } from "../../../../ports/audit.ts";
import { FileKeyTaken, type FilesPort } from "../../../../ports/files.ts";
import type { JobPort, JobRun } from "../../../../ports/jobs.ts";
import { firmScope, withFirm } from "../../platform/firm-scope.ts";
import { parseInput } from "../../platform/http/input.ts";
import { problem, type StaffContext } from "../../platform/identity/keys.ts";
import { UUID, notFound } from "../invoices/drafts.ts";
import { readSetting, TIME_ZONE } from "../../platform/settings.ts";
import { Day, bad, trustShows } from "../reads/common.ts";

type Tx = Prisma.TransactionClient;
export const EXPORT_KINDS = ["INVOICES", "PAYMENTS", "REFUNDS", "CREDIT_NOTES", "WRITE_OFFS", "CREDITS", "TRUST_LEDGER"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
export const EXPORT_JOB = "client_money.export";
/** Sample: how long an export's link works, in days. */
export const EXPORT_DAYS = 7;
/** Sample: rows per keyset page. */
export const PAGE = 1000;
const FILE = (k: ExportKind) => `${k.toLowerCase()}.csv`;
const key = (id: string, file: string) => `money-exports/${id}/${file}`;

export const COLUMNS = ["date", "number_or_reference", "client", "case", "bill_to", "amount", "tax", "currency", "method", "received_into", "related_document", "counted_on"] as const;
export const TRUST_COLUMNS = ["date", "case_or_person", "entry_type", "reference", "payer", "amount", "currency", "running_balance", "related_document"] as const;
/** Each file's header: credit notes add what their "Refund to the client" sent back from trust; credits their entry type. */
export const HEADERS: Record<ExportKind, readonly string[]> = { INVOICES: COLUMNS, PAYMENTS: COLUMNS, REFUNDS: COLUMNS, WRITE_OFFS: COLUMNS,
  CREDIT_NOTES: [...COLUMNS, "returned_from_trust"], CREDITS: [...COLUMNS, "entry_type"], TRUST_LEDGER: TRUST_COLUMNS };

const Body = z.strictObject({ id: z.string().regex(UUID).optional(), from: Day, to: Day, kinds: z.array(z.enum(EXPORT_KINDS)).min(1).max(EXPORT_KINDS.length) });
const Manifest = z.strictObject({ from: Day, to: Day, zone: z.string(), kinds: z.array(z.enum(EXPORT_KINDS)), by: z.string(), at: z.string() });
type Manifest = z.infer<typeof Manifest>;
const Done = z.strictObject({ rows: z.record(z.string(), z.number().int()), at: z.string() });

/** One text cell: quoted when it holds a comma, quote or line break; a leading = + - @ tab or CR made inert with '. */
export function cell(v: string | null | undefined): string {
  let s = v ?? "";
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** Minor units as a plain decimal (−1234.50), never a float. */
export const amount = (n: number | string | null): string => {
  if (n === null || n === "") return "";
  const v = BigInt(n), neg = v < 0n, s = (neg ? -v : v).toString().padStart(3, "0");
  return `${neg ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
};

const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const parse = <T>(shape: z.ZodType<T>, f: { bytes: Uint8Array } | null): T | null => f ? shape.parse(JSON.parse(new TextDecoder().decode(f.bytes))) : null;

export type ExportDeps = { db: PrismaClient; files: FilesPort; jobs: JobPort | null; audit: AuditPort; clock: { now(): Date } };

export class MoneyExports {
  constructor(private readonly p: ExportDeps) {}

  /** The job's worker (registered once by the feature when the app starts; a suite registers it on its fake). */
  async register(): Promise<void> { await this.p.jobs?.handle(EXPORT_JOB, (job) => this.run(job)); }

  /** POST /api/front-office/money/exports {id?, from, to, kinds}: stores the request and queues one job (202). The same id
   *  with the same request again queues nothing and answers its state; with another request, 409. */
  async request(ctx: StaffContext, body: unknown) {
    const b = parseInput(Body, body ?? {}), f = firmScope(ctx.firmId).firmId;
    if (b.from > b.to) bad("to", "to is before from.");
    const kinds = EXPORT_KINDS.filter((k) => b.kinds.includes(k));
    if (kinds.length !== b.kinds.length) bad("kinds", "Name each file once.");
    if (!this.p.jobs) problem(503, "Not available", "Exports are not available on this server.", { code: "EXPORTS_OFF" });
    if (kinds.includes("TRUST_LEDGER") && !(await this.p.db.$transaction((tx) => trustShows(tx, f)))) bad("kinds", "There is no trust ledger: trust is off and no money is held.");
    const id = (b.id ?? randomUUID()).toLowerCase(), want: Manifest = { from: b.from, to: b.to, zone: await readSetting<string>(this.p.db, f, TIME_ZONE.key), kinds, by: `staff:${ctx.staffId}`, at: this.p.clock.now().toISOString() };
    const same = (m: Manifest) => m.from === want.from && m.to === want.to && m.kinds.join() === want.kinds.join();
    let had = parse(Manifest, await this.p.files.get(f, key(id, "request.json")));
    if (!had) {
      try { await this.p.files.put(f, key(id, "request.json"), json(want), "application/json"); had = want; }
      catch (e) { if (!(e instanceof FileKeyTaken)) throw e; had = parse(Manifest, await this.p.files.get(f, key(id, "request.json"))); }
    }
    if (!had || !same(had)) problem(409, "Conflict", "This export id is already used for another period or files.", { code: "EXPORT_ID_TAKEN" });
    await this.p.jobs!.enqueue(EXPORT_JOB, { exportId: id }, { key: `money_export:${f}:${id}`, firmId: f });
    return this.answer(f, id, had);
  }

  /** GET /exports/:id: QUEUED | READY | FAILED | EXPIRED, the period, the files' links and, once ready, the row counts. */
  async state(ctx: StaffContext, rawId: string) {
    const f = firmScope(ctx.firmId).firmId, id = this.idOf(rawId);
    const m = parse(Manifest, await this.p.files.get(f, key(id, "request.json")));
    return m ? this.answer(f, id, m) : notFound("export");
  }

  /** GET /exports/:id/:kind.csv: the file, once ready and before it expires. */
  async download(ctx: StaffContext, rawId: string, file: string): Promise<{ name: string; bytes: Uint8Array }> {
    const f = firmScope(ctx.firmId).firmId, id = this.idOf(rawId);
    const m = parse(Manifest, await this.p.files.get(f, key(id, "request.json")));
    const kind = m?.kinds.find((k) => FILE(k) === file);
    if (!m || !kind) return notFound("export file");
    const s = await this.answer(f, id, m);
    if (s.state === "EXPIRED") problem(410, "Gone", "This export's link has expired. Make a new export.", { code: "EXPORT_EXPIRED" });
    const got = s.state === "READY" ? await this.p.files.get(f, key(id, FILE(kind))) : null;
    if (!got) problem(409, "Not ready", s.state === "FAILED" ? "This export failed. Make a new export, or choose a shorter period." : "This export is still being prepared.", { code: `EXPORT_${s.state}` });
    return { name: `${kind.toLowerCase()}-${m.from}-to-${m.to}.csv`, bytes: got!.bytes };
  }

  /** The worker: every kind's CSV, one audit line (who, period, row counts), then done.json. */
  async run(job: Pick<JobRun, "firmId" | "payload">): Promise<void> {
    const id = String(job.payload.exportId ?? "");
    if (!job.firmId || !UUID.test(job.firmId) || !UUID.test(id)) return;
    const f = firmScope(job.firmId).firmId;
    await withFirm(f, async () => {
      const m = parse(Manifest, await this.p.files.get(f, key(id, "request.json")));
      if (!m || await this.p.files.exists(f, key(id, "done.json"))) return;
      try {
        const files = await this.p.db.$transaction(async (tx) => { const out: { kind: ExportKind; text: string; rows: number }[] = []; for (const k of m.kinds) out.push({ kind: k, ...(await csvOf(tx, f, k, m)) }); return out; },
          { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120_000 });
        for (const x of files) await this.p.files.put(f, key(id, FILE(x.kind)), new TextEncoder().encode(x.text), "text/csv; charset=utf-8");
        const rows = Object.fromEntries(files.map((x) => [x.kind, x.rows]));
        await this.p.db.$transaction((tx) => this.p.audit.record(tx, { firmId: f, actor: m.by, action: "money_export.created", entity: "money_export", entityKey: id,
          summary: `Export ${m.kinds.join(", ")} for ${m.from} to ${m.to}.`, detail: { from: m.from, to: m.to, kinds: m.kinds, ...rows }, before: null, after: { from: m.from, to: m.to, ...rows } }));
        await this.p.files.put(f, key(id, "done.json"), json({ rows, at: this.p.clock.now().toISOString() }), "application/json");
      } catch (e) {
        if (!(await this.p.files.exists(f, key(id, "failed.json")))) await this.p.files.put(f, key(id, "failed.json"), json({ at: this.p.clock.now().toISOString() }), "application/json").catch(() => undefined);
        throw e;   // the runner marks the job failed (PF-14 retries it); no personal data in the error (AG-6-31 rule 10)
      }
    });
  }

  private idOf(raw: string): string { return UUID.test(raw) ? raw.toLowerCase() : notFound("export"); }

  private async answer(f: string, id: string, m: Manifest) {
    const done = parse(Done, await this.p.files.get(f, key(id, "done.json"))), expiresAt = new Date(new Date(m.at).getTime() + EXPORT_DAYS * 86_400_000);
    const state = expiresAt <= this.p.clock.now() ? "EXPIRED" : done ? "READY" : (await this.p.files.exists(f, key(id, "failed.json"))) ? "FAILED" : "QUEUED";
    return { id, state, from: m.from, to: m.to, zone: m.zone, kinds: m.kinds, requestedAt: m.at, expiresAt: expiresAt.toISOString(), rows: done?.rows ?? null,
      files: state === "READY" ? m.kinds.map((k) => ({ kind: k, url: `/api/front-office/money/exports/${id}/${FILE(k)}` })) : [] };
  }
}

// ------------------------------------------------------------------------------------------------- the readers per kind
type Row = { k: string; id: string; date: string; counted: string; ref: string | null; client: string | null; caseNo: string | null; billTo: string | null; amount: string; tax: string | null; currency: string; method: string | null; into: string | null; related: string | null; entry?: string | null; running?: string | null; extra?: string | null };

/** The party's name (person or company) and the case's client and number, around one kind's page `x`. */
const named = (f: string, x: Prisma.Sql) => Prisma.sql`select x.*, to_char(x.cday, 'YYYY-MM-DD') as counted, to_char(x.oday, 'YYYY-MM-DD') as date,
    coalesce(nullif(trim(concat_ws(' ', pp.given_names, pp.family_name)), ''), nullif(trim(co.operating_name), '')) as "billTo", rc.case_number as "caseNo",
    coalesce(cc.display_name, nullif(trim(concat_ws(' ', pp.given_names, pp.family_name)), ''), nullif(trim(co.operating_name), '')) as client
  from (${x}) x left join fo_person pp on pp.firm_id = ${f}::uuid and pp.id = x.pid left join fo_company co on co.firm_id = ${f}::uuid and co.id = x.cid
    left join runtime_case rc on rc.firm_id = ${f}::uuid and rc.id = x.case_id left join case_client cc on cc.firm_id = ${f}::uuid and cc.id = rc.client_id order by x.k, x.id`;

/** One page of kind `kind` after `after` (the last row's key), firm-first, period and as-of filtered; days in `zone`. */
function pageSql(f: string, kind: ExportKind, from: string, to: string, zone: string, asOf: Date, after: { k: string; id: string } | null): Prisma.Sql {
  const Z = Prisma.sql`${zone}::text`;
  const day = (t: string) => `(${t} at time zone $Z)::date`;
  // a payment recorded with its day only is stored at 00:00 UTC: that is its day (reports/metrics.ts paidDay)
  const paid = (t: string) => `(case when ${t} = date_trunc('day', ${t}, 'UTC') then (${t} at time zone 'UTC')::date else ${day(t)} end)`;
  const sql = (s: string) => { const parts = s.split("$Z"); return Prisma.sql(parts, ...parts.slice(1).map(() => Z)); };   // $Z: the zone, bound
  const inDays = (d: string) => Prisma.sql`and ${sql(d)} >= ${from}::date and ${sql(d)} <= ${to}::date`;
  // invoices page on (firm_id, issued_at, id); every other kind by its text key k: its counted day and its time to the
  // microsecond (the trust ledger: holder, currency and seq, so each running balance reads in order: review M1), then id
  const keyed = (k: string, id: string) => Prisma.sql`${after ? Prisma.sql`and (${sql(k)}, ${Prisma.raw(id)}) > (${after.k}::text, ${after.id}::uuid)` : Prisma.empty} order by ${sql(k)}, ${Prisma.raw(id)} limit ${PAGE}`;
  const T = (c: string, at: string) => `(to_char(${c}, 'YYYY-MM-DD') || to_char(${at} at time zone 'UTC', '"T"HH24:MI:SS.US'))`;
  const on = (own: string, t: string) => ({ own, c: `greatest(${own}, ${day("i.issued_at")})`, t: `greatest(${t}, i.issued_at)` });
  const D = { p: on(paid("p.received_at"), "p.received_at"), x: on(day("x.created_at"), "x.created_at"), c: on(day("c.created_at"), "c.created_at"), w: on(day("w.created_at"), "w.created_at"), n: on(day("n.created_at"), "n.created_at") };
  const pick = (d: { own: string; c: string; t: string }) => sql(`${T(d.c, d.t)} as k, ${d.own} as oday, ${d.c} as cday`);
  const inv = Prisma.sql`left join money_invoice i on i.firm_id = ${f}::uuid and i.id`;
  switch (kind) {
    case "INVOICES": return Prisma.sql`select to_char(i.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') as k, i.id, ${sql(`${day("i.issued_at")} as oday, ${day("i.issued_at")} as cday`)}, i.number as ref, i.person_id as pid, i.company_id as cid, i.case_id, t.total::text as amount, t.tax::text as tax, i.currency::text as currency,
        null::text as method, null::text as into, null::text as related from money_invoice i
        cross join lateral (select coalesce(sum(l.amount_minor::bigint + l.tax_minor), 0) as total, coalesce(sum(l.tax_minor::bigint), 0) as tax from money_invoice_line l where l.firm_id = i.firm_id and l.invoice_id = i.id) t
      where i.firm_id = ${f}::uuid and i.issued_at is not null and i.issued_at <= ${asOf} and i.issued_at >= (${from}::date::timestamp at time zone ${Z}) and i.issued_at < ((${to}::date + 1)::timestamp at time zone ${Z})
        ${after ? Prisma.sql`and (i.issued_at, i.id) > ((${after.k}::timestamp at time zone 'UTC'), ${after.id}::uuid)` : Prisma.empty} order by i.issued_at, i.id limit ${PAGE}`;
    case "PAYMENTS": return Prisma.sql`select ${pick(D.p)}, p.id, p.reference as ref, coalesce(i.person_id, r.person_id, e.person_id) as pid, coalesce(i.company_id, r.company_id, e.company_id) as cid,
        coalesce(i.case_id, r.case_id, e.case_id) as case_id, p.amount_minor::text as amount, null::text as tax, p.currency::text as currency, p.method::text as method, p.received_into::text as into, coalesce(i.number, r.number) as related
      from money_payment p ${inv} = p.invoice_id left join money_trust_request r on r.firm_id = p.firm_id and r.id = p.trust_request_id left join money_trust_entry e on e.firm_id = p.firm_id and e.payment_id = p.id
      where p.firm_id = ${f}::uuid and p.created_at <= ${asOf} ${inDays(D.p.c)} ${keyed(T(D.p.c, D.p.t), "p.id")}`;
    case "REFUNDS": return Prisma.sql`select ${pick(D.x)}, x.id, p.reference as ref, coalesce(i.person_id, r.person_id, e.person_id) as pid, coalesce(i.company_id, r.company_id, e.company_id) as cid,
        coalesce(i.case_id, r.case_id, e.case_id) as case_id, x.amount_minor::text as amount, null::text as tax, x.currency::text as currency, x.route::text as method, p.received_into::text as into, coalesce(i.number, r.number) as related
      from money_refund x join money_payment p on p.firm_id = x.firm_id and p.id = x.payment_id ${inv} = p.invoice_id left join money_trust_request r on r.firm_id = p.firm_id and r.id = p.trust_request_id
        left join money_trust_entry e on e.firm_id = p.firm_id and e.payment_id = p.id
      where x.firm_id = ${f}::uuid and x.created_at <= ${asOf} ${inDays(D.x.c)} ${keyed(T(D.x.c, D.x.t), "x.id")}`;
    case "CREDIT_NOTES": return Prisma.sql`select ${pick(D.c)}, c.id, c.number as ref, i.person_id as pid, i.company_id as cid, i.case_id, c.amount_minor::text as amount, null::text as tax,
        c.currency::text as currency, null::text as method, null::text as into, i.number as related, (case when c.overpaid_choice = 'OVERPAID_REFUND' then coalesce(c.overpaid_minor, 0) end)::text as extra
      from money_credit_note c ${inv} = c.invoice_id
      where c.firm_id = ${f}::uuid and c.created_at <= ${asOf} ${inDays(D.c.c)} ${keyed(T(D.c.c, D.c.t), "c.id")}`;
    case "WRITE_OFFS": return Prisma.sql`select ${pick(D.w)}, w.id, i.number as ref, i.person_id as pid, i.company_id as cid, i.case_id, w.amount_minor::text as amount, null::text as tax,
        w.currency::text as currency, null::text as method, null::text as into, i.number as related from money_write_off w ${inv} = w.invoice_id
      where w.firm_id = ${f}::uuid and w.created_at <= ${asOf} ${inDays(D.w.c)} ${keyed(T(D.w.c, D.w.t), "w.id")}`;
    // AG-6-29: credit kept, applied, refunded and reversed are facts of their own; the invoice is the entry's, its
    // payment's, or (a reversal) the reversed entry's; amounts signed as the credit ledger holds them
    case "CREDITS": return Prisma.sql`select ${pick(D.n)}, n.id, null::text as ref, n.person_id as pid, n.company_id as cid, n.case_id, n.amount_minor::text as amount, null::text as tax,
        n.currency::text as currency, null::text as method, null::text as into, i.number as related, (case when n.kind = 'REVERSED' then 'REVERSED_' || v.kind::text else n.kind::text end) as extra
      from money_credit_entry n left join money_credit_entry v on v.firm_id = n.firm_id and v.id = n.reverses_entry_id
        left join money_payment p on p.firm_id = n.firm_id and p.id = coalesce(n.payment_id, v.payment_id) ${inv} = coalesce(n.invoice_id, v.invoice_id, p.invoice_id)
      where n.firm_id = ${f}::uuid and n.created_at <= ${asOf} ${inDays(D.n.c)} ${keyed(T(D.n.c, D.n.t), "n.id")}`;
    case "TRUST_LEDGER": { const k = `(coalesce(e.person_id, e.company_id)::text || '|' || e.currency::text || '|' || lpad(e.seq::text, 10, '0'))`;
      return Prisma.sql`select ${sql(`${k} as k, ${day("e.created_at")} as oday, ${day("e.created_at")} as cday`)}, e.id, coalesce(p.reference, r.number, i.number) as ref, e.person_id as pid, e.company_id as cid, e.case_id, e.amount_minor::text as amount, null::text as tax,
        e.currency::text as currency, null::text as method, null::text as into, coalesce(i.number, wi.number) as related, e.kind::text as entry, e.balance_after_minor::text as running
      from money_trust_entry e left join money_payment p on p.firm_id = e.firm_id and p.id = e.payment_id left join money_trust_request r on r.firm_id = e.firm_id and r.id = e.trust_request_id ${inv} = e.invoice_id
        left join money_trust_entry w on w.firm_id = e.firm_id and w.id = e.corrects_entry_id left join money_invoice wi on wi.firm_id = e.firm_id and wi.id = w.invoice_id
      where e.firm_id = ${f}::uuid and e.created_at <= ${asOf} ${inDays(day("e.created_at"))} ${keyed(k, "e.id")}`; }
  }
}

/** The SQL of one page with its names (exported for the plan check of check_fo7r3_exports.ts). */
export const exportPageSql = (f: string, kind: ExportKind, from: string, to: string, zone: string, asOf: Date, after: { k: string; id: string } | null) =>
  named(f, pageSql(f, kind, from, to, zone, asOf, after));

/** One kind's whole CSV, read page by page (keyset), header first; header only when the period is empty. */
async function csvOf(tx: Tx, f: string, kind: ExportKind, m: Manifest): Promise<{ text: string; rows: number }> {
  const out = [`﻿${HEADERS[kind].join(",")}`], asOf = new Date(m.at);
  let after: { k: string; id: string } | null = null, rows = 0;
  for (;;) {
    const page: Row[] = await tx.$queryRaw<Row[]>(exportPageSql(f, kind, m.from, m.to, m.zone, asOf, after));
    for (const r of page) out.push(kind === "TRUST_LEDGER"
      ? [r.date, cell(r.caseNo ?? r.billTo), cell(r.entry), cell(r.ref), cell(r.billTo), amount(r.amount), r.currency, amount(r.running ?? null), cell(r.related)].join(",")
      : [r.date, cell(r.ref), cell(r.client), cell(r.caseNo), cell(r.billTo), amount(r.amount), amount(r.tax), r.currency, cell(r.method), cell(r.into), cell(r.related), r.counted,
        ...(kind === "CREDIT_NOTES" ? [amount(r.extra ?? null)] : kind === "CREDITS" ? [cell(r.extra)] : [])].join(","));
    rows += page.length;
    if (page.length < PAGE) break;
    const last: Row = page.at(-1)!; after = { k: last.k, id: last.id };
  }
  return { text: `${out.join("\r\n")}\r\n`, rows };
}
