// PF-25: each firm's own web address — host routing for <address>.<PLATFORM_ADDRESS_SUFFIX> (unset: expatready.com; PF-8b F2b) and <address>.localhost, and the public
// availability and suggestion routes, and the firm.created catch-up at start (api/src/platform/web-address/). PF-25w: our own
// staff's address change (POST /api/system/firms/:id/web-address, PF-4s's system guard).
import type { Feature } from "../features.ts";
import { SystemWebAddressController, WebAddressCatchUp, WebAddressController, WebAddressHostRouting, webAddressesProvider } from "../platform/web-address/routes.ts";
export default { controllers: [WebAddressController, SystemWebAddressController], providers: [webAddressesProvider, WebAddressHostRouting, WebAddressCatchUp] } satisfies Feature;
