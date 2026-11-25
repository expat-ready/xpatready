// PF-0p (rows rev 16): the mail port (contracts §0.3: the demo inbox in the reference app; Amazon SES Canada in the test
// environment, PF-4b's adapter). Every email the product sends goes through MailPort.send. This folder imports only zod
// and its own files.
// PF-19p (Lead B rev 16.62, #1955): an email is either a firm's (`firmId`) or a platform account email (`platformAccount:
// true`) to a person before any firm exists, never both and never neither. A platform account email is a system email
// only: TRANSACTIONAL, no person, no attachment (never marketing, never a copy); it is sent as "ExpatReady" (MessagePort's
// adapter sets From and Reply-To from platform.account_mail_from).
import { z } from "zod";
import { FirmId } from "./audit.ts";
import { FAKE_NOW, type ClockPort } from "./clock.ts";
import { Subject } from "./consent.ts";

/** Why the email is sent: TRANSACTIONAL (a person's own action: a code, a link, a receipt), SERVICE (about the firm's
 *  account or a case: reminders, notices) or MARKETING (needs consent; the consent store, PF-19a, decides). */
export const MailClass = z.enum(["TRANSACTIONAL", "SERVICE", "MARKETING"]);
export type MailClass = z.infer<typeof MailClass>;

export const MailAttachment = z.strictObject({
  filename: z.string().min(1).max(200).regex(/^[^/\\]+$/, "a file name, not a path"),
  contentType: z.string().regex(/^[\w.+-]+\/[\w.+-]+(;.*)?$/, "a media type"),
  bytes: z.instanceof(Uint8Array).refine((b) => b.byteLength > 0, "an attachment has content"),
});

const MailFields = {
  to: z.email(),
  replyTo: z.email(),
  subject: z.string().trim().min(1).max(200),
  text: z.string().min(1),
  html: z.string().min(1).optional(),
  attachments: z.array(MailAttachment).max(10).optional(),
  class: MailClass,
  /** The template the words came from (`booking.confirmed`), when one did. */
  templateKey: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/).max(100).optional(),
  /** The person the email is to (PF-19b: MessagePort's consent gate judges a SERVICE or MARKETING email by its person). */
  person: Subject.optional(),
  /** The sender's key (PF-19b, review m2): the same key in the same firm is the same email, so a job run twice sends
   *  once. A caller with a job passes its job key. */
  idempotencyKey: z.string().min(1).max(180).optional(),
};
export const FirmMail = z.strictObject({ platformAccount: z.undefined().optional(), firmId: FirmId, ...MailFields });
/** PF-19p: a platform account email (no firm). */
export const PlatformAccountMail = z.strictObject({
  platformAccount: z.literal(true), ...MailFields,
  class: z.literal("TRANSACTIONAL"), person: z.undefined().optional(), attachments: z.undefined().optional(),
});
/** Either a firm's email or a platform account email, chosen by `platformAccount`: each side is strict, so both is
 *  refused (an unknown key) and neither is refused as a firm email without its firmId. */
export const MailMessage = z.discriminatedUnion("platformAccount", [FirmMail, PlatformAccountMail]);
export type MailMessage = z.input<typeof MailMessage>;
/** The firm an email is sent for, or null for a platform account email (PF-19p). */
export const mailFirmOf = (m: z.output<typeof MailMessage>): string | null => ("firmId" in m ? m.firmId.toLowerCase() : null);

export interface MailPort {
  /** Sends one email; resolves with the sender's message id. Throws when refused or not sent. */
  send(message: MailMessage): Promise<{ messageId: string }>;
}

/** A sent email as the fake keeps it (the demo inbox's shape: newest last here; the inbox page lists newest first). */
export type SentMail = z.output<typeof MailMessage> & { messageId: string; sentAt: Date };

export type FakeMail = MailPort & {
  /** Every email sent, in the order sent. */
  readonly sent: ReadonlyArray<SentMail>;
  /** The emails to one address, in the order sent (addresses compare in lower case). */
  inbox(address: string): SentMail[];
};

/** A copy of a sent email, so a test reading the record can never change it. */
const copy = (m: SentMail): SentMail => ({ ...m, sentAt: new Date(m.sentAt), ...(m.attachments ? { attachments: m.attachments.map((a) => ({ ...a, bytes: new Uint8Array(a.bytes) })) } : {}) }) as SentMail;

/** The fake: checks each email like the real adapter, keeps it in a list, and fails when `failOn` matches. `sentAt` is the
 *  clock's now (`clock`, else FAKE_NOW: never the wall clock). */
export function fakeMail(opts: { failOn?: (m: z.output<typeof MailMessage>) => boolean; clock?: ClockPort } = {}): FakeMail {
  const sent: SentMail[] = [];
  return {
    async send(message) {
      const m = MailMessage.parse(message);
      if (m.attachments) m.attachments = m.attachments.map((a) => ({ ...a, bytes: new Uint8Array(a.bytes) }));   // the record keeps its own bytes
      const had = m.idempotencyKey ? sent.find((x) => mailFirmOf(x) === mailFirmOf(m) && x.idempotencyKey === m.idempotencyKey) : undefined;
      if (had) return { messageId: had.messageId };   // one key in one firm (or among platform account emails) is one email (PF-19b)
      if (opts.failOn?.(m)) throw new Error(`forced mail failure: ${m.subject}`);
      const messageId = `fake-${String(sent.length + 1).padStart(6, "0")}`;
      sent.push({ ...m, ...("firmId" in m ? { firmId: m.firmId.toLowerCase() } : {}), to: m.to.toLowerCase(), messageId, sentAt: opts.clock ? opts.clock.now() : new Date(FAKE_NOW) });
      return { messageId };
    },
    get sent() { return sent.map(copy); },
    inbox(address) { const a = address.trim().toLowerCase(); return sent.filter((m) => m.to === a).map(copy); },
  };
}
