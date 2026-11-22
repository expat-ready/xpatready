// PF-18s part 1 (concept §4 "Who works where", challenge m5: a pane that collects a value is a right panel): which office one person
// works from, or none (their times then use the firm's zone). One PUT; the server checks the person and the office are the firm's.
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Notice, Panel } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { staffApi, StaffApiError } from "../session";
import { Placed, type Office, type Person } from "./offices-contract";

const NONE = "none";

export function PlacePanel({ person, offices, onClose, returnFocus }: { person: Person | null; offices: readonly Office[]; onClose: () => void; returnFocus: () => HTMLElement | null }) {
  const qc = useQueryClient(), toast = useToast();
  const [choice, setChoice] = React.useState(NONE), [busy, setBusy] = React.useState(false), [problem, setProblem] = React.useState<string | null>(null);
  const sending = React.useRef(false);
  React.useEffect(() => { if (person) { setChoice(person.officeId ?? NONE); setProblem(null); } }, [person]);
  // Break m5: the panel opens on the ticked choice (the person's current office), not the first radio, so Space never moves them.
  React.useEffect(() => { if (!person) return; const t = setTimeout(() => document.querySelector<HTMLInputElement>('#place-form input[name="place"]:checked')?.focus(), 0); return () => clearTimeout(t); }, [person]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!person || sending.current) return;
    sending.current = true; setBusy(true); setProblem(null);
    try {
      const p = Placed.parse(await staffApi(`/platform/staff/${person.id}/office`, { method: "PUT", json: { officeId: choice === NONE ? null : choice } }));
      toast.push({ tone: "ok", text: p.officeId ? `${person.displayName} now works from ${offices.find((o) => o.id === p.officeId)?.name ?? "that office"}.` : `${person.displayName} has no office; their times use the firm's time zone.` });
      await qc.invalidateQueries({ queryKey: ["pf", "staff"] });
      onClose();
    } catch (x) { setProblem(x instanceof StaffApiError ? x.message : "Not saved. Please try again."); }
    finally { sending.current = false; setBusy(false); }
  };
  const name = person?.displayName ?? "";
  return (
    <Panel open={!!person} onOpenChange={(o) => { if (!o) onClose(); }} returnFocus={returnFocus} title={`Office for ${name}`} description="Their times (deadlines, reminders, bookings) show in this office's time zone."
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button type="submit" form="place-form" busy={busy} disabled={!person || choice === (person.officeId ?? NONE)} data-place-save>Save</Button></>}>
      <form id="place-form" onSubmit={(e) => void save(e)} className="flex flex-col gap-3">
        {problem ? <Notice tone="danger" title="Not saved"><span data-place-problem>{problem}</span></Notice> : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Which office does {name} work from?</legend>
          {offices.map((o) => <label key={o.id} className="flex items-start gap-2 text-sm"><input type="radio" name="place" className="mt-1" value={o.id} checked={choice === o.id} onChange={() => setChoice(o.id)} data-place-office={o.name} />
            <span className="[overflow-wrap:anywhere]">{o.name} <span className="text-text-muted">({o.timeZone})</span></span></label>)}
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="place" className="mt-1" value={NONE} checked={choice === NONE} onChange={() => setChoice(NONE)} data-place-office="none" /> No office (uses the firm's time zone)</label>
        </fieldset>
      </form>
    </Panel>
  );
}
