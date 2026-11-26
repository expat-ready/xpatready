// CS-NT1 part 4 (runtime lane; concept product/screens/CS-NT1d/concept.md r2, approved by the tech lead on #3694, P-223 (4);
// R1.76, j_76 W8): the case page's "Notes and timeline" panel, directly under the case header. Staff write a short note
// (internal unless marked for the client, with the key), mention colleagues picked from a list, pin, edit with every
// version readable, and read the case's timeline newest first with kind chips and Show older. Every rule stays in the API
// (api/src/case-notes): who may edit comes from the note's `canEditText` and the person's keys (/platform/me); a refusal
// shows in words where the person acted. The routes take the firm staff sign-in (PF-4's bearer session), so the panel
// calls through `staffApi` and shows the staff sign-in inline when there is none (as CS-C1s).
import * as React from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Notice, Pill, Textarea } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { staffApi, StaffApiError, useMe, useStaffToken } from "@/modules/platform/session";
import { SignInCard } from "@/modules/platform/frame";
import { CaseNote, CaseNoteHistory, CaseNotePeople, CaseNotesView, CaseTimelinePage } from "../../../contracts/runtime";

const EDIT = "agent/case:edit", SHARE = "agent/note:share-with-client", MAX = 5000, COUNT_FROM = 4500, FIRST_NOTES = 3, FIRST_LINES = 10, MAX_MENTIONS = 20;
const KINDS = [["", "All"], ["NOTE", "Notes"], ["DOCUMENT", "Documents"], ["DECISION", "Decisions"], ["ACTIVITY", "Other"]] as const;
/** Concept §5 (BR-9): a timeline line's words come from its type, never the audit summary (that sits behind Details). */
const LINE_WORDS: Record<string, string> = {
  uploaded: "Document uploaded", "case.decision.recorded": "Decision recorded", "case.withdrawn": "Case withdrawn", "case.closed": "Case closed", "case.reopened": "Case reopened",
  "case.note.edited": "Note edited", "case.note.pinned": "Note pinned", "case.note.unpinned": "Note unpinned", "case.note.marked-client-visible": "Note shown to the client", "case.note.marked-internal": "Note made internal",
};
const KIND_WORD: Record<string, string> = { NOTE: "Notes", DOCUMENT: "Documents", DECISION: "Decisions", ACTIVITY: "Other" };
const lineWords = (l: { type: string; kind: string }) => LINE_WORDS[l.type] ?? `${KIND_WORD[l.kind] ?? "Other"} change`;
const when = (at: string) => new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const who = (n: string | null) => n ?? "Someone at the firm";
const len = (s: string) => [...s.trim()].length;
const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9._:-]/g, "");
/** A refusal in the screen's words (break m1, m2): the 403 names the act; a 404 covers another firm and a case outside the
 *  person's scope alike (the API answers both the same way, BR-20). */
const errWords = (e: unknown, what: string, act: "add" | "change" | "read" = "add") => !(e instanceof StaffApiError) ? "Could not reach the server. Your words are kept; try again."
  : e.status === 403 ? (act === "add" ? "Your role can read notes but not add them." : act === "change" ? "Your role does not allow this change now." : "Your role cannot read this.")
    : e.status === 404 ? "This case is not in the firm you are signed in to, or your role cannot open it."
      : e.field("text") ?? e.field("mentions") ?? e.message ?? `The ${what} was not saved.`;
type Draft = { text: string; picked: { staffId: string; name: string }[]; forClient: boolean };
/** Review M2 (concept §4): the panel keeps one height while it loads and after, so nothing below it moves: the writer
 *  keeps its room, and the notes and the timeline lines scroll inside boxes of fixed height. */
const WRITER_H = "min-h-[17rem]", NOTES_H = "h-[20rem]", LINES_H = "h-[26rem]", CHIPS_H = "h-9";
const BOX = "overflow-y-auto rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function useCaseNotes(caseId: string) {
  const token = useStaffToken();
  return useQuery({ queryKey: ["pf", "case-notes", caseId, token], enabled: !!token, retry: false, queryFn: async () => CaseNotesView.parse(await staffApi(`/runtime/cases/${caseId}/notes`)) });
}

/** The panel. A fixed-height skeleton while it loads, so nothing below moves. */
export function CaseNotesPanel({ caseId }: { caseId: string }) {
  const token = useStaffToken();
  const me = useMe();
  const notes = useCaseNotes(caseId);
  const draft = React.useRef<Draft>({ text: "", picked: [], forClient: false });   // kept across a lost sign-in (DP9, break m3)
  const keys = me.data?.keys ?? [];
  return (
    <section id="notes" aria-labelledby="case-notes-h" className="scroll-mt-4 rounded-xl border border-border bg-surface-raised" data-case-notes>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <h2 id="case-notes-h" className="text-base font-semibold">Notes and timeline</h2>
        <p className="min-w-0 basis-full text-[13px] text-text-muted sm:basis-0 sm:flex-1">Notes for your team, and everything that happened on this case, newest first.</p>
        {me.data ? <span className="text-[13px] text-text-muted" data-notes-signed-in>Signed in as <span className="font-medium text-text">{me.data.displayName}</span> (firm staff)</span> : null}
      </header>
      {!token ? (
        <div className="space-y-3 px-4 py-3" data-notes-no-session>
          <p className="text-sm text-text-muted">Sign in as firm staff to read and add notes.{draft.current.text.trim() ? " Your note is kept." : ""}</p>
          <SignInCard embedded />
        </div>
      ) : notes.isLoading || me.isLoading ? <div className="divide-y divide-border" data-notes-loading>
            <div className="space-y-3 px-4 py-3"><h3 className="text-sm font-semibold">Notes</h3><Skeleton className={`${WRITER_H} w-full`} /><Skeleton className={`${NOTES_H} w-full`} /></div>
            <div className="space-y-3 px-4 py-3"><h3 className="text-sm font-semibold">Timeline</h3><Skeleton className={`${CHIPS_H} w-full`} /><Skeleton className={`${LINES_H} w-full`} /></div>
          </div>
        : notes.isError ? <div className="p-4"><Notice tone="danger" title={(notes.error as StaffApiError)?.status === 404 ? "Not in your firm" : "The notes could not be loaded"}>{errWords(notes.error, "notes", "read")}</Notice></div>
          : <div className="divide-y divide-border">
              <div className="space-y-3 px-4 py-3">
                <h3 className="text-sm font-semibold">Notes</h3>
                <div className={WRITER_H}>{keys.includes(EDIT) ? <Writer caseId={caseId} share={keys.includes(SHARE)} draft={draft} /> : <p className="text-[13px] text-text-muted" data-notes-read-only>Your role can read notes but not add them.</p>}</div>
                <div role="region" aria-label="Notes" tabIndex={0} className={`${NOTES_H} ${BOX}`}><NoteList caseId={caseId} notes={notes.data!.notes} mayEdit={keys.includes(EDIT)} share={keys.includes(SHARE)} /></div>
              </div>
              <Timeline caseId={caseId} />
            </div>}
    </section>
  );
}

function Writer({ caseId, share, draft }: { caseId: string; share: boolean; draft: React.MutableRefObject<Draft> }) {
  const qc = useQueryClient();
  const token = useStaffToken();
  const [text, setText] = React.useState(draft.current.text);
  const [forClient, setForClient] = React.useState(draft.current.forClient);
  const [picked, setPicked] = React.useState(draft.current.picked);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [told, setTold] = React.useState<string | null>(null);
  const key = React.useRef(newKey());   // BR-10: one key per draft, so a double Add stores one note and tells once
  const n = len(text), tooLong = n > MAX;
  const set = (v: string) => { setText(v); setError(null); };
  // Review m9, break m3: what is kept across a lost sign-in, and a fresh key whenever the draft changes in any way.
  React.useEffect(() => { draft.current = { text, picked, forClient }; key.current = newKey(); }, [text, picked, forClient, draft]);
  const add = async () => {
    if (busy) return;
    if (!n) { setError("Write the note first."); return; }   // challenge m4: the reason in words, not a hover title
    if (tooLong) return;
    setBusy(true); setError(null); setTold(null);
    try {
      await staffApi(`/runtime/cases/${caseId}/notes`, { method: "POST", json: { text, ...(forClient ? { visibility: "CLIENT_VISIBLE" } : {}), ...(picked.length ? { mentions: picked.map((p) => p.staffId) } : {}), idempotencyKey: key.current } });
      if (picked.length) setTold(`Told: ${picked.map((p) => p.name).join(", ")}`);
      set(""); setPicked([]); setForClient(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["pf", "case-notes", caseId] }), qc.invalidateQueries({ queryKey: ["pf", "case-timeline", caseId] })]);
    } catch (e) { setError(errWords(e, "note")); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2" data-notes-writer>
      <label htmlFor="new-note" className="text-xs font-medium">New note</label>
      <Textarea id="new-note" dir="auto" rows={3} value={text} aria-invalid={error || tooLong ? true : undefined} aria-describedby="new-note-note"
        className="max-h-56 min-h-20" onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void add(); } }} data-note-text />
      <p id="new-note-note" role={error || tooLong ? "alert" : undefined} className={error || tooLong ? "text-xs text-text-danger" : "text-xs text-text-muted"} data-note-error={error || tooLong ? "" : undefined}>
        {tooLong ? `Keep the note to 5,000 characters (${n.toLocaleString("en-GB")} now).` : error ?? "Typing \"@Name\" tells no one: use Mention to pick people."}</p>
      <Mention caseId={caseId} token={token} picked={picked} setPicked={setPicked} />
      <div className="flex flex-wrap items-center gap-3">
        {share ? <label className="flex items-center gap-2 text-sm" title="The client sees this note on their page. Leave it off for notes meant only for your team."><input type="checkbox" checked={forClient} onChange={(e) => setForClient(e.target.checked)} data-note-for-client /> For the client</label> : null}
        {n >= COUNT_FROM ? <span className="text-xs text-text-muted" data-note-count>{n.toLocaleString("en-GB")} / 5,000</span> : null}
        <span className="flex-1" />
        <Button className="min-h-11 max-[520px]:w-full sm:min-h-9" onClick={() => void add()} disabled={tooLong} busy={busy} data-note-add>{busy ? "Adding…" : "Add note"}</Button>
      </div>
      {told ? <p role="status" className="text-xs text-text-muted" data-note-told>{told}</p> : null}
    </div>
  );
}

function Mention({ caseId, token, picked, setPicked }: { caseId: string; token: string | null; picked: { staffId: string; name: string }[]; setPicked: (p: { staffId: string; name: string }[]) => void }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const me = useMe();
  const opener = React.useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); setQ(""); requestAnimationFrame(() => opener.current?.focus()); };   // break m4
  const full = picked.length >= MAX_MENTIONS;   // challenge m1: the API takes at most 20
  const people = useQuery({ queryKey: ["pf", "case-note-people", caseId, token], enabled: !!token && open, retry: false, queryFn: async () => CaseNotePeople.parse(await staffApi(`/runtime/cases/${caseId}/notes/people`)) });
  const list = (people.data?.people ?? []).filter((p) => p.staffId !== me.data?.staffId && !picked.some((x) => x.staffId === p.staffId) && p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-2" data-note-mention>
      <div className="flex flex-wrap items-center gap-2">
        <Button ref={opener} size="sm" variant="secondary" disabled={full && !open} aria-expanded={open} aria-controls="note-mention-list" title="The people you pick are told in their notifications." onClick={() => setOpen(!open)} data-note-mention-open>Mention</Button>
        {picked.map((p) => <span key={p.staffId} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-xs" data-note-mentioned={p.staffId}>{p.name}
          <button type="button" className="rounded px-1 text-text-muted hover:text-text focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={`Remove ${p.name}`} onClick={() => setPicked(picked.filter((x) => x.staffId !== p.staffId))}>×</button></span>)}
      </div>
      {full ? <p className="text-xs text-text-muted" data-note-mention-full>At most 20 people.</p> : null}
      {open ? (
        <div id="note-mention-list" className="max-w-sm space-y-1 rounded-lg border border-border p-2" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
          <Input autoFocus aria-label="Find a colleague" placeholder="Find a colleague" value={q} onChange={(e) => setQ(e.target.value)} data-note-mention-find />
          {people.isLoading ? <Skeleton className="h-8 w-full" /> : people.isError ? <p className="text-xs text-text-danger">{errWords(people.error, "list")}</p>
            : !list.length ? <p className="px-1 text-xs text-text-muted">No one else to mention.</p>
              : <ul className="max-h-48 overflow-y-auto">{list.map((p) => <li key={p.staffId}><button type="button" className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-text/5 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onClick={() => { setPicked([...picked, { staffId: p.staffId, name: p.name }]); close(); }} data-note-person={p.staffId}>{p.name}{p.onCase ? <span className="text-xs text-text-muted">On this case</span> : null}</button></li>)}</ul>}
        </div>) : null}
    </div>
  );
}

function NoteList({ caseId, notes, mayEdit, share }: { caseId: string; notes: CaseNote[]; mayEdit: boolean; share: boolean }) {
  const [all, setAll] = React.useState(false);
  if (!notes.length) return <p className="text-sm text-text-muted" data-notes-empty>No notes yet. Notes are for your team unless you mark one for the client.</p>;
  const pinned = notes.filter((x) => x.pinned), rest = notes.filter((x) => !x.pinned);
  const shown = all ? notes : [...pinned, ...rest.slice(0, FIRST_NOTES)];
  return (
    <div className="space-y-2">
      <ul className="space-y-2" data-notes-list>{shown.map((x) => <NoteCard key={x.id} caseId={caseId} note={x} mayEdit={mayEdit} share={share} />)}</ul>
      {shown.length < notes.length ? <Button size="sm" variant="ghost" onClick={() => setAll(true)} data-notes-show-all>Show all {notes.length} notes</Button> : null}
    </div>
  );
}

function NoteCard({ caseId, note, mayEdit, share }: { caseId: string; note: CaseNote; mayEdit: boolean; share: boolean }) {
  const qc = useQueryClient();
  const token = useStaffToken();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [base, setBase] = React.useState(note.version);
  const [history, setHistory] = React.useState(false);
  const [long, setLong] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<CaseNote | null>(null);
  const hist = useQuery({ queryKey: ["pf", "case-note-history", caseId, note.id, note.version, token], enabled: !!token && history, retry: false,
    queryFn: async () => CaseNoteHistory.parse(await staffApi(`/runtime/cases/${caseId}/notes/${note.id}/versions`)) });
  const put = async (what: "text" | "pin" | "visibility", json: Record<string, unknown>, version = note.version) => {
    setBusy(true); setError(null);
    try {
      await staffApi(`/runtime/cases/${caseId}/notes/${note.id}/${what}`, { method: "PUT", json: { ...json, version } });
      if (what === "text") { setEditing(null); setConflict(null); }
      await Promise.all([qc.invalidateQueries({ queryKey: ["pf", "case-notes", caseId] }), qc.invalidateQueries({ queryKey: ["pf", "case-timeline", caseId] })]);
    } catch (e) {
      // BR-5: a stale version → the note as it is now (read again: the shared problem parser keeps no `current`).
      const cur = e instanceof StaffApiError && e.status === 409 && e.problem.code === "NOTE_CHANGED"
        ? await staffApi(`/runtime/cases/${caseId}/notes`).then((v) => CaseNotesView.parse(v).notes.find((x) => x.id === note.id) ?? null, () => null) : null;
      if (cur && what === "text") setConflict(cur);
      else setError(e instanceof StaffApiError && e.status === 409 ? "Someone changed this note since you opened it. Nothing was saved; look again and retry." : errWords(e, "change", "change"));
      if (cur) void qc.invalidateQueries({ queryKey: ["pf", "case-notes", caseId] });
    } finally { setBusy(false); }
  };
  const lines = note.text.split("\n").length > 6 || note.text.length > 600;
  return (
    <li className="rounded-lg border border-border p-3" data-note={note.id} data-note-pinned={note.pinned || undefined}>
      {editing !== null ? (
        <div className="space-y-2">
          <Textarea aria-label="Edit the note" dir="auto" rows={4} value={editing} onChange={(e) => setEditing(e.target.value)} data-note-edit-text />
          {conflict ? <Notice tone="warn" title="This note changed"><span data-note-conflict>Someone changed this note since you opened it. Your words are kept below.</span><span className="mt-1 block whitespace-pre-wrap text-text">{conflict.text}</span>
            <Button size="sm" variant="secondary" className="mt-2" onClick={() => { setEditing(conflict.text); setBase(conflict.version); setConflict(null); }} data-note-use-current>Use the current note</Button></Notice> : null}
          {error ? <p role="alert" className="text-xs text-text-danger">{error}</p> : null}
          {/* Break m7: after a conflict, a plain Save never writes over the other person's words; replacing them is its own, named act. */}
          <div className="flex flex-wrap gap-2">{conflict
            ? <Button size="sm" variant="destructive" busy={busy} disabled={!len(editing) || len(editing) > MAX} onClick={() => void put("text", { text: editing }, conflict.version)} data-note-overwrite>Replace their words with mine</Button>
            : <Button size="sm" busy={busy} disabled={!len(editing) || len(editing) > MAX} onClick={() => void put("text", { text: editing }, base)} data-note-save>Save</Button>}
            <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setConflict(null); setError(null); }}>Cancel</Button></div>
        </div>
      ) : (
        <>
          <p className={`whitespace-pre-wrap text-sm [overflow-wrap:anywhere] ${lines && !long ? "line-clamp-6" : ""}`} data-note-words><bdi>{note.text}</bdi></p>
          {lines ? <button type="button" className="text-xs font-medium text-text-link underline" onClick={() => setLong(!long)}>{long ? "Show less" : "Show all"}</button> : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span data-note-by>{who(note.author.name)} · <time dateTime={note.writtenAt} title={new Date(note.writtenAt).toString()}>{when(note.writtenAt)}</time></span>
            {note.pinned ? <Pill tone="info" title="Pinned notes stay at the top for everyone.">Pinned</Pill> : null}
            {note.visibility === "CLIENT_VISIBLE" ? <Pill tone="warn" title="The client sees this note on their page.">Client can see this</Pill> : null}
            {note.edited ? <span className="inline-flex" data-note-edited><Pill title="The words changed since the note was written. History shows every version.">Edited</Pill></span> : null}
            <span className="flex-1" />
            {mayEdit ? <Button size="sm" variant="ghost" busy={busy} onClick={() => void put("pin", { pinned: !note.pinned })} data-note-pin>{note.pinned ? "Unpin" : "Pin"}</Button> : null}
            {mayEdit && note.canEditText && (share || note.visibility !== "CLIENT_VISIBLE") ? <Button size="sm" variant="ghost" onClick={() => { setEditing(note.text); setBase(note.version); }} data-note-edit>Edit</Button> : null}
            {share ? <Button size="sm" variant="ghost" busy={busy} onClick={() => void put("visibility", { visibility: note.visibility === "CLIENT_VISIBLE" ? "INTERNAL" : "CLIENT_VISIBLE" })} data-note-visibility>{note.visibility === "CLIENT_VISIBLE" ? "Make internal" : "Show to the client"}</Button> : null}
            <Button size="sm" variant="ghost" aria-expanded={history} onClick={() => setHistory(!history)} data-note-history>History</Button>
          </div>
          {error ? <p role="alert" className="mt-1 text-xs text-text-danger">{error}</p> : null}
          {history ? <div className="mt-2 border-l-2 border-border pl-3" data-note-versions>
            {hist.isLoading ? <Skeleton className="h-10 w-full" /> : hist.isError ? <p className="text-xs text-text-danger">{errWords(hist.error, "history")}</p>
              : <ol className="space-y-1.5">{hist.data!.versions.map((v, i, a) => { const prev = a[i + 1];
                  const what = !prev ? "Written" : [v.text !== prev.text && "Words changed", v.pinned !== prev.pinned && (v.pinned ? "Pinned" : "Unpinned"), v.visibility !== prev.visibility && (v.visibility === "CLIENT_VISIBLE" ? "Shown to the client" : "Made internal")].filter(Boolean).join(", ");
                  return <li key={v.versionId} className="text-xs" data-note-version={v.version}><span className="font-medium">{what}</span> · {who(v.by.name)} · {when(v.at)}{!prev || v.text !== prev.text ? <span className="mt-0.5 block whitespace-pre-wrap text-text-muted"><bdi>{v.text}</bdi></span> : null}</li>; })}</ol>}
          </div> : null}
        </>
      )}
    </li>
  );
}

function Timeline({ caseId }: { caseId: string }) {
  const token = useStaffToken();
  const [kind, setKind] = React.useState("");
  const [limit, setLimit] = React.useState(FIRST_LINES);
  const q = useInfiniteQuery({
    queryKey: ["pf", "case-timeline", caseId, kind, token], enabled: !!token, retry: false, initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => CaseTimelinePage.parse(await staffApi(`/runtime/cases/${caseId}/timeline?${new URLSearchParams({ ...(pageParam ? { cursor: pageParam } : {}), ...(kind ? { kinds: kind } : {}) })}`)),
    getNextPageParam: (p) => (p.more ? p.nextCursor : null),
  });
  const lines = (q.data?.pages ?? []).flatMap((p) => p.lines);   // access lines are left out by the API (ruling 2)
  const shown = lines.slice(0, limit);
  const older = async () => { if (lines.length <= limit && q.hasNextPage) await q.fetchNextPage(); setLimit(limit + 50); };
  return (
    <div className="space-y-3 px-4 py-3" data-case-timeline>
      <h3 className="text-sm font-semibold">Timeline</h3>
      <div role="group" aria-label="Show on the timeline" className={`flex ${CHIPS_H} items-start gap-2 overflow-x-auto pb-1`}>
        {KINDS.map(([k, label]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setLimit(FIRST_LINES); }}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 ${kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface-raised"}`} data-timeline-kind={k || "ALL"}>{label}</button>)}
      </div>
      <div role="region" aria-label="Timeline lines" tabIndex={0} className={`${LINES_H} space-y-3 ${BOX}`}>
      {q.isLoading ? <Skeleton className={`${LINES_H} w-full`} /> : q.isError ? <Notice tone="danger" title="The timeline could not be loaded">{errWords(q.error, "timeline")}</Notice>
        : !shown.length ? <p className="text-sm text-text-muted" data-timeline-empty>Nothing has happened on this case yet.</p>
          : <ol className="space-y-2" data-timeline-lines>{shown.map((l) => (
              <li key={`${l.source}:${l.refId}`} className="flex gap-2 text-sm" data-timeline-line={l.kind} data-timeline-type={l.type}>
                <Pill className="mt-0.5 w-20 self-start justify-center">{KIND_WORD[l.kind]}</Pill>
                <div className="min-w-0 flex-1">
                  {l.source === "note" ? <p className="line-clamp-2 whitespace-pre-wrap [overflow-wrap:anywhere]" data-timeline-note><bdi>{l.summary}</bdi></p> : <p>{lineWords(l)}</p>}
                  <p className="text-xs text-text-muted">{who(l.actorName)} · <time dateTime={l.at} title={new Date(l.at).toString()}>{when(l.at)}</time></p>
                  {l.source === "audit" ? <details className="text-xs text-text-muted"><summary className="cursor-pointer">Details</summary><span className="[overflow-wrap:anywhere]">{l.summary}</span></details> : null}
                </div>
              </li>))}</ol>}
      {shown.length && (lines.length > limit || q.hasNextPage) ? <Button size="sm" variant="secondary" busy={q.isFetchingNextPage} onClick={() => void older()} data-timeline-older>Show older</Button>
        : shown.length ? <p className="text-xs text-text-muted" data-timeline-end>That is everything on this case.</p> : null}
      </div>
    </div>
  );
}
