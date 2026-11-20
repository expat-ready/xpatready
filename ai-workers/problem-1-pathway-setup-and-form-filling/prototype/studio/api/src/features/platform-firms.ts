// PF-5 part 1 (contracts §7 §1.1; P-566): the public sign-up door, its verification and the plans read, behind
// BillingPort and the identity provider's sign-up.
// PF-19r part 3 (R1.47): its mail is the app's MESSAGES_MAIL (MailPort over MessagePort), never a stand-in.
import type { Feature } from "../features.ts";
import { PlatformSignUp, PlatformSignUpController, SIGNUP_PORTS } from "../platform/firms/routes.ts";
import { runtimeSignUpPorts } from "../platform/firms/runtime-ports.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

export default { controllers: [PlatformSignUpController], providers: [PlatformSignUp, { provide: SIGNUP_PORTS, useFactory: (mail: MailPort) => runtimeSignUpPorts(undefined, undefined, undefined, mail), inject: [MESSAGES_MAIL] }] } satisfies Feature;
