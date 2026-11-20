// FO-13c: a suite that makes a client (Convert, Send, Signed offline, an e-signature win) records the conflict check the
// gate asks for first (api/src/front-office/compliance/conflict/gate.ts): one NO_CONFLICT check for the prospect's
// party, searching the party's current terms, by the prospect's owner (or `by`). The gate itself is tested in
// tests/check_fo13c_conflict.ts; this only lets the older suites keep testing their own rules.
import type { PrismaClient } from "@prisma/client";
import { partyOf, termsOf } from "../../api/src/front-office/compliance/conflict/gate.ts";

export async function clearConflict(db: PrismaClient, firmId: string, prospectId: string, by?: string) {
  const party = await partyOf(db, firmId, prospectId);
  if (!party) throw new Error(`clearConflict: prospect ${prospectId} has no party`);
  const t = await termsOf(db, firmId, party);
  const owner = by ?? (await db.foProspect.findFirstOrThrow({ where: { firmId, id: prospectId }, select: { ownerStaffId: true } })).ownerStaffId;
  if (!owner) throw new Error(`clearConflict: prospect ${prospectId} has no owner; pass \`by\``);
  await db.foConflictCheck.create({ data: { firmId, partyKind: party.kind, personId: party.kind === "PERSON" ? party.id : null, companyId: party.kind === "COMPANY" ? party.id : null,
    prospectId, searchedName: t.name, searchedEmail: t.email, searchedPhone: t.phone, matches: [], result: "NO_CONFLICT", checkedBy: owner } });
}

type Ctx = { firmId: string };
/** Patches Prospects and/or Retainers (an instance, or the class's prototype for every instance) so Convert, Send and
 *  Signed offline record that check first (one line in a suite: `clearingConflicts(db, { prospects: Prospects.prototype })`). A prospect or retainer it cannot find, or one
 *  with no party or owner, is left to the call's own answer (404, 409). */
export function clearingConflicts(db: PrismaClient, s: { prospects?: object; retainers?: object }) {
  const clear = async (firmId: string, prospectId: string | null | undefined) => {
    if (!prospectId || !(await partyOf(db, firmId, prospectId).catch(() => null))) return;
    await clearConflict(db, firmId, prospectId).catch(() => undefined);
  };
  const patch = (o: any, name: string, prospectOf: (ctx: Ctx, id: string) => Promise<string | null | undefined>) => {
    const was = o[name];
    o[name] = async function (this: unknown, ctx: Ctx, id: string, ...rest: unknown[]) { await clear(ctx.firmId, await prospectOf(ctx, id).catch(() => null)); return was.call(this, ctx, id, ...rest); };
  };
  const uuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id));
  if (s.prospects) patch(s.prospects, "convert", async (_c, id) => (uuid(id) ? id : null));
  const viaRetainer = async (c: Ctx, id: string) => (uuid(id) ? (await db.foRetainer.findFirst({ where: { firmId: c.firmId, id }, select: { prospectId: true } }))?.prospectId : null);
  if (s.retainers) { patch(s.retainers, "send", viaRetainer); patch(s.retainers, "signedOffline", viaRetainer); }
}
