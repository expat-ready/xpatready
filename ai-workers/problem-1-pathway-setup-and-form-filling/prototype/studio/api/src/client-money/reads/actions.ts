// FO-7q: the one actions table (brief: "a later money row (FO-7p, FO-7v) adds its line here, never a second copy").
// An action is offered only when its route is on main and the caller holds its key (AG-06 C5 keys as the brief lists
// them); the screens show exactly this list (FO-7s1: "actions only from allowedActions"). Not here until their routes
// exist: delete draft, Pay from trust, pay link (never on a deposit invoice), payment plan, refund, write-off, reverse.
import type { StatusWord } from "../../../../ports/client-money.ts";

export type Action = "EDIT" | "ISSUE" | "SEND" | "RECORD_PAYMENT" | "CREDIT_NOTE" | "DOWNLOAD_PDF";
/** What an action is read from: the status word, the keys the caller holds now, and two facts (`creditableMinor` is what
 *  FO-7b's credit route would take now; invoices.ts computes it). */
export type ActionFacts = { status: StatusWord; keys: readonly string[]; startedByCaller: boolean; creditableMinor: number };

const OWING: readonly StatusWord[] = ["Open", "Overdue", "Part paid"];
type Row = { action: Action; when: (f: ActionFacts) => boolean };
const has = (f: ActionFacts, k: string) => f.keys.includes(k);

/** Each line: the action, and when it is offered (status, key, facts). Order is the screen's order. */
export const ACTIONS: readonly Row[] = [
  // a draft: the route needs :create, and someone else's draft also :edit (FO-7b's addLine rule, AG-06 C5 "Edit a DRAFT invoice")
  { action: "EDIT", when: (f) => f.status === "Draft" && has(f, "agent/invoice:create") && (f.startedByCaller || has(f, "agent/invoice:edit")) },
  { action: "ISSUE", when: (f) => f.status === "Draft" && has(f, "agent/invoice:issue") },
  { action: "RECORD_PAYMENT", when: (f) => OWING.includes(f.status) && has(f, "agent/payment:record") },
  { action: "SEND", when: (f) => OWING.includes(f.status) && has(f, "agent/invoice:issue") },
  // FO-7b's credit route: any issued invoice but a written-off one, while something is creditable (creditableMinor: not yet
  // credited or written off, less what was paid from trust, which FO-7b refuses as TRUST_PAID). Paid and Refunded included.
  { action: "CREDIT_NOTE", when: (f) => f.status !== "Draft" && f.status !== "Written off" && f.creditableMinor > 0 && has(f, "agent/invoice:void") },
  { action: "DOWNLOAD_PDF", when: (f) => f.status !== "Draft" && has(f, "agent/invoice:show") },
];

export const allowedActions = (f: ActionFacts): Action[] => ACTIONS.filter((r) => r.when(f)).map((r) => r.action);
