// AUD-2 part 2 (map row 97, R1.97; SA-11-5, SA-11-6, SA-11-14, NFR5-08; P-571 (3)): the audit chain leaves the database
// every day for the write-once archive. Per chain (each firm's and the platform's; a `sample:` chain is the demo's and is
// reset by design, so it is not archived), the lines since the last export go as one JSON Lines file
//   audit/<chainKey>/<day>-<fromSeq>-<toSeq>.jsonl
// (each line's chained fields as text, as the chain hashes them, with prev_hash and entry_hash in hex) and then its anchor
//   audit/<chainKey>/anchors/<day>-<toSeq>.json   { chainKey, seq, entryHash, file, fileSha256 }
// both kept for the activity log's keep period (AUD-5: 7 years, SA-11-14) and never replaced.
// The archive of a chain is a LEDGER, read whole (ledger()): its files run from seq 1 with no hole or overlap, each file
// but a pending last one has exactly its anchor, every anchor names its own chain, seq and file, and nothing else is
// under the chain's prefix (break M1, review M3/M4). A full check also reads every file: its digest is its anchor's,
// its lines run on from the previous anchor's hash and end on its anchor's. The checker compares the anchors with the
// database (AuditChainVerifier), so a line changed after its export, or exported lines removed, are found even when the
// chain was recomputed after them and the checker's own record moved.
// The export: one chain at a time under that chain's lock (two runners never write one chain); the lines are verified
// from the last anchor before they are exported, so a chain altered after its anchor is never archived as if it were
// whole (break "not caught"); a file put whose anchor did not follow (a crash) is finished on the next run, whatever the
// day, never written twice; every object reused must still be kept until a future date (break M4: a bucket that did not
// lock it is refused). One chain's failure stops no other chain (break M3): run() returns the failures and the job
// fails on any.
import { Prisma, type PrismaClient } from "@prisma/client";
import { ArchiveKeyExists, type AuditArchivePort } from "../../../../../ports/audit-archive.ts";
import { ACTIVITY_LOG_YEARS } from "../../../../../ports/keep-period.ts";
import { entryHash, ZERO_HASH } from "../canonical.ts";
import { sha256Of } from "./sha256.ts";

export const EXPORT_QUEUE = "audit.archive_export";
/** Daily at 06:20 UTC (01:20 Toronto; the hour Sample). */
export const EXPORT_CRON = "20 6 * * *", EXPORT_ZONE = "UTC";

type Db = Pick<PrismaClient, "$queryRaw" | "$transaction">;
type Q = Pick<Prisma.TransactionClient, "$queryRaw">;
type Row = { seq: string; id: string; at: string; ws: string; firm: string | null; cas: string | null; combo: string | null; actor: string; atype: string; action: string;
  entity: string; entity_key: string | null; summary: string; correlation_id: string | null; sup: string | null; detail: string | null; prev_hash: Uint8Array; entry_hash: Uint8Array };
export type Anchor = { chainKey: string; seq: string; entryHash: string; file: string; fileSha256: string };
export type ChainExport = { chainKey: string; fromSeq: string; toSeq: string; file: string; anchor: string; resumed: boolean };
/** A chain's archive, read whole: ok with its anchors (oldest first) and a pending file, or the first seq it fails at. */
export type Ledger = { ok: true; anchors: Anchor[]; pending: { file: string; from: bigint; to: bigint } | null; today: boolean } | { ok: false; fromSeq: string; why: string };
type Line = { chainKey: string; seq: string; id: string; at: string; workspaceId: string; firmId: string | null; caseId: string | null; combinationId: string | null; actor: string;
  actorType: string; action: string; entity: string; entityKey: string | null; summary: string; correlationId: string | null; supportSessionId: string | null; detail: string | null; prevHash: string; entryHash: string };

const LINES = Prisma.sql`select seq::text seq, id::text id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at, workspace_id::text ws,
  firm_id::text firm, case_id::text cas, combination_id::text combo, actor, actor_type::text atype, action, entity, entity_key, summary, correlation_id,
  support_session_id::text sup, detail::text detail, prev_hash, entry_hash from audit_event`;
const DATA = /^(\d{4}-\d{2}-\d{2})-([1-9]\d*)-([1-9]\d*)\.jsonl$/, ANCHOR = /^anchors\/(\d{4}-\d{2}-\d{2})-([1-9]\d*)\.json$/, HEX = /^[0-9a-f]{64}$/;
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");
const lineOf = (k: string, r: Row): Line => ({ chainKey: k, seq: r.seq, id: r.id, at: r.at, workspaceId: r.ws, firmId: r.firm, caseId: r.cas, combinationId: r.combo, actor: r.actor,
  actorType: r.atype, action: r.action, entity: r.entity, entityKey: r.entity_key, summary: r.summary, correlationId: r.correlation_id, supportSessionId: r.sup, detail: r.detail,
  prevHash: hex(r.prev_hash), entryHash: hex(r.entry_hash) });
const parseLines = (b: Buffer): Line[] => b.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Line);
/** A file's lines, each re-verified on its own (no database): seq runs on, each prev_hash is the previous entry_hash. */
function linesVerify(k: string, lines: Line[], from: bigint, prev: string): string | null {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.chainKey !== k || l.seq !== String(from + BigInt(i)) || l.prevHash !== prev) return String(from + BigInt(i));
    if (entryHash(Buffer.from(l.prevHash, "hex"), { ...l, seq: l.seq }).toString("hex") !== l.entryHash) return l.seq;
    prev = l.entryHash;
  }
  return null;
}

export class ArchiveRefused extends Error { constructor(readonly fromSeq: string, why: string) { super(`audit export: ${why}`); this.name = "ArchiveRefused"; } }

export class AuditChainExport {
  constructor(private readonly d: { db: Db; archive: AuditArchivePort | null; now: () => Date; page?: number }) {}

  /** The archive in use; a step with none is refused (the demo's routes, the export). */
  store(): AuditArchivePort { if (!this.d.archive) throw new Error("audit export: no write-once archive is configured (PLATFORM_AUDIT_ARCHIVE)"); return this.d.archive; }

  /** The keep-until date of everything written today: the activity log's keep period (AUD-5's table). */
  retainUntil(): Date { const t = this.d.now(); return new Date(Date.UTC(t.getUTCFullYear() + ACTIVITY_LOG_YEARS, t.getUTCMonth(), t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes())); }

  /** One day's export of every chain. Each chain on its own: the failures are returned (the job throws on any). */
  async run(): Promise<{ day: string; exports: ChainExport[]; failed: { chainKey: string; why: string }[] }> {
    const archive = this.store(), day = this.d.now().toISOString().slice(0, 10), exports: ChainExport[] = [], failed: { chainKey: string; why: string }[] = [];
    const keys = (await this.d.db.$queryRaw<{ k: string }[]>`select chain_key k from audit_event where chain_key not like 'sample:%' group by chain_key order by 1`).map((r) => r.k);
    for (const k of keys) {
      try {
        const e = await this.d.db.$transaction(async (tx) => {
          const [{ got }] = await tx.$queryRaw<{ got: boolean }[]>`select pg_try_advisory_xact_lock(hashtextextended('aud_chain_export:' || ${k}, 0)) got`;
          return got ? this.chain(tx, archive, k, day) : null;   // another runner has this chain now
        }, { timeout: 10 * 60_000, maxWait: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
        if (e) exports.push(e);
      } catch (e) { failed.push({ chainKey: k, why: e instanceof Error ? e.message : String(e) }); }
    }
    return { day, exports, failed };
  }

  /** A chain's archive read whole and checked (full: every file's bytes too). Never throws for what it finds. */
  async ledger(k: string, full: boolean): Promise<Ledger> {
    const archive = this.store(), base = `audit/${k}/`, names = (await archive.list(base)).map((n) => n.slice(base.length));
    const files: { name: string; from: bigint; to: bigint }[] = [], anchors = new Map<bigint, string>();
    for (const n of names) {
      const d = DATA.exec(n), a = ANCHOR.exec(n);
      if (d) files.push({ name: n, from: BigInt(d[2]!), to: BigInt(d[3]!) });
      else if (a && !anchors.has(BigInt(a[2]!))) anchors.set(BigInt(a[2]!), n);
      else return { ok: false, fromSeq: "1", why: `an object that is no export of this chain: ${n.slice(0, 80)}` };
    }
    files.sort((p, q) => (p.from < q.from ? -1 : 1));
    const out: Anchor[] = []; let due = 1n, prev = ZERO_HASH.toString("hex"), pending: { file: string; from: bigint; to: bigint } | null = null;
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!, key = `${base}${f.name}`;
      if (f.from !== due || f.to < f.from) return { ok: false, fromSeq: String(due), why: `the files do not run on at seq ${due}` };
      const an = anchors.get(f.to);
      if (!an) { if (i === files.length - 1) { pending = { file: key, from: f.from, to: f.to }; break; } return { ok: false, fromSeq: String(f.from), why: `file ${f.name} has no anchor` }; }
      anchors.delete(f.to);
      const o = await archive.get(`${base}${an}`); let a: Anchor | null = null;
      try { a = o ? (JSON.parse(o.bytes.toString("utf8")) as Anchor) : null; } catch { a = null; }
      if (!a || a.chainKey !== k || a.seq !== String(f.to) || a.file !== key || !HEX.test(a.entryHash ?? "") || !HEX.test(a.fileSha256 ?? ""))
        return { ok: false, fromSeq: String(f.from), why: `the anchor of file ${f.name} does not name it` };
      if (full) {
        const fo = await archive.get(key);
        if (!fo || fo.sha256 !== a.fileSha256) return { ok: false, fromSeq: String(f.from), why: `file ${f.name} is not the one its anchor names` };
        const lines = parseLines(fo.bytes), bad = linesVerify(k, lines, f.from, prev);
        if (bad || lines.length !== Number(f.to - f.from + 1n) || lines.at(-1)!.entryHash !== a.entryHash) return { ok: false, fromSeq: bad ?? String(f.from), why: `file ${f.name} does not verify` };
      }
      out.push(a); prev = a.entryHash; due = f.to + 1n;
    }
    if (anchors.size) return { ok: false, fromSeq: String([...anchors.keys()].sort()[0]), why: "an anchor with no file" };
    const day = this.d.now().toISOString().slice(0, 10);
    return { ok: true, anchors: out, pending, today: !!out.length && names.some((n) => n === `anchors/${day}-${out.at(-1)!.seq}.json`) };
  }

  private async chain(tx: Q, archive: AuditArchivePort, k: string, day: string): Promise<ChainExport | null> {
    const L = await this.ledger(k, false);
    if (!L.ok) throw new ArchiveRefused(L.fromSeq, `the archive of chain ${k} is not whole: ${L.why}`);
    if (L.today && !L.pending) return null;   // today's export is done
    const last = L.anchors.at(-1), lastSeq = last ? BigInt(last.seq) : 0n, lastHash = last?.entryHash ?? ZERO_HASH.toString("hex");
    let file: string, body: Buffer, from = lastSeq + 1n, to: bigint, resumed = false;
    if (L.pending) {   // a file put whose anchor did not follow: finish it, whatever day it was written
      const o = await archive.get(L.pending.file);
      if (!o) throw new ArchiveRefused(String(from), `${L.pending.file} was listed but cannot be read`);
      this.locked(o.retainUntil, L.pending.file);
      file = L.pending.file; body = o.bytes; to = L.pending.to; resumed = true;
      if (linesVerify(k, parseLines(body), from, lastHash)) throw new ArchiveRefused(String(from), `${file} does not verify`);
    } else {
      const rows: Row[] = [];
      for (let after = lastSeq; ;) {
        const page = await tx.$queryRaw<Row[]>`${LINES} where chain_key = ${k} and seq > ${after} order by audit_event.seq limit ${this.d.page ?? 1000}`;
        rows.push(...page);
        if (page.length < (this.d.page ?? 1000)) break;
        after = BigInt(page[page.length - 1]!.seq);
      }
      if (!rows.length) return null;   // nothing new since the last export
      const lines = rows.map((r) => lineOf(k, r)), bad = linesVerify(k, lines, from, lastHash);
      if (bad) throw new ArchiveRefused(bad, `chain ${k} does not verify from seq ${bad}: not exported`);
      to = BigInt(lines.at(-1)!.seq);
      body = Buffer.from(lines.map((l) => `${JSON.stringify(l)}\n`).join(""), "utf8");
      file = `audit/${k}/${day}-${from}-${to}.jsonl`;
      await this.putOnce(archive, file, body);
    }
    const lines = parseLines(body), anchor = `audit/${k}/anchors/${day}-${to}.json`;
    const a: Anchor = { chainKey: k, seq: String(to), entryHash: lines.at(-1)!.entryHash, file, fileSha256: sha256Of(body) };
    await this.putOnce(archive, anchor, Buffer.from(JSON.stringify(a), "utf8"));
    return { chainKey: k, fromSeq: String(from), toSeq: String(to), file, anchor, resumed };
  }

  /** Writes once; a key already there must hold these very bytes and still be kept, else the export is refused. */
  private async putOnce(archive: AuditArchivePort, key: string, bytes: Buffer) {
    try { await archive.put(key, bytes, this.retainUntil()); } catch (e) {
      if (!(e instanceof ArchiveKeyExists)) throw e;
      const o = await archive.get(key);
      if (!o || !o.bytes.equals(bytes)) throw new ArchiveRefused("1", `${key} is already written with other bytes`);
      this.locked(o.retainUntil, key);
    }
  }
  private locked(until: Date, key: string) { if (!(until.getTime() > this.d.now().getTime())) throw new ArchiveRefused("1", `${key} is not kept until a future date (the bucket did not lock it)`); }

  /** For the checker: the chain's anchors to compare with the database (all on a full pass, the newest otherwise), or
   *  where its archive stops being whole. Null with no archive or for a sample: chain. */
  async check(k: string, full: boolean): Promise<{ ok: true; anchors: { seq: string; entryHash: string }[] } | { ok: false; fromSeq: string } | null> {
    if (!this.d.archive || k.startsWith("sample:")) return null;
    const L = await this.ledger(k, full);
    if (!L.ok) return { ok: false, fromSeq: L.fromSeq };
    return { ok: true, anchors: (full ? L.anchors : L.anchors.slice(-1)).map((a) => ({ seq: a.seq, entryHash: a.entryHash })) };
  }

  /** Every chain the archive holds (a chain removed whole from the database is still checked: review M2). */
  async chains(): Promise<string[]> {
    if (!this.d.archive) return [];
    return [...new Set((await this.d.archive.list("audit/")).map((key) => key.split("/")[1]!).filter(Boolean))].sort();
  }
}
