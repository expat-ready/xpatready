// PF-17 part 4 PR B (R1.93; concept r2 §4a, §4b): our console's frame. The app's one Frame titled "ExpatReady console",
// its own place line, a side menu by keys (none drawn when the person may open no page), the name and Sign out set apart
// at the end. No firm "?", no trial banner, no workspace tabs (PF-31 stays off: these pages are not a firm's). Until
// someone is signed in it shows the console's sign-in card: PF-4s's local stand-in, by work email (scaffolding until our
// staff's real sign-in pages, a follow-up row: Lead 26 Q1). Sign out ends the session in this tab (the stand-in's token
// has no server session to end).
import * as React from "react";
import { NavLink } from "react-router-dom";
import { Frame, useWhere, type Crumb } from "@/components/frame";
import { Button, Field, Input, Notice } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { COPY, endedWords, FIRM_READ_KEY, type SystemMe } from "./contract";
import { endSystemSession, SystemApiError, systemSignIn, useSystemMe, useSystemSessionEnd, useSystemToken } from "./session";
import { PRIVACY_SECTIONS } from "./privacy/contract";

/** Set by a sign-in on the card: the next page moves the focus to its heading once its first answer is in (review #9). */
let arrived = false;
export const takeArrival = () => { const a = arrived; arrived = false; return a; };

const MeCtx = React.createContext<SystemMe | null>(null);
/** The signed-in staff member, inside a console page. */
export const useSystemStaff = () => React.useContext(MeCtx)!;

const SECTIONS = [{ path: "/system/firms", label: "Firms", key: FIRM_READ_KEY }];

function SignInCard({ because }: { because: string | null }) {
  const [email, setEmail] = React.useState(""), [busy, setBusy] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { if (because) heading.current?.focus(); }, [because]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError(COPY.emailNeeded); return; }   // nothing is sent for a blank email (review #5)
    setBusy(true); setError(null);
    try { await systemSignIn(email.trim()); arrived = true; }
    catch (x) { setError(x instanceof SystemApiError ? (x.problem.code === "STAND_IN_OFF" ? COPY.standInOff : x.message) : "Could not sign in. Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="sys-sign-in" className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-sm" data-system-sign-in>
      <h1 id="sys-sign-in" ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">{COPY.signInTitle}</h1>
      <p className="mt-1 text-sm text-text-muted">{COPY.signInLead}</p>
      {because ? <Notice tone="info" className="mt-3"><span data-system-sign-in-ended>{because}</span></Notice> : null}
      <form className="mt-4 flex flex-col gap-3" onSubmit={send} noValidate>
        <Field label="Work email" error={null}><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={error === COPY.emailNeeded || undefined} aria-describedby={error ? "sys-sign-in-error" : undefined} /></Field>
        {error ? <p id="sys-sign-in-error" role="alert" className="text-sm text-text-danger" data-system-sign-in-error>{error}</p> : null}
        <Button type="submit" busy={busy} className="self-start max-sm:min-h-11">Sign in</Button>
      </form>
    </section>
  );
}

/** PF-21rs A1 (concept §4): the side menu's groups; a group's heading shows only when one of its links does. */
const GROUPS: { label: string | null; sections: { path: string; label: string; key: string }[] }[] = [{ label: null, sections: SECTIONS }, { label: "Privacy", sections: PRIVACY_SECTIONS }];
const allowed = (me: SystemMe) => GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => me.keys.includes(s.key)) })).filter((g) => g.sections.length);

function Menu({ me }: { me: SystemMe }) {
  const item = ({ isActive }: { isActive: boolean }) => cn("block rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", isActive ? "bg-primary/10 font-medium text-text-link" : "text-text hover:bg-surface-sunken");
  const groups = allowed(me);
  if (!groups.length) return null;   // no empty column for someone who may open no page here (breaker 5)
  return <nav aria-label="Console" className="hidden w-48 shrink-0 border-r border-border bg-surface-raised p-3 md:block">
    {groups.map((g) => { const links = g.sections.map((s) => <NavLink key={s.path} to={s.path} className={item}>{s.label}</NavLink>);
      return g.label ? <div key={g.label} role="group" aria-labelledby={`sys-menu-${g.label}`} className="mt-3"><p id={`sys-menu-${g.label}`} className="px-3 pb-1 text-xs font-medium text-text-muted">{g.label}</p>{links}</div> : <React.Fragment key="top">{links}</React.Fragment>; })}
  </nav>;
}

function Place({ crumbs }: { crumbs: Crumb[] }) {
  useWhere([{ label: "ExpatReady console", to: "/system/firms" }, ...crumbs], null);
  return null;
}

/** A console page: the frame, the place line, and the page once one of our staff is signed in. */
export function SystemFrame({ crumbs = [], children }: { crumbs?: Crumb[]; children: React.ReactNode }) {
  const token = useSystemToken(), end = useSystemSessionEnd(), me = useSystemMe();
  const who = token ? me.data : undefined;
  const page = crumbs.length ? crumbs[crumbs.length - 1].label : "Console";
  React.useEffect(() => { const was = document.title; document.title = `${page} · ExpatReady console`; return () => { document.title = was; }; }, [page]);
  const mine = who ? allowed(who).flatMap((g) => g.sections) : [];
  return (
    <Frame area="outside" title="ExpatReady console" home="/system/firms"
      controls={who ? <><span className="hidden max-w-48 truncate text-sm text-text-muted sm:inline" data-system-who>{who.name}</span>
        <Button variant="outline" size="sm" onClick={() => endSystemSession(null)}>Sign out</Button></> : null}
      menu={who ? <Menu me={who} /> : null}>
      <Place crumbs={crumbs} />
      {!token ? <SignInCard because={endedWords(end.code, end.detail)} />
        // A 401 has ended the session already (the card above, with its reason); anything else keeps it and says so (review #4).
        : me.isError ? <Notice tone="danger" title="Not available" action={<Button variant="outline" size="sm" onClick={() => void me.refetch()}>Retry</Button>}>
          <span data-system-me-error>{COPY.meFailed} {me.error instanceof SystemApiError ? me.error.message : ""}</span></Notice>
          : !who ? <p role="status" className="text-sm text-text-muted" data-loading>Checking who is signed in…</p>
            : <MeCtx.Provider value={who}>
              {mine.length ? <nav aria-label="Console sections" className="-mt-2 mb-4 flex flex-wrap gap-1 md:hidden">{mine.map((s) => <NavLink key={s.path} to={s.path} className="rounded-lg px-3 py-2 text-sm text-text-link">{s.label}</NavLink>)}</nav> : null}
              {children}</MeCtx.Provider>}
    </Frame>
  );
}
