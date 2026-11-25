// PF-11 part 1b: the export sweep's bypass use (P-785 (2): declared beside its module, never on the frozen list).
import { defineBypassUse } from "../firm-scope.ts";

export const EXPORT_SWEEP_BYPASS = defineBypassUse("job:platform.firm_export.sweep", {
  why: "the daily export sweep lists every firm's expired or overdue data downloads, then expires or deletes each in its own firm scope (PF-11 part 1b)",
  routes: [], outside: true, audit: "per-firm",
});
