// FO-4w (R1.26; concept fo-4-sales r2 screen 2b, the part this row names; AG-2-5 rules 1, 2, 13; AG-2-49 rule 4):
// Sales › Settings › Web form, for Owner and Admin (`agent/prospect:configure-form`). Per form: the sites that may show
// it (edited as a list, saved at once, the server's words on each field; a newer save by someone else says so and
// offers a reload) and the snippet to paste on the firm's own site, from embed/snippet.ts (the one source of its text),
// with Copy; the hosted page's link with Copy. A page and not a right panel: there is no form list on main for a panel
// to open from yet (stated on the PR). R1.26 QA-605: the form's on/off switch (the same version check: a newer change by
// someone else says so and offers a reload). Consent wording and thank-you text are the panel's later parts.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button, Field, Input, Notice, Pill, Textarea } from "@/components/ui/controls";
import { embedSnippet } from "../embed/snippet";
import { can } from "./contract";
import { Loading } from "./loading";
import { SalesFrame, useStaff } from "./sales-frame";
import { staffApi, StaffApiError } from "./session";

const KEY = "agent/prospect:configure-form";
const Form = z.object({ id: z.string(), name: z.string(), enabled: z.boolean(), allowedSites: z.array(z.string()), publicToken: z.string(), hostedUrl: z.string(), version: z.string() });
const WebForms = z.object({ publicOrigin: z.string(), forms: z.array(Form) });
type FormT = z.infer<typeof Form>;

/** Copy text: the clipboard where the browser allows it, else the selected field's text (older browsers, no permission). */
async function copyText(text: string, field: HTMLInputElement | HTMLTextAreaElement | null): Promise<boolean> {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* fall back below */ }
  if (!field) return false;
  field.focus(); field.select();
  try { return document.execCommand("copy"); } catch { return false; }
}

function CopyButton({ label, text, field }: { label: string; text: string; field: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null> }) {
  const [said, setSaid] = React.useState<string>("");
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={async () => setSaid(await copyText(text, field.current) ? "Copied." : "Could not copy: select the text and copy it yourself.")}>{label}</Button>
      <span role="status" className="text-xs text-text-muted">{said}</span>
    </span>
  );
}

function Sites({ form, onSaved }: { form: FormT; onSaved: (f: FormT) => void }) {
  const [rows, setRows] = React.useState<string[]>(form.allowedSites.length ? form.allowedSites : [""]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [said, setSaid] = React.useState<{ tone: "ok" | "danger"; text: string; stale?: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const qc = useQueryClient();
  const inputs = React.useRef<(HTMLInputElement | null)[]>([]);
  // A newer version (a save here, or a Reload after someone else's) shows the newest list; a "someone else changed it"
  // notice goes with the old list, a "Saved." stays.
  // The list is reset only when the stored list changes, so switching the form on or off (a new version, the same
  // sites) keeps what is being typed here (QA-605).
  const stored = form.allowedSites.join(" ");
  React.useEffect(() => { setRows(form.allowedSites.length ? form.allowedSites : [""]); setErrors({}); }, [stored]);   // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the stored list's text
  React.useEffect(() => { setSaid((s) => (s?.stale ? null : s)); }, [form.version]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErrors({}); setSaid(null);
    try {
      const sites = rows.map((s) => s.trim()).filter(Boolean);
      const saved = Form.parse(await staffApi(`/front-office/web-forms/${encodeURIComponent(form.id)}/allowed-sites`, { method: "PUT", json: { sites, version: form.version } }));
      onSaved(saved);
      setSaid({ tone: "ok", text: saved.allowedSites.length ? `Saved. ${saved.allowedSites.length === 1 ? "1 site" : `${saved.allowedSites.length} sites`} can show this form.` : "Saved. No site can show this form now: visitors elsewhere get the link to the hosted page." });
    } catch (x) {
      const p = x instanceof StaffApiError ? x : null;
      // The server names each refused entry by its place in the list it was sent (blank rows are not sent).
      const sent = rows.map((s, i) => [s.trim(), i] as const).filter(([s]) => s).map(([, i]) => i);
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(p?.problem.fields ?? {})) { const m = /^sites\.(\d+)$/.exec(k); if (m && sent[Number(m[1])] !== undefined) mapped[String(sent[Number(m[1])])] = v; }
      setErrors(mapped);
      // Several refused rows: the summary names them (review m4); one: the server's own words.
      const rowsOff = Object.keys(mapped).map((k) => Number(k) + 1).sort((a, b) => a - b);
      const names = rowsOff.length > 1 ? `Not saved: check sites ${rowsOff.slice(0, -1).join(", ")} and ${rowsOff[rowsOff.length - 1]}.` : null;
      setSaid({ tone: "danger", text: names ?? p?.message ?? "Not saved. Please try again.", stale: p?.problem.code === "STALE" });
      const first = Object.keys(mapped)[0];
      if (first !== undefined) requestAnimationFrame(() => inputs.current[Number(first)]?.focus());
    } finally { setBusy(false); }
  };
  return (
    <form noValidate onSubmit={save} className="flex flex-col gap-3" aria-labelledby={`sites-${form.id}`}>
      <h3 id={`sites-${form.id}`} className="text-sm font-semibold">Sites that may show this form</h3>
      <p className="text-sm text-text-muted">The form draws only on these sites. Enter each site's address without a page, for example https://www.example.com. On any other site visitors get the link to the hosted page instead.</p>
      {rows.map((v, i) => (
        <div key={i} className="flex items-end gap-2">
          <Field label={`Site ${i + 1}`} error={errors[String(i)] ?? null} className="min-w-0 flex-1">
            <Input ref={(el) => { inputs.current[i] = el; }} value={v} inputMode="url" autoComplete="url" maxLength={200} placeholder="https://www.example.com"
              onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? e.target.value : x)))} />
          </Field>
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove site ${i + 1}${v ? ` (${v})` : ""}`} onClick={() => {
            // The row's message goes with it; the rows below keep theirs as they move up (break m2). Focus stays on a field (m3).
            setErrors((e) => Object.fromEntries(Object.entries(e).flatMap(([k, m]) => { const n = Number(k); return n === i ? [] : [[String(n > i ? n - 1 : n), m]]; })));
            setRows((r) => (r.length === 1 ? [""] : r.filter((_, j) => j !== i)));
            requestAnimationFrame(() => inputs.current[Math.max(0, Math.min(i, rows.length - 2))]?.focus());
          }}>Remove site</Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={rows.length >= 20} onClick={() => { setRows((r) => [...r, ""]); requestAnimationFrame(() => inputs.current[rows.length]?.focus()); }}>Add a site</Button>
        <Button type="submit" size="sm" busy={busy}>Save sites</Button>
      </div>
      {said ? <Notice tone={said.tone} action={said.stale ? <Button type="button" size="sm" variant="secondary" onClick={() => qc.invalidateQueries({ queryKey: ["fo", "web-forms"] })}>Reload</Button> : undefined}>{said.text}</Notice> : null}
    </form>
  );
}

/** R1.26 QA-605: switch the form on or off, Owner and Admin (the page is theirs); saved at once, version-checked. */
function OnOff({ form, onSaved }: { form: FormT; onSaved: (f: FormT) => void }) {
  const [said, setSaid] = React.useState<{ tone: "ok" | "danger"; text: string; stale?: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const qc = useQueryClient();
  const button = React.useRef<HTMLButtonElement>(null);
  // Focus goes back to the switch once React has drawn the result (review m1, M2): an effect, never a timer, so the
  // keyed new button exists and is enabled. A timer could run first, on the old disabled button, on a slow machine.
  // It waits for the version the press produced (the saved one, or the same one after a refusal): the query cache hands
  // the new state over a tick later than `busy`, and focusing the old button then would be lost when it is replaced.
  const refocus = React.useRef<string | null>(null);
  React.useEffect(() => { if (!busy && refocus.current === form.version) { refocus.current = null; button.current?.focus(); } }, [busy, form.version]);
  React.useEffect(() => { setSaid((s) => (s?.stale ? null : s)); }, [form.version]);
  const flip = async () => {
    setBusy(true); setSaid(null);
    let landed = form.version;
    try {
      const saved = Form.parse(await staffApi(`/front-office/web-forms/${encodeURIComponent(form.id)}/enabled`, { method: "PUT", json: { enabled: !form.enabled, version: form.version } }));
      landed = saved.version; onSaved(saved);
      setSaid({ tone: "ok", text: saved.enabled ? "Switched on. Visitors can send enquiries through this form." : "Switched off. Visitors now see \"This form is not available\"." });
    } catch (x) {
      const p = x instanceof StaffApiError ? x : null;
      setSaid({ tone: "danger", text: p?.problem.fields?.enabled ?? p?.message ?? "Not changed. Please try again.", stale: p?.problem.code === "STALE" });
    } finally {
      // The button is disabled while busy, which drops focus: the effect above puts it back (review m1, M2).
      refocus.current = landed; setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby={`onoff-${form.id}`}>
      <h3 id={`onoff-${form.id}`} className="text-sm font-semibold">On or off</h3>
      <p className="text-sm text-text-muted">{form.enabled ? "The form is on: visitors can send enquiries, on your site and on the hosted page. Switching it off stops new enquiries at once." : "Switch it on to take enquiries, on your site and on the hosted page. It takes effect at once."}</p>
      {/* Keyed on the state: "Switch the form on" is a new button, never the old one animating from the secondary look to
          primary through mid-tones an Owner cannot read (full run 44804722228, axe color-contrast). */}
      <div><Button key={form.enabled ? "on" : "off"} ref={button} type="button" size="sm" variant={form.enabled ? "secondary" : "default"} busy={busy} onClick={flip}>{form.enabled ? "Switch the form off" : "Switch the form on"}</Button></div>
      {said ? <Notice tone={said.tone} action={said.stale ? <Button type="button" size="sm" variant="secondary" onClick={() => qc.invalidateQueries({ queryKey: ["fo", "web-forms"] })}>Reload</Button> : undefined}>{said.text}</Notice> : null}
    </div>
  );
}

function OneForm({ form, origin, onSaved }: { form: FormT; origin: string; onSaved: (f: FormT) => void }) {
  const snippet = embedSnippet(origin, form.publicToken);
  const snippetRef = React.useRef<HTMLTextAreaElement>(null), linkRef = React.useRef<HTMLInputElement>(null);
  return (
    <section aria-labelledby={`form-${form.id}`} className="flex flex-col gap-6 rounded-xl border border-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`form-${form.id}`} className="text-base font-semibold [overflow-wrap:anywhere]">{form.name}</h2>
        <Pill tone={form.enabled ? "ok" : "neutral"}>{form.enabled ? "On" : "Off"}</Pill>
      </div>
      {!form.enabled ? <Notice tone="warn" title="This form is off">While it is off, visitors see "This form is not available", on your site and on the hosted page.</Notice> : null}
      <OnOff form={form} onSaved={onSaved} />
      <Sites form={form} onSaved={onSaved} />
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Put the form on your site</h3>
        {!form.allowedSites.length ? <Notice tone="warn">Save your site above first: until then the snippet shows only the link to the hosted page.</Notice> : null}
        <Field label="Snippet to paste into your page" hint="Paste it where the form should appear. If the script cannot run, visitors get the link to the hosted page. Campaign details on the page (utm, click id) are sent with each enquiry; no cookies are set.">
          <Textarea ref={snippetRef} readOnly rows={4} value={snippet} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <div><CopyButton label="Copy snippet" text={snippet} field={snippetRef} /></div>
        <Field label="Hosted form page" hint="A link to the form on our site, for emails or a site where the snippet cannot go.">
          <Input ref={linkRef} readOnly value={form.hostedUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <div><CopyButton label="Copy link" text={form.hostedUrl} field={linkRef} /></div>
      </div>
    </section>
  );
}

function Body() {
  const me = useStaff();
  const allowed = can(me, KEY);
  const qc = useQueryClient();
  const q = useQuery({ enabled: allowed, queryKey: ["fo", "web-forms"], queryFn: async () => WebForms.parse(await staffApi("/front-office/web-forms")) });
  const onSaved = (f: FormT) => qc.setQueryData(["fo", "web-forms"], (old: z.infer<typeof WebForms> | undefined) => (old ? { ...old, forms: old.forms.map((x) => (x.id === f.id ? f : x)) } : old));
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <h1 className="text-xl font-semibold">Web form</h1>
      {!allowed ? <Notice tone="info" title="Owners and Admins only">Only an Owner or an Admin of your firm can change the web form's settings.</Notice>
        : q.isPending ? <Loading label="Loading the web form" rows={4} />
          : q.isError ? <Notice tone="danger" title="Could not load the web form">{q.error instanceof StaffApiError ? q.error.message : "Please try again."}</Notice>
            : !q.data.forms.length ? <Notice tone="info">Your firm has no web form yet.</Notice>
              : q.data.forms.map((f) => <OneForm key={f.id} form={f} origin={q.data.publicOrigin} onSaved={onSaved} />)}
    </div>
  );
}

export function WebFormSettingsPage() {
  return <SalesFrame crumbs={[{ label: "Settings" }, { label: "Web form" }]}><Body /></SalesFrame>;
}
