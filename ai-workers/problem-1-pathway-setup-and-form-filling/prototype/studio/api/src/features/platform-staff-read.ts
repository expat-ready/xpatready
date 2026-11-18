// PF-4b (contracts §1.2, §7): staff reads, web session, invitation acceptance. The provider's admin side follows
// PLATFORM_IDENTITY: local → the stand-in; otherwise the Cognito admin adapter (it refuses, saying why, until PF-4bc).
// PF-19e: staff and system mail goes through the one send path (SYSTEM_MAIL: MessagesMail, sealed bodies, no daily cap).
import type { Feature } from "../features.ts";
import { PlatformClock, identityConfig } from "../platform/identity/port.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import { CognitoIdentityAdmin, IDENTITY_ADMIN_PORT, LocalIdentityAdmin } from "../platform/identity/session/provider.ts";
import { PlatformSessionController, PublicInvitationController } from "../platform/identity/session/routes.ts";
import { PlatformSession } from "../platform/identity/session/service.ts";
import { StaffReadController } from "../platform/staff-read/routes.ts";
import { StaffReads } from "../platform/staff-read/service.ts";
import { SYSTEM_MAIL } from "./platform-messages.ts";

const adminFrom = (clock: PlatformClock) => { const c = identityConfig(); return c.identity === "local" ? new LocalIdentityAdmin(() => clock.now()) : new CognitoIdentityAdmin(c.cognito); };
export default {
  controllers: [PlatformSessionController, PublicInvitationController, StaffReadController],
  providers: [{ provide: IDENTITY_ADMIN_PORT, useFactory: adminFrom, inject: [PlatformClock] }, { provide: MAIL_PORT, useExisting: SYSTEM_MAIL }, PlatformSession, StaffReads],
} satisfies Feature;
