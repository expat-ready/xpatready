// PF-15 part 1a (SA-3-5, SA-3-39, SA-3-40): storage, the one warn limit. StorageWatch measures a firm's stored bytes
// (FilesPort.usedBytes) against its plan's STORAGE_MB limit and keeps the firm's mark (platform_storage_over): the first
// time over, the mark is set and, once per episode, the shared team inbox (Sample address; there is no account manager
// on main) and every Owner get an email; back under, the mark is cleared. From 14 days after the first time over,
// PgEntitlements answers storage as hard for that firm. EntitledFiles is the one enforcement point for uploads: the
// FilesPort the modules get, which refuses a new key with 409 PLAN_LIMIT_REACHED while the firm's storage is hard, and
// lets a retry of a stored key, get and exists always through (nothing is deleted or locked). A daily job (outside
// 01:00-03:00 in every Canadian zone) measures every firm, so the mark is set, turns hard and clears without an upload.
import { Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import type { JobPort } from "../../../../ports/jobs.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import { STORAGE_HARD_AFTER_DAYS } from "../../../../ports/entitlement.ts";
import { LocalFiles } from "../../front-office/files.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { asBypass, firmScope, withFirm } from "../firm-scope.ts";
import { SYSTEM_REPLY_TO } from "../identity/session/mail.ts";
import { TEAM_INBOX_SAMPLE } from "../config/settings.ts";
import { PgEntitlements, mbOf, planLimitReached } from "./limits.ts";

type Tx = Prisma.TransactionClient;

/** The daily measure: 12:15 Toronto is 09:15 in Vancouver and 13:45 in St. John's, outside 01:00-03:00 everywhere. */
export const STORAGE_DAILY_QUEUE = "platform.entitlements.storage_daily", STORAGE_DAILY_CRON = "15 12 * * *", STORAGE_DAILY_ZONE = "America/Toronto";
const DAY_MS = 86_400_000, MIB = 1024 * 1024;

export type StorageWatchDeps = { db: PrismaClient; files: Pick<LocalFiles, "usedBytes">; mail: MailPort | null; now: () => number; teamInbox?: string; audit?: AuditPort<Tx> };
export type Measured = { over: boolean; usedBytes: number; limitMb: number | null; mark: "none" | "set" | "kept" | "cleared"; alerted: boolean };

export class StorageWatch {
  constructor(private readonly d: StorageWatchDeps) {}

  /** Measures one firm, in the caller's firm scope (a request, or the job's withFirm). One measure per firm at a time. */
  async measure(firmId: string): Promise<Measured> {
    const id = firmScope(firmId).firmId, audit = this.d.audit ?? auditEvent;
    return this.d.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`platform-storage:${id}`}))`;
      const now = new Date(this.d.now());
      const usedBytes = await this.d.files.usedBytes(id);
      const plan = await new PgEntitlements(tx, this.d.now).limitOf(id, "storage_mb");
      const limitMb = plan.limit, over = limitMb !== null && usedBytes > limitMb * MIB;
      const had = await tx.platformStorageOver.findFirst({ where: firmScope(id) });
      const open = !!had && had.backUnderAt === null;
      const facts = { usedMb: mbOf(usedBytes), limitMb, plan: plan.planCode };
      if (!over) {
        if (!open) return { over, usedBytes, limitMb, mark: "none" as const, alerted: false };
        await tx.platformStorageOver.update({ where: { firmId: id }, data: { backUnderAt: now, usedBytes: BigInt(usedBytes), limitMb, updatedAt: now } });
        await audit.record(tx, { firmId: id, actor: "system:platform.entitlements", action: "storage.back_under", entity: "platform_storage_over", entityKey: id, summary: "Storage is back under the plan's limit; uploads are allowed again.", detail: facts });
        return { over, usedBytes, limitMb, mark: "cleared" as const, alerted: false };
      }
      let firstOverAt = had?.firstOverAt ?? now, alertedAt = had?.alertedAt ?? null, mark: Measured["mark"] = "kept";
      if (!open) {
        firstOverAt = now; alertedAt = null; mark = "set";
        const data = { firstOverAt: now, alertedAt: null, backUnderAt: null, usedBytes: BigInt(usedBytes), limitMb, updatedAt: now };
        if (had) await tx.platformStorageOver.update({ where: { firmId: id }, data }); else await tx.platformStorageOver.create({ data: { firmId: id, ...data } });
        await audit.record(tx, { firmId: id, actor: "system:platform.entitlements", action: "storage.over", entity: "platform_storage_over", entityKey: id, summary: `Storage went over the plan's limit; uploads stay allowed for ${STORAGE_HARD_AFTER_DAYS} days.`, detail: facts });
      } else await tx.platformStorageOver.update({ where: { firmId: id }, data: { usedBytes: BigInt(usedBytes), limitMb, updatedAt: now } });
      let alerted = false;
      if (alertedAt === null && this.d.mail) {
        await this.alert(tx, id, firstOverAt, usedBytes, limitMb!, plan.planName);
        await tx.platformStorageOver.update({ where: { firmId: id }, data: { alertedAt: now } });
        await audit.record(tx, { firmId: id, actor: "system:platform.entitlements", action: "storage.alerted", entity: "platform_storage_over", entityKey: id, summary: "The team inbox and the firm's Owners were told the firm is over its storage limit.", detail: facts });
        alerted = true;
      }
      return { over, usedBytes, limitMb, mark, alerted };
    }, { timeout: 30_000 });
  }

  /** The day-one emails (SA-3-40): the team inbox, and the "Storage over limit" email to each Owner (SA-05 Appendix B.4;
   *  Sample words: the template has no text on main). One key per episode and recipient, so a retry sends once. */
  private async alert(tx: Tx, firmId: string, firstOverAt: Date, usedBytes: number, limitMb: number, planName: string | null) {
    const mail = this.d.mail!, episode = firstOverAt.toISOString(), hardOn = new Date(firstOverAt.getTime() + STORAGE_HARD_AFTER_DAYS * DAY_MS).toISOString().slice(0, 10);
    const firm = await tx.platformFirm.findFirst({ where: { id: firmId }, select: { key: true } });
    await mail.send({ firmId, to: this.d.teamInbox ?? TEAM_INBOX_SAMPLE, replyTo: SYSTEM_REPLY_TO, class: "SERVICE", templateKey: "platform.storage_over_team", idempotencyKey: `storage-over:${episode}:team`,
      subject: `Firm over its storage limit: ${firm?.key ?? firmId}`,
      text: `Firm ${firm?.key ?? firmId} uses ${mbOf(usedBytes)} MB of storage; its plan (${planName ?? "none"}) allows ${limitMb} MB. Uploads stay allowed until ${hardOn}; from then new uploads are refused until it is back under or on a larger plan (SA-3-40). Nothing is deleted.` });
    const owners = await tx.platformStaff.findMany({ where: firmScope(firmId, { status: "ACTIVE" as const, grants: { some: { firmId, role: "OWNER" as const, endedAt: null } } }), select: { id: true, email: true }, orderBy: { id: "asc" } });
    for (const o of owners) await mail.send({ firmId, to: o.email, replyTo: SYSTEM_REPLY_TO, class: "SERVICE", templateKey: "platform.storage_over_limit", idempotencyKey: `storage-over:${episode}:owner:${o.id}`,
      subject: "Storage over limit",
      text: `Your firm's documents now take ${mbOf(usedBytes)} MB; your plan (${planName ?? "none"}) allows ${limitMb} MB.\n\nUploads keep working until ${hardOn}. After that, new uploads are refused until your firm is back under the limit or on a plan with a larger limit. Nothing is deleted, and every document you have keeps working.\n\nTo stay under, remove documents you no longer need, or change the plan in Settings, Billing.` });
  }

  /** The daily job: every firm that is not closed, each in its own firm scope; one firm's failure never stops the rest. */
  async daily(): Promise<{ measured: number; failed: number }> {
    const firms = await asBypass(`job:${STORAGE_DAILY_QUEUE}`, () => this.d.db.platformFirm.findMany({ where: { status: { notIn: ["DELETED" as const, "ABANDONED" as const] } }, select: { id: true }, orderBy: { id: "asc" } }));
    let measured = 0, failed = 0;
    for (const f of firms) {
      try { await withFirm(f.id, () => this.measure(f.id)); measured++; } catch (e) { failed++; console.warn(`storage daily: firm ${f.id}: ${String((e as Error)?.message ?? e).slice(0, 200)}`); }
    }
    return { measured, failed };
  }

  /** Registers the daily job (before the runner starts). */
  async register(jobs: JobPort) {
    await jobs.handle(STORAGE_DAILY_QUEUE, async () => { await this.daily(); });
    await jobs.recurring(STORAGE_DAILY_QUEUE, STORAGE_DAILY_CRON, STORAGE_DAILY_ZONE);
  }
}

/** The FilesPort the modules get (the retainer uploads, and every later upload through this binding). */
export class EntitledFiles extends LocalFiles {
  constructor(private readonly db: PrismaClient, private readonly now: () => number, private readonly watch: StorageWatch | null, root?: string) { super(root); }

  override async put(firmId: string, key: string, bytes: Uint8Array, contentType: string): Promise<{ key: string; sha256: string }> {
    if (!(await this.exists(firmId, key))) {   // a retry of a stored key always goes through
      const used = await this.usedBytes(firmId);
      const r = await new PgEntitlements(this.db, this.now).check(firmId, "storage_mb", mbOf(used));
      if (!r.allowed) planLimitReached(r, `Your firm has been over its storage limit (${r.limit} MB; ${r.used} MB used) for ${STORAGE_HARD_AFTER_DAYS} days or more, so new uploads are refused. Nothing was saved. Every existing document keeps working; remove documents you no longer need or change the plan.`);
    }
    const out = await super.put(firmId, key, bytes, contentType);
    if (this.watch) await this.watch.measure(firmId).catch((e) => console.warn(`storage measure after upload: ${String((e as Error)?.message ?? e).slice(0, 200)}`));   // the daily job measures again
    return out;
  }
}
Injectable()(EntitledFiles);
