// FO-7t part 3 routes (R1.58): /api/front-office/money/trust/to-move/*, staff session only (PF-4's guard, default deny),
// firm from the session (PF-12's walls). Key agent/payment:record for the list, "I moved these" and Undo (FO-7t.md part 3:
// the person who records money between the bank accounts). Who sees a line: C5, as the ledger (to-move.ts).
import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { PermissionKeys, staffOf, type StaffContext } from "../../platform/identity/keys.ts";
import { TrustToMove } from "./to-move.ts";

type R = { platform?: StaffContext };

@Controller("api/front-office/money/trust/to-move")
export class TrustToMoveController {
  constructor(@Inject(TrustToMove) private readonly toMove: TrustToMove) {}

  @Get() @PermissionKeys("agent/payment:record")
  list(@Req() r: R, @Query() q: unknown) { return this.toMove.list(staffOf(r), q); }

  @Post("batches") @PermissionKeys("agent/payment:record")
  record(@Req() r: R, @Body() b: unknown) { return this.toMove.record(staffOf(r), b); }

  @Post("batches/:id/undo") @PermissionKeys("agent/payment:record")
  undo(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { return this.toMove.undo(staffOf(r), id, b); }
}
