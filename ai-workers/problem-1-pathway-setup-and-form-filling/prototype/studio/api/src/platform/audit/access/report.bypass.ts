import { defineBypassUse } from "../../firm-scope.ts";

export const ACCESS_REPORT = defineBypassUse("platform.audit.access-report", { why: "our team's per-firm access report finds the one firm it names, read only (AUD-3 part 2, R1.87, SA-11-31; system/audit-log:list); that firm's own platform.bypass line", routes: [/^GET \/api\/system\/firms\/[^/]+\/access-report(\/export)?$/i], direct: true, audit: "per-firm" });
