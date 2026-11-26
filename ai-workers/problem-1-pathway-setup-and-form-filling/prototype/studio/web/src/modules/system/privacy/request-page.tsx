// PF-21rs B1 (R1.85; concept r2 §4 "Data requests to us", board §5; SA-11-27, BR-5, BR-7; row W1, W2): one request made to
// ExpatReady, /system/privacy/requests/:id. Its facts, its steps in order (each by our staff member's name, or the daily
// check), and its next moves: only those the API accepts from its status (Overdue is never chosen: the daily check sets
// it). Completing asks what was done; a note is optional (@SystemChange, BR-7). The API's refusals show in its words.
import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Field, Notice, Textarea } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { SystemFrame, useSystemStaff } from "../frame";
import { systemApi, SystemApiError, useSystemToken } from "../session";
import { actorWords, firmWords, momentUtc, shortId } from "./contract";
import { dayWords, DSR_KEY, dueWords, MOVE_WORDS, MOVES, REQUEST_COPY as C, REQUEST_STATUS_WORDS, requestFieldErrors, RequestOne, stepWords, torontoToday, TYPE_WORDS } from "./requests";

type Move = "IN_PROGRESS" | "COMPLETED" | "HELD";
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid gap-1 py-1.5 sm:grid-cols-[12rem_1fr]"><dt className="text-xs font-medium text-text-muted">{label}</dt><dd className="text-sm [overflow-wrap:anywhere] whitespace-pre-line">{children}</dd></div>
);

function MoveDialog({ id, move, onOpenChange, onMoved, returnFocus }: { id: string; move: Move | null; onOpenChange: (o: boolean) => void; onMoved: (m: Move) => void; returnFocus: () => HTMLElement | null }) {
  const [actions, setActions] = React.useState(""), [note, setNote] = React.useState(""), [errors, setErrors] = React.useState<Record<string, string>>({}), [busy, setBusy] = React.useState(false);
  const form = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => { if (move) { setActions(""); setNote(""); setErrors({}); } }, [move]);
  React.useEffect(() => { if (Object.keys(errors).length) form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(); }, [errors]);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy || !move) return; setBusy(true); setErrors({});
    const body: Record<string, unknown> = { status: move };
    if (move === "COMPLETED") body.actionsTaken = actions;   // sent as typed: an empty one is the API's field error
    if (note.trim()) body.note = note;
    try { await systemApi(`/register/requests/${encodeURIComponent(id)}/status`, { method: "POST", json: body }); onMoved(move); }
    catch (x) { setErrors(x instanceof SystemApiError && x.problem.fields ? requestFieldErrors(x.problem.fields) : { other: x instanceof SystemApiError ? x.message : "Could not save. Please try again." }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={!!move} onOpenChange={onOpenChange} title={move ? `${MOVE_WORDS[move]}?` : ""} description={move === "COMPLETED" ? C.actionsHint : C.noteHint} returnFocus={returnFocus}
      footer={<><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="move-request" busy={busy} data-move-send>{move ? MOVE_WORDS[move] : ""}</Button></>}>
      <form id="move-request" ref={form} onSubmit={go} noValidate className="flex flex-col gap-4">
        {move === "COMPLETED" ? <Field label="What was done" error={errors.actionsTaken}><Textarea rows={3} value={actions} onChange={(e) => { setActions(e.target.value); setErrors(({ actionsTaken: _g, ...r }) => r); }} aria-invalid={errors.actionsTaken ? true : undefined} data-field="actionsTaken" /></Field> : null}
        <Field label="Note" hint={C.noteHint} error={errors.note}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} aria-invalid={errors.note ? true : undefined} data-field="note" /></Field>
        {errors.other ? <Notice tone="danger"><span data-move-error>{errors.other}</span></Notice> : null}
      </form>
    </Dialog>
  );
}

function RequestBody() {
  const { id = "" } = useParams(), [params, setParams] = useSearchParams(), token = useSystemToken(), me = useSystemStaff(), qc = useQueryClient();
  const one = useQuery({ queryKey: ["sys", "request", id, token], enabled: !!token, retry: false, queryFn: async () => RequestOne.parse(await systemApi(`/register/requests/${encodeURIComponent(id)}`)) });
  const [move, setMove] = React.useState<Move | null>(null), [done, setDone] = React.useState<string | null>(params.get("logged") ? C.logged : null);
  const heading = React.useRef<HTMLHeadingElement>(null), actionsRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { if (params.get("logged")) setParams({}, { replace: true }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival
  React.useEffect(() => { if (one.data && done) heading.current?.focus(); }, [!!one.data]);   // eslint-disable-line react-hooks/exhaustive-deps -- the first answer
  const r = one.data;
  if (!r && !one.isError) return <p role="status" className="text-sm text-text-muted" data-loading>Loading the request…</p>;
  const refused = one.error instanceof SystemApiError ? one.error : null;
  if (!r) return <div className="mx-auto flex max-w-5xl flex-col gap-4"><h1 className="text-2xl font-semibold">Request</h1>
    <Notice tone="danger" title="Not available" action={refused && refused.status !== 404 && refused.status !== 403 ? <Button variant="outline" size="sm" onClick={() => void one.refetch()}>Retry</Button> : undefined}>
      <span data-request-error>{refused ? (refused.status === 404 ? C.missing : refused.message) : C.loadFailed}</span></Notice>
    <Link to="/system/privacy/requests" className="text-sm text-text-link">Back to Data requests to us</Link></div>;
  const s = REQUEST_STATUS_WORDS[r.status], due = dueWords(r, torontoToday()), manage = me.keys.includes(DSR_KEY), moves = MOVES[r.status];
  const moved = (m: Move) => { setMove(null); setDone(`Moved to ${REQUEST_STATUS_WORDS[m].word}.`); void qc.invalidateQueries({ queryKey: ["sys", "request", id] }); void qc.invalidateQueries({ queryKey: ["sys", "requests"] }); };
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link to="/system/privacy/requests" className="text-sm text-text-link">← Data requests to us</Link>
      <header className="flex flex-col gap-2">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none [overflow-wrap:anywhere]">{TYPE_WORDS[r.type]} request from {r.requester}</h1>
        <p className={cn("font-medium", s.tone)} data-request-status={r.status}><span aria-hidden>{s.mark} </span>{s.word}{due ? <span className="font-normal text-text-muted"> · target {dayWords(r.targetDate)}, {due}</span> : null}</p>
        {done ? <p role="status" className="text-sm text-text-ok" data-done>{done}</p> : null}
        {manage ? <div ref={actionsRef} className="flex flex-wrap gap-2" data-request-moves>
          {moves.length ? moves.map((m, i) => <Button key={m} variant={i === 0 ? "default" : "outline"} onClick={() => setMove(m)}>{MOVE_WORDS[m]}</Button>) : <p className="text-sm text-text-muted">{C.completedNoMore}</p>}
        </div> : null}
        {manage && r.status !== "COMPLETED" ? <p className="text-xs text-text-muted">{C.overdueByCheck}</p> : null}
      </header>
      <section aria-labelledby="request-facts" className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 id="request-facts" className="mb-2 text-base font-semibold">The request</h2>
        <dl>
          <Row label="Requester">{r.requester} · {r.requesterEmail}</Row>
          <Row label="Received on"><time dateTime={r.receivedOn}>{dayWords(r.receivedOn)}</time></Row>
          <Row label="Target date"><time dateTime={r.targetDate} data-target-date>{dayWords(r.targetDate)}</time> (30 days after receipt; our own reminder)</Row>
          {r.firmId ? <Row label="Firm">{firmWords({ id: r.firmId, name: r.firmName })}</Row> : null}
          {r.personId ? <Row label="Person record"><span title={r.personId}>{shortId(r.personId)}</span><span className="block text-xs text-text-muted">{C.personCopy}</span></Row> : null}
          {r.actionsTaken ? <Row label="What was done"><span data-actions-taken>{r.actionsTaken}</span></Row> : null}
          {r.completedOn ? <Row label="Completed on"><time dateTime={r.completedOn}>{dayWords(r.completedOn)}</time></Row> : null}
          <Row label="Logged by">{actorWords(r.recordedBy, r.recordedByName)}</Row>
        </dl>
      </section>
      <section aria-labelledby="request-steps" className="rounded-xl border border-border bg-surface-raised p-4">
        <h2 id="request-steps" className="mb-2 text-base font-semibold">Steps</h2>
        <ol aria-label="Steps" className="flex flex-col">
          {r.steps.map((x) => <li key={x.seq} className="border-b border-border py-2 text-sm last:border-b-0" data-step={x.kind}>
            <p className="font-medium">{stepWords(x)}</p>
            <p className="text-xs text-text-muted"><time dateTime={x.at}>{momentUtc(x.at)}</time> · {actorWords(x.actor, x.actorName)}</p>
            {x.note ? <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{x.note}</p> : null}
          </li>)}
        </ol>
      </section>
      {manage ? <MoveDialog id={r.id} move={move} onOpenChange={(o) => { if (!o) setMove(null); }} onMoved={moved} returnFocus={() => actionsRef.current?.querySelector("button") ?? heading.current} /> : null}
    </div>
  );
}

export function RequestPage() {
  return <SystemFrame crumbs={[{ label: "Data requests to us", to: "/system/privacy/requests" }, { label: "Request" }]}><RequestBody /></SystemFrame>;
}
