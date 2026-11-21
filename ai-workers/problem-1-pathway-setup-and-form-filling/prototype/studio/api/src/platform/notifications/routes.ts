// PF-18n part 1 routes: the signed-in person's own in-app notifications. Own only: the route is `me`, the person and the
// firm are the session's, never a parameter; another person's or firm's row is 404 (PF-3: an id leaks nothing). The
// Individual/Corporate switch never filters this list (AG-10-36).
import { BadRequestException, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { AnyStaff, staffOf, type StaffContext } from "../identity/keys.ts";
import { notInFirm } from "../firm-scope.ts";
import { MyNotifications } from "./store.ts";

type R = { platform?: StaffContext };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A whole number from the query (any length: the service clamps it); anything else is the default. */
const whole = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined);
/** `?seen=<ISO time>`: the createdAt the person's list showed (rows surfaced again after it stay unread). A bad value is 400. */
const seenOf = (v: unknown): Date | undefined => {
  if (v === undefined) return undefined;
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(v) ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new BadRequestException("seen must be the createdAt the list showed (an ISO time ending in Z).");
  return d;
};

@Controller("api/platform/me/notifications")
export class MyNotificationsController {
  constructor(@Inject(MyNotifications) private readonly mine: MyNotifications) {}
  @Get("items") @AnyStaff("a person's own notifications")
  items(@Req() r: R, @Query() q: Record<string, unknown>) {
    const s = staffOf(r);
    return this.mine.list(s.firmId, s.staffId, { unread: q.unread === "1" || q.unread === "true", page: whole(q.page), size: whole(q.size) });
  }
  @Get("unread-count") @AnyStaff("a person's own unread count")
  unread(@Req() r: R) { const s = staffOf(r); return this.mine.unreadCount(s.firmId, s.staffId); }
  @Post("read-all") @HttpCode(200) @AnyStaff("a person marks their own notifications read")
  readAll(@Req() r: R, @Query("seen") seen?: string) { const s = staffOf(r); return this.mine.markAllRead(s.firmId, s.staffId, seenOf(seen)); }
  @Post(":id/read") @HttpCode(200) @AnyStaff("a person marks one of their own notifications read")
  async read(@Req() r: R, @Param("id") id: string, @Query("seen") seen?: string) {
    const s = staffOf(r);
    if (!UUID.test(id)) return notInFirm("notification");
    return (await this.mine.markRead(s.firmId, s.staffId, id.toLowerCase(), seenOf(seen))) ?? notInFirm("notification");
  }
}
