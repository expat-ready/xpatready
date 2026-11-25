// R1.60 part a1 (product/screens/R1.60/rules.md B2-B4; AG-6-61 §5.1): the retainers module's one place that tells other
// modules a retainer version is signed (ports/retainer-signed.ts). Called by the e-signature's completion
// (signing/service.ts) and by Signed offline (retainers/service.ts), in their own transaction, before the event row.
// Each listener runs in its own savepoint: a listener's refusal or fault never undoes the signature, the prospect's win
// or the evidence; it is rolled back alone and one `retainer.signed_listener_held` audit line says so. Client money
// registers the deposit request's listener at start (features/client-money-trust.ts).
import { Prisma } from "@prisma/client";
import type { AuditPort } from "../../../../ports/audit.ts";
import { RetainerSigned, type RetainerSignedHook } from "../../../../ports/retainer-signed.ts";
import { logPort } from "../../platform/observability/log.ts";
import type { Tx } from "../sales/common.ts";

const hooks = new Map<string, RetainerSignedHook<Tx>>();

/** Registers a listener under its name once; returns the undo (a suite's clean-up). The same name again replaces it, so a
 *  second app in one process (a suite) never runs a listener twice. */
export function onRetainerSigned(name: string, hook: RetainerSignedHook<Tx>): () => void {
  hooks.set(name, hook);
  return () => { if (hooks.get(name) === hook) hooks.delete(name); };
}

/** The fee rows of a version as the port carries them (schedule order). */
export async function signedFees(tx: Tx, firmId: string, versionId: string): Promise<RetainerSigned["fees"]> {
  const rows = await tx.foRetainerFeeRow.findMany({ where: { firmId, versionId }, orderBy: { position: "asc" }, select: { label: true, amountMinor: true, currency: true, when: true } });
  return rows.map((f) => ({ label: f.label, amountMinor: f.amountMinor === null ? null : String(f.amountMinor), currency: f.currency, when: f.when }));
}

/** Runs every listener, each in its own savepoint. `signed` is checked inside it (review a1 m3): a malformed one is a
 *  fault of ours, held like any other, and never undoes the signature. */
export async function retainerSigned(tx: Tx, audit: AuditPort<Tx>, firmId: string, signed: RetainerSigned): Promise<void> {
  for (const [name, hook] of hooks) {
    await tx.$executeRaw`savepoint retainer_signed_listener`;
    try { await hook(tx, firmId, RetainerSigned.parse(signed)); await tx.$executeRaw`release savepoint retainer_signed_listener`; }
    catch (e) {
      await tx.$executeRaw`rollback to savepoint retainer_signed_listener`;
      let code = "Error";   // break a1 m3: naming the fault never throws in turn
      try { code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : typeof (e as { name?: unknown })?.name === "string" ? (e as { name: string }).name.slice(0, 60) : "Error"; } catch { /* keep "Error" */ }
      logPort.error("retainer_signed_listener_failed", e, { listener: name });
      await audit.record(tx, { firmId, actor: signed.actor, action: "retainer.signed_listener_held", entity: "fo_retainer", entityKey: signed.retainerId,
        summary: `Signed; ${name} did not run and is not tried again by itself: a person makes what it would have made (no catch-up yet)`,
        detail: { retainerId: signed.retainerId, retainerVersionId: signed.retainerVersionId, listener: name, fault: code }, before: null, after: { listener: name, fault: code } });
    }
  }
}
