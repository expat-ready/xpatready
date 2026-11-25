// AUD-1c part 2 routes (R1.97; SA-11-6): "last checked at, intact or the failing range" for the firm's own chain and,
// for our staff, every chain. Ids and seq numbers only, never a line's content. No firm id is taken from the request:
// the firm is the session's. The demo-only check-now route runs a pass at once, so a person (or a journey) can see a
// change found without waiting 30 minutes; it is 404 outside the demo workspace.
import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Inject, Post, Req } from "@nestjs/common";
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
  constructor(@Inject(AuditChainVerifier) private readonly v: AuditChainVerifier) {}
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
