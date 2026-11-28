// PF-22v: saved views of the lists modules register (api/src/platform/saved-views/): the routes, the service,
// SavedViewPort's registry, and the front office's lists, which register on it at start-up. Audit is PF-0p's AuditPort.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { FrontOfficeSavedViewLists } from "../front-office/sales/saved-view-lists.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { SavedViewRegistry } from "../platform/saved-views/registry.ts";
import { SavedViewsController } from "../platform/saved-views/routes.ts";
import { SavedViewsService } from "../platform/saved-views/service.ts";

export default {
  controllers: [SavedViewsController],
  providers: [
    SavedViewRegistry,
    { provide: SavedViewsService, useFactory: (db: Db, registry: SavedViewRegistry) => new SavedViewsService({ db, audit: auditEvent, registry }), inject: [Db, SavedViewRegistry] },
    FrontOfficeSavedViewLists,
  ],
} satisfies Feature;
