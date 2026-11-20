// PF-5 part 1: the ports the running app gives the sign-up, from PF-24's configuration (platformConfig, which also takes
// the Stripe key out of process.env) and PF-4's identity setting. Audit is real (PF-0p's interim AuditPort); the clock is
// the system's; jobs are PF-14's runner (taken by PlatformSignUp); mail is the app's MailPort over MessagePort
// (MESSAGES_MAIL, given by features/platform-firms.ts; PF-19r part 3, R1.47): "You already have an account" gets the one
// layout, the firm's sender, the consent gate and the outbox like every other email. No mail given leaves the door shut.
//   * billing: the Stripe adapter when a Stripe key is set (config refuses a live key outside production); with none, the
//     fake only on a local server (no network);
//   * identity: the local stand-in only with PLATFORM_IDENTITY=local (which PF-4 refuses outside local); Cognito's
//     user-pool sign-up is part 2's adapter.
// Anything missing leaves the door shut with a reason (503 SIGNUP_NOT_SET_UP), never a "check your email" that sends
// nothing (review Major 1).
import { fakeBilling } from "../../../../ports/billing.ts";
import { systemClock } from "../../../../ports/clock.ts";
import type { MailPort } from "../../../../ports/mail.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { StripeBilling } from "../billing/stripe.ts";
import { platformConfig, type PlatformConfig } from "../config/settings.ts";
import { identityConfig, type IdentityConfig } from "../identity/port.ts";
import { LocalSignUp } from "./signup-identity.ts";
import type { SignUpPorts } from "./signup.ts";

/** Never reached (the door is shut without mail: `notReady`); a send here fails loudly rather than pretending. */
const refusingMail: MailPort = { send: async () => { throw new Error("sign-up: no MailPort given"); } };

export function runtimeSignUpPorts(config: Pick<PlatformConfig, "environment" | "stripe"> = platformConfig(), identity: IdentityConfig = identityConfig(), env: NodeJS.ProcessEnv = process.env, mail: MailPort | null = null): SignUpPorts {
  const key = config.stripe.secretKey?.reveal() ?? null;
  const local = config.environment === "local";
  const notReady = identity.identity !== "local" ? "the identity provider's sign-up is not set up on this server (PF-5 part 2: Cognito)"
    : !key && !local ? "Stripe is not set up on this server (PLATFORM_STRIPE_SECRET_KEY)"
    : !mail ? "email sending is not set up on this server (MailPort over MessagePort)" : null;
  return {
    audit: auditEvent, clock: systemClock, mail: mail ?? refusingMail, identity: new LocalSignUp(() => systemClock.now()),
    billing: key ? StripeBilling.fromKey(key) : fakeBilling(), notReady,
    appUrl: env.STUDIO_PUBLIC_URL ?? `http://localhost:${env.STUDIO_PORT ?? 4400}`,
  };
}
