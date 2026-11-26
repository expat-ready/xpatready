// FO-7s1 part 1 (concept screens/fo-7s-money/concept-invoices.md (a)): the Money area's menu, shared by its pages. A later row adds
// its own line here (FO-7s3a Payments, FO-7s3b Trust and To move, FO-7m part 3 Monthly check, FO-7s5 Exports, FO-7s1 part 3
// Getting paid), each shown only with its key and trust state; an item without its key is absent, never disabled.
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Area } from "@/modules/platform/frame";
import { INVOICES_HOME, LIST_KEY } from "./invoices/contract";
import { PAYMENTS_HOME, PAYMENTS_KEY } from "./payments/contract";
import { GETTING_PAID_HOME } from "./settings/card-payments/contract";

const item = ({ isActive }: { isActive: boolean }) => cn("flex min-h-9 items-center rounded-lg px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", isActive ? "bg-primary/10 font-medium text-text-link" : "text-text hover:bg-text/5");
const ITEMS = [{ label: "Invoices", to: INVOICES_HOME, key: LIST_KEY }, { label: "Payments", to: PAYMENTS_HOME, key: PAYMENTS_KEY },
  { label: "Getting paid", to: GETTING_PAID_HOME, key: LIST_KEY }];   // FO-7s3a part 1: Payments; FO-7s2 part 1: Getting paid

const shownFor = (keys: readonly string[]) => ITEMS.filter((i) => keys.includes(i.key));
const linksOf = (keys: readonly string[]) => shownFor(keys).map((i) => <NavLink key={i.to} to={i.to} className={item} data-money-menu={i.label}>{i.label}</NavLink>);

export const MONEY_AREA: Area = {
  label: "Money", home: INVOICES_HOME,
  menu: (me) => shownFor(me.keys).length
    ? <nav aria-label="Money" className="hidden w-52 shrink-0 border-r border-border bg-surface-raised p-3 md:block"><p className="px-3 pb-2 text-xs font-medium text-text-muted">Money</p>{linksOf(me.keys)}</nav>
    : null,
};

/** Below 768 px the side column is hidden: the same entries as a row at the top of the page (as My account's small menu). */
export function MoneyMenuSmall({ keys }: { keys: readonly string[] }) {
  return shownFor(keys).length ? <nav aria-label="Money sections" className="-mt-2 mb-2 flex flex-wrap gap-1 md:hidden">{linksOf(keys)}</nav> : null;
}
