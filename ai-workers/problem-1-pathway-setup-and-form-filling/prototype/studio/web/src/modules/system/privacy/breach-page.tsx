// PF-21rs A2 (R1.86; concept r2 §3-§5, board §3-§4; SA-11-24, SA-11-25, BR-2, BR-3, BR-4, BR-7; QA-757; row W4; j_86 W6):
// one breach in our console, /system/privacy/breaches/:id, read from PF-21c's `GET …/breaches/:id` as answered. A header
// with the calculated status and its one next step; What happened (Edit the record, or Confirm the record for a draft);
// the Decision (Decide: Notify firms or No notice, with why; fixed once a notice is sent); Notices to firms, one row per
// affected firm: sent (time, recipients, subject and the words exactly as sent, from the message store) or "Send notice to
// <firm>" behind a confirmation, one firm at a time (no "send to all"); History, the breach's events. Every rule is the
// API's (409 words land on the firm's row); a firm the breach does not name is never listed. Kept 7 years: no delete.
import * as React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Field, Input, Notice, Textarea } from "@/components/ui/controls";
import { FoldOut } from "@/components/fold-out";
import { cn } from "@/lib/utils";
import { SystemFrame, useSystemStaff } from "../frame";
import { systemApi, SystemApiError, useSystemToken } from "../session";
import { actorWords, BREACH_MANAGE_KEY, BreachOne, categoryWords, COPY, DECISION_WORDS, fieldErrors, firmWords, historyWords, momentUtc, NEXT_STEP, noticesText, STATUS_WORDS, statusOf, whenWords, type SentNotice } from "./contract";
import { RecordBreach } from "./record-breach";

const Card = ({ title, id, children, action }: { title: string; id: string; children: React.ReactNode; action?: React.ReactNode }) => (
  <section aria-labelledby={id} className="rounded-xl border border-border bg-surface-raised p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 id={id} tabIndex={-1} className="text-base font-semibold outline-none">{title}</h2>{action}</div>
    {children}
  </section>
);
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="grid gap-1 py-1.5 sm:grid-cols-[12rem_1fr]"><dt className="text-xs font-medium text-text-muted">{label}</dt><dd className="text-sm [overflow-wrap:anywhere] whitespace-pre-line">{children}</dd></div>
);

/** One change that asks only for the guard's reason and maybe a few fields: Decide, Send a notice. */
function ChangeDialog({ open, onOpenChange, title, description, submit, send, children, returnFocus }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: React.ReactNode; submit: string;
  send: (reason: string) => Promise<void>; children?: (errors: Record<string, string>) => React.ReactNode; returnFocus: () => HTMLElement | null }) {
  const [reason, setReason] = React.useState(""), [errors, setErrors] = React.useState<Record<string, string>>({}), [busy, setBusy] = React.useState(false);
  const form = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => { if (open) { setReason(""); setErrors({}); } }, [open]);
  // After a refusal the first refused field takes the focus (review round 2).
  React.useEffect(() => { if (Object.keys(errors).length) form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(); }, [errors]);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErrors({});
    try { await send(reason); } catch (x) { setErrors(x instanceof SystemApiError && x.problem.fields ? fieldErrors(x.problem.fields) : { other: x instanceof SystemApiError ? x.message : "Could not save. Please try again." }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} returnFocus={returnFocus}
      footer={<><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="breach-change" busy={busy}>{submit}</Button></>}>
      <form id="breach-change" ref={form} onSubmit={go} noValidate className="flex flex-col gap-4">
        {children?.(errors)}
        <Field label="Reason for the audit line" hint="Why you are doing this: kept on the audit line." error={errors.reason}><Input value={reason} onChange={(e) => setReason(e.target.value)} data-field="reason" /></Field>
        {errors.other ? <Notice tone="danger"><span data-change-error>{errors.other}</span></Notice> : null}
      </form>
    </Dialog>
  );
}

function NoticeRow({ firm, notice, canSend, why, error, onSend }: { firm: { id: string; name: string | null }; notice?: SentNotice; canSend: boolean; why: string | null; error?: string; onSend: () => void }) {
  const name = firmWords(firm);
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between" data-notice-row={firm.id}>
      <div className="min-w-0 flex-1">
        <p className="font-medium [overflow-wrap:anywhere]">{name}</p>
        {notice ? <div className="mt-1 flex flex-col gap-1 text-sm">
          <p><span className="font-medium text-text-ok"><span aria-hidden>● </span>Sent</span> <time dateTime={notice.sentAt}>{momentUtc(notice.sentAt)}</time> to {notice.recipients.length} {notice.recipients.length === 1 ? "person" : "people"} ({[...new Set(notice.recipients.flatMap((r) => r.roles))].map((r) => r[0] + r.slice(1).toLowerCase()).join(", ")}) · by {actorWords(notice.sentBy, notice.sentByName)}</p>
          {notice.subject !== null ? <p>Subject: <span data-notice-subject>{notice.subject}</span></p> : null}
          {notice.text !== null ? <FoldOut summary="Words sent" summaryClassName="text-text-link"><pre tabIndex={0} role="region" aria-label={`Words sent to ${name}`} className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 font-sans text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [overflow-wrap:anywhere]" data-notice-words>{notice.text}</pre></FoldOut>
            : <p className="text-text-muted" data-words-note>{notice.wordsNote}</p>}
          <p className="text-xs text-text-muted">{COPY.sentNoMore}</p>
        </div> : <p className="mt-1 text-sm text-text-muted">Not sent{why ? `: ${why}` : ""}</p>}
        {error ? <p role="alert" className="mt-1 text-sm text-text-danger" data-notice-error>{error}</p> : null}
      </div>
      {!notice && canSend ? <Button variant="outline" onClick={onSend} className="h-auto min-h-9 max-w-full self-start whitespace-normal text-left [overflow-wrap:anywhere]">Send notice to {name}</Button> : null}
    </li>
  );
}

function BreachBody() {
  const { id = "" } = useParams(), [params] = useSearchParams(), token = useSystemToken(), me = useSystemStaff(), qc = useQueryClient();
  const one = useQuery({ queryKey: ["sys", "breach", id, token], enabled: !!token, retry: false, queryFn: async () => BreachOne.parse(await systemApi(`/register/breaches/${encodeURIComponent(id)}`)) });
  const [editing, setEditing] = React.useState(false), [deciding, setDeciding] = React.useState(false), [sending, setSending] = React.useState<{ id: string; name: string | null } | null>(null);
  const [choice, setChoice] = React.useState<"NOTIFY_FIRMS" | "NO_NOTICE" | null>(null), [why, setWhy] = React.useState("");
  const [rowError, setRowError] = React.useState<Record<string, string>>({}), [done, setDone] = React.useState<string | null>(params.get("recorded") ? COPY.recorded : null);
  const editButton = React.useRef<HTMLButtonElement>(null), decideButton = React.useRef<HTMLButtonElement>(null), heading = React.useRef<HTMLHeadingElement>(null);
  const [, setParams] = useSearchParams();
  // A recorded breach's page says so once: the mark leaves the address (a reload does not repeat it), the focus goes to the heading.
  React.useEffect(() => { if (params.get("recorded")) setParams({}, { replace: true }); }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- once, on arrival
  React.useEffect(() => { if (one.data && done === COPY.recorded) heading.current?.focus(); }, [!!one.data]);   // eslint-disable-line react-hooks/exhaustive-deps -- the first answer
  const reload = () => { void qc.invalidateQueries({ queryKey: ["sys", "breach", id] }); void qc.invalidateQueries({ queryKey: ["sys", "breaches"] }); };
  /** Break M1: before a change, the breach is read again; if someone changed it since this page read it, nothing is sent and the
   *  page reloads (the PATCH itself takes no version yet: a runtime row, asked of the tech lead on #3538). */
  // PF-21rs B (the A2 quarantine, batch #3749): a change dialog opens only on a fresh read of the breach (reopened right
  // after "changed elsewhere", it showed the old words while the reload was still on its way), and its stale check compares
  // with the breach as it was when the dialog opened, never with a copy a background refetch replaced meanwhile.
  const seenAt = React.useRef<{ updatedAt: string; notices: number } | null>(null), [readying, setReadying] = React.useState(false);
  const opening = async (open: (fresh: BreachOne) => void) => {
    if (readying) return;
    setReadying(true);
    try { const r = await one.refetch(); if (!r.data) return; seenAt.current = { updatedAt: r.data.updatedAt, notices: r.data.notices.length }; open(r.data); } finally { setReadying(false); }
  };
  const unchanged = async () => {
    const now = BreachOne.parse(await systemApi(`/register/breaches/${encodeURIComponent(id)}`)), was = seenAt.current;
    if (!was || now.updatedAt !== was.updatedAt || now.notices.length !== was.notices) { reload(); throw new SystemApiError(409, { status: 409, code: "STALE", detail: COPY.stale }); }
  };
  const b = one.data;
  if (!b && !one.isError) return <p role="status" className="text-sm text-text-muted" data-loading>Loading the breach…</p>;
  const refused = one.error instanceof SystemApiError ? one.error : null;
  if (!b) return <div className="mx-auto flex max-w-5xl flex-col gap-4"><h1 className="text-2xl font-semibold">Breach</h1>
    <Notice tone="danger" title="Not available" action={refused && refused.status !== 404 && refused.status !== 403 ? <Button variant="outline" size="sm" onClick={() => void one.refetch()}>Retry</Button> : undefined}>
      <span data-breach-error>{refused ? (refused.status === 404 ? COPY.breachMissing : refused.message) : COPY.loadFailed}</span></Notice>
    <Link to="/system/privacy/breaches" className="text-sm text-text-link">Back to Breaches</Link></div>;
  const manage = me.keys.includes(BREACH_MANAGE_KEY), status = statusOf(b), s = STATUS_WORDS[status];
  const sent = new Map(b.notices.map((n) => [n.firmId, n])), firmName = (f: string) => firmWords(b.firms.find((x) => x.id === f) ?? { id: f, name: b.notices.find((n) => n.firmId === f)?.firmName ?? null });
  const listed = [...b.firms, ...b.notices.filter((n) => !b.affectedFirms.includes(n.firmId)).map((n) => ({ id: n.firmId, name: n.firmName }))];
  const canSend = manage && b.status === "RECORDED" && b.decision === "NOTIFY_FIRMS";
  const notSentWhy = b.status === "DRAFT" ? COPY.draftFirst : b.decision === "UNDECIDED" ? COPY.decideFirst : b.decision === "NO_NOTICE" ? COPY.noNotice : null;
  const fixed = b.notices.length > 0;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold outline-none">Breach discovered <time dateTime={b.discoveredAt}>{whenWords(b.discoveredAt)}</time> UTC</h1>
          <p className="mt-1 text-sm"><span className={cn("font-medium", s.tone)} title={s.hint} data-breach-status><span aria-hidden>{s.mark} </span>{s.word}</span>
            {b.decision === "NOTIFY_FIRMS" && b.status === "RECORDED" ? <span className="text-text-muted">: {noticesText(b)}</span> : null}
            <span className="text-text-muted"> · recorded by {actorWords(b.openedBy, b.openedByName)} · Kept 7 years; never deleted</span></p>
          <p className="mt-1 text-sm text-text-muted" data-next-step>{NEXT_STEP[status]}</p>
          {!manage ? <p className="mt-1 text-sm text-text-muted" data-read-only>{COPY.readOnly}</p> : null}
        </div>
        {manage ? <Button ref={editButton} variant={b.status === "DRAFT" ? "default" : "outline"} busy={readying} onClick={() => void opening(() => setEditing(true))}>{b.status === "DRAFT" ? "Confirm the record" : "Edit the record"}</Button> : null}
      </header>
      <div role="status">{done ? <p className="rounded-lg border border-border border-l-4 border-l-ok bg-surface-raised px-4 py-3 text-sm" data-done>{done}</p> : null}</div>

      <Card title="What happened" id="breach-what">
        <dl>
          <Row label="Description">{b.description}</Row>
          <Row label="Affected firms">{b.firms.length ? b.firms.map(firmWords).join(" · ") : COPY.underInvestigation}</Row>
          <Row label="Data categories">{b.dataCategories.length ? b.dataCategories.map(categoryWords).join(", ") : "Not yet known"}</Row>
          <Row label="Root cause">{b.rootCause ?? "Not yet known"}</Row>
          <Row label="Containment">{b.containment ?? "Not yet known"}</Row>
          <Row label="Other notifications made">{b.otherNotifications ?? "None yet"}</Row>
        </dl>
      </Card>

      <Card title="Decision" id="breach-decision" action={manage && b.status === "RECORDED" && !fixed ? <Button ref={decideButton} variant={b.decision === "UNDECIDED" ? "default" : "outline"} size="sm" busy={readying} onClick={() => void opening((fresh) => { setChoice(fresh.decision === "UNDECIDED" ? null : fresh.decision); setWhy(""); setDeciding(true); })}   /* break B1 (#3818): the dialog starts from the fresh read, the same read its stale check compares with */>{b.decision === "UNDECIDED" ? "Decide" : "Change the decision"}</Button> : undefined}>
        <dl>
          <Row label="Decision">{b.status === "DRAFT" ? `${DECISION_WORDS[b.decision]} (confirm the record first)` : b.decision === "NOTIFY_FIRMS" ? "Notify the affected firms" : DECISION_WORDS[b.decision]}</Row>
          {b.decisionReason ? <Row label="Why">{b.decisionReason}</Row> : null}
          {b.decidedAt ? <Row label="Who, when">{actorWords(b.decidedBy ?? "", b.decidedByName)}, <time dateTime={b.decidedAt}>{momentUtc(b.decidedAt)}</time></Row> : null}
        </dl>
        {fixed ? <p className="mt-2 text-xs text-text-muted">{COPY.decisionFixed}</p> : null}
      </Card>

      <Card title="Notices to firms" id="breach-notices">
        <p className="text-sm text-text-muted">{COPY.noticeInfo}</p>
        {listed.length ? <ul className="mt-2" aria-label="Notices to firms">
          {listed.map((f) => <NoticeRow key={f.id} firm={f} notice={sent.get(f.id)} canSend={canSend} why={notSentWhy} error={rowError[f.id]} onSend={() => setSending(f)} />)}
        </ul> : <p className="mt-2 text-sm text-text-muted">{b.decision === "NOTIFY_FIRMS" ? "No firm is named yet: edit the record to name the affected firms." : "No firm is named yet."}</p>}
      </Card>

      <Card title="History" id="breach-history">
        <ol className="flex flex-col gap-1 text-sm" aria-label="History">
          {[...b.events].reverse().map((e) => <li key={e.seq} data-event={e.kind} className="[overflow-wrap:anywhere]"><time dateTime={e.at} className="text-text-muted">{momentUtc(e.at)}</time> · {historyWords(e, firmName)} · {actorWords(e.actor, e.actorName)}</li>)}
        </ol>
      </Card>

      {manage ? <>
        <RecordBreach before={unchanged} onStale={() => setDone(COPY.stale)} open={editing} onOpenChange={(o) => { setEditing(o); if (!o) reload(); }} breach={b} returnFocus={() => editButton.current}
          onRecorded={() => { setEditing(false); setDone(b.status === "DRAFT" ? "Confirmed. Next: decide whether firms are told." : "Saved."); reload(); }} onMaybeRecorded={reload} />
        <ChangeDialog open={deciding} onOpenChange={setDeciding} title="Decide whether firms are told" description="The decision names who and why. It is fixed once a notice is sent." submit="Record the decision"
          returnFocus={() => decideButton.current ?? document.getElementById("breach-decision")}
          send={async (reason) => { try { await unchanged(); } catch (x) { setDeciding(false); setDone(COPY.stale); throw x; } await systemApi(`/register/breaches/${b.id}`, { method: "PATCH", json: { reason, ...(choice ? { decision: choice, decisionReason: why } : {}) } }); setDeciding(false); setDone("Decision recorded."); reload(); }}>
          {(errors) => <>
            <fieldset className="flex flex-col gap-2"><legend className="text-xs font-medium text-text">Decision</legend>
              {(["NOTIFY_FIRMS", "NO_NOTICE"] as const).map((v) => <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name="decision" className="size-4 accent-[var(--color-primary)]" checked={choice === v} onChange={() => setChoice(v)} data-decision={v} />
                {v === "NOTIFY_FIRMS" ? "Notify the affected firms" : "No notice"}</label>)}
              {errors.body ? <p role="alert" className="text-xs text-text-danger">{errors.body}</p> : null}
            </fieldset>
            <Field label="Why" hint="Kept with the decision." error={errors.decisionReason}><Textarea rows={2} value={why} onChange={(e) => setWhy(e.target.value)} data-field="decisionReason" /></Field>
          </>}
        </ChangeDialog>
        <ChangeDialog open={!!sending} onOpenChange={(o) => { if (!o) setSending(null); }} title={`Send the notice to ${sending ? firmWords(sending) : ""}?`} description={COPY.noticeConfirm} submit="Send the notice"
          returnFocus={() => document.getElementById("breach-notices")}
          send={async (reason) => {
            const f = sending!;
            try { await systemApi(`/register/breaches/${b.id}/notices`, { method: "POST", json: { reason, firmId: f.id } }); setRowError((o) => { const { [f.id]: _gone, ...rest } = o; return rest; }); setDone(`Notice sent to ${firmWords(f)}.`); }
            catch (x) { if (!(x instanceof SystemApiError) || x.status !== 409) { reload(); throw x; } setRowError((o) => ({ ...o, [f.id]: x.message })); }   // the API's words on that firm's row, the page reloaded
            setSending(null); reload();
          }} />
      </> : null}
    </div>
  );
}

export function BreachPage() {
  return <SystemFrame crumbs={[{ label: "Breaches", to: "/system/privacy/breaches" }, { label: "A breach" }]}><BreachBody /></SystemFrame>;
}
