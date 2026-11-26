// PF-4bc (break R2-M1): the firm row lock for the session's transactions that call the sign-in provider while holding it
// (session/service.ts: accept, sign-out everywhere, reset two-step). Its own file so a test can run it on a scratch database.
import type { Prisma } from "@prisma/client";
import { problem } from "../keys.ts";

type Tx = Prisma.TransactionClient;
/** PF-4bc (break R2-M1): the transactions that call the sign-in provider while holding the firm's row lock. The wait
 *  for the lock is bounded (FIRM_LOCK_WAIT, then 409 "try again", before any provider call) and the transaction's limit
 *  covers that wait, the provider's whole deadline (COGNITO_DEADLINE_MS, 3 s) and the commit, so a slow provider and a
 *  busy firm together never end in "provider changed, our records rolled back". */
export const FIRM_LOCK_WAIT = "1500ms";
export const FIRM_TX = { maxWait: 2_000, timeout: 8_000 } as const;
export async function lockFirm(tx: Tx, firmId: string) {
  await tx.$executeRawUnsafe(`set local lock_timeout = '${FIRM_LOCK_WAIT}'`);
  try { await tx.$queryRaw`select id from platform_firm where id = ${firmId}::uuid for no key update`; } catch (e) {
    const x = e as { message?: unknown; meta?: unknown; code?: unknown };
    if (/55P03|lock timeout|lock_not_available/i.test(`${String(x?.message)} ${JSON.stringify(x?.meta ?? {})}`)) problem(409, "Try again", "Someone else in your firm is changing staff right now. Try again in a moment.", { code: "FIRM_BUSY" });
    throw e;
  }
  await tx.$executeRawUnsafe("set local lock_timeout to default");   // only the firm lock is bounded here; the rest as before
}
