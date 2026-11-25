// FO-13i: the client identity check's routes (api/src/front-office/compliance/identity/), on the local FilesPort, the
// shared short-lived links (front-office/files.ts) and the platform clock (PF-4's).
import { Inject } from "@nestjs/common";
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { FileLinks, LocalFiles } from "../front-office/files.ts";
import { filesProviders } from "../platform/files/choose.ts";
import { IdentityChecksController } from "../front-office/compliance/identity/routes.ts";
import { IdentityChecks } from "../front-office/compliance/identity/service.ts";
import { PlatformClock } from "../platform/identity/port.ts";
[Db, LocalFiles, PlatformClock].forEach((t, i) => Inject(t)(IdentityChecks, undefined, i));
export default { controllers: [IdentityChecksController], providers: [...filesProviders, FileLinks, IdentityChecks] } satisfies Feature;
