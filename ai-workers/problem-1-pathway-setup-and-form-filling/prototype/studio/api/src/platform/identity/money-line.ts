// PF-6m (QA-478; PF-6b ruling 2 (b)): the one money-keys audit line, written by the three doors that give staff roles: the
// role-change door (service.ts), the invitation accept (session/service.ts) and firm signup's first Owner (firms/signup.ts,
// PF-6m2, break F4), so they can never differ again. It
// names only the roles that bring a money key (break m2) and the key names only, and is written in the caller's
// transaction (a failed line, or a later refusal, rolls the whole change back).
import type { Prisma } from "@prisma/client";
import { auditStaff } from "./audit.ts";
import { moneyKeysOfRoles } from "./catalogue.ts";

type Tx = Prisma.TransactionClient;
export const MONEY_KEYS_GRANTED = "platform.staff.money_keys_granted";

/** Writes the money-keys line for the roles just given to `staffId`; none when no role brings a money key. */
export async function writeMoneyKeysGranted(tx: Tx, l: { firmId: string; firmKey: string; actor: string; staffId: string; roles: readonly string[] }) {
  const moneyRoles: string[] = [];
  for (const role of l.roles) if ((await moneyKeysOfRoles(tx, [role])).length) moneyRoles.push(role);
  const money = await moneyKeysOfRoles(tx, moneyRoles);
  if (!money.length) return null;
  await auditStaff(tx, { firmId: l.firmId, firmKey: l.firmKey, actor: l.actor, action: MONEY_KEYS_GRANTED, entityKey: l.staffId, summary: `money permissions given with ${moneyRoles.join(", ")}: ${money.length} keys`, detail: { staffId: l.staffId, roles: moneyRoles, moneyKeys: money }, before: null, after: null });   // R1.8: an event of the role change, whose own line holds the roles before and after; this line stays as PF-6m froze it
  return { roles: moneyRoles, moneyKeys: money };
}
