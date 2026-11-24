// PF-6 part 2a (BR-1 to BR-3; AG-1-10, -13, -69): Invite people, a right panel. Rows of email and roles (Case Officer
// ticked first; Owner never offered, BR-1), one plain line per row and Compare roles; the seat line for the whole form
// before anything is sent (over the limit nothing is sent); a row the server refuses keeps its words.
// PF-4dn (AG-1-10): an optional Name per row goes with the invitation; accept uses it for the new staff member.
// R1.20 (P-727, PF-4c part 1b's route): the whole form is one call to staff/invitations/batch; the good rows are sent and
// leave the form, and each flagged row stays with its own words (a name flag under Name, every other flag under Email).
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { StaffApiError } from "../session";
import { givable, moneyKeysAdded, moneyLine, roleLine, type Role } from "./contract";
import { CompareRoles, RolePicker } from "./roles";
import { staffChange } from "./step-up";

type RowFlag = { code: string; detail: string };
/** PF-4c part 1b's answer: the rows sent, and each flagged row with its reason (`flags` lists every problem of the row). */
type BatchAnswer = { invited: { row: number; emailed?: boolean }[]; flagged: { row: number; reason: string; detail: string; flags?: RowFlag[] }[] };
/** A flag about the row's name shows under Name (PF-4dn review m1); every other flag under Email. */
const NAME_FLAGS = new Set(["INVALID_NAME"]);
type Row = { n: number; name: string; email: string; roles: string[]; error: string | null; nameError: string | null };
/** Case Officer ticked first (AG-1-69) when the inviter may give it; an Admin may not (SA-06: Admin lacks two of its keys). */
const fresh = (n: number, offered: readonly string[]): Row => ({ n, name: "", email: "", roles: offered.includes("CASE_OFFICER") ? ["CASE_OFFICER"] : [], error: null, nameError: null });

export function InvitePanel({ open, onOpenChange, roles, me, seats, returnFocus }: { open: boolean; onOpenChange: (o: boolean) => void; roles: readonly Role[]; me: { roles: string[]; keys: string[] }; seats: { used: number; limit: number }; returnFocus: () => HTMLElement | null }) {
  const offered = givable(roles, me, true);
  const [rows, setRows] = React.useState<Row[]>(() => [fresh(1, offered)]);
  const [busy, setBusy] = React.useState(false);
  const [formError, setFormError] = React.useState<{ title: string; text: string } | null>(null);
  const next = React.useRef(2);
  const qc = useQueryClient(), toast = useToast();
  React.useEffect(() => { if (open) { setRows([fresh(1, offered)]); setFormError(null); next.current = 2; } }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps -- a fresh form on each opening
  const set = (n: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.n === n ? { ...r, ...p } : r)));
  const after = seats.used + rows.length, over = after - seats.limit;
  // BR-3: the same email twice on this form is flagged on the later row (the server flags staff and pending invitations).
  const twice = (r: Row) => !!r.email.trim() && rows.some((o) => o.n < r.n && o.email.trim().toLowerCase() === r.email.trim().toLowerCase());
  const send = async () => {
    if (over > 0 || rows.some(twice)) return;
    setBusy(true); setFormError(null);
    const form = rows;   // row k of the request is form[k - 1]
    let answer: BatchAnswer;
    try { answer = await staffChange<BatchAnswer>("/platform/staff/invitations/batch", { rows: form.map((r) => ({ email: r.email.trim(), roles: r.roles, ...(r.name.trim() ? { name: r.name.trim() } : {}) })) }); }
    catch (e) {
      // The staff list is read again, as after a send: a 428 there brings up the terms page (PF-5t break M2), the form kept.
      setBusy(false); void qc.invalidateQueries({ queryKey: ["pf", "staff"] }); setFormError({ title: "Nothing was sent", text: e instanceof StaffApiError ? e.message : "Could not send these invitations. Please try again." }); return;
    }
    const sentNs = new Set(answer.invited.map((i) => form[i.row - 1]?.n));
    const flagsOf = new Map(answer.flagged.map((f) => [form[f.row - 1]?.n, f.flags?.length ? f.flags : [{ code: f.reason, detail: f.detail }]]));
    const words = (fs: RowFlag[] | undefined, name: boolean) => fs?.filter((f) => NAME_FLAGS.has(f.code) === name).map((f) => f.detail).join(" ") || null;
    setRows((rs) => rs.filter((r) => !sentNs.has(r.n)).map((r) => (flagsOf.has(r.n) ? { ...r, error: words(flagsOf.get(r.n), false), nameError: words(flagsOf.get(r.n), true) } : r)));
    setBusy(false);
    await qc.invalidateQueries({ queryKey: ["pf", "staff"] });
    const sent = answer.invited.length, unmailed = answer.invited.filter((i) => i.emailed === false).length, flagged = answer.flagged.length;
    if (sent) toast.push(unmailed ? { tone: "danger", text: `${sent} ${sent === 1 ? "invitation" : "invitations"} made; ${unmailed} could not be emailed. Use Resend under Invited.` } : { tone: "ok", text: `${sent} ${sent === 1 ? "invitation" : "invitations"} sent.` });
    if (flagged) setFormError({ title: "Not everyone was invited", text: `${flagged} ${flagged === 1 ? "person was" : "people were"} not invited. Fix ${flagged === 1 ? "the row" : "each row"} below and send again.` });
    else if (sent === form.length) onOpenChange(false);
  };
  return (
    <Panel open={open} onOpenChange={onOpenChange} returnFocus={returnFocus} confirmClose={() => !rows.some((r) => r.email.trim() || r.name.trim()) || window.confirm("Discard the people you typed?")} title="Invite people" description="Each person gets their own invitation email. It works for 72 hours."
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button><Button busy={busy} disabled={over > 0} onClick={() => void send()} data-send-invites>Send {rows.length === 1 ? "invitation" : `${rows.length} invitations`}</Button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm" data-invite-seats>{after} of {seats.limit} seats after these invites</p>
        {formError ? <div data-invite-form-error><Notice tone="danger" title={formError.title}>{formError.text}</Notice></div> : null}
        {over > 0 ? <Notice tone="warn" title="Plan limit reached">Remove {over} {over === 1 ? "person" : "people"} or upgrade your plan. Nothing is sent until the form fits.</Notice> : null}
        {rows.map((r, i) => {
          const money = moneyKeysAdded(roles, r.roles), dup = twice(r);
          return (
            <section key={r.n} className="rounded-xl border border-border p-3" aria-label={`Person ${i + 1}`} data-invite-row={i + 1}>
              <Field label={`Email, person ${i + 1}`} error={dup ? "This email is already on another row." : r.error}>
                <Input type="email" value={r.email} autoComplete="off" onChange={(e) => set(r.n, { email: e.target.value, error: null })} />
              </Field>
              {/* PF-4dn: after the email, the one required field, which keeps the panel's first focus (PF-6 DW8). */}
              <div className="mt-3"><Field label={`Name, person ${i + 1} (optional)`} error={r.nameError}>
                <Input value={r.name} autoComplete="off" onChange={(e) => set(r.n, { name: e.target.value, nameError: null })} data-invite-name />
              </Field></div>
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
