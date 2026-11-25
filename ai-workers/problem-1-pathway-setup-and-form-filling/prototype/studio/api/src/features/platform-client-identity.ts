// PF-4p part 1 (R1.62): clients' own sign-in plane, the one guard of /api/portal/* (APP_GUARD) and the client's own reads
// (api/src/platform/client-identity/). PlatformClock is PF-4's own provider (features/platform-identity.ts), named again
// so each is one class.
import { APP_GUARD } from "@nestjs/core";
import type { Feature } from "../features.ts";
import { ClientGuard } from "../platform/client-identity/guard.ts";
import { PortalController } from "../platform/client-identity/routes.ts";
import { CLIENT_IDENTITY_PORT, ClientIdentity, clientIdentityPortFromConfig } from "../platform/client-identity/service.ts";
import { PlatformClock } from "../platform/identity/port.ts";
export default {
  controllers: [PortalController],
  providers: [PlatformClock, { provide: CLIENT_IDENTITY_PORT, useFactory: clientIdentityPortFromConfig, inject: [PlatformClock] }, ClientIdentity, ClientGuard, { provide: APP_GUARD, useExisting: ClientGuard }],
} satisfies Feature;
