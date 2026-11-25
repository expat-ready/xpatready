// PF-21w (PF-21's part 2; P-579, P-584 (8)): the complaints record's routes under /api/platform/complaints. Each declares
// its access (PF-4's keys.ts; the platform guard refuses the rest, default deny); every rule stays in ComplaintsService
// (complaints.ts, its "Who" lines): agent/complaint:record records; agent/complaint:read reads every one; record + read
// act on any and change the handler; the handler reads their own without either key and handles it while holding the
// record key (PF-21j); anyone else gets the
// same 404 as for another firm's complaint. Delete is refused for everyone (the service's 405: the same answer for any
// id, so it says nothing about which ids exist). The controller only reads the request and calls the service.
import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import { parseInput, query } from "../http/input.ts";
import { AnyStaff, PermissionKeys, staffOf, type StaffContext } from "../identity/keys.ts";
import { IDEMPOTENCY_HEADER, readIdempotencyKey } from "../idempotency.ts";
import { COMPLAINT_KEYS, ComplaintsService, isUuid, notFound, parse, RecordComplaint, REPEATED } from "./complaints.ts";

type R = { platform?: StaffContext };
type B = Record<string, unknown>;
type Q = Record<string, unknown>;
/** PF-28 part 2b (R1.10): the list's query keys; an unknown one is refused 422, named. */
const LIST_QUERY = query("view", "cursor", "limit");

/** PF-28 part 2b (R1.10): a complaint id is a uuid, or the one not-found, before the body is read. */
const complaintId = (id: string) => (isUuid(id) ? id : notFound());
const SEES = "the handler sees their own; agent/complaint:read sees all, checked by the service";
const HANDLES = "the handler holding agent/complaint:record handles their own; record + read act on any, checked by the service";

/** A query value as one string: a repeated parameter (?view=a&view=b) is not one value, so the service refuses it. */
const one = (v: unknown): string | undefined => (v === undefined ? undefined : typeof v === "string" ? v : "\u0000");
/** The page size as a number for the service's own check (1 to PAGE); text that is not a whole number stays NaN. */
const size = (v: unknown): number | undefined => { const s = one(v); return s === undefined ? undefined : /^\d{1,4}$/.test(s) ? Number(s) : Number.NaN; };

@Controller("api/platform/complaints")
export class ComplaintsController {
  constructor(@Inject(ComplaintsService) private readonly svc: ComplaintsService) {}

  /** PF-21i: one complaint per request: the Idempotency-Key header is required (400 without it); a repeat of the same
   *  key and body answers the first complaint with 200 (201 when it is new). */
  @Post() @PermissionKeys(COMPLAINT_KEYS.record)
  async record(@Req() r: R, @Body() b: B, @Headers(IDEMPOTENCY_HEADER) k: unknown, @Res({ passthrough: true }) res: { status(code: number): unknown }) {
    parse(RecordComplaint, b ?? {});   // PF-28 part 2b: the body's field errors (422) come before the missing-header 400
    const key = readIdempotencyKey(k, "Send an Idempotency-Key header with each new complaint.");
    const out = await this.svc.record(staffOf(r), b ?? {}, key);
    if (out[REPEATED]) res.status(200);
    return out;
  }

  @Get() @AnyStaff(SEES)
  list(@Req() r: R, @Query() q: Q) { parseInput(LIST_QUERY, q); return this.svc.list(staffOf(r), one(q.view), { cursor: one(q.cursor), limit: size(q.limit) }); }

  /** PF-21v: who can be made handler. Declared before /:id, so "handlers" is never read as an id. */
  @Get("handlers") @PermissionKeys(COMPLAINT_KEYS.record)
  handlers(@Req() r: R) { return this.svc.handlers(staffOf(r)); }

  @Get(":id") @AnyStaff(SEES)
  get(@Req() r: R, @Param("id") id: string) { return this.svc.get(staffOf(r), id); }

  @Post(":id/acknowledge") @HttpCode(200) @AnyStaff(HANDLES)
  acknowledge(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.acknowledge(staffOf(r), complaintId(id), b ?? {}); }

  @Post(":id/steps") @HttpCode(200) @AnyStaff(HANDLES)
  step(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.addStep(staffOf(r), complaintId(id), b ?? {}); }

  @Post(":id/response-sent") @HttpCode(200) @AnyStaff(HANDLES)
  responseSent(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.responseSent(staffOf(r), complaintId(id), b ?? {}); }

  @Post(":id/close") @HttpCode(200) @AnyStaff(HANDLES)
  close(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.close(staffOf(r), complaintId(id), b ?? {}); }

  @Post(":id/handler") @HttpCode(200) @PermissionKeys(COMPLAINT_KEYS.record, COMPLAINT_KEYS.read)
  handler(@Req() r: R, @Param("id") id: string, @Body() b: B) { return this.svc.changeHandler(staffOf(r), complaintId(id), b ?? {}); }

  @Delete(":id") @AnyStaff("refused for everyone: a complaint is never deleted")
  remove(@Req() r: R, @Param("id") id: string) { return this.svc.remove(staffOf(r), id); }
}
