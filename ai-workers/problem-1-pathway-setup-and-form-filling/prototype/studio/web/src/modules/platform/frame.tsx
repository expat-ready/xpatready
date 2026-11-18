// PF-6 part 1 (concept pf-6-staff r2 §1, §4): the firm staff's own frame: the app's one Frame (BK-3) named for the firm,
// the signed-in person's name and Sign out in the header, and the My account menu from ACCOUNT_SECTIONS. No simulated-
// person control (the Studio's demo menu stays out of it, P-35): every call goes through `staffApi`'s bearer token.
// Until someone is signed in it shows the sign-in card; a session ended by a newer sign-in shows "Signed in elsewhere".
import * as React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Frame, useWhere, type Crumb } from "@/components/frame";
import { Button, Field, Input, Notice } from "@/components/ui/controls";
import type { Me } from "@/modules/front-office/sales/contract";
import { cn } from "@/lib/utils";
import { ACCOUNT_SECTIONS, visibleSections } from "./account-sections";
import { endSession, staffApi, StaffApiError, useLocalSignIn, useMe, useSessionEnd, useStaffToken } from "./session";
import { SignedInElsewhere } from "./signed-in-elsewhere";
import { TermsPage, useTermsPending } from "./terms/terms-gate";

/** FO-4's sign-in card (moved here from sales-frame.tsx): PF-4's local stand-in until the provider's sign-in pages. */
export function SignInCard({ failed, focus }: { failed?: string | null; /** Moves focus to the card when it appears in place of a page (break m6). */ focus?: boolean }) {
  const signIn = useLocalSignIn();
  const [firmKey, setFirmKey] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(failed ?? null);
  React.useEffect(() => { setError(failed ?? null); }, [failed]);
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { if (focus) heading.current?.focus(); }, [focus]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await signIn(firmKey.trim(), email.trim()); } catch (x) { setError(x instanceof StaffApiError ? x.message : "Could not sign in. Please try again."); } finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="fo-sign-in" className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-sm" data-sign-in-card>
      <h1 id="fo-sign-in" ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">Sign in to your firm</h1>
      <p className="mt-1 text-sm text-text-muted">These pages are for your firm's staff. This is the local stand-in sign-in until the firm sign-in screens are built.</p>
      <form className="mt-4 flex flex-col gap-3" onSubmit={send}>
        <Field label="Firm key"><Input value={firmKey} onChange={(e) => setFirmKey(e.target.value)} autoComplete="organization" required /></Field>
        <Field label="Work email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
        {error ? <Notice tone="danger" title="Not signed in">{error}</Notice> : null}
        <Button type="submit" busy={busy} className="self-start">Sign in</Button>
      </form>
    </section>
  );
}

const MeCtx = React.createContext<Me | null>(null);
/** The signed-in staff member (inside PlatformFrame only). */
export const usePlatformStaff = () => React.useContext(MeCtx)!;

function AccountMenu({ me, small }: { me: Me; small?: boolean }) {
  const item = ({ isActive }: { isActive: boolean }) => cn("flex min-h-9 items-center rounded-lg px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", isActive ? "bg-primary/10 font-medium text-text-link" : "text-text hover:bg-text/5");
  const links = visibleSections(ACCOUNT_SECTIONS, me.keys).map((s) => <NavLink key={s.path} to={s.path} end className={item} data-account-section={s.path}>{s.label}</NavLink>);
  // Below 768 px the side column is hidden (as every area's menu): the same entries show as a row above the page.
  return small
    ? <nav aria-label="My account sections" className="-mt-2 mb-4 flex flex-wrap gap-1 md:hidden">{links}</nav>
    : <nav aria-label="My account" className="hidden w-52 shrink-0 border-r border-border bg-surface-raised p-3 md:block"><p className="px-3 pb-2 text-xs font-medium text-text-muted">My account</p>{links}</nav>;
}

function Place({ crumbs, back }: { crumbs: Crumb[]; back: { to: string; label: string } | null }) {
  useWhere([{ label: "My account", to: "/account" }, ...crumbs], back);
  return null;
}

/** A staff page: the frame, the place line, and the page once a firm staff member is signed in. */
export function PlatformFrame({ crumbs = [], back = null, children }: { crumbs?: Crumb[]; back?: { to: string; label: string } | null; children: React.ReactNode }) {
  const token = useStaffToken();
  const because = useSessionEnd();
  const me = useMe();
  const qc = useQueryClient();
  const loc = useLocation();
  // Every move inside the app checks the session again, so a tab whose session ended elsewhere says so on its next click.
  const first = React.useRef(true);
  React.useEffect(() => { if (first.current) { first.current = false; return; } if (token) void qc.invalidateQueries({ queryKey: ["fo", "me"] }); }, [loc.key]);   // eslint-disable-line react-hooks/exhaustive-deps -- on each navigation only
  const [leaving, setLeaving] = React.useState(false);
  // Once a session has been seen here, a sign-in card that replaces it takes the focus (Sign out, Sign in again here).
  const had = React.useRef(false);
  if (token) had.current = true;
  const signOut = async () => {
    setLeaving(true);
    try { await staffApi("/platform/session/sign-out", { method: "POST" }); endSession(null); }
    // A 401 has ended the session already, with its reason; anything else still ends it here.
    catch (e) { if (!(e instanceof StaffApiError && e.status === 401)) endSession(null); }
    finally { setLeaving(false); }
  };
  const who = token ? me.data : undefined;
  const pending = useTermsPending(token, !!who);   // PF-5t part 2: terms to accept (428 TERMS_PENDING) replace the page
  const refused = me.error instanceof StaffApiError ? me.error.message : me.error ? "Could not check who is signed in." : null;
  return (
    <Frame area="outside" title={who ? who.firmKey : "Your firm"} home="/account"
      controls={who ? <><span className="min-w-0 truncate text-sm font-medium" data-staff-name>{who.displayName}</span><Button variant="ghost" size="sm" busy={leaving} onClick={() => void signOut()}>Sign out</Button></> : null}
      menu={who ? <AccountMenu me={who} /> : null}>
      <Place crumbs={crumbs} back={back} />
      {!token ? (because === "SIGNED_IN_ELSEWHERE" ? <SignedInElsewhere /> : <SignInCard focus={had.current} />)
        : me.isError && !who ? <SignInCard failed={refused} />
          : !who || !pending.checked ? <p role="status" className="text-sm text-text-muted" data-loading>Checking who is signed in…</p>
            : <><div hidden={!!pending.terms}><MeCtx.Provider value={who}><AccountMenu me={who} small />{children}</MeCtx.Provider></div>
              {pending.terms ? <TermsPage token={token} terms={pending.terms} signOut={() => void signOut()} leaving={leaving} /> : null}</>}
    </Frame>
  );
}
