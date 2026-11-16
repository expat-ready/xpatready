// PF-6 part 2a (BR-4 to BR-7; AG-1-12, -15, -41, -42, -66; SA-6-29, -44): the Person panel. Roles (nobody their own;
// only roles the actor may give; Owner with a reason and "Confirm it's you"), Access (Sign out everywhere, Deactivate
// with a reason, Reactivate with the server's seat check), or for an invitation: Resend and Revoke. Every refusal shows
// the server's words; the buttons name the person and never default to Yes (BIC-09).
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Field, Input, Notice, Panel, Pill } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { staffApi, StaffApiError, useStaffToken } from "../session";
import { givable, moneyKeysAdded, moneyLine, Person, roleLabel, shownName, STATUS_WORDS, type Invitation, type Role } from "./contract";
import { RolePicker } from "./roles";
import { ConfirmItsYou, staffChange, takeWaiting } from "./step-up";

type Me = { staffId: string; roles: string[]; keys: string[] };
type Act = { title: string; words: string; path: string; reason: boolean; done: string; button: string };
const failed = (e: unknown) => (e instanceof StaffApiError ? e.message : "Could not save. Please try again.");

/** One confirmed action: its words, a reason when asked (1-200), and the server's answer. */
function ActDialog({ act, onClose, run }: { act: Act | null; onClose: () => void; run: (a: Act, reason: string) => Promise<void> }) {
  const [reason, setReason] = React.useState(""), [error, setError] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setReason(""); setError(null); }, [act]);
  const go = async () => { if (!act) return; setBusy(true); setError(null); try { await run(act, reason); } catch (e) { setError(failed(e)); } finally { setBusy(false); } };
  return (
    <Dialog open={!!act} onOpenChange={(o) => { if (!o) onClose(); }} title={act?.title ?? ""} description={act?.words}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="destructive" busy={busy} onClick={() => void go()} data-act-confirm>{act?.button}</Button></>}>
      {act?.reason ? <Field label="Reason (1 to 200 characters)"><Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} data-act-reason /></Field> : null}
      {error ? <Notice tone="danger" title="Not done" className="mt-3"><span data-act-error>{error}</span></Notice> : null}
    </Dialog>
  );
}

function StaffBody({ id, roles, me }: { id: string; roles: readonly Role[]; me: Me }) {
  const token = useStaffToken(), qc = useQueryClient(), toast = useToast();
  const q = useQuery({ queryKey: ["pf", "staff", "one", id, token], enabled: !!token, retry: false, queryFn: async () => Person.parse(await staffApi(`/platform/staff/${id}`)) });
  const [chosen, setChosen] = React.useState<string[] | null>(null), [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false);
  const [act, setAct] = React.useState<Act | null>(null);
  const [ask, setAsk] = React.useState<React.ComponentProps<typeof ConfirmItsYou>["ask"]>(null);
  const p = q.data;
  React.useEffect(() => { setChosen(null); }, [p?.roles.join()]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["pf", "staff"] });
  /** Sends a change; a step-up refusal opens "Confirm it's you" and the change is kept to send after it. */
  const send = async (path: string, json: unknown, method: string, what: string, need = "change an Owner's access") => {
    try { const r = await staffChange<{ changed?: boolean } | null>(path, json, method); await refresh(); toast.push({ tone: "ok", text: r?.changed === false ? "Nothing to save: the roles are as they were." : what }); return true; }
    catch (e) { if (e instanceof StaffApiError && e.problem.code === "STEP_UP_REQUIRED") { setAsk({ staffId: id, path, json, method, what, need, detail: e.message }); return false; } throw e; }
  };
  // Back from "Confirm it's you": the kept change is sent once more under the new sign-in.
  React.useEffect(() => { const w = takeWaiting(id); if (w) void send(w.path, w.json, w.method, w.what, w.need).catch((e) => setError(failed(e))); }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- once, on opening
  if (q.isError) return <Notice tone="danger" title="Could not open this person">{failed(q.error)}</Notice>;
  if (!p) return <p role="status" className="text-sm text-text-muted">Loading…</p>;
  const canRoles = me.keys.includes("agent/role:assign"), own = p.id === me.staffId;
  const offered = givable(roles, me, false), fixed = p.roles.filter((r) => !offered.includes(r));
  const now = chosen ?? p.roles.filter((r) => offered.includes(r)), next = [...fixed, ...now];
  const added = next.filter((r) => !p.roles.includes(r)), money = moneyKeysAdded(roles, added);
  const saveRoles = async () => {
    setBusy(true); setError(null);
    try {
      // Concept §4 "conflict (reload)": the API replaces the whole list, so a panel read before someone else's change must
      // not undo it (review MJ-1, break M1). Read again first; changed since → save nothing and show the roles now.
      const fresh = Person.parse(await staffApi(`/platform/staff/${p.id}`));
      if ([...fresh.roles].sort().join() !== [...p.roles].sort().join()) { setError(`Someone else changed ${p.displayName}'s roles since you opened this. Nothing was saved: check the roles shown now and save again.`); setChosen(null); await q.refetch(); return; }
      if (await send(`/platform/staff/${p.id}/roles`, { roles: next, ...(reason.trim() ? { reason } : {}) }, "PATCH", `Roles saved for ${p.displayName}.`, "give or remove the Owner role")) setReason("");
    }
    catch (e) { setError(failed(e)); } finally { setBusy(false); }
  };
  const run = async (a: Act, why: string) => { await send(a.path, a.reason ? { reason: why } : {}, "POST", a.done); setAct(null); };
  const name = p.displayName;
  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm [overflow-wrap:anywhere]"><p>{p.email}</p><div className="mt-1 flex flex-wrap gap-2"><Pill data-person-status>{STATUS_WORDS[p.status] ?? p.status}</Pill><Pill>Two-step: {p.twoStep?.method ? "On" : p.twoStep ? "Off" : "Unknown"}</Pill></div>
        {p.deactivationReason ? <p className="mt-1 text-text-muted">Reason: {p.deactivationReason}</p> : null}</div>
      <section aria-labelledby="pf-person-roles" data-person-roles className="[overflow-wrap:anywhere]">
        <h3 id="pf-person-roles" className="text-sm font-semibold">Roles</h3>
        {!canRoles || own ? (
          <><p className="mt-1 text-sm">{p.roles.map(roleLabel).join(", ") || "No role"}</p>
            {own ? <p className="mt-1 text-xs text-text-muted" data-own-roles>Nobody changes their own roles. Ask another Owner or Admin.</p> : null}</>
        ) : (
          <div className="mt-2 flex flex-col gap-3">
            {fixed.length ? <p className="text-xs text-text-muted" data-fixed-roles>Also holds {fixed.map(roleLabel).join(", ")}, which you cannot give or remove.</p> : null}
            <RolePicker roles={roles} offered={offered} chosen={now} onChange={setChosen} legend={`Roles for ${name}`} />
            {money ? <p className="text-xs font-medium text-text-warn" data-money-line>{moneyLine(name, money)}</p> : null}
            <Field label="Reason (needed when the Owner role is given or removed; up to 200 characters)"><Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} data-roles-reason /></Field>
            {error ? <Notice tone="danger" title="Not saved"><span data-roles-error>{error}</span></Notice> : null}
            <Button className="self-start" busy={busy} onClick={() => void saveRoles()} data-save-roles>Save roles</Button>
          </div>
        )}
      </section>
      <section aria-labelledby="pf-person-access" data-person-access>
        <h3 id="pf-person-access" className="text-sm font-semibold">Access</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {p.roles.includes("OWNER") && !me.roles.includes("OWNER") ? <p className="text-sm text-text-muted" data-owner-access>Only an Owner can sign out, deactivate or reactivate an Owner.</p> : p.status === "DEACTIVATED" ? (
            <Button variant="outline" size="sm" data-reactivate onClick={() => setAct({ title: `Reactivate ${name}?`, words: `${name} can sign in again with the roles they had. This uses a seat.`, path: `/platform/staff/${p.id}/reactivate`, reason: true, done: `${name} is active again.`, button: `Reactivate ${name}` })}>Reactivate</Button>
          ) : (<>
            <Button variant="outline" size="sm" data-sign-out-everywhere onClick={() => setAct({ title: `Sign ${name} out everywhere?`, words: `Every session of ${name} ends now. They can sign in again.`, path: `/platform/staff/${p.id}/sign-out-everywhere`, reason: false, done: `${name} was signed out everywhere.`, button: "Sign out everywhere" })}>Sign out everywhere</Button>
            <Button variant="outline" size="sm" data-deactivate onClick={() => setAct({ title: `Deactivate ${name}?`, words: `${name}'s sessions end at once and they cannot sign in. Their work stays, shown as "(Inactive) ${name}". Their seat is freed. They are not emailed.`, path: `/platform/staff/${p.id}/deactivate`, reason: true, done: `${name} was deactivated.`, button: `Deactivate ${name}` })}>Deactivate</Button>
          </>)}
        </div>
      </section>
      {error && (!canRoles || own) ? <Notice tone="danger" title="Not done">{error}</Notice> : null}
      <ActDialog act={act} onClose={() => setAct(null)} run={run} />
      <ConfirmItsYou ask={ask} onClose={() => setAsk(null)} />
    </div>
  );
}

function InvitationBody({ inv, onDone }: { inv: Invitation; onDone: () => void }) {
  const qc = useQueryClient(), toast = useToast();
  const [error, setError] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false), [act, setAct] = React.useState<Act | null>(null);
  const done = async (r: { emailed?: boolean } | null, text: string) => { await qc.invalidateQueries({ queryKey: ["pf", "staff"] }); toast.push(r?.emailed === false ? { tone: "danger", text: `A new link was made for ${inv.email}, but the email could not be sent. Try Resend again.` } : { tone: "ok", text }); onDone(); };
  const resend = async () => { setBusy(true); setError(null); try { await done(await staffChange(`/platform/staff/invitations/${inv.id}/resend`, {}), `A new invitation was sent to ${inv.email}; the old link no longer works.`); } catch (e) { setError(failed(e)); } finally { setBusy(false); } };
  const run = async (a: Act) => { await staffChange(a.path, {}); setAct(null); await done(null, a.done); };
  return (
    <section aria-labelledby="pf-person-invitation" data-person-invitation className="flex flex-col gap-2 text-sm">
      <h3 id="pf-person-invitation" className="font-semibold">Invitation</h3>
      <p>Roles: {inv.roles.map(roleLabel).join(", ")}</p>
      <p>Sent {new Date(inv.createdAt).toLocaleString()} · {inv.status === "EXPIRED" ? "expired" : "works until"} {new Date(inv.expiresAt).toLocaleString()}</p>
      {error ? <Notice tone="danger" title="Not done"><span data-invitation-error>{error}</span></Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" busy={busy} onClick={() => void resend()} data-resend>{inv.status === "EXPIRED" ? "Invite again" : "Resend"}</Button>
        <Button variant="outline" size="sm" data-revoke onClick={() => setAct({ title: `Revoke the invitation to ${inv.email}?`, words: "The link stops working at once and its seat is freed.", path: `/platform/staff/invitations/${inv.id}/revoke`, reason: false, done: `The invitation to ${inv.email} was revoked.`, button: "Revoke invitation" })}>Revoke</Button>
      </div>
      <ActDialog act={act} onClose={() => setAct(null)} run={run} />
    </section>
  );
}

export function PersonPanel({ open, onClose, staff, invitation, roles, me, returnFocus }: { open: boolean; onClose: () => void; staff: { id: string; displayName: string; status: string } | null; invitation: Invitation | null; roles: readonly Role[]; me: Me; returnFocus: () => HTMLElement | null }) {
  const title = staff ? shownName(staff) : invitation?.email ?? "";
  return (
    <Panel open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={title} returnFocus={returnFocus} bodyLabel={`Person: ${title}`} description={invitation ? STATUS_WORDS[invitation.status] : undefined}
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      {staff ? <StaffBody id={staff.id} roles={roles} me={me} /> : invitation ? <InvitationBody inv={invitation} onDone={onClose} /> : null}
    </Panel>
  );
}
