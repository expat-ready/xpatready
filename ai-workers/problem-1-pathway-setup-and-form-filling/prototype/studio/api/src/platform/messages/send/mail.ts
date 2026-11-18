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
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { FilesPort } from "../../../../../ports/files.ts";
import { normaliseAddress } from "../../../../../ports/consent.ts";
import { MailMessage, type MailPort } from "../../../../../ports/mail.ts";
import { MessageRefused, MessageSend, type MessagePort, type SendResult } from "../../../../../ports/messages.ts";
import { firmScope } from "../../firm-scope.ts";

/** The key a mailed attachment is stored under (never under msg/, which MessagePort keeps for rendered messages). */
/** Each attachment has its own folder (its place in the email), so two names that clean alike never collide; a name the
 *  file store keeps for itself (.meta, .tmp) gets a "-" (break m3). */
export const attachmentKeyOf = (mailId: string, n: number, filename: string) => {
  const clean = filename.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+/, "").slice(0, 120) || "file";
  return `mail/${mailId}/${n}/${/\.(meta|tmp)$/.test(clean) ? `${clean}-` : clean}`;
};

export class MessagesMail implements MailPort {
  constructor(private readonly d: { db: PrismaClient; messages: MessagePort<Prisma.TransactionClient>; files: FilesPort; log?: (line: string) => void }) {}

  async send(message: MailMessage): Promise<{ messageId: string }> {
    const sent = await this.write(message, (put) => this.d.db.$transaction(put));
    await sent.dispatch();
    return { messageId: sent.messageId };
  }

  /** PF-19r: the same email written inside the caller's own transaction (a refusal rolls the caller's change back, and a
   *  rolled-back change sends nothing); the caller runs `dispatch` after its commit. For a caller that holds a row lock
   *  the outbox also takes (the firm's row, on a firm's first message), so its email never waits on its own lock. */
  async sendIn(tx: Prisma.TransactionClient, message: MailMessage): Promise<{ messageId: string; dispatch: () => Promise<void> }> {
    return this.write(message, (put) => put(tx));
  }

  private async write(message: MailMessage, inTx: (put: (tx: Prisma.TransactionClient) => Promise<SendResult>) => Promise<SendResult>) {
    const m = MailMessage.parse(message);
    // MessagePort's gate judges a service or marketing message by its person's consent: the caller names the person.
    if (m.class !== "TRANSACTIONAL" && !m.person) throw new MessageRefused(`a ${m.class.toLowerCase()} email names its person (MailMessage.person)`);
    const { firmId } = firmScope(m.firmId), mailId = randomUUID();
    const input = {
      firmId, ...(m.person ? { person: m.person } : {}), channel: "EMAIL" as const, class: m.class, address: m.to,
      content: { subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }, idempotencyKey: `mail:${m.idempotencyKey ?? mailId}`,
    };
    // An address MailPort's schema takes and the channel does not (`a@b-.example`): a refusal that never quotes the
    // address, since a job runner keeps the error text (break M2).
    try { normaliseAddress("EMAIL", m.to); } catch { throw new MessageRefused("not sent: the address is not a valid email address"); }
    // Checked before any file is stored (review m5): a message MessagePort refuses leaves nothing behind.
    const checked = MessageSend.safeParse(input);
    if (!checked.success) throw new MessageRefused(`not sent: ${checked.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    const keys: string[] = [];
    for (const [n, a] of (m.attachments ?? []).entries()) keys.push((await this.d.files.put(firmId, attachmentKeyOf(mailId, n, a.filename), a.bytes, a.contentType)).key);
    const r = await inTx((tx) => this.d.messages.send(tx, { ...input, attachments: keys }));
    // Not sent and never will be (a repeated key may answer a row already SENT: that is a success).
    if (r.state === "SUPPRESSED" || r.state === "FAILED" || r.state === "BOUNCED") throw new MessageRefused(`not sent: ${r.reason ?? r.state}`);
    // Committed: the worker or the sweep sends it. A dispatch failure here must not make the caller send it again.
    const dispatch = () => this.d.messages.dispatch(firmId, [r.outboxId]).catch((e: unknown) => this.d.log?.(`messages: dispatch of ${r.outboxId} failed (${e instanceof Error ? e.name : "error"}); the sweep sends it`));
    return { messageId: r.outboxId, dispatch };
  }
}

/** PF-19r: an email written in the caller's transaction when its MailPort can (MessagesMail.sendIn), else sent at once
 *  (a test's LocalMail or fakeMail). The caller runs the answer after its commit. */
export async function mailIn(mail: MailPort, tx: Prisma.TransactionClient, message: MailMessage): Promise<() => Promise<void>> {
  if (mail instanceof MessagesMail) return (await mail.sendIn(tx, message)).dispatch;
  await mail.send(message);
  return async () => {};
}
