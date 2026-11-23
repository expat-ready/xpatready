// PF-19s (concept screens/PF-19s-templates, challenged; R1.46; AG-12 §3.1, §3.5, §3.8): My account → Templates. The list
// of the firm's lead messages with whose wording each uses, and one message's editor: a plain text box for the subject
// and the body (row 46: not a rich editor), fields put in only from the "Insert field" list, and a live preview beside it
// with the Sample lead or a real lead the person may open. Owner and Admin publish (a new version, used when the message
// is sent); every other role reads it. Values in the preview are drawn as text, never as markup.
import * as React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Field, Input, Notice, Pill, Select, Table, Textarea } from "@/components/ui/controls";
import { PlatformFrame, usePlatformStaff } from "../../frame";
import { staffApi, StaffApiError, useStaffToken } from "../../session";
import { insertField, Preview, Published, Records, Template, TemplateList, TEMPLATES_KEY, whose, type Part } from "./contract";

const words = (e: unknown, fallback: string) => (e instanceof StaffApiError ? e.message : fallback);

function Header({ title, line }: { title: string; line: string }) {
  return <header><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-1 text-sm text-text-muted">{line}</p></header>;
}

function ListBody() {
  const me = usePlatformStaff(), token = useStaffToken(), allowed = me.keys.includes(TEMPLATES_KEY);
  const [q, setQ] = React.useState("");
  const list = useQuery({ queryKey: ["pf", "templates", token], enabled: !!token && allowed, retry: false, queryFn: async () => TemplateList.parse(await staffApi("/platform/templates")) });
  const header = <Header title="Templates" line="The wording your firm sends. Fields such as the lead's name fill in from the record when a message is sent." />;
  if (!allowed) return <div className="mx-auto flex max-w-5xl flex-col gap-4">{header}<Notice tone="info" title="Not available"><span data-templates-refused>Your role does not include seeing the firm's templates.</span></Notice></div>;
  if (list.error) return <div className="mx-auto flex max-w-5xl flex-col gap-4">{header}<Notice tone="danger" title="Could not load the templates"><span data-templates-error>{words(list.error, "Please reload the page.")}</span></Notice></div>;
  if (!list.data) return <div className="mx-auto flex max-w-5xl flex-col gap-4">{header}<p role="status" className="text-sm text-text-muted" data-loading>Loading the templates…</p></div>;
  const shown = list.data.templates.filter((t) => t.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      {header}
      <div className="max-w-sm"><Field label="Search by name"><Input type="search" value={q} onChange={(e) => setQ(e.target.value)} data-templates-search /></Field></div>
      <h2 className="text-lg font-semibold">Lead messages</h2>
      {shown.length === 0 ? <p className="text-sm text-text-muted" data-templates-none>No template matches “{q.trim()}”.</p> : (
        <Table label="Lead messages" head={["Name", "Kind", "Sent to", "Whose wording", ""]}>
          {shown.map((t) => (
            <tr key={t.key} data-template-row={t.key}>
              <td className="font-medium">{t.name}</td>
              <td>{t.list}</td>
              <td>{t.sentTo}</td>
              <td><Pill tone={t.version > 0 ? "info" : "neutral"}><span data-template-whose>{whose(t.version)}</span></Pill></td>
              <td><Link to={`/platform/templates/${encodeURIComponent(t.key)}`} className="text-sm font-medium text-text-link underline-offset-2 hover:underline" aria-label={`Open ${t.name}`} data-template-open={t.key}>Open</Link></td>
            </tr>
          ))}
        </Table>
      )}
      <p className="text-xs text-text-muted">Starter wording from ExpatReady is Sample: read it before your firm uses it.</p>
    </div>
  );
}

/** One preview line: plain text, values as text, a missing value marked (never blank), an unknown field marked. */
function Parts({ parts }: { parts: Part[] }) {
  return <>{parts.map((p, i) => "text" in p ? <React.Fragment key={i}>{p.text}</React.Fragment>
    : p.value !== null ? <span key={i} className="rounded bg-surface px-0.5" data-preview-value={p.field}>{p.value}</span>
    : <mark key={i} className="rounded bg-[#fdecc8] px-0.5 text-[#5c3c00]" data-preview-missing={p.field}>[missing: {p.label}]</mark>)}</>;
}

function useDebounced<T>(v: T, ms: number) {
  const [d, setD] = React.useState(v);
  React.useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function PreviewPane({ t, subject, body }: { t: Template; subject: string; body: string }) {
  const me = usePlatformStaff(), token = useStaffToken(), canLeads = me.keys.includes("agent/prospect:show");
  const [lead, setLead] = React.useState<{ id: string; label: string } | null>(null), [q, setQ] = React.useState("");
  const asked = useDebounced({ subject, body, leadId: lead?.id }, 250), find = useDebounced(q.trim(), 250);
  const preview = useQuery({ queryKey: ["pf", "templates", "preview", t.key, asked, token], enabled: !!token && t.canPreview, retry: false, placeholderData: (p) => p,
    queryFn: async () => Preview.parse(await staffApi(`/platform/templates/${encodeURIComponent(t.key)}/preview`, { method: "POST", json: asked })) });
  const found = useQuery({ queryKey: ["pf", "templates", "records", find, token], enabled: !!token && t.canPreview && canLeads && find.length > 0, retry: false,
    queryFn: async () => Records.parse(await staffApi(`/platform/templates/records?q=${encodeURIComponent(find)}`)) });
  if (!t.canPreview) return <Notice tone="info" title="Preview"><span data-preview-refused>Your role does not include previewing templates.</span></Notice>;
  const p = preview.data;
  return (
    <section aria-labelledby="preview-h" className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-4" data-preview>
      <h2 id="preview-h" className="text-lg font-semibold">Preview</h2>
      <div className="flex flex-col gap-2">
        <p className="text-sm" data-preview-record>Shown as <strong>{lead ? lead.label : "the Sample lead"}</strong> would receive it{lead ? null : " (made-up details)"}.</p>
        {lead ? <div><Button type="button" variant="outline" size="sm" onClick={() => setLead(null)} data-preview-sample>Use the Sample lead</Button></div> : null}
        {canLeads ? (
          <>
            <Field label="Preview with a real lead" hint="Type a name or lead number; only leads you may open are listed.">
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" data-preview-find />
            </Field>
            {find && found.data ? (found.data.records.length ? (
              <ul className="flex flex-col gap-1" aria-label="Leads found" data-preview-found>
                {found.data.records.map((r) => <li key={r.id}><Button type="button" variant="ghost" size="sm" onClick={() => { setLead(r); setQ(""); }} data-preview-pick={r.label}>{r.label}</Button></li>)}
              </ul>) : <p className="text-xs text-text-muted" data-preview-found-none>No lead you may open matches.</p>) : null}
          </>
        ) : null}
      </div>
      {preview.error ? <Notice tone="danger" title="No preview"><span data-preview-error>{words(preview.error, "The preview could not be made.")}</span></Notice> : !p ? <p role="status" className="text-sm text-text-muted">Making the preview…</p> : (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-white p-3 text-sm text-[#1f2933]" aria-live="polite">
          <p><span className="text-xs text-text-muted">Subject: </span><span className="font-medium" data-preview-subject><Parts parts={p.subject} /></span></p>
          <div className="whitespace-pre-wrap [overflow-wrap:anywhere]" data-preview-body><Parts parts={p.body} /></div>
          <p className="text-xs text-text-muted">Language: {p.record.language}.</p>
        </div>
      )}
      {p?.missing.length ? <p className="text-xs text-text" data-preview-gaps>This record has no value for: {p.missing.join(", ")}. A message with a missing value is not sent.</p> : null}
    </section>
  );
}

type Spot = { field: "subject" | "body"; start: number; end: number };

function EditorBody() {
  const { key = "" } = useParams(), token = useStaffToken(), me = usePlatformStaff(), qc = useQueryClient();
  const allowed = me.keys.includes("agent/template:show");
  const read = useQuery({ queryKey: ["pf", "templates", "one", key, token], enabled: !!token && allowed, retry: false, queryFn: async () => Template.parse(await staffApi(`/platform/templates/${encodeURIComponent(key)}`)) });
  const [draft, setDraft] = React.useState<{ subject: string; body: string; base: number } | null>(null);
  const [errors, setErrors] = React.useState<{ subject?: string; body?: string }>({}), [said, setSaid] = React.useState<{ tone: "ok" | "danger" | "info"; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false), [pick, setPick] = React.useState("");
  const spot = React.useRef<Spot>({ field: "body", start: -1, end: -1 }), subjectEl = React.useRef<HTMLInputElement>(null), bodyEl = React.useRef<HTMLTextAreaElement>(null), saidEl = React.useRef<HTMLDivElement>(null);
  const t = read.data;
  React.useEffect(() => { if (t && !draft) setDraft({ subject: t.subject, body: t.body, base: t.version }); }, [t, draft]);
  const dirty = !!t && !!draft && (draft.subject !== t.subject || draft.body !== t.body);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const back = <Link to="/platform/templates" className="text-sm text-text-link underline-offset-2 hover:underline" data-templates-back>← All templates</Link>;
  if (!allowed) return <div className="mx-auto flex max-w-6xl flex-col gap-4">{back}<Notice tone="info" title="Not available"><span data-templates-refused>Your role does not include opening the firm's templates.</span></Notice></div>;
  if (read.error) return <div className="mx-auto flex max-w-6xl flex-col gap-4">{back}<Notice tone="danger" title={read.error instanceof StaffApiError && read.error.status === 404 ? "No such template" : "Could not load the template"}><span data-template-error>{words(read.error, "Please reload the page.")}</span></Notice></div>;
  if (!t || !draft) return <div className="mx-auto flex max-w-6xl flex-col gap-4">{back}<p role="status" className="text-sm text-text-muted" data-loading>Loading the template…</p></div>;

  const remember = (field: Spot["field"]) => (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    spot.current = { field, start: e.currentTarget.selectionStart ?? e.currentTarget.value.length, end: e.currentTarget.selectionEnd ?? e.currentTarget.value.length };
  };
  const type = (field: Spot["field"], v: string) => { setDraft((d) => (d ? { ...d, [field]: v } : d)); setErrors((x) => ({ ...x, [field]: undefined })); setSaid(null); };
  const insert = () => {
    if (!pick) { setSaid({ tone: "info", text: "Choose a field to insert first." }); return; }
    const { field } = spot.current, text = draft[field];
    const start = spot.current.start < 0 ? text.length : spot.current.start, end = spot.current.end < 0 ? text.length : spot.current.end;
    const next = insertField(text, start, end, pick);
    type(field, next.text);
    spot.current = { field, start: next.cursor, end: next.cursor };
    const el = field === "subject" ? subjectEl.current : bodyEl.current;
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(next.cursor, next.cursor); });
    setPick("");
  };
  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!dirty && t.version > 0) { setSaid({ tone: "info", text: "Nothing has changed." }); return; }
    setBusy(true); setSaid(null); setErrors({});
    try {
      const r = Published.parse(await staffApi(`/platform/templates/${encodeURIComponent(t.key)}`, { method: "PUT", json: { subject: draft.subject, body: draft.body, baseVersion: draft.base } }));
      await qc.invalidateQueries({ queryKey: ["pf", "templates"] });
      setDraft(null);
      setSaid({ tone: "ok", text: `Published: version ${r.version}. This wording is used when the message is sent.` });
    } catch (err) {
      if (err instanceof StaffApiError && err.status === 422) setErrors({ subject: err.field("subject") ?? undefined, body: err.field("body") ?? undefined });
      setSaid({ tone: "danger", text: `Not published. ${words(err, "Please try again.")}` });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => saidEl.current?.focus());
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      {back}
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold" data-template-name>{t.name}</h1>
        <p className="text-sm text-text-muted">{t.list} message · {t.channel} · {t.language} · sent to {t.sentTo} · purpose: {t.purpose}</p>
        <p className="text-sm"><Pill tone={t.version > 0 ? "info" : "neutral"}><span data-template-whose>{whose(t.version)}</span></Pill>{t.version === 0 ? <span className="ml-2 text-xs text-text-muted">Starter wording from ExpatReady (Sample).</span> : null}</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={publish} noValidate className="flex flex-col gap-4" aria-label="Wording" data-template-form>
          {!t.canEdit ? <Notice tone="info"><span data-template-readonly>You can read this wording. Only an Owner or Admin can change it.</span></Notice> : null}
          <Field label="Subject" error={errors.subject} hint={`One line, at most ${t.limits.subject} characters.`}>
            <Input ref={subjectEl} value={draft.subject} readOnly={!t.canEdit} maxLength={t.limits.subject + 50} onChange={(e) => type("subject", e.target.value)}
              onSelect={remember("subject")} onKeyUp={remember("subject")} onClick={remember("subject")} data-template-subject />
          </Field>
          <Field label="Message" error={errors.body} hint="Type the wording. Add names and numbers with Insert field, never by typing braces.">
            <Textarea ref={bodyEl} value={draft.body} readOnly={!t.canEdit} rows={14} onChange={(e) => type("body", e.target.value)}
              onSelect={remember("body")} onKeyUp={remember("body")} onClick={remember("body")} className="font-[inherit] leading-relaxed" data-template-body />
          </Field>
          {t.canEdit ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1"><Field label="Insert field" hint="Goes in where the cursor was, in the subject or the message.">
                <Select value={pick} onChange={(e) => setPick(e.target.value)} data-template-field-pick>
                  <option value="">Choose a field…</option>
                  {t.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </Select>
              </Field></div>
              <Button type="button" variant="outline" onClick={insert} data-template-field-insert>Insert</Button>
            </div>
          ) : null}
          {t.canEdit ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button type="submit" busy={busy} data-template-publish>Publish</Button>
              <Button type="button" variant="ghost" disabled={busy || !dirty} onClick={() => { if (window.confirm("Discard your changes to this wording?")) { setDraft({ subject: t.subject, body: t.body, base: t.version }); setErrors({}); setSaid({ tone: "info", text: "Changes discarded. Nothing was published." }); } }} data-template-discard>Discard changes</Button>
              {dirty ? <span className="text-xs font-medium text-text" data-template-unsaved>Unpublished changes</span> : null}
              <p className="basis-full text-xs text-text-muted">Publishing makes this the wording used when this message is sent.</p>
            </div>
          ) : null}
          <div ref={saidEl} tabIndex={-1} aria-live="polite" className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" data-template-said>
            {said ? <Notice tone={said.tone}><span data-template-said-text>{said.text}</span></Notice> : null}
          </div>
        </form>
        <div className="lg:sticky lg:top-4 lg:self-start"><PreviewPane t={t} subject={draft.subject} body={draft.body} /></div>
      </div>
    </div>
  );
}

export function TemplatesPage() {
  return <PlatformFrame crumbs={[{ label: "Templates" }]}><ListBody /></PlatformFrame>;
}
export function TemplatePage() {
  return <PlatformFrame crumbs={[{ label: "Templates", to: "/platform/templates" }, { label: "Edit" }]}><EditorBody /></PlatformFrame>;
}
