// FO-5s part 2 (concept screens/fo-5s-retainer-signing r2 §4 S1; BR-1, BR-17): Settings › Retainer templates, for the
// people with agent/retainer:configure-template (Owner, Admin). The firm's templates (name, kind, version, placeholders,
// active or not) and the primary Upload template: a right panel with the name and the .docx; an unknown placeholder
// refuses the upload and is named, a missing client-name or fee placeholder is a plain warning; Download a starter
// template (Sample; Unconfirmed: no counsel). One template's panel: its Code s. 24(3) checklist ("n of 26 items marked",
// each unmarked item with its section and how we check; never blocking), Upload a new version (n+1), Make inactive or
// active. An inactive template is not offered for new drafts; a retainer keeps the version it was made from (FO-5).
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { FoldOut } from "@/components/fold-out";
import { Button, Field, Input, Notice, Panel, Pill, Table } from "@/components/ui/controls";
import { useToast } from "@/lib/api";
import { can, problemOf } from "../sales/contract";
import { Loading } from "../sales/loading";
import { SalesFrame, useStaff } from "../sales/sales-frame";
import { staffApi, StaffApiError, staffToken } from "../sales/session";
import { TemplateChecklist } from "./contract";

const KEY = "agent/retainer:configure-template";
const Row = z.object({ id: z.string(), name: z.string(), kind: z.string(), version: z.number(), active: z.boolean(), placeholders: z.array(z.string()), warnings: z.array(z.string()), updatedAt: z.string() });
type Row = z.infer<typeof Row>;
const Uploaded = z.object({ id: z.string(), version: z.number(), placeholders: z.array(z.string()), warnings: z.array(z.string()) });
const Known = z.object({ placeholders: z.array(z.object({ name: z.string(), label: z.string(), mustFill: z.boolean(), loop: z.boolean() })) });
/** A placeholder as written in Word ({client.name}; the fee loop {#fees} … {/fees}). */
const braces = (n: string, loop = false) => (loop ? `{#${n}} … {/${n}}` : `{${n}}`);
/** A multipart call with the bearer token (staffApi sends JSON only); a refusal is a StaffApiError as everywhere. */
async function upload(path: string, form: FormData) {
  const res = await fetch(`/api${path}`, { method: "POST", headers: { authorization: `Bearer ${staffToken()}`, accept: "application/json" }, body: form });
  const text = await res.text(); const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new StaffApiError(res.status, problemOf(data, res.status));
  return Uploaded.parse(data);
}
async function saveFile(path: string, name: string) {
  const res = await fetch(`/api${path}`, { headers: { authorization: `Bearer ${staffToken()}` } });
  if (!res.ok) throw new Error();
  const a = document.createElement("a"); a.href = URL.createObjectURL(await res.blob()); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30_000);   // review m9
}
const day = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { dateStyle: "medium" });

function TemplatesBody() {
  const me = useStaff(), qc = useQueryClient(), toast = useToast(), key = ["fo", "retainer-templates", "all"];
  const list = useQuery({ enabled: can(me, KEY), queryKey: key, queryFn: async () => z.array(Row).parse(await staffApi("/front-office/retainer-templates")) });
  const [panel, setPanel] = React.useState<"upload" | string | null>(null), [name, setName] = React.useState(""), [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<{ field: string | null; text: string } | null>(null), [warnings, setWarnings] = React.useState<string[]>([]);
  const [fileKey, setFileKey] = React.useState(0), trigger = React.useRef<HTMLElement | null>(null);   // a fresh file input after each upload (m2); focus back to what opened a panel (M5)
  const known = useQuery({ enabled: panel === "upload", queryKey: ["fo", "retainer-placeholders"], queryFn: async () => Known.parse(await staffApi("/front-office/retainer-templates/placeholders")).placeholders.filter((x) => !x.name.startsWith("code.") && !x.name.startsWith("fees.") || x.name === "fees.total") });
  const open = list.data?.find((t) => t.id === panel) ?? null;
  const checklist = useQuery({ enabled: !!open, queryKey: ["fo", "retainer-template-checklist", open?.id, open?.version], queryFn: async () => TemplateChecklist.parse(await staffApi(`/front-office/retainer-templates/${open!.id}/checklist`)) });
  const start = (p: typeof panel) => { if (p && !panel) trigger.current = document.activeElement as HTMLElement | null; setPanel(p); setName(""); setFile(null); setFileKey((k) => k + 1); setError(null); };
  const done = (text: string, w: string[]) => { void qc.invalidateQueries({ queryKey: ["fo", "retainer-templates"] }); setWarnings(w); toast.push({ tone: "ok", text }); };
  const fail = (e: unknown) => { setError({ field: e instanceof StaffApiError ? (e.problem.code === "NAME_TAKEN" ? "name" : ["name", "file"].find((f) => e.field(f)) ?? null) : null, text: e instanceof StaffApiError ? e.message : "Could not upload. Please try again." }); if (e instanceof StaffApiError && e.problem.code === "CHANGED") void qc.invalidateQueries({ queryKey: ["fo", "retainer-templates"] }); };
  const send = useMutation({
    mutationFn: async () => { const f = new FormData(); if (panel === "upload") f.set("name", name.trim()); if (panel !== "upload" && open) f.set("expectedVersion", String(open.version)); f.set("file", file!); return upload(panel === "upload" ? "/front-office/retainer-templates" : `/front-office/retainer-templates/${panel}/versions`, f); },
    onSuccess: (u) => { const isNew = panel === "upload"; setPanel(isNew ? null : panel); setFile(null); setFileKey((k) => k + 1); done(isNew ? `${name.trim()} uploaded.` : `Version ${u.version} uploaded.`, u.warnings); }, onError: fail,
  });
  const toggle = useMutation({
    mutationFn: async (t: Row) => staffApi(`/front-office/retainer-templates/${t.id}`, { method: "PATCH", json: { active: !t.active } }),
    onSuccess: (_, t) => done(t.active ? `${t.name} is inactive: not offered for new retainers.` : `${t.name} is active.`, []), onError: fail,
  });
  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (send.isPending) return;   // Enter while uploading sends once (break m1)
    if (panel === "upload" && !name.trim()) return setError({ field: "name", text: "Name the template." });
    if (!file) return setError({ field: "file", text: "Choose a .docx file." });
    setError(null); send.mutate();
  };
  const starter = () => void saveFile("/front-office/retainer-templates/starter", "starter-retainer-sample.docx").catch(() => toast.push({ tone: "danger", text: "Could not download the starter. Please try again." }));
  if (!can(me, KEY)) return <Notice tone="info" title="Retainer templates are set by your firm's Owner or Admin." />;
  const fileField = (
    <Field label="Template file (.docx)" hint="Placeholders like {client.name} are filled in when a retainer is prepared. At most 5 MB." error={error?.field === "file" ? error.text : null}>
      <Input key={fileKey} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
    </Field>
  );
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-text">Retainer templates</h1>
        <div className="flex gap-2"><Button variant="outline" onClick={starter}>Download a starter template</Button><Button onClick={() => start("upload")}>Upload template</Button></div>
      </header>
      {warnings.map((w) => <Notice key={w} tone="warn" title={w} />)}
      {list.isPending ? <Loading label="Loading the templates" rows={2} /> : list.isError ? <Notice tone="danger" title="Could not load the templates." />
        : !list.data.length ? <section data-no-templates className="rounded-xl border border-border bg-surface-raised p-6 text-sm"><p className="font-medium">No retainer templates yet. Upload your firm's .docx to start.</p><p className="mt-1 text-text-muted">Or start from the starter template (Sample wording; Unconfirmed: no counsel) and edit it in Word.</p></section>
          : <Table label="Retainer templates" head={["Name", "Kind", "Version", "Placeholders", "Status", "Updated"]}>
            {list.data.map((t) => (
              <tr key={t.id} data-template-row={t.name} className="border-t border-border">
                <td className="max-w-[24rem] px-3 py-2 [overflow-wrap:anywhere]"><Button variant="link" size="sm" className="h-auto whitespace-normal text-left [overflow-wrap:anywhere]" onClick={() => start(t.id)}>{t.name}</Button>{t.warnings.length ? <Pill tone="warn" className="ml-2" title={t.warnings.join(" ")}>warning</Pill> : null}</td>
                <td className="px-3 py-2">{t.kind === "RETAINER" ? "Retainer" : "Consultation agreement"}</td><td className="px-3 py-2">{t.version}</td><td className="px-3 py-2">{t.placeholders.length}</td>
                <td className="px-3 py-2"><Pill tone={t.active ? "ok" : "neutral"}>{t.active ? "Active" : "Inactive"}</Pill></td><td className="px-3 py-2">{day(t.updatedAt)}</td>
              </tr>
            ))}
          </Table>}
      <Panel open={panel === "upload"} returnFocus={() => trigger.current} onOpenChange={(o) => start(o ? "upload" : null)} title="Upload template" description="Your firm's retainer as a Word file. We read its placeholders and refuse ones we do not know."
        footer={<><Button variant="ghost" onClick={() => start(null)}>Cancel</Button><Button busy={send.isPending} onClick={submit}>Upload template</Button></>}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && !error.field ? <Notice tone="danger" title={error.text} /> : null}
          <Field label="Name" error={error?.field === "name" ? error.text : null}><Input maxLength={120} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} /></Field>
          {fileField}
          <p className="text-sm">No template yet? <Button type="button" variant="link" size="sm" onClick={starter}>Download a starter template</Button> (Sample wording; Unconfirmed: no counsel) and edit it in Word.</p>
          <FoldOut summary="Placeholders you can use" summaryClassName="text-sm font-medium" data-known-placeholders>
            {known.isError ? <Notice tone="danger" title="Could not load the list." /> : <ul className="mt-2 flex flex-col gap-1 text-sm">{(known.data ?? []).map((x) => <li key={x.name} className="[overflow-wrap:anywhere]"><code className="text-xs">{braces(x.name, x.loop)}</code> {x.loop ? "Fee rows" : x.label}{x.mustFill ? " (needed before sending)" : ""}</li>)}
              {known.data ? <li className="text-xs text-text-muted">Inside the fee loop: {"{label}"}, {"{amount}"}, {"{when}"}, {"{due_on}"}. The Code checklist's clause markers ({"{code.s24_3_a}"} to {"{code.s24_3_z}"}) print nothing and mark an item. Any other placeholder is refused and named.</li> : null}</ul>}
          </FoldOut>
        </form>
      </Panel>
      <Panel open={!!open} returnFocus={() => trigger.current} onOpenChange={(o) => start(o ? panel : null)} title={open?.name ?? ""} description={open ? `Version ${open.version} · ${open.active ? "Active" : "Inactive: not offered for new retainers"}` : undefined} bodyLabel="Template details"
        footer={open ? <><Button variant="ghost" onClick={() => start(null)}>Close</Button><Button variant="outline" busy={toggle.isPending} onClick={() => toggle.mutate(open)}>{open.active ? "Make inactive" : "Make active"}</Button></> : null}>
        {open ? <div className="flex flex-col gap-4 text-sm">
          {open.warnings.map((w) => <Notice key={w} tone="warn" title={w} />)}
          <section aria-labelledby="fo-tpl-found" data-placeholders-found>
            <h3 id="fo-tpl-found" className="font-medium">Placeholders found ({open.placeholders.length})</h3>
            <ul className="mt-1 flex flex-wrap gap-1">{open.placeholders.map((x) => <li key={x}><code className="rounded bg-text/5 px-1 text-xs">{x.startsWith("fees.") && x !== "fees.total" ? `{${x.slice(5)}} (fee loop)` : braces(x, x === "fees")}</code></li>)}</ul>
          </section>
          <section aria-labelledby="fo-tpl-code" data-template-checklist>
            <h3 id="fo-tpl-code" className="font-medium">Regulator's Code, s. 24(3)</h3>
            {checklist.isPending ? <Loading label="Loading the checklist" rows={2} /> : checklist.isError ? <Notice tone="danger" title="Could not load the checklist." /> : <>
              <p className="mt-1" data-template-summary>{checklist.data.summary}</p>
              <p className="mt-1 text-xs text-text-muted">Shown to help you check your template; it never stops a send. {checklist.data.source.line} · {checklist.data.legalReading}</p>
              <ul className="mt-2 flex flex-col gap-2">{checklist.data.items.filter((i) => !i.marked).map((i) => <li key={i.letter} data-unmarked={i.letter} className="rounded-lg border border-border p-2"><p className="font-medium">({i.letter}) s. {i.section}: not marked</p><p className="mt-1 text-xs text-text-muted">How we check: {i.howWeCheck}</p></li>)}</ul>
            </>}
          </section>
          <form onSubmit={submit} className="flex flex-col gap-3 border-t border-border pt-3">
            <h3 className="font-medium">Upload a new version</h3>
            {error && !error.field ? <Notice tone="danger" title={error.text} /> : null}
            {fileField}
            <Button type="submit" variant="outline" className="self-start" busy={send.isPending}>Upload version {open.version + 1}</Button>
            <p className="text-xs text-text-muted">Retainers already prepared keep the version they were made from. Earlier versions cannot be downloaded here yet.</p>
          </form>
        </div> : null}
      </Panel>
    </div>
  );
}

export function RetainerTemplatesPage() {
  return <SalesFrame crumbs={[{ label: "Settings" }, { label: "Retainer templates" }]}><TemplatesBody /></SalesFrame>;
}
