// PF-4b (rows rev 14): MailPort's in-memory adapter for staff and system email (the port is PF-0p's, ports/mail.ts).
// Tests only, since PF-19r: the running app binds MAIL_PORT to MessagesMail (MailPort over MessagePort); a test that
// builds its own providers may still give this one (newest 200 kept).
// It checks each email exactly as the port's fake does, and never writes a body to a log line.
import { MailMessage, mailFirmOf, type MailPort, type SentMail } from "../../../../../ports/mail.ts";

export const MAIL_PORT = Symbol("MailPort");
/** The Reply-To of staff and system email (Sample; the firm's own address once PF-19b sends for firms). */
export const SYSTEM_REPLY_TO = "no-reply@expatready.example";

export class LocalMail implements MailPort {
  private readonly kept: SentMail[] = [];
  private n = 0;
  constructor(private readonly now: () => number) {}
  async send(message: MailMessage) {
    const m = MailMessage.parse(message);
    const had = m.idempotencyKey ? this.kept.find((x) => mailFirmOf(x) === mailFirmOf(m) && x.idempotencyKey === m.idempotencyKey) : undefined;
    if (had) return { messageId: had.messageId };   // one key in one firm is one email (PF-19b)
    const messageId = `local-${String(++this.n).padStart(6, "0")}`;
    this.kept.push({ ...m, ...("firmId" in m ? { firmId: m.firmId.toLowerCase() } : {}), to: m.to.toLowerCase(), messageId, sentAt: new Date(this.now()) });
    if (this.kept.length > 200) this.kept.shift();
    return { messageId };
  }
  inbox(address: string) { const a = address.trim().toLowerCase(); return this.kept.filter((m) => m.to === a).map((m) => ({ ...m })); }
}
