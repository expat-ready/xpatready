// PF-31 part (c): the shared If-Match / ETag door for staff edits (api/src/platform/http/if-match.ts), on every route.
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { Feature } from "../features.ts";
import { IfMatchVersion } from "../platform/http/if-match.ts";

export default { providers: [IfMatchVersion, { provide: APP_INTERCEPTOR, useExisting: IfMatchVersion }] } satisfies Feature;
