// PF-13 part 1a: the firm's branding (api/src/platform/branding/): GET|PUT /api/platform/branding. The one email layout
// reads it at send time (platform/messages/send/messages.ts, platform/messages/layout/).
import type { Feature } from "../features.ts";
import { BrandingController } from "../platform/branding/routes.ts";

export default { controllers: [BrandingController] } satisfies Feature;
