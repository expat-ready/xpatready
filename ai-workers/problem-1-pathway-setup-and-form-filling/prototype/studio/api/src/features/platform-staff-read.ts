// PF-4b (contracts §1.2, §7): the staff reads, the web session and invitation acceptance, behind PF-4's guard. The
// provider's admin side and MailPort follow PLATFORM_IDENTITY: local → the stand-ins; otherwise the Cognito admin
// adapter (it refuses, saying why, until its client passes the technology gate).
import type { Feature } from "../features.ts";
import { PlatformClock, identityConfig } from "../platform/identity/port.ts";
import { LocalMail, MAIL_PORT } from "../platform/identity/session/mail.ts";
import { CognitoIdentityAdmin, IDENTITY_ADMIN_PORT, LocalIdentityAdmin } from "../platform/identity/session/provider.ts";
import { PlatformSessionController, PublicInvitationController } from "../platform/identity/session/routes.ts";
import { PlatformSession } from "../platform/identity/session/service.ts";
import { StaffReadController } from "../platform/staff-read/routes.ts";
import { StaffReads } from "../platform/staff-read/service.ts";

const adminFrom = (clock: PlatformClock) => { const c = identityConfig(); return c.identity === "local" ? new LocalIdentityAdmin(() => clock.now()) : new CognitoIdentityAdmin(c.cognito); };
export default {
  controllers: [PlatformSessionController, PublicInvitationController, StaffReadController],
  providers: [{ provide: IDENTITY_ADMIN_PORT, useFactory: adminFrom, inject: [PlatformClock] }, { provide: MAIL_PORT, useFactory: (clock: PlatformClock) => new LocalMail(() => clock.now()), inject: [PlatformClock] }, PlatformSession, StaffReads],
} satisfies Feature;
