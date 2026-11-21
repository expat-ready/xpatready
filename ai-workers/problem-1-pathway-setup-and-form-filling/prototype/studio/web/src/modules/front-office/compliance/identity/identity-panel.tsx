// FO-13s part 1 (brief lead-b-briefs/FO-13s.md Part B; concept screens/FO-13s/concept.md, BR-1..BR-9): the Identity check
// panel on a person's page. It lists the person's checks (FO-13i's `GET people/:personId/identity-checks`, newest first),
// records one in a side panel (multipart `POST`, one `requestId` per Save so a retry after a lost answer is the same
// check, BR-7), and opens a copy through FO-13i's short-lived link. The server holds every rule; the screen shows its
// words under the field they name (an expired document: FO-13i part 2's 422, the firm's own rule, P-735). While no check
// is recorded it says the retainer Send's warning, word for word (BR-9). Insert-only: no edit, no delete (BR-1).
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Panel, Select } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { endSession, setStaffToken, staffApi, StaffApiError, staffToken } from "@/modules/platform/session";
import { can, problemOf, type Me } from "../../sales/contract";
import { useLock, useReturnFocus } from "../../sales/prospect-actions";
import { useStaff } from "../../sales/sales-frame";
import { Loading } from "../../sales/loading";
import { arrivedLabel } from "../../sales/time";
import { COPY_MAX_BYTES, COPY_TOO_LARGE, DETAILS, detailLabel, DOCUMENT_TYPES, documentLabel, DownloadLink, ID_KEY, IdentityChecks, METHODS, methodLabel, noCheckLine, type IdentityCheck } from "./contract";

const path = (personId: string) => `/front-office/people/${encodeURIComponent(personId)}/identity-checks`;
const READ_ONLY_LINE = "A check is recorded on a lead or prospect page; this person's checks are listed here once recorded.";
const HIDDEN_REASON = "This person's identity checks are seen by whoever has their lead or prospect, or by everyone when your firm shares all leads.";
const SHOW_REASON = "Seeing identity checks needs a role that sees prospects: ask your firm's Owner or Admin.";
const RECORD_REASON = "Recording a check needs a role that works leads: ask your firm's Owner or Admin.";
/** A stored calendar date (YYYY-MM-DD) in words, formatted in UTC so it never moves a day (challenge m4). */
const EXPIRY = new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeZone: "UTC" });
const DISCARD = "Discard the details you typed?";
const PARTIAL_DATE = "Enter the whole date (day, month and year), or clear it.";
const COPY_REASON = "Opening a copy needs a role that may open documents.";

/** The multipart Save, with the session's bearer token and staffApi's refusal handling (a 401 ends the session here). */
async function postForm(p: string, form: FormData): Promise<unknown> {
  const token = staffToken();
  const res = await fetch(`/api${p}`, { method: "POST", headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: form });
  const text = await res.text();
  const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const problem = problemOf(data, res.status);
    if (res.status === 401 && staffToken() === token) { if (token) endSession(problem.code ?? "NOT_SIGNED_IN"); else setStaffToken(null); }
    throw new StaffApiError(res.status, problem);
  }
  return data;
}

/** Opens a check's copy: a short-lived link first, then its bytes with the bearer token, saved under the server's name. */
async function openCopy(checkId: string) {
  const link = DownloadLink.parse(await staffApi(`/front-office/identity-checks/${encodeURIComponent(checkId)}/copy/download-link`, { method: "POST" }));
  const token = staffToken();
  const res = await fetch(link.url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const t = await res.text(); let d: unknown = t; try { d = JSON.parse(t); } catch { /* text */ }
    const problem = problemOf(d, res.status);
    if (res.status === 401 && staffToken() === token) { if (token) endSession(problem.code ?? "NOT_SIGNED_IN"); else setStaffToken(null); }
    throw new StaffApiError(res.status, problem);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "identity-copy";
  const url = URL.createObjectURL(await res.blob()), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function CheckRow({ c, mayCopy }: { c: IdentityCheck; mayCopy: boolean }) {
  const toast = useToast();
  const copy = useMutation({ mutationFn: () => openCopy(c.id), onError: (e) => toast.push({ tone: "danger", text: e instanceof StaffApiError ? e.message : "Could not open the copy. Please try again." }) });
  const doc = c.documentType ? `${documentLabel(c.documentType)}, ${c.issuingCountry} ···${c.documentNumberLast4}` : "No document named";
  return (
    <li data-check={c.id} className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 font-medium [overflow-wrap:anywhere]">{methodLabel(c.method)}{c.methodDetail ? <span className="font-normal text-text-muted"> · {c.methodDetail}</span> : null}</p>
        <p className="text-xs text-text-muted"><span data-checked={c.checkedAt}>{arrivedLabel(c.checkedAt)}</span> by {c.checkedBy.name}</p>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[7rem_1fr]">
        <dt className="text-text-muted">Document</dt><dd data-doc className="min-w-0 [overflow-wrap:anywhere]">{doc}</dd>
        {c.documentType ? <><dt className="text-text-muted">Expires</dt><dd data-expiry>{c.documentExpiry ? EXPIRY.format(new Date(`${c.documentExpiry}T00:00:00Z`)) : "No expiry given"}</dd></> : null}
        <dt className="text-text-muted">Corroborated</dt><dd data-details>{c.details.map(detailLabel).join(", ")}</dd>
        <dt className="text-text-muted">Copy</dt>
        <dd>{!c.hasCopy ? <span className="text-text-muted">No copy</span>
          : mayCopy ? <Button size="sm" variant="link" className="h-auto p-0" busy={copy.isPending} data-open-copy onClick={() => copy.mutate()}>Open copy</Button>
          : <span className="text-text-muted" data-why-no-copy>{COPY_REASON}</span>}</dd>
      </dl>
    </li>
  );
}

type Errors = Record<string, string>;
const FIELD_LABEL: Record<string, string> = { method: "Method", methodDetail: "Note", documentType: "Document type", issuingCountry: "Issuing country", documentNumberLast4: "Last 4", documentExpiry: "Expiry date", copy: "Copy", details: "Details corroborated", requestId: "Save" };
const blank = () => ({ method: "IN_PERSON", methodDetail: "", documentType: "", issuingCountry: "", documentNumberLast4: "", documentExpiry: "", details: [] as string[] });   // nothing ticked: a detail is ticked by the person who corroborated it (challenge m1)

function RecordPanel({ open, onOpenChange, personId, name }: { open: boolean; onOpenChange: (o: boolean) => void; personId: string; name: string }) {
  const qc = useQueryClient(), toast = useToast(), lock = useLock();
  const [f, setF] = React.useState(blank), [file, setFile] = React.useState<File | null>(null), [errors, setErrors] = React.useState<Errors>({}), [general, setGeneral] = React.useState<string | null>(null);
  const requestId = React.useRef<string>(crypto.randomUUID()), body = React.useRef<HTMLFormElement>(null), fileInput = React.useRef<HTMLInputElement>(null), expiryInput = React.useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(f) !== JSON.stringify(blank()) || file !== null;
  React.useEffect(() => { if (open) { setF(blank()); setFile(null); setErrors({}); setGeneral(null); requestId.current = crypto.randomUUID(); } }, [open]);
  const set = (k: keyof ReturnType<typeof blank>, v: string | string[]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => { const { [k]: _gone, ...rest } = e; return rest; }); };
  // After the refusal has rendered and the form is enabled again, the first field in error takes focus (BIC-13).
  const [focusTick, setFocusTick] = React.useState(0);
  React.useEffect(() => { if (focusTick) body.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [focusTick]);
  const focusFirstError = () => setFocusTick((n) => n + 1);
  const save = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append("requestId", requestId.current);
      form.append("method", f.method);
      if (f.methodDetail.trim()) form.append("methodDetail", f.methodDetail.trim());
      for (const k of ["documentType", "issuingCountry", "documentNumberLast4", "documentExpiry"] as const) if (f[k].trim()) form.append(k, f[k].trim());
      form.append("details", f.details.join(","));
      if (file) form.append("copy", file, file.name);
      return postForm(path(personId), form);
    },
    onSuccess: () => { toast.push({ tone: "ok", text: "Identity check recorded." }); void qc.invalidateQueries({ queryKey: ["fo", "identity-checks", personId] }); onOpenChange(false); },
    onError: (e) => {
      if (e instanceof StaffApiError) {
        if (e.problem.code === "REQUEST_REUSED") requestId.current = crypto.randomUUID();   // the server says: start a new Save
        const fields = e.problem.fields ?? {};
        setErrors(fields); setGeneral(Object.keys(fields).length ? null : e.message);
        if (Object.keys(fields).length) focusFirstError();
      } else setGeneral("Could not reach the server. Your details are kept: Save again to retry the same check.");
    },
    onSettled: () => lock.free(),
  });
  const submit = (ev?: React.FormEvent) => {
    ev?.preventDefault();
    // A half-typed date reads as empty: refused here, never saved as "no expiry" (break MJ-2).
    if (expiryInput.current?.validity.badInput) { setErrors({ documentExpiry: PARTIAL_DATE }); focusFirstError(); return; }
    if (file && file.size > COPY_MAX_BYTES) { setErrors({ copy: COPY_TOO_LARGE }); focusFirstError(); return; }
    if (lock.take()) save.mutate();
  };
  const toggle = (code: string, on: boolean) => set("details", on ? [...f.details, code] : f.details.filter((d) => d !== code));
  return (
    <Panel open={open} onOpenChange={(o) => { if (!save.isPending) onOpenChange(o); }} title="Record an identity check" description={name || undefined}
      confirmClose={() => !dirty || window.confirm(DISCARD)}
      footer={<><Button variant="ghost" disabled={save.isPending} onClick={() => { if (!dirty || window.confirm(DISCARD)) onOpenChange(false); }}>Cancel</Button><Button busy={save.isPending} type="submit" form="fo-identity-form">Save check</Button></>}>
      <form id="fo-identity-form" ref={body} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {general ? <Notice tone="danger" title={general} /> : null}
        {Object.keys(errors).length ? (
          <div data-error-summary><Notice tone="danger" title="There is a problem">
            <ul className="list-disc pl-4">{Object.entries(errors).map(([k, v]) => <li key={k}>{FIELD_LABEL[k] ?? k}: {v}</li>)}</ul>
          </Notice></div>
        ) : null}
        <Field label="Method" error={errors.method}>
          <Select value={f.method} onChange={(e) => set("method", e.target.value)} disabled={save.isPending}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <Field label={f.method === "OTHER" ? "How was it done?" : "Note (optional)"} hint="How the check was done. Never a document number." error={errors.methodDetail}>
          <Input value={f.methodDetail} maxLength={500} onChange={(e) => set("methodDetail", e.target.value)} disabled={save.isPending} />
        </Field>
        <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-medium">Document</legend>
          <Field label={f.method === "DOCUMENT_COPY" ? "Document type" : "Document type (optional)"} error={errors.documentType}>
            <Select value={f.documentType} onChange={(e) => set("documentType", e.target.value)} disabled={save.isPending}><option value="">None</option>{DOCUMENT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Issuing country (optional)" hint="Two letters, e.g. CA or IN." error={errors.issuingCountry}>
              <Input value={f.issuingCountry} maxLength={2} autoComplete="off" className="uppercase" onChange={(e) => set("issuingCountry", e.target.value.toUpperCase())} disabled={save.isPending} />
            </Field>
            <Field label="Last 4 of the number (optional)" hint="Only the last 4 characters. Never type the full number." error={errors.documentNumberLast4}>
              <Input value={f.documentNumberLast4} maxLength={4} autoComplete="off" onChange={(e) => set("documentNumberLast4", e.target.value)} disabled={save.isPending} />
            </Field>
          </div>
          <Field label="Expiry date (optional)" error={errors.documentExpiry}>
            <Input ref={expiryInput} type="date" value={f.documentExpiry} onChange={(e) => set("documentExpiry", e.target.value)} disabled={save.isPending} />
          </Field>
          <Field label="Copy (optional)" hint="PDF, JPEG or PNG, at most 10 MB." error={errors.copy}>
            <Input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErrors((x) => { const { copy: _c, ...rest } = x; return rest; }); }} disabled={save.isPending} />
          </Field>
        </fieldset>
        <fieldset aria-describedby={errors.details ? "fo-identity-details-error" : undefined} aria-invalid={errors.details ? true : undefined} tabIndex={errors.details ? -1 : undefined} className="flex flex-col gap-2 outline-none">
          <legend className="text-xs font-medium">Details corroborated</legend>
          {DETAILS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={f.details.includes(k)} onChange={(e) => toggle(k, e.target.checked)} disabled={save.isPending} />{l}</label>
          ))}
          {errors.details ? <p id="fo-identity-details-error" role="alert" className="text-xs text-text-danger">{errors.details}</p> : null}
        </fieldset>
      </form>
    </Panel>
  );
}

/** The Identity check section of a person's page. `name` is the person's name as stored (empty when none). Outside the
 *  sales frame (the client page) the caller passes its own `me`; `readOnly` lists the checks without Record a check,
 *  because a check is recorded on the lead or prospect page, before the retainer is sent (FO-13s part 2, QA-610). */
export function IdentityCheckPanel({ personId, name, me: given, readOnly = false }: { personId: string; name: string; me?: Me | null; readOnly?: boolean }) {
  const framed = useStaff(), me = given ?? framed, focus = useReturnFocus();
  const [open, setOpen] = React.useState(false);
  const maySee = can(me, ID_KEY.show);
  const list = useQuery({ queryKey: ["fo", "identity-checks", personId], retry: false, enabled: maySee, queryFn: async () => IdentityChecks.parse(await staffApi(path(personId))) });
  const mayRecord = !readOnly && can(me, ID_KEY.record), mayCopy = can(me, ID_KEY.copy);
  // A viewer without the list's key is told so without asking (review S3); the server's 403 says the same. On the
  // read-only client page a 404 means the person's lead or prospect is another person's while the firm does not share
  // all leads (review M1): a plain line, not an error with a Try again that cannot help.
  const forbidden = !maySee || (list.error instanceof StaffApiError && list.error.status === 403);
  const hidden = readOnly && list.error instanceof StaffApiError && list.error.status === 404;
  const panel = (o: boolean) => { if (o) focus.mark(); else focus.back(); setOpen(o); };
  return (
    <section aria-labelledby="fo-identity" data-identity-panel className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fo-identity" className="text-sm font-semibold">Identity check</h2>
        {mayRecord ? <Button size="sm" variant="outline" data-record-check onClick={() => panel(true)}>Record a check</Button> : null}
      </div>
      {forbidden ? <p className="mt-2 text-sm text-text-muted" data-identity-forbidden>{SHOW_REASON}</p>
        : list.isPending ? <div className="mt-2"><Loading label="Loading the identity checks" rows={1} /></div>
        : hidden ? <p className="mt-2 text-sm text-text-muted" data-identity-hidden>{HIDDEN_REASON}</p>
        : list.isError ? (
          <Notice tone="danger" className="mt-2" title={list.error instanceof StaffApiError ? list.error.message : "Could not load the identity checks."} action={<Button size="sm" variant="outline" onClick={() => void list.refetch()}>Try again</Button>} />
        ) : list.data.checks.length === 0 ? (
          <div className="mt-2" data-no-check>
            <Notice tone="warn" title={noCheckLine(name)}>{readOnly ? READ_ONLY_LINE : mayRecord ? "Record a check before the retainer is sent." : RECORD_REASON}</Notice>
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" aria-label="Identity checks, newest first">{list.data.checks.map((c) => <CheckRow key={c.id} c={c} mayCopy={mayCopy} />)}</ul>
        )}
      {mayRecord ? <RecordPanel open={open} onOpenChange={panel} personId={personId} name={name} /> : null}
    </section>
  );
}
