// PF-19c part 1 (thin, carried by PF-19s; R1.46): the firm's message templates under /api/platform/templates (list,
// open, publish, preview, the leads to preview with). The preview's leads come from the front office
// (front-office/sales/template-records.ts), bound here so platform code never imports front-office code.
import type { Feature } from "../features.ts";
import { LeadTemplateRecords } from "../front-office/sales/template-records.ts";
import { TemplatesController } from "../platform/messages/templates/routes.ts";
import { TEMPLATE_RECORDS } from "../platform/messages/templates/templates.ts";

export default {
  controllers: [TemplatesController],
  providers: [LeadTemplateRecords, { provide: TEMPLATE_RECORDS, useExisting: LeadTemplateRecords }],
} satisfies Feature;
