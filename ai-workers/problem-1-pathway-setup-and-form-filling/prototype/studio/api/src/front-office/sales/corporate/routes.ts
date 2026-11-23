// FO-2b staff routes for Corporate prospects (contracts §2.1, §7 §2.1; AG-2-52, -75, -76, -77, -79), behind PF-4's guard
// with PF-3's seeded agent/prospect:* keys (AG-2-52 rule 6: one grant covers both pipelines; AG-2-77 §8: edit adds,
// changes and ends contacts). Visibility is the service's (the retainers' own-versus-all rule). The board and the read
// carry no @OwnOrAll mark: PF-6b's sweep table lists only the routes it reads (adding them is that test's row).
// PF-28 part 3b (R1.10): every body and query here reaches a strict zod schema (an unknown field is refused 422, named) and
// a path id that is not a uuid is the one not-found (404), before the service. Outer bounds; the service keeps its own
// rules and words.
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { idParam, list, parseInput, strict } from "../../../platform/http/input.ts";
import { PermissionKeys, problem, staffOf, type StaffContext } from "../../../platform/identity/keys.ts";
import { Corporate } from "./service.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
const s = (max: number) => z.string().max(max).nullish();
const MATCH_QUERY = strict({ name: z.string().max(500).optional() });
/** `?source=` once or repeated (FO-4sf), as on the leads and prospects lists (part 3a). */
const BOARD_QUERY = strict({ source: z.union([z.string().max(500), list(z.string().max(500), 50)]).optional() });
const ENGAGE = strict({ companyId: s(100), companyName: s(1000), newCompany: z.boolean().nullish() });
const CHANGE_TYPE = strict({ type: s(40), companyId: s(100), companyName: s(1000), newCompany: z.boolean().nullish(), personId: s(100) });
/** The role is always needed, so an empty body is refused before the company or link is looked up. */
const ADD_CONTACT = strict({ role: z.string().max(40), personId: s(100), givenNames: s(1000), familyName: s(1000), email: s(1000), phone: s(1000), confirmedNew: z.boolean().nullish() });
const ROLE = strict({ role: z.string().max(40) });
/** The pipeline in the path: INDIVIDUAL or CORPORATE (any case), else the one not-found. */
const pipeline = (v: string) => (/^(individual|corporate)$/i.test(v ?? "") ? v.toUpperCase() : problem(404, "Not found", "No such pipeline.", { code: "NOT_FOUND" }));

@Controller("api/front-office")
export class CorporateController {
  constructor(@Inject(Corporate) private readonly svc: Corporate) {}

  @Get("companies/match") @PermissionKeys("agent/prospect:edit")
  match(@Req() r: R, @Query() q: B) { return this.svc.match(staffOf(r), parseInput(MATCH_QUERY, q ?? {}).name); }

  @Post("leads/:id/engage/corporate") @PermissionKeys("agent/prospect:edit")
  engage(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.engage(staffOf(r), idParam(id, "lead"), parseInput(ENGAGE, b ?? {})); }

  @Get("pipelines/:type/board") @PermissionKeys("agent/prospect:show")
  board(@Req() r: R, @Param("type") type: string, @Query() q: B) { const { source } = parseInput(BOARD_QUERY, q ?? {}); return this.svc.board(staffOf(r), pipeline(type), source); }   // the query first: the path holds no record id

  @Get("corporate/prospects/:id") @PermissionKeys("agent/prospect:show")
  read(@Req() r: R, @Param("id") id: string) { return this.svc.read(staffOf(r), id); }

  @Post("prospects/:id/change-type") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  changeType(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.changeType(staffOf(r), idParam(id, "prospect"), parseInput(CHANGE_TYPE, b ?? {})); }

  @Get("companies/:id/contacts") @PermissionKeys("agent/prospect:show")
  contacts(@Req() r: R, @Param("id") id: string) { return this.svc.contacts(staffOf(r), id); }

  @Post("companies/:id/contacts") @PermissionKeys("agent/prospect:edit")
  addContact(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.addContact(staffOf(r), idParam(id, "company"), parseInput(ADD_CONTACT, b ?? {})); }

  @Post("company-contacts/:id/role") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  changeRole(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.changeRole(staffOf(r), idParam(id, "contact"), parseInput(ROLE, b ?? {})); }

  @Post("company-contacts/:id/end") @HttpCode(200) @PermissionKeys("agent/prospect:edit")
  end(@Req() r: R, @Param("id") id: string) { return this.svc.endContact(staffOf(r), id); }
}
