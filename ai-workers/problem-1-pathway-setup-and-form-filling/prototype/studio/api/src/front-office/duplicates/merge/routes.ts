// FO-9b part 2: the duplicate review list and the guided merge, behind PF-4's guard (concept screens/FO-9s/concept.md r3
// BR-6, BR-10, BR-11, M6, M7). The list, the Merged tab and Keep separate need agent/prospect:edit; preview, merge and
// Undo need agent/prospect:merge (AG-2-16 §8, AG-2-68 §8): without the key 403, before the service. Every body and query
// reaches a strict zod schema (an unknown field 422, named) and a path id that is not a uuid is the one not-found (PF-28).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { FieldPick } from "../../../../../ports/person-merge.ts";
import { idParam, parseInput, strict } from "../../../platform/http/input.ts";
import { PermissionKeys, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { DuplicateReview, MERGE_KEY, REVIEW_KEY } from "./review.ts";

type R = { platform?: StaffContext };
const LIST = strict({ status: z.enum(["OPEN", "MERGED", "KEPT_SEPARATE"]).optional() });
const PREVIEW = strict({ survivorId: z.string().uuid() });
const MERGE = strict({ survivorId: z.string().uuid(), choices: z.record(z.string().max(40), FieldPick).optional(), reason: z.string().trim().min(1).max(500).optional() });
const EMPTY = strict({});

@Controller("api/front-office")
export class DuplicateReviewController {
  constructor(@Inject(DuplicateReview) private readonly svc: DuplicateReview) {}

  @Get("duplicates/review") @PermissionKeys(REVIEW_KEY)
  list(@Req() r: R, @Query() q: unknown) { return this.svc.list(staffOf(r), parseInput(LIST, q ?? {}).status); }

  @Get("duplicates/merges") @PermissionKeys(REVIEW_KEY)
  merges(@Req() r: R) { return this.svc.merges(staffOf(r)); }

  @Post("duplicates/review/:id/preview") @HttpCode(200) @PermissionKeys(MERGE_KEY)
  preview(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { const pid = idParam(id, "pair"); return this.svc.preview(staffOf(r), pid, parseInput(PREVIEW, b ?? {}).survivorId); }

  @Post("duplicates/review/:id/merge") @HttpCode(200) @PermissionKeys(MERGE_KEY)
  merge(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { const pid = idParam(id, "pair"); return this.svc.merge(staffOf(r), pid, parseInput(MERGE, b ?? {})); }

  @Post("duplicates/review/:id/keep-separate") @HttpCode(200) @PermissionKeys(REVIEW_KEY)
  keepSeparate(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { const pid = idParam(id, "pair"); parseInput(EMPTY, b ?? {}); return this.svc.keepSeparate(staffOf(r), pid); }

  @Post("duplicates/merges/:id/undo") @HttpCode(200) @PermissionKeys(MERGE_KEY)
  undo(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { const mid = idParam(id, "merge"); parseInput(EMPTY, b ?? {}); return this.svc.undo(staffOf(r), mid); }
}
