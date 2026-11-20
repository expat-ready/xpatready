// FO-4 part 1 (concept r2 §2, m10): the sales area's own frame: the app's one Frame (BK-3) named "Sales", a menu
// (Leads and, from part 2a, Pipeline; Settings in part 3) whose Leads item carries the "n unassigned" badge, and who is
// signed in. A page here renders inside it only once a firm staff member is signed in; until then it shows the sign-in.
import * as React from "react";
import { NavLink } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Frame, useWhere, type Crumb } from "@/components/frame";
import { Button } from "@/components/ui/controls";
import { SignInCard as SignIn } from "@/modules/platform/frame";
import { cn } from "@/lib/utils";
import { can, LeadRows, seesUnassigned, type Me } from "./contract";
import { Loading } from "./loading";
import { setStaffToken, staffApi, StaffApiError, useMe, useStaffToken } from "./session";
const MeCtx = React.createContext<Me | null>(null);
/** The signed-in staff member (inside SalesFrame only). */
export const useStaff = () => React.useContext(MeCtx)!;
/** Open unassigned leads, for the menu badge (only for people who see them). */
export function useUnassignedCount(me: Me | null) {
  const on = !!me && seesUnassigned(me);
  return useQuery({ queryKey: ["fo", "leads", "unassigned"], enabled: on, queryFn: async () => LeadRows.parse(await staffApi("/front-office/leads?view=unassigned")) });
}
function Menu({ me }: { me: Me }) {
  const unassigned = useUnassignedCount(me).data?.length ?? 0;
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
      {can(me, "agent/prospect:configure-form") ? <>
        <p className="px-3 pb-2 pt-4 text-xs font-medium text-text-muted">Settings</p>
        <NavLink to="/front-office/settings/web-form" className={item}>Web form</NavLink>
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
    <Frame area="outside" title="Sales" subtitle={who ? who.displayName : undefined} home="/front-office/leads"
      controls={who ? <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button> : null}
      menu={who ? <Menu me={who} /> : null}>
      <Place crumbs={crumbs} back={back ?? null} />
      {!token || (me.isError && !who) ? <SignIn failed={token ? refused : null} />
        : !who ? <Loading label="Checking who is signed in" />
          : (
            <MeCtx.Provider value={who}>
              {/* The menu column is hidden below 768 px: the same two places as links, so a phone reaches Pipeline. */}
              <nav aria-label="Sales pages" className="mb-3 flex gap-4 text-sm md:hidden"><NavLink to="/front-office/leads" className="text-text-link hover:underline">Leads</NavLink><NavLink to="/front-office/pipeline" className="text-text-link hover:underline">Pipeline</NavLink>{can(who, "agent/prospect:configure-form") ? <NavLink to="/front-office/settings/web-form" className="text-text-link hover:underline">Web form</NavLink> : null}</nav>
              {children}
            </MeCtx.Provider>
          )}
    </Frame>
  );
}
