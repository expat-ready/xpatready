// PF-21rs A1 (R1.86; concept r2 §4, board §2; SA-11-24, BR-1, BR-7; challenge m2, m3, m7): "Record a breach", over the
// Breaches list. A breach is recorded even with little known (only when it was discovered and what happened are needed);
// the firms are picked from our firm list (GET /api/system/firms?q=, after 300 ms and 2+ letters: each search writes one
// cross-firm read line), the data categories ticked, the rest optional now. The reason is the guard's own (@SystemReason),
// never pre-filled. One Idempotency-Key per opening, so a double click or a retry records once (STANDARDS §4). Every rule
// is the API's: its 422 field errors land under their fields, anything else above the buttons. Nothing is sent to anyone.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Button, Dialog, Field, Input, Notice, Textarea } from "@/components/ui/controls";
import { FirmsPage } from "../contract";
import { systemApi, SystemApiError, useSystemToken } from "../session";
import { CATEGORIES, COPY, fieldErrors, firmWords, localBox, recordBody, type RecordDraft } from "./contract";

type Firm = { id: string; name: string | null };
const blank = (): RecordDraft => ({ discoveredAt: localBox(new Date()), description: "", firms: [], categories: [], rootCause: "", containment: "", otherNotifications: "", reason: "" });
const Recorded = z.object({ id: z.string() });

function FirmPicker({ chosen, onChange, error }: { chosen: Firm[]; onChange: (f: Firm[]) => void; error?: string }) {
  const token = useSystemToken();
  const [q, setQ] = React.useState(""), [term, setTerm] = React.useState("");
  const box = React.useRef<HTMLInputElement>(null);
  // An added or removed firm's button goes away: the focus returns to the search box, never to the page (WCAG 2.4.3).
  const change = (f: Firm[]) => { onChange(f); box.current?.focus(); };
  React.useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const found = useQuery({ queryKey: ["sys", "firm-pick", term, token], enabled: !!token && term.length >= 2, retry: false,
    queryFn: async () => FirmsPage.parse(await systemApi(`/firms?q=${encodeURIComponent(term)}`)).firms.map((f) => ({ id: f.id, name: f.name })) });
  const left = (found.data ?? []).filter((f) => !chosen.some((c) => c.id === f.id));
  const say = q.trim().length > 0 && q.trim().length < 2 ? COPY.firmsSearchShort
    : found.isError ? (found.error instanceof SystemApiError ? found.error.message : COPY.firmsFailed)
      : term.length >= 2 && found.data && !found.data.length ? COPY.firmsNone : null;
  return (
    <fieldset className="flex flex-col gap-2" data-firm-picker>
      <legend className="text-xs font-medium text-text">Affected firms</legend>
      <p id="breach-firms-hint" className="text-xs text-text-muted">{COPY.firmsHint}</p>
      {chosen.length ? <ul aria-label="Chosen firms" className="flex flex-wrap gap-2">
        {chosen.map((f) => <li key={f.id} className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-0.5 text-sm" data-chosen-firm={f.id}>
          <span className="[overflow-wrap:anywhere]">{firmWords(f)}</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" aria-label={`Remove ${firmWords(f)}`} onClick={() => change(chosen.filter((c) => c.id !== f.id))}>Remove</Button></li>)}
      </ul> : null}
      <label className="flex flex-col gap-1"><span className="sr-only">Find a firm by name</span>
        <Input ref={box} type="search" placeholder="Find a firm by name" value={q} onChange={(e) => setQ(e.target.value)} aria-describedby="breach-firms-hint"
          aria-invalid={error ? true : undefined} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} data-firm-search /></label>
      {left.length ? <ul aria-label="Matching firms" className="flex flex-col gap-1">
        {left.slice(0, 8).map((f) => <li key={f.id}><Button type="button" variant="outline" size="sm" className="h-auto min-h-8 whitespace-normal text-left" onClick={() => change([...chosen, f])} data-add-firm={f.id}>Add {firmWords(f)}</Button></li>)}
      </ul> : null}
      <p role="status" className="text-xs text-text-muted">{say ?? (left.length > 8 ? COPY.firmsMore : "")}</p>
      {error ? <p role="alert" className="text-xs text-text-danger">{error}</p> : null}
    </fieldset>
  );
}

export function RecordBreach({ open, onOpenChange, onRecorded, returnFocus, onMaybeRecorded }: { open: boolean; onOpenChange: (o: boolean) => void; onRecorded: (id: string) => void; returnFocus: () => HTMLElement | null; onMaybeRecorded: () => void }) {
  const [d, setD] = React.useState<RecordDraft>(blank), [key, setKey] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({}), [busy, setBusy] = React.useState(false);
  const form = React.useRef<HTMLFormElement>(null), [refused, setRefused] = React.useState(0);
  // A fresh form and a fresh key each time it opens: a new breach is never a repeat of the last one.
  React.useEffect(() => { if (open) { setD(blank()); setKey(crypto.randomUUID()); setErrors({}); } }, [open]);
  // After a refusal the first field to change takes the focus (its words are read out with it).
  React.useEffect(() => { if (refused) form.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(); }, [refused]);
  // A changed field's refusal goes with the change (it no longer describes what is there).
  const field: Partial<Record<keyof RecordDraft, string>> = { firms: "affectedFirms", categories: "dataCategories" };
  const put = <K extends keyof RecordDraft>(k: K, v: RecordDraft[K]) => { setD((o) => ({ ...o, [k]: v }));
    const e = field[k] ?? k; setErrors((o) => { if (!(e in o)) return o; const { [e]: _gone, ...rest } = o; return rest; }); };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErrors({});
    try { onRecorded(Recorded.parse(await systemApi("/register/breaches", { method: "POST", json: recordBody(d), headers: { "idempotency-key": key } })).id); }
    catch (x) {
      // An earlier try's answer was lost, then the form changed: the key is spent, so the breach may be on the list already (review m1).
      if (x instanceof SystemApiError && x.problem.code === "IDEMPOTENCY_KEY_REUSED") { onMaybeRecorded(); setErrors({ other: COPY.maybeRecorded }); setRefused((n) => n + 1); return; }
      setErrors(x instanceof SystemApiError && x.problem.fields ? fieldErrors(x.problem.fields) : { other: x instanceof SystemApiError ? x.message : COPY.recordFailed }); setRefused((n) => n + 1); }
    finally { setBusy(false); }
  };
  const text = (k: "description" | "rootCause" | "containment" | "otherNotifications", label: string, hint?: string, rows = 2) =>
    <Field label={label} hint={hint} error={errors[k]}><Textarea rows={rows} value={d[k]} onChange={(e) => put(k, e.target.value)} data-field={k} /></Field>;
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={COPY.recordTitle} description={COPY.recordLead} wide guard returnFocus={returnFocus}
      footer={<><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button type="submit" form="record-breach" busy={busy} data-record-send>Record the breach</Button></>}>
      <form id="record-breach" ref={form} onSubmit={send} noValidate className="flex flex-col gap-4">
        <Field label="Discovered at" hint={COPY.discoveredHint} error={errors.discoveredAt}>
          <Input type="datetime-local" value={d.discoveredAt} max={localBox(new Date())} onChange={(e) => put("discoveredAt", e.target.value)} data-field="discoveredAt" /></Field>
        {text("description", "What happened", COPY.descriptionHint, 3)}
        <FirmPicker chosen={d.firms} onChange={(f) => put("firms", f)} error={errors.affectedFirms} />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-xs font-medium text-text">Data categories</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {CATEGORIES.map(([k, words]) => <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={d.categories.includes(k)} data-category={k}
                onChange={(e) => put("categories", e.target.checked ? [...d.categories, k] : d.categories.filter((c) => c !== k))} />{words}</label>)}
          </div>
          {errors.dataCategories ? <p role="alert" className="text-xs text-text-danger">{errors.dataCategories}</p> : null}
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-xs font-medium text-text">Optional now</legend>
          {text("rootCause", "Root cause")}{text("containment", "Containment")}{text("otherNotifications", "Other notifications made")}
        </fieldset>
        <Field label="Reason for the audit line" hint={COPY.reasonHint} error={errors.reason}>
          <Input value={d.reason} onChange={(e) => put("reason", e.target.value)} data-field="reason" /></Field>
        {errors.other ? <Notice tone="danger"><span data-record-error>{errors.other}</span></Notice> : null}
      </form>
    </Dialog>
  );
}
