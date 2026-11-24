// FO-3c part 2 (R1.104, J-104 W2; P-785 (2)): the consultation agreement's outbox poller reads every firm's booking events
// (module_event is walled, PF-12) and every firm's bookings still missing their agreement. Only the reads cross firms:
// each send, reminder and seal then runs as its own firm (withFirm), never on this use; each firm read is touched once
// a run (touchFirms: one platform.bypass line in that firm's trail).
import { defineBypassUse } from "../../../platform/firm-scope.ts";

export const AGREEMENT_POLL_USE = defineBypassUse("front-office.consultation-agreement.poll", {
  why: "at start and every few seconds, every firm's new booking.scheduled and booking.rescheduled events, and every firm's scheduled bookings still without their consultation agreement, are listed (each is then sent as its own firm, never on this use) (FO-3c part 2, J-104)",
  routes: [], outside: true, audit: "per-firm",
});
