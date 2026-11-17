// PF-5t part 1 (checklist row 100): a new terms version asks again at the next sign-in; the firm's acceptances shown.
// PlatformTerms is also the guard's TERMS_GATE (identity/guard.ts): while a person has pending terms, every guarded staff
// route but GET me, the two me/terms routes and sign-out answers 428 TERMS_PENDING.
import type { Feature } from "../features.ts";
import { TERMS_GATE } from "../platform/terms/gate.ts";
import { PlatformTermsController } from "../platform/terms/routes.ts";
import { PlatformTerms } from "../platform/terms/service.ts";

export default { controllers: [PlatformTermsController], providers: [PlatformTerms, { provide: TERMS_GATE, useExisting: PlatformTerms }] } satisfies Feature;
