// FO-6 part 4a (BACKLOG row FO-6; note product/screens/FO-6-4/note.md rules 5-6; P-564): the one-time email code on a
// signer's link, shared by every signing door. Taken from FO-3c's door (booking/consultation-agreement/service.ts, its
// `code`), with its Sample values, on part 1's fo_signer columns:
//   * a code is 6 digits, lives 10 minutes, is single use (spent once checked), and only its sha256 is stored;
//   * a new code at most once a minute per signer; a live unspent code is not sent again unless asked (`resend`);
//   * a wrong or expired code counts; the sixth locks the link 15 minutes, and while locked even the right code is
//     refused; a code asked after the lock ends starts the count again.
// Each call takes the request's row lock itself (`select … for update`, part 1 review m10; again is harmless when the
// caller holds it already), so two calls on one signer queue and a code is used once. The caller passes its audit writer, so
// each change writes one line in its transaction, naming the signer, never the code. The browser-bound session a right
// code opens is part 4b's (its two fo_signer columns); here a right code only sets code_verified_at. FO-3c moves onto this
// file after 4b (Lead 24 on #3433, answer 3). Every value is Sample.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
export const CODE_MINUTES = 10, CODE_TRIES = 6, LOCK_MINUTES = 15, RESEND_GAP_MS = 60_000;
const MIN = 60_000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** One audit line in the caller's transaction (summary and the counters after; never the code). */
export type CodeLine = (tx: Tx, summary: string, after: { codeFailures: number; locked: boolean; verified?: boolean }) => Promise<unknown>;
type Signer = { id: string; codeSha256: string | null; codeExpiresAt: Date | null; codeVerifiedAt: Date | null; codeFailures: number; lockedUntil: Date | null };

/** A code given by the client: exactly 6 digits after trimming, else null. */
export function codeOf(input: unknown): string | null {
  return typeof input === "string" && /^\d{6}$/.test(input.trim()) ? input.trim() : null;
}

/** A code is unspent when it was sent after the last right check (its send time is its expiry less its life). */
const unspent = (c: Signer) => !c.codeVerifiedAt || (!!c.codeExpiresAt && c.codeExpiresAt.getTime() - CODE_MINUTES * MIN > c.codeVerifiedAt.getTime());
const liveCode = (c: Signer, now: Date) => !!c.codeSha256 && !!c.codeExpiresAt && c.codeExpiresAt > now && unspent(c);
export const isLocked = (c: { lockedUntil: Date | null }, now: Date) => !!c.lockedUntil && c.lockedUntil > now;

/** The signer, read after its request's row lock (review m2: the single-use code and the count hold under concurrent calls). */
async function lockedSigner(tx: Tx, firmId: string, signerId: string): Promise<Signer> {
  const s = await tx.foSigner.findFirstOrThrow({ where: { firmId, id: signerId }, select: { requestId: true } });
  await tx.$queryRaw`select 1 from fo_signature_request where firm_id = ${firmId}::uuid and id = ${s.requestId}::uuid for update`;
  return tx.foSigner.findFirstOrThrow({ where: { firmId, id: signerId } });
}

export type AskVerdict = { verdict: "SENT"; code: string } | { verdict: "ALREADY_SENT" | "TOO_SOON" | "LOCKED" };

/** Asks for a code. SENT carries the new code for the caller to email after its commit; ALREADY_SENT: a live unspent
 *  code exists and no resend was asked (nothing changes); TOO_SOON: the last code is under a minute old; LOCKED. */
export async function askCode(tx: Tx, firmId: string, signerId: string, now: Date, o: { resend?: boolean; line: CodeLine }): Promise<AskVerdict> {
  const cur = await lockedSigner(tx, firmId, signerId);
  if (isLocked(cur, now)) return { verdict: "LOCKED" };
  if (liveCode(cur, now) && o.resend !== true) return { verdict: "ALREADY_SENT" };
  if (cur.codeExpiresAt && cur.codeExpiresAt.getTime() - CODE_MINUTES * MIN > now.getTime() - RESEND_GAP_MS) return { verdict: "TOO_SOON" };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const failures = cur.lockedUntil ? 0 : cur.codeFailures;   // a lock that has ended starts the count again
  await tx.foSigner.update({ where: { id: cur.id }, data: { codeSha256: sha(code), codeExpiresAt: new Date(now.getTime() + CODE_MINUTES * MIN), codeFailures: failures, lockedUntil: null } });
  await o.line(tx, "A one-time code was emailed to the signer.", { codeFailures: failures, locked: false });
  return { verdict: "SENT", code };
}

export type CheckVerdict = "OK" | "WRONG" | "EXPIRED" | "LOCKED";

/** Checks a code. OK: right, live and unspent (it is spent now: code_verified_at is set, the count cleared); WRONG or
 *  EXPIRED: counted; the sixth counted try answers LOCKED and locks the link LOCK_MINUTES; LOCKED: refused, not counted. */
export async function checkCode(tx: Tx, firmId: string, signerId: string, given: string, now: Date, o: { line: CodeLine }): Promise<CheckVerdict> {
  const cur = await lockedSigner(tx, firmId, signerId);
  if (isLocked(cur, now)) return "LOCKED";
  const live = liveCode(cur, now);
  const right = live && timingSafeEqual(Buffer.from(sha(given), "hex"), Buffer.from(cur.codeSha256!, "hex"));
  if (right) {
    await tx.foSigner.update({ where: { id: cur.id }, data: { codeVerifiedAt: now, codeFailures: 0, lockedUntil: null } });
    await o.line(tx, "The signer's one-time code was right.", { codeFailures: 0, locked: false, verified: true });
    return "OK";
  }
  const failures = Math.min((cur.lockedUntil ? 0 : cur.codeFailures) + 1, CODE_TRIES), lock = failures >= CODE_TRIES ? new Date(now.getTime() + LOCK_MINUTES * MIN) : null;
  await tx.foSigner.update({ where: { id: cur.id }, data: { codeFailures: failures, lockedUntil: lock } });
  await o.line(tx, lock ? `A sixth wrong code locked the link for ${LOCK_MINUTES} minutes.` : "A wrong or expired code.", { codeFailures: failures, locked: !!lock });
  return lock ? "LOCKED" : live ? "WRONG" : "EXPIRED";
}

/** The words for a refused ask or check (the door answers them as problems): status, title, detail, code. */
export const CODE_REFUSALS = {
  TOO_SOON: [429, "Wait a minute", "A code was sent less than a minute ago. Check your email, or ask again in a minute.", "CODE_TOO_SOON"],
  LOCKED: [423, "Locked for now", `Too many wrong codes. Try again in ${LOCK_MINUTES} minutes.`, "CODE_LOCKED"],
  WRONG: [422, "Wrong code", "That code is not right. Check the email and try again.", "CODE_WRONG"],
  EXPIRED: [422, "Code expired", "That code has expired. Ask for a new one.", "CODE_EXPIRED"],
  FORMAT: [422, "Check the code", "The code is the 6 digits in the email we sent you.", "CODE_FORMAT"],
} as const;
