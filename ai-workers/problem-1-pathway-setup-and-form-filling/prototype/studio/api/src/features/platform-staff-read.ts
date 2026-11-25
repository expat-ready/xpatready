// PF-4b (contracts §1.2, §7): staff reads, web session, invitation acceptance. The provider's admin side follows
// PLATFORM_IDENTITY: local → the stand-in; otherwise the Cognito admin adapter (it refuses, saying why, until PF-4bc).
// PF-19r: MAIL_PORT is the app's MailPort over MessagePort (MESSAGES_MAIL, features/platform-messages.ts), so the
// invitation and the two-step reset notice get the one layout, the firm's sender name, the consent gate and the daily cap.
import type { Feature } from "../features.ts";
import { PlatformClock, identityConfig } from "../platform/identity/port.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import { CognitoIdentityAdmin, IDENTITY_ADMIN_PORT, LocalIdentityAdmin } from "../platform/identity/session/provider.ts";
import { PlatformSessionController, PublicInvitationController } from "../platform/identity/session/routes.ts";
import { PlatformSession } from "../platform/identity/session/service.ts";
import { StaffReadController } from "../platform/staff-read/routes.ts";
import { StaffReads } from "../platform/staff-read/service.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

const adminFrom = (clock: PlatformClock) => { const c = identityConfig(); return c.identity === "local" ? new LocalIdentityAdmin(() => clock.now()) : new CognitoIdentityAdmin(c.cognito); };
export default {
  controllers: [PlatformSessionController, PublicInvitationController, StaffReadController],
  providers: [{ provide: IDENTITY_ADMIN_PORT, useFactory: adminFrom, inject: [PlatformClock] }, { provide: MAIL_PORT, useExisting: MESSAGES_MAIL }, PlatformSession, StaffReads],
} satisfies Feature;
