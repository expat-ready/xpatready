// PF-18b (AG-16-63): support tickets (api/src/platform/support/): their routes and SupportService. The ports the running
// app gives the service: the database; FO-5's local FilesPort and its signed links; audit real (PF-0p's AuditPort over
// audit_event); mail the app's MAIL_PORT (PF-4b's LocalMail, the demo inbox) when one is provided, else PF-0p's fakeMail
// (kept in memory, nothing leaves the machine). The support inbox is a Sample address (SUPPORT_INBOX).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { fakeMail, type MailPort } from "../../../ports/mail.ts";
import { FileLinks, LocalFiles } from "../front-office/files.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import { SupportController } from "../platform/support/routes.ts";
import { SupportService } from "../platform/support/support.ts";

export default {
  controllers: [SupportController],
  providers: [
    LocalFiles, FileLinks,
    { provide: SupportService, useFactory: (db: Db, files: LocalFiles, mail?: MailPort) => new SupportService({ db, files, audit: auditEvent, mail: mail ?? fakeMail() }),
      inject: [Db, LocalFiles, { token: MAIL_PORT, optional: true }] },
  ],
} satisfies Feature;
