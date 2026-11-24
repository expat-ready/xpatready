// PF-17 part 4 (R1.93; concept r2 Q4, challenge M1; Lead 26 on #3470): two Sample ExpatReady staff members so our
// console can be signed into on the demo with PF-4s's local stand-in (POST /api/system/session/local, by work email).
// Lead 26's terms: only where PLATFORM_ENVIRONMENT=local and PLATFORM_SYSTEM_IDENTITY=local (the loader already refuses the
// stand-in anywhere else at start-up, settings.ts); called anywhere else it throws and writes nothing; people labelled
// Sample; no password, secret or token here (the stand-in signs in by email and issues its token per sign-in).
// It answers how many it added, never who: a start-up line holds no email (SA-11 BR-16; Lead 28 on #3470).
// Idempotent: adds only who is missing by email, never changes an existing person's roles or status; two start-ups at
// once on one database both carry on (the email's unique key decides who adds the person).
import type { PrismaClient } from "@prisma/client";
import type { PlatformConfig } from "../config/settings.ts";

/** Who is seeded: email, display name and one role (PF-4s's seeded roles). Sample, local only. */
export const SAMPLE_SYSTEM_STAFF: readonly { email: string; displayName: string; role: string }[] = Object.freeze([
  { email: "ops.sample@expatready.example.com", displayName: "Platform Owner (Sample)", role: "platform-owner" },
  { email: "support.sample@expatready.example.com", displayName: "Support (Sample)", role: "platform-support" },
]);

export class SampleStaffRefused extends Error {}

type Settings = Pick<PlatformConfig, "environment"> & { systemIdentity: Pick<PlatformConfig["systemIdentity"], "via"> };

/** Whether this configuration may seed our Sample staff: local environment and our local stand-in, nothing else. */
export function sampleSystemStaffDecision(c: Settings): { run: boolean; why: string } {
  if (c.environment !== "local") return { run: false, why: `refused: PLATFORM_ENVIRONMENT=${c.environment} never seeds Sample ExpatReady staff` };
  if (c.systemIdentity.via !== "local") return { run: false, why: "PLATFORM_SYSTEM_IDENTITY is not local (no stand-in to sign them in)" };
  return { run: true, why: "PLATFORM_SYSTEM_IDENTITY=local (local)" };
}

/** Adds the Sample staff who are missing and says how many; throws (writing nothing) unless the decision allows it. */
export async function seedSampleSystemStaff(db: PrismaClient, c: Settings): Promise<{ added: number }> {
  const d = sampleSystemStaffDecision(c);
  if (!d.run) throw new SampleStaffRefused(`Sample ExpatReady staff not seeded: ${d.why}`);
  let added = 0;
  for (const p of SAMPLE_SYSTEM_STAFF) {
    if (await db.platSystemStaff.findUnique({ where: { email: p.email }, select: { id: true } })) continue;
    try {
      await db.platSystemStaff.create({ data: { email: p.email, displayName: p.displayName, grants: { create: [{ roleCode: p.role }] } } });
      added++;
    } catch (e) {
      // Two start-ups on one database at once (break m1): the other added this person first; the email is unique.
      if ((e as { code?: unknown })?.code !== "P2002") throw e;
    }
  }
  return { added };
}
