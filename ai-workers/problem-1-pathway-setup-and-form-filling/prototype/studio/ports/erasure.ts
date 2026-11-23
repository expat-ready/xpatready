// PF-21d part 1a (map row 85; SA-11-16, SA-11-18, SA-11-28, SA-11-40; brief product/screens/PF-21d/brief.md): the erasure
// port. Each module registers one eraser; the erasure job (api/src/platform/erasure/service.ts) calls every registered
// eraser for an approved deletion request, 7 days after approval, behind the "Data erasure" switch. Part 2 registers the
// platform's and front office's erasers; the case side registers its own (CS-X2).
// The rules every registry keeps (ports/contracts/erasure-port.contract.ts proves them on each):
// 1. A module registers once (a second register of the same module is refused); its name is a dotted lower-case word.
// 2. erasers() lists them in the order they registered, so a run is repeatable.
// The rules every eraser keeps (the job relies on them; the contract's eraserCases prove them on each eraser):
// 3. erase(tx, order) runs inside the job's one transaction, in the order's firm scope, after the job asked LegalHoldPort
//    (a held person is never erased: no eraser is called). It touches only that one person record's rows of that firm
//    (SA-11-40: never a family member, never another firm).
// 4. It is idempotent: a second call for the same order answers NOTHING (the job may re-run an order whose result it could
//    not record).
// 5. It answers ERASED, NOTHING, or KEPT with why (a class with a floor in code, e.g. money rows kept 7 years with the name
//    replaced by a reference, SA-11-16 (c)); a KEPT makes the request HELD (partial), never a false COMPLETED (SA-11-28).
//    The note holds ids, counts and class names only, never a name or an answer (BR-16).
// Legal reading Unconfirmed: no counsel. This folder imports only zod and its own files (case-side contract v0.1 §1 rule 3).
import { z } from "zod";
import { FirmId } from "./audit.ts";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "a uuid");
export const ModuleName = z.string().regex(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/, "a module name (dotted lower-case words)").max(60);

/** What the job asks an eraser to erase: one person record of one firm, for one request. */
export const ErasureOrder = z.strictObject({ requestId: Uuid, firmId: FirmId, personId: Uuid });
export type ErasureOrder = z.infer<typeof ErasureOrder>;

export const EraseOutcome = z.strictObject({
  outcome: z.enum(["ERASED", "NOTHING", "KEPT"]),
  /** Ids, counts and class names only (BR-16). */
  note: z.string().trim().min(1).max(300).refine((n) => !n.includes("@"), "ids and counts only, never an email"),
});
export type EraseOutcome = z.infer<typeof EraseOutcome>;

export interface Eraser<Tx = unknown> {
  readonly module: string;
  erase(tx: Tx, order: ErasureOrder): Promise<EraseOutcome>;
}

export interface ErasurePort<Tx = unknown> {
  register(eraser: Eraser<Tx>): void;
  erasers(): ReadonlyArray<Eraser<Tx>>;
}

/** A second register of one module, or a name that is not one. */
export class ErasureRefused extends Error {
  constructor(message: string) { super(message); this.name = "ErasureRefused"; }
}

/** Rules 1 and 2, shared by every registry. */
export function registerInto<Tx>(list: Eraser<Tx>[], eraser: Eraser<Tx>): void {
  const name = ModuleName.safeParse(eraser?.module);
  if (!name.success) throw new ErasureRefused(`register: "${String(eraser?.module)}" is not a module name`);
  if (list.some((e) => e.module === eraser.module)) throw new ErasureRefused(`register: ${eraser.module} has already registered its eraser`);
  list.push(eraser);
}

/** An in-memory registry (tests and the case side's own checks). */
export function fakeErasure<Tx = unknown>(): ErasurePort<Tx> {
  const list: Eraser<Tx>[] = [];
  return { register: (e) => registerInto(list, e), erasers: () => [...list] };
}
