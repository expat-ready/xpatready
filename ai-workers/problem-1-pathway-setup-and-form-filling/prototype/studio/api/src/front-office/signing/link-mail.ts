// FO-6 part 4a (BACKLOG row FO-6; note product/screens/FO-6-4/note.md rule 1; P-561 (2): every email ours, the vendor's
// off): the "Please sign" email that carries a client signer's link, sent through our MailPort after the send's commit.
// The link is `<public base>/sign/<token>`; the token is firm-first (part 3's and FO-3c's shape) and only its sha256 is in
// the signing tables. The email itself, as sent, is kept by the messages module like every other email (the demo inbox
// reads it): the same as FO-3c's consultation-agreement link. A failed email is logged and the send stands (as part 3's
// "Your signed agreement"). Reply-To the firm's contact address. Wording is Sample.
// Part 4b: the one-time code's email (`sendSigningCode`), and Lead B's minors on #3433: the link's words name every end (a
// signature, a decline, the expiry, a newer version), and outside `local` a copy with no STUDIO_PUBLIC_URL sends no link
// (a localhost link would reach a client).
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { CODE_MINUTES } from "./door-code.ts";
import { signingMail } from "./handlers.ts";

/** Where a client's link points: STUDIO_PUBLIC_URL; on a local copy without it, this port on localhost (FO-3c's); outside
 *  local without it, null: no link is sent (Lead B, #3433 minor 2). */
export const signingPublicBase = (): string | null => {
  const set = process.env.STUDIO_PUBLIC_URL?.trim();
  if (set) return set.replace(/\/+$/, "");
  return (process.env.PLATFORM_ENVIRONMENT ?? "local") === "local" ? `http://localhost:${process.env.STUDIO_PORT ?? 4400}` : null;
};
export const signingLink = (token: string): string | null => { const b = signingPublicBase(); return b ? `${b}/sign/${token}` : null; };

const WHAT = { RETAINER: "retainer agreement", CONSULTATION: "consultation agreement", OTHER: "document" } as const;

/** Emails one client signer their link. Never throws; answers whether the email was handed to the MailPort. */
export async function sendPleaseSign(db: PrismaClient, o: { firmId: string; requestId: string; personId: string; token: string; kind: keyof typeof WHAT; version?: number }): Promise<boolean> {
  const mail = signingMail();
  if (!mail) { console.warn("[fo-signing] no MailPort set: the signing link was not emailed"); return false; }
  try {
    const firm = await db.platformFirm.findFirstOrThrow({ where: { id: o.firmId }, select: { operatingName: true, contactEmail: true } });
    const p = await db.foPerson.findFirst({ where: { firmId: o.firmId, id: o.personId }, select: { id: true, email: true, givenNames: true } });
    if (!p?.email) { console.warn("[fo-signing] the client signer has no email: the signing link was not emailed"); return false; }
    const what = WHAT[o.kind], link = signingLink(o.token);
    if (!link) { console.error("[fo-signing] STUDIO_PUBLIC_URL is not set outside local: the signing link was not emailed"); return false; }
    await mail.send({ firmId: o.firmId, to: p.email, replyTo: firm.contactEmail, class: "TRANSACTIONAL", person: { kind: "FO_PERSON", id: p.id }, templateKey: "signing.please_sign",
      idempotencyKey: `signing:${o.requestId}:please-sign:${p.id}`,
      subject: `Please sign your ${what} with ${firm.operatingName}`.slice(0, 200),
      text: `Hello${p.givenNames ? ` ${p.givenNames}` : ""},\n\n${firm.operatingName} has sent you a ${what}${o.version ? ` (version ${o.version})` : ""} to sign electronically. Open this link to read and sign it:\n${link}\n\nThis link is for you alone: please do not forward it. It works until you sign or decline, until it expires, or until ${firm.operatingName} sends you a newer version.\n\nReply to this email to reach ${firm.operatingName}.` });
    return true;
  } catch (e) { console.error(`[fo-signing] the signing link's email failed: ${(e as Error)?.name ?? "error"}`); return false; }
}

/** The one-time code for a signer's link (part 4b's door, P-564), after the code's transaction. Never throws. */
export async function sendSigningCode(db: PrismaClient, o: { firmId: string; requestId: string; personId: string; code: string }): Promise<boolean> {
  const mail = signingMail();
  if (!mail) { console.warn("[fo-signing] no MailPort set: the one-time code was not emailed"); return false; }
  try {
    const firm = await db.platformFirm.findFirstOrThrow({ where: { id: o.firmId }, select: { operatingName: true, contactEmail: true } });
    const p = await db.foPerson.findFirst({ where: { firmId: o.firmId, id: o.personId }, select: { id: true, email: true } });
    if (!p?.email) { console.warn("[fo-signing] the signer has no email: the one-time code was not emailed"); return false; }
    await mail.send({ firmId: o.firmId, to: p.email, replyTo: firm.contactEmail, class: "TRANSACTIONAL", person: { kind: "FO_PERSON", id: p.id }, templateKey: "signing.code",
      idempotencyKey: `signing:${o.requestId}:code:${createHash("sha256").update(o.code).digest("hex").slice(0, 16)}`,
      subject: `Your code to sign with ${firm.operatingName}`.slice(0, 200),
      text: `Your one-time code is ${o.code}. It works for ${CODE_MINUTES} minutes. If you did not ask for it, ignore this email.\n` });
    return true;
  } catch (e) { console.error(`[fo-signing] the one-time code's email failed: ${(e as Error)?.name ?? "error"}`); return false; }
}
