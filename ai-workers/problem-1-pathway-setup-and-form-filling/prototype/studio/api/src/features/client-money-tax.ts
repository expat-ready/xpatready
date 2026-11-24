// FO-7g part 1 (R1.56): the tax default by province from the cited GST/HST table (api/src/client-money/tax/), on the
// app's database. Read only.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { TaxDefaultController, TaxDefaults } from "../client-money/tax/routes.ts";
import { moneyScopeOf } from "../client-money/visibility-adapter.ts";
export default { controllers: [TaxDefaultController], providers: [{ provide: TaxDefaults, useFactory: (db: Db) => new TaxDefaults(db, moneyScopeOf(db)), inject: [Db] }] } satisfies Feature;
