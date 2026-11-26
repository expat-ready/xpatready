// FO-4 part 2b (concept screens/fo-4-sales r2 §4 screen 4: "centre timeline … with Log a call and Add a note"; R1.76 j_76
// W8's prospect page; AG-2-37a, AG-2-94): the prospect page's Notes, calls and timeline. The timeline is FO-2 part 4's
// read (GET /front-office/prospects/:id/timeline: the prospect's lines, calls and notes, firm-scoped on the server),
// shown newest first in plain words: a call and a note read as written; any other line by its type from one map (fo-2p4
// review: the audit summary carries staff ids and is never shown). Add a note needs agent/prospect:edit; Log a call
// agent/prospect:log-call; each control follows its key, and the server decides.
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button, Field, Input, Notice, Panel, Pill, Select, Textarea } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { can, KEY, type Me } from "./contract";
import { staffApi, StaffApiError } from "./session";

const LOG_CALL = "agent/prospect:log-call", NOTE_MAX = 5000, FIRST = 10;
const Line = z.object({ at: z.string(), kind: z.enum(["AUDIT", "EVENT", "CALL", "NOTE"]), type: z.string(), actor: z.string().nullable(), actorName: z.string().nullable(), summary: z.string(), refId: z.string().nullable() });
const Lines = z.object({ lines: z.array(Line), more: z.boolean() });
type Line = z.infer<typeof Line>;
/** A line's words by its type (FO-2 part 4's names, ports/events/sales.ts); anything else "Prospect updated". */
const WORDS: Record<string, string> = {
  "lead.created": "Lead arrived", "lead.taken": "Lead taken", "lead.engaged": "Engaged as a prospect", "lead.closed": "Lead closed", "lead.reopened": "Lead reopened",
  "prospect.stage_moved": "Moved to another stage", "prospect.lost": "Marked lost", "prospect.won": "Won", "prospect.unconverted": "Convert undone", "prospect.type_changed": "Type changed",
};
const wordsOf = (l: Line) => WORDS[l.type] ?? (l.type.startsWith("person.") ? "Contact details changed" : "Prospect updated");
const KIND: Record<Line["kind"], string> = { NOTE: "Note", CALL: "Call", AUDIT: "Change", EVENT: "Change" };
/** AG-2-37a's seven outcomes in words. */
const OUTCOMES: [string, string][] = [["CONNECTED", "Connected"], ["NO_ANSWER", "No answer"], ["LEFT_VOICEMAIL", "Left a voicemail"], ["BUSY", "Busy"], ["WRONG_NUMBER", "Wrong number"], ["CALLBACK_REQUESTED", "Callback requested"], ["NOT_IN_SERVICE", "Not in service"]];
const when = (at: string) => new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const len = (s: string) => [...s.normalize("NFC").trim()].length;   // break m6: as the server counts
/** "2026-11-26T09:20" (a datetime-local value, the person's own time) as ISO 8601 with its offset, as the server asks. */
function withOffset(local: string) {
  const d = new Date(local), off = -d.getTimezoneOffset(), pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  return `${local.length === 16 ? `${local}:00` : local}${off >= 0 ? "+" : "-"}${pad(off / 60)}:${pad(off % 60)}`;
}
/** A server sentence in plain words (review m1, break m2): "when: a call cannot …" → "A call cannot …". */
const plain = (s: string) => { const t = s.replace(/^[a-z]+:\s*/i, "").replace(/^at most (\d+) characters\.?$/i, "Keep it to $1 characters.").replace(/^this is required\.?$/i, "Fill this in."); return t.charAt(0).toUpperCase() + t.slice(1); };
const errWords = (e: unknown) => !(e instanceof StaffApiError) ? "Could not reach the server. What you typed is kept; try again."
  : e.status === 403 ? "Your role does not allow this." : e.status === 404 ? "This prospect is not one you can see." : plain(Object.values(e.problem.fields ?? {})[0] ?? e.message);
/** Minutes as typed: digits with one optional decimal point or comma (break m3: never 1e3, 0x10). */
const minutesOf = (s: string) => (/^\d{1,4}([.,]\d{1,2})?$/.test(s.trim()) ? Number(s.trim().replace(",", ".")) : NaN);
/** Now as a datetime-local value, the latest a call may be (break m5). */
const nowLocal = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

export function ProspectActivity({ prospectId, name, me }: { prospectId: string; name: string; me: Me | undefined }) {
  const qc = useQueryClient();
  // Review M1: under ["fo", "prospects"], so the page's own Move, Mark lost, Convert and Set value (which refresh that
  // prefix) refresh the timeline too.
  const key = ["fo", "prospects", "timeline", prospectId];
  const tl = useQuery({ queryKey: key, retry: false, queryFn: async () => Lines.parse(await staffApi(`/front-office/prospects/${encodeURIComponent(prospectId)}/timeline`)) });
  const [all, setAll] = React.useState(false);
  const [text, setText] = React.useState(""), [noteError, setNoteError] = React.useState<string | null>(null);
  const [callOpen, setCallOpen] = React.useState(false);
  const [said, setSaid] = React.useState("");   // review m6: one polite line after a save
  const callButton = React.useRef<HTMLButtonElement>(null), noteBox = React.useRef<HTMLTextAreaElement>(null), firstHidden = React.useRef<HTMLLIElement>(null);
  const [long, setLong] = React.useState<Set<string>>(new Set());
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ["fo", "prospects", "one", prospectId] })]);
  const note = useMutation({
    mutationFn: async (sent: string) => staffApi(`/front-office/prospects/${prospectId}/notes`, { method: "POST", json: { text: sent } }),
    // Break m7: only the words that were sent are cleared; anything typed since stays. Review m5: focus back in the box.
    onSuccess: async (_r, sent) => { setText((now) => (now === sent ? "" : now)); setSaid("Note added."); await refresh(); requestAnimationFrame(() => noteBox.current?.focus()); },
    onError: (e) => setNoteError(errWords(e)),
  });
  const addNote = () => { if (note.isPending) return; if (!len(text)) { setNoteError("Write the note first."); return; } if (len(text) > NOTE_MAX) return; setNoteError(null); setSaid(""); note.mutate(text); };
  const lines = [...(tl.data?.lines ?? [])].reverse();   // the read is oldest first; the page reads newest first
  const shown = all ? lines : lines.slice(0, FIRST);
  const tooLong = len(text) > NOTE_MAX;
  return (
    <section aria-labelledby="fo-activity" className="rounded-xl border border-border bg-surface-raised p-4" data-prospect-activity>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="fo-activity" className="text-sm font-semibold">Notes, calls and timeline</h2>
        <span className="flex-1" />
        {can(me, LOG_CALL) ? <Button ref={callButton} size="sm" variant="secondary" className="min-h-11 sm:min-h-8" onClick={() => { setSaid(""); setCallOpen(true); }} data-log-call>Log a call</Button> : null}
      </div>
      {can(me, KEY.edit) ? (
        <div className="mt-3 space-y-2" data-prospect-note>
          <label htmlFor="fo-new-note" className="text-xs font-medium">Add a note</label>
          <Textarea ref={noteBox} id="fo-new-note" dir="auto" rows={2} value={text} aria-invalid={noteError || tooLong ? true : undefined} aria-describedby="fo-new-note-hint" onChange={(e) => { setText(e.target.value); setNoteError(null); }} data-prospect-note-text />
          <p role="status" className="sr-only" data-prospect-said>{said}</p>
          <p id="fo-new-note-hint" role={noteError || tooLong ? "alert" : undefined} className={noteError || tooLong ? "text-xs text-text-danger" : "text-xs text-text-muted"}>
            {tooLong ? `Keep the note to 5,000 characters (${len(text).toLocaleString("en-GB")} now).` : noteError ?? `Notes are for your team. ${name} never sees them.`}</p>
          <div className="flex justify-end"><Button size="sm" className="min-h-11 max-sm:w-full sm:min-h-8" busy={note.isPending} disabled={tooLong} onClick={addNote} data-prospect-note-add>{note.isPending ? "Adding…" : "Add note"}</Button></div>
        </div>
      ) : null}
      <div className="mt-3" data-prospect-timeline>
        {tl.isLoading ? <Skeleton className="h-40 w-full" /> : tl.isError ? <Notice tone="danger" title="The timeline could not be loaded">{errWords(tl.error)}</Notice>
          : !lines.length ? <p className="text-sm text-text-muted" data-prospect-timeline-empty>Nothing has happened on this prospect yet.</p>
            : <ol className="space-y-2">{shown.map((l, i) => { const id = `${l.kind}:${l.refId ?? i}`, cut = (l.kind === "NOTE" || l.kind === "CALL") && (l.summary.split("\n").length > 3 || l.summary.length > 240); return (
                <li key={id} ref={i === FIRST ? firstHidden : undefined} tabIndex={i === FIRST ? -1 : undefined} className="flex gap-2 text-sm outline-none" data-prospect-line={l.kind} data-prospect-type={l.type}>
                  <Pill className="mt-0.5 w-16 self-start justify-center">{KIND[l.kind]}</Pill>
                  <div className="min-w-0 flex-1">
                    {l.kind === "NOTE" || l.kind === "CALL" ? <><p className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${cut && !long.has(id) ? "line-clamp-3" : ""}`} data-prospect-words><bdi>{l.summary}</bdi></p>
                      {cut ? <button type="button" className="text-xs font-medium text-text-link underline" aria-expanded={long.has(id)} onClick={() => setLong((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} data-prospect-show-more>{long.has(id) ? "Show less" : "Show all of it"}</button> : null}</> : <p>{wordsOf(l)}</p>}
                    <p className="text-xs text-text-muted">{l.actorName ?? (l.actor ? "Someone at the firm" : "The system")} · <time dateTime={l.at} title={new Date(l.at).toString()}>{when(l.at)}</time></p>
                  </div>
                </li>); })}</ol>}
        {lines.length > shown.length ? <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setAll(true); requestAnimationFrame(() => firstHidden.current?.focus()); }} data-prospect-timeline-more>Show all {lines.length} lines</Button>
          : lines.length ? <p className="mt-2 text-xs text-text-muted">{tl.data?.more ? "Older lines are not shown (the newest 500 are)." : "That is everything on this prospect."}</p> : null}
      </div>
      {callOpen ? <LogCall prospectId={prospectId} name={name} close={() => setCallOpen(false)} done={async () => { await refresh(); setSaid("Call logged."); }} back={() => callButton.current} /> : null}
    </section>
  );
}

function LogCall({ prospectId, name, close, done, back }: { prospectId: string; name: string; close: () => void; done: () => Promise<unknown>; back: () => HTMLElement | null }) {
  const [direction, setDirection] = React.useState("OUT"), [outcome, setOutcome] = React.useState(""), [at, setAt] = React.useState(""), [minutes, setMinutes] = React.useState(""), [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<{ field: string; text: string } | null>(null);
  const log = useMutation({
    mutationFn: async () => staffApi(`/front-office/prospects/${prospectId}/calls`, { method: "POST", json: { direction, outcome, ...(at ? { when: withOffset(at) } : {}), ...(minutes ? { seconds: Math.round(minutesOf(minutes) * 60) } : {}), ...(notes.trim() ? { notes } : {}) } }),
    onSuccess: async () => { await done(); close(); },
    onError: (e) => setError({ field: e instanceof StaffApiError ? Object.keys(e.problem.fields ?? {})[0] ?? "" : "", text: errWords(e) }),
  });
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (log.isPending) return;
    if (!outcome) { setError({ field: "outcome", text: "Choose how the call went." }); return; }
    const m = minutesOf(minutes);
    if (minutes && !(m >= 0 && m <= 1440)) { setError({ field: "seconds", text: "Minutes from 0 to 1440, e.g. 4 or 4.5." }); return; }
    setError(null); log.mutate();
  };
  const on = (f: string) => (error?.field === f ? error.text : null);
  return (
    // Break M1 / review M3: focus goes back to "Log a call"; break M2: Escape or a click outside never throws away what was
    // typed without asking, and never closes the panel while the call is being saved (break m7).
    <Panel open onOpenChange={(o) => { if (!o) close(); }} returnFocus={back}
      confirmClose={() => !log.isPending && (log.isSuccess || (!outcome && !at && !minutes && !notes.trim()) || window.confirm("Discard this call? What you typed is not saved."))} title="Log a call" description={`${name}. The call is kept on this prospect's timeline.`}
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button busy={log.isPending} onClick={() => submit()} data-log-call-save>Log the call</Button></>}>
      <form onSubmit={submit} className="flex flex-col gap-4" data-log-call-form>
        {error && !["outcome", "when", "seconds", "direction", "notes"].includes(error.field) ? <Notice tone="danger" title="The call was not logged">{error.text}</Notice> : null}
        <Field label="Direction" error={on("direction")}><Select value={direction} onChange={(e) => setDirection(e.target.value)}><option value="OUT">Outgoing (we called)</option><option value="IN">Incoming (they called)</option></Select></Field>
        <Field label="How it went" error={on("outcome")}><Select value={outcome} onChange={(e) => setOutcome(e.target.value)} data-log-call-outcome><option value="">Choose…</option>{OUTCOMES.map(([v, w]) => <option key={v} value={v}>{w}</option>)}</Select></Field>
        <Field label="When (optional)" hint="Leave it empty if the call was just now." error={on("when")}><Input type="datetime-local" max={nowLocal()} value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="Minutes (optional)" error={on("seconds")}><Input inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
        <Field label="Notes (optional)" error={on("notes")}><Textarea dir="auto" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </form>
    </Panel>
  );
}
