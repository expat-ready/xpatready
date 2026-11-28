// PF-22a part 2: a firm's custom fields (api/src/platform/custom-fields/): the routes, the service, CustomFieldPort's
// registry, and the front office's record kinds, which register on it at start-up. Audit is PF-0p's interim AuditPort.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { FrontOfficeCustomFieldEntities } from "../front-office/sales/custom-field-entities.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { CustomFieldRegistry } from "../platform/custom-fields/registry.ts";
import { CustomFieldsController } from "../platform/custom-fields/routes.ts";
import { CustomFieldsService } from "../platform/custom-fields/service.ts";

export default {
  controllers: [CustomFieldsController],
  providers: [
    CustomFieldRegistry,
    { provide: CustomFieldsService, useFactory: (db: Db, registry: CustomFieldRegistry) => new CustomFieldsService({ db, audit: auditEvent, registry }), inject: [Db, CustomFieldRegistry] },
    FrontOfficeCustomFieldEntities,
  ],
} satisfies Feature;
