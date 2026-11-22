// FO-13c routes (brief lead-b-briefs/FO-13c.md): preview, record and confirm a conflict-of-interest check (key
// agent/conflict:check), and list a prospect's party's checks (agent/prospect:show, the prospect visible). Nest's
// decorators in @ form (api/tsconfig.json, PF-4t).
// PF-28 part 3b (R1.10): every body and query here reaches a strict zod schema (an unknown field is refused 422, named) and
// a path id that is not a uuid is the one not-found (404), before the service. Outer bounds; the service keeps its own
// rules and words.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { z } from "zod";
import { idParam, parseInput, strict } from "../../../platform/http/input.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { ConflictChecks } from "./service.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
const s = (max: number) => z.string().max(max).nullish();
const PREVIEW = strict({ prospectId: s(100) });
const RECORD = strict({ requestId: s(100), prospectId: s(100), result: s(100), disclosureText: s(40_000) });
const CONFIRM = strict({ result: s(100), disclosureText: s(40_000) });

@Controller("api/front-office")
export class ConflictChecksController {
  constructor(@Inject(ConflictChecks) private readonly svc: ConflictChecks) {}

  @Post("conflict-checks/preview") @HttpCode(200) @PermissionKeys("agent/conflict:check")
  preview(@Req() r: R, @Body() b: B) { return this.svc.preview(staffOf(r), parseInput(PREVIEW, b ?? {})); }

  @Post("conflict-checks") @PermissionKeys("agent/conflict:check")
  record(@Req() r: R, @Body() b: B) { return this.svc.record(staffOf(r), parseInput(RECORD, b ?? {})); }

  @Get("conflict-checks/:id/for-confirmation") @PermissionKeys("agent/conflict:check")
  forConfirmer(@Req() r: R, @Param("id") id: string) { return this.svc.forConfirmer(staffOf(r), id); }

  @Post("conflict-checks/:id/confirm") @HttpCode(200) @PermissionKeys("agent/conflict:check")
  confirm(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.confirm(staffOf(r), idParam(id, "check"), parseInput(CONFIRM, b ?? {})); }

  @Get("prospects/:id/conflict-checks") @PermissionKeys("agent/prospect:show")
  list(@Req() r: R, @Param("id") id: string) { return this.svc.list(staffOf(r), idParam(id, "prospect")); }
}
