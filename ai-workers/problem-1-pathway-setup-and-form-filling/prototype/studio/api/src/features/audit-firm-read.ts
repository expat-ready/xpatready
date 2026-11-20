// AUD-4: the firm reads and exports its own activity log (GET /api/platform/audit, GET /api/platform/audit/export).
import type { Feature } from "../features.ts";
import { FirmAuditController } from "../platform/audit/firm-read/routes.ts";
import { FirmAuditLog } from "../platform/audit/firm-read/service.ts";

export default { controllers: [FirmAuditController], providers: [FirmAuditLog] } satisfies Feature;
