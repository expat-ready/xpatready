// PF-22v (R1.95, map row 95; AG-2-23 rules 5-7 and failure states, AG-2-64, AG-2-90; P-570, P-584 (2)): SavedViewPort,
// the door through which a module names a list it owns (front office: fo.leads, fo.pipeline.individual,
// fo.pipeline.corporate, fo.prospects), with its filter schema (zod: the list's own query words, so a saved filter is the
// same query the list reads), the key needed to share a view with the firm, and its check of a stored filter against
// today's data (a removed stage, an archived field): the parts that no longer apply are dropped and named, the rest
// applied. A view itself never widens what its viewer sees: the module applies its visibility when the list is read.
// The registry rule (ListRegistry) is shared by the real adapter (api/src/platform/saved-views/registry.ts) and the
// fake. This folder imports only zod and its own files.
import { z } from "zod";

/** A list name: lower-case words joined by dots (the database's pf_custom_name_ok, 64 characters). */
export const ListKind = z.string().regex(/^[a-z][a-z0-9_.]*$/).max(64);
/** A view's name: 1 to 80 characters (the database's pf_custom_label_ok). */
export const VIEW_NAME_MAX = 80;
/** A saved filter: the list's query words (a value is text or a list of text). */
export type ViewFilter = Record<string, string | string[]>;
/** A filter part that no longer applies: its query key and the plain words that say why. A check may also say the view
 *  opens empty for this viewer (`empty`): a part narrows to nothing they can see, so the list shows nothing, never more. */
export type DroppedPart = { part: string; label: string };
/** The words for the parts dropped: "1 filter part no longer applies" (AG-2-23 failure state). */
export const droppedLine = (n: number) => (n ? `${n} filter part${n === 1 ? "" : "s"} no longer appl${n === 1 ? "ies" : "y"}` : null);

/** Who asks: the signed-in staff member. */
export type SavedViewCaller = { firmId: string; staffId: string; keys: readonly string[] };
/** A module's list: its filter schema, the key that shares a view with the firm, and its check of a stored filter. */
export type ListRegistration<C extends SavedViewCaller = SavedViewCaller> = {
  filterSchema: z.ZodType<ViewFilter>;
  shareKey: string;
  /** The filter as it applies today: the parts that no longer apply removed and named. */
  check(ctx: C, filter: ViewFilter): Promise<{ filter: ViewFilter; dropped: DroppedPart[]; empty?: boolean }>;
};

export interface SavedViewPort<C extends SavedViewCaller = SavedViewCaller> {
  /** A module names a list it owns, once (a second registration is refused). */
  registerList(kind: string, reg: ListRegistration<C>): void;
  /** The registered lists, in order. */
  lists(): string[];
  /** A list's registration, or undefined (the routes answer 400). */
  listOf(kind: string): ListRegistration<C> | undefined;
}

/** The registry rule, shared by the real adapter and the fake. */
export class ListRegistry<C extends SavedViewCaller = SavedViewCaller> implements SavedViewPort<C> {
  private readonly regs = new Map<string, ListRegistration<C>>();
  registerList(kind: string, reg: ListRegistration<C>): void {
    ListKind.parse(kind);
    if (this.regs.has(kind)) throw new Error(`SavedViewPort: ${kind} is already registered`);
    if (!reg?.filterSchema || typeof reg.check !== "function" || !/^agent\/[a-z][a-z0-9-]*:[a-z][a-z0-9.-]*$/.test(reg.shareKey ?? "")) throw new Error(`SavedViewPort: ${kind} needs a filter schema, a share key and a check`);
    this.regs.set(kind, reg);
  }
  lists(): string[] { return [...this.regs.keys()]; }
  listOf(kind: string): ListRegistration<C> | undefined { return this.regs.get(kind); }
}

/** The fake: the same rule, nothing registered at first. */
export const fakeSavedViews = <C extends SavedViewCaller = SavedViewCaller>(): SavedViewPort<C> => new ListRegistry<C>();
