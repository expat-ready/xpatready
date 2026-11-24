// PF-6 part 2a (concept pf-6-staff r2 §4 "Team"; AG-1-10, -12, -13, -15; R1.6): Team, for agent/staff:manage. Search,
// chips Active · Invited · Inactive, the table (name, email, roles, status, two-step, last sign-in), the seat line, and
// Invite people; a row opens the Person panel (?person= or ?invitation= in the address, so it reopens after "Confirm
// it's you"). A person without the key who opens it by URL sees the server's refusal (DW4).
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Notice, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { staffApi, StaffApiError, useStaffToken } from "../session";
import { Invitations, roleLabel, Roles, shownName, StaffList, STATUS_WORDS } from "./contract";
import { InvitePanel } from "./invite-panel";
import { PersonPanel } from "./person-panel";

type View = "active" | "invited" | "inactive";
const CHIPS: { view: View; label: string }[] = [{ view: "active", label: "Active" }, { view: "invited", label: "Invited" }, { view: "inactive", label: "Inactive" }];
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : "Never");

function TeamBody() {
  const me = usePlatformStaff(), token = useStaffToken();
  const list = useQuery({ queryKey: ["pf", "staff", "list", token], enabled: !!token, retry: false, queryFn: async () => StaffList.parse(await staffApi("/platform/staff")) });
  const ok = list.isSuccess;
  const invs = useQuery({ queryKey: ["pf", "staff", "invitations", token], enabled: ok, retry: false, queryFn: async () => Invitations.parse(await staffApi("/platform/staff/invitations")).invitations });
  const roles = useQuery({ queryKey: ["pf", "roles", token], enabled: ok, retry: false, queryFn: async () => Roles.parse(await staffApi("/platform/roles")).roles });
  const [params, setParams] = useSearchParams();
  const view = (CHIPS.find((c) => c.view === params.get("view"))?.view ?? "active") as View;
  const [q, setQ] = React.useState(""), [inviting, setInviting] = React.useState(false);
  const opener = React.useRef<HTMLElement | null>(null);
  const inviteButton = React.useRef<HTMLButtonElement>(null);
  const put = (k: string, v: string | null) => { const p = new URLSearchParams(params); for (const x of ["person", "invitation"]) if (k !== "view") p.delete(x); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: k !== "view" }); };
  if (list.isError) return <Notice tone="danger" title="Not available"><span data-team-refused>{list.error instanceof StaffApiError ? list.error.message : "Could not load your team. Please try again."}</span></Notice>;
  if (!list.data || !roles.data || !invs.data) return <p role="status" className="text-sm text-text-muted" data-loading>{roles.isError || invs.isError ? "Could not load the roles or invitations. Please reload." : "Loading your team…"}</p>;
  const needle = q.trim().toLowerCase(), hit = (...s: string[]) => !needle || s.some((x) => x.toLowerCase().includes(needle));
  const people = list.data.staff.filter((s) => (view === "inactive" ? s.status === "DEACTIVATED" : s.status !== "DEACTIVATED") && hit(s.displayName, s.email));
  const invited = invs.data.filter((i) => (i.status === "PENDING" || i.status === "EXPIRED") && hit(i.email));
  const person = list.data.staff.find((s) => s.id === params.get("person")) ?? null, invitation = invs.data.find((i) => i.id === params.get("invitation") && (i.status === "PENDING" || i.status === "EXPIRED")) ?? null;   // only a pending or expired one (break m4)
  const open = (k: string, id: string) => (e: React.MouseEvent<HTMLElement>) => { opener.current = e.currentTarget; put(k, id); };
  const s = list.data.seats;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Team</h1>
          <p className="mt-1 text-sm text-text-muted" data-seat-line>{s.line}{s.plan ? ` on ${s.plan}${s.booked ? ", the plan booked for your renewal" : ""}` : ""}</p>
          <p className="text-xs text-text-muted">Active, suspended and invited people use a seat; deactivated people and expired or revoked invitations do not.</p></div>
        <Button ref={inviteButton} onClick={() => setInviting(true)} data-invite-open>Invite people</Button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Which people" className="flex flex-wrap gap-2">
          {CHIPS.map((c) => <button key={c.view} type="button" aria-pressed={c.view === view} data-chip={c.view} onClick={() => put("view", c.view === "active" ? null : c.view)}
            className={cn("min-h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", c.view === view ? "border-primary bg-primary/10 font-medium text-text-link" : "border-border bg-surface-raised hover:bg-text/5")}>{c.label}</button>)}
        </div>
        <label className="w-full sm:w-72"><span className="sr-only">Search by name or email</span><Input type="search" placeholder="Search by name or email" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      {view === "invited" ? (!invited.length ? <p data-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">No pending invitations.</p> : (
        <Table label="Team: Invited" head={["Email", "Roles", "Status", "Works until"]}>
          {invited.map((i) => <tr key={i.id} data-team-row={i.email}><td><button type="button" className="font-medium text-text-link hover:underline [overflow-wrap:anywhere]" onClick={open("invitation", i.id)}>{i.email}</button></td><td>{i.roles.map(roleLabel).join(", ")}</td><td>{STATUS_WORDS[i.status]}</td><td>{when(i.expiresAt)}</td></tr>)}
        </Table>
      )) : !people.length ? <p data-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">{needle ? `No one matches “${q.trim()}”.` : view === "inactive" ? "No inactive people." : "No one yet. Invite people to start."}</p> : (
        <Table label={`Team: ${view === "active" ? "Active" : "Inactive"}`} head={["Name", "Email", "Roles", "Status", "Two-step", "Last sign-in"]}>
          {people.map((p) => <tr key={p.id} data-team-row={p.email}>
            <td><button type="button" className="text-left font-medium text-text-link hover:underline [overflow-wrap:anywhere]" onClick={open("person", p.id)}>{shownName(p)}</button></td>
            <td className="[overflow-wrap:anywhere]">{p.email}</td><td>{p.roles.map(roleLabel).join(", ")}</td><td data-status>{STATUS_WORDS[p.status] ?? p.status}</td>
            <td>{p.twoStep === null ? "Unknown" : p.twoStep.method ? "On" : "Off"}</td><td>{when(p.lastSignInAt)}</td>
          </tr>)}
        </Table>
      )}
      <InvitePanel open={inviting} onOpenChange={setInviting} roles={roles.data} me={me} seats={s} returnFocus={() => inviteButton.current} />
      <PersonPanel open={!!person || !!invitation} onClose={() => put("person", null)} staff={person} invitation={person ? null : invitation} roles={roles.data} me={me} returnFocus={() => opener.current} />
    </div>
  );
}

export function TeamPage() {
  return <PlatformFrame crumbs={[{ label: "Team" }]}><TeamBody /></PlatformFrame>;
}
