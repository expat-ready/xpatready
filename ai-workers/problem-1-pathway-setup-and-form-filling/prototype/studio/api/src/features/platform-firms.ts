// PF-5 part 1 (contracts §7 §1.1; P-566): the public sign-up door, its verification and the plans read, behind
// BillingPort and the identity provider's sign-up.
import type { Feature } from "../features.ts";
import { PlatformSignUp, PlatformSignUpController, SIGNUP_PORTS } from "../platform/firms/routes.ts";
import { runtimeSignUpPorts } from "../platform/firms/runtime-ports.ts";

export default { controllers: [PlatformSignUpController], providers: [PlatformSignUp, { provide: SIGNUP_PORTS, useFactory: () => runtimeSignUpPorts() }] } satisfies Feature;
