// PF-4b (AG-1-70: one send path): the identity provider's custom email sender. Cognito hands every email it would send
// to our function ("The Lambda triggers CustomEmailSender and CustomSMSSender support third-party email and SMS
// notifications in user pools"), with the code encrypted ("Amazon Cognito encrypts these secrets with an AWS KMS
// customer managed key and the AWS Encryption SDK"); setting it up is a script, not the console ("These configurations
// aren't available from Amazon Cognito console"): AWS, read 15 Nov 2026. This handler is that function's body: decrypt
// (the deployed function passes the Encryption SDK's decrypt; tests a fake) → our words → MailPort. AdminCreateUser
// mail never comes (we create users with SUPPRESS); if it does, nothing is sent. No code or body is ever logged.
import type { MailPort } from "../../../../../ports/mail.ts";
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

export async function handleCustomEmail(e: CustomEmailEvent, p: SenderPorts): Promise<{ sent: boolean; reason?: string }> {
  if (e.triggerSource === "CustomEmailSender_AdminCreateUser") return { sent: false, reason: "invitations are sent by us, never by the provider" };
  const words = WORDS[e.triggerSource];
  if (!words) return { sent: false, reason: "not an email this product sends" };
  const email = e.request.userAttributes?.email?.trim().toLowerCase();
  if (!email) return { sent: false, reason: "no email address on the person" };
  const firmId = await p.firmOf({ subject: e.request.userAttributes?.sub ?? null, email });
  if (!firmId) return { sent: false, reason: "not a staff member of any firm here" };
  const needsCode = e.triggerSource !== "CustomEmailSender_AccountTakeOverNotification";
  if (needsCode && !e.request.code) return { sent: false, reason: "no code in the event" };
  const code = needsCode ? await p.decrypt(e.request.code!) : "";
  await p.mail.send({ firmId, to: email, replyTo: SYSTEM_REPLY_TO, subject: words.subject, text: words.text(code), class: "TRANSACTIONAL", templateKey: `identity.${e.triggerSource.replace("CustomEmailSender_", "").toLowerCase()}` });
  return { sent: true };
}
