// PF-27 part 3a: the lock and the lift cross into one firm's rows (P-785 (2): declared beside its module).
import { defineBypassUse } from "../firm-scope.ts";

export const FIRM_LOCK = defineBypassUse("platform.console.firm-lock", {
  why: "our Platform Owner locks or lifts the lock of one firm (its status, its audit line and its event; PF-27, SA-2-34, SA-2-8); that firm's own platform.bypass line",
  routes: [/^POST \/api\/system\/firms\/[^/]+\/(lock|unlock)$/i], audit: "per-firm",
});
