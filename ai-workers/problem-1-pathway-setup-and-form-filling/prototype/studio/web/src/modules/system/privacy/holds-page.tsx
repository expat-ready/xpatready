// PF-21rs B2 (R1.85; concept r2 §4 "Legal holds", §5; SA-11-18, SA-11-34, BR-6, BR-7, BR-8; row W3, W5, W6; j_85 W4): our
// console's legal holds, /system/privacy/holds. One table from PF-21b part 2's `GET /api/system/register/holds` (newest
// first), Active / Released / All chips. "Hold a firm's data": the firm picked from our firm list, the whole firm by
// default, narrower scopes under Advanced, a reason the guard records (never pre-filled). Release asks its own reason and
// sits apart as a danger action. Without the key, the API's own 403 words, never an empty table.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, Field, Input, Notice, Select, Table } from "@/components/ui/controls";
import { SystemFrame, useSystemStaff } from "../frame";
import { systemApi, SystemApiError, useSystemToken } from "../session";
import { actorWords, firmWords, momentUtc } from "./contract";
import { OneFirm, type Firm } from "./one-firm";
import { coversWords, HOLD_CATEGORIES, HOLD_COPY as C, holdBody, holdFieldErrors, HoldList, LEGAL_HOLD_KEY, type Hold, type HoldDraft } from "./holds";

const blank = (): HoldDraft => ({ firmId: "", kind: "FIRM", id: "", category: HOLD_CATEGORIES[0][0], from: "", to: "", reason: "" });

function PlaceHold({ open, onOpenChange, onPlaced, returnFocus }: { open: boolean; onOpenChange: (o: boolean) => void; onPlaced: () => void; returnFocus: () => HTMLElement | null }) {
  const [d, setD] = React.useState<HoldDraft>(blank), [firm, setFirm] = React.useState<Firm | null>(null), [advanced, setAdvanced] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({}), [busy, setBusy] = React.useState(false), [refused, setRefused] = React.useState(0), form = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => { if (open) { setD(blank()); setFirm(null); setAdvanced(false); setErrors({}); } }, [open]);
  React.useEffect(() => { if (refused) form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(); }, [refused]);
  const put = <K extends keyof HoldDraft>(k: K, v: HoldDraft[K]) => { setD((o) => ({ ...o, [k]: v })); setErrors((o) => { if (!(k in o)) return o; const { [k]: _gone, ...rest } = o; return rest; }); };
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setBusy(true); setErrors({});
    try { await systemApi("/register/holds", { method: "POST", json: holdBody({ ...d, firmId: firm?.id ?? "", kind: advanced ? d.kind : "FIRM" }) }); onPlaced(); }
    catch (x) { setErrors(x instanceof SystemApiError && x.problem.fields ? holdFieldErrors(x.problem.fields) : { other: x instanceof SystemApiError ? x.message : C.failed }); setRefused((n) => n + 1); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={C.placeTitle} description={C.placeLead} guard returnFocus={returnFocus}
      footer={<><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="place-hold" busy={busy} data-place-send>Place the hold</Button></>}>
      <form id="place-hold" ref={form} onSubmit={send} noValidate className="flex flex-col gap-4">
        <OneFirm chosen={firm} onChange={(f) => { setFirm(f); setErrors(({ firmId: _g, ...r }) => r); }} error={errors.firmId} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} data-advanced />{C.advanced}</label>
        {advanced ? <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <Field label="Covers" error={errors.kind}><Select value={d.kind} onChange={(e) => put("kind", e.target.value as HoldDraft["kind"])} data-field="kind">
            <option value="FIRM">All of the firm's data</option><option value="PERSON">One person record</option><option value="CASE">One case</option><option value="CATEGORY">One data category</option><option value="DATE_RANGE">Records in a date range</option></Select></Field>
          {d.kind === "PERSON" || d.kind === "CASE" ? <Field label={d.kind === "PERSON" ? "Person record id" : "Case id"} hint={C.idHint} error={errors.id}><Input value={d.id} onChange={(e) => put("id", e.target.value)} data-field="id" /></Field> : null}
          {d.kind === "CATEGORY" ? <Field label="Data category" error={errors.category}><Select value={d.category} onChange={(e) => put("category", e.target.value)} data-field="category">
            {HOLD_CATEGORIES.map(([k, w]) => <option key={k} value={k}>{w}</option>)}</Select></Field> : null}
          {d.kind === "DATE_RANGE" ? <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" error={errors.from}><Input type="date" value={d.from} onChange={(e) => put("from", e.target.value)} data-field="from" /></Field>
            <Field label="To" error={errors.to}><Input type="date" value={d.to} onChange={(e) => put("to", e.target.value)} data-field="to" /></Field></div> : null}
        </div> : null}
        <Field label="Reason for the hold" hint={C.reasonHint} error={errors.reason}><Input value={d.reason} onChange={(e) => put("reason", e.target.value)} data-field="reason" /></Field>
        {errors.other ? <Notice tone="danger"><span data-place-error>{errors.other}</span></Notice> : null}
      </form>
    </Dialog>
  );
}

function ReleaseHold({ hold, onOpenChange, onReleased }: { hold: Hold | null; onOpenChange: (o: boolean) => void; onReleased: () => void }) {
  const [reason, setReason] = React.useState(""), [errors, setErrors] = React.useState<Record<string, string>>({}), [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (hold) { setReason(""); setErrors({}); } }, [hold]);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy || !hold) return; setBusy(true); setErrors({});
    try { await systemApi(`/register/holds/${hold.id}/release`, { method: "POST", json: { reason } }); onReleased(); }
    catch (x) { setErrors(x instanceof SystemApiError && x.problem.fields ? holdFieldErrors(x.problem.fields) : { other: x instanceof SystemApiError ? x.message : C.failed }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={!!hold} onOpenChange={onOpenChange} title={C.releaseTitle} description={hold ? `${firmWords({ id: hold.firmId, name: hold.firmName ?? null })}: ${coversWords(hold.scope)}. ${C.releaseLead}` : ""}
      returnFocus={() => document.getElementById("holds-heading")}
      footer={<><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="release-hold" variant="destructive" busy={busy} data-release-send>Release the hold</Button></>}>
      <form id="release-hold" onSubmit={go} noValidate className="flex flex-col gap-4">
        <Field label="Reason for the release" hint="Why it may be released: kept on the hold and on the audit line." error={errors.reason}><Input value={reason} onChange={(e) => setReason(e.target.value)} data-field="release-reason" /></Field>
        {errors.other ? <Notice tone="danger"><span data-release-error>{errors.other}</span></Notice> : null}
      </form>
    </Dialog>
  );
}

function HoldsBody() {
  const token = useSystemToken(), me = useSystemStaff(), qc = useQueryClient();
  const [state, setState] = React.useState<"active" | "released" | "all">("active"), [open, setOpen] = React.useState(false), [releasing, setReleasing] = React.useState<Hold | null>(null), [done, setDone] = React.useState<string | null>(null);
  const list = useQuery({ queryKey: ["sys", "holds", state, token], enabled: !!token, retry: false, queryFn: async () => HoldList.parse(await systemApi(`/register/holds?state=${state}`)) });
  const placeButton = React.useRef<HTMLButtonElement>(null);
  const refused = list.error instanceof SystemApiError ? list.error : null;
  const manage = me.keys.includes(LEGAL_HOLD_KEY) && refused?.status !== 403;
  const refresh = () => void qc.invalidateQueries({ queryKey: ["sys", "holds"] });
  const title = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h1 id="holds-heading" tabIndex={-1} className="text-2xl font-semibold outline-none">{C.title}</h1><p className="mt-1 max-w-3xl text-sm text-text-muted">{C.lead}</p>
        {done ? <p role="status" className="mt-1 text-sm text-text-ok" data-done>{done}</p> : null}</div>
      {manage ? <Button ref={placeButton} onClick={() => setOpen(true)} className="max-sm:min-h-11">Hold a firm's data</Button> : null}
    </header>
  );
  if (refused?.status === 403) return <div className="mx-auto flex max-w-7xl flex-col gap-4">{title}<Notice tone="danger" title="Not available"><span data-holds-error>{refused.message}</span></Notice></div>;
  const d = list.data;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      {title}
      <div role="group" aria-label="Show holds" className="flex flex-wrap gap-2">
        {(["active", "released", "all"] as const).map((x) => <Button key={x} variant={state === x ? "default" : "outline"} size="sm" aria-pressed={state === x} onClick={() => setState(x)} data-hold-chip={x}>{x === "active" ? "Active" : x === "released" ? "Released" : "All"}</Button>)}
      </div>
      {!d && !list.isError ? <p role="status" className="text-sm text-text-muted" data-loading>Loading the holds…</p>
        : list.isError ? <Notice tone="danger" title="Not available" action={<Button variant="outline" size="sm" onClick={() => void list.refetch()}>Retry</Button>}><span data-holds-error>{refused ? refused.message : C.loadFailed}</span></Notice>
          : !d!.holds.length ? <p data-holds-empty className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-muted">{state === "active" ? C.empty : state === "released" ? C.emptyReleased : C.emptyAll}</p>
            : <>
              <Table label="Legal holds" head={["Firm", "Covers", "Reason", "Placed", "Release"]}>
                {d!.holds.map((h) => <tr key={h.id} data-hold-row={h.id} data-active={h.active}>
                  <td className="min-w-32 [overflow-wrap:anywhere]">{firmWords({ id: h.firmId, name: h.firmName ?? null })}</td>
                  <td className="min-w-40">{coversWords(h.scope)}</td>
                  <td className="min-w-48 max-w-md [overflow-wrap:anywhere]">{h.reason}</td>
                  <td className="whitespace-nowrap text-sm"><time dateTime={h.placedAt}>{momentUtc(h.placedAt)}</time><span className="block text-xs text-text-muted">{actorWords(h.placedBy, h.placedByName ?? null)}</span></td>
                  <td className="min-w-40 text-sm">{h.active ? (manage ? <Button variant="outline" size="sm" className="text-text-danger" onClick={() => setReleasing(h)} aria-label={`Release the hold on ${firmWords({ id: h.firmId, name: h.firmName ?? null })}: ${coversWords(h.scope)}`}>Release</Button> : "Active")
                    : <span data-released><time dateTime={h.releasedAt ?? ""}>{h.releasedAt ? momentUtc(h.releasedAt) : ""}</time><span className="block text-xs text-text-muted [overflow-wrap:anywhere]">{actorWords(h.releasedBy ?? "", h.releasedByName ?? null)}{h.releaseReason ? `: ${h.releaseReason}` : ""}</span></span>}</td>
                </tr>)}
              </Table>
              <p className="text-xs text-text-muted">{d!.truncated ? C.truncated : `${d!.holds.length} ${d!.holds.length === 1 ? "hold" : "holds"}`}</p>
            </>}
      {manage ? <>
        <PlaceHold open={open} onOpenChange={(o) => { setOpen(o); if (!o) refresh(); }} returnFocus={() => placeButton.current} onPlaced={() => { setOpen(false); setDone(C.placed); setState("active"); refresh(); }} />
        <ReleaseHold hold={releasing} onOpenChange={(o) => { if (!o) { setReleasing(null); refresh(); } }} onReleased={() => { setReleasing(null); setDone(C.released); refresh(); }} />
      </> : null}
    </div>
  );
}

export function HoldsPage() {
  return <SystemFrame crumbs={[{ label: "Legal holds" }]}><HoldsBody /></SystemFrame>;
}
