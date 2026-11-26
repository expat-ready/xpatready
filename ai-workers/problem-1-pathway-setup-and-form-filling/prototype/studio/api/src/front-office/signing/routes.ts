// FO-6 part 3: the staff read of a retainer's signing state. Key agent/retainer:show with the prospect's own-or-all rule,
// as the retainer read (FO-5's `Retainers.read` answers 404 for a retainer the person may not see, another firm's too).
// Part 4c: the firm signer's link (./firm-link.ts), the same key and rule; the path id (404) and the strict body (422)
// are read before any lookup (PF-28; plan challenge M1).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { Db } from "../../core.ts";
import { OwnOrAll, PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { idParam, parseInput, strict } from "../../platform/http/input.ts";
import { Retainers } from "../retainers/service.ts";
import { CONSENT_TEXT_VERSION } from "./door.ts";
import { firmSigningLink } from "./firm-link.ts";
import { Signing } from "./service.ts";

/** The firm signer consents to sign electronically with the version of the words they were shown (AG-5-20, AG-5-25); a
 *  version that is not the current wording is a field error (422) before any lookup, as the plan says (review round 1 m2). */
export const FirmSigningLinkBody = strict({ consent: z.literal(true), consentTextVersion: z.literal(CONSENT_TEXT_VERSION, { error: "The consent wording changed. Open the agreement again to read it." }) });

@Controller("api/front-office")
export class SigningController {
  constructor(@Inject(Signing) private readonly signing: Signing, @Inject(Retainers) private readonly retainers: Retainers, @Inject(Db) private readonly db: Db) {}

  /** Status, "1 of 2 signed", each signer's side, name and moments, the evidence's hashes; no token, code or provider id. */
  @Get("retainers/:id/signing") @PermissionKeys("agent/retainer:show") @OwnOrAll("agent/prospect")
  async state(@Req() r: { platform?: StaffContext }, @Param("id") id: string) {
    const ctx = staffOf(r), rid = idParam(id, "retainer");
    await this.retainers.read(ctx, rid);   // visibility (404 otherwise)
    return this.signing.retainerState(ctx.firmId, rid);
  }

  /** Part 4c: the representative's embedded link to sign last, with their consent recorded once. Answers { url, expiresAt }. */
  @Post("retainers/:id/firm-signing-link") @HttpCode(200) @PermissionKeys("agent/retainer:show") @OwnOrAll("agent/prospect")
  async firmLink(@Req() r: { platform?: StaffContext }, @Param("id") id: string, @Body() body: unknown) {
    const ctx = staffOf(r), rid = idParam(id, "retainer"), b = parseInput(FirmSigningLinkBody, body);
    const ret = await this.retainers.read(ctx, rid);   // visibility (404 otherwise)
    return firmSigningLink(this.db, ctx, { id: ret.id, status: ret.status, currentVersion: ret.version.n, representativeStaffId: ret.representativeStaffId }, b);
  }
}
