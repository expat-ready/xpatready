// FO-2: leads, Individual prospects (part 3) and the public web form. Audit: PF-0p's interim AuditPort (AUD-1 not on main); consent: PF-19a's store.
// FO-9a phone part: PATCH people/:personId ({ phone }, people/edit.ts).
// FO-4b: EmbedController (the embed script, the send's pre-flight).
// FO-10 part 1: the assignment rules (assignment/rules.ts; the arrival path calls placeNewLead itself); part 2: the sharing setting.
// PF-18n part 2: SALES_PORTS gets NOTIFICATION_PORT (a lead handed to someone tells them); LeadNotificationLabels names leads in a person's notification list.
// FO-1p: FO_PERSON_PORT, the front office's FoPersonPort for the case side (CS-K1 part 2), bound here.
import { FO_PERSON_PORT } from "../../../ports/fo-person.ts";
import type { Feature } from "../features.ts";
import { AssignmentRules } from "../front-office/assignment/rules.ts";
import { AssignmentRulesController, LeadSharingController } from "../front-office/assignment/routes.ts";
import { PeopleEdit, PeopleEditController } from "../front-office/people/edit.ts";
import { foPersonPort } from "../front-office/people/fo-person-port.ts";
import { Activity } from "../front-office/sales/calls.ts";
import { EmbedController } from "../front-office/sales/embed.ts";
import { Leads } from "../front-office/sales/leads.ts";
import { LeadNotificationLabels } from "../front-office/sales/lead-notification-labels.ts";
import type { NotificationPort } from "../../../ports/notifications.ts";
import { NOTIFICATION_PORT as NOTES } from "../platform/notifications/store.ts";   // short: the push guard reads "token: <16+ letters>" as a secret
import { ProspectEdit, ProspectEditController } from "../front-office/sales/prospect-edit.ts";
import { Prospects } from "../front-office/sales/prospects.ts";
import { PublicForms, PublicFormsController, SALES_PORTS, type SalesPorts } from "../front-office/sales/public.ts";
import { SalesController } from "../front-office/sales/routes.ts";
import { Timeline } from "../front-office/sales/timeline.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { consentStore } from "../platform/messages/consent/index.ts";

// PF-18n part 2: NotificationPort's real adapter (features/platform-notifications.ts), optional: unbound, nobody is told.
const ports = (notifications?: NotificationPort<never>): SalesPorts => ({ audit: auditEvent, consent: consentStore, notifications: (notifications ?? null) as SalesPorts["notifications"], publicOrigin: process.env.STUDIO_PUBLIC_URL ?? `http://localhost:${process.env.STUDIO_PORT ?? 4400}` });
export default { controllers: [PublicFormsController, EmbedController, SalesController, PeopleEditController, ProspectEditController, AssignmentRulesController, LeadSharingController], providers: [PublicForms, Leads, AssignmentRules, PeopleEdit, Prospects, ProspectEdit, Activity, Timeline, { provide: SALES_PORTS, useFactory: ports, inject: [{ token: NOTES, optional: true }] }, LeadNotificationLabels,
  { provide: FO_PERSON_PORT, useValue: foPersonPort }] } satisfies Feature;
