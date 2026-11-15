// FO-4 part 1 (concept r2 §4 screen 1; BR-3; AG-2-5 rules 10-12, AG-2-49): the firm's hosted enquiry form, for a
// visitor with no sign-in, phone width first. Five inputs and one tick (the free message is dropped, challenge m6):
// first name, last name, email, phone (optional), "Interested in" (optional), and the consent tick when the firm set a
// wording. The open read gives a fresh submissionId and load stamp each time the page draws (a repeat send is one lead);
// the answer is the firm's thank-you text whether or not the person is known; a form that is off says so and nothing else.
import * as React from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button, Field, Input, Select } from "@/components/ui/controls";
import { problemOf, PublicForm, Thanks, type Problem } from "./contract";
import { Loading } from "./loading";
const NOT_AVAILABLE = "This form is not available.";
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/public/forms/${path}`, { ...init, headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) } });
  const text = await res.text();
  const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw problemOf(data, res.status);
  return data as T;
}
type Values = { givenNames: string; familyName: string; email: string; phone: string; interestedIn: string; consent: boolean };
const EMPTY: Values = { givenNames: "", familyName: "", email: "", phone: "", interestedIn: "", consent: false };
/** The honeypot (AG-2-49): a field people never see or reach; a bot that fills it is thanked and nothing is stored. */
const TRAP = "website";
/** AG-2-49 rule 3: a form sent sooner than 2 s after it was drawn reads as a bot and is dropped, so a person who is that
 *  quick (autofill) is held until then, never lost (break S3). */
const MIN_FILL_MS = 2_100;
function TheForm({ token, form, drawnAt, onSent, onReload }: { token: string; form: PublicForm; drawnAt: number; onSent: (thanks: string) => void; onReload: () => Promise<unknown> }) {
  const [v, setV] = React.useState<Values>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [refused, setRefused] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const set = <K extends keyof Values>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: k === "consent" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const summary = React.useRef<HTMLDivElement>(null);
  const trap = React.useRef<HTMLInputElement>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    // The form's own checks first, on the field and in a summary, with every answer kept (BIC-13).
    const own: Record<string, string> = {};
    if (!v.givenNames.trim()) own.givenNames = "Enter your first name.";
    if (!v.email.trim()) own.email = "Enter your email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(v.email.trim())) own.email = "Enter an email like name@example.com.";
    setErrors(own); setRefused(null);
    if (Object.keys(own).length) { requestAnimationFrame(() => summary.current?.focus()); return; }
    setBusy(true);
    try {
      const wait = drawnAt + MIN_FILL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const body = {
        submissionId: form.submissionId, loadStamp: form.loadStamp,
        givenNames: v.givenNames, familyName: v.familyName || undefined, email: v.email, phone: v.phone || undefined,
        interestedIn: v.interestedIn || undefined, ...(form.consentText ? { consent: v.consent } : {}),
        ...(trap.current?.value ? { [TRAP]: trap.current.value } : {}),
      };
      const r = Thanks.parse(await call(`${encodeURIComponent(token)}/submissions`, { method: "POST", body: JSON.stringify(body) }));
      onSent(r.thankYouText);
    } catch (x) {
      const p = x as Problem;
      if (p.code === "FORM_NOT_AVAILABLE") { onSent(""); return; }
      // An old page (a stamp from before a restart or a changed wording): draw it again, answers kept, and ask once more.
      // The consent tick is cleared: the redrawn wording may differ, and a tick counts only for words the person saw (Devin #1822).
      if (p.code === "RELOAD") { await onReload(); setErrors({}); setV((x) => ({ ...x, consent: false })); setRefused(`The form was refreshed. Please check your answers${form.consentText ? ", tick the box again if you agree to its words," : ""} and press Send my enquiry again.`); requestAnimationFrame(() => summary.current?.focus()); return; }
      setErrors(p.fields ?? {});
      setRefused(p.detail ?? "The form could not be sent. Please try again.");
      requestAnimationFrame(() => summary.current?.focus());
    } finally { setBusy(false); }
  };
  const list = Object.values(errors);
  return (
    <form noValidate onSubmit={send} className="relative mt-5 flex flex-col gap-4" aria-describedby={list.length || refused ? "fo-form-summary" : undefined}>
      {list.length || refused ? (
        <div id="fo-form-summary" ref={summary} tabIndex={-1} role="alert" className="rounded-lg border border-border border-l-4 border-l-danger bg-surface-raised px-4 py-3 text-sm outline-none">
          <p className="font-semibold">{refused && !list.length ? "Not sent" : "Please check the form"}</p>
          {refused && !list.length ? <p className="mt-0.5 text-text-muted">{refused}</p> : <ul className="mt-1 list-disc pl-5 text-text-muted">{list.map((m) => <li key={m}>{m}</li>)}</ul>}
        </div>
      ) : null}
      <Field label="First name" error={errors.givenNames}><Input value={v.givenNames} onChange={set("givenNames")} autoComplete="given-name" maxLength={100} required /></Field>
      <Field label="Last name (optional)" error={errors.familyName}><Input value={v.familyName} onChange={set("familyName")} autoComplete="family-name" maxLength={100} /></Field>
      <Field label="Email" error={errors.email}><Input type="email" inputMode="email" value={v.email} onChange={set("email")} autoComplete="email" maxLength={254} required /></Field>
      <Field label="Phone (optional)" hint="With your country code if you are outside Canada, for example +44 20 7946 0000." error={errors.phone}><Input type="tel" inputMode="tel" value={v.phone} onChange={set("phone")} autoComplete="tel" maxLength={40} /></Field>
      {form.interestedIn.length ? (
        <Field label="Interested in (optional)" error={errors.interestedIn}>
          <Select value={v.interestedIn} onChange={set("interestedIn")}>
            <option value="">Choose one</option>
            {form.interestedIn.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
      ) : null}
      {form.consentText ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={v.consent} onChange={set("consent")} className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]" />
          <span>{form.consentText}</span>
        </label>
      ) : null}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden"><input ref={trap} name={TRAP} type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></div>
      <Button type="submit" size="lg" busy={busy} className="w-full sm:w-auto sm:self-start">Send my enquiry</Button>
    </form>
  );
}
export function WebFormPage() {
  const { token = "" } = useParams();
  const [sent, setSent] = React.useState<string | null>(null);
  // A fresh read each time the page draws: a new submissionId and stamp (AG-2-5 rule 2), never cached.
  const form = useQuery({ queryKey: ["public-form", token], retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false, queryFn: async () => PublicForm.parse(await call(encodeURIComponent(token))) });
  const unavailable = sent === "" || (form.isError && (form.error as unknown as Problem).code === "FORM_NOT_AVAILABLE");
  React.useEffect(() => { document.title = form.data?.name ?? "Enquiry form"; }, [form.data?.name]);
  return (
    <div className="min-h-full bg-surface px-4 py-6 sm:py-10">
      <main className="mx-auto w-full max-w-lg rounded-xl border border-border bg-surface-raised p-5 shadow-sm sm:p-8">
        {unavailable ? <><h1 className="text-xl font-semibold">Enquiry form</h1><p data-form-state="not-available" className="mt-2 text-sm text-text-muted">{NOT_AVAILABLE}</p></>
          : sent !== null ? <><h1 className="text-xl font-semibold">{form.data?.name ?? "Thank you"}</h1><p data-form-state="thanks" role="status" className="mt-2 whitespace-pre-line text-sm">{sent}</p></>
            : form.isPending ? <Loading label="Loading the form" rows={5} />
              : form.isError ? <><h1 className="text-xl font-semibold">Enquiry form</h1><p role="alert" className="mt-2 text-sm text-text-muted">{(form.error as unknown as Problem).detail ?? "The form could not be loaded. Please try again later."}</p></>
                : <><h1 className="text-xl font-semibold [overflow-wrap:anywhere]">{form.data.name}</h1><TheForm token={token} form={form.data} drawnAt={form.dataUpdatedAt} onSent={setSent} onReload={() => form.refetch()} /></>}
      </main>
    </div>
  );
}
