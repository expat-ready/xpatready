// PF-17 part 1 (R1.93; SA-2-14): our team's firms list with health and usage, and one firm's figures. Read only, key
// `system/firm:read` (PF-4s's guard: our own staff only, one audit line per call). The work is firms.ts.
import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import { SystemKeys } from "../system-identity/keys.ts";
import { FIRM_READ_KEY, parseListQuery, SystemConsoleFirms } from "./firms.ts";

@Controller("api/system/firms")
export class SystemConsoleController {
  constructor(@Inject(SystemConsoleFirms) private readonly firms: SystemConsoleFirms) {}

  /** Every firm, HELD then ATTENTION then OK, then by name; ?health=, ?q= (name or web address), ?page= (50 a page). */
  @Get() @SystemKeys(FIRM_READ_KEY)
  list(@Query() q: Record<string, unknown>) { return this.firms.list(parseListQuery(q ?? {})); }

  /** One firm's figures; an unknown or malformed id is 404. */
  @Get(":id") @SystemKeys(FIRM_READ_KEY)
  one(@Param("id") id: string) { return this.firms.one(id); }
}
