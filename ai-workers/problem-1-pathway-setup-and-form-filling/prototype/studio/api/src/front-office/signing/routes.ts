// FO-6 part 3: the staff read of a retainer's signing state. Key agent/retainer:show with the prospect's own-or-all rule,
// as the retainer read (FO-5's `Retainers.read` answers 404 for a retainer the person may not see, another firm's too).
import { Controller, Get, Inject, Param, Req } from "@nestjs/common";
import { OwnOrAll, PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { idParam } from "../../platform/http/input.ts";
import { Retainers } from "../retainers/service.ts";
import { Signing } from "./service.ts";

@Controller("api/front-office")
export class SigningController {
  constructor(@Inject(Signing) private readonly signing: Signing, @Inject(Retainers) private readonly retainers: Retainers) {}

  /** Status, "1 of 2 signed", each signer's side, name and moments, the evidence's hashes; no token, code or provider id. */
  @Get("retainers/:id/signing") @PermissionKeys("agent/retainer:show") @OwnOrAll("agent/prospect")
  async state(@Req() r: { platform?: StaffContext }, @Param("id") id: string) {
    const ctx = staffOf(r), rid = idParam(id, "retainer");
    await this.retainers.read(ctx, rid);   // visibility (404 otherwise)
    return this.signing.retainerState(ctx.firmId, rid);
  }
}
