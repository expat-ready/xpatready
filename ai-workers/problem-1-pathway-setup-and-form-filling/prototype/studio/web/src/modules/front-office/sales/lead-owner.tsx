// FO-4 later part (R1.32's screen part; brief FO-4.md part 2 "Assign with the `assignees` picker, the one-user hiding";
// concept r2 §4 screens 4-5; AG-2-13c rules 1-4, 11, 15; AG-2-86; BR-5, BR-10): on one lead's screen, Assign (no active
// owner) or Reassign (an owner) to any active colleague of the firm, whatever their role, through FO-2's
// `POST leads/:id/assign` with the owner the screen showed (`expectedOwnerStaffId`), so someone who took the lead meanwhile
// is never overwritten: the panel names them and the lead is read again. Shown only with `agent/prospect:assign`; never
// in a one-user firm (X-4). The owner history reads the lead's timeline (FO-2 part 4, `GET leads/:id/timeline`): its
// arrival and every take and assign with who and when (AG-2-13c rule 4), as the audit wrote them.
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button, Notice, Panel } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { LeadChanged, type Lead } from "./contract";
import { useOwners } from "./prospect-actions";
import { staffApi, StaffApiError } from "./session";
import { arrivedLabel } from "./time";
const Timeline = z.object({ lines: z.array(z.object({ at: z.string(), kind: z.string(), type: z.string(), actor: z.string().nullable(), actorName: z.string().nullable(), summary: z.string(), refId: z.string().nullable() })), more: z.boolean() });
const ASSIGNED = /assigned the lead to staff ([0-9a-f-]{36})/i;
/** The lead's owner shown by the screen: null when nobody active owns it (none, or "(Inactive) Name", BR-4). */
export const activeOwnerOf = (l: Lead) => (l.ownerStaffId !== null && !(l.owner ?? "").startsWith("(Inactive) ") ? l.ownerStaffId : null);

export function AssignPanel({ lead, open, onOpenChange }: { lead: Lead; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient(), toast = useToast(), owners = useOwners(), go = useNavigate();
  const current = activeOwnerOf(lead);
  const choices = owners.choices.filter((c) => c.staffId !== current);
  const [to, setTo] = React.useState("");
  const [problem, setProblem] = React.useState<string | null>(null);
  const sending = React.useRef(false);
  React.useEffect(() => { if (open) { setTo(""); setProblem(null); } }, [open]);
  const assign = useMutation({
    mutationFn: async (staffId: string) => LeadChanged.parse(await staffApi(`/front-office/leads/${lead.id}/assign`, { method: "POST", json: { staffId, expectedOwnerStaffId: lead.ownerStaffId } })),
    onSuccess: (r, staffId) => {
      onOpenChange(false);
      // Assigned away while "everyone sees all" is off: the change is done and the lead is no longer one the person may
      // open (FO-2 answers only that it is done), so they go back to Leads and are told why (break 3b).
      if ("done" in r) { toast.push({ tone: "ok", text: `${lead.number} is now ${owners.name(staffId)}'s. You no longer see it.` }); go("/front-office/leads"); return; }
      toast.push({ tone: "ok", text: `${lead.number} is now ${owners.name(staffId)}'s.` });
    },
    // Refused (someone took or assigned it first, or the person left): say who has it, and show the lead as it is now.
    // The choice is cleared after a refusal: the person chosen may have taken it, or left (break 4).
    onError: (e) => { setTo(""); setProblem(e instanceof StaffApiError ? `${e.message}${e.problem.code === "STALE_OWNER" || e.problem.code === "ALREADY_TAKEN" ? " Nothing was changed; the lead shows who has it now." : ""}` : "Could not assign the lead. Please try again."); },
    // The picker is read again too: someone deactivated meanwhile leaves it (break 5).
    onSettled: () => { sending.current = false; void qc.invalidateQueries({ queryKey: ["fo", "leads"] }); void qc.invalidateQueries({ queryKey: ["fo", "assignees"] }); },
  });
  const send = () => { if (!to) { setProblem("Choose who gets the lead."); return; } if (sending.current) return; sending.current = true; setProblem(null); assign.mutate(to); };
  const verb = current ? "Reassign" : "Assign";
  return (
    <Panel open={open} onOpenChange={(o) => { if (!assign.isPending) onOpenChange(o); }} returnFocus={() => document.querySelector<HTMLElement>("[data-assign-open]")} title={`${verb} lead`} description={`${lead.number} · now ${current ? owners.name(current) : lead.owner ?? "nobody"}`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)} disabled={assign.isPending}>Cancel</Button><Button busy={assign.isPending} onClick={send}>{verb}</Button></>}>
      {problem ? <div id="fo-assign-problem"><Notice tone="danger" className="mb-3" title={problem} /></div> : null}
      <fieldset data-assign-choices aria-describedby={problem ? "fo-assign-problem" : undefined} className="flex flex-col gap-1">
        <legend className="mb-2 text-sm">Who gets it? Every active person of your firm can have a lead.</legend>
        {choices.length ? choices.map((c) => (
          <label key={c.staffId} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-text/5">
            <input type="radio" name="fo-assign-to" value={c.staffId} checked={to === c.staffId} onChange={() => { setTo(c.staffId); setProblem(null); }} className="size-4" />
            {c.displayName}
          </label>
        )) : <p className="text-sm text-text-muted">No other active person in your firm.</p>}
      </fieldset>
    </Panel>
  );
}

/** Who has owned the lead, and since when: its arrival, then each take and assign, oldest first (AG-2-13c rule 4). */
export function OwnerHistory({ lead }: { lead: Lead }) {
  const owners = useOwners();
  const t = useQuery({ queryKey: ["fo", "leads", "one", lead.id, "timeline", lead.ownerStaffId], queryFn: async () => Timeline.parse(await staffApi(`/front-office/leads/${lead.id}/timeline`)) });
  const all = t.data?.lines ?? [];
  const lines = all.filter((x) => x.kind === "AUDIT" && (x.type === "lead.taken" || x.type === "lead.created"));
  // "To whom" by name for everyone who may read the lead (break 2, review m1): the timeline names every person who acted
  // on it (a deactivated one too), the lead names its owner ("(Inactive) Name"), and the picker names active colleagues.
  const known = new Map<string, string>(all.filter((x) => x.actor?.startsWith("staff:") && x.actorName).map((x) => [x.actor!.slice(6), x.actorName!]));
  if (lead.ownerStaffId && lead.owner) known.set(lead.ownerStaffId, lead.owner);
  const nameOf = (id: string) => known.get(id) ?? owners.name(id);
  const words = (x: (typeof lines)[number]) => {
    const who = x.actorName ?? "Someone";
    if (x.type === "lead.created") return `Arrived${x.actorName === "The system" ? "" : `, added by ${who}`}`;
    const m = ASSIGNED.exec(x.summary);
    return m ? `${who} assigned it to ${nameOf(m[1].toLowerCase())}` : `${who} took it`;
  };
  return (
    <section aria-labelledby="fo-owner-history" className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 id="fo-owner-history" className="text-sm font-semibold">Owner history</h2>
      {t.isPending ? <p className="mt-2 text-sm text-text-muted">Loading…</p>
        : t.isError ? <p role="alert" className="mt-2 text-sm text-text-danger">Could not load the history. <Button variant="link" size="sm" onClick={() => t.refetch()}>Try again</Button></p>
          : (
            <>
              {/* Empty or past the newest 500 lines, the section says so rather than standing blank (review m4, break 8). */}
              {lines.length ? <ol data-owner-history className="mt-2 flex flex-col gap-1.5">
                {lines.map((x) => <li key={x.refId ?? x.at} className="flex flex-wrap justify-between gap-x-3 text-sm"><span>{words(x)}</span><time dateTime={x.at} className="text-text-muted">{arrivedLabel(x.at)}</time></li>)}
              </ol> : <p data-owner-history className="mt-2 text-sm text-text-muted">{t.data?.more ? "The owner changes are older than the newest 500 lines of this lead's history." : "No owner changes yet."}</p>}
              {lines.length && t.data?.more ? <p className="mt-1 text-xs text-text-muted">Older changes are not shown.</p> : null}
            </>
          )}
    </section>
  );
}
