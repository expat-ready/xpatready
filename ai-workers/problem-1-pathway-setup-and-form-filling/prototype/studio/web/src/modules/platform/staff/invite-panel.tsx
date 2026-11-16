// PF-6 part 2a (BR-1 to BR-3; AG-1-10, -13, -69): Invite people, a right panel. Rows of email and roles (Case Officer
// ticked first; Owner never offered, BR-1), one plain line per row and Compare roles; the seat line for the whole form
// before anything is sent (over the limit nothing is sent); one call per row; a row the server refuses keeps its words.
// The API takes no name (PF-4's invite: email and roles; the name comes at sign-up): asked on the PR, not collected here.
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { StaffApiError } from "../session";
import { givable, moneyKeysAdded, moneyLine, roleLine, type Role } from "./contract";
import { CompareRoles, RolePicker } from "./roles";
import { staffChange } from "./step-up";

type Row = { n: number; email: string; roles: string[]; error: string | null };
/** Case Officer ticked first (AG-1-69) when the inviter may give it; an Admin may not (SA-06: Admin lacks two of its keys). */
const fresh = (n: number, offered: readonly string[]): Row => ({ n, email: "", roles: offered.includes("CASE_OFFICER") ? ["CASE_OFFICER"] : [], error: null });

export function InvitePanel({ open, onOpenChange, roles, me, seats, returnFocus }: { open: boolean; onOpenChange: (o: boolean) => void; roles: readonly Role[]; me: { roles: string[]; keys: string[] }; seats: { used: number; limit: number }; returnFocus: () => HTMLElement | null }) {
  const offered = givable(roles, me, true);
  const [rows, setRows] = React.useState<Row[]>(() => [fresh(1, offered)]);
  const [busy, setBusy] = React.useState(false);
  const next = React.useRef(2);
  const qc = useQueryClient(), toast = useToast();
  React.useEffect(() => { if (open) { setRows([fresh(1, offered)]); next.current = 2; } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps -- a fresh form on each opening
  const set = (n: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.n === n ? { ...r, ...p } : r)));
  const after = seats.used + rows.length, over = after - seats.limit;
  // BR-3: the same email twice on this form is flagged on the later row (the server flags staff and pending invitations).
  const twice = (r: Row) => !!r.email.trim() && rows.some((o) => o.n < r.n && o.email.trim().toLowerCase() === r.email.trim().toLowerCase());
  const send = async () => {
    if (over > 0 || rows.some(twice)) return;
    setBusy(true);
    let sent = 0, unmailed = 0;
    for (const r of rows) {
      try { const a = await staffChange<{ emailed?: boolean }>("/platform/staff/invitations", { email: r.email.trim(), roles: r.roles }); sent++; if (a?.emailed === false) unmailed++; setRows((rs) => rs.filter((x) => x.n !== r.n)); }
      catch (e) { set(r.n, { error: e instanceof StaffApiError ? e.message : "Could not send this invitation. Please try again." }); }
    }
    setBusy(false);
    await qc.invalidateQueries({ queryKey: ["pf", "staff"] });
    if (sent) toast.push(unmailed ? { tone: "danger", text: `${sent} ${sent === 1 ? "invitation" : "invitations"} made; ${unmailed} could not be emailed. Use Resend under Invited.` } : { tone: "ok", text: `${sent} ${sent === 1 ? "invitation" : "invitations"} sent.` });
    if (sent === rows.length) onOpenChange(false);
  };
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} confirmClose={() => !rows.some((r) => r.email.trim()) || window.confirm("Discard the people you typed?")} title="Invite people" description="Each person gets their own invitation email. It works for 72 hours."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button><Button busy={busy} disabled={over > 0} onClick={() => void send()} data-send-invites>Send {rows.length === 1 ? "invitation" : `${rows.length} invitations`}</Button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm" data-invite-seats>{after} of {seats.limit} seats after these invites</p>
        {over > 0 ? <Notice tone="warn" title="Plan limit reached">Remove {over} {over === 1 ? "person" : "people"} or upgrade your plan. Nothing is sent until the form fits.</Notice> : null}
        {rows.map((r, i) => {
          const money = moneyKeysAdded(roles, r.roles), dup = twice(r);
          return (
            <section key={r.n} className="rounded-xl border border-border p-3" aria-label={`Person ${i + 1}`} data-invite-row={i + 1}>
              <Field label={`Email, person ${i + 1}`} error={dup ? "This email is already on another row." : r.error}>
                <Input type="email" value={r.email} autoComplete="off" onChange={(e) => set(r.n, { email: e.target.value, error: null })} />
              </Field>
              <div className="mt-3"><RolePicker roles={roles} offered={offered} chosen={r.roles} legend="Roles" onChange={(x) => set(r.n, { roles: x, error: null })} /></div>
              <p className="mt-2 text-xs text-text-muted" data-role-line>{r.roles.length ? roleLine(r.roles) : "Choose at least one role."}</p>
              {money ? <p className="mt-1 text-xs font-medium text-text-warn" data-money-line>{moneyLine(r.email.trim() || "this person", money)}</p> : null}
              {rows.length > 1 ? <Button variant="link" size="sm" onClick={() => setRows((rs) => rs.filter((x) => x.n !== r.n))}>Remove person {i + 1}</Button> : null}
            </section>
          );
        })}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, fresh(next.current++, offered)])} data-add-row>+ Add another person</Button>
          <CompareRoles roles={roles} />
        </div>
      </div>
    </Panel>
  );
}
