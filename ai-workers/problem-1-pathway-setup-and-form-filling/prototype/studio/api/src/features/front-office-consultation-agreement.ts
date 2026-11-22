// FO-3c: the consultation agreement before the first consultation (api/src/front-office/booking/consultation-agreement/),
// on SigningPort's fake (the only adapter on main), the app's MailPort, PF-14's jobs and the retainer feature's file store
// (LocalFiles, provided by front-office-retainers.ts). Not wired here (J-104 lists them): the outbox poller that hands
// `booking.scheduled` to `onBookingEvent` (it crosses firms, so it needs a named bypass use in platform/firm-scope.ts),
// and FO-6's webhook route, which calls `signingEvent`.
import type { Feature } from "../features.ts";
import type { FilesPort } from "../../../ports/files.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { ConsultationAgreementController, ConsultationAgreementPublicController, ConsultationAgreements, CONSULTATION_AGREEMENT_PORTS, runtimeAgreementPorts } from "../front-office/booking/consultation-agreement/controller.ts";
import { LocalFiles } from "../front-office/files.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

export default { controllers: [ConsultationAgreementController, ConsultationAgreementPublicController], providers: [ConsultationAgreements,
  { provide: CONSULTATION_AGREEMENT_PORTS, useFactory: (mail: MailPort, files: FilesPort) => runtimeAgreementPorts(mail, files), inject: [MESSAGES_MAIL, LocalFiles] }] } satisfies Feature;
