// PF-5 part 1: the ports the running app gives the sign-up, until each real adapter is wired. Audit is real (PF-0p's
// interim AuditPort); the clock is the system's; jobs are PF-14's runner (taken by PlatformSignUp). Interim, each named
// for the row that replaces it: billing is the Stripe adapter only with a test-mode key (PLATFORM_STRIPE_SECRET_KEY,
// never in a lane), else the fake (no network); the identity side is the local stand-in until part 2's Cognito sign-up;
// mail is PF-0p's fakeMail until PF-4b's sending adapter.
import { fakeBilling } from "../../../../ports/billing.ts";
import { systemClock } from "../../../../ports/clock.ts";
import { fakeMail } from "../../../../ports/mail.ts";
import { auditEvent } from "../audit/audit-event.ts";
import { StripeBilling } from "../billing/stripe.ts";
import { LocalSignUp } from "./signup-identity.ts";
import type { SignUpPorts } from "./signup.ts";

export function runtimeSignUpPorts(env: NodeJS.ProcessEnv = process.env): SignUpPorts {
  const key = env.PLATFORM_STRIPE_SECRET_KEY?.trim();
  return {
    audit: auditEvent, clock: systemClock, mail: fakeMail(), identity: new LocalSignUp(() => systemClock.now()),
    billing: key && /^(sk|rk)_test_/.test(key) ? StripeBilling.fromKey(key) : fakeBilling(),
    appUrl: env.STUDIO_PUBLIC_URL ?? `http://localhost:${env.STUDIO_PORT ?? 4400}`,
  };
}
