// CS-MV1 (Track B; brief design/briefs/track-b/CS-MV1.md; R1.56): who may see an invoice, behind a port. AG-6-1 §8 C5,
// as ruled for FO-7q (Lead 61 #1878 comment 6900938081, Lead B comment 6901029156): an invoice is visible exactly when
// its case is visible, or, when it has no case, when its person or company is; no role sees money firm-wide by its role.
// Client money reaches the case side only through this port (case-side contract v0.1 §1 rule 4).
// The rules every adapter keeps (ports/contracts/money-visibility-port.contract.ts proves them on each):
// 1. `scopeOf(ctx)` answers for the session's firm only (`ctx.firmId`, never a value from a request); another firm's
//    case or party id is never in it.
// 2. `cases`: the cases the case side lets this person see; `parties`: the persons and companies (front-office ids) the
//    front office lets them see, for invoices with no case. Lists of ids, never "ALL": the app's answer is always a list.
// 3. Holding only invoice keys (`agent/invoice:list`, `:show`) gives nothing: visibility comes from case and prospect
//    access, never from the money keys.
// 4. Each list holds each id once, lower case.
// 5. `ctx` is the session's, built by PF-4's guard (which refuses a deactivated or suspended person with 401); a person
//    who is not a staff member of `ctx.firmId` gets nothing at all.
// A firm-wide viewer's lists hold every case and prospect subject of the firm: a consumer passes each list to SQL as
// ONE array parameter (`= any(${ids}::uuid[])`, as FO-7q does), never as one parameter per id (Postgres's limit).
// This folder imports only zod and its own files.
import { z } from "zod";
import type { StaffContext } from "./staff.ts";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "a lower-case uuid");
/** FO-7q's `MoneyScope` without its "ALL" (rule 2). */
export const MoneyVisibility = z.strictObject({ cases: z.array(Uuid), parties: z.array(Uuid) });
export type MoneyVisibility = z.infer<typeof MoneyVisibility>;

export interface MoneyVisibilityPort {
  /** The cases and parties whose invoices this staff member may see. */
  scopeOf(ctx: StaffContext): Promise<MoneyVisibility>;
}

/** Answers `{ cases: [], parties: [] }` (fail closed) unless the test grants ids: `grant(firmId, staffId, scope)`. */
export function fakeMoneyVisibility(): MoneyVisibilityPort & { grant(firmId: string, staffId: string, scope: MoneyVisibility): void } {
  const granted = new Map<string, MoneyVisibility>();
  const key = (firmId: string, staffId: string) => `${firmId.toLowerCase()} ${staffId.toLowerCase()}`;
  return {
    async scopeOf(ctx) {
      const s = granted.get(key(ctx.firmId, ctx.staffId));
      return s ? { cases: [...s.cases], parties: [...s.parties] } : { cases: [], parties: [] };
    },
    grant(firmId, staffId, scope) {
      const s = MoneyVisibility.parse(scope);
      granted.set(key(firmId, staffId), { cases: [...new Set(s.cases)], parties: [...new Set(s.parties)] });
    },
  };
}
