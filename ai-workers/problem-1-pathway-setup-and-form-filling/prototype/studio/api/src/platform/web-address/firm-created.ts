// PF-25 (Lead B on #1763, comment 6881377523; P-600 (2)): a new firm's web address comes from the platform's
// `firm.created` event, never from a trigger on platform_firm, so address generation can never fail a firm's creation.
//   * onFirmCreated: a firm with no address gets its first free suggestion (from its operating name; a Sample firm,
//     key `sample-…`, its key first) in a transaction of its own. Idempotent: a firm that has an address (PF-5's sign-up
//     sets the chosen one in its own transaction, or an earlier run) is left as it is. A suggestion that another firm
//     takes at the same moment is answered by the next free one; a firm for which no suggestion is free is named in
//     `failed`, and its creation is untouched either way.
//   * catchUpFirmAddresses: every firm with a `firm.created` event in module_event (by seq) and no address, plus the
//     Sample firms (PF-3's seed raises no event), so a missed or failed delivery is made good by the next run. One firm
//     that fails never stops the others. Run at app start (WebAddressCatchUp, routes.ts) and by its command:
//       tsx api/src/platform/web-address/firm-created.ts
//   * PF-F1c (R1.24; AWS proof 23 Nov, Step 17): the command runs as the database's owner, which on Amazon RDS is neither
//     superuser nor BYPASSRLS, so PF-12's walls refused every write ("new row violates row-level security policy for table
//     platform_firm_web_address"). As PF-8b F8 did for the Sample seed, the command (`asEachFirm`) works each firm in its
//     own transaction as that firm (firmInTransaction). There it sees only its own addresses, so an address another firm
//     has or holds is learnt from the database's refusal (the unique key, or the held-address backstop, both of which see
//     every firm) and the next suggestion is tried. The firms come from what the walls do not hide: the firm.created
//     events (module_event) and the Sample firms by key (platform_firm_of_key), plus whatever the owner's own read finds.
//     The app's start-up run (WebAddressCatchUp, a bypass use) and the event subscriber are unchanged.
// The FO-1a pattern (api/src/front-office/firm-seed.ts). The migration backfills the firms that existed before PF-25.
import type { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AuditPort } from "../../../../ports/audit.ts";
import { EVENT } from "../../../../ports/events.ts";
import { firmInTransaction, firmOfKey, firmScope } from "../firm-scope.ts";
import { addressBaseFromName, candidate, checkAddressShape, SAMPLE_PREFIX } from "./rules.ts";

type Tx = Prisma.TransactionClient;
export const FIRM_CREATED_ACTOR = "system:firm-created";
/** Firm states that get no address (contracts §7 §1.1): a firm that left, or never finished setting up. */
const NO_ADDRESS = new Set(["DELETED", "ABANDONED"]);
const TRIES = 50;

export type AddressResult = { firmId: string; address: string | null; assigned: boolean };

/** The addresses to try for a firm, in order: a Sample firm's key first, then its operating name's suggestions. */
function candidates(firm: { key: string; operatingName: string }): string[] {
  const own = firm.key.startsWith(SAMPLE_PREFIX) && checkAddressShape(firm.key).ok ? [firm.key] : [];
  const base = addressBaseFromName(firm.operatingName);
  return [...new Set([...own, ...Array.from({ length: TRIES }, (_, i) => candidate(base, i + 1))])].filter((c) => checkAddressShape(c).ok && (own.includes(c) || !c.startsWith(SAMPLE_PREFIX)));
}

/** Gives one firm its first free address inside `tx`, unless it has one. Returns null when none of the candidates is
 *  free (named by the caller). The firm's row is locked first, as WebAddresses.change and claimAtSignUp lock it. */
async function assignIn(tx: Tx, audit: AuditPort<Tx>, firmId: string, skip: Set<string>, tried: { address?: string }): Promise<AddressResult | null> {
  const id = firmScope(firmId).firmId;
  const [firm] = await tx.$queryRaw<{ key: string; operating_name: string; status: string }[]>`select key, operating_name, status::text from platform_firm where id = ${id}::uuid for no key update`;
  if (!firm) throw new Error(`web address: ${id} is no platform firm`);
  const have = await tx.platformFirmWebAddress.findUnique({ where: { firmId: id }, select: { address: true } });
  if (have) return { firmId: id, address: have.address, assigned: false };
  if (NO_ADDRESS.has(firm.status)) return { firmId: id, address: null, assigned: false };
  const tries = candidates({ key: firm.key, operatingName: firm.operating_name });
  const [own, held] = await Promise.all([
    tx.platformFirmWebAddress.findMany({ where: { address: { in: tries } }, select: { address: true } }),
    // The database's own clock: the assignment is the database's backstop's decision too (no ClockPort here).
    tx.$queryRaw<{ old_address: string }[]>`select old_address from platform_firm_address_history where old_address = any(${tries}) and until > now() and firm_id <> ${id}::uuid`,
  ]);
  const taken = new Set([...own.map((r) => r.address), ...held.map((r) => r.old_address)]);
  // PF-F1c: `skip`: suggestions the database refused in an earlier attempt (another firm's, hidden by the walls)
  const address = tries.find((c) => !taken.has(c) && !skip.has(c));
  if (!address) return null;
  tried.address = address;
  await tx.$executeRaw`select platform_web_address_lock(${address})`;
  await tx.platformFirmWebAddress.create({ data: { firmId: id, address, setBy: FIRM_CREATED_ACTOR } });
  await audit.record(tx, { firmId: id, actor: FIRM_CREATED_ACTOR, action: "firm.web_address.set", entity: "platform_firm", entityKey: id, summary: `Web address set to ${address} when the firm was created.`, detail: { address }, before: null, after: { address } });
  return { firmId: id, address, assigned: true };
}

const isTaken = (e: unknown) => {
  const x = e as { code?: string; message?: string; cause?: { code?: string; originalCode?: string } };
  return x?.code === "P2002" || x?.cause?.originalCode === "23505" || x?.cause?.code === "23505" || /held for another firm's redirect|platform_firm_web_address_address_key/.test(String(x?.message ?? ""));
};

export type CatchUpOptions = {
  /** PF-F1c: the command only (no request, job or bypass scope): each firm's transaction runs as that firm, so the walls
   *  admit its writes for a runner without BYPASSRLS (the RDS owner). Never set inside the app: firmInTransaction refuses
   *  a request's or job's scope and the app's own role. */
  asEachFirm?: boolean;
};

/** The subscriber: a `firm.created` event gives that firm its address (see the header). Any other event type is
 *  ignored. At least once is safe: a repeat changes nothing. */
export async function onFirmCreated(db: PrismaClient, audit: AuditPort<Tx>, event: { type: string; firmId: string }, opts: CatchUpOptions = {}): Promise<AddressResult | null> {
  if (event.type !== EVENT.FIRM_CREATED) return null;
  // A suggestion another firm takes between the read and the write: the next attempt reads it as taken. PF-F1c: one the
  // read could not see (another firm's, behind the walls) is skipped from then on; each such refusal names a new
  // suggestion, so the loop ends within the suggestions, and three refusals of nothing new end it as before.
  const skip = new Set<string>();
  for (let races = 0; ;) {
    const tried: { address?: string } = {};
    try {
      const r = await db.$transaction(async (tx) => {
        if (opts.asEachFirm) await firmInTransaction(tx, event.firmId);
        return assignIn(tx, audit, event.firmId, skip, tried);
      });
      if (!r) throw new Error(`web address: no free suggestion for firm ${event.firmId}`);
      return r;
    } catch (e) {
      if (!isTaken(e)) throw e;
      if (tried.address && !skip.has(tried.address)) skip.add(tried.address);
      else if (++races >= 3) throw e;
    }
  }
}

export type CatchUpResult = { results: AddressResult[]; failed: { firmId: string; error: string }[] };

/** The firms with a `firm.created` event and no address, in event order, then the Sample firms with none. */
export async function catchUpFirmAddresses(db: PrismaClient, audit: AuditPort<Tx>, opts: CatchUpOptions = {}): Promise<CatchUpResult> {
  const read = await db.$queryRaw<{ firm_id: string }[]>`
    select f.id::text as firm_id from platform_firm f
     where f.status::text not in ('DELETED', 'ABANDONED')
       and not exists (select 1 from platform_firm_web_address w where w.firm_id = f.id)
       and (exists (select 1 from module_event e where e.firm_id = f.id and e.type = ${EVENT.FIRM_CREATED}) or f.key like 'sample-%')
     order by (select min(e.seq) from module_event e where e.firm_id = f.id and e.type = ${EVENT.FIRM_CREATED}) nulls last, f.key`;
  const firms = opts.asEachFirm ? await firmsBehindWalls(db, read.map((f) => f.firm_id)) : read.map((f) => f.firm_id);
  const out: CatchUpResult = { results: [], failed: [] };
  for (const firmId of firms) {
    try { out.results.push((await onFirmCreated(db, audit, { type: EVENT.FIRM_CREATED, firmId }, opts))!); }
    catch (e) { out.failed.push({ firmId, error: String(e).slice(0, 300) }); }
  }
  return out;
}

/** PF-F1c: the firms the command looks at when the walls may hide platform_firm from it: those the owner's own read found,
 *  then every firm with a firm.created event (module_event is not walled), in event order, then the Sample firms found by
 *  their keys in samples/firms.json through the narrow definer lookup. Each is then checked as itself (a firm that has an
 *  address, or left, is left as it is), so a firm listed twice or by more than one way changes nothing. */
async function firmsBehindWalls(db: PrismaClient, read: string[]): Promise<string[]> {
  const events = await db.$queryRaw<{ firm_id: string }[]>`select e.firm_id::text as firm_id from module_event e where e.type = ${EVENT.FIRM_CREATED} and e.firm_id is not null group by e.firm_id order by min(e.seq)`;
  const keys = ((JSON.parse(readFileSync(SAMPLE_FIRMS, "utf8")) as { firms?: { key?: unknown }[] }).firms ?? []).map((f) => f.key).filter((k): k is string => typeof k === "string" && k.startsWith(SAMPLE_PREFIX)).sort();
  const samples: string[] = [];
  for (const key of keys) { const id = await firmOfKey(db, key, async () => null); if (id) samples.push(id); }
  return [...new Set([...read, ...events.map((e) => e.firm_id), ...samples].map((id) => id.toLowerCase()))];
}
/** The Sample firms' file (as seed-sample-firms.ts reads it; not imported, so this command loads no NestJS service). */
const SAMPLE_FIRMS = join(import.meta.dirname, "..", "..", "..", "..", "samples", "firms.json");

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const { auditEvent } = await import("../audit/audit-event.ts");
  const url = process.env.DATABASE_URL ?? "postgresql://xr_studio@127.0.0.1:54329/xr_studio_demo";   // as core.ts DATABASE_URL
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, options: "-c TimeZone=UTC" }) });
  try {
    const r = await catchUpFirmAddresses(db, auditEvent, { asEachFirm: true });   // PF-F1c: as each firm (RDS: no BYPASSRLS)
    console.log(JSON.stringify(r));
    if (r.failed.length) process.exitCode = 1;
  } catch (e) {
    console.log(JSON.stringify({ error: String(e).slice(0, 1000) }));
    process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
