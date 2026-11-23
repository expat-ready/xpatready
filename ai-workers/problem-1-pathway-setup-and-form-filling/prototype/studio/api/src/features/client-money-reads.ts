// FO-7q (R1.56): the money reads the screens use, paged on the server (api/src/client-money/reads/), on the app's
// database and the platform clock. Who sees which invoice (AG-6-1 §8, C5) is CS-MV1's MoneyVisibilityPort adapter
// (PgMoneyVisibility: the case side's caseScope and the front office's own-versus-all), in place of failClosed.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { InvoiceReads } from "../client-money/reads/invoices.ts";
import { PaymentReads } from "../client-money/reads/payments.ts";
import { InvoiceReadsController, PaymentReadsController } from "../client-money/reads/routes.ts";
import { PgMoneyVisibility } from "../client-money/visibility-adapter.ts";
import { PlatformClock } from "../platform/identity/port.ts";
const scopeOf = (db: Db) => { const v = new PgMoneyVisibility(db); return (ctx: Parameters<PgMoneyVisibility["scopeOf"]>[0]) => v.scopeOf(ctx); };
export default { controllers: [InvoiceReadsController, PaymentReadsController], providers: [
  { provide: InvoiceReads, useFactory: (db: Db, c: PlatformClock) => new InvoiceReads(db, scopeOf(db), { now: () => new Date(c.now()) }), inject: [Db, PlatformClock] },
  { provide: PaymentReads, useFactory: (db: Db, c: PlatformClock) => new PaymentReads(db, scopeOf(db), { now: () => new Date(c.now()) }), inject: [Db, PlatformClock] }] } satisfies Feature;
