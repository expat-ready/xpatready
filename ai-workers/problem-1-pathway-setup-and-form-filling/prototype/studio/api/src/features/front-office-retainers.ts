// FO-5 (contracts §2.3, §7): retainer and consultation agreements: templates, drafts, versions, send check, withdraw,
// Signed offline and download links (api/src/front-office/retainers/), on the local FilesPort and the docxtemplater
// DocumentRenderPort. The service takes the app's database, the file store and the platform clock (PF-4's).
// PF-15: the file store is EntitledFiles (LocalFiles with the storage limit on new keys; api/src/platform/entitlements/);
// StorageWatch is optional (an app of this feature alone, as check_fo13i's, still enforces the limit, without the marks).
import { Inject } from "@nestjs/common";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { FileLinks, LocalFiles } from "../front-office/files.ts";
import { RetainersController } from "../front-office/retainers/routes.ts";
import { Retainers } from "../front-office/retainers/service.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { EntitledFiles, StorageWatch } from "../platform/entitlements/storage.ts";
import { boundFiles, filesProviders } from "../platform/files/choose.ts";
[Db, LocalFiles, PlatformClock].forEach((t, i) => Inject(t)(Retainers, undefined, i));
export default { controllers: [RetainersController], providers: [{ provide: LocalFiles, useFactory: (db: Db, clock: PlatformClock, watch?: StorageWatch) => new EntitledFiles(db, () => clock.now(), watch ?? null, boundFiles()), inject: [Db, PlatformClock, { token: StorageWatch, optional: true }] }, filesProviders[1]!, FileLinks, Retainers] } satisfies Feature;
