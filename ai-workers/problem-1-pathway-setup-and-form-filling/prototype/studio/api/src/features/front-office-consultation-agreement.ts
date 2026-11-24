// FO-3c: the consultation agreement before the first consultation (api/src/front-office/booking/consultation-agreement/),
// on SigningPort's fake (the only adapter on main), the app's MailPort, PF-14's jobs and the retainer feature's file store
// (LocalFiles, provided by front-office-retainers.ts). Part 2 (Lead 10, 23 Nov): the outbox poller (live.ts) hands
// `booking.scheduled` and `booking.rescheduled` to `onBookingEvent` (its reads cross firms on the declared use
// poll.bypass.ts), and the reads follow the booking's visibility (the booking feature's Booking). Not wired here: FO-6's
// webhook route, which calls `signingEvent`.
import type { Feature } from "../features.ts";
import type { FilesPort } from "../../../ports/files.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { ConsultationAgreementController, ConsultationAgreementPublicController, ConsultationAgreements, CONSULTATION_AGREEMENT_PORTS, runtimeAgreementPorts } from "../front-office/booking/consultation-agreement/controller.ts";
import { LocalFiles } from "../front-office/files.ts";
import { AgreementPoll } from "../front-office/booking/consultation-agreement/live.ts";
import { Db } from "../core.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

export default { controllers: [ConsultationAgreementController, ConsultationAgreementPublicController], providers: [ConsultationAgreements,
  { provide: AgreementPoll, useFactory: (db: Db, a: ConsultationAgreements) => new AgreementPoll(db, a), inject: [Db, ConsultationAgreements] },
  { provide: CONSULTATION_AGREEMENT_PORTS, useFactory: (mail: MailPort, files: FilesPort) => runtimeAgreementPorts(mail, files), inject: [MESSAGES_MAIL, LocalFiles] }] } satisfies Feature;
