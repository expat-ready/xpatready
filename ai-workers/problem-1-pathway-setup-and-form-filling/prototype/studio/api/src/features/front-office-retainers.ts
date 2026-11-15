// FO-5 (contracts §2.3, §7): retainer and consultation agreements: templates, drafts, versions, send check, withdraw,
// Signed offline and download links (api/src/front-office/retainers/), on the local FilesPort and the docxtemplater
// DocumentRenderPort. The service takes the app's database, the file store and the platform clock (PF-4's).
import { Inject } from "@nestjs/common";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { FileLinks, LocalFiles } from "../front-office/files.ts";
import { RetainersController } from "../front-office/retainers/routes.ts";
import { Retainers } from "../front-office/retainers/service.ts";
import { PlatformClock } from "../platform/identity/port.ts";
[Db, LocalFiles, PlatformClock].forEach((t, i) => Inject(t)(Retainers, undefined, i));
export default { controllers: [RetainersController], providers: [LocalFiles, FileLinks, Retainers] } satisfies Feature;
