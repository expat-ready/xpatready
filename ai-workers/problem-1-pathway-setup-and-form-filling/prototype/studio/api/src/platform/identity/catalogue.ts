// PF-6b (Lead B's brief rulings 1-4; SA-6-24, SA-6-27): the permission-key catalogue (platform-permissions.prisma,
// migration 20261115120000_pf6b_permission_catalogue) and the rules read from it.
//   * scope and class follow the key (ruling 1): scopeOf / classOf say it again in code, and the PF-6b check compares
//     every catalogue row with them, so the migration's SQL and this file can never drift apart silently;
//   * money apart (ruling 2): no duty or bundle hands out a MONEY key (assertNoBundleHandsOutMoney, at start-up), and a
//     role grant that brings MONEY keys writes its own audit line (moneyKeysOfRoles; identity service);
//   * own versus all (ruling 4): holdsKey reads a person's key from their live grants, the tables the guard reads.
import { Prisma, type PrismaClient } from "@prisma/client";
import { DUTY_KEYS } from "./keys.ts";

type Db = PrismaClient | Prisma.TransactionClient;
export type Scope = "OWN" | "ALL" | "NONE";
export type KeyClass = "GENERAL" | "MONEY" | "LICENCE";
export type CatalogueRow = { key: string; scope: Scope; class: KeyClass };

/** The three sign-off keys (keys.ts DUTY_KEYS.represent): a route naming one also needs a licence record (ruling 3). */
export const LICENCE_KEYS: readonly string[] = DUTY_KEYS.represent;
/** The money areas of ruling 1, and the one key SA-06 v3.15 §10b names as a money key outside them ("Money keys, no new
 *  key … Bill this and Add cost make a draft with agent/invoice:create and agent/expense:create"). */
export const MONEY_AREAS = ["invoice", "payment", "refund", "payment-rail", "billing", "billing-config", "billing-report", "trust"] as const;
export const MONEY_KEYS_OUTSIDE_AREAS = ["agent/expense:create"] as const;

const areaOf = (key: string) => key.replace(/^agent\//, "").split(":")[0];
export const scopeOf = (key: string): Scope => (key.endsWith(":view.own") ? "OWN" : key.endsWith(":view.all") ? "ALL" : "NONE");
export const classOf = (key: string): KeyClass =>
  LICENCE_KEYS.includes(key) ? "LICENCE"
    : (MONEY_AREAS as readonly string[]).includes(areaOf(key)) || (MONEY_KEYS_OUTSIDE_AREAS as readonly string[]).includes(key) ? "MONEY" : "GENERAL";

/** Every catalogue row. */
export async function readCatalogue(db: Db): Promise<CatalogueRow[]> {
  return (await db.platformPermissionKey.findMany({ orderBy: { key: "asc" } })).map((r) => ({ key: r.key, scope: r.scope, class: r.class }));
}

/** Rows whose scope or class is not what ruling 1 says (empty when the catalogue is right). */
export const catalogueMismatches = (rows: CatalogueRow[]) =>
  rows.filter((r) => r.scope !== scopeOf(r.key) || r.class !== classOf(r.key)).map((r) => `${r.key}: ${r.scope}/${r.class}, expected ${scopeOf(r.key)}/${classOf(r.key)}`);

/** Keys with no catalogue row (empty when every key has one). */
export const uncatalogued = (keys: Iterable<string>, rows: CatalogueRow[]) => { const have = new Set(rows.map((r) => r.key)); return [...new Set(keys)].filter((k) => !have.has(k)).sort(); };

/** Money apart (ruling 2 (a)): a duty or bundle never hands out a MONEY key. Throws naming each bundle and key. */
export function assertNoBundleHandsOutMoney(bundles: Record<string, readonly string[]>, rows: CatalogueRow[]) {
  const money = new Set(rows.filter((r) => r.class === "MONEY").map((r) => r.key));
  const bad = Object.entries(bundles).flatMap(([name, keys]) => keys.filter((k) => money.has(k) || classOf(k) === "MONEY").map((k) => `${name}: ${k}`));
  if (bad.length) throw new Error(`A duty or bundle hands out a money key; a money key is only ever ticked on its own (PF-6b, ruling 2): ${bad.join(", ")}`);
}

/** The MONEY keys the given roles carry (ruling 2 (b)), sorted. */
export async function moneyKeysOfRoles(db: Db, roles: string[]): Promise<string[]> {
  if (!roles.length) return [];
  const rows = await db.$queryRaw<{ key: string }[]>(Prisma.sql`
    select distinct k.key from platform_role_permission rp join platform_permission_key k on k.key = rp.permission_key
     where rp.role::text = any(${roles}) and k.class = 'MONEY' order by k.key`);
  return rows.map((r) => r.key);
}

/** Whether the person holds the key through a live role grant of their firm (the tables the guard reads). */
export async function holdsKey(db: Db, firmId: string, staffId: string, key: string): Promise<boolean> {
  const [{ n }] = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
    select count(*)::int as n from platform_role_grant g join platform_role_permission rp on rp.role = g.role
     where g.firm_id = ${firmId}::uuid and g.staff_id = ${staffId}::uuid and g.ended_at is null and rp.permission_key = ${key}`);
  return n > 0;
}
