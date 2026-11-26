// PF-10s (R1.35; concept §4 steps 1-3, running and result; BR-1..BR-6; challenge B1, M1, M2, m1): New import in three
// steps. (1) File: People, where it comes from, the CSV. (2) Columns: each column, its first three values, "Import as"
// (one column per field), the saved-mapping banner, the consent declaration, the Owner's attestation. (3) Preview: the
// totals as filter chips, each row's outcome and its reason in words, "Import N people" bound to that preview. Import
// queues the run (a background job); the page reads the batch every 2 s, offers Continue import after 60 s without a new
// row (each row is written once), then the result. Every rule is the server's; a refusal is shown with its words.
import * as React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Pill, Select, Table } from "@/components/ui/controls";
import { EmptyState } from "@/components/ui/empty-state";
import { Loading } from "@/modules/front-office/sales/loading";
import { cn } from "@/lib/utils";
import { PlatformFrame, usePlatformStaff } from "../frame";
import { staffApi, StaffApiError } from "../session";
import { useTargets } from "./imports-page";
import { Attestation, Batch, consentMapped, COPY, doneWords, importWords, KEY, OUTCOME_WORDS, Rows, runBlocked, stateWords, stepOf, TIPS, usedElsewhere, type Columns, type Outcome } from "./contract";

const errorOf = (e: unknown, fallback: string) => (e instanceof StaffApiError ? e.message : fallback);
const STEPS = ["File", "Columns", "Preview"] as const;
function Steps({ at }: { at: 0 | 1 | 2 | 3 }) {
  return (
    <ol aria-label="Steps" className="flex flex-wrap gap-2 text-sm">
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? "step" : undefined} className={cn("rounded-full border px-3 py-1", i === at ? "border-primary bg-primary/10 font-medium text-text-link" : i < at ? "border-border text-text" : "border-border text-text-muted")}>
          {i + 1}. {s}
        </li>
      ))}
    </ol>
  );
}
function NoAccess() { return <EmptyState data-no-access title={COPY.noAccess} description={COPY.noAccessAsk} titleLevel={1} />; }

// ------------------------------------------------------------------------------------------------ step 1: the file
function FileStep() {
  const navigate = useNavigate();
  const targets = useTargets(true);
  const people = targets.data?.targets.find((t) => t.key === "person");
  const [source, setSource] = React.useState(""), [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false), [err, setErr] = React.useState<{ source?: string; file?: string; form?: string }>({});
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof err = {};
    if (!source.trim()) next.source = "Name where the file comes from.";
    if (!file) next.file = "Choose a CSV file.";
    setErr(next); if (next.source || next.file || !people) return;
    setBusy(true);
    try {
      const b = await staffApi<{ id: string; mappingFrom?: string }>(`/platform/imports?target=${encodeURIComponent(people.key)}&source=${encodeURIComponent(source.trim())}`, { method: "POST", csv: file! });
      navigate(`/platform/import/${b.id}${b.mappingFrom === "saved" ? "?mapping=saved" : ""}`);   // in the address: the workspace tabs keep their own history state
    } catch (x) {
      const field = x instanceof StaffApiError ? x.field("source") : null;
      setErr(field ? { source: field } : { file: errorOf(x, "The file could not be uploaded. Try again.") });
    } finally { setBusy(false); }
  };
  if (targets.isPending) return <Loading label="Loading" />;
  if (!people) return <Notice tone="warn" title="Nothing to import into yet">People cannot be imported on this copy.</Notice>;
  return (
    <form onSubmit={(e) => void submit(e)} className="flex max-w-xl flex-col gap-4" data-step="file" noValidate>
      <div className="flex flex-col gap-1"><span className="text-xs font-medium text-text">What you are importing</span><span className="text-sm text-text" data-target>{people.label}</span></div>
      <Field label="Where it comes from" hint={err.source ? undefined : "For example \"Old CRM\". The column choices are remembered for this source."} error={err.source}>
        <Input value={source} maxLength={200} onChange={(e) => setSource(e.target.value)} data-source />
      </Field>
      <Field label="CSV file" hint={err.file ? undefined : COPY.limits} error={err.file}>
        <Input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-file />
      </Field>
      <div><Button type="submit" busy={busy} data-upload>Next: columns</Button></div>
    </form>
  );
}

// ------------------------------------------------------------------------------------------------ rows table
function RowsTable({ b, phase }: { b: Batch; phase: "DRY_RUN" | "RUN" }) {
  const [outcome, setOutcome] = React.useState<Outcome | null>(null), [page, setPage] = React.useState(1);
  const rows = useQuery({ queryKey: ["pf", "imports", b.id, "rows", phase, b.dryRunHash, b.state, outcome, page],
    queryFn: async () => Rows.parse(await staffApi(`/platform/imports/${b.id}/rows?page=${page}${outcome ? `&outcome=${outcome}` : ""}`)) });
  const pages = rows.data ? Math.max(1, Math.ceil(rows.data.total / rows.data.pageSize)) : 1;
  const words = phase === "RUN" ? "run" : "preview";
  const reason = (r: Rows["rows"][number]) => r.reasons.length ? r.reasons.map((x) => x.words).join("; ")
    : r.outcome === "CREATE" ? (phase === "RUN" ? `Imported from ${b.sourceName}` : "A new person") : r.outcome === "MERGE" ? "Fills only empty fields" : "Nothing new";
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Which rows" className="flex flex-wrap gap-2">
        {(["CREATE", "MERGE", "SKIP", "ERROR"] as const).map((o) => (
          <button key={o} type="button" aria-pressed={outcome === o} title={TIPS[o]} data-chip={o} onClick={() => { setOutcome(outcome === o ? null : o); setPage(1); }}
            className={cn("min-h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", outcome === o ? "border-primary bg-primary/10 font-medium text-text-link" : "border-border bg-surface-raised text-text hover:bg-text/5")}>
            {OUTCOME_WORDS[o][words]} <span data-count className="ml-1 font-semibold">{b.totals[o]}</span>
          </button>
        ))}
      </div>
      {rows.isPending ? <Loading label="Loading rows" />
        : rows.isError ? <p role="alert" className="text-sm text-text-danger">{errorOf(rows.error, "Could not load the rows.")}</p>
          : !rows.data.rows.length ? <p className="text-sm text-text-muted" data-no-rows>{COPY.noRows}</p>
            : (
              <Table label={phase === "RUN" ? "Rows imported" : "Rows in the preview"} head={["Row", "Outcome", phase === "RUN" ? "What happened" : "Reason"]} dense>
                {rows.data.rows.map((r) => (
                  <tr key={r.row} data-row={r.row} data-outcome={r.outcome}>
                    <td className="tabular-nums">{r.row}</td>
                    <td><Pill tone={OUTCOME_WORDS[r.outcome].tone} title={TIPS[r.outcome]}>{OUTCOME_WORDS[r.outcome][words]}</Pill></td>
                    <td data-reason>{reason(r)}</td>
                  </tr>
                ))}
              </Table>
            )}
      {pages > 1 ? <div className="flex items-center gap-2 text-xs text-text-muted"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} of {pages}</span><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div> : null}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ step 2: columns
function AttestationBox({ onDone }: { onDone: () => void }) {
  const att = useQuery({ queryKey: ["pf", "imports", "attestation"], queryFn: async () => Attestation.parse(await staffApi("/platform/imports/attestation")) });
  const [tick, setTick] = React.useState(false), [busy, setBusy] = React.useState(false), [err, setErr] = React.useState<string | null>(null);
  if (!att.data || att.data.current) return null;
  if (!att.data.canAttest) return <div data-attest-wait><Notice tone="warn">{COPY.adminWait}</Notice></div>;
  const confirm = async () => {
    if (!tick) { setErr("Tick the box to confirm."); return; }
    setBusy(true); setErr(null);
    try { await staffApi("/platform/imports/attestation", { method: "POST", json: { version: att.data!.wording.version, confirm: true } }); await att.refetch(); onDone(); }
    catch (x) { setErr(errorOf(x, "Could not record your confirmation. Try again.")); } finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="attest-h" className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-4" data-attest>
      <h2 id="attest-h" className="text-sm font-semibold text-text">Confirm once for your firm (Owner)</h2>
      <label className="flex items-start gap-2 text-sm text-text"><input type="checkbox" className="mt-1" checked={tick} onChange={(e) => setTick(e.target.checked)} aria-invalid={err ? true : undefined} data-attest-tick />{att.data.wording.words}</label>
      <details className="text-xs text-text-muted"><summary className="cursor-pointer">Details</summary>{att.data.wording.unconfirmed}. Wording version {att.data.wording.version}.</details>
      {err ? <p role="alert" className="text-xs text-text-danger">{err}</p> : null}
      <div><Button variant="outline" size="sm" busy={busy} onClick={() => void confirm()} data-attest-confirm>Confirm</Button></div>
    </section>
  );
}

function ColumnsStep({ b, columns, setColumns, declared, setDeclared, onPreviewed, savedFrom }: { b: Batch; columns: Columns; setColumns: (c: Columns) => void; declared: boolean; setDeclared: (d: boolean) => void; /** Back to the preview step (after a fresh preview, or to look at the last one: BR-2 then shows why Import waits). */ onPreviewed: () => void; savedFrom: boolean }) {
  const targets = useTargets(true), qc = useQueryClient();
  const t = targets.data?.targets.find((x) => x.key === b.target);
  const [busy, setBusy] = React.useState(false), [err, setErr] = React.useState<string | null>(null), [declErr, setDeclErr] = React.useState<string | null>(null);
  if (!t) return <Loading label="Loading" />;
  const needsDecl = consentMapped(columns, t.fields);
  const preview = async () => {
    setErr(null); setDeclErr(null);
    if (needsDecl && !declared) { setDeclErr("A consent column is mapped: tick the declaration, or choose \"Don't import\" for that column."); return; }
    if (!Object.values(columns).some(Boolean)) { setErr("Map at least one column."); return; }
    setBusy(true);
    try {
      await staffApi(`/platform/imports/${b.id}/dry-run`, { method: "POST", json: { columns, declared: needsDecl && declared } });
      await qc.invalidateQueries({ queryKey: ["pf", "imports", b.id] }); onPreviewed();
    } catch (x) {
      if (x instanceof StaffApiError && x.problem.code === "DECLARATION_NEEDED") setDeclErr(x.message); else setErr(errorOf(x, "The preview could not be made. Try again."));
    } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-4" data-step="columns">
      {savedFrom ? <div data-saved-mapping><Notice tone="info">Mapping from your last import from {b.sourceName}.</Notice></div> : null}
      <p className="text-sm text-text-muted">{b.rows} row{b.rows === 1 ? "" : "s"} in the file. Choose what each column is; one column per field.</p>
      <Table label="Columns of the file" head={["Column", "First values", "Import as"]}>
        {b.header.map((h, i) => {
          const used = usedElsewhere(columns, h), id = `col-${i}`;
          return (
            <tr key={h} data-column={h}>
              <td className="max-w-48 font-medium"><label htmlFor={id} className="block truncate" title={h}>{h}</label></td>
              <td className="max-w-64 text-xs text-text-muted"><span className="block truncate">{b.sample.map((r) => r[i] ?? "").filter((v) => v !== "").slice(0, 3).join(" · ") || "—"}</span></td>
              <td className="min-w-48">
                <Select id={id} value={columns[h] ?? ""} onChange={(e) => setColumns({ ...columns, [h]: e.target.value || null })} data-import-as={h}>
                  <option value="">Don't import</option>
                  {t.fields.map((f) => <option key={f.key} value={f.key} disabled={used.has(f.key)}>{f.label}{used.has(f.key) ? " (used)" : ""}</option>)}
                </Select>
              </td>
            </tr>
          );
        })}
      </Table>
      {t.fields.filter((f) => f.help && Object.values(columns).includes(f.key)).map((f) => <p key={f.key} className="text-xs text-text-muted">{f.label}: {f.help}</p>)}
      {needsDecl ? (
        <div className="flex flex-col gap-1" data-declaration>
          <label className="flex items-start gap-2 text-sm text-text"><input type="checkbox" className="mt-1" checked={declared} onChange={(e) => setDeclared(e.target.checked)} aria-invalid={declErr ? true : undefined} aria-describedby={declErr ? "decl-err" : undefined} data-declare />{targets.data!.declaration}</label>
          {declErr ? <p id="decl-err" role="alert" className="text-xs text-text-danger">{declErr}</p> : null}
        </div>
      ) : null}
      {t.personalData ? <AttestationBox onDone={() => void qc.invalidateQueries({ queryKey: ["pf", "imports", b.id] })} /> : null}
      {err ? <p role="alert" className="text-sm text-text-danger">{err}</p> : null}
      <div className="flex flex-wrap gap-3">
        <Button busy={busy} onClick={() => void preview()} data-preview>{b.dryRunHash ? "Preview again" : "Preview"}</Button>
        {b.dryRunHash ? <Button variant="outline" onClick={onPreviewed} data-to-preview>Back to the last preview</Button> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ step 3: preview
function PreviewStep({ b, columns, declared, back }: { b: Batch; columns: Columns; declared: boolean; back: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false), [err, setErr] = React.useState<string | null>(null);
  const blocked = runBlocked(b, columns, declared);
  const run = async () => {
    setBusy(true); setErr(null);
    try { await staffApi(`/platform/imports/${b.id}/run`, { method: "POST", json: { dryRunHash: b.dryRunHash } }); await qc.invalidateQueries({ queryKey: ["pf", "imports", b.id] }); }
    catch (x) { setErr(errorOf(x, "The import could not start. Try again.")); await qc.invalidateQueries({ queryKey: ["pf", "imports", b.id] }); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-4" data-step="preview">
      <p className="text-sm text-text-muted">{COPY.mergeNote}</p>
      <RowsTable b={b} phase="DRY_RUN" />
      {err ? <p role="alert" className="text-sm text-text-danger">{err}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void run()} busy={busy} disabled={!!blocked} aria-describedby={blocked ? "run-why" : undefined} data-run>{importWords(b)}</Button>
        <Button variant="outline" onClick={back} data-back>Back to columns</Button>
        {blocked ? <span id="run-why" className="text-sm text-text-warn" data-run-why>{blocked}</span> : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ running and result
function Running({ b }: { b: Batch }) {
  const written = b.totals.CREATE + b.totals.MERGE + b.totals.SKIP + b.totals.ERROR;
  const last = React.useRef({ n: written, at: Date.now() }), [stalled, setStalled] = React.useState(false), [busy, setBusy] = React.useState(false), [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => { if (written !== last.current.n) { last.current = { n: written, at: Date.now() }; setStalled(false); } }, [written]);
  React.useEffect(() => { const t = setInterval(() => setStalled(Date.now() - last.current.at >= 60_000), 2_000); return () => clearInterval(t); }, []);
  const again = async () => {
    setBusy(true); setErr(null);
    try { await staffApi(`/platform/imports/${b.id}/run`, { method: "POST", json: { dryRunHash: b.dryRunHash } }); last.current = { n: written, at: Date.now() }; setStalled(false); }
    catch (x) { setErr(errorOf(x, "Could not continue. Try again.")); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-3" data-step="running" role="status">
      <p className="text-sm text-text">Importing… <span data-written>{written}</span> of {b.rows} rows written.</p>
      {stalled ? <Notice tone="warn" action={<Button size="sm" busy={busy} onClick={() => void again()} data-continue>{COPY.continue}</Button>}>{COPY.stalled}</Notice> : null}
      {err ? <p role="alert" className="text-sm text-text-danger">{err}</p> : null}
    </div>
  );
}

function Result({ b }: { b: Batch }) {
  const navigate = useNavigate();
  const s = stateWords(b.state, b.counts);
  return (
    <div className="flex flex-col gap-4" data-step="result">
      <Notice tone={b.state === "COMPLETED" ? "ok" : b.state === "PARTIAL" ? "warn" : "info"} title={s.text}><span data-done>{doneWords(b.counts)}</span></Notice>
      <RowsTable b={b} phase="RUN" />
      <div><Button variant="outline" onClick={() => navigate("/platform/import")}>Back to imports</Button></div>
    </div>
  );
}

function BatchBody({ id }: { id: string }) {
  const me = usePlatformStaff(), [params] = useSearchParams();
  const runs = me.keys.includes(KEY.run);
  const batch = useQuery({ queryKey: ["pf", "imports", id, "view"], queryFn: async () => Batch.parse(await staffApi(`/platform/imports/${id}`)),
    refetchInterval: (q) => (q.state.data?.state === "RUNNING" ? 2_000 : false) });
  const [columns, setColumns] = React.useState<Columns | null>(null), [declared, setDeclared] = React.useState(false), [onColumns, setOnColumns] = React.useState(false);
  const b = batch.data;
  React.useEffect(() => { if (b && columns === null) { setColumns(b.mapping?.columns ?? Object.fromEntries(b.header.map((h) => [h, null]))); setDeclared(!!b.mapping?.declared); } }, [b, columns]);
  if (batch.isPending) return <Loading label="Loading the import" />;
  if (batch.isError) return <p role="alert" className="text-sm text-text-danger">{errorOf(batch.error, "Could not load the import.")}</p>;
  if (!b || !columns) return <Loading label="Loading the import" />;
  const step = stepOf(b.state), viewOnly = !runs && (step === "columns" || step === "preview");
  const at = step === "columns" || (step === "preview" && onColumns) ? 1 : step === "preview" ? 2 : 3;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-text">Import {b.targetLabel.toLowerCase()} from {b.sourceName}</h1>
        {step === "columns" || step === "preview" ? <Steps at={at as 1 | 2} /> : <p className="text-sm text-text-muted"><Pill tone={stateWords(b.state, b.counts).tone}>{stateWords(b.state, b.counts).text}</Pill></p>}
      </header>
      {viewOnly ? <RowsTable b={b} phase="DRY_RUN" />
        : at === 1 ? <ColumnsStep b={b} columns={columns} setColumns={setColumns} declared={declared} setDeclared={setDeclared} onPreviewed={() => setOnColumns(false)} savedFrom={params.get("mapping") === "saved"} />
          : at === 2 ? <PreviewStep b={b} columns={columns} declared={declared} back={() => setOnColumns(true)} />
            : step === "running" ? <Running b={b} /> : <Result b={b} />}
    </div>
  );
}

export function NewImportPage() {
  return (
    <PlatformFrame crumbs={[{ label: COPY.title, to: "/platform/import" }, { label: COPY.newImport }]}>
      <NewBody />
    </PlatformFrame>
  );
}
function NewBody() {
  const me = usePlatformStaff();
  if (!me.keys.includes(KEY.run)) return <NoAccess />;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-col gap-2"><h1 className="text-2xl font-semibold text-text">{COPY.newImport}</h1><Steps at={0} /></header>
      <FileStep />
    </div>
  );
}

export function ImportPage() {
  const { id = "" } = useParams();
  return (
    <PlatformFrame crumbs={[{ label: COPY.title, to: "/platform/import" }, { label: "This import" }]}>
      <Gate><BatchBody id={id} /></Gate>
    </PlatformFrame>
  );
}
function Gate({ children }: { children: React.ReactNode }) {
  const me = usePlatformStaff();
  return me.keys.includes(KEY.view) ? <>{children}</> : <NoAccess />;
}
