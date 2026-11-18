// PF-5 part 1 (contracts §7 §1.1; P-566): the public sign-up door, its verification and the plans read, behind
// BillingPort and the identity provider's sign-up. Part 2: Stripe's webhook, the billing and profile routes and the
// payment hold (an interceptor: it runs after the platform guard has named the staff member).
import { APP_INTERCEPTOR } from "@nestjs/core";
import type { Feature } from "../features.ts";
import { BILLING_PORTS, BillingController, PaymentHoldGate, PlatformBillingAccount, PlatformBillingEvents, StripeHookController } from "../platform/billing/routes.ts";
import { PlatformSignUp, PlatformSignUpController, SIGNUP_PORTS } from "../platform/firms/routes.ts";
import { runtimeBillingPorts, runtimeSignUpPorts } from "../platform/firms/runtime-ports.ts";

export default {
  controllers: [PlatformSignUpController, StripeHookController, BillingController],
  providers: [PlatformSignUp, { provide: SIGNUP_PORTS, useFactory: () => runtimeSignUpPorts() }, { provide: BILLING_PORTS, useFactory: () => runtimeBillingPorts() },
    PlatformBillingEvents, PlatformBillingAccount, PaymentHoldGate, { provide: APP_INTERCEPTOR, useExisting: PaymentHoldGate }],
} satisfies Feature;
