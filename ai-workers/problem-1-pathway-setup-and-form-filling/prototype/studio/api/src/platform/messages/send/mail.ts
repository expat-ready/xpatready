// PF-19b (row 48; qa #1855, map rows 38 and 40): MailPort over MessagePort, so mail a module sends after the fact (a
// job's email: booking confirmations with their invite.ics, reminders, the host's copy) goes through the one sending path:
// the consent gate and suppression, the outbox, the worker, the daily cap and the channel adapter (`local` in the
// reference app, read back at GET /api/demo/platform-inbox). MailPort has no caller transaction, so each send is its own
// short transaction: the attachments are stored first through FilesPort (an orphan file at most, never a row, if the
// transaction rolls back), then the outbox row, then dispatch. It throws only when nothing will be sent (refused,
// suppressed, or the transaction failed), so the caller's job retries only then; a dispatch that fails after the commit
// is left to the sweep (SWEEP_AFTER_MS), never retried here, so one email is never two rows. The caller's idempotencyKey
// (a job key) makes a job run twice send once; without one, each call is its own email. On this path the Reply-To is the
// firm's contact address (row 47) and MailMessage.replyTo and templateKey are not used (the words are the caller's).
// PF-19p: a platform account email (`platformAccount: true`) becomes a platform account message (no firm, From
// "ExpatReady" at platform.account_mail_from), dispatched with no firm.
// PF-19e: with `system: true` (the app's MAIL_PORT: invitations, reset notices) a firm's email is the platform's own
// account and security mail (Messages.sendSystem: no daily cap, a per-address hourly limit, SystemMailLimited). On either
// path a suppressed address throws MailSuppressed (its address a field, never in the message).
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { FilesPort } from "../../../../../ports/files.ts";
import { normaliseAddress } from "../../../../../ports/consent.ts";
import { MailMessage, type MailPort } from "../../../../../ports/mail.ts";
import { MessageRefused, MessageSend, PlatformAccountSend, type MessagePort } from "../../../../../ports/messages.ts";
import { asBypass, firmScope } from "../../firm-scope.ts";
import { MailSuppressed } from "./system-mail.ts";

/** Messages' own system sender (PF-19e), not part of MessagePort. */
type SystemSender = { sendSystem(tx: Prisma.TransactionClient, input: MessageSend): ReturnType<MessagePort<Prisma.TransactionClient>["send"]> };

/** The key a mailed attachment is stored under (never under msg/, which MessagePort keeps for rendered messages). */
/** Each attachment has its own folder (its place in the email), so two names that clean alike never collide; a name the
 *  file store keeps for itself (.meta, .tmp) gets a "-" (break m3). */
export const attachmentKeyOf = (mailId: string, n: number, filename: string) => {
  const clean = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+/, "").slice(0, 120) || "file";
  return `mail/${mailId}/${n}/${/\.(meta|tmp)$/.test(clean) ? `${clean}-` : clean}`;
};

export class MessagesMail implements MailPort {
  constructor(private readonly d: { db: PrismaClient; messages: MessagePort<Prisma.TransactionClient> & Partial<SystemSender>; files: FilesPort; log?: (line: string) => void; system?: boolean }) {}

  async send(message: MailMessage): Promise<{ messageId: string }> {
    const m = MailMessage.parse(message);
    // MessagePort's gate judges a service or marketing message by its person's consent: the caller names the person.
    if (m.class !== "TRANSACTIONAL" && !m.person) throw new MessageRefused(`a ${m.class.toLowerCase()} email names its person (MailMessage.person)`);
    const mailId = randomUUID();
    try { normaliseAddress("EMAIL", m.to); } catch { throw new MessageRefused("not sent: the address is not a valid email address"); }
    if (!("firmId" in m)) {   // PF-19p: a platform account email
      const checked = PlatformAccountSend.safeParse({
        platformAccount: true, channel: "EMAIL", class: "TRANSACTIONAL", address: m.to,
        content: { subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }, idempotencyKey: `mail:${m.idempotencyKey ?? mailId}`,
      });
      if (!checked.success) throw new MessageRefused(`not sent: ${checked.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
      // PF-12: the row has no firm, so it is written as the system role (BYPASS_USES "platform.account.mail").
      const r = await asBypass("platform.account.mail", () => this.d.db.$transaction((tx) => this.d.messages.send(tx, checked.data)));
      await this.d.messages.dispatch(null, [r.outboxId]).catch((e: unknown) => this.d.log?.(`messages: dispatch of ${r.outboxId} failed (${e instanceof Error ? e.name : "error"}); the sweep sends it`));
      return { messageId: r.outboxId };
    }
    const { firmId } = firmScope(m.firmId);
    const input = {
      firmId, ...(m.person ? { person: m.person } : {}), channel: "EMAIL" as const, class: m.class, address: m.to,
      content: { subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }, idempotencyKey: `mail:${m.idempotencyKey ?? mailId}`,
    };
    // (Above: an address MailPort's schema takes and the channel does not (`a@b-.example`) is refused without quoting the
    // address, since a job runner keeps the error text: break M2.)
    // Checked before any file is stored (review m5): a message MessagePort refuses leaves nothing behind.
    const checked = MessageSend.safeParse(input);
    if (!checked.success) throw new MessageRefused(`not sent: ${checked.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    const system = this.d.system ? this.d.messages.sendSystem?.bind(this.d.messages) : undefined;
    if (this.d.system && (!system || m.class !== "TRANSACTIONAL")) throw new MessageRefused("not sent: system mail is TRANSACTIONAL, through Messages.sendSystem");
    const keys: string[] = [];
    for (const [n, a] of (m.attachments ?? []).entries()) keys.push((await this.d.files.put(firmId, attachmentKeyOf(mailId, n, a.filename), a.bytes, a.contentType)).key);
    const r = await this.d.db.$transaction((tx) => (system ? system(tx, { ...input, attachments: keys }) : this.d.messages.send(tx, { ...input, attachments: keys })));
    // Not sent and never will be (a repeated key may answer a row already SENT: that is a success).
    if (r.state === "SUPPRESSED") throw new MailSuppressed(normaliseAddress("EMAIL", m.to), r.reason);
    if (r.state === "FAILED" || r.state === "BOUNCED") throw new MessageRefused(`not sent: ${r.reason ?? r.state}`);
    // Committed: the worker or the sweep sends it. A dispatch failure here must not make the caller send it again.
    await this.d.messages.dispatch(firmId, [r.outboxId]).catch((e: unknown) => this.d.log?.(`messages: dispatch of ${r.outboxId} failed (${e instanceof Error ? e.name : "error"}); the sweep sends it`));
    return { messageId: r.outboxId };
  }
}
