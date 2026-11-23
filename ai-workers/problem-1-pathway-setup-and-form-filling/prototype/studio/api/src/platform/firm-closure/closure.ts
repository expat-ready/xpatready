// PF-11c part 1 (map rows 105 and 22; R1.105; SA-2-7, SA-2-21, SA-11 BR-1, BR-7, BR-8; contracts §7 "Firm exit"): day 90,
// the firm is closed, archived first, never deleted early. A daily sweep on PF-14's runner finds firms on PAYMENT_HOLD
// whose 90-day clock (PF-5's exitClock) has run out and, per firm, in its own firm scope:
//   1. a legal hold on the firm's data (LegalHoldPort, ALL_FIRM_DATA) stops it: one `firm.closure_held` line a day, and
//      the close runs on the first sweep after the hold is released (SA-2-21 "unless under legal hold");
//   2. every departure notice of the clock (EXIT_NOTICE_DAYS, PF-5) must have been sent, else it waits and raises
//      firm_closure_blocked (AlertPort): a person looks;
//   3. PF-11's full export must be in the write-once archive (FullExportPort; none is wired until PF-11 exists), then the
//      archive copy comes first: the firm's record and every activity-log line of the firm, as JSON Lines, written to
//      the write-once archive (AuditArchivePort, `firms/<firmId>/closure-<holdSeq>-<run time>-<random>.jsonl`, a fresh key each run) kept for the longest floor of
//      AUD-5's table (7 years), then read back and compared byte for byte; at the close the copy must still hold every line of the firm. No archive wired, a failed write or a copy that
//      does not read back → firm_closure_blocked, and the firm stays as it is;
//   4. only then, in one transaction (the firm's row locked, the clock and the hold checked again): the firm → DELETED
//      (closed), every staff session ended (a revocation per staff member), sign-in refused (identity/service.ts), and one
//      `firm.closed` audit line naming the archive key, its sha256 and its keep-until date.
// Nothing is deleted in this part: no live row and no audit line (BR-1, BR-8). Removing live data module by module
// (FirmPurgePort, the deletion record plat_firm_deletion, the backup-expiry date) is PF-11c part 2; the client portal's
// sessions and PF-27's closed-lock clock come with it. A run twice the same day does nothing the second time.
// Legal readings: Unconfirmed: no counsel.
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AlertPort } from "../../../../ports/alert.ts";
import { sha256Of, type AuditArchivePort } from "../../../../ports/audit-archive.ts";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import { KEEP_PERIODS } from "../../../../ports/keep-period.ts";
import type { LegalHoldPort } from "../../../../ports/legal-hold.ts";
import { EXIT_NOTICE_DAYS, exitClock, type ExitClock } from "../billing/exit-clock.ts";
import { asBypass, firmScope, touchEachFirm, withFirm } from "../firm-scope.ts";
import { logPort } from "../observability/log.ts";
import { CLOSURE_BYPASS } from "./closure.bypass.ts";

type Tx = Prisma.TransactionClient;
/** The job queue (its bypass use is "job:" + this name, closure.bypass.ts). */
export const CLOSURE_QUEUE = "platform.firm.closure";
/** Daily at 07:30 Toronto: outside 01:00-03:00 in every Canadian zone, after the night's notices are due. */
export const CLOSURE_CRON = "30 7 * * *", CLOSURE_ZONE = "America/Toronto";
export const CLOSURE_ACTOR = "system:platform.firm.closure";
export const CLOSED_ACTION = "firm.closed", HELD_ACTION = "firm.closure_held";
/** The revocation reason every staff session of a closed firm carries. */
export const FIRM_CLOSED_REASON = "firm-closed";
/** The close transaction may wait behind billing's lock, which a Stripe webhook holds for up to 30 s (webhook.ts); 60 s, not Prisma's 5 s (review n4). */
export const CLOSE_TX_TIMEOUT_MS = 60_000;
/** The archive copy's keep period: the longest FLOOR in AUD-5's table (the activity log's 7 years, SA-11-14). */
export const ARCHIVE_YEARS = Math.max(...KEEP_PERIODS.filter((r) => r.kind === "FLOOR" && typeof r.years === "number").map((r) => r.years as number));
/** One key per run (break M1): the firm, the hold's event seq, the run's time and a random part (two runs in one millisecond). */
export const archiveKeyOf = (firmId: string, holdSeq: string, at: Date, run: string = randomUUID().slice(0, 8)) => `firms/${firmId.toLowerCase()}/closure-${holdSeq}-${at.toISOString().replace(/[-:.]/g, "").toLowerCase()}-${run}.jsonl`;
export const addYears = (d: Date, years: number) => { const x = new Date(d.getTime()); x.setUTCFullYear(x.getUTCFullYear() + years); return x; };

/** PF-11's full export of the firm (review M5; row step (2)): the archive key of its `firms/<firmId>/export-<date>.zip`, written
 *  to the same write-once archive and offered for download, or null when it is not there yet. PF-11 provides it; until then
 *  nothing is wired and no firm is closed. */
export type FullExportPort = { archivedExport(firmId: string): Promise<{ key: string } | null> };
export type ClosureDeps = { db: PrismaClient; audit: AuditPort<Tx>; archive: AuditArchivePort | null; holds: LegalHoldPort<Tx> | null; fullExport: FullExportPort | null; alerts: () => AlertPort; now: () => Date };
export type ClosureResult =
  | { state: "not_due" | "held" | "changed" }
  | { state: "blocked"; rule: string }
  | { state: "closed"; archiveKey: string; sha256: string; staffSessionsEnded: number };

const ALL: [{ kind: "ALL_FIRM_DATA" }] = [{ kind: "ALL_FIRM_DATA" }];
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
const day = (d: Date) => d.toISOString().slice(0, 10);

export class FirmClosure {
  constructor(private readonly d: ClosureDeps) {}

  /** Closes one firm if its day 90 has come, in the caller's firm scope (the sweep's withFirm, or a test). */
  async runFirm(firmId: string): Promise<ClosureResult> {
    const id = firmScope(firmId).firmId, now = this.d.now();
    const holds = this.d.holds;
    const first = await this.d.db.$transaction(async (tx) => {
      const clock = await exitClock(tx, id);
      if (!clock || now.getTime() < clock.deletionDate.getTime()) return { state: "not_due" as const };
      if (!holds) return { state: "blocked" as const, rule: "PF-11c.no_hold_check" };
      if ((await holds.isHeld(tx, id, ALL)).held) { await this.heldLine(tx, id, clock, now); return { state: "held" as const }; }
      return { state: "due" as const, clock };
    });
    if (first.state === "blocked") return this.blocked(id, first.rule);
    if (first.state !== "due") return first;
    const clock = first.clock;
    const missing = EXIT_NOTICE_DAYS.filter((n) => !clock.noticesSent.some((s) => s.day === n));
    if (missing.length) return this.blocked(id, "PF-11c.notices_missing");
    const archive = this.d.archive;
    if (!archive) return this.blocked(id, "PF-11c.no_archive");
    // Row step (2): the firm's full export (PF-11) is in the write-once archive before anything else (review M5).
    if (!this.d.fullExport) return this.blocked(id, "PF-11c.no_full_export");
    const exp = await this.d.fullExport.archivedExport(id).catch(() => null);
    if (!exp || !exp.key.startsWith(`firms/${id}/export-`) || !(await archive.get(exp.key).catch(() => null))) return this.blocked(id, "PF-11c.no_full_export");

    // The archive copy first (rule 3; break M1, M2): a fresh copy every run under its own key (never one left by an earlier
    // run), read back and compared byte for byte with what was written, kept until exactly the date asked for.
    const until = addYears(now, ARCHIVE_YEARS);
    const key = archiveKeyOf(id, clock.holdSeq, now);
    let bundle: { bytes: Buffer; ids: string[] };
    try {
      bundle = await this.bundle(id, clock, now);
      const { sha256 } = await archive.put(key, bundle.bytes, until);
      if (sha256 !== sha256Of(bundle.bytes)) throw new Error("archive: the store's sha256 is not the copy's");
    } catch (e) { logPort.error("firm_closure_archive_failed", e, { firmId: id }); return this.blocked(id, "PF-11c.archive_write_failed"); }
    const copy = await archive.get(key).catch(() => null);
    if (!copy || !copy.bytes.equals(bundle.bytes) || copy.sha256 !== sha256Of(bundle.bytes) || copy.retainUntil.getTime() < until.getTime())
      return this.blocked(id, "PF-11c.archive_unreadable");

    try {
      return await this.d.db.$transaction(async (tx): Promise<ClosureResult> => {
      // Billing's own lock first (review M3: the order webhook.ts takes it, then the firm), so a payment and the close
      // never interleave: whichever comes second sees the other's status.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`plat_billing:${id}`}))`;
      await tx.$queryRaw`select id from platform_firm where id = ${id}::uuid for update`;
      const again = await exitClock(tx, id);
      if (!again || again.holdSeq !== clock.holdSeq) return { state: "changed" };
      if ((await holds!.isHeld(tx, id, ALL)).held) { await this.heldLine(tx, id, clock, now); return { state: "held" }; }
      // The copy must still hold every activity-log line of the firm (break M1): a line written since → the next run
      // writes a new copy. Audit lines are never changed or deleted (AUD-1a), so the same ids mean the same lines.
      const live = await tx.auditEvent.findMany({ where: { firmId: id }, select: { id: true } });
      const inCopy = new Set(bundle.ids);
      if (live.length !== inCopy.size || live.some((l) => !inCopy.has(l.id))) return { state: "changed" };
      await tx.platformFirm.update({ where: { id }, data: { status: "DELETED" } });
      const staff = await tx.platformStaff.findMany({ where: firmScope(id), select: { id: true }, orderBy: { id: "asc" } });
      if (staff.length) await tx.platformSessionRevocation.createMany({ data: staff.map((s) => ({ firmId: id, staffId: s.id, revokedAt: now, reason: FIRM_CLOSED_REASON })) });
      const keepUntil = copy.retainUntil.toISOString();
      await this.d.audit.record(tx, { firmId: id, actor: CLOSURE_ACTOR, action: CLOSED_ACTION, entity: "platform_firm", entityKey: id,
        summary: `The firm's account was closed after 90 days on payment hold. Its archive copy was written first and is kept until ${keepUntil.slice(0, 10)}; nothing was deleted.`,
        detail: { holdSeq: clock.holdSeq, deletionDate: clock.deletionDate.toISOString(), archiveKey: key, exportKey: exp.key, sha256: copy.sha256, keepUntil, staffSessionsEnded: staff.length, closedAt: now.toISOString() },
        before: { status: "PAYMENT_HOLD" }, after: { status: "DELETED", archiveKey: key } });
      return { state: "closed", archiveKey: key, sha256: copy.sha256, staffSessionsEnded: staff.length };
      }, { timeout: CLOSE_TX_TIMEOUT_MS, maxWait: CLOSE_TX_TIMEOUT_MS });
    } catch (e) {   // break m4: a close that failed after its copy was written is a person's to look at
      logPort.error("firm_closure_close_failed", e, { firmId: id });
      return this.blocked(id, "PF-11c.close_failed");
    }
  }

  /** The archive copy: line 1 the firm's record and the clock, then every activity-log line of the firm, oldest first. */
  private async bundle(id: string, clock: ExitClock, now: Date): Promise<{ bytes: Buffer; ids: string[] }> {
    return this.d.db.$transaction(async (tx) => {
      const firm = await tx.platformFirm.findFirst({ where: { id } });
      const lines = await tx.auditEvent.findMany({ where: { firmId: id }, orderBy: [{ at: "asc" }, { id: "asc" }] });
      const head = { kind: "firm-closure-archive", firmId: id, holdSeq: clock.holdSeq, deletionDate: clock.deletionDate.toISOString(), writtenAt: now.toISOString(), auditLines: lines.length, firm };
      return { bytes: Buffer.from([json(head), ...lines.map((l) => json({ kind: "audit_event", ...l }))].join("\n") + "\n", "utf8"), ids: lines.map((l) => l.id) };
    });
  }

  private async heldLine(tx: Tx, id: string, clock: ExitClock, now: Date) {
    const entityKey = `firm-closure:${id}:${clock.holdSeq}:held:${day(now)}`;
    if (await tx.auditEvent.findFirst({ where: { firmId: id, action: HELD_ACTION, entityKey }, select: { id: true } })) return;
    await this.d.audit.record(tx, { firmId: id, actor: CLOSURE_ACTOR, action: HELD_ACTION, entity: "platform_firm", entityKey,
      summary: "The firm's 90 days have run out, but a legal hold is on its data: the account is not closed while the hold stands.",
      detail: { holdSeq: clock.holdSeq, deletionDate: clock.deletionDate.toISOString(), on: day(now) }, before: null, after: { closureHeld: true } });
  }

  private async blocked(id: string, rule: string): Promise<ClosureResult> {
    logPort.error("firm_closure_blocked", new Error(rule), { firmId: id });
    await this.d.alerts().raise("firm_closure_blocked", { rule, firmId: id, entity: "platform_firm", entityKey: id }).catch((e) => logPort.error("firm_closure_alert_failed", e, { firmId: id }));
    return { state: "blocked", rule };
  }

  /** The sweep: every firm on payment hold, each in its own firm scope; one firm's failure never stops the rest. */
  async sweep(): Promise<{ closed: number; held: number; blocked: number; failed: number }> {
    const { firms, unrecorded } = await asBypass(CLOSURE_BYPASS, async () => {
      const all = await this.d.db.platformFirm.findMany({ where: { status: "PAYMENT_HOLD" as const }, select: { id: true }, orderBy: { id: "asc" } });
      const { failed: lost } = await touchEachFirm(this.d.db, all.map((f) => f.id));
      return { firms: all.filter((f) => !lost.has(f.id.toLowerCase())), unrecorded: lost.size };
    });
    const out = { closed: 0, held: 0, blocked: 0, failed: unrecorded };
    for (const f of firms) {
      try {
        const r = await withFirm(f.id, () => this.runFirm(f.id));
        if (r.state === "closed") out.closed++; else if (r.state === "held") out.held++; else if (r.state === "blocked") out.blocked++;
      } catch (e) { out.failed++; logPort.error("firm_closure_failed", e, { firmId: f.id }); }
    }
    return out;
  }

  /** Registers the sweep on PF-14's runner (before it starts). */
  async register(jobs: JobPort) {
    await jobs.handle(CLOSURE_QUEUE, async () => { await this.sweep(); });
    await jobs.recurring(CLOSURE_QUEUE, CLOSURE_CRON, CLOSURE_ZONE);
  }
}
