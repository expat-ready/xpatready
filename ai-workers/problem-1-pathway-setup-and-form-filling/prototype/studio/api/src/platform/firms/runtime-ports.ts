// PF-5 part 1: the ports the running app gives the sign-up, from PF-24's configuration (platformConfig, which also takes
// the Stripe key out of process.env) and PF-4's identity setting. Audit is real (PF-0p's interim AuditPort); the clock is
// the system's; jobs are PF-14's runner (taken by PlatformSignUp); mail is PF-0p's fakeMail until PF-4b's sender.
//   * billing: the Stripe adapter when a Stripe key is set (config refuses a live key outside production); with none, the
//     fake only on a local server (no network);
//   * identity: the local stand-in only with PLATFORM_IDENTITY=local (which PF-4 refuses outside local); Cognito's
//     user-pool sign-up is part 2's adapter.
// Anything missing leaves the door shut with a reason (503 SIGNUP_NOT_SET_UP), never a "check your email" that sends
// nothing (review Major 1).
import { fakeBilling } from "../../../../ports/billing.ts";
import { systemClock } from "../../../../ports/clock.ts";
import { fakeMail } from "../../../../ports/mail.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { StripeBilling } from "../billing/stripe.ts";
import { platformConfig, type PlatformConfig } from "../config/settings.ts";
import { identityConfig, type IdentityConfig } from "../identity/port.ts";
import { LocalSignUp } from "./signup-identity.ts";
import type { SignUpPorts } from "./signup.ts";

export function runtimeSignUpPorts(config: Pick<PlatformConfig, "environment" | "stripe"> = platformConfig(), identity: IdentityConfig = identityConfig(), env: NodeJS.ProcessEnv = process.env): SignUpPorts {
  const key = config.stripe.secretKey?.reveal() ?? null;
  const local = config.environment === "local";
  const notReady = identity.identity !== "local" ? "the identity provider's sign-up is not set up on this server (PF-5 part 2: Cognito)"
    : !key && !local ? "Stripe is not set up on this server (PLATFORM_STRIPE_SECRET_KEY)" : null;
  return {
    audit: auditEvent, clock: systemClock, mail: fakeMail(), identity: new LocalSignUp(() => systemClock.now()),
    billing: key ? StripeBilling.fromKey(key) : fakeBilling(), notReady,
    appUrl: env.STUDIO_PUBLIC_URL ?? `http://localhost:${env.STUDIO_PORT ?? 4400}`,
  };
}
