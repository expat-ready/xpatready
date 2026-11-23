// PF-16 (trial banner part): GET /api/platform/billing/banner over our own record and BillingPort (BILLING_PORTS, given by
// platform-firms.ts); read only.
import type { Feature } from "../features.ts";
import { BillingBanner, BillingBannerController } from "../platform/billing/banner.ts";

export default { controllers: [BillingBannerController], providers: [BillingBanner] } satisfies Feature;
