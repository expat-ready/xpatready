// PF-11c part 1: the day-90 close's bypass use (P-785 (2): declared beside its module, never on the frozen list).
import { defineBypassUse } from "../firm-scope.ts";

export const CLOSURE_QUEUE = "platform.firm.closure";
export const CLOSURE_BYPASS = defineBypassUse(`job:${CLOSURE_QUEUE}`, {
  why: "the day-90 close lists every firm on payment hold, then closes each whose 90 days have run out in its own firm scope (PF-11c, SA-2-21)",
  routes: [], outside: true, audit: "per-firm",
});
