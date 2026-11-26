// R1.96 part 1: the write-off route. Staff session only (PF-4's guard, default deny), firm from the session (PF-12's
// walls). Key agent/invoice:void (BACKLOG FO-7r: "key agent/invoice:void"; AG-6-76 §8), as the credit note's.
import { Body, Controller, Inject, Param, Post, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { WriteOffs } from "./write-off.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money/invoices")
export class WriteOffController {
  constructor(@Inject(WriteOffs) private readonly writeOffs: WriteOffs) {}

  @Post(":id/write-off") @PermissionKeys("agent/invoice:void")
  writeOff(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.writeOffs.writeOff(staffOf(r), id, b); }
}
