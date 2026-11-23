// FO-9b part 2: the duplicate review list and the guided merge, behind PF-4's guard (concept screens/FO-9s/concept.md r3
// BR-6, BR-10, BR-11, M6, M7). The list, the Merged tab and Keep separate need agent/prospect:edit; preview, merge and
// Undo need agent/prospect:merge (AG-2-16 §8, AG-2-68 §8): without the key 403, before the service. Every body and query
// reaches a strict zod schema (an unknown field 422, named) and a path id that is not a uuid is the one not-found (PF-28).
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { FieldPick, MERGE_FIELDS } from "../../../../../ports/person-merge.ts";
import { idParam, parseInput, strict } from "../../../platform/http/input.ts";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { DuplicateReview, MERGE_KEY, REVIEW_KEY } from "./review.ts";

type R = { platform?: StaffContext };
const LIST = strict({ status: z.enum(["OPEN", "MERGED", "KEPT_SEPARATE"]).optional() });
const PREVIEW = strict({ survivorId: z.string().uuid() });
// choices: only the person's merge fields (break F6: an unknown field is a named 422, never a silent drop or a 400).
const CHOICES = strict(Object.fromEntries(MERGE_FIELDS.PERSON.map((f) => [f, FieldPick.optional()])) as Record<(typeof MERGE_FIELDS.PERSON)[number], z.ZodOptional<typeof FieldPick>>);
const MERGE = strict({ survivorId: z.string().uuid(), choices: CHOICES.optional(), reason: z.string().trim().min(1).max(500).optional(),
  updatedAt: strict({ survivor: z.string().datetime({ offset: true }), loser: z.string().datetime({ offset: true }) }).optional() });
const NONE = strict({});

@Controller("api/front-office")
export class DuplicateReviewController {
  constructor(@Inject(DuplicateReview) private readonly svc: DuplicateReview) {}

  @Get("duplicates/review") @PermissionKeys(REVIEW_KEY)
  list(@Req() r: R, @Query() q: unknown) { return this.svc.list(staffOf(r), parseInput(LIST, q ?? {}).status); }

  @Get("duplicates/merges") @PermissionKeys(REVIEW_KEY)
  merges(@Req() r: R, @Query() q: unknown) { parseInput(NONE, q ?? {}); return this.svc.merges(staffOf(r)); }

  @Post("duplicates/review/:id/preview") @HttpCode(200) @PermissionKeys(MERGE_KEY)
  preview(@Req() r: R, @Param("id") id: string, @Body() b: unknown) { const pid = idParam(id, "pair"); return this.svc.preview(staffOf(r), pid, parseInput(PREVIEW, b ?? {}).survivorId); }

  @Post("duplicates/review/:id/merge") @HttpCode(200) @PermissionKeys(MERGE_KEY)
  merge(@Req() r: R, @Param("id") id: string, @Body() b: unknown) {
    const pid = idParam(id, "pair"), b0 = b as Record<string, unknown> | null;
    // A "__proto__" key JSON.parse made inside a nested object is never a field (parseInput checks the top level only;
    // break F6, R2-8).
    for (const k of ["choices", "updatedAt"]) { const c = b0?.[k]; if (c !== null && typeof c === "object" && Object.hasOwn(c, "__proto__")) problem(422, "Check the details", `One field needs a change: ${k}.__proto__: This field is not allowed here. Nothing was saved.`, { code: "INVALID", fields: { [`${k}.__proto__`]: "This field is not allowed here." } }); }
    return this.svc.merge(staffOf(r), pid, parseInput(MERGE, b ?? {}));
  }

  @Post("duplicates/review/:id/keep-separate") @HttpCode(200) @PermissionKeys(REVIEW_KEY)
  keepSeparate(@Req() r: R, @Param("id") id: string) { return this.svc.keepSeparate(staffOf(r), idParam(id, "pair")); }   // no body: the path id alone

  @Post("duplicates/merges/:id/undo") @HttpCode(200) @PermissionKeys(MERGE_KEY)
  undo(@Req() r: R, @Param("id") id: string) { return this.svc.undo(staffOf(r), idParam(id, "merge")); }   // no body: the path id alone
}
