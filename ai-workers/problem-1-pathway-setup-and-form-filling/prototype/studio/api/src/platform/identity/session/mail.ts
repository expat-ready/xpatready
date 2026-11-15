// PF-4b (rows rev 14): MailPort's `local` adapter for staff and system email (the port itself is PF-0p's,
// ports/mail.ts). PF-19b later routes it through MessagePort with one line here. The brief names the demo inbox
// (demo_message), but its rows need a person link (link_id, a required foreign key): staff email cannot go there without
// a schema change, so this adapter keeps the emails in memory (newest 200) until the question on the PR is answered.
// It checks each email exactly as the port's fake does, and never writes a body to a log line.
import { MailMessage, type MailPort, type SentMail } from "../../../../../ports/mail.ts";

export const MAIL_PORT = Symbol("MailPort");
/** The Reply-To of staff and system email (Sample; the firm's own address once PF-19b sends for firms). */
export const SYSTEM_REPLY_TO = "no-reply@expatready.example";

export class LocalMail implements MailPort {
  private readonly kept: SentMail[] = [];
  private n = 0;
  constructor(private readonly now: () => number) {}
  async send(message: MailMessage) {
    const m = MailMessage.parse(message);
    const messageId = `local-${String(++this.n).padStart(6, "0")}`;
    this.kept.push({ ...m, to: m.to.toLowerCase(), firmId: m.firmId.toLowerCase(), messageId, sentAt: new Date(this.now()) });
    if (this.kept.length > 200) this.kept.shift();
    return { messageId };
  }
  inbox(address: string) { const a = address.trim().toLowerCase(); return this.kept.filter((m) => m.to === a).map((m) => ({ ...m })); }
}
