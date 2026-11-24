// FO-5s part 1 (concept screens/fo-5s-retainer-signing r2 §4 S3, S4, S5; BR-3, BR-5, BR-6, BR-7, BR-8, BR-9, BR-17): one
// retainer's page, a sub-page of the prospect (Sales › Prospect › Retainer). Left: the agreement (template, signer,
// representative, fee rows with When) and its versions; right: Check before sending (what blocks Send on its field and in
// the summary, every other empty value marked "missing", BR-6), the Code s. 24(3) checklist line (FO-5b, never blocking,
// BR-17) and the one primary, Check and send, which opens the Send panel (S4). Every save is a new version (BR-9); a sent
// version never changes (BR-7): Edit on a sent one makes version n+1 in Draft, to be sent again. Once the client signed,
// Edit is gone (the server refuses a racing save too). Withdraw, Signed offline and Sign as the firm are later parts.
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FoldOut } from "@/components/fold-out";
import { Button, Field, Input, Notice, Panel, Pill, Select } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { can } from "../sales/contract";
import { Loading } from "../sales/loading";
import { SalesFrame, useStaff } from "../sales/sales-frame";
import { staffApi, StaffApiError, staffToken } from "../sales/session";
import { cad, centsIn, isNoFee, NO_FEE, EDITABLE, R_KEY, Representatives, Retainer, STATUS, TemplateChecklist, Templates, VALUE_LABELS, WHEN } from "./contract";

type Row = { label: string; amount: string; when: string; dueOn: string };
const rowsOf = (r: Retainer): Row[] => r.version.fees.map((f) => ({ label: f.label, amount: f.amountMinor === null ? "" : (Number(f.amountMinor) / 100).toFixed(2), when: f.when, dueOn: f.dueOn ?? "" }));
const when = (code: string) => WHEN.find(([k]) => k === code)?.[1] ?? code;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }) : "");
/** A company contact's role in words (review n3). */
const ROLE: Record<string, string> = { SIGNATORY: "Signatory", PRIMARY: "Primary contact", HR: "HR", BILLING: "Billing", OTHER: "Other" };
const BLOCKER_FIELD: Record<string, string> = { fees: "fo-fees", representativeStaffId: "fo-rep", "client.name": "fo-values", signerPersonId: "fo-signer" };
/** QA-780: the placeholder a potential conflict's disclosure prints through (Code s. 24(3)(o); gate.ts NO_DISCLOSURE). */
const DISCLOSURE = "conflict.disclosure";

function RetainerBody({ id }: { id: string }) {
  const me = useStaff(), qc = useQueryClient(), toast = useToast(), key = ["fo", "retainers", "one", id];
  const one = useQuery({ queryKey: key, retry: false, queryFn: async () => Retainer.parse(await staffApi(`/front-office/retainers/${encodeURIComponent(id)}`)) });
  const reps = useQuery({ enabled: can(me, R_KEY.draft), queryKey: ["fo", "retainer-representatives"], queryFn: async () => Representatives.parse(await staffApi("/front-office/retainer-representatives")) });
  const [editing, setEditing] = React.useState(false), [rows, setRows] = React.useState<Row[]>([]), [repId, setRepId] = React.useState(""), [signerId, setSignerId] = React.useState("");
  // QA-780: the draft's template can be changed (the PATCH takes templateId): the firm's active templates of this kind.
  const [templateId, setTemplateId] = React.useState("");
  const templates = useQuery({ enabled: can(me, R_KEY.draft), queryKey: ["fo", "retainer-templates", "all"], queryFn: async () => Templates.parse(await staffApi("/front-office/retainer-templates")) });
  const [error, setError] = React.useState<{ field: string | null; text: string; code?: string } | null>(null);
  const [sending, setSending] = React.useState(false), [showItems, setShowItems] = React.useState(false), [warnings, setWarnings] = React.useState<string[]>([]);
  const r = one.data;
  const reset = React.useCallback((x: Retainer) => { setRows(rowsOf(x)); setRepId(x.representativeStaffId); setSignerId(x.signerPersonId ?? ""); setTemplateId(x.template.id); }, []);
  React.useEffect(() => { if (r) reset(r); }, [r, reset]);
  const checklist = useQuery({ enabled: showItems && !!r, queryKey: ["fo", "retainer-template-checklist", r?.template.id], queryFn: async () => TemplateChecklist.parse(await staffApi(`/front-office/retainer-templates/${r!.template.id}/checklist`)) });
  const after = (x: Retainer, text: string) => { qc.setQueryData(key, x); void qc.invalidateQueries({ queryKey: ["fo", "retainers", "of"] }); setEditing(false); setError(null); setWarnings(x.warnings ?? []); toast.push({ tone: "ok", text }); };
  const fail = (e: unknown) => {
    const field = e instanceof StaffApiError ? (Object.keys(e.problem.fields ?? {})[0] ?? null) : null;
    setError({ field, text: e instanceof StaffApiError ? e.message : "Could not save. Please try again.", code: e instanceof StaffApiError ? e.problem.code : undefined });
    if (e instanceof StaffApiError && e.status === 409) void one.refetch();   // a colleague changed or sent it (break m1)
  };
  const save = useMutation({
    mutationFn: async (fees: unknown[]) => Retainer.parse(await staffApi(`/front-office/retainers/${id}`, { method: "PATCH", json: { expectedVersion: r!.version.n, expectedStatus: r!.status, representativeStaffId: repId, fees, ...(r!.subject === "COMPANY" && signerId ? { signerPersonId: signerId } : {}), ...(templateId && templateId !== r!.template.id ? { templateId } : {}) } })),
    onSuccess: (x) => after(x, `Saved as version ${x.version.n}.`), onError: fail,
  });
  const send = useMutation({
    mutationFn: async () => Retainer.parse(await staffApi(`/front-office/retainers/${id}/send`, { method: "POST", json: { expectedVersion: r!.version.n } })),
    onSuccess: (x) => { setSending(false); after(x, `Version ${x.version.n} sent.`); }, onError: (e) => { setSending(false); fail(e); },
  });
  const download = async (n: number) => {
    try {
      const l = await staffApi<{ url: string }>(`/front-office/retainers/${id}/download-link`, { method: "POST", json: { version: n } });
      const res = await fetch(l.url, { headers: { authorization: `Bearer ${staffToken()}` } });
      if (!res.ok) throw new Error();
      const a = document.createElement("a"); a.href = URL.createObjectURL(await res.blob()); a.download = `retainer-v${n}.docx`; a.click(); URL.revokeObjectURL(a.href);
    } catch { toast.push({ tone: "danger", text: "Could not download the file. Please try again." }); }
  };
  if (one.isPending) return <Loading label="Loading the retainer" rows={3} />;
  if (one.isError || !r) {
    const gone = one.error instanceof StaffApiError && one.error.status === 404;
    return <section className="mx-auto max-w-xl rounded-xl border border-border bg-surface-raised p-6"><h1 className="text-lg font-semibold">{gone ? "Retainer not found" : "Could not load the retainer"}</h1><p className="mt-1 text-sm text-text-muted">{gone ? "There is no such retainer in your firm, or it is not one you may see." : "Please try again."}</p><Link to="/front-office/pipeline" className="mt-3 inline-block text-sm text-text-link hover:underline">Back to Pipeline</Link></section>;
  }
  const v = r.version.values, s = STATUS[r.status] ?? { label: r.status, tone: "neutral", tip: "" };
  const client = String(v["client.name"] ?? "") || "the client", to = String(v["signer.email"] ?? v["client.email"] ?? "");
  const mayEdit = r.mayChange && can(me, R_KEY.draft) && EDITABLE.includes(r.status), draft = r.status === "DRAFT";
  const form = mayEdit && (draft || editing), next = r.version.n + 1;
  const changed = JSON.stringify(rows) !== JSON.stringify(rowsOf(r)) || repId !== r.representativeStaffId || (r.subject === "COMPANY" && !!signerId && signerId !== (r.signerPersonId ?? "")) || (!!templateId && templateId !== r.template.id);   // an empty pick is no change (break re-check)
  // QA-780: the templates a draft may be made from (active, this kind); the current one stays listed even when switched off.
  const listed = (templates.data ?? []).filter((t) => t.kind === r.kind && (t.active || t.id === r.template.id));
  const options = listed.some((t) => t.id === r.template.id) ? listed : [{ id: r.template.id, name: r.template.name ?? "(removed)", kind: r.kind, version: r.template.version, active: false, placeholders: undefined }, ...listed];
  const prints = (t: { placeholders?: string[] }) => !!t.placeholders?.includes(DISCLOSURE);
  const toTemplate = () => document.querySelector<HTMLElement>("#fo-template select")?.focus();
  const noDisclosure = error?.code === "CONFLICT_DISCLOSURE_NOT_PRINTED";
  const company = r.subject === "COMPANY", blocked = new Set([...(r.blockers["client.name"] ? ["client.name"] : []), ...(r.blockers.signerPersonId ? ["signer.name", "signer.email"] : [])]);
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const fees: unknown[] = [];
    for (const [i, x] of rows.entries()) {
      if (!x.label.trim()) return setError({ field: `fees[${i}].label`, text: `Fee row ${i + 1}: say what it is for.` });
      const c = centsIn(x.amount);
      if ("refused" in c) return setError({ field: `fees[${i}].amountMinor`, text: `Fee row ${i + 1}: ${c.refused}` });
      fees.push({ label: x.label.trim(), amountMinor: c.cents, when: x.when, dueOn: x.when === "ON_DATE" && x.dueOn ? x.dueOn : null });
    }
    setError(null); save.mutate(fees);
  };
  const fieldError = (f: string) => (error?.field === f ? error.text : null);
  const blockers = Object.entries(r.blockers), missing = new Set(r.missing);
  const setRow = (i: number, p: Partial<Row>) => { setRows((all) => all.map((x, j) => (j === i ? { ...x, ...p } : x))); setError(null); };
  const repName = (sid: string) => reps.data?.find((x) => x.staffId === sid)?.name ?? String(v["representative.name"] ?? "");
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-text [overflow-wrap:anywhere]">Retainer for {client}</h1>
        <Pill tone={s.tone} title={s.tip}><span data-retainer-status>{s.label}</span></Pill>
        <span className="text-sm text-text-muted" data-version>Version {r.version.n}</span>
        {r.prospect ? r.mayChange ? <Link to={`/front-office/prospects/${r.prospect.id}`} className="text-sm text-text-link hover:underline">{r.prospect.number}</Link> : <span className="text-sm text-text-muted">{r.prospect.number}</span> : null}
      </header>
      {draft && r.versions.some((x) => x.sentAt) ? <Notice tone="warn" title={`Version ${r.version.n} is not sent yet: ${client} cannot sign until you send it.`} /> : null}
      {r.status === "SENT" || r.status === "VIEWED" ? <Notice tone="info" title={`Waiting for ${client} to sign version ${r.version.n}.`}>{mayEdit ? "Edit makes a new version; the sent one stays as it was and the new one is sent again." : null}</Notice> : null}
      {!EDITABLE.includes(r.status) ? <Notice tone="info" title={r.status === "WITHDRAWN" ? "This retainer is withdrawn. Prepare a new one from the prospect." : `${client} has already signed. This retainer can no longer change.`} /> : null}
      {warnings.map((w) => <Notice key={w} tone="warn" title={w} />)}
      {error && !error.field && error.code !== "SEND_BLOCKED" ? <Notice tone="danger" title={error.text} action={noDisclosure && form ? (options.some(prints)
        ? <Button variant="link" size="sm" onClick={toTemplate}>Choose a template that prints it</Button>
        : <span className="text-sm">None of your firm's templates prints it yet. {can(me, "agent/retainer:configure-template") ? <Link to="/front-office/settings/retainer-templates" className="text-text-link hover:underline">Add {"{conflict.disclosure}"} to one in Retainer templates</Link> : "Ask your firm's Owner or Admin to add {conflict.disclosure} to a retainer template."}, then choose it here.</span>)
        : error.code?.startsWith("CONFLICT_") && r.prospect ? <Link to={`/front-office/prospects/${r.prospect.id}`} className="text-sm text-text-link hover:underline">Open the prospect's conflict check</Link> : undefined} /> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-labelledby="fo-agreement" className="rounded-xl border border-border bg-surface-raised p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="fo-agreement" className="text-sm font-semibold">Agreement</h2>
              {mayEdit && !draft && !editing ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button> : null}</div>
            <form onSubmit={submit} className="mt-3 flex flex-col gap-4" noValidate>
              <dl className="grid gap-1 text-sm sm:grid-cols-[9rem_1fr]">
                {!form ? <><dt className="text-text-muted">Template</dt><dd className="[overflow-wrap:anywhere]">{r.template.name ?? "(removed)"} · version {r.template.version}</dd></> : null}
                {!(form && company) ? <><dt className="text-text-muted">Signer</dt><dd id="fo-signer" tabIndex={-1} className="[overflow-wrap:anywhere]">{String(v["signer.name"] ?? "") || "Not chosen"}{to ? ` · ${to}` : ""}
                  {r.blockers.signerPersonId && EDITABLE.includes(r.status) ? <span className="block text-text-danger" data-blocker="signer">{r.blockers.signerPersonId}{!company && r.prospect && r.mayChange ? <> <Link to={`/front-office/prospects/${r.prospect.id}`} className="text-text-link hover:underline">Add it on {client}'s record</Link>, then save a new version here.</> : null}</span> : null}</dd></> : null}
                {!form ? <><dt className="text-text-muted">Representative</dt><dd>{repName(r.representativeStaffId)}</dd></> : null}
              </dl>
              {form ? <div id="fo-template"><Field label="Template" hint="The next version you save is made from this template." error={fieldError("templateId")}>
                <Select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setError(null); }}>{options.map((t) => <option key={t.id} value={t.id}>{t.name} · version {t.id === r.template.id ? r.template.version : t.version}{prints(t) ? " · prints the conflict disclosure" : ""}{t.active ? "" : " · switched off"}</option>)}</Select>
              </Field></div> : null}
              {form && company ? <div id="fo-signer"><Field label="Who signs" hint="One of the company's contacts. A signatory contact is chosen first; any contact may sign." error={fieldError("signerPersonId") ?? r.blockers.signerPersonId ?? null}>
                <Select value={signerId} onChange={(e) => { setSignerId(e.target.value); setError(null); }}><option value="">Choose who signs</option>{r.signerOptions.map((o) => <option key={o.personId} value={o.personId}>{o.name} · {ROLE[o.role] ?? o.role}{o.email ? ` · ${o.email}` : " · no email"}</option>)}</Select>
              </Field></div> : null}
              {form ? <div id="fo-rep"><Field label="Representative" hint="Only active people with a licence and the case-manager permissions." error={fieldError("representativeStaffId") ?? r.blockers.representativeStaffId ?? null}>
                <Select value={repId} onChange={(e) => { setRepId(e.target.value); setError(null); }}>{(reps.data ?? [{ staffId: r.representativeStaffId, name: repName(r.representativeStaffId) }]).map((x) => <option key={x.staffId} value={x.staffId}>{x.name}</option>)}</Select>
              </Field></div> : null}
              <fieldset id="fo-fees" tabIndex={-1} className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Fees (CAD)</legend>
                {r.blockers.fees ? <p className="text-sm text-text-danger" data-blocker="fees">{r.blockers.fees}</p> : null}
                {form ? rows.map((x, i) => (
                  <div key={i} data-fee-row={i + 1} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_8rem_10rem_auto]">
                    <Field label={`Fee ${i + 1}: what it is for`} error={fieldError(`fees[${i}].label`)}><Input value={x.label} maxLength={120} onChange={(e) => setRow(i, { label: e.target.value })} /></Field>
                    <Field label={`Fee ${i + 1}: amount`} error={fieldError(`fees[${i}].amountMinor`)}><Input inputMode="decimal" value={x.amount} onChange={(e) => setRow(i, { amount: e.target.value })} /></Field>
                    <Field label={`Fee ${i + 1}: when`} error={fieldError(`fees[${i}].when`)}>
                      <Select value={x.when} onChange={(e) => setRow(i, { when: e.target.value, dueOn: e.target.value === "ON_DATE" ? x.dueOn : "" })}>{WHEN.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                    </Field>
                    <Button type="button" variant="ghost" size="sm" className="self-end" aria-label={`Remove fee ${i + 1}`} onClick={() => setRows((all) => all.filter((_, j) => j !== i))}>Remove</Button>
                    {x.when === "ON_DATE" ? <Field label={`Fee ${i + 1}: due date`} error={fieldError(`fees[${i}].dueOn`)}><Input type="date" value={x.dueOn} onChange={(e) => setRow(i, { dueOn: e.target.value })} /></Field> : null}
                  </div>
                )) : <ul className="min-w-0 text-sm">{r.version.fees.map((f) => <li key={f.position} className="py-0.5 [overflow-wrap:anywhere]">{f.label}: {cad(f.amountMinor)} · {when(f.when)}{f.dueOn ? `, ${f.dueOn}` : ""}</li>)}</ul>}
                {form ? <Button type="button" variant="link" size="sm" className="self-start" onClick={() => setRows((all) => [...all, { label: "", amount: "", when: "ON_SIGNING", dueOn: "" }])}>Add a fee row</Button> : null}
              </fieldset>
              {form ? <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" variant={draft ? "outline" : "default"} busy={save.isPending} disabled={!changed}>Save as version {next}</Button>
                {!draft ? <Button type="button" variant="ghost" onClick={() => { setEditing(false); reset(r); setError(null); }}>Cancel</Button> : null}
                <span className="text-xs text-text-muted">{draft ? "Each save is a new version." : `Saving stops the link ${client} has for version ${r.version.n} (it stays as it was sent); version ${next} is then a draft you send again.`}</span>
              </div> : null}
            </form>
          </section>
          <section aria-labelledby="fo-versions" className="rounded-xl border border-border bg-surface-raised p-4">
            <h2 id="fo-versions" className="text-sm font-semibold">Versions</h2>
            <ol className="mt-2 flex flex-col divide-y divide-border text-sm" data-versions>
              {[...r.versions].reverse().map((x) => (
                <li key={x.n} data-version-row={x.n} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="font-medium">Version {x.n}</span>
                  {x.n === r.version.n ? <Pill tone="info">Current</Pill> : null}
                  <span className="text-text-muted">{x.sentAt ? `Sent ${day(x.sentAt)}` : "Not sent"}{x.endedAt ? ` · ${x.endReason === "UPDATED" ? "Replaced by a newer version" : "Ended"} ${day(x.endedAt)}` : ""}{x.note ? ` · ${x.note}` : ""}</span>
                  {can(me, R_KEY.download) ? <Button variant="link" size="sm" onClick={() => void download(x.n)} aria-label={`Download version ${x.n}`}>Download</Button> : null}
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside aria-labelledby="fo-check" className="flex flex-col gap-4 rounded-xl border border-border bg-surface-raised p-4">
          <h2 id="fo-check" className="text-sm font-semibold">Check before sending</h2>
          {blockers.length && mayEdit ? <div role="alert" data-error-summary className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm">
            <p className="font-medium">Before sending:</p>
            <ul className="mt-1 list-disc pl-5">{blockers.map(([f, t]) => <li key={f}><a href={`#${BLOCKER_FIELD[f] ?? "fo-values"}`} className="text-text-link hover:underline" onClick={(e) => { e.preventDefault(); const el = document.getElementById(BLOCKER_FIELD[f] ?? "fo-values"); (el?.querySelector<HTMLElement>("select, input") ?? el)?.focus(); }}>{t}</a></li>)}</ul>
          </div> : null}
          <dl id="fo-values" tabIndex={-1} className="grid grid-cols-[minmax(0,8rem)_1fr] gap-x-2 gap-y-1 text-sm" data-values>
            {VALUE_LABELS.filter(([k]) => k in v && (r.subject === "COMPANY" || k !== "company.name")).map(([k, l]) => (
              <React.Fragment key={k}><dt className="text-text-muted">{l}</dt><dd className="min-w-0 [overflow-wrap:anywhere]">{k === "fees.total" && isNoFee(v[k]) ? NO_FEE : v[k] ? String(v[k]) : blocked.has(k) && mayEdit ? <Pill tone="danger">blocks Send</Pill> : <span title={missing.has(k) ? `Not on ${client}'s record yet. You can send without it.` : "Not in this template."}><Pill tone={missing.has(k) ? "warn" : "neutral"}>{missing.has(k) ? "missing" : "empty"}</Pill></span>}</dd></React.Fragment>
            ))}
          </dl>
          {r.codeChecklist ? <section aria-labelledby="fo-code" data-code-checklist className="rounded-lg border border-border p-3 text-sm">
            <h3 id="fo-code" className="font-medium">Regulator's Code</h3>
            <p className="mt-1" data-code-line>{r.codeChecklist.line}</p>
            <p className="mt-1 text-xs text-text-muted">Shown to help you check; it never stops a send. {r.codeChecklist.legalReading}</p>
            <FoldOut className="mt-2" summaryClassName="text-xs text-text-muted" summary="Each item, marked or not"><ul className="mt-2 flex flex-wrap gap-1" aria-label="Code s. 24(3) items">{r.codeChecklist.items.map((i) => <li key={i.letter}><Pill tone={i.present ? "ok" : "neutral"} title={`s. ${i.section}: ${i.present ? "marked" : "not marked"} in this agreement's template`}>({i.letter}) {i.present ? "marked" : "not marked"}</Pill></li>)}</ul></FoldOut>
            <Button variant="link" size="sm" className="mt-1" onClick={() => setShowItems(true)}>See the items and how we check</Button>
          </section> : null}
          {draft && r.mayChange && can(me, R_KEY.send) ? <Button data-check-and-send onClick={() => (blockers.length ? document.querySelector<HTMLElement>("[data-error-summary] a")?.focus() : setSending(true))}>Check and send</Button> : null}
        </aside>
      </div>
      <Panel open={sending} onOpenChange={setSending} title={`Send to ${client} to sign`} description={`Version ${r.version.n}. Once sent, this version never changes.`}
        footer={<><Button variant="ghost" onClick={() => setSending(false)}>Cancel</Button><Button busy={send.isPending} onClick={() => send.mutate()}>Send to {client}</Button></>}>
        <dl className="grid grid-cols-[6rem_1fr] gap-1 text-sm"><dt className="text-text-muted">To</dt><dd className="[overflow-wrap:anywhere]">{to}</dd><dt className="text-text-muted">Version</dt><dd>{r.version.n}</dd><dt className="text-text-muted">Fees</dt><dd>{isNoFee(v["fees.total"]) ? NO_FEE : String(v["fees.total"] ?? "") || "No amount"}</dd></dl>
        <p className="mt-3 text-sm">{client} is asked to sign this version. After {client} signs, {repName(r.representativeStaffId)} signs for the firm.</p>
        {r.missing.length ? <p className="mt-2 text-sm text-text-muted">{r.missing.length} value{r.missing.length === 1 ? " is" : "s are"} missing. You can send without {r.missing.length === 1 ? "it" : "them"}.</p> : null}
      </Panel>
      <Panel open={showItems} onOpenChange={setShowItems} bodyLabel="The Code's items" title="The regulator's Code, s. 24(3)" description={checklist.data?.summary}>
        {checklist.isPending ? <Loading label="Loading the items" rows={3} /> : checklist.isError ? <Notice tone="danger" title="Could not load the items." /> : (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-xs text-text-muted">{checklist.data.source.line} · {checklist.data.legalReading}</p>
            <ol className="flex flex-col gap-2">{checklist.data.items.map((i) => <li key={i.letter} data-code-item={i.letter} className="rounded-lg border border-border p-2"><p><span className="font-medium">({i.letter}) s. {i.section}</span> <Pill tone={i.marked ? "ok" : "neutral"}>{i.marked ? "marked" : "not marked"}</Pill></p><p className="mt-1">{i.text}</p>{!i.marked ? <p className="mt-1 text-xs text-text-muted">How we check: {i.howWeCheck}</p> : null}</li>)}</ol>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function RetainerPage() {
  const { id = "" } = useParams();
  // Sales › Prospect › Retainer, back to the prospect once the retainer is read (the same query as the page; review m1).
  const r = useQuery({ queryKey: ["fo", "retainers", "one", id], retry: false, enabled: !!staffToken(), queryFn: async () => Retainer.parse(await staffApi(`/front-office/retainers/${encodeURIComponent(id)}`)) }).data;
  const back = r?.prospect && r.mayChange ? { to: `/front-office/prospects/${r.prospect.id}`, label: r.prospect.number } : { to: "/front-office/pipeline", label: "Pipeline" };
  return <SalesFrame crumbs={[{ label: back.label, to: back.to }, { label: "Retainer" }]} back={back}><RetainerBody id={id} /></SalesFrame>;
}
