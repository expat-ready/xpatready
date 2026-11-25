// PF-21rs R0 (R1.86, R1.85; concept screens/PF-21rs r2 §6, challenge M2): the names our console's Privacy pages show for
// the ids the three registers keep. A firm's name sits behind the firm walls, so it is read under the declared use
// REGISTER_FIRM_NAMES (id and operating name only, one firm-less line per read; reading each firm's own record instead
// would write a line on each firm's trail per page view, AUD-3). Our staff's names are our own staff's plane (no firm).
import type { PrismaClient } from "@prisma/client";
import { asBypass, touchPlatform } from "../firm-scope.ts";
import { REGISTER_FIRM_NAMES } from "./names.bypass.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** `staff:<id>` (the registers' own word) or `ourstaff:<id>` (AUD-3a's): our staff member's id; anything else none. */
const STAFF = /^(?:our)?staff:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
type Reader = Pick<PrismaClient, "$queryRaw" | "$transaction">;

/** Each firm id given → its operating name (an unknown id is left out). */
export async function firmNames(db: Reader, ids: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => typeof x === "string" && UUID.test(x)).map((x) => x.toLowerCase()))];
  if (want.length === 0) return new Map();
  const rows = await asBypass(REGISTER_FIRM_NAMES, () => db.$transaction(async (tx) => {
    await touchPlatform(tx);
    return tx.$queryRaw<{ id: string; name: string }[]>`SELECT id::text AS id, operating_name AS name FROM platform_firm WHERE id = ANY(${want}::uuid[])`;
  }));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Each actor word given (`staff:<id>`, `ourstaff:<id>`) → our staff member's display name; other actors are left out. */
export async function staffNames(db: Reader, actors: readonly (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = new Map<string, string[]>();
  for (const a of new Set(actors)) { const m = typeof a === "string" ? STAFF.exec(a) : null; if (m) ids.set(m[1].toLowerCase(), [...(ids.get(m[1].toLowerCase()) ?? []), a!]); }
  if (ids.size === 0) return new Map();
  const rows = await db.$queryRaw<{ id: string; name: string }[]>`SELECT id::text AS id, display_name AS name FROM plat_system_staff WHERE id = ANY(${[...ids.keys()]}::uuid[])`;
  return new Map(rows.flatMap((r) => (ids.get(r.id) ?? []).map((a) => [a, r.name] as const)));
}
