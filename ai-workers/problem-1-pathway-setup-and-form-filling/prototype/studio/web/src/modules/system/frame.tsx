// PF-17 part 4 PR B (R1.93; concept r2 §4a, §4b): our console's frame. The app's one Frame titled "ExpatReady console",
// its own place line, a side menu by keys (Firms here; Support comes with PR C), the person's name and Sign out set apart
// at the end. No firm "?", no trial banner, no workspace tabs (PF-31 stays off: these pages are not a firm's). Until
// someone is signed in it shows the console's sign-in card: PF-4s's local stand-in, by work email (scaffolding until our
// staff's real sign-in pages, a follow-up row: Lead 26 Q1). Sign out ends the session in this tab (the stand-in's token
// has no server session to end).
import * as React from "react";
import { NavLink } from "react-router-dom";
import { Frame, useWhere, type Crumb } from "@/components/frame";
import { Button, Field, Input, Notice } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { COPY, FIRM_READ_KEY, type SystemMe } from "./contract";
import { endSystemSession, SystemApiError, systemSignIn, useSystemMe, useSystemSessionEnd, useSystemToken } from "./session";

const MeCtx = React.createContext<SystemMe | null>(null);
/** The signed-in staff member, inside a console page. */
export const useSystemStaff = () => React.useContext(MeCtx)!;

const SECTIONS = [{ path: "/system/firms", label: "Firms", key: FIRM_READ_KEY }];

function SignInCard({ because }: { because: string | null }) {
  const [email, setEmail] = React.useState(""), [busy, setBusy] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { if (because) heading.current?.focus(); }, [because]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    try { await systemSignIn(email.trim()); }
    catch (x) { setError(x instanceof SystemApiError ? (x.problem.code === "STAND_IN_OFF" ? COPY.standInOff : x.message) : "Could not sign in. Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="sys-sign-in" className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-sm" data-system-sign-in>
      <h1 id="sys-sign-in" ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">{COPY.signInTitle}</h1>
      <p className="mt-1 text-sm text-text-muted">{COPY.signInLead}</p>
      {because ? <Notice tone="info" className="mt-3"><span data-system-sign-in-ended>{COPY.ended}</span></Notice> : null}
      <form className="mt-4 flex flex-col gap-3" onSubmit={send} noValidate>
        <Field label="Work email" error={null}><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        {error ? <p role="alert" className="text-sm text-text-danger" data-system-sign-in-error>{error}</p> : null}
        <Button type="submit" busy={busy} className="self-start">Sign in</Button>
      </form>
    </section>
  );
}

function Menu({ me }: { me: SystemMe }) {
  const item = ({ isActive }: { isActive: boolean }) => cn("block rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", isActive ? "bg-primary/10 font-medium text-text-link" : "text-text hover:bg-surface-sunken");
  const links = SECTIONS.filter((s) => me.keys.includes(s.key)).map((s) => <NavLink key={s.path} to={s.path} className={item}>{s.label}</NavLink>);
  return <nav aria-label="Console" className="hidden w-48 shrink-0 border-r border-border bg-surface-raised p-3 md:block">{links}</nav>;
}

function Place({ crumbs }: { crumbs: Crumb[] }) {
  useWhere([{ label: "ExpatReady console", to: "/system/firms" }, ...crumbs], null);
  return null;
}

/** A console page: the frame, the place line, and the page once one of our staff is signed in. */
export function SystemFrame({ crumbs = [], children }: { crumbs?: Crumb[]; children: React.ReactNode }) {
  const token = useSystemToken(), because = useSystemSessionEnd(), me = useSystemMe();
  const who = token ? me.data : undefined;
  return (
    <Frame area="outside" title="ExpatReady console" home="/system/firms"
      controls={who ? <><span className="hidden max-w-48 truncate text-sm text-text-muted sm:inline" data-system-who>{who.name}</span>
        <Button variant="outline" size="sm" onClick={() => endSystemSession(null)}>Sign out</Button></> : null}
      menu={who ? <Menu me={who} /> : null}>
      <Place crumbs={crumbs} />
      {!token ? <SignInCard because={because} />
        : me.isError ? <SignInCard because={me.error instanceof SystemApiError && me.error.status === 401 ? "NOT_SIGNED_IN" : null} />
          : !who ? <p role="status" className="text-sm text-text-muted" data-loading>Checking who is signed in…</p>
            : <MeCtx.Provider value={who}>
              <nav aria-label="Console sections" className="-mt-2 mb-4 flex flex-wrap gap-1 md:hidden">{SECTIONS.filter((s) => who.keys.includes(s.key)).map((s) => <NavLink key={s.path} to={s.path} className="rounded-lg px-3 py-2 text-sm text-text-link">{s.label}</NavLink>)}</nav>
              {children}</MeCtx.Provider>}
    </Frame>
  );
}
