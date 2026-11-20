// CS-K1 part 2 (brief design/build-lead-c-briefs/CS-K1-2.md; P-607; contract v0.1 §1 rule 4): the one-time job that links
// every existing client to its front-office party (clients.ts linkClient, through FoPersonPort). One JobPort job per firm
// (key `case_clients.link:<firm id>:<its oldest waiting client>`: queued again only while a client waits), run as that
// firm (PF-12). Each client in its own transaction,
// under its row lock, so an opening or FO-8 writing the same client meanwhile wins and the job writes nothing for it; a
// client already linked is left alone (FO-8's clients are born linked). A re-run changes nothing. Last, the link check is
// validated once no client of any firm is missing its link (case_client_validate_link_check, migration
// 20261120100000_csk1_client_link_check). A client that fails is named; the others still run.
import type { Prisma, PrismaClient } from "@prisma/client";
import type { FoPersonPort } from "../../../ports/fo-person.ts";
import { linkClient } from "../clients.ts";

export const LINK_JOB = "case_clients.link";
export const LINK_ACTOR = "system:case_clients.link";
export const linkJobKey = (firmId: string, oldestWaiting: string) => `${LINK_JOB}:${firmId.toLowerCase()}:${oldestWaiting}`;
export type LinkRun = { linked: number; failed: { clientId: string; error: string }[]; validated: boolean };

/** Links every client of one firm that names no front-office party, then tries the validation. */
export async function linkFirmClients(db: PrismaClient, foPerson: FoPersonPort<Prisma.TransactionClient>, firmId: string): Promise<LinkRun> {
  const out: LinkRun = { linked: 0, failed: [], validated: false };
  const todo = await db.caseClient.findMany({ where: { firmId, foPersonId: null, foCompanyId: null }, orderBy: { clientNumber: "asc" }, select: { id: true } });   // pending ones included
  for (const { id } of todo) {
    try {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`select 1 from case_client where id = ${id}::uuid for update`;
        const c = await tx.caseClient.findFirst({ where: { id, firmId } });
        if (c && (await linkClient(tx, foPerson, c, LINK_ACTOR))) out.linked++;
      }, { timeout: 15_000, maxWait: 10_000 });
    } catch (e) { out.failed.push({ clientId: id, error: String(e).slice(0, 300) }); }
  }
  out.validated = (await db.$queryRaw<{ v: boolean }[]>`select case_client_validate_link_check() as v`)[0].v;
  return out;
}
