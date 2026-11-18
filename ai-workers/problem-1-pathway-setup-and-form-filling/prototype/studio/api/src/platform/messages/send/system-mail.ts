// PF-19e (Lead B brief rev 16.64, items 3 and 4): staff and system mail (invitations, sign-in and reset notices) sent by
// the platform, the system actor, through the one send path (MessagesMail with `system: true`, the app's MAIL_PORT).
//  * Such a message is TRANSACTIONAL and its outbox row's idempotency key starts SYSTEM_KEY_PREFIX: only
//    Messages.sendSystem writes that prefix (Messages.send refuses it), so no firm's own message can claim the exemption.
//  * It is exempt from the firm's daily cap (DAILY_CAP) and is not counted in it; instead at most SYSTEM_PER_ADDRESS_HOUR
//    such messages an hour go to one address in one firm (Sample), then SystemMailLimited (the route's 429).
//  * A suppressed address: MailSuppressed (the route's 409, with an audit line); the address stays suppressed.
// Neither error's message quotes the address (a job runner keeps error text); the address is a field for the route.
import { MessageRefused } from "../../../../../ports/messages.ts";

export const SYSTEM_KEY_PREFIX = "system:";
/** Sample (P-170: no expert value): account and security emails to one address in one firm in one hour. */
export const SYSTEM_PER_ADDRESS_HOUR = 5;
export const SYSTEM_LIMIT_WORDS = "Too many account emails went to this address in the last hour. Try again in an hour.";
export const suppressedWords = (address: string) => `We couldn't send email to ${address}. Ask your firm's Owner or Admin to check it.`;

/** Not sent: the address is on the firm's suppression list (a bounce or a complaint). */
export class MailSuppressed extends MessageRefused {
  constructor(readonly address: string, reason: string | null) { super(`not sent: ${reason ?? "SUPPRESSED"}`); this.name = "MessageRefused"; }
}
/** Not sent: the platform's per-address limit for account and security email (SYSTEM_PER_ADDRESS_HOUR). */
export class SystemMailLimited extends MessageRefused {
  constructor() { super(`not sent: more than ${SYSTEM_PER_ADDRESS_HOUR} account emails to one address in an hour`); this.name = "MessageRefused"; }
}
