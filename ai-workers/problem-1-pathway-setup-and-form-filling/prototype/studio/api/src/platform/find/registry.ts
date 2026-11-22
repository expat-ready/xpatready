// PF-30a: the find door's registry, FindPort's real adapter (ports/find.ts). One instance for the app (a Nest provider):
// each module's finder registers on it at start-up (front-office/find.ts; CS-S1 part 2's case finder next), and the route
// runs them with the port's one run rule. It keeps no query; it logs a dropped finder by module and reason word only (PF-23).
import { Injectable, Logger } from "@nestjs/common";
import { FIND_BUDGET_MS, FindModule, runFinders, type Finder, type FindPort, type FindResult } from "../../../../ports/find.ts";
import type { StaffContext } from "../identity/keys.ts";

@Injectable()
export class FindRegistry implements FindPort<StaffContext> {
  private readonly finders: [string, Finder<StaffContext>][] = [];
  /** Each finder's budget; the port's FIND_BUDGET_MS (a test may shorten it). */
  budgetMs = FIND_BUDGET_MS;
  /** A dropped finder is logged by module and reason word only (review m4; PF-23: never the query or the error's words). */
  private readonly log = new Logger("find");
  register(module: string, finder: Finder<StaffContext>): void {
    FindModule.parse(module);
    if (this.finders.some(([m]) => m === module)) throw new Error(`FindPort: ${module} has already registered its finder`);
    this.finders.push([module, finder]);
  }
  find(ctx: StaffContext, text: unknown): Promise<FindResult> { return runFinders(this.finders, ctx, text, this.budgetMs, (d) => this.log.warn(`find: finder ${d.module} dropped (${d.reason})`)); }
  /** The registered modules, in order (for tests and the module card). */
  modules(): string[] { return this.finders.map(([m]) => m); }
}
