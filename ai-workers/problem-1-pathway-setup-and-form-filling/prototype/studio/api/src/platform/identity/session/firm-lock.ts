// PF-4bc (break R2-M1): the firm row lock for the session's transactions that call the sign-in provider while holding it
// (session/service.ts: accept, sign-out everywhere, reset two-step). Its own file so a test can run it on a scratch database.
import type { Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import { problem } from "../keys.ts";
import { COGNITO_DEADLINE_MS } from "./provider.ts";

type Tx = Prisma.TransactionClient;
/** PF-4bc (break R2-M1; #3217 round-3 Minors): the transactions that call the sign-in provider while holding the firm's
 *  row lock. Every lock wait before the provider call is bounded (FIRM_LOCK_WAIT for each lock attempt, kept until the
 *  provider call so the person's row lock in endSessions is bounded too, R3-m1), and a wait that runs out answers 503
 *  FIRM_BUSY "try again shortly" (r3-m1: the invitation page keeps its Continue for a 5xx). Accept lifts the bound just
 *  before its provider call (review m1): what follows it, the staff.joined event's global sequence lock, waits within the
 *  transaction's limit as before, and a refusal after it is still safe, since creating the provider user is idempotent. The transaction's limit
 *  covers two such waits (Postgres bounds each lock attempt and a row lock can wait twice: about 3 s each, R3-m2), the
 *  provider's whole deadline (COGNITO_DEADLINE_MS, 3 s) and the commit, so a slow provider and a busy firm together never
 *  end in "provider changed, our records rolled back". A person's own sign-out calls no provider and is not bounded (r3-m2);
 *  its limit is above FIRM_TX, since a bounded holder may keep the firm lock that long (review m2). */
export const FIRM_LOCK_WAIT = "1500ms";
export const FIRM_TX = { maxWait: 2_000, timeout: 12_000 } as const;
export const SIGN_OUT_TX = { maxWait: 2_000, timeout: 15_000 } as const;
const BUSY_WORDS = "Someone else in your firm is changing staff right now. Try again in a moment.";
/** For a person not yet in the firm (an invitation being accepted), review m3. */
export const BUSY_WORDS_INVITEE = "Your firm's account is busy right now. Try again in a moment.";
const isLockTimeout = (e: unknown) => { const x = e as { message?: unknown; meta?: unknown }; return /55P03|lock timeout|lock_not_available/i.test(`${String(x?.message)} ${JSON.stringify(x?.meta ?? {})}`); };
/** A transaction's `.catch`: a lock wait that ran out anywhere in it is 503 FIRM_BUSY; anything else passes unchanged. */
export function busyOnLockTimeout(e: unknown, words = BUSY_WORDS): never {
  // Breaker m3: Prisma's P2028 (the transaction's limit reached, or no connection in time) is the same "busy", not a 500.
  if (isLockTimeout(e) || (e as { code?: unknown })?.code === "P2028") problem(503, "Try again shortly", words, { code: "FIRM_BUSY" });
  throw e;
}
/** Breaker m1: Postgres bounds each lock attempt, not a statement, so overlapping holders can make one statement wait
 *  more than twice. Just before a provider call, a transaction with less than the provider's whole deadline plus 2 s
 *  left of FIRM_TX answers 503 FIRM_BUSY: the provider is never changed by a transaction that cannot commit in time. */
// The transaction's start, per transaction: Prisma's transaction client is a Proxy whose property writes reach the shared
// client, so the clock lives in the async context the transaction's callback runs in (txClock), never on `tx`.
const started = new AsyncLocalStorage<number>();
export const txClock = <T>(fn: () => Promise<T>): Promise<T> => started.run(Date.now(), fn);
export const PROVIDER_ROOM_MS = COGNITO_DEADLINE_MS + 2_000;
export function roomForProvider(_tx: Tx, words = BUSY_WORDS): void {
  const t0 = started.getStore();   // no clock: refused (fail closed)
  if (typeof t0 !== "number" || Date.now() - t0 > FIRM_TX.timeout - PROVIDER_ROOM_MS) problem(503, "Try again shortly", words, { code: "FIRM_BUSY" });
}
export async function lockFirm(tx: Tx, firmId: string) {
  await tx.$executeRawUnsafe(`set local lock_timeout = '${FIRM_LOCK_WAIT}'`);
  try { await tx.$queryRaw`select id from platform_firm where id = ${firmId}::uuid for no key update`; } catch (e) { busyOnLockTimeout(e); }
  // The bound stays for the rest of the transaction (R3-m1): every later lock, the person's row included, waits at most as long.
}
