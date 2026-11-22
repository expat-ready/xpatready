// CS-DL3 part 2 (R1.74, QA-591; brief design/build-lead-c-briefs/CS-DL3.md "Part 2", approved by the row owner): the case
// page's "Government steps" section. Each step IRCC asked for (a biometrics letter, a medical exam request, …) with the
// letter's date, the due date typed from the letter ("in N days" or "overdue" in words, never colour alone), its reference,
// who recorded it, and the reminders planned for it. "Record a step" (one confirm: the due date never changes) and
// "Cancel" (a reason; the line stays, shown as cancelled). Every rule stays in the API (features/case-milestones.ts): the
// buttons show only with agent/case:edit (the person's keys, /platform/me) and while the case is open; a refusal shows in
// words where the person acted. The routes take the firm staff sign-in (PF-4's bearer session), so the section calls
// through `staffApi`, as "Decision and closing" does. The step names are Sample (pack-defined in the source).
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Field, Input, Notice, Pill, Select, Textarea } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/api";
import { staffApi, StaffApiError, useMe, useStaffToken } from "@/modules/platform/session";
import { CancelMilestoneBody, MILESTONE_NOTE_MAX, MILESTONE_REASON_MAX, MILESTONE_REFERENCE_MAX, RecordMilestoneBody, type CaseMilestonesView, type MilestoneView } from "../../../contracts/milestones";

const EDIT = "agent/case:edit";
const KEY = (caseId: string, token: string | null) => ["pf", "case-milestones", caseId, token];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "15 Feb 2027": a calendar date as the date it is, in any time zone. */
const day = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const withWeekday = (d: string) => `${WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${day(d)}`;
const dayOf = (at: string) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
/** How far off the due date is, in words (colour is never the only sign). */
export const dueWords = (n: number) => n === 0 ? "due today" : n > 0 ? `in ${n} day${n === 1 ? "" : "s"}` : `overdue by ${-n} day${n === -1 ? "" : "s"}`;
/** A reminder's words: offset 0 is counted back to the last open day, so "on the day" only when it falls on the due date. */
const offsetWords = (o: number, d: string, due: string | null) => o === 0 ? (d === due ? "on the day" : "the last working day before") : `${o} working day${o === 1 ? "" : "s"} before`;
/** Characters, not UTF-16 units (the API counts the same way). */
const chars = (t: string) => [...t].length;
/** The contract's own checks (STANDARDS §7: no rule copied into the web): the first message per field. */
function fieldsOf(r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }): Record<string, string> {
  const out: Record<string, string> = {};
  if (!r.success) for (const i of r.error!.issues) { const f = String(i.path[0] ?? "form"); out[f] ??= i.message; }
  return out;
}

const REFUSAL: Record<string, string> = {
  CASE_CLOSED: "This case is closed. Reopen it to record a government step.",
  ALREADY_CANCELLED: "This step is already cancelled.",
  CHANGED: "This case changed at the same time. Open it again.",
  NOT_FOUND: "This step or case is not in your firm.",
};
const refusalOf = (e: unknown) => !(e instanceof StaffApiError) ? "Could not reach the server. Please try again."
  : e.status === 403 ? "Your role does not allow this. An Owner, Admin, Case manager or Case officer can." : REFUSAL[e.problem.code ?? ""] ?? e.message;

type Act = { kind: "record" } | { kind: "cancel"; m: MilestoneView };
/** What was typed in a dialog, kept by the section so a sign-in that ends mid-dialog loses nothing. */
type Draft = Record<string, string>;

/** The section, under the stage strip. A fixed-height skeleton while it loads. */
export function GovernmentSteps({ caseId }: { caseId: string }) {
  const token = useStaffToken();
  const me = useMe();
  const q = useQuery({ queryKey: KEY(caseId, token), enabled: !!token, retry: false, queryFn: () => staffApi<CaseMilestonesView>(`/runtime/cases/${caseId}/milestones`) });
  const [act, setAct] = React.useState<Act | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const open = (a: Act) => (e: React.MouseEvent<HTMLElement>) => { opener.current = e.currentTarget; setAct(a); };
  // After a dialog, focus goes back to the button that opened it, or to the heading when that button is gone (a cancel).
  const done = () => { setAct(null); setInitial({}); draft.current = {}; requestAnimationFrame(() => { const o = opener.current; (o && o.isConnected ? o : heading.current)?.focus(); }); };
  // Review S2 (break m2), as "Decision and closing": the staff sign-in ended while a dialog was open (signed out
  // elsewhere, expired, or a 401 on send). The section says nothing was recorded; what was typed opens again after sign-in.
  const draft = React.useRef<Draft>({});
  const [initial, setInitial] = React.useState<Draft>({});
  const [lost, setLost] = React.useState<Act | null>(null);
  const lose = React.useCallback(() => { setAct((a) => { if (a) setLost(a); return null; }); }, []);
  React.useEffect(() => { if (!token && act) lose(); }, [token, act, lose]);
  React.useEffect(() => {
    if (!token || !q.data || !lost) return;
    const again = lost.kind === "cancel" ? q.data.milestones.find((m) => m.id === lost.m.id && !m.cancelled) : null;
    if (lost.kind === "record" || again) { setInitial(draft.current); setAct(lost.kind === "cancel" ? { kind: "cancel", m: again! } : lost); }
    setLost(null);
  }, [token, q.data, lost]);
  const v = q.data, mayEdit = (me.data?.keys ?? []).includes(EDIT) && !!v?.caseOpen;
  const open_ = (v?.milestones ?? []).filter((m) => !m.cancelled).length;
  return (
    <section aria-labelledby="gov-steps-h" className="rounded-xl border border-border bg-surface-raised" data-gov-steps>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <h2 id="gov-steps-h" ref={heading} tabIndex={-1} className="text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary">Government steps</h2>
        <p className="min-w-0 basis-full text-[13px] text-text-muted sm:basis-0 sm:flex-1">What IRCC asked for, with the due date on its letter. Reminders are planned 7 and 2 working days before, and on the last working day by the due date.</p>
        {mayEdit ? <Button size="sm" variant="secondary" className="max-[520px]:w-full" onClick={open({ kind: "record" })} data-gov-record>Record a step…</Button> : null}
      </header>
      {lost ? <div className="px-4 pt-3"><Notice tone="warn" title="Your firm staff sign-in ended"><span data-gov-session-lost>{lost.kind === "record" ? "Record a step" : `Cancel: ${lost.m.words}`} was not sent: nothing was recorded. Sign in again: what you typed is kept and opens again.</span></Notice></div> : null}
      {!token ? <p className="px-4 py-3 text-sm text-text-muted" data-gov-no-session>Sign in as firm staff (under <a href="#case-decision-h" className="font-medium text-text-link underline">Decision and closing</a>) to see and record government steps.</p>
        : q.isLoading || me.isLoading ? <div className="p-4"><Skeleton className="h-16 w-full" /></div>
          : q.isError ? <div className="p-4"><Notice tone="danger" title="The government steps could not be loaded">{refusalOf(q.error)}</Notice></div>
            : <>
              {!v!.milestones.length ? <p className="px-4 py-3 text-sm text-text-muted" data-gov-empty>No government step recorded yet.</p> : (
                <ul className="divide-y divide-border" aria-label={`${open_} open, ${v!.milestones.length - open_} cancelled`}>
                  {v!.milestones.map((m) => <StepRow key={m.id} m={m} mayEdit={mayEdit} open={open} />)}
                </ul>
              )}
              <p className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-xs text-text-muted" data-gov-foot>
                <Pill tone="warn" title="The list of steps is Sample: the configurator will define it per program">Sample</Pill> step names. The due date is the one on IRCC's letter; the app never works one out.
                {v!.caseOpen ? <span data-gov-reminded>The case officer and the lead representative are reminded on their Home, under Needs you, when in-app reminders are on.</span> : null}
                {!v!.caseOpen ? <span data-gov-closed> The case is closed: reopen it to record a step.</span> : !(me.data?.keys ?? []).includes(EDIT) ? <span data-gov-no-key> Your role does not record government steps.</span> : null}
              </p>
            </>}
      {act && v ? (act.kind === "record" ? <RecordDialog caseId={caseId} v={v} onClose={done} onLost={lose} initial={initial} onDraft={(d) => { draft.current = d; }} />
        : <CancelDialog caseId={caseId} m={act.m} onClose={done} onLost={lose} initial={initial} onDraft={(d) => { draft.current = d; }} />) : null}
    </section>
  );
}

function StepRow({ m, mayEdit, open }: { m: MilestoneView; mayEdit: boolean; open: (a: Act) => (e: React.MouseEvent<HTMLElement>) => void }) {
  const cancelled = !!m.cancelled;
  return (
    <li className={`flex flex-wrap items-start gap-x-4 gap-y-1.5 px-4 py-3 ${cancelled ? "text-text-muted" : ""}`} data-gov-step={m.id} data-gov-key={m.key} data-gov-state={cancelled ? "cancelled" : "open"}>
      <div className="min-w-[260px] flex-1 [overflow-wrap:anywhere]">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className={cancelled ? "line-through" : ""}>{m.words}</span>
          {cancelled ? <Pill tone="neutral" className="font-semibold">Cancelled</Pill> : null}
          {m.deadline?.missed ? <Pill tone="danger" title="The due date is before today in the firm's time zone">Overdue</Pill> : null}
        </h3>
        <p className="text-[13px]">Letter of {day(m.occurredOn)} · {m.dueOn ? <>Due <span className="font-medium" data-gov-due>{m.deadline?.shown ?? withWeekday(m.dueOn)}</span>{m.deadline ? <> · <span data-gov-days={m.deadline.daysLeft}>{dueWords(m.deadline.daysLeft)}</span></> : null}</> : "no due date on the letter"}
          {m.reference ? <> · Ref. <bdi data-gov-ref>{m.reference}</bdi></> : null}</p>
        {m.note ? <p className="text-[13px] text-text-muted">“<bdi>{m.note}</bdi>”</p> : null}
        <p className="text-xs text-text-muted">Recorded by {m.recordedBy.name ?? "a staff member"} on {dayOf(m.recordedAt)}</p>
        {cancelled ? <p className="text-xs" data-gov-cancelled>Cancelled by {m.cancelled!.by.name ?? "a staff member"} on {dayOf(m.cancelled!.at)} · Reason: <bdi>{m.cancelled!.reason}</bdi></p>
          : m.reminders.length ? <p className="text-xs text-text-muted" data-gov-reminders>Reminders planned: {m.reminders.map((r) => `${withWeekday(r.day)} (${offsetWords(r.offset, r.day, m.dueOn)})`).join(", ")}</p>
            : m.dueOn ? <p className="text-xs text-text-muted" data-gov-reminders>No reminder still to come.</p> : null}
      </div>
      {mayEdit && !cancelled ? <Button size="sm" variant="ghost" className="max-[520px]:w-full" onClick={open({ kind: "cancel", m })} data-gov-cancel aria-label={`Cancel ${m.words}${m.dueOn ? `, due ${day(m.dueOn)}` : ""}`}>Cancel…</Button> : null}
    </li>
  );
}

type Fields = Record<string, string>;
/** Back asks before discarding what was typed, as Escape and the X do (break m4). */
const backFrom = (typed: boolean, onClose: () => void) => () => { if (typed && !window.confirm("Discard your unsaved changes?")) return; onClose(); };
/** The API's field errors, or its refusal in words; nothing changed on a refusal. */
function useSend(caseId: string, onClose: () => void, onLost: () => void, box: React.RefObject<HTMLDivElement | null>) {
  const qc = useQueryClient(), toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<Fields>({});
  // Break m1: focus moves to the first error once it is on screen and the button is no longer busy (a busy button is
  // disabled, which dropped the focus a frame-timed call had aimed at).
  const [tick, setTick] = React.useState(0);
  const focusError = () => setTick((t) => t + 1);
  React.useEffect(() => { if (tick && !busy) (box.current?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? box.current?.querySelector<HTMLElement>("[data-gov-refusal]"))?.focus(); }, [tick, busy, box]);
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["pf", "case-milestones", caseId] }), qc.invalidateQueries({ queryKey: ["runtime"] })]);
  const send = async (path: string, json: unknown, ok: string) => {
    if (busy) return;
    setBusy(true); setErr({});
    try { await staffApi(path, { method: "POST", json }); await refresh(); toast.push({ tone: "ok", text: ok }); onClose(); } catch (e) {
      if (e instanceof StaffApiError && e.status === 401) { onLost(); return; }   // the session ended: the section says nothing was recorded
      if (e instanceof StaffApiError && e.status === 409) await refresh().catch(() => undefined);   // the section as it is now, before the words take the focus (break m1)
      const fields = e instanceof StaffApiError ? e.problem.fields ?? {} : {};
      if (Object.keys(fields).length) setErr(Object.fromEntries(Object.entries(fields).map(([k, m]) => [k, String(m)])));
      else setErr({ form: refusalOf(e) });
      if (e instanceof StaffApiError && e.status === 403) void qc.invalidateQueries({ queryKey: ["fo", "me"] });
      focusError();
    } finally { setBusy(false); }
  };
  return { busy, err, setErr, send, focusError };
}

type DialogProps = { caseId: string; onClose: () => void; onLost: () => void; initial: Draft; onDraft: (d: Draft) => void };
function RecordDialog({ caseId, v, onClose, onLost, initial, onDraft }: DialogProps & { v: CaseMilestonesView }) {
  const [key, setKey] = React.useState(initial.milestoneKey ?? "");
  const [occurredOn, setOccurred] = React.useState(initial.occurredOn ?? "");
  const [dueOn, setDue] = React.useState(initial.dueOn ?? "");
  const [reference, setReference] = React.useState(initial.reference ?? "");
  const [note, setNote] = React.useState(initial.note ?? "");
  React.useEffect(() => { onDraft({ milestoneKey: key, occurredOn, dueOn, reference, note }); }, [key, occurredOn, dueOn, reference, note]);   // eslint-disable-line react-hooks/exhaustive-deps -- the section keeps the draft
  const restored = Object.values(initial).some(Boolean), typed = !!(key || occurredOn || dueOn || reference || note);
  // One key per opening: a double click or a retry after a lost answer records one step (STANDARDS §4).
  const idem = React.useMemo(() => `csdl3-${crypto.randomUUID()}`, []);
  const box = React.useRef<HTMLDivElement>(null);
  const { busy, err, setErr, send, focusError } = useSend(caseId, onClose, onLost, box);
  const words = v.keys.find((k) => k.key === key)?.words;
  const submit = () => {
    const json = { idempotencyKey: idem, milestoneKey: key, occurredOn, dueOn: dueOn || null, reference: reference || null, note: note || null };
    // The words a person reads for an empty choice; every other message is the contract's own (the API answers the same).
    const local = { ...fieldsOf(RecordMilestoneBody.safeParse(json)), ...(!key ? { milestoneKey: "Choose the step." } : {}), ...(!occurredOn ? { occurredOn: "Give the letter's date." } : {}) };
    if (Object.keys(local).length) { setErr(local); focusError(); return; }
    void send(`/runtime/cases/${caseId}/milestones`, json,
      `${words ?? "Step"} recorded${dueOn ? `, due ${day(dueOn)}` : ""}.`);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title="Record a government step" guard description="As IRCC's letter gives it. The due date is the one on the letter.">
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div ref={box} className="flex flex-col gap-3" data-gov-dialog="record">
          <Field label="Step" hint="Sample list of steps" error={err.milestoneKey ?? null}>
            <Select value={key} onChange={(e) => setKey(e.target.value)} data-gov-field="milestoneKey"><option value="">Choose…</option>{v.keys.map((k) => <option key={k.key} value={k.key}>{k.words}</option>)}</Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Letter's date" error={err.occurredOn ?? null}><Input type="date" value={occurredOn} onChange={(e) => setOccurred(e.target.value)} data-gov-field="occurredOn" /></Field>
            <Field label="Due date (optional)" hint="Leave empty if the letter gives none" error={err.dueOn ?? null}><Input type="date" value={dueOn} min={occurredOn || undefined} onChange={(e) => setDue(e.target.value)} data-gov-field="dueOn" /></Field>
          </div>
          <Field label="Reference (optional)" hint={`The number on IRCC's letter · ${chars(reference)} / ${MILESTONE_REFERENCE_MAX}`} error={err.reference ?? null}><Input value={reference} onChange={(e) => setReference(e.target.value)} data-gov-field="reference" /></Field>
          <Field label={key === "other" ? "Note" : "Note (optional)"} hint={`${chars(note)} / ${MILESTONE_NOTE_MAX.toLocaleString("en-CA")}`} error={err.note ?? null}><Textarea value={note} rows={2} onChange={(e) => setNote(e.target.value)} data-gov-field="note" /></Field>
          <Notice tone="warn" title="Check the due date"><span data-gov-cannot-change>The due date can't be changed later; if it's wrong, cancel it and record it again.</span></Notice>
          {restored ? <Notice tone="info" title="Signed in again"><span data-gov-restored>What you typed is kept. Nothing was sent yet.</span></Notice> : null}
          {err.form ? <Notice tone="danger" title="Not recorded"><span role="alert" tabIndex={-1} data-gov-refusal>{err.form}</span> Nothing was changed.</Notice> : null}
          <div className="flex justify-between gap-2"><Button type="button" variant="secondary" onClick={backFrom(typed, onClose)}>Back</Button><Button type="submit" busy={busy} data-gov-send>Record the step</Button></div>
        </div>
      </form>
    </Dialog>
  );
}

function CancelDialog({ caseId, m, onClose, onLost, initial, onDraft }: DialogProps & { m: MilestoneView }) {
  const [reason, setReason] = React.useState(initial.reason ?? "");
  React.useEffect(() => { onDraft({ reason }); }, [reason]);   // eslint-disable-line react-hooks/exhaustive-deps -- the section keeps the draft
  const box = React.useRef<HTMLDivElement>(null);
  const { busy, err, setErr, send, focusError } = useSend(caseId, onClose, onLost, box);
  const submit = () => {
    const local = fieldsOf(CancelMilestoneBody.safeParse({ reason }));
    if (Object.keys(local).length) { setErr(local); focusError(); return; }
    void send(`/runtime/cases/${caseId}/milestones/${m.id}/cancel`, { reason }, `${m.words} cancelled. It stays on the case as cancelled.`);
  };
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={`Cancel: ${m.words}`} guard description={`${m.dueOn ? `Due ${day(m.dueOn)}. ` : ""}Its reminders stop. The line stays on the case, shown as cancelled; record the step again if the date was wrong.`}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div ref={box} className="flex flex-col gap-3" data-gov-dialog="cancel">
          <div>
            <Field label="Reason" error={err.reason ?? null}><Textarea value={reason} rows={3} onChange={(e) => setReason(e.target.value)} data-gov-field="reason" /></Field>
            <p className="mt-1 text-xs text-text-muted" aria-live="polite">{chars(reason)} / {MILESTONE_REASON_MAX}</p>
          </div>
          {err.form ? <Notice tone="danger" title="Not cancelled"><span role="alert" tabIndex={-1} data-gov-refusal>{err.form}</span> Nothing was changed.</Notice> : null}
          <div className="flex justify-between gap-2"><Button type="button" variant="secondary" onClick={backFrom(!!reason, onClose)}>Back</Button><Button type="submit" busy={busy} data-gov-cancel-send>Cancel the step</Button></div>
        </div>
      </form>
    </Dialog>
  );
}
