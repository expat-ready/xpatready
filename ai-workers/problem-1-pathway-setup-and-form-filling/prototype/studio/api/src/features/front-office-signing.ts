// FO-6 part 3 and part 4a: retainer signing on the fake vendor (api/src/front-office/signing/): the state read and the provider's
// webhook door; the platform's MailPort for "Your signed agreement"; the file store is the retainer feature's
// (LocalFiles, front-office-retainers.ts) and the clock the platform's. The send step is called from FO-5's Send.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { LocalFiles } from "../front-office/files.ts";
import "../front-office/signing/email-code.ts";   // part 4a: registers the firm's email-code setting (P-564) at start
import { useSigningMail } from "../front-office/signing/handlers.ts";
import { SigningHooksController } from "../front-office/signing/hooks.ts";
import { SigningController } from "../front-office/signing/routes.ts";
import { Signing } from "../front-office/signing/service.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { MESSAGES_MAIL } from "./platform-messages.ts";

export default {
  controllers: [SigningController, SigningHooksController],
  providers: [{ provide: Signing, useFactory: (db: Db, files: LocalFiles, clock: PlatformClock, mail: MailPort) => { useSigningMail(mail); return new Signing(db, files, { now: () => new Date(clock.now()) }); }, inject: [Db, LocalFiles, PlatformClock, MESSAGES_MAIL] }],
} satisfies Feature;
