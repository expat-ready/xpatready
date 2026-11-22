// PF-15 part 1a (SA-3-5, SA-3-39, SA-3-40): storage, the one warn limit. StorageWatch measures a firm's bytes against its
// plan's STORAGE_MB and keeps its mark (platform_storage_over): first time over, the mark and, once per episode, emails to
// the team inbox (Sample; no account manager on main) and every Owner; back under, cleared. Hard 14 days after first over
// (PgEntitlements). EntitledFiles, the FilesPort uploads get, refuses a new key with 409 while hard (nothing is deleted or
// locked). A daily job (12:15 Toronto, outside 01:00-03:00 in every Canadian zone) measures every firm.
import { Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import { STORAGE_HARD_AFTER_DAYS } from "../../../../ports/entitlement.ts";
import { LocalFiles } from "../../front-office/files.ts";
import type { FilesPort, StoredFile } from "../../../../ports/files.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { asBypass, firmScope, touchEachFirm, withFirm } from "../firm-scope.ts";
import { SYSTEM_REPLY_TO } from "../identity/session/mail.ts";
import { TEAM_INBOX_SAMPLE } from "../config/settings.ts";
import { PgEntitlements, mbOf, planLimitReached } from "./limits.ts";
import { logPort } from "../observability/log.ts";

type Tx = Prisma.TransactionClient;


/** The daily measure: 12:15 Toronto is 09:15 in Vancouver and 13:45 in St. John's, outside 01:00-03:00 everywhere. */
export const STORAGE_DAILY_QUEUE = "platform.entitlements.storage_daily", STORAGE_DAILY_CRON = "15 12 * * *", STORAGE_DAILY_ZONE = "America/Toronto";
const DAY_MS = 86_400_000, MIB = 1024 * 1024;

export type StorageWatchDeps = { db: PrismaClient; files: Pick<LocalFiles, "usedBytes">; mail: MailPort | null; now: () => number; teamInbox?: string; audit?: AuditPort<Tx> };
export type Measured = { over: boolean; usedBytes: number; limitMb: number | null; mark: "none" | "set" | "kept" | "cleared"; alerted: boolean };

export class StorageWatch {
  constructor(private readonly d: StorageWatchDeps) {}

  /** Measures one firm, in the caller's firm scope (a request, or the job's withFirm). One measure per firm at a time.
   *  The mark is committed first and the emails go after it (break M1): a failed email never undoes the mark, so the
   *  14 days run; `alertedAt` is set only once every email of the episode went, and a later measure retries the rest. */
  async measure(firmId: string): Promise<Measured> {
    const id = firmScope(firmId).firmId, audit = this.d.audit ?? auditEvent;
    const out = await this.d.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-storage:${id}`}))`;
      const now = new Date(this.d.now()), usedBytes = await this.d.files.usedBytes(id);
      const plan = await new PgEntitlements(tx, this.d.now).limitOf(id, "storage_mb");
      const limitMb = plan.limit, over = limitMb !== null && usedBytes > limitMb * MIB;
      const had = await tx.platformStorageOver.findFirst({ where: firmScope(id) }), open = !!had && had.backUnderAt === null;
      const facts = { usedMb: mbOf(usedBytes), limitMb, plan: plan.planCode }, line = (action: string, summary: string, after: { firstOverAt: string | null; backUnderAt: string | null }) => audit.record(tx, { firmId: id, actor: "system:platform.entitlements", action, entity: "platform_storage_over", entityKey: id, summary, detail: facts,
        // R1.8 (QA-594): the over-the-limit mark before and after (the row's dates; usage and limit stay in detail).
        before: had ? { firstOverAt: had.firstOverAt?.toISOString() ?? null, backUnderAt: had.backUnderAt?.toISOString() ?? null } : null, after });
      if (!over) {
        if (!open) return { r: { over, usedBytes, limitMb, mark: "none" as const, alerted: false }, alert: null };
        await tx.platformStorageOver.update({ where: { firmId: id }, data: { backUnderAt: now, usedBytes: BigInt(usedBytes), limitMb, updatedAt: now } });
        await line("storage.back_under", "Storage is back under the plan's limit; uploads are allowed again.", { firstOverAt: had!.firstOverAt?.toISOString() ?? null, backUnderAt: now.toISOString() });
        return { r: { over, usedBytes, limitMb, mark: "cleared" as const, alerted: false }, alert: null };
      }
      let firstOverAt = had?.firstOverAt ?? now, alertedAt = had?.alertedAt ?? null, mark: Measured["mark"] = "kept";
      if (!open) {
        firstOverAt = now; alertedAt = null; mark = "set";
        const data = { firstOverAt: now, alertedAt: null, backUnderAt: null, usedBytes: BigInt(usedBytes), limitMb, updatedAt: now };
        if (had) await tx.platformStorageOver.update({ where: { firmId: id }, data }); else await tx.platformStorageOver.create({ data: { firmId: id, ...data } });
        await line("storage.over", `Storage went over the plan's limit; uploads stay allowed for ${STORAGE_HARD_AFTER_DAYS} days.`, { firstOverAt: now.toISOString(), backUnderAt: null });
      } else await tx.platformStorageOver.update({ where: { firmId: id }, data: { usedBytes: BigInt(usedBytes), limitMb, updatedAt: now } });
      if (alertedAt !== null || !this.d.mail) return { r: { over, usedBytes, limitMb, mark, alerted: false }, alert: null };
      const firm = await tx.platformFirm.findFirst({ where: { id }, select: { key: true } });
      const owners = await tx.platformStaff.findMany({ where: firmScope(id, { status: "ACTIVE" as const, grants: { some: { firmId: id, role: "OWNER" as const, endedAt: null } } }), select: { id: true, email: true }, orderBy: { id: "asc" } });
      return { r: { over, usedBytes, limitMb, mark, alerted: false }, alert: { firstOverAt, firmKey: firm?.key ?? id, owners, planName: plan.planName, facts } };
    }, { timeout: 30_000 });
    if (!out.alert) return out.r;
    await this.alert(id, out.alert.firstOverAt, out.alert.firmKey, out.alert.owners, out.r.usedBytes, out.r.limitMb!, out.alert.planName);
    const done = await this.d.db.$transaction(async (tx) => {
      const n = await tx.platformStorageOver.updateMany({ where: firmScope(id, { firstOverAt: out.alert!.firstOverAt, alertedAt: null }), data: { alertedAt: new Date(this.d.now()) } });
      if (n.count) await audit.record(tx, { firmId: id, actor: "system:platform.entitlements", action: "storage.alerted", entity: "platform_storage_over", entityKey: id, summary: "The team inbox and the firm's Owners were told the firm is over its storage limit.", detail: out.alert!.facts, before: { alertedAt: null }, after: { alertedAt: new Date(this.d.now()).toISOString() } });
      return n.count > 0;
    });
    return { ...out.r, alerted: done };
  }

  /** The day-one emails (SA-3-40): the team inbox, and the "Storage over limit" email to each Owner (SA-05 Appendix B.4;
   *  Sample words). One key per episode and recipient. The team inbox (ours, no firm person): transactional, as PF-18b's
   *  support inbox; each Owner's: a service email naming them (PF-19r). */
  private async alert(firmId: string, firstOverAt: Date, firmKey: string, owners: { id: string; email: string }[], usedBytes: number, limitMb: number, planName: string | null) {
    const mail = this.d.mail!, episode = firstOverAt.toISOString(), hardAt = `${new Date(firstOverAt.getTime() + STORAGE_HARD_AFTER_DAYS * DAY_MS).toISOString().slice(0, 16).replace("T", " ")} UTC`;
    await mail.send({ firmId, to: this.d.teamInbox ?? TEAM_INBOX_SAMPLE, replyTo: SYSTEM_REPLY_TO, class: "TRANSACTIONAL", templateKey: "platform.storage_over_team", idempotencyKey: `storage-over:${episode}:team`,
      subject: `Firm over its storage limit: ${firmKey}`,
      text: `Firm ${firmKey} uses ${mbOf(usedBytes)} MB of storage; its plan (${planName ?? "none"}) allows ${limitMb} MB. From ${hardAt} its new uploads are refused until it is back under or on a larger plan (SA-3-40). Nothing is deleted.` });
    for (const o of owners) await mail.send({ firmId, to: o.email, replyTo: SYSTEM_REPLY_TO, class: "SERVICE", person: { kind: "STAFF", id: o.id }, templateKey: "platform.storage_over_limit", idempotencyKey: `storage-over:${episode}:owner:${o.id}`,
      subject: "Storage over limit",
      text: `Your firm's documents now take ${mbOf(usedBytes)} MB; your plan (${planName ?? "none"}) allows ${limitMb} MB.\n\nUploads keep working until ${hardAt}. From then, new uploads are refused until your firm is back under the limit or on a plan with a larger limit. Nothing is deleted, and every document you have keeps working.\n\nTo stay under, remove documents you no longer need, or change the plan in Settings, Billing.` });
  }

  /** The daily job: every firm that is not closed, each in its own firm scope; one firm's failure never stops the rest. */
  async daily(): Promise<{ measured: number; failed: number }> {
    // PF-12b: the list reads every firm's row, so each firm listed gets its platform.bypass line (its own transaction)
    // before it is measured; a firm whose line cannot be written is not measured and counts as failed (P-607).
    const { firms, unrecorded } = await asBypass(`job:${STORAGE_DAILY_QUEUE}`, async () => {
      const all = await this.d.db.platformFirm.findMany({ where: { status: { notIn: ["DELETED" as const, "ABANDONED" as const] } }, select: { id: true }, orderBy: { id: "asc" } });
      const { failed: lost } = await touchEachFirm(this.d.db, all.map((f) => f.id));
      return { firms: all.filter((f) => !lost.has(f.id.toLowerCase())), unrecorded: lost.size };
    });
    let measured = 0, failed = unrecorded;
    for (const f of firms) {
      try { await withFirm(f.id, () => this.measure(f.id)); measured++; } catch (e) { failed++; logPort.error("storage_daily_failed", e, { firmId: f.id }); }
    }
    return { measured, failed };
  }

  /** Registers the daily job (before the runner starts). */
  async register(jobs: JobPort) {
    await jobs.handle(STORAGE_DAILY_QUEUE, async () => { await this.daily(); });
    await jobs.recurring(STORAGE_DAILY_QUEUE, STORAGE_DAILY_CRON, STORAGE_DAILY_ZONE);
  }
}

/** The FilesPort the modules get (the retainer uploads, and every later upload through this binding). PF-F1b: it wraps
 *  the store the app binds (PLATFORM_FILES: LocalFiles or S3Files, api/src/platform/files/choose.ts); a folder (or
 *  nothing) is FO-5's LocalFiles in it, as before. */
export class EntitledFiles implements FilesPort {
  readonly store: FilesPort;
  constructor(private readonly db: PrismaClient, private readonly now: () => number, private readonly watch: StorageWatch | null, store?: string | FilesPort) {
    this.store = typeof store === "object" ? store : new LocalFiles(store);
  }

  /** The key was ever written for the firm (live or retired): both stores answer it (LocalFiles' own check, S3Files'
   *  HEAD that also sees a tombstone); a store without one falls back to `exists`. */
  protected async known(firmId: string, key: string): Promise<boolean> {
    const k = (this.store as { known?: (f: string, k: string) => boolean | Promise<boolean> }).known;
    return typeof k === "function" ? !!(await k.call(this.store, firmId, key)) : this.store.exists(firmId, key);
  }
  get(firmId: string, key: string): Promise<StoredFile | null> { return this.store.get(firmId, key); }
  exists(firmId: string, key: string): Promise<boolean> { return this.store.exists(firmId, key); }
  delete(firmId: string, key: string): Promise<{ deleted: boolean }> { return this.store.delete(firmId, key); }
  usedBytes(firmId: string): Promise<number> { return this.store.usedBytes(firmId); }

  async put(firmId: string, key: string, bytes: Uint8Array, contentType: string): Promise<{ key: string; sha256: string }> {
    if (!await this.known(firmId, key)) {   // a retry of a stored key always goes through; a retired one gets FileKeyTaken (break m4)
      const used = await this.usedBytes(firmId);
      const r = await new PgEntitlements(this.db, this.now).check(firmId, "storage_mb", mbOf(used));
      if (!r.allowed) planLimitReached(r, `Your firm has been over its storage limit (${r.limit} MB; ${r.used} MB used) for ${STORAGE_HARD_AFTER_DAYS} days or more, so new uploads are refused. Nothing was saved. Every existing document keeps working; remove documents you no longer need or change the plan.`);
    }
    const out = await this.store.put(firmId, key, bytes, contentType);
    if (this.watch) await this.watch.measure(firmId).catch((e) => logPort.error("storage_measure_failed", e, { firmId }));   // the daily job measures again
    return out;
  }
}
Injectable()(EntitledFiles);
