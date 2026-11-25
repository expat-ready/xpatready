// AUD-1c part 2 (map row 97, R1.97; SA-11-4@4cfd3199, SA-11-6@c624a887, AG-13-42@a9a48286, NFR5-08; SA-11 BR-2): the
// audit chain's checker. Every 30 minutes it reads, per chain, only the lines after the last verified place
// (aud_chain_check.verified_seq), first confirming that line is still there with the hash it had; weekly it reads every
// line from seq 1. For each line it checks the seq follows with no gap, prev_hash is the previous line's entry_hash,
// and entry_hash is sha256(prev_hash || canonical(line)) recomputed by audit/canonical.ts (never trusting the column).
// A finding marks the chain BROKEN with the range from the first bad seq to the chain's head, never moves verified_seq
// past it, and raises one alert with ids only (the chain, the firm when the chain is a firm's, the range): no summary,
// no detail, no actor (SA-11-6, BR-16). The same break is raised once, not once a run. Each completed pass writes the
// heartbeat metric `audit.chain_verify_ok` (PF-23c alarms on its absence); a pass that fails writes none.
// A `sample:<workspace>` chain may restart (P-571 (1): the demo reset empties it and writes `chain.restarted` at seq 1):
// for those chains only, a changed verified place re-reads the chain from seq 1 instead of being a finding. A BROKEN
// chain is read from seq 1 on every pass until it verifies whole.
// Lines are read as text (`at` to the microsecond, `detail::text`), never through a JS Date or a parsed detail.
// The checker reads in READ COMMITTED, one chain per transaction under that chain's own check lock, so two runners never
// write one chain's check row at once; the insert trigger's chain lock is not taken, so writers never wait for it.
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AlertPort } from "../../../../../ports/alert.ts";
import { emf } from "../../observability/metrics.ts";
import { log } from "../../observability/log.ts";
import { entryHash, ZERO_HASH, type CanonicalLine } from "../canonical.ts";

export const CHAIN_CHECK_QUEUE = "audit.chain_check", CHAIN_DEEP_QUEUE = "audit.chain_deep_check";
/** SA-11-6: every 30 minutes; the weekly deep check on Sunday at 03:40 UTC (the hour and day Sample). */
export const CHAIN_CHECK_CRON = "*/30 * * * *", CHAIN_DEEP_CRON = "40 3 * * 0", CHAIN_ZONE = "UTC";
/** Lines read at a time (Sample). */
export const CHAIN_PAGE = 500;
export const HEARTBEAT = "audit.chain_verify_ok";

export type Mode = "incremental" | "full";
export type Why = "hash" | "link" | "gap" | "missing" | "verified-changed" | "anchor";
export type Finding = { chainKey: string; fromSeq: string; toSeq: string; why: Why };
export type PassResult = { mode: Mode; chains: number; linesRead: number; findings: Finding[] };
export type Integrity = { chainKey: string; status: "INTACT" | "BROKEN" | "NOT_CHECKED"; lastCheckedAt: string | null; verifiedSeq: string; failingFromSeq: string | null; failingToSeq: string | null };

type Db = Pick<PrismaClient, "$transaction" | "$queryRaw">;
type Anchors = { check(k: string, full: boolean): Promise<{ ok: true; anchors: { seq: string; entryHash: string }[] } | { ok: false; fromSeq: string } | null>; chains(): Promise<string[]> };
type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
type Row = { seq: string; id: string; at: string; ws: string; firm: string | null; cas: string | null; combo: string | null; actor: string; atype: string; action: string;
  entity: string; entity_key: string | null; summary: string; correlation_id: string | null; sup: string | null; detail: string | null; prev_hash: Uint8Array; entry_hash: Uint8Array };
type CheckRow = { verified_seq: string; verified_hash: Uint8Array | null; status: "INTACT" | "BROKEN"; failing_from_seq: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A chain's key as the insert trigger makes it: a firm id, `platform`, or `sample:<workspace id>`. */
const CHAIN_KEY = /^(platform|(sample:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const LINES = Prisma.sql`select seq::text seq, id::text id, to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') at, workspace_id::text ws,
  firm_id::text firm, case_id::text cas, combination_id::text combo, actor, actor_type::text atype, action, entity, entity_key, summary, correlation_id,
  support_session_id::text sup, detail::text detail, prev_hash, entry_hash from audit_event`;
const asLine = (k: string, r: Row): CanonicalLine => ({ chainKey: k, seq: r.seq, id: r.id, at: r.at, workspaceId: r.ws, firmId: r.firm, caseId: r.cas, combinationId: r.combo,
  actor: r.actor, actorType: r.atype, action: r.action, entity: r.entity, entityKey: r.entity_key, summary: r.summary, correlationId: r.correlation_id, supportSessionId: r.sup, detail: r.detail });
const buf = (b: Uint8Array | null) => (b === null ? null : Buffer.from(b));

export class AuditChainVerifier {
  /** `anchors` (AUD-2 part 2): the write-once archive's ledger of each chain (all its anchors on the weekly pass, the
   *  newest on the 30-minute one), compared with the database on every pass; and the chains it holds. */
  constructor(private readonly d: { db: Db; alerts: AlertPort; now: () => Date; page?: number; anchors?: Anchors }) {}

  /** One pass over every chain. A chain that cannot be checked (the database does not answer; a check row whose key is
   *  no chain's) never stops the others (break M3): every other chain is still checked and any break raised, then the
   *  pass throws and writes no heartbeat, so the job fails and the heartbeat's absence alarms. */
  async pass(mode: Mode): Promise<PassResult> {
    const keys = [...new Set([...(await this.d.db.$queryRaw<{ k: string }[]>`select chain_key k from audit_event group by chain_key
      union select chain_key from aud_chain_check order by 1`).map((r) => r.k), ...(mode === "full" ? await this.d.anchors?.chains() ?? [] : [])])].sort();   // the archive's own chain list: weekly (break R1: its cost grows with the archive)
    const out: PassResult = { mode, chains: 0, linesRead: 0, findings: [] };
    let failed = 0;
    for (const k of keys) {
      if (!CHAIN_KEY.test(k)) { failed++; log().trusted("error", "audit_chain_bad_check_row", { rule: "BR-2" }); continue; }
      try {
        // The archive is read before the chain's transaction, so its requests never count against the 120 s (break R1).
        const archived = k.startsWith("sample:") ? null : await this.d.anchors?.check(k, mode === "full") ?? null;
        const r = await this.d.db.$transaction((tx) => this.chain(tx, k, mode, archived), { timeout: 120_000, maxWait: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
        out.chains++; out.linesRead += r.read;
        if (r.finding) out.findings.push(r.finding);
      } catch (e) { failed++; log().write("error", "audit_chain_check_failed", { rule: "BR-2", error: e }); }
    }
    if (failed) throw new Error(`audit chain check: ${failed} chain(s) could not be checked; no heartbeat`);
    log().trusted("info", "audit_chain_verify", emf({ Mode: mode }, { [HEARTBEAT]: { value: 1, unit: "Count" }, AuditChainBreaks: { value: out.findings.length, unit: "Count" } },
      { mode, chains: out.chains, linesRead: out.linesRead, breaks: out.findings.length }));
    return out;
  }

  private async chain(tx: Tx, k: string, mode: Mode, a: Awaited<ReturnType<Anchors["check"]>>): Promise<{ read: number; finding: Finding | null }> {
    await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended('aud_chain_check:' || ${k}, 0))`;
    const [c] = await tx.$queryRaw<CheckRow[]>`select verified_seq::text verified_seq, verified_hash, status::text status, failing_from_seq::text failing_from_seq
      from aud_chain_check where chain_key = ${k}`;
    const [{ head }] = await tx.$queryRaw<{ head: string | null }[]>`select max(seq)::text head from audit_event where chain_key = ${k}`;
    const sample = k.startsWith("sample:");
    if (head === null && sample) { await tx.$executeRaw`delete from aud_chain_check where chain_key = ${k}`; return { read: 0, finding: null }; }   // the demo reset took it
    let start = 0n, prev: Buffer = ZERO_HASH, read = 0;
    // The verified place is checked on every pass, whatever the mode and the status: a line removed or rewritten there
    // after a check stays a finding (break M2: found() never moves verified_seq or verified_hash, so the evidence is
    // kept). A BROKEN chain is then re-read from seq 1, never from its verified place, so no run turns it back to INTACT.
    if (c && !sample && BigInt(c.verified_seq) > 0n) {
      const at = BigInt(c.verified_seq), [v] = await tx.$queryRaw<{ h: Uint8Array }[]>`select entry_hash h from audit_event where chain_key = ${k} and seq = ${at}`;
      read++;
      const same = !!v && !!c.verified_hash && Buffer.from(v.h).equals(Buffer.from(c.verified_hash));
      // A rewrite: from the verified place to the head. A removal: the removed lines, from the head after it to the verified place (review m1).
      if (!same) return this.found(tx, k, c, v ? { chainKey: k, fromSeq: String(at), toSeq: String(head !== null && BigInt(head) > at ? BigInt(head) : at), why: "verified-changed" }
        : { chainKey: k, fromSeq: String((head === null ? 0n : BigInt(head)) + 1n), toSeq: String(at), why: "missing" }, read);
      if (mode === "incremental" && c.status !== "BROKEN") { start = at; prev = Buffer.from(v!.h); }
    } else if (c && sample && mode === "incremental" && c.status !== "BROKEN" && BigInt(c.verified_seq) > 0n) {
      // A sample: chain may restart (the demo reset): a changed verified place re-reads it from seq 1.
      const at = BigInt(c.verified_seq), [v] = await tx.$queryRaw<{ h: Uint8Array }[]>`select entry_hash h from audit_event where chain_key = ${k} and seq = ${at}`;
      read++;
      if (v && c.verified_hash && Buffer.from(v.h).equals(Buffer.from(c.verified_hash))) { start = at; prev = Buffer.from(v.h); }
    }
    let last = start, lastHash = start === 0n ? null : prev;
    for (;;) {
      const rows = await tx.$queryRaw<Row[]>`${LINES} where chain_key = ${k} and seq > ${last} order by audit_event.seq limit ${this.d.page ?? CHAIN_PAGE}`;
      if (!rows.length) break;
      for (const r of rows) {
        read++;
        const seq = BigInt(r.seq), due = last + 1n;
        const why: Why | null = seq !== due ? "gap" : !Buffer.from(r.prev_hash).equals(prev) ? "link" : !entryHash(prev, asLine(k, r)).equals(Buffer.from(r.entry_hash)) ? "hash" : null;
        if (why) return this.found(tx, k, c, { chainKey: k, fromSeq: String(due), toSeq: head ?? r.seq, why }, read);
        last = seq; prev = Buffer.from(r.entry_hash); lastHash = prev;
      }
    }
    if (head === null && !sample && c && BigInt(c.verified_seq) > 0n) return this.found(tx, k, c, { chainKey: k, fromSeq: "1", toSeq: c.verified_seq, why: "missing" }, read);
    // AUD-2 part 2: the archive's ledger must be whole, and each anchor compared must still be the database's line at its
    // seq. This finds a line changed after its export even when the chain after it was recomputed and the checker's own
    // record moved, exported lines removed, a chain removed whole, and an archive altered or added to.
    if (a && !a.ok) return this.found(tx, k, c, { chainKey: k, fromSeq: a.fromSeq, toSeq: head !== null && BigInt(head) > BigInt(a.fromSeq) ? head : a.fromSeq, why: "anchor" }, read);
    for (const an of a?.ok ? a.anchors : []) {
      const at = BigInt(an.seq), [l] = await tx.$queryRaw<{ h: Uint8Array }[]>`select entry_hash h from audit_event where chain_key = ${k} and seq = ${at}`;
      if (!l || Buffer.from(l.h).toString("hex") !== an.entryHash)
        return this.found(tx, k, c, { chainKey: k, fromSeq: an.seq, toSeq: String(head !== null && BigInt(head) > at ? BigInt(head) : at), why: "anchor" }, read);
    }
    await tx.$executeRaw`insert into aud_chain_check (chain_key, verified_seq, verified_hash, checked_at, status, failing_from_seq, failing_to_seq)
      values (${k}, ${last}, ${lastHash}::bytea, ${this.d.now()}, 'INTACT', null, null)
      on conflict (chain_key) do update set verified_seq = excluded.verified_seq, verified_hash = excluded.verified_hash, checked_at = excluded.checked_at,
        status = 'INTACT', failing_from_seq = null, failing_to_seq = null`;
    return { read, finding: null };
  }

  /** Marks the chain BROKEN (verified_seq stays where it was) and raises one alert, unless this break was raised before. */
  private async found(tx: Tx, k: string, c: CheckRow | undefined, f: Finding, read: number) {
    await tx.$executeRaw`insert into aud_chain_check (chain_key, verified_seq, verified_hash, checked_at, status, failing_from_seq, failing_to_seq)
      values (${k}, 0, null, ${this.d.now()}, 'BROKEN', ${BigInt(f.fromSeq)}, ${BigInt(f.toSeq)})
      on conflict (chain_key) do update set checked_at = excluded.checked_at, status = 'BROKEN', failing_from_seq = excluded.failing_from_seq, failing_to_seq = excluded.failing_to_seq`;
    // Raised without ever throwing: an alert that cannot be raised is itself a line, and the pass goes on (break M3).
    if (!(c?.status === "BROKEN" && c.failing_from_seq === f.fromSeq)) await this.raise(k, f);
    return { read, finding: f };
  }

  private async raise(k: string, f: Finding) {
    try {
      await this.d.alerts.raise("audit_chain_break", { rule: "BR-2", ...(UUID.test(k) ? { firmId: k } : {}), entity: "audit_chain", entityKey: k, fromSeq: Number(f.fromSeq), toSeq: Number(f.toSeq) });
    } catch (e) { log().write("error", "alert_not_raised", { alert: "audit_chain_break", rule: "BR-2", error: e }); }
  }

  /** The firm's own chain (AUD-4's integrity line; GET /api/platform/audit/integrity). */
  async forFirm(firmId: string): Promise<Integrity> { return (await this.read(firmId.toLowerCase()))[0]; }
  /** Every chain (our staff's GET /api/system/audit/integrity). */
  async all(): Promise<Integrity[]> { return this.read(null); }

  private async read(only: string | null): Promise<Integrity[]> {
    type R = { k: string; status: "INTACT" | "BROKEN" | null; checked: string | null; vseq: string | null; f: string | null; t: string | null };
    const rows = await this.d.db.$queryRaw<R[]>`select k.k, c.status::text status, to_char(c.checked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') checked,
        c.verified_seq::text vseq, c.failing_from_seq::text f, c.failing_to_seq::text t
      from (select ${only}::text k where ${only}::text is not null
            union select chain_key from aud_chain_check where ${only}::text is null
            union select distinct chain_key from audit_event where ${only}::text is null) k
      left join aud_chain_check c on c.chain_key = k.k order by k.k`;
    return rows.map((r) => ({ chainKey: r.k, status: r.status ?? "NOT_CHECKED", lastCheckedAt: r.checked, verifiedSeq: r.vseq ?? "0", failingFromSeq: r.f, failingToSeq: r.t }));
  }
}
