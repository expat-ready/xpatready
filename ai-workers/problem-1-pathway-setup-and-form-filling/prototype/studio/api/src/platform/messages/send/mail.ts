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
import type { z } from "zod";
import { MailMessage, type FirmMail, type MailPort } from "../../../../../ports/mail.ts";
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

/** PF-19e: a MailPort that can also write a firm's TRANSACTIONAL email inside the caller's transaction (the outbox row
 *  commits or rolls back with the caller's change; `dispatch` after the commit). PlatformSession's reset uses it. */
export type InTransactionMail = { sendInTransaction(tx: Prisma.TransactionClient, message: MailMessage): Promise<{ messageId: string; dispatch(): Promise<void> }> };
export const canSendInTransaction = (m: MailPort): m is MailPort & InTransactionMail => typeof (m as Partial<InTransactionMail>).sendInTransaction === "function";

export class MessagesMail implements MailPort, InTransactionMail {
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
    const { firmId, input, write } = this.firmMail(m, mailId);
    const keys: string[] = [];
    for (const [n, a] of (m.attachments ?? []).entries()) keys.push((await this.d.files.put(firmId, attachmentKeyOf(mailId, n, a.filename), a.bytes, a.contentType)).key);
    const r = await this.d.db.$transaction((tx) => write(tx, { ...input, attachments: keys }));
    this.refused(r, m.to);
    // Committed: the worker or the sweep sends it. A dispatch failure here must not make the caller send it again.
    await this.dispatch(firmId, r.outboxId);
    return { messageId: r.outboxId };
  }

  /** PF-19e: a firm's TRANSACTIONAL email with no attachment, written in the caller's transaction (no second connection,
   *  no second transaction): refused or suppressed → it throws, and the caller's change rolls back with the row. */
  async sendInTransaction(tx: Prisma.TransactionClient, message: MailMessage): Promise<{ messageId: string; dispatch(): Promise<void> }> {
    const m = MailMessage.parse(message);
    if (!("firmId" in m) || m.class !== "TRANSACTIONAL" || m.attachments?.length) throw new MessageRefused("not sent: in a transaction, only a firm's TRANSACTIONAL email with no attachment");
    try { normaliseAddress("EMAIL", m.to); } catch { throw new MessageRefused("not sent: the address is not a valid email address"); }
    const { firmId, input, write } = this.firmMail(m, randomUUID());
    const r = await write(tx, { ...input, attachments: [] });
    this.refused(r, m.to);
    return { messageId: r.outboxId, dispatch: () => this.dispatch(firmId, r.outboxId) };
  }

  /** A firm email's MessagePort input, checked (before any file is stored: review m5), and the writer: sendSystem for the
   *  system sender (PF-19e), else send. */
  private firmMail(m: z.output<typeof FirmMail>, mailId: string) {
    const { firmId } = firmScope(m.firmId);
    const input = {
      firmId, ...(m.person ? { person: m.person } : {}), channel: "EMAIL" as const, class: m.class, address: m.to,
      content: { subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }, idempotencyKey: `mail:${m.idempotencyKey ?? mailId}`,
    };
    // (Above: an address MailPort's schema takes and the channel does not (`a@b-.example`) is refused without quoting the
    // address, since a job runner keeps the error text: break M2.)
    const checked = MessageSend.safeParse(input);
    if (!checked.success) throw new MessageRefused(`not sent: ${checked.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    const system = this.d.system ? this.d.messages.sendSystem?.bind(this.d.messages) : undefined;
    if (this.d.system && (!system || m.class !== "TRANSACTIONAL")) throw new MessageRefused("not sent: system mail is TRANSACTIONAL, through Messages.sendSystem");
    const write = (tx: Prisma.TransactionClient, i: MessageSend) => (system ? system(tx, i) : this.d.messages.send(tx, i));
    return { firmId, input, write };
  }
  /** Not sent and never will be (a repeated key may answer a row already SENT: that is a success). */
  private refused(r: { state: string; reason: string | null }, to: string) {
    if (r.state === "SUPPRESSED") throw new MailSuppressed(normaliseAddress("EMAIL", to), r.reason);
    if (r.state === "FAILED" || r.state === "BOUNCED") throw new MessageRefused(`not sent: ${r.reason ?? r.state}`);
  }
  private dispatch(firmId: string, outboxId: string) {
    return this.d.messages.dispatch(firmId, [outboxId]).catch((e: unknown) => this.d.log?.(`messages: dispatch of ${outboxId} failed (${e instanceof Error ? e.name : "error"}); the sweep sends it`));
  }
}
