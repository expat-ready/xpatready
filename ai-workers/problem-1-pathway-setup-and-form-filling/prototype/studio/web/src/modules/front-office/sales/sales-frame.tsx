// FO-4 part 1 (concept r2 §2, m10): the sales area's own frame: the app's one Frame (BK-3) named "Sales", a menu
// (Leads and, from part 2a, Pipeline; Settings in part 3) whose Leads item carries the "n unassigned" badge, and who is
// signed in. A page here renders inside it only once a firm staff member is signed in; until then it shows the sign-in.
import * as React from "react";
import { NavLink } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Frame, useWhere, type Crumb } from "@/components/frame";
import { Button } from "@/components/ui/controls";
import { SignInCard as SignIn } from "@/modules/platform/frame";
import { FindBox } from "@/modules/platform/find/find-box";
import { cn } from "@/lib/utils";
import { Assignees, can, LeadRows, seesUnassigned, type Me } from "./contract";
import { Loading } from "./loading";
import { setStaffToken, staffApi, StaffApiError, useMe, useStaffToken } from "./session";
const MeCtx = React.createContext<Me | null>(null);
/** The signed-in staff member (inside SalesFrame only). */
export const useStaff = () => React.useContext(MeCtx)!;
/** Who may own a lead in this firm (`leads/assignees`), one query for the menu, Leads and the lead page. A failure is
 *  final for this view: no retry loop, no refetch on each mount (R1.32 re-review N1: a page waiting for it would hang). */
export const assigneesQuery = { queryKey: ["fo", "assignees"], retry: false, retryOnMount: false, queryFn: async () => Assignees.parse(await staffApi("/front-office/leads/assignees")) } as const;
/** Open unassigned leads, for the menu badge (only for people who see them, and never in a one-user firm: X-4,
 *  AG-2-13c rule 15; R1.32 review M1). The same `leads/assignees` answer as `useOwners`. */
export function useUnassignedCount(me: Me | null) {
  const firm = useQuery({ ...assigneesQuery, enabled: !!me });
  const on = !!me && seesUnassigned(me) && firm.data?.oneUser === false;
  return { on, ...useQuery({ queryKey: ["fo", "leads", "unassigned"], enabled: on, queryFn: async () => LeadRows.parse(await staffApi("/front-office/leads?view=unassigned")) }) };
}
function Menu({ me }: { me: Me }) {
  // Only when the badge is on: Leads may have read the same list into the cache (re-review M1).
  const count = useUnassignedCount(me), unassigned = count.on ? count.data?.length ?? 0 : 0;
  const item = ({ isActive }: { isActive: boolean }) => cn("flex min-h-9 items-center justify-between gap-2 rounded-lg px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", isActive ? "bg-primary/10 font-medium text-text-link" : "text-text hover:bg-text/5");
  return (
    <nav aria-label="Sales" className="hidden w-52 shrink-0 border-r border-border bg-surface-raised p-3 md:block">
      <p className="px-3 pb-2 text-xs font-medium text-text-muted">Sales</p>
      <NavLink to="/front-office/leads" end={false} className={item}>
        <span>Leads</span>
        {/* Orange is kept for "needs you" (P-473): unassigned leads wait for someone to take them. */}
        {unassigned ? <span data-unassigned-badge className="rounded-md bg-warn/15 px-1.5 py-0.5 text-[11px] font-medium text-text-warn">{unassigned} unassigned</span> : null}
      </NavLink>
      <NavLink to="/front-office/pipeline" className={item}>Pipeline</NavLink>
      {/* FO-4w: Settings for the people who may change them (Owner, Admin); the page says so to anyone else. */}
      {can(me, "agent/prospect:configure-form") || can(me, "agent/retainer:configure-template") ? <>
        <p className="px-3 pb-2 pt-4 text-xs font-medium text-text-muted">Settings</p>
        {can(me, "agent/prospect:configure-form") ? <NavLink to="/front-office/settings/web-form" className={item}>Web form</NavLink> : null}
        {/* FO-5s part 2: the firm's retainer templates (Owner, Admin). */}
        {can(me, "agent/retainer:configure-template") ? <NavLink to="/front-office/settings/retainer-templates" className={item}>Retainer templates</NavLink> : null}
      </> : null}
    </nav>
  );
}
/** Names the place on the frame's line; it must render inside Frame, whose context it sets. */
function Place({ crumbs, back }: { crumbs: Crumb[]; back: { to: string; label: string } | null }) {
  useWhere([{ label: "Sales", to: "/front-office/leads" }, ...crumbs], back);
  return null;
}
/** The sales area's page: the frame, the place line, and the page once someone is signed in. */
export function SalesFrame({ crumbs, back, children }: { crumbs: Crumb[]; back?: { to: string; label: string } | null; children: React.ReactNode }) {
  const token = useStaffToken();
  const me = useMe();
  const qc = useQueryClient();
  const signOut = () => { setStaffToken(null); qc.removeQueries({ queryKey: ["fo"] }); };
  const who = me.data;
  const refused = me.error instanceof StaffApiError ? me.error.message : me.error ? "Could not check who is signed in." : null;
  return (
    <Frame area="outside" workspace={!!who} title="Sales" subtitle={who ? who.displayName : undefined} home="/front-office/leads"
      controls={who ? <><FindBox /><Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button></> : null}
      menu={who ? <Menu me={who} /> : null}>
      <Place crumbs={crumbs} back={back ?? null} />
      {!token || (me.isError && !who) ? <SignIn failed={token ? refused : null} />
        : !who ? <Loading label="Checking who is signed in" />
          : (
            <MeCtx.Provider value={who}>
              {/* The menu column is hidden below 768 px: the same two places as links, so a phone reaches Pipeline. */}
              <nav aria-label="Sales pages" className="mb-3 flex gap-4 text-sm md:hidden"><NavLink to="/front-office/leads" className="text-text-link hover:underline">Leads</NavLink><NavLink to="/front-office/pipeline" className="text-text-link hover:underline">Pipeline</NavLink>{can(who, "agent/prospect:configure-form") ? <NavLink to="/front-office/settings/web-form" className="text-text-link hover:underline">Web form</NavLink> : null}{can(who, "agent/retainer:configure-template") ? <NavLink to="/front-office/settings/retainer-templates" className="text-text-link hover:underline">Retainer templates</NavLink> : null}</nav>
              {children}
            </MeCtx.Provider>
          )}
    </Frame>
  );
}
