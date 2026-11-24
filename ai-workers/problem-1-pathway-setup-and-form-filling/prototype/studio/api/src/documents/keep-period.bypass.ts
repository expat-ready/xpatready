// CS-D6 part 2: the weekly keep-period run's bypass use (P-785 (2): declared beside its module, never on the frozen list).
import { defineBypassUse } from "../platform/firm-scope.ts";

export const KEEP_PERIOD_WEEKLY_BYPASS = defineBypassUse("job:case_documents.keep_period_weekly", {
  why: "the weekly keep-period run lists which firms have a closed case, then queues each firm's reminder, which runs in its own firm scope (CS-D6, SA-11-33)",
  routes: [], outside: true, audit: "per-firm",
});
