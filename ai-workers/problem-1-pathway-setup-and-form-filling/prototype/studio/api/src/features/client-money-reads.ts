// FO-7q (R1.56): the money reads the screens use, paged on the server (api/src/client-money/reads/), on the app's
// database and the platform clock. The scope is fail closed (reads/visibility.ts) until the case-visibility port exists.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { InvoiceReads } from "../client-money/reads/invoices.ts";
import { PaymentReads } from "../client-money/reads/payments.ts";
import { InvoiceReadsController, PaymentReadsController } from "../client-money/reads/routes.ts";
import { failClosed } from "../client-money/reads/visibility.ts";
import { PlatformClock } from "../platform/identity/port.ts";
export default { controllers: [InvoiceReadsController, PaymentReadsController], providers: [
  { provide: InvoiceReads, useFactory: (db: Db, c: PlatformClock) => new InvoiceReads(db, failClosed, { now: () => new Date(c.now()) }), inject: [Db, PlatformClock] },
  { provide: PaymentReads, useFactory: (db: Db) => new PaymentReads(db, failClosed), inject: [Db] }] } satisfies Feature;
