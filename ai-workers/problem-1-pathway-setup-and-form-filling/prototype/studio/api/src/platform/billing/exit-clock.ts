// PF-5 part 4 (R1.105; SA-2-6, SA-2-38, SA2-D13; contracts §7 "Firm exit"): the 90-day payment-hold clock, read. A firm on
// PAYMENT_HOLD has one clock: it starts at its newest firm.payment_hold event (the one account.ts shows) and ends on the
// deletion date, DELETION_DAYS later (account.ts's constant: never a second 90). A hold that ends (paid → ACTIVE) stops
// the clock; a later hold is a new event, so a new clock with its own day 0. Any other firm status has no clock (null).
// The departure notices this clock drives (exit-notices.ts) are recorded as `firm.exit_notice_sent` audit lines keyed by
// the hold's event seq and the day, and read back here: PF-11c's day-90 job and PF-11s read `noticesSent`. No route.
import type { Prisma, PrismaClient } from "@prisma/client";
import { EVENT } from "../../../../ports/events.ts";
import { firmScope } from "../firm-scope.ts";
import { DELETION_DAYS } from "./account.ts";
import { ADDRESS_NEEDED } from "./webhook.ts";

type Reader = Prisma.TransactionClient | PrismaClient;
export const DAY_MS = 86_400_000;

/** P-799 (founder, 22 Nov), from SA-02 v2.24 §3 ("warnings on days 16, 46 and 83 of the hold"): day 0 is the payment-hold
 *  notice, days 16, 46 and 83 the deletion warnings. The one place these days are written. */
export const EXIT_NOTICE_DAYS = Object.freeze([0, 16, 46, 83] as const);
export type ExitNoticeDay = (typeof EXIT_NOTICE_DAYS)[number];

/** The audit line each sent notice leaves (one per hold and day). */
export const EXIT_NOTICE_ACTION = "firm.exit_notice_sent";
export const EXIT_NOTICE_ENTITY = "platform_firm";
/** The line's entity key: the firm, the hold's event seq and the day (unique per notice). */
export const exitNoticeKey = (firmId: string, holdSeq: bigint | string, day: number) => `firm-exit:${firmId.toLowerCase()}:${String(holdSeq)}:day-${day}`;

/** `reason`: why the firm is held, as the billing page names it ("payment needed" or "business address needed"). */
export type ExitClock = { holdSince: Date; holdSeq: string; deletionDate: Date; reason: "payment needed" | typeof ADDRESS_NEEDED; noticesSent: { day: number; sentAt: Date }[] };

/** The firm's clock, or null unless the firm is on PAYMENT_HOLD. Runs in the caller's firm scope (or its transaction). */
export async function exitClock(tx: Reader, firmId: string): Promise<ExitClock | null> {
  const id = firmScope(firmId).firmId;
  const firm = await tx.platformFirm.findFirst({ where: { id }, select: { status: true } });
  if (firm?.status !== "PAYMENT_HOLD") return null;
  const hold = await tx.moduleEvent.findFirst({ where: firmScope(id, { type: EVENT.FIRM_PAYMENT_HOLD }), orderBy: { seq: "desc" }, select: { seq: true, occurredAt: true, payload: true } });
  if (!hold) return null;
  const prefix = `firm-exit:${id}:${hold.seq}:day-`;
  const lines = await tx.auditEvent.findMany({ where: { firmId: id, action: EXIT_NOTICE_ACTION, entity: EXIT_NOTICE_ENTITY, entityKey: { startsWith: prefix } }, select: { entityKey: true, at: true, detail: true }, orderBy: { at: "asc" } });
  // sentAt: the clock's time the job sent it (the line's detail; the database's own time when absent).
  const sentAtOf = (l: { at: Date; detail: unknown }) => { const v = (l.detail as { sentAt?: unknown } | null)?.sentAt; const d = typeof v === "string" ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d : l.at; };
  const noticesSent = lines.map((l) => ({ day: Number(l.entityKey!.slice(prefix.length)), sentAt: sentAtOf(l) })).filter((n) => Number.isInteger(n.day)).sort((a, b) => a.day - b.day);
  const reason = (hold.payload as { reason?: unknown } | null)?.reason === ADDRESS_NEEDED ? ADDRESS_NEEDED : "payment needed";
  return { holdSince: hold.occurredAt, holdSeq: String(hold.seq), reason, deletionDate: new Date(hold.occurredAt.getTime() + DELETION_DAYS * DAY_MS), noticesSent };
}

/** The notice due now on this clock: the newest day reached that has not been sent, never one on or after the deletion
 *  date (a missed older day is not sent late once a newer one is due). null when none is due. */
export function dueNotice(clock: ExitClock, now: Date): ExitNoticeDay | null {
  if (now.getTime() >= clock.deletionDate.getTime()) return null;
  const reached = EXIT_NOTICE_DAYS.filter((d) => now.getTime() >= clock.holdSince.getTime() + d * DAY_MS);
  const newest = reached.at(-1);
  if (newest === undefined || clock.noticesSent.some((n) => n.day >= newest)) return null;
  return newest;
}
