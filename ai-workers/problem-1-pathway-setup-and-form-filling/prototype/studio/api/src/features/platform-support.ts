// PF-18b (AG-16-63): support tickets (api/src/platform/support/): their routes and SupportService. The ports the running
// app gives the service: the database; FO-5's local FilesPort and its signed links; audit real (PF-0p's AuditPort over
// audit_event); mail the app's MAIL_PORT (since PF-19r MailPort over MessagePort, MESSAGES_MAIL: the outbox, the gate and
// the daily cap; read back at GET /api/demo/platform-inbox). The support inbox is a Sample address (SUPPORT_INBOX).
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { FileLinks, LocalFiles } from "../front-office/files.ts";
import { filesProviders } from "../platform/files/choose.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
import { SupportController } from "../platform/support/routes.ts";
import { SupportService } from "../platform/support/support.ts";

export default {
  controllers: [SupportController],
  providers: [
    ...filesProviders, FileLinks,
    { provide: SupportService, useFactory: (db: Db, files: LocalFiles, mail: MailPort) => new SupportService({ db, files, audit: auditEvent, mail }),
      inject: [Db, LocalFiles, MAIL_PORT] },
  ],
} satisfies Feature;
