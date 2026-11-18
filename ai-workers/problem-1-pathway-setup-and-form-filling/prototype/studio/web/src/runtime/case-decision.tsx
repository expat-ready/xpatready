// CS-C1s (screens lane; concept screens/CS-C1s/concept.md r2, board design/board.html; R1.77, QA-502): the case page's
// "Decision and closing" panel and the case header's closing line. A staff member with agent/case:record-decision records
// IRCC's decision on each submitted filing (a second one is a correction: a new row), withdraws the case before any
// decision, closes a decided case with a reason; one with agent/case:reopen reopens a closed case with a reason. Every
// rule stays in the API (api/src/case-close.ts): which acts show comes from the read's `can` (the case's state) and the
// person's keys (/platform/me); a refusal shows in words where the person acted. The four routes take the firm staff
// sign-in (PF-4's bearer session), so the panel calls through `staffApi`, never the Studio's simulated person, and shows
// the staff sign-in inline when there is none. Outcome words are Sample until cited (AG-7-33 rule 4).
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button, Dialog, Field, Input, Notice, Pill, Textarea } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/api";
import { staffApi, StaffApiError, useMe, useStaffToken } from "@/modules/platform/session";
import { SignInCard } from "@/modules/platform/frame";
import { CaseDecisionsView, NOTE_MAX, REASON_MAX } from "../../../contracts/runtime";

type View = CaseDecisionsView;
type Row = View["filings"][number];
type Decision = NonNullable<Row["latest"]>;
const DECIDE = "agent/case:record-decision", REOPEN = "agent/case:reopen";

/** The outcome codes in words; every one is Sample until cited (concept §5). */
const WORDS: Record<string, string> = { APPROVED: "Approved", REFUSED: "Refused", WITHDRAWN: "Withdrawn", CLOSED_BY_STAFF: "Closed by staff", COMPLETED: "Completed" };
const words = (code: string) => WORDS[code] ?? code.toLowerCase().replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
const SAMPLE_TIP = "Sample words. The decision words come from the programme's pack; they become final once cited from an official IRCC source.";
/** "16 Nov 2026" (P-407): a calendar date as the date it is, in any time zone. */
const day = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayOf = (at: string) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Concept §5: the screen's words per refusal code (the API's text carries rule numbers); otherwise the API's own. */
const REFUSAL: Record<string, string> = {
  NOT_SUBMITTED: "This filing is not recorded as submitted yet. Record the submission first.",
  HAS_DECISION: "A filing has a decision, so the case cannot be withdrawn. Close it with a reason instead.",
  NOT_DECIDED: "Every filing needs a decision before the case is closed. Before any decision, withdraw the case.",
  CASE_CLOSED: "This case is closed. Reopen it first.",
  CASE_OPEN: "This case is open.",
  CHANGED: "This case changed at the same time. Open it again.",
};
const refusalOf = (e: unknown) => e instanceof StaffApiError ? REFUSAL[e.problem.code ?? ""] ?? e.message : "Could not reach the server. Please try again.";

function SampleMark() {
  return <span title={SAMPLE_TIP} data-sample-mark><Pill tone="warn" className="px-1.5 text-[11px]">Sample</Pill></span>;
}
const Outcome = ({ code }: { code: string }) => <><span className="font-medium" data-outcome={code}>{words(code)}</span> <SampleMark /></>;

/** The read, shared by the panel and the header line (one request). Sign-out drops it (session.ts: every ["pf", …]). */
export function useCaseDecisions(caseId: string) {
  const token = useStaffToken();
  return useQuery({ queryKey: ["pf", "case-decisions", caseId, token], enabled: !!token, retry: false,
    queryFn: async () => CaseDecisionsView.parse(await staffApi(`/runtime/cases/${caseId}/decisions`)) });
}

/** The case header's status pill: "Closed" or "Withdrawn" in words, never the raw code. */
export function CaseStatusPill({ caseId, status }: { caseId: string; status: string }) {
  const q = useCaseDecisions(caseId);
  const s = q.data?.case.status ?? status;
  if (s === "OPEN") return <Pill>Open</Pill>;
  return <span className="inline-flex" data-case-status-pill><Pill tone="neutral" className="font-semibold">{q.data?.case.closeOutcome === "WITHDRAWN" ? "Withdrawn" : "Closed"}</Pill></span>;
}

/** The case header's closing line (closed only): how and when the case ended, with its reason. */
export function CaseEndLine({ caseId }: { caseId: string }) {
  const q = useCaseDecisions(caseId);
  const c = q.data?.case;
  if (!c || c.status === "OPEN" || !c.closeOutcome) return null;
  return (
    <p className="mt-1.5 border-l-[3px] border-border-strong bg-surface-raised px-2.5 py-1.5 text-sm [overflow-wrap:anywhere]" data-case-end-line={c.closeOutcome}>
      {c.closeOutcome === "WITHDRAWN"
        ? <><Outcome code="WITHDRAWN" /> on {c.withdrawnOn ? day(c.withdrawnOn) : "a date not recorded"}{c.withdrawnAt ? ` (recorded ${dayOf(c.withdrawnAt)})` : ""} · Reason: {c.withdrawReason ?? c.closedReason}</>
        : <><Outcome code={c.closeOutcome} /> on {c.closedAt ? dayOf(c.closedAt) : "a date not recorded"}{c.decision ? <> · Decision: <Outcome code={c.decision} /></> : null} · Reason: {c.closedReason}</>}
    </p>
  );
}

type Act = { kind: "decide"; filing: Row } | { kind: "withdraw" } | { kind: "close" } | { kind: "reopen" };

/** The panel, under Submission to IRCC. A fixed-height skeleton while it loads, so nothing below moves. */
export function CaseDecisionPanel({ caseId }: { caseId: string }) {
  const token = useStaffToken();
  const me = useMe();
  const q = useCaseDecisions(caseId);
  const [act, setAct] = React.useState<Act | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const open = (a: Act) => (e: React.MouseEvent<HTMLElement>) => { opener.current = e.currentTarget; setAct(a); };
  const done = () => { setAct(null); requestAnimationFrame(() => { const o = opener.current; (o && o.isConnected ? o : heading.current)?.focus(); }); };
  const keys = me.data?.keys ?? [];
  const mayDecide = keys.includes(DECIDE), mayReopen = keys.includes(REOPEN);
  return (
    <section aria-labelledby="case-decision-h" className="rounded-xl border border-border bg-surface-raised" data-case-decision>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <h2 id="case-decision-h" ref={heading} tabIndex={-1} className="text-base font-semibold outline-none">Decision and closing</h2>
        <p className="min-w-0 flex-1 text-[13px] text-text-muted">Record IRCC's decision on each submitted filing, then close the case. Before any decision, the case can be withdrawn.</p>
        {me.data ? <span className="text-[13px] text-text-muted" title="Decisions use your firm staff sign-in." data-decision-signed-in>Signed in as <span className="font-medium text-text">{me.data.displayName}</span> (firm staff)</span> : null}
      </header>
      {!token ? (
        <div className="space-y-3 px-4 py-3" data-decision-no-session>
          <p className="text-sm text-text-muted">Sign in as firm staff to see and record decisions.</p>
          <SignInCard embedded />
        </div>
      ) : q.isLoading || me.isLoading ? <div className="p-4"><Skeleton className="h-24 w-full" /></div>
        : q.isError ? <div className="p-4"><ReadRefused e={q.error} firm={me.data?.firmKey} /></div>
          : <Body v={q.data!} mayDecide={mayDecide} mayReopen={mayReopen} open={open} />}
      {act && q.data ? <ActDialog caseId={caseId} v={q.data} act={act} onClose={done} /> : null}
    </section>
  );
}

function ReadRefused({ e, firm }: { e: unknown; firm?: string }) {
  const s = e instanceof StaffApiError ? e.status : 0;
  if (s === 404) return <Notice tone="danger" title="Not in your firm">This case is not in {firm ?? "your firm"}, the firm you are signed in to.</Notice>;
  if (s === 403) return <Notice tone="danger" title="Not for your role">Your role cannot see the decisions on this case.</Notice>;
  if (s === 428) return <Notice tone="danger" title="Accept the terms first">{(e as Error).message} <Link to="/account" className="font-medium text-text-link underline">My account</Link></Notice>;
  return <Notice tone="danger" title="The decisions could not be loaded">{refusalOf(e)}</Notice>;
}

function Body({ v, mayDecide, mayReopen, open }: { v: View; mayDecide: boolean; mayReopen: boolean; open: (a: Act) => (e: React.MouseEvent<HTMLElement>) => void }) {
  const closed = v.case.status !== "OPEN";
  const decided = v.filings.filter((f) => f.latest).length, total = v.filings.length;
  const notSubmitted = v.filings.filter((f) => !f.submitted);
  return (
    <>
      {v.filings.length === 0 ? <p className="px-4 py-3 text-sm text-text-muted">This case has no filings yet.</p> : (
        <ul className="divide-y divide-border border-b border-border">
          {v.filings.map((f) => <FilingRow key={f.id} f={f} canDecide={mayDecide && v.can.decide.includes(f.id)} open={open} />)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-decision-foot>
        {closed ? (
          <p className="min-w-0 flex-1 text-[13px] text-text-muted">{v.case.closeOutcome === "WITHDRAWN" ? "The case is withdrawn." : "The case is closed."}{v.case.closedFromStage ? ` Reopening returns it to ${v.case.closedFromStage.label}.` : ""}
            {!mayReopen && v.can.reopen ? <span data-decision-no-key> An Owner or Case manager can reopen this case.</span> : null}</p>
        ) : !mayDecide ? (
          <p className="min-w-0 flex-1 text-[13px] text-text-muted" data-decision-no-key>Your role does not record decisions. An Owner, Admin or Case manager can.</p>
        ) : !v.can.close ? (
          <p className="min-w-0 flex-1 text-[13px] text-text-muted" data-decision-close-hint>Close the case once every filing has a decision: {decided} of {total} decided.
            {notSubmitted.length ? ` Not submitted yet: ${notSubmitted.map((f) => `${f.person ?? "A person"} (${f.stage.label})`).join(", ")}.` : ""}</p>
        ) : <p className="min-w-0 flex-1 text-[13px] text-text-muted">Every filing has a decision.</p>}
        {!closed && mayDecide && v.can.withdraw ? <Button variant="ghost" className="max-[520px]:w-full" onClick={open({ kind: "withdraw" })} data-act="withdraw">Withdraw the case…</Button> : null}
        {!closed && mayDecide && v.can.close ? <Button className="max-[520px]:w-full" onClick={open({ kind: "close" })} data-act="close">Close the case…</Button> : null}
        {closed && mayReopen && v.can.reopen ? <Button className="max-[520px]:w-full" onClick={open({ kind: "reopen" })} data-act="reopen">Reopen the case…</Button> : null}
      </div>
    </>
  );
}

function FilingRow({ f, canDecide, open }: { f: Row; canDecide: boolean; open: (a: Act) => (e: React.MouseEvent<HTMLElement>) => void }) {
  const [history, setHistory] = React.useState(false);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3" data-decision-filing={f.id}>
      <div className="min-w-[240px] flex-1">
        <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">{f.person ?? "A person"} · {f.stage.label}{f.current ? "" : <span className="font-normal text-text-muted"> (earlier stage)</span>}</h3>
        <p className="text-[13px] text-text-muted">{f.submitted && f.submittedOn ? `Submitted on ${day(f.submittedOn)}` : "Not submitted yet"}</p>
        {f.latest ? <p className="mt-0.5 text-[13px] [overflow-wrap:anywhere]" data-latest-decision={f.latest.outcome}><Outcome code={f.latest.outcome} /> · decided {day(f.latest.decidedOn)}{f.latest.note ? <> · <span className="text-text-muted">“{f.latest.note}”</span></> : null}</p> : null}
        {f.earlier.length ? <>
          <button type="button" className="mt-0.5 inline-flex min-h-6 items-center text-[13px] font-medium text-text-link hover:underline" aria-expanded={history} onClick={() => setHistory((h) => !h)} title="Earlier decisions stay in the history." data-decision-history-toggle>
            {f.earlier.length} earlier decision{f.earlier.length === 1 ? "" : "s"}</button>
          {history ? <ul className="mt-1 list-disc pl-5 text-[13px] text-text-muted" data-decision-history>{[f.latest!, ...f.earlier].map((d) => <HistoryLine key={d.id} d={d} />)}</ul> : null}
        </> : null}
      </div>
      {canDecide ? <Button variant={f.latest ? "ghost" : "secondary"} className="max-[520px]:w-full" onClick={open({ kind: "decide", filing: f })} data-act="decide">{f.latest ? "Correct the decision…" : "Record a decision…"}</Button> : null}
    </li>
  );
}
const HistoryLine = ({ d }: { d: Decision }) => <li className="[overflow-wrap:anywhere]">{words(d.outcome)} (Sample) · decided {day(d.decidedOn)} · recorded by {d.recordedBy.name ?? "a staff member"} on {dayOf(d.recordedAt)}{d.note ? ` · “${d.note}”` : ""}</li>;

type Fields = Record<string, string>;
/** One dialog per act: its fields, the API's refusal in words, nothing changed on a refusal (the panel reads again). */
function ActDialog({ caseId, v, act, onClose }: { caseId: string; v: View; act: Act; onClose: () => void }) {
  const qc = useQueryClient(), toast = useToast();
  const [outcome, setOutcome] = React.useState("");
  const [date, setDate] = React.useState("");
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<Fields>({});
  // One key per opening of a decision dialog: a double click or a retry after a lost answer records one row (STANDARDS §4).
  const key = React.useMemo(() => `csc1s-${crypto.randomUUID()}`, []);
  const box = React.useRef<HTMLDivElement>(null);
  const correcting = act.kind === "decide" && !!act.filing.latest;
  const title = act.kind === "decide" ? `${correcting ? "Correct the decision" : "Record a decision"}: ${act.filing.person ?? "A person"} · ${act.filing.stage.label}`
    : act.kind === "withdraw" ? "Withdraw the case" : act.kind === "close" ? "Close the case" : "Reopen the case";
  const verb = act.kind === "decide" ? (correcting ? "Record the correction" : "Record the decision") : title;
  const send = async () => {
    if (busy) return;
    const local: Fields = {};
    if (act.kind === "decide" && !outcome) local.outcome = "Choose the outcome.";
    if ((act.kind === "decide" || act.kind === "withdraw") && !date) local[act.kind === "decide" ? "decidedOn" : "withdrawnOn"] = "A real date as YYYY-MM-DD.";
    if (Object.keys(local).length) { setErr(local); focusError(); return; }
    setBusy(true); setErr({});
    const path = act.kind === "decide" ? `/runtime/cases/${caseId}/decisions` : act.kind === "withdraw" ? `/runtime/cases/${caseId}/withdraw`
      : act.kind === "close" ? `/runtime/cases/${caseId}/close` : `/runtime/cases/${caseId}/reopen`;
    const json = act.kind === "decide" ? { filingId: act.filing.id, outcome, decidedOn: date, note: text || undefined, idempotencyKey: key }
      : act.kind === "withdraw" ? { reason: text, withdrawnOn: date } : { reason: text };
    try {
      await staffApi(path, { method: "POST", json });
      await refresh();
      toast.push({ tone: "ok", text: act.kind === "decide" ? (correcting ? "Correction recorded. The earlier decision stays in the history." : "Decision recorded.")
        : act.kind === "withdraw" ? "Withdrawn. The case is closed." : act.kind === "close" ? "Closed." : `Reopened. The case is back at ${v.case.closedFromStage?.label ?? "its stage"}.` });
      onClose();
    } catch (e) {
      const fields = e instanceof StaffApiError ? e.problem.fields ?? {} : {};
      if (Object.keys(fields).length) setErr(Object.fromEntries(Object.entries(fields).map(([k, m]) => [k, String(m)])));
      else setErr({ form: refusalOf(e) });
      if (e instanceof StaffApiError && e.status === 409) void refresh();
      focusError();
    } finally { setBusy(false); }
  };
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["pf", "case-decisions", caseId] }), qc.invalidateQueries({ queryKey: ["runtime"] })]);
  const focusError = () => requestAnimationFrame(() => (box.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? box.current?.querySelector<HTMLElement>('[role="alert"]'))?.focus());
  const reasonMax = REASON_MAX, max = act.kind === "decide" ? NOTE_MAX : reasonMax;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={title} guard
      description={act.kind === "decide" ? (correcting ? "This records a new decision. The earlier one stays in the history." : "The authority's decision on this filing, as IRCC sent it.")
        : act.kind === "withdraw" ? "Before any decision. The case closes as withdrawn; it can be reopened with a reason."
          : act.kind === "close" ? "Every filing has a decision. The case closes with your reason; it can be reopened."
            : `The case goes back to ${v.case.closedFromStage?.label ?? "the stage it closed from"}.`}
      footer={<div className="flex w-full justify-between gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={() => void send()} data-act-send>{verb}</Button></div>}>
      <div ref={box} className="flex flex-col gap-3" data-act-dialog={act.kind}>
        {act.kind === "decide" ? (
          <fieldset aria-invalid={err.outcome ? true : undefined} aria-describedby={err.outcome ? "act-outcome-err" : undefined} tabIndex={err.outcome ? -1 : undefined} className="outline-none">
            <legend className="mb-1.5 text-xs font-medium">Outcome</legend>
            <div className="flex flex-wrap gap-4">
              {v.outcomes.map((o) => <label key={o} className="inline-flex min-h-6 items-center gap-1.5 text-sm"><input type="radio" name="outcome" value={o} checked={outcome === o} onChange={() => setOutcome(o)} data-outcome-choice={o} />{words(o)} <SampleMark /></label>)}
            </div>
            {err.outcome ? <p id="act-outcome-err" role="alert" className="mt-1 text-xs text-text-danger">{err.outcome}</p> : null}
          </fieldset>
        ) : null}
        {act.kind === "decide" || act.kind === "withdraw" ? (
          <Field label={act.kind === "decide" ? "Decision date" : "Withdrawn on"} hint={act.kind === "decide" ? "The date on IRCC's decision." : "The date the client withdrew."} error={err.decidedOn ?? err.withdrawnOn ?? null}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-act-date />
          </Field>
        ) : null}
        <Field label={act.kind === "decide" ? "Note (optional)" : "Reason"} error={err.note ?? err.reason ?? null} hint={`${text.length} / ${max.toLocaleString("en-CA")}`}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} data-act-text />
        </Field>
        {err.form ? <Notice tone="danger" title="Not done"><span role="alert" tabIndex={-1} data-act-refusal>{err.form}</span> Nothing was changed.</Notice> : null}
      </div>
    </Dialog>
  );
}
