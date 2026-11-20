// FO-7b part 1a (QA-482; R1.59): draft invoices with tax rounded per line (api/src/client-money/invoices/), on the app's
// database and AuditPort's adapter over audit_event.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { InvoiceDrafts } from "../client-money/invoices/drafts.ts";
import { InvoiceDraftsController } from "../client-money/invoices/routes.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
export default { controllers: [InvoiceDraftsController], providers: [{ provide: InvoiceDrafts, useFactory: (db: Db) => new InvoiceDrafts(db, auditEvent), inject: [Db] }] } satisfies Feature;
