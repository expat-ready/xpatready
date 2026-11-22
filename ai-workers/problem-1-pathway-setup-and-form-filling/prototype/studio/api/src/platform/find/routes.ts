// PF-30a: GET /api/platform/find?q= — the one find door (batch 5). Any signed-in staff member may ask; each finder applies
// its own area's view rule (front office: agent/prospect:view.own/view.all), so the door itself opens nothing. A text
// of fewer than 2 or more than 100 characters (trimmed) is refused 400; the refusal never repeats it. The query is never
// logged: the request line names the route pattern only (PF-23 hook.ts), and nothing here writes it.
import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import { FindText, type FindResult } from "../../../../ports/find.ts";
import { parseInput, strict } from "../http/input.ts";
import { z } from "zod";
import { AnyStaff, problem, staffOf, type StaffContext } from "../identity/keys.ts";
import { FindRegistry } from "./registry.ts";

type R = { platform?: StaffContext };
/** The one query key the door reads. */
export const FindQueryKeys = strict({ q: z.string().optional() });   // any length here: FindText answers 400 for every bad length (breaker m2)

@Controller("api/platform")
export class FindController {
  constructor(@Inject(FindRegistry) private readonly registry: FindRegistry) {}
  @Get("find") @AnyStaff("the one find door: each module's finder applies its own view rule (PF-30a)")
  find(@Req() r: R, @Query() all: unknown): Promise<FindResult> {
    const ctx = staffOf(r);
    const { q } = parseInput(FindQueryKeys, all ?? {});   // a misspelt key → 422 naming it (PF-28)
    if (!FindText.safeParse(q).success) return problem(400, "Check the search", "Type 2 to 100 characters to search.", { code: "QUERY_LENGTH" });
    return this.registry.find(ctx, q);
  }
}
