// PF-19b (row 48; qa #1855, map rows 38 and 40): MailPort over MessagePort, so mail a module sends after the fact (a
// job's email: booking confirmations with their invite.ics, reminders, the host's copy) goes through the one sending path:
// the consent gate and suppression, the outbox, the worker, the daily cap and the channel adapter (`local` in the
// reference app, read back at GET /api/demo/platform-inbox). MailPort has no caller transaction, so each send is its own
// short transaction: the attachments are stored first through FilesPort (an orphan file at most, never a row, if the
// transaction rolls back), then the outbox row, then dispatch. It throws only when nothing will be sent (refused,
// suppressed, or the transaction failed), so the caller's job retries only then; a dispatch that fails after the commit
// is left to the sweep (SWEEP_AFTER_MS), never retried here, so one email is never two rows.
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { FilesPort } from "../../../../../ports/files.ts";
import { MailMessage, type MailPort } from "../../../../../ports/mail.ts";
import { MessageRefused, type MessagePort } from "../../../../../ports/messages.ts";
import { firmScope } from "../../firm-scope.ts";

/** The key a mailed attachment is stored under (never under msg/, which MessagePort keeps for rendered messages). */
export const attachmentKeyOf = (mailId: string, filename: string) => `mail/${mailId}/${filename.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[._-]+/, "").slice(0, 120) || "file"}`;

export class MessagesMail implements MailPort {
  constructor(private readonly d: { db: PrismaClient; messages: MessagePort<Prisma.TransactionClient>; files: FilesPort; log?: (line: string) => void }) {}

  async send(message: MailMessage): Promise<{ messageId: string }> {
    const m = MailMessage.parse(message);
    // MessagePort's gate judges a service or marketing message by its person's consent: the caller names the person.
    if (m.class !== "TRANSACTIONAL" && !m.person) throw new MessageRefused(`a ${m.class.toLowerCase()} email names its person (MailMessage.person)`);
    const { firmId } = firmScope(m.firmId), mailId = randomUUID();
    const keys: string[] = [];
    for (const a of m.attachments ?? []) keys.push((await this.d.files.put(firmId, attachmentKeyOf(mailId, a.filename), a.bytes, a.contentType)).key);
    const r = await this.d.db.$transaction((tx) => this.d.messages.send(tx, {
      firmId, ...(m.person ? { person: m.person } : {}), channel: "EMAIL", class: m.class, address: m.to,
      content: { subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}) }, attachments: keys, idempotencyKey: `mail:${mailId}`,
    }));
    if (r.state !== "QUEUED") throw new MessageRefused(`not sent: ${r.reason ?? r.state}`);
    // Committed: the worker or the sweep sends it. A dispatch failure here must not make the caller send it again.
    await this.d.messages.dispatch(firmId, [r.outboxId]).catch((e: unknown) => this.d.log?.(`messages: dispatch of ${r.outboxId} failed (${e instanceof Error ? e.name : "error"}); the sweep sends it`));
    return { messageId: r.outboxId };
  }
}
