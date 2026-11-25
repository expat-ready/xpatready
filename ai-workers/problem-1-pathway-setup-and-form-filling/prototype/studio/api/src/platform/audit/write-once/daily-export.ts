// AUD-2 part 2 (map row 97, R1.97; SA-11-5, SA-11-6, SA-11-14, NFR5-08; P-571 (3)): the audit chain leaves the database
// every day for the write-once archive. Per chain (each firm's and the platform's; a `sample:` chain is the demo's and is
// reset by design, so it is not archived), the lines since the last export go as one JSON Lines file
//   audit/<chainKey>/<day>-<fromSeq>-<toSeq>.jsonl
// (each line's chained fields as text, as the chain hashes them, with prev_hash and entry_hash in hex) and then a head
// anchor
//   audit/<chainKey>/anchors/<day>-<toSeq>.json   { chainKey, seq, entryHash, file, fileSha256 }
// both kept for the activity log's keep period (AUD-5: 7 years, SA-11-14) and never replaced. The checker compares the
// newest anchor with the database's line at that seq, so a line changed after its export, or newest lines removed, are
// found even if someone recomputed the chain after them (latestAnchor, used by AuditChainVerifier).
// A firm's file holds only its own chain's lines (one chain per query). A second run the same day writes nothing new (an
// anchor for the day is there). A run that stopped between the file and its anchor finds that day's file from the next
// seq and writes the anchor for it, never a second file.
import { Prisma, type PrismaClient } from "@prisma/client";
import { ArchiveKeyExists, type AuditArchivePort } from "../../../../../ports/audit-archive.ts";
import { ACTIVITY_LOG_YEARS } from "../../../../../ports/keep-period.ts";
import { sha256Of } from "./sha256.ts";

export const EXPORT_QUEUE = "audit.archive_export";
/** Daily at 06:20 UTC (01:20 Toronto; the hour Sample). */
export const EXPORT_CRON = "20 6 * * *", EXPORT_ZONE = "UTC";

type Db = Pick<PrismaClient, "$queryRaw">;
type Row = { seq: string; id: string; at: string; ws: string; firm: string | null; cas: string | null; combo: string | null; actor: string; atype: string; action: string;
  entity: string; entity_key: string | null; summary: string; correlation_id: string | null; sup: string | null; detail: string | null; prev_hash: Uint8Array; entry_hash: Uint8Array };
export type Anchor = { chainKey: string; seq: string; entryHash: string; file: string; fileSha256: string };
export type ChainExport = { chainKey: string; fromSeq: string; toSeq: string; file: string; anchor: string; resumed: boolean };

const LINES = Prisma.sql`select seq::text seq, id::text id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at, workspace_id::text ws,
  firm_id::text firm, case_id::text cas, combination_id::text combo, actor, actor_type::text atype, action, entity, entity_key, summary, correlation_id,
  support_session_id::text sup, detail::text detail, prev_hash, entry_hash from audit_event`;
const DATA = /^(\d{4}-\d{2}-\d{2})-(\d+)-(\d+)\.jsonl$/, ANCHOR = /^(\d{4}-\d{2}-\d{2})-(\d+)\.json$/;
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

export class AuditChainExport {
  constructor(private readonly d: { db: Db; archive: AuditArchivePort | null; now: () => Date; page?: number }) {}

  /** The archive in use; a step with none is refused (the demo's routes, the export). */
  store(): AuditArchivePort { if (!this.d.archive) throw new Error("audit export: no write-once archive is configured (PLATFORM_AUDIT_ARCHIVE)"); return this.d.archive; }

  /** The keep-until date of everything written today: the activity log's keep period (AUD-5's table). */
  retainUntil(): Date { const t = this.d.now(); return new Date(Date.UTC(t.getUTCFullYear() + ACTIVITY_LOG_YEARS, t.getUTCMonth(), t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes())); }

  /** One day's export of every chain. Throws when no archive is configured (the job fails, and its failure is alarmed). */
  async run(): Promise<{ day: string; exports: ChainExport[] }> {
    const archive = this.d.archive;
    if (!archive) throw new Error("audit export: no write-once archive is configured (PLATFORM_AUDIT_ARCHIVE)");
    const day = this.d.now().toISOString().slice(0, 10), out: ChainExport[] = [];
    const keys = (await this.d.db.$queryRaw<{ k: string }[]>`select chain_key k from audit_event where chain_key not like 'sample:%' group by chain_key order by 1`).map((r) => r.k);
    for (const k of keys) { const e = await this.chain(archive, k, day); if (e) out.push(e); }
    return { day, exports: out };
  }

  private async chain(archive: AuditArchivePort, k: string, day: string): Promise<ChainExport | null> {
    const names = (await archive.list(`audit/${k}/`)).map((x) => x.slice(`audit/${k}/`.length));
    const anchors = names.filter((n) => n.startsWith("anchors/")).map((n) => ANCHOR.exec(n.slice(8))).filter((m): m is RegExpExecArray => !!m);
    if (anchors.some((m) => m[1] === day)) return null;   // today's export is done
    const last = anchors.reduce((s, m) => (BigInt(m[2]!) > s ? BigInt(m[2]!) : s), 0n), from = last + 1n;
    const started = names.map((n) => DATA.exec(n)).find((m) => m && m[1] === day && BigInt(m[2]!) === from);
    let file: string, toSeq: bigint, sha: string, resumed = false;
    if (started) {
      file = `audit/${k}/${started[0]}`; toSeq = BigInt(started[3]!); resumed = true;
      const o = await archive.get(file); if (!o) throw new Error(`audit export: ${file} was listed but cannot be read`);
      sha = o.sha256;
    } else {
      const rows: Row[] = [];
      for (let after = last; ;) {
        const page = await this.d.db.$queryRaw<Row[]>`${LINES} where chain_key = ${k} and seq > ${after} order by audit_event.seq limit ${this.d.page ?? 1000}`;
        rows.push(...page);
        if (page.length < (this.d.page ?? 1000)) break;
        after = BigInt(page[page.length - 1]!.seq);
      }
      if (!rows.length) return null;   // nothing new since the last export
      toSeq = BigInt(rows[rows.length - 1]!.seq);
      const body = Buffer.from(rows.map((r) => `${JSON.stringify({ chainKey: k, seq: r.seq, id: r.id, at: r.at, workspaceId: r.ws, firmId: r.firm, caseId: r.cas, combinationId: r.combo,
        actor: r.actor, actorType: r.atype, action: r.action, entity: r.entity, entityKey: r.entity_key, summary: r.summary, correlationId: r.correlation_id, supportSessionId: r.sup,
        detail: r.detail, prevHash: hex(r.prev_hash), entryHash: hex(r.entry_hash) })}\n`).join(""), "utf8");
      file = `audit/${k}/${day}-${from}-${toSeq}.jsonl`;
      try { sha = (await archive.put(file, body, this.retainUntil())).sha256; } catch (e) {
        if (!(e instanceof ArchiveKeyExists)) throw e;
        const o = await archive.get(file); if (!o || o.sha256 !== sha256Of(body)) throw e;   // another runner wrote the same file: the same bytes, else refused
        sha = o.sha256; resumed = true;
      }
    }
    const [line] = await this.d.db.$queryRaw<{ h: Uint8Array }[]>`select entry_hash h from audit_event where chain_key = ${k} and seq = ${toSeq}`;
    if (!line) throw new Error(`audit export: the line at seq ${toSeq} of an exported chain is not in the database`);
    const anchor = `audit/${k}/anchors/${day}-${toSeq}.json`, a: Anchor = { chainKey: k, seq: String(toSeq), entryHash: hex(line.h), file, fileSha256: sha };
    try { await archive.put(anchor, Buffer.from(JSON.stringify(a), "utf8"), this.retainUntil()); } catch (e) { if (!(e instanceof ArchiveKeyExists)) throw e; }
    return { chainKey: k, fromSeq: String(from), toSeq: String(toSeq), file, anchor, resumed };
  }

  /** The chain's newest anchor in the archive, or null (never exported, or no archive). */
  async latestAnchor(k: string): Promise<Anchor | null> {
    const archive = this.d.archive;
    if (!archive || k.startsWith("sample:")) return null;
    const best = (await archive.list(`audit/${k}/anchors/`)).map((x) => ({ x, m: ANCHOR.exec(x.split("/").at(-1)!) })).filter((v) => v.m)
      .sort((p, q) => (BigInt(p.m![2]!) < BigInt(q.m![2]!) ? -1 : 1)).at(-1);
    if (!best) return null;
    const o = await archive.get(best.x);
    return o ? (JSON.parse(o.bytes.toString("utf8")) as Anchor) : null;
  }
}
