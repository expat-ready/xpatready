// FO-2: leads and the public web form (api/src/front-office/sales/). Audit is PF-0p's interim AuditPort over audit_event
// (AUD-1 is not on main); consent is PF-19a's ConsentStore (subject FO_PERSON); the clock is the system's.
import type { Feature } from "../features.ts";
import { Leads } from "../front-office/sales/leads.ts";
import { PublicForms, PublicFormsController, SALES_PORTS, type SalesPorts } from "../front-office/sales/public.ts";
import { SalesController } from "../front-office/sales/routes.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { consentStore } from "../platform/messages/consent/index.ts";

const ports = (): SalesPorts => ({ audit: auditEvent, consent: consentStore, publicOrigin: process.env.STUDIO_PUBLIC_URL ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}` });
export default { controllers: [PublicFormsController, SalesController], providers: [PublicForms, Leads, { provide: SALES_PORTS, useFactory: ports }] } satisfies Feature;
