// PF-21s part 4 (concept screens/pf-21-complaints §4 "Drawers", §5 "Refused"; BR-2, BR-3): one side panel for each act
// on an open complaint (acknowledge, a handling step, a note, response sent, close with an outcome, change handler).
// The date defaults to now in the firm's zone; a step or note left at its default sends no date (the service fills it),
// the other acts send the default cut to the minute. It posts once (a second click while posting sends nothing, as the
// record drawer's break M1), keeps what was typed across an ended session (break M3), and shows a refusal in the panel
// with the server's words: 422 on each field with a summary, 409 and 403 as a notice. A 404 (access lost while working)
// hands back to the page, which shows the not-found words.
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel, Select, Textarea } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { usePlatformStaff } from "../frame";
import { staffApi, StaffApiError, staffToken } from "../session";
import { ACTION, type Action, CLOSED_REFUSED, Complaint, FORBIDDEN, Handlers, nowLocal, OUTCOME, zonedToIso, zoneName } from "./contract";

type Form = { at: string; note: string; outcome: string; handlerStaffId: string };
/** What the person typed, kept in this tab's memory while the panel is open (never stored): a session that ends
 *  mid-panel unmounts the page, and signing in again as the same person on the same complaint brings it back. */
let kept: { staffId: string; complaintId: string; action: Action; form: Form; start?: string; carried?: boolean } | null = null;
export const keptAction = (staffId: string, complaintId: string): Action | null => (kept?.staffId === staffId && kept.complaintId === complaintId ? kept.action : null);
const LABEL: Record<string, string> = { at: "When", note: "Note", outcome: "Outcome", handlerStaffId: "New handler", kind: "Kind" };
const PATH: Record<Action, string> = { acknowledge: "acknowledge", step: "steps", note: "steps", response: "response-sent", close: "close", handler: "handler" };
const noteRequired = (a: Action) => a === "step" || a === "note" || a === "close";

export function ActionDrawer({ action, onAct, onClose, complaint, dates, zone, handlerId, onLost, returnFocus }: {
  action: Action | null; onAct: (a: Action) => void; onClose: () => void; complaint: string; zone: string; handlerId: string; onLost: () => void; returnFocus: () => HTMLElement | null;
  /** The recorded dates an act must not come before (the service's own order checks). */
  dates: { receivedAt: string; acknowledgedAt: string | null; responseSentAt: string | null };
}) {
  const me = usePlatformStaff();
  const qc = useQueryClient(), toast = useToast();
  const open = action !== null;
  const [shown, setShown] = React.useState<Action>(action ?? "acknowledge");   // the panel keeps its act while it closes
  const a = action ?? shown;
  const handlers = useQuery({ queryKey: ["pf", "complaints", "handlers"], enabled: open && a === "handler", queryFn: async () => Handlers.parse(await staffApi("/platform/complaints/handlers")).items });
  const blank = React.useCallback((): Form => ({ at: nowLocal(zone), note: "", outcome: "", handlerStaffId: "" }), [zone]);
  const [f, setF] = React.useState<Form>(blank);
  const [restored, setRestored] = React.useState(false);
  const start = React.useRef("");   // the default date, so a step left at it sends none
  const touched = React.useRef(false), sending = React.useRef(false), summary = React.useRef<HTMLDivElement>(null), notice = React.useRef<HTMLDivElement>(null);
  // Leaving the page while still signed in drops the draft; only an ended session keeps it for the next sign-in.
  React.useEffect(() => () => { if (staffToken()) kept = null; }, []);
  React.useEffect(() => {
    if (!action) return;
    setShown(action);
    const back = kept && kept.staffId === me.staffId && kept.complaintId === complaint && kept.action === action ? kept.form : null;
    if (!back) kept = null;   // another person's, complaint's or act's draft is never shown
    // A restored step keeps the default it was opened with, so an untouched date still sends none (break m4).
    const fresh = blank(); start.current = back && !kept?.carried && kept?.start ? kept.start : fresh.at;
    // A note carried over from an act refused as closed keeps its text but is not a restored session.
    setF(back ? { ...fresh, ...back, at: kept?.carried ? fresh.at : back.at } : fresh); setRestored(!!back && !kept?.carried); touched.current = !!back; save.reset();
    if (back && !kept?.carried) setTimeout(() => notice.current?.focus(), 0);   // review m2: the restored notice is announced
  }, [action]);   // eslint-disable-line react-hooks/exhaustive-deps -- a fresh form each time it opens
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    touched.current = true; const v = e.target.value;
    setF((x) => { const next = { ...x, [k]: v }; kept = { staffId: me.staffId, complaintId: complaint, action: a, form: next, start: start.current }; return next; });
  };
  const discard = () => { if (touched.current && !window.confirm(`Discard what you typed for "${ACTION[a].title}"?`)) return false; kept = null; return true; };
  const save = useMutation({
    mutationFn: async () => {
      const note = f.note.trim();
      // The default left as it is sends the minute it was cut to (slack for a browser clock ahead of the server's, review
      // R1), but never before the recorded date the act must follow: a complaint received seconds ago takes its own
      // default (break m1).
      const floor = [dates.receivedAt, ...(a === "response" || a === "close" ? [dates.acknowledgedAt] : []), ...(a === "close" ? [dates.responseSentAt] : [])]
        .filter((x): x is string => !!x).reduce((x, y) => (y > x ? y : x));
      const cut = f.at ? zonedToIso(f.at, zone) : "";
      const at = f.at === start.current && cut && cut < floor ? floor : cut;
      const body: Record<string, unknown> =
        a === "handler" ? { handlerStaffId: f.handlerStaffId || undefined, ...(note ? { note } : {}) }
        : a === "step" || a === "note" ? { kind: a === "note" ? "NOTE" : "STEP", note, ...(f.at && f.at !== start.current ? { at } : {}) }
        : a === "close" ? { outcome: f.outcome || undefined, at, note }
        : { at, ...(note ? { note } : {}) };
      return Complaint.parse(await staffApi(`/platform/complaints/${encodeURIComponent(complaint)}/${PATH[a]}`, { method: "POST", json: body }));
    },
    onSettled: () => { sending.current = false; },
    onError: (e) => {
      if (e instanceof StaffApiError && e.status === 404) { kept = null; qc.removeQueries({ queryKey: ["pf", "complaints", "one", complaint] }); onLost(); return; }
      // Review M1: a 409 or 403 means the page is out of date (acknowledged, answered, closed or handed over elsewhere):
      // the record behind the panel is read again, so its next step and acts are true when the panel closes.
      // Any refusal can come from a change made elsewhere ("this person already handles it" is a 422), so every one does (break M1).
      if (e instanceof StaffApiError) void qc.invalidateQueries({ queryKey: ["pf", "complaints"] });
      setTimeout(() => summary.current?.focus(), 0);
    },
    onSuccess: () => {
      kept = null;
      void qc.invalidateQueries({ queryKey: ["pf", "complaints"] });
      onClose();
      toast.push({ tone: "ok", text: ACTION[a].done });
    },
  });
  const err = save.error instanceof StaffApiError && save.error.status !== 404 ? save.error : null;
  const fields = err?.problem.fields ?? {};
  const fe = (k: string) => fields[k] ?? null;
  const refused = err && !Object.keys(fields).length
    ? err.status === 403 ? { title: FORBIDDEN, text: err.message }
    : err.status === 409 && err.problem.code === "COMPLAINT_CLOSED" ? { title: CLOSED_REFUSED, text: err.message }
    : { title: err.problem.title ?? "There is a problem", text: err.message }
    : null;
  const closedNow = err?.status === 409 && err.problem.code === "COMPLAINT_CLOSED";
  const choices = (handlers.data ?? []).filter((h) => h.id !== handlerId);
  const id = `pf-complaint-${a}`;
  return (
    <Panel open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={ACTION[a].title} description={ACTION[a].description} returnFocus={returnFocus} confirmClose={discard}
      footer={<><Button variant="ghost" onClick={() => { if (discard()) onClose(); }}>Cancel</Button><Button type="submit" form={id} busy={save.isPending}>{ACTION[a].submit}</Button></>}>
      <form id={id} noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (sending.current) return; sending.current = true; save.mutate(); }} data-action-drawer={a}>
        {restored ? <div ref={notice} tabIndex={-1} role="status" className="outline-none"><Notice tone="info" title="Your session ended">We kept what you typed. It was not saved yet: check it and save it.</Notice></div> : null}
        <div ref={summary} tabIndex={-1} className="outline-none" data-action-error>
          {refused ? <Notice tone="danger" title={refused.title} action={closedNow && a !== "note" && f.note.trim()
              ? <Button size="sm" variant="secondary" onClick={() => { kept = { staffId: me.staffId, complaintId: complaint, action: "note", form: f, carried: true }; touched.current = false; onAct("note"); }} data-carry-note>Add it as a note</Button> : undefined}>{refused.text}</Notice>
            : err ? <Notice tone="danger" title="There is a problem"><ul className="list-disc pl-4">{Object.entries(fields).map(([k, v]) => <li key={k}>{LABEL[k] ?? k}: {v}</li>)}</ul></Notice>
            : save.error && !(save.error instanceof StaffApiError) ? <Notice tone="danger" title="There is a problem">Could not save. Please try again.</Notice> : null}
        </div>
        {a === "handler" ? (
          <Field label="New handler" error={fe("handlerStaffId") ?? (handlers.isError ? "Could not load the staff list." : null)} hint="An active staff member of your firm who may record complaints.">
            <Select value={f.handlerStaffId} onChange={set("handlerStaffId")} required><option value="">Choose</option>{choices.map((h) => <option key={h.id} value={h.id}>{h.displayName}{h.id === me.staffId ? " (you)" : ""}</option>)}</Select>
          </Field>
        ) : null}
        {a === "close" ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium text-text">Outcome <span className="font-normal text-text-muted">Sample list</span></legend>
            {Object.entries(OUTCOME).map(([k, v]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="radio" name="pf-outcome" value={k} checked={f.outcome === k} onChange={set("outcome")} />{v}</label>)}
            {fe("outcome") ? <p role="alert" className="text-xs text-text-danger">{fe("outcome")}</p> : null}
          </fieldset>
        ) : null}
        {a !== "handler" ? <Field label={`When (${zoneName(zone)})`} error={fe("at")} hint={a === "step" || a === "note" ? "Leave it at now unless it happened earlier." : undefined}><Input type="datetime-local" value={f.at} onChange={set("at")} required /></Field> : null}
        <Field label={noteRequired(a) ? "Note" : "Note (optional)"} error={fe("note")}><Textarea value={f.note} onChange={set("note")} rows={4} maxLength={4000} required={noteRequired(a)} /></Field>
      </form>
    </Panel>
  );
}
