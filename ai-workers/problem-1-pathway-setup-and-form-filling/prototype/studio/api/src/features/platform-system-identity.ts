// PF-4s: sign-in for ExpatReady's own staff on a pool of their own, the one guard of /api/system/* (APP_GUARD, after
// core.ts's and PF-4's) and the wall that keeps their sessions off every other path (api/src/platform/system-identity/).
// PlatformClock and IDENTITY_PORT are PF-4's own providers (features/platform-identity.ts), named again so each is one class.
import { APP_GUARD } from "@nestjs/core";
import type { Feature } from "../features.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { SystemGuard, SystemPlaneWall } from "../platform/system-identity/guard.ts";
import { SystemIdentityController, SystemStaffController } from "../platform/system-identity/routes.ts";
import { SystemStaffAccess } from "../platform/system-identity/staff.ts";
import { SYSTEM_IDENTITY_PORT, SystemIdentity, systemIdentityPortFromConfig } from "../platform/system-identity/service.ts";
export default {
  controllers: [SystemIdentityController, SystemStaffController],
  providers: [PlatformClock, { provide: SYSTEM_IDENTITY_PORT, useFactory: systemIdentityPortFromConfig, inject: [PlatformClock] }, SystemIdentity, SystemStaffAccess, SystemPlaneWall, SystemGuard, { provide: APP_GUARD, useExisting: SystemGuard }],
} satisfies Feature;
