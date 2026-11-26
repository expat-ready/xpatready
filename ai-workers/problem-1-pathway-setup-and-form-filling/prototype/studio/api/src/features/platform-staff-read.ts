// PF-4b (contracts §1.2, §7): staff reads, web session, invitation acceptance. The provider's admin side follows
// PLATFORM_IDENTITY: local → the stand-in; otherwise the Cognito admin adapter (it refuses, saying why, until PF-4bc).
// PF-19r: MAIL_PORT is the app's MailPort over MessagePort (MESSAGES_MAIL, features/platform-messages.ts), so the
// invitation and the two-step reset notice get the one layout, the firm's sender name, the consent gate and the daily cap.
import type { Feature } from "../features.ts";
import { PlatformClock, identityConfig } from "../platform/identity/port.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import { CognitoIdentityAdmin, IDENTITY_ADMIN_PORT, LocalIdentityAdmin } from "../platform/identity/session/provider.ts";
import { PlatformSessionController, PlatformSignInController, PublicInvitationController } from "../platform/identity/session/routes.ts";
import { PlatformSession } from "../platform/identity/session/service.ts";
import { LocalSignIn, NotSetUpSignIn, SIGN_IN_BOX, SIGN_IN_PORT, SignInDoor } from "../platform/identity/session/sign-in.ts";
import { platformConfig } from "../platform/config/settings.ts";
import { Secret } from "../platform/config/secret.ts";
import { aesGcmSecretBox } from "../platform/secret-box/aes-gcm.ts";
import { createHash, randomBytes } from "node:crypto";
import { StaffReadController } from "../platform/staff-read/routes.ts";
import { StaffReads } from "../platform/staff-read/service.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

const adminFrom = (clock: PlatformClock) => { const c = identityConfig(); return c.identity === "local" ? new LocalIdentityAdmin(() => clock.now()) : new CognitoIdentityAdmin(c.cognito); };
// PF-4bs part 2a: the sign-in page's provider side (the stand-in; elsewhere 503 until part 2b) and the box that seals its
// attempts: the server's key ring, or on a local server without one a random key for this run (an attempt is 15 minutes).
const signInFrom = (clock: PlatformClock) => { const c = identityConfig(); return c.identity === "local" ? new LocalSignIn(c.localSecret ? createHash("sha256").update(`pf4bs sign-in ${c.localSecret}`).digest() : randomBytes(32), () => clock.now()) : new NotSetUpSignIn(); };
const boxFrom = () => { const c = platformConfig(); return c.secretBox ? aesGcmSecretBox(c.secretBox) : c.environment === "local" ? aesGcmSecretBox({ current: 1, keys: new Map([[1, new Secret("sign-in attempt key (this run)", randomBytes(32).toString("base64"))]]) }) : null; };
export default {
  controllers: [PlatformSessionController, PlatformSignInController, PublicInvitationController, StaffReadController],
  providers: [{ provide: IDENTITY_ADMIN_PORT, useFactory: adminFrom, inject: [PlatformClock] }, { provide: MAIL_PORT, useExisting: MESSAGES_MAIL }, PlatformSession, StaffReads,
    { provide: SIGN_IN_PORT, useFactory: signInFrom, inject: [PlatformClock] }, { provide: SIGN_IN_BOX, useFactory: boxFrom }, SignInDoor],
} satisfies Feature;
