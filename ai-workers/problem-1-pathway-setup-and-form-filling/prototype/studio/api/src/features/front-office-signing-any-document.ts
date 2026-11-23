// FO-6d: send any PDF for signature (api/src/front-office/signing/any-document/): the routes, and the handler the signing
// webhook calls for a request of kind OTHER (registered once, here). The file store and links are the retainer
// feature's (LocalFiles, FileLinks), the clock the platform's; the MailPort is the one the signing feature set.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { LocalFiles } from "../front-office/files.ts";
import { registerSigningHandler, signingHandlerFor } from "../front-office/signing/handlers.ts";
import { AnyDocumentsController } from "../front-office/signing/any-document/routes.ts";
import { AnyDocuments } from "../front-office/signing/any-document/service.ts";
import { PlatformClock } from "../platform/identity/port.ts";

export default {
  controllers: [AnyDocumentsController],
  providers: [{ provide: AnyDocuments, useFactory: (db: Db, files: LocalFiles, clock: PlatformClock) => {
    const svc = new AnyDocuments(db, files, { now: () => new Date(clock.now()) });
    if (!signingHandlerFor("OTHER")) registerSigningHandler("OTHER", (call, firmId) => svc.onHook(call, firmId));
    return svc;
  }, inject: [Db, LocalFiles, PlatformClock] }],
} satisfies Feature;
