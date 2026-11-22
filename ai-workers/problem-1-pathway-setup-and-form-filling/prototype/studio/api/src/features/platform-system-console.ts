// PF-17 part 1 (R1.93): our team's console, read only: the firms list with health and usage (/api/system/firms). Its
// figures come from PF-15's reads, bound here as PF-15's own feature binds them (platform-entitlements.ts): the bound
// FilesPort for storage and the case side's PgCaseCount for cases, by the firm's key.
import { Db } from "../core.ts";
import type { Feature } from "../features.ts";
import { PgCaseCount } from "../case-count.ts";
import { boundFiles } from "../platform/files/choose.ts";
import { SystemFirms } from "../platform/system-console/firms.ts";
import { SystemFirmsController } from "../platform/system-console/routes.ts";

export default {
  controllers: [SystemFirmsController],
  providers: [{ provide: SystemFirms, useFactory: (db: Db) => new SystemFirms({ db, files: boundFiles(), cases: (firmKey, tx) => new PgCaseCount(tx, firmKey) }), inject: [Db] }],
} satisfies Feature;
