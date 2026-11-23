// FO-6d: send any PDF for signature (api/src/front-office/signing/any-document/): the send and read routes. The file store
// and links are the retainer feature's (LocalFiles, FileLinks), the clock the platform's. Part 2 adds the signing
// webhook's handler for kind OTHER and the signed copies on a person.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { LocalFiles } from "../front-office/files.ts";
import { AnyDocumentsController } from "../front-office/signing/any-document/routes.ts";
import { AnyDocuments } from "../front-office/signing/any-document/service.ts";
import { PlatformClock } from "../platform/identity/port.ts";

export default {
  controllers: [AnyDocumentsController],
  providers: [{ provide: AnyDocuments, useFactory: (db: Db, files: LocalFiles, clock: PlatformClock) => new AnyDocuments(db, files, { now: () => new Date(clock.now()) }), inject: [Db, LocalFiles, PlatformClock] }],
} satisfies Feature;
