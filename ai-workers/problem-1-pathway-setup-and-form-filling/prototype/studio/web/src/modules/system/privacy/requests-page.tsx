// PF-21rs B1 (R1.85; concept r2 §4 "Data requests to us", §5; SA-11-27, BR-5, BR-7, BR-8; row W1, W2, W5, W6; j_85 W1):
// our console's register of requests made to ExpatReady, /system/privacy/requests. One table read from PF-21b part 3's
// `GET /api/system/register/requests` in the API's order (newest first), with status chips; each target date with its
// "in n days" / "n days late". The Platform Owner logs a request here ("Log a request"); without the key, the API's own
// 403 words, never an empty table. A request's own page is request-page.tsx.
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button, Dialog, Field, Input, Notice, Select, Table } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { SystemFrame, useSystemStaff } from "../frame";
import { systemApi, SystemApiError, useSystemToken } from "../session";
import { firmWords } from "./contract";
import { OneFirm, type Firm } from "./one-firm";
import { dayWords, DSR_KEY, dueWords, isUuid, logBody, REQUEST_COPY as C, REQUEST_STATUS_WORDS, REQUEST_STATUSES, REQUEST_TYPES, requestFieldErrors, RequestList, torontoToday, TYPE_WORDS, type DataRequest, type LogDraft, type RequestStatus } from "./requests";

const blank = (): LogDraft => ({ type: "ACCESS", requester: "", requesterEmail: "", receivedOn: torontoToday(), firmId: "", personId: "" });
const Logged = z.object({ id: z.string() });

function LogRequest({ open, onOpenChange, onLogged, returnFocus }: { open: boolean; onOpenChange: (o: boolean) => void; onLogged: (id: string) => void; returnFocus: () => HTMLElement | null }) {
  const [firm, setFirm] = React.useState<Firm | null>(null);
  const [d, setD] = React.useState<LogDraft>(blank), [errors, setErrors] = React.useState<Record<string, string>>({}), [busy, setBusy] = React.useState(false), [refused, setRefused] = React.useState(0);
  const form = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => { if (open) { setD(blank()); setFirm(null); setErrors({}); } }, [open]);
  React.useEffect(() => { if (refused) form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(); }, [refused]);
  const put = <K extends keyof LogDraft>(k: K, v: string) => { setD((o) => ({ ...o, [k]: v })); setErrors((o) => { if (!(k in o)) return o; const { [k]: _gone, ...rest } = o; return rest; }); };
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    // Review M1: the firm is picked, the id's shape said in plain words before anything is sent.
    const pid = d.personId.trim(), mine: Record<string, string> = {};
    if (firm && !pid) mine.personId = C.personNeeded; else if (pid && !isUuid(pid)) mine.personId = C.personIdWords;
    if (pid && !firm) mine.firmId = C.firmNeeded;
    if (Object.keys(mine).length) { setErrors(mine); setRefused((n) => n + 1); return; }
    setBusy(true); setErrors({});
    try { onLogged(Logged.parse(await systemApi("/register/requests", { method: "POST", json: logBody({ ...d, firmId: firm?.id ?? "" }) })).id); }
    catch (x) { setErrors(x instanceof SystemApiError && x.problem.fields ? requestFieldErrors(x.problem.fields) : { other: x instanceof SystemApiError ? x.message : C.logFailed }); setRefused((n) => n + 1); }
    finally { setBusy(false); }
  };
  const text = (k: "requester" | "requesterEmail" | "personId", label: string, type = "text") =>
    <Field label={label} error={errors[k]}><Input type={type} value={d[k]} onChange={(e) => put(k, e.target.value)} aria-invalid={errors[k] ? true : undefined} data-field={k} /></Field>;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={C.logTitle} description={C.logLead} guard returnFocus={returnFocus}
      footer={<><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="log-request" busy={busy} data-log-send>Log the request</Button></>}>
      <form id="log-request" ref={form} onSubmit={send} noValidate className="flex flex-col gap-4">
        <Field label="Type" error={errors.type}><Select value={d.type} onChange={(e) => put("type", e.target.value)} data-field="type">
          {REQUEST_TYPES.map((t) => <option key={t} value={t}>{TYPE_WORDS[t]}</option>)}</Select></Field>
        {text("requester", "Requester's name")}
        {text("requesterEmail", "Requester's email", "email")}
        <Field label="Received on" hint="The day it reached us (Toronto)." error={errors.receivedOn}>
          <Input type="date" value={d.receivedOn} max={torontoToday()} onChange={(e) => put("receivedOn", e.target.value)} aria-invalid={errors.receivedOn ? true : undefined} data-field="receivedOn" /></Field>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-xs font-medium text-text">About one person record (optional)</legend>
          <p className="text-xs text-text-muted">{C.personHint}</p>
          <OneFirm chosen={firm} onChange={(f) => { setFirm(f); setErrors(({ firmId: _g, ...r }) => r); }} error={errors.firmId} />
          {text("personId", "Person record id")}
        </fieldset>
        {errors.other ? <Notice tone="danger"><span data-log-error>{errors.other}</span></Notice> : null}
      </form>
    </Dialog>
  );
}

function Row({ r, today }: { r: DataRequest; today: string }) {
  const s = REQUEST_STATUS_WORDS[r.status], due = dueWords(r, today);
  return (
    <tr data-request-row={r.id} data-status={r.status}>
      <td className="whitespace-nowrap"><time dateTime={r.receivedOn}>{dayWords(r.receivedOn)}</time></td>
      <td className="min-w-48 [overflow-wrap:anywhere]"><Link to={`/system/privacy/requests/${r.id}`} className="text-text-link hover:underline">{r.requester}</Link>
        {r.firmId ? <span className="block text-xs text-text-muted">{firmWords({ id: r.firmId, name: r.firmName })}</span> : null}</td>
      <td>{TYPE_WORDS[r.type]}</td>
      <td className="whitespace-nowrap"><time dateTime={r.targetDate}>{dayWords(r.targetDate)}</time>{due ? <span className={cn("block text-xs", due.endsWith("late") ? "text-text-danger" : "text-text-muted")}>{due}</span> : null}</td>
      <td className="whitespace-nowrap"><span className={cn("font-medium", s.tone)} title={s.hint}><span aria-hidden>{s.mark} </span>{s.word}</span></td>
    </tr>
  );
}

function RequestsBody() {
  const token = useSystemToken(), me = useSystemStaff(), qc = useQueryClient(), go = useNavigate();
  const [status, setStatus] = React.useState<RequestStatus | null>(null), [open, setOpen] = React.useState(false);
  const list = useQuery({ queryKey: ["sys", "requests", status, token], enabled: !!token, retry: false,
    queryFn: async () => RequestList.parse(await systemApi(`/register/requests${status ? `?status=${status}` : ""}`)) });
  const logButton = React.useRef<HTMLButtonElement>(null);
  const refused = list.error instanceof SystemApiError ? list.error : null;
  const manage = me.keys.includes(DSR_KEY) && refused?.status !== 403;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["sys", "requests"] });
  const title = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h1 className="text-2xl font-semibold">{C.title}</h1><p className="mt-1 max-w-3xl text-sm text-text-muted">{C.lead}</p></div>
      {manage ? <Button ref={logButton} onClick={() => setOpen(true)} className="max-sm:min-h-11">Log a request</Button> : null}
    </header>
  );
  if (refused?.status === 403) return <div className="mx-auto flex max-w-7xl flex-col gap-4">{title}<Notice tone="danger" title="Not available"><span data-requests-error>{refused.message}</span></Notice></div>;
  const d = list.data, today = torontoToday();
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      {title}
      <div role="group" aria-label="Show requests by status" className="flex flex-wrap gap-2">
        {[null, ...REQUEST_STATUSES].map((x) => <Button key={x ?? "all"} variant={status === x ? "default" : "outline"} size="sm" aria-pressed={status === x} onClick={() => setStatus(x)} data-status-chip={x ?? "ALL"}>
          {x ? REQUEST_STATUS_WORDS[x].word : "All"}</Button>)}
      </div>
      {!d && !list.isError ? <p role="status" className="text-sm text-text-muted" data-loading>Loading the requests…</p>
        : list.isError ? <Notice tone="danger" title="Not available" action={<Button variant="outline" size="sm" onClick={() => void list.refetch()}>Retry</Button>}><span data-requests-error>{refused ? refused.message : C.loadFailed}</span></Notice>
          : !d!.requests.length ? <p data-requests-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">{status ? C.filteredEmpty : C.empty}</p>
            : <>
              <Table label="Data requests to us" head={["Received", "Requester", "Type", "Target date", "Status"]}>{d!.requests.map((r) => <Row key={r.id} r={r} today={today} />)}</Table>
              <p className="text-xs text-text-muted">{d!.truncated ? C.truncated : `${d!.requests.length} ${d!.requests.length === 1 ? "request" : "requests"}`}</p>
            </>}
      {manage ? <LogRequest open={open} onOpenChange={(o) => { setOpen(o); if (!o) refresh(); }} returnFocus={() => logButton.current}
        onLogged={(id) => { setOpen(false); refresh(); go(`/system/privacy/requests/${id}?logged=1`); }} /> : null}
    </div>
  );
}

export function RequestsPage() {
  return <SystemFrame crumbs={[{ label: "Data requests to us" }]}><RequestsBody /></SystemFrame>;
}
