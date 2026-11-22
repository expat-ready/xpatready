// FO-7b part 1a (QA-482; R1.59): draft invoices with tax rounded per line (api/src/client-money/invoices/), on the app's
// database and AuditPort's adapter over audit_event. Part 1b (R1.56, R1.60): issue, payments recorded by hand with their
// receipts, credit notes and the documents (InvoiceMoney), on the platform clock and the app's MailPort when one is bound
// (MAIL_PORT: MessagePort's outbox in the running app); ClientMoney is ClientMoneyPort's adapter for other modules.
import type { Feature } from "../features.ts";
import { Db } from "../core.ts";
import { InvoiceDrafts } from "../client-money/invoices/drafts.ts";
import { InvoiceMoney } from "../client-money/invoices/money.ts";
import { InvoiceDraftsController, InvoiceMoneyController } from "../client-money/invoices/routes.ts";
import { ClientMoney } from "../client-money/port.ts";
import type { MailPort } from "../../../ports/mail.ts";
import { auditEvent } from "../platform/audit/audit-event.ts";
import { PlatformClock } from "../platform/identity/port.ts";
import { MAIL_PORT } from "../platform/identity/session/mail.ts";
const clockOf = (c: PlatformClock) => ({ now: () => new Date(c.now()) });
export default { controllers: [InvoiceDraftsController, InvoiceMoneyController], providers: [
  { provide: InvoiceDrafts, useFactory: (db: Db, c: PlatformClock) => new InvoiceDrafts(db, auditEvent, undefined, clockOf(c)), inject: [Db, PlatformClock] },
  { provide: InvoiceMoney, useFactory: (db: Db, c: PlatformClock, mail?: MailPort) => new InvoiceMoney(db, auditEvent, clockOf(c), mail ?? null), inject: [Db, PlatformClock, { token: MAIL_PORT, optional: true }] },
  { provide: ClientMoney, useFactory: (db: Db) => new ClientMoney(db), inject: [Db] }] } satisfies Feature;
