// FO-2b: Corporate prospects (API only). The sales ports (SALES_PORTS: the audit port) come from front-office-sales.ts.
import type { Feature } from "../features.ts";
import { CorporateController } from "../front-office/sales/corporate/routes.ts";
import { Corporate } from "../front-office/sales/corporate/service.ts";

export default { controllers: [CorporateController], providers: [Corporate] } satisfies Feature;
