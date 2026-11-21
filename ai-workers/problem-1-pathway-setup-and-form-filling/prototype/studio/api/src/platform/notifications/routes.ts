// PF-18n part 1 routes: the signed-in person's own in-app notifications. Own only: the route is `me`, the person and the
// firm are the session's, never a parameter; another person's or firm's row is 404 (PF-3: an id leaks nothing). The
// Individual/Corporate switch never filters this list (AG-10-36).
import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { AnyStaff, staffOf, type StaffContext } from "../identity/keys.ts";
import { notInFirm } from "../firm-scope.ts";
import { MyNotifications } from "./store.ts";
import { OFFICE_CLOCK } from "../settings/offices/clock.ts";
import type { OfficeClockPort } from "../../../../ports/offices.ts";
import { FIELD_ERROR_STATUS, parseInput, query } from "../http/input.ts";
import { problem } from "../identity/keys.ts";

type R = { platform?: StaffContext };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A whole number from the query (any length: the service clamps it); anything else is the default. */
const whole = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
/** `?seen=<ISO time>`: the createdAt the person's list showed (rows surfaced again after it stay unread). A bad value is a
 *  field error (422, `seen` named; PF-28 part 2b). */
const seenOf = (v: unknown): Date | undefined => {
  if (v === undefined) return undefined;
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return problem(FIELD_ERROR_STATUS, "Check the details", "seen must be the createdAt the list showed (an ISO time ending in Z).", { code: "INVALID", fields: { seen: "The createdAt the list showed (an ISO time ending in Z)." } });
  return d;
};

/** PF-28 part 2b (R1.10): the one query key of the two "mark read" routes. */
const SEEN = query("seen");

@Controller("api/platform/me/notifications")
export class MyNotificationsController {
  constructor(@Inject(MyNotifications) private readonly mine: MyNotifications) {}
  @Get("items") @AnyStaff("a person's own notifications")
  items(@Req() r: R, @Query() q: Record<string, unknown>) {
    parseInput(query("unread", "page", "size"), q);   // PF-28 part 2b: an unknown query key is refused 422, named
    const s = staffOf(r);
    return this.mine.list(s.firmId, s.staffId, { unread: q.unread === "1" || q.unread === "true", page: whole(q.page), size: whole(q.size) });
  }
  @Get("unread-count") @AnyStaff("a person's own unread count")
  unread(@Req() r: R) { const s = staffOf(r); return this.mine.unreadCount(s.firmId, s.staffId); }
  @Post("read-all") @HttpCode(200) @AnyStaff("a person marks their own notifications read")
  readAll(@Req() r: R, @Query() q: Record<string, unknown>) { const { seen } = parseInput(SEEN, q), s = staffOf(r); return this.mine.markAllRead(s.firmId, s.staffId, seenOf(seen)); }
  @Post(":id/read") @HttpCode(200) @AnyStaff("a person marks one of their own notifications read")
  async read(@Req() r: R, @Param("id") id: string, @Query() q: Record<string, unknown>) {
    const { seen } = parseInput(SEEN, q), s = staffOf(r);   // the query first: a random id's 404 never hides a bad query
    if (!UUID.test(id)) return notInFirm("notification");
    return (await this.mine.markRead(s.firmId, s.staffId, id.toLowerCase(), seenOf(seen))) ?? notInFirm("notification");
  }
}

/** PF-18h (concept screens/pf-18h-home r3): Home's "Needs you": my unread MY_DEADLINES rows (BR-1), newest first, at most 20,
 *  with the total (BR-5), each with its case number and link (Q1 (a), one link builder: `linksOf`), and my zone: my office's,
 *  else the firm's (BR-7, OfficeClockPort). Own only, as above (BR-3). */
@Controller("api/platform/me/needs-you")
export class NeedsYouController {
  constructor(@Inject(MyNotifications) private readonly mine: MyNotifications, @Inject(OFFICE_CLOCK) private readonly offices: OfficeClockPort) {}
  @Get() @AnyStaff("a person's own Needs you list")
  async list(@Req() r: R) {
    const s = staffOf(r);
    const [list, zone] = await Promise.all([this.mine.needsYou(s.firmId, s.staffId), this.offices.officeOfStaff(s.firmId, s.staffId).then((o) => this.offices.zoneFor(s.firmId, o))]);
    return { ...list, zone };
  }
}
