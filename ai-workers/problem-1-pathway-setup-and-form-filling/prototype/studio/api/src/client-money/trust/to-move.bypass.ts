// FO-7t part 3: the 25-day sweep's bypass use (P-785 (2): declared beside its module, never on the frozen list).
import { defineBypassUse } from "../../platform/firm-scope.ts";

export const TO_MOVE_SWEEP_BYPASS = defineBypassUse("job:client_money.trust_to_move_sweep", {
  why: "the daily sweep lists every firm with a \"To move\" line older than 25 days, then queues that firm's reminder job, which runs in its own firm scope (FO-7t part 3, AG-6-73 rule 5)",
  routes: [], outside: true, audit: "per-firm",
});
