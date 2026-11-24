// PF-4bc (break R2-M1): the firm row lock for the session's transactions that call the sign-in provider while holding it
// (session/service.ts: accept, sign-out everywhere, reset two-step). Its own file so a test can run it on a scratch database.
import type { Prisma } from "@prisma/client";
import { problem } from "../keys.ts";

type Tx = Prisma.TransactionClient;
/** PF-4bc (break R2-M1; #3217 round-3 Minors): the transactions that call the sign-in provider while holding the firm's
 *  row lock. Every lock wait in them is bounded (FIRM_LOCK_WAIT for each lock attempt, kept for the whole transaction so
 *  the person's row lock in endSessions is bounded too, R3-m1), and a wait that runs out answers 503 FIRM_BUSY "try again
 *  shortly" before any provider call (r3-m1: the invitation page keeps its Continue for a 5xx). The transaction's limit
 *  covers two such waits (Postgres bounds each lock attempt and a row lock can wait twice: about 3 s each, R3-m2), the
 *  provider's whole deadline (COGNITO_DEADLINE_MS, 3 s) and the commit, so a slow provider and a busy firm together never
 *  end in "provider changed, our records rolled back". A person's own sign-out calls no provider and is not bounded (r3-m2). */
export const FIRM_LOCK_WAIT = "1500ms";
export const FIRM_TX = { maxWait: 2_000, timeout: 12_000 } as const;
const BUSY_WORDS = "Someone else in your firm is changing staff right now. Try again in a moment.";
const isLockTimeout = (e: unknown) => { const x = e as { message?: unknown; meta?: unknown }; return /55P03|lock timeout|lock_not_available/i.test(`${String(x?.message)} ${JSON.stringify(x?.meta ?? {})}`); };
/** A transaction's `.catch`: a lock wait that ran out anywhere in it is 503 FIRM_BUSY; anything else passes unchanged. */
export function busyOnLockTimeout(e: unknown): never {
  if (isLockTimeout(e)) problem(503, "Try again shortly", BUSY_WORDS, { code: "FIRM_BUSY" });
  throw e;
}
export async function lockFirm(tx: Tx, firmId: string) {
  await tx.$executeRawUnsafe(`set local lock_timeout = '${FIRM_LOCK_WAIT}'`);
  try { await tx.$queryRaw`select id from platform_firm where id = ${firmId}::uuid for no key update`; } catch (e) { busyOnLockTimeout(e); }
  // The bound stays for the rest of the transaction (R3-m1): every later lock, the person's row included, waits at most as long.
}
