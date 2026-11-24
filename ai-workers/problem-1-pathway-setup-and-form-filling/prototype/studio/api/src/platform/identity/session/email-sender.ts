// PF-4b (AG-1-70: one send path): Cognito's custom email sender body. Cognito hands every email to our function with the
// code encrypted by our KMS key, set up by script, not the console (AWS, read 15 Nov 2026; PR body). Decrypt (the
// Encryption SDK in the deployed function; a fake in tests) → our words → MailPort. AdminCreateUser mail is never sent
// (we create users with SUPPRESS). No code or body is ever logged.
import type { MailPort } from "../../../../../ports/mail.ts";
import { MessageLimited, SYSTEM_PER_ADDRESS_HOUR } from "../../../../../ports/messages.ts";
import { heldOf } from "../../messages/send/mail.ts";
import { SYSTEM_REPLY_TO } from "./mail.ts";

export type CustomEmailEvent = {
  triggerSource: string;
  request: { type?: string; code?: string | null; userAttributes?: Record<string, string>; clientMetadata?: Record<string, string> };
};
export type SenderPorts = {
  decrypt(encrypted: string): Promise<string>;
  mail: MailPort;
  /** The firm the person belongs to, by the provider's subject or email (null: not one of our staff). */
  firmOf(who: { subject: string | null; email: string }): Promise<string | null>;
};

const WORDS: Record<string, { subject: string; text: (code: string) => string }> = {
  CustomEmailSender_ForgotPassword: { subject: "Reset your password", text: (c) => `Your code to reset your password is ${c}. If you did not ask for it, ignore this email: your password stays as it is.` },
  CustomEmailSender_SignUp: { subject: "Confirm your email", text: (c) => `Your code to confirm your email is ${c}.` },
  CustomEmailSender_ResendCode: { subject: "Your new code", text: (c) => `Your new code is ${c}.` },
  CustomEmailSender_Authentication: { subject: "Your sign-in code", text: (c) => `Your sign-in code is ${c}. If you are not signing in, change your password.` },
  CustomEmailSender_UpdateUserAttribute: { subject: "Confirm your new email", text: (c) => `Your code to confirm your new email address is ${c}.` },
  CustomEmailSender_VerifyUserAttribute: { subject: "Confirm your email", text: (c) => `Your code to confirm your email address is ${c}.` },
  CustomEmailSender_AccountTakeOverNotification: { subject: "A sign-in to your account was blocked", text: () => "Someone tried to sign in to your account and was stopped. If it was not you, change your password and tell your firm's Owner or Admin." },
};

const LIMITED = `at most ${SYSTEM_PER_ADDRESS_HOUR} account emails an hour go to one address`;

export async function handleCustomEmail(e: CustomEmailEvent, p: SenderPorts): Promise<{ sent: boolean; reason?: string }> {
  if (e.triggerSource === "CustomEmailSender_AdminCreateUser") return { sent: false, reason: "invitations are sent by us, never by the provider" };
  const words = Object.hasOwn(WORDS, e.triggerSource) ? WORDS[e.triggerSource] : undefined;   // never the prototype (break B5)
  if (!words) return { sent: false, reason: "not an email this product sends" };
  const email = e.request.userAttributes?.email?.trim().toLowerCase();
  if (!email) return { sent: false, reason: "no email address on the person" };
  const firmId = await p.firmOf({ subject: e.request.userAttributes?.sub ?? null, email });
  if (!firmId) return { sent: false, reason: "not a staff member of any firm here" };
  const needsCode = e.triggerSource !== "CustomEmailSender_AccountTakeOverNotification";
  if (needsCode && !e.request.code) return { sent: false, reason: "no code in the event" };
  const code = needsCode ? await p.decrypt(e.request.code!) : "";
  // PF-19e: the platform's account emails are limited per address an hour; above it nothing is sent, said so.
  const r = await p.mail.send({ firmId, to: email, replyTo: SYSTEM_REPLY_TO, subject: words.subject, text: words.text(code), class: "TRANSACTIONAL", templateKey: `identity.${e.triggerSource.replace("CustomEmailSender_", "").toLowerCase()}` }).catch((e: unknown) => { if (e instanceof MessageLimited) return null; throw e; });
  if (r === null) return { sent: false, reason: LIMITED };
  // PF-19r (break m5): written, but the firm's daily cap holds it until the next day: not reported as sent.
  return heldOf(r) ? { sent: false, reason: "held by the firm's daily email limit" } : { sent: true };
}
