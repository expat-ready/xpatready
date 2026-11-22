// R1.90: our staff's private sign-up link route (PF-4s's /api/system plane) over PF-5's sign-up service (platform-firms.ts).
import type { Feature } from "../features.ts";
import { SignupLinkController } from "../platform/firms/signup-links.ts";

export default { controllers: [SignupLinkController] } satisfies Feature;
