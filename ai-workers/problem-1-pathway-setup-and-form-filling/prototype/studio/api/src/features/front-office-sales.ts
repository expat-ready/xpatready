// FO-2: leads, Individual prospects (part 3) and the public web form. Audit: PF-0p's interim AuditPort (AUD-1 not on main); consent: PF-19a's store.
import type { Feature } from "../features.ts";
import { Leads } from "../front-office/sales/leads.ts";
import { Prospects } from "../front-office/sales/prospects.ts";
import { PublicForms, PublicFormsController, SALES_PORTS, type SalesPorts } from "../front-office/sales/public.ts";
import { SalesController } from "../front-office/sales/routes.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { consentStore } from "../platform/messages/consent/index.ts";

const ports = (): SalesPorts => ({ audit: auditEvent, consent: consentStore, publicOrigin: process.env.STUDIO_PUBLIC_URL ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}` });
export default { controllers: [PublicFormsController, SalesController], providers: [PublicForms, Leads, Prospects, { provide: SALES_PORTS, useFactory: ports }] } satisfies Feature;
