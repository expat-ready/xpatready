// AUD-1c part 2 routes (R1.97; SA-11-6): "last checked at, intact or the failing range" for the firm's own chain and,
// for our staff, every chain. Ids and seq numbers only, never a line's content. No firm id is taken from the request:
// the firm is the session's. The demo-only check-now route runs a pass at once, so a person (or a journey) can see a
// change found without waiting 30 minutes; it is 404 outside the demo workspace.
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post, Query, Req } from "@nestjs/common";
import { ArchiveKeyExists, ArchiveRetained } from "../../../../../ports/audit-archive.ts";
import { AuditChainExport } from "../write-once/daily-export.ts";
import { actorOf, fail, isDemoWorkspace, need } from "../../../core.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../identity/keys.ts";
import { SystemKeys } from "../../system-identity/keys.ts";
import { ReadsAcrossFirms } from "../access/declare.ts";
import { AUDIT_LOG_LIST } from "../access/report.ts";
import { AUDIT_READ } from "../firm-read/routes.ts";
import { AuditChainVerifier } from "./verify.ts";

@Controller("api/platform/audit")
export class FirmAuditIntegrityController {
  constructor(@Inject(AuditChainVerifier) private readonly v: AuditChainVerifier) {}
  @Get("integrity") @PermissionKeys(AUDIT_READ)
  async get(@Req() r: { platform?: StaffContext }) {
    const i = await this.v.forFirm(staffOf(r).firmId);
    return { status: i.status, lastCheckedAt: i.lastCheckedAt, verifiedSeq: i.verifiedSeq, failingFromSeq: i.failingFromSeq, failingToSeq: i.failingToSeq };
  }
}

@Controller("api/system/audit")
export class SystemAuditIntegrityController {
  constructor(@Inject(AuditChainVerifier) private readonly v: AuditChainVerifier) {}
  @Get("integrity") @SystemKeys(AUDIT_LOG_LIST) @ReadsAcrossFirms("every firm's audit chain status, ids and seq numbers only")
  async all() { return { chains: await this.v.all() }; }
}

@Controller("api/demo/audit-chain")
export class DemoAuditChainController {
  constructor(@Inject(AuditChainVerifier) private readonly v: AuditChainVerifier, @Inject(AuditChainExport) private readonly x: AuditChainExport) {}
  private demo(a: string | undefined) { if (!isDemoWorkspace()) fail("Not found.", HttpStatus.NOT_FOUND); need(actorOf(a), "author"); }

  /** Demo only (AUD-2 part 2): today's export now, as the daily job. */
  @Post("export") @HttpCode(200)
  async export(@Headers("x-actor") a: string | undefined) { this.demo(a); return this.x.run(); }

  /** Demo only: the archive's keys under a prefix, each with its digest and keep-until date (never its bytes). */
  @Get("archive")
  async archive(@Headers("x-actor") a: string | undefined, @Query("prefix") prefix: string | undefined) {
    this.demo(a);
    const store = this.x.store(), keys = await store.list(prefix ?? "audit/"), objects = [];
    for (const k of keys.slice(0, 200)) { const o = await store.get(k); if (o) objects.push({ key: k, bytes: o.bytes.byteLength, sha256: o.sha256, retainUntil: o.retainUntil.toISOString() }); }
    return { objects };
  }

  /** Demo only: tries to replace or delete one archived object, to show the store refuses both (409 and 423). */
  @Post("archive/tamper") @HttpCode(200)
  async tamper(@Headers("x-actor") a: string | undefined, @Body() b: { key?: unknown; how?: unknown } | null) {
    this.demo(a);
    const key = typeof b?.key === "string" ? b.key : fail("Name the key."), store = this.x.store();
    try {
      if (b?.how === "replace") await store.put(key, Buffer.from("replaced (Sample)"), new Date(Date.now() + 86_400_000));
      else if (b?.how === "delete") await store.remove(key);
      else fail('how is "replace" or "delete".');
    } catch (e) {
      if (e instanceof ArchiveKeyExists) fail("Refused: an archived object is written once and never replaced.", HttpStatus.CONFLICT);
      if (e instanceof ArchiveRetained) fail(`Refused: kept until ${e.retainUntil.toISOString()}; nothing is deleted inside its keep period.`, HttpStatus.LOCKED);
      throw e;
    }
    return { done: true };
  }
  /** Demo only: one pass now, as the 30-minute job (or the weekly one with {"mode":"full"}); the author duty. */
  @Post("check") @HttpCode(200)
  async check(@Headers("x-actor") a: string | undefined, @Body() b: { mode?: unknown } | null) {
    if (!isDemoWorkspace()) fail("Not found.", HttpStatus.NOT_FOUND);
    need(actorOf(a), "author");
    const mode = b?.mode === undefined || b.mode === "incremental" ? "incremental" : b.mode === "full" ? "full" : fail('mode is "incremental" or "full".');
    const r = await this.v.pass(mode);
    return { mode: r.mode, chains: r.chains, linesRead: r.linesRead, breaks: r.findings };
  }
}
