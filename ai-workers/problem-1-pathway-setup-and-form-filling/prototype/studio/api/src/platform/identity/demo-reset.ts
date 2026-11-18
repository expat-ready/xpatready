// PF-4 (P-571 (1), B-6; PF-3 review m3): the demo reset's one platform step. The reset deletes the demo workspace's rows
// and never platform rows or platform audit lines (those carry the platform's own audit workspace, audit.ts). This step
// returns the Sample firms' settings to their seed values through the settings write path (writeSetting), so each change
// leaves its own audit line (actor "system", reason "demo reset") and no value is ever left without a trail. A Sample
// firm's seed value of a key is its Sample value (SAMPLE_SETTING_VALUES, AUD-5) or else its registered default. Only the demo calls it
// (Demo.wipe, one line); a firm that is not seeded is skipped.
import type { PrismaClient } from "@prisma/client";
import { asBypass, firmScope, touchFirm } from "../firm-scope.ts";
import { SAMPLE_SETTING_VALUES, readSampleFirms } from "../seed-sample-firms.ts";
import { registeredSettings, writeSetting } from "../settings.ts";
import { platformAuditWorkspaceId } from "./audit.ts";

export const RESET_ACTOR = "system";
export const RESET_REASON = "demo reset";

export async function resetSampleFirmSettings(db: PrismaClient, firmKeys: string[] = readSampleFirms().map((f) => f.key)): Promise<{ changed: { firmKey: string; key: string }[]; unregistered: string[] }> {
  return asBypass("platform.demo.reset", () => resetSettings(db, firmKeys));   // PF-12: every Sample firm
}
async function resetSettings(db: PrismaClient, firmKeys: string[]): Promise<{ changed: { firmKey: string; key: string }[]; unregistered: string[] }> {
  const defs = new Map(registeredSettings().map((d) => [d.key, d]));
  const changed: { firmKey: string; key: string }[] = [], unregistered: string[] = [];
  for (const firmKey of firmKeys) {
    // PF-12b: each firm's share is one transaction, its platform.bypass line first: a line that cannot be written rolls
    // that firm's reset back and stops the reset (P-607).
    const done = await db.$transaction(async (tx) => {
      const firm = await tx.platformFirm.findUnique({ where: { key: firmKey }, select: { id: true } });
      if (!firm) return null;
      await touchFirm(tx, firm.id);
      const mine: { firmKey: string; key: string }[] = [], skipped: string[] = [];
      for (const row of await tx.platformFirmSetting.findMany({ where: firmScope(firm.id), orderBy: { key: "asc" } })) {
        const def = defs.get(row.key);
        if (!def) { skipped.push(`${firmKey}:${row.key}`); continue; }   // another module's key, not loaded here: left as it is
        const seedValue = Object.hasOwn(SAMPLE_SETTING_VALUES, row.key) ? SAMPLE_SETTING_VALUES[row.key] : def.default;
        if (JSON.stringify(row.value) === JSON.stringify(seedValue)) continue;
        await writeSetting(tx, { firmId: firm.id, key: row.key, value: seedValue, by: RESET_ACTOR, workspaceId: await platformAuditWorkspaceId(tx), reason: RESET_REASON });
        mine.push({ firmKey, key: row.key });
      }
      return { mine, skipped };
    });
    if (done) { changed.push(...done.mine); unregistered.push(...done.skipped); }
  }
  if (unregistered.length) console.warn(`demo reset: platform settings of keys not registered in this process were left as they are: ${unregistered.join(", ")}`);
  return { changed, unregistered };
}
