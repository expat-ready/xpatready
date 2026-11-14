// PF-25: each firm's own web address — host routing for <address>.expatready.com and <address>.localhost, and the public
// availability and suggestion routes, and the firm.created catch-up at start (api/src/platform/web-address/).
import type { Feature } from "../features.ts";
import { WebAddressCatchUp, WebAddressController, WebAddressHostRouting, webAddressesProvider } from "../platform/web-address/routes.ts";
export default { controllers: [WebAddressController], providers: [webAddressesProvider, WebAddressHostRouting, WebAddressCatchUp] } satisfies Feature;
