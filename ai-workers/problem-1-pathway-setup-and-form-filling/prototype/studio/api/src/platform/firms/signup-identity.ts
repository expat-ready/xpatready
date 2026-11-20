// PF-5 part 1: the identity provider's side of self-serve sign-up (P-566). The person's password goes here and nowhere
// else: never into our tables, a log line, an audit line or an answer. The provider registers the person and sends its
// own verification email (a code, and our page's link with the code filled in); we only confirm the code.
//   * LocalSignUp: the local stand-in (PLATFORM_IDENTITY=local, never in test or production), mirroring Cognito's user-pool
//     sign-up: it keeps a hash of the code for 24 hours and the emails it sent in memory, and forgets the password.
//     PF-5v part 2 (QA-481): given a MailPort (the running app's MessagesMail), it also sends the email as a platform
//     account message (PF-19p: no firm yet) through the one send path, so a person reads it in the demo inbox
//     (GET /api/demo/platform-inbox) and can confirm the sign-up; without one (unit tests) it only keeps it in memory.
//   * Cognito's user-pool sign-up (SignUp, ConfirmSignUp; its email through PF-4b's custom sender) is part 2's adapter,
//     on the same interface.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { MailPort } from "../../../../ports/mail.ts";

export type SignUpMail = { to: string; subject: string; text: string; sentAt: Date };

export interface SignUpIdentity {
  readonly via: "local" | "cognito";
  /** Registers the person and sends the provider's verification email; `link(code)` is our page's link with the code. */
  register(input: { email: string; password: string; firmName: string; link: (code: string) => string }): Promise<{ subject: string }>;
  /** Whether `code` is the one the email carried (and is still valid). */
  confirm(input: { subject: string; code: string }): Promise<boolean>;
}

const hash = (s: string) => createHash("sha256").update(s).digest();
const DAY = 24 * 60 * 60 * 1000;

export class LocalSignUp implements SignUpIdentity {
  readonly via = "local" as const;
  private readonly codes = new Map<string, { hash: Buffer; until: number }>();
  private readonly mails: SignUpMail[] = [];
  constructor(private readonly now: () => Date, private readonly mail?: MailPort) {}

  async register(input: { email: string; password: string; firmName: string; link: (code: string) => string }) {
    const subject = `local-signup:${hash(`${input.email}:${randomInt(2 ** 47)}`).toString("hex").slice(0, 32)}`;
    const code = String(randomInt(1_000_000)).padStart(6, "0");
    this.codes.set(subject, { hash: hash(code), until: this.now().getTime() + DAY });
    const mail = { to: input.email, subject: "Your ExpatReady verification code", text: `Someone asked to sign up "${input.firmName}" with this email address.\nYour verification code is ${code}.\nOr open this link to confirm: ${input.link(code)}\nThe code lasts 24 hours. If you did not ask for this, ignore this email: nothing is set up without the code.` };
    this.mails.push({ ...mail, sentAt: this.now() });
    // Keyed by this registration (a new sign-up is a new registration and a new email). The email is sent before the
    // door stores its pending sign-up, as Cognito's SignUp sends its own; if that store then fails, the link answers
    // "not valid any more" and the person signs up again (review m1 of #2456; Cognito's adapter keeps the same order).
    if (this.mail) await this.mail.send({ platformAccount: true, ...mail, replyTo: "no-reply@expatready.com", class: "TRANSACTIONAL", templateKey: "platform.signup.verification", idempotencyKey: `signup:${subject}` });
    return { subject };
  }

  async confirm(input: { subject: string; code: string }) {
    const c = this.codes.get(input.subject);
    if (!c || c.until <= this.now().getTime() || !/^\d{6}$/.test(input.code)) return false;
    return timingSafeEqual(c.hash, hash(input.code));
  }

  /** The verification emails sent (the stand-in's inbox; tests and the local demo read it). */
  get sent(): SignUpMail[] { return this.mails.map((m) => ({ ...m, sentAt: new Date(m.sentAt) })); }
}
