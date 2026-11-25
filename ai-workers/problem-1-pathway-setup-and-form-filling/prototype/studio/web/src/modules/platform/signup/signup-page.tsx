// PF-5s part 1, S2 Sign up and S3 Check your email (concept pf-5s-saas r2 §4 S2/S3, BR-2, BR-3, BR-4, §5, §7b m4/m5/m7):
// one column, three inputs (work email, password, firm name), Canada fixed, the carried plan with an in-place Change, and
// ONE terms tick naming the three current versions with links (R1.100: sign-up cannot finish without accepting them).
// Unticked → "Please accept the terms to continue." on the tick and nothing is sent; a refusal from the door (a version
// published while the page was open) reads the current versions again, clears the tick and shows the door's words on it.
// The honeypot and the minimum fill time are PF-5's: a person faster than 3 s (autofill) is held until then, never lost.
// The password stays in this page's memory only (for "Send it again"): never in the address, history or storage.
import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Frame, useWhere } from "@/components/frame";
import { Button, Field, Input, Notice, Select } from "@/components/ui/controls";
import { byField, call, KIND_LABEL, PASSWORD_RULE, periodWord, Plans, safeUrl, TERMS_REQUIRED, termsInOrder, type Period, type Problem } from "./api";

/** PF-5's minimum fill time is 3 s from the form's stamp; held a little longer so a quick person is never dropped. */
const MIN_FILL_MS = 3_300;
/** BR-4: "Send it again" once a minute (Sample). */
const RESEND_MS = 60_000;
const TRAP = "website";
type Values = { email: string; password: string; firmName: string; plan: string; period: Period; agree: boolean };

function Place({ label }: { label: string }) { useWhere([{ label: "Pricing", to: "/pricing" }, { label }], null); return null; }

export function SignUpPage() {
  const [params] = useSearchParams();
  const q = useQuery({ queryKey: ["public", "plans", "sign-up"], retry: false, gcTime: 0, staleTime: Infinity, refetchOnWindowFocus: false, queryFn: async () => Plans.parse(await call("plans")) });
  const [v, setV] = React.useState<Values>({ email: "", password: "", firmName: "", plan: params.get("plan") ?? "", period: params.get("period") === "YEARLY" ? "YEARLY" : "MONTHLY", agree: false });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [refused, setRefused] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  /** Break m1: set before the first await, so two submits in one instant send one request. */
  const inFlight = React.useRef(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [sentAt, setSentAt] = React.useState(0);
  const [changing, setChanging] = React.useState(false);
  const summary = React.useRef<HTMLDivElement>(null), trap = React.useRef<HTMLInputElement>(null), checkHeading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { document.title = `${sentTo ? "Check your email" : "Sign up"} · Expat Ready`; if (sentTo) checkHeading.current?.focus(); }, [sentTo]);
  const plans = q.data?.plans ?? [];
  const plan = plans.find((p) => p.code === v.plan) ?? plans.find((p) => p.code === q.data?.defaultPlan) ?? plans[0];
  // QA-742 (SA-3-46, 0 = no trial): a 0-day plan is never offered as a free trial: the heading, button and refusals say "Sign up".
  const action = plan && plan.trialDays === 0 ? "Sign up" : "Start free trial";
  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV((x) => ({ ...x, [k]: value }));
  const focusSummary = () => requestAnimationFrame(() => summary.current?.focus());

  const post = async (values: Values, data: Plans) => {
    const wait = q.dataUpdatedAt + MIN_FILL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    await call("signup", {
      email: values.email, password: values.password, firmName: values.firmName, countryCode: "CA", planCode: plan?.code ?? data.defaultPlan, period: values.period,
      acceptedTerms: values.agree ? data.terms.map((t) => t.id) : [], formStamp: data.formStamp, ...(trap.current?.value ? { [TRAP]: trap.current.value } : {}),
    });
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || !q.data) return;
    // The form's own checks first, on the field and in a summary, with every answer kept (BIC-13).
    const own: Record<string, string> = {};
    if (!v.email.trim()) own.email = "Enter your work email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@.]+$/.test(v.email.trim())) own.email = "Give your work email (name@example.com).";
    if (v.password === "") own.password = "Choose a password.";
    else if (v.password.length < 12) own.password = PASSWORD_RULE;
    if (!v.firmName.trim()) own.firmName = "Enter your firm's name.";
    if (!v.agree) own.acceptedTerms = TERMS_REQUIRED;
    setErrors(own); setRefused(null);
    if (Object.keys(own).length) { focusSummary(); return; }
    inFlight.current = true; setBusy(true);
    try {
      await post(v, q.data);
      setSentTo(v.email.trim()); setSentAt(Date.now());
    } catch (x) {
      const p = x as Problem;
      const f = byField(p.errors);
      if (p.code === "RELOAD" || f.acceptedTerms) {
        // The versions on this page are no longer the current ones (or the page is too old): read them again; a tick counts
        // only for the versions the person saw, so it is cleared.
        await q.refetch(); setV((x) => ({ ...x, agree: false }));
        if (p.code === "RELOAD") { setErrors({}); setRefused(`The form was refreshed. Please tick the terms again and press ${action}.`); }
        else { setErrors(f); setRefused("The terms have changed since this page opened. Read the current versions and tick again."); }
      } else { setErrors(f); setRefused(Object.keys(f).length ? null : p.detail ?? "Not sent. Please try again."); }
      focusSummary();
    } finally { inFlight.current = false; setBusy(false); }
  };
  const again = async () => {
    if (inFlight.current || !q.data || Date.now() - sentAt < RESEND_MS) return;
    inFlight.current = true; setBusy(true); setRefused(null);
    try { await post(v, q.data); setSentAt(Date.now()); } catch (x) {
      const p = x as Problem;
      // Break m2: the terms changed (or the page is too old) since the form was sent: back to the form, where the
      // current versions are read again and the tick is cleared, as the main submit does.
      if (p.code === "RELOAD" || byField(p.errors).acceptedTerms) {
        await q.refetch(); setV((x2) => ({ ...x2, agree: false })); setSentTo(null);
        setErrors(p.code === "RELOAD" ? {} : byField(p.errors)); setRefused(`The terms have changed since you signed up. Read the current versions, tick again and press ${action}.`);
      } else setRefused(p.detail ?? "Not sent. Please try again.");
    } finally { inFlight.current = false; setBusy(false); }
  };
  if (sentTo) return (
    <Frame area="outside" title="Check your email">
      <Place label="Check your email" />
      <section aria-labelledby="check-h" className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-sm" data-signup-check>
        <h1 id="check-h" ref={checkHeading} tabIndex={-1} className="text-lg font-semibold outline-none">Check your email</h1>
        <p className="mt-2 text-sm">We sent a link and a 6-digit code to <strong data-signup-sent-to className="[overflow-wrap:anywhere]">{sentTo}</strong>. It works once, for 24 hours.</p>
        <p className="mt-2 text-sm text-text-muted">Open the link in the email to confirm your sign-up. No email after a few minutes? Check your spam folder.</p>
        {refused ? <Notice tone="danger" title="Not sent" className="mt-3">{refused}</Notice> : null}
        <Resend sentAt={sentAt} busy={busy} onClick={() => void again()} />
        <Button variant="link" className="mt-1 px-0" onClick={() => { setSentTo(null); setV((x) => ({ ...x, agree: false })); }} data-signup-start-again>Wrong email? Start again</Button>
      </section>
    </Frame>
  );

  const list = Object.values(errors);
  return (
    <Frame area="outside" title="Sign up">
      <Place label="Sign up" />
      <section aria-labelledby="signup-h" className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-sm" data-signup>
        <h1 id="signup-h" className="text-lg font-semibold">{action === "Sign up" ? "Sign up" : "Start your free trial"}</h1>
        <p className="mt-1 text-sm text-text-muted">No card needed.{plan && plan.trialDays > 0 ? ` ${plan.trialDays} days free (Sample).` : ""}</p>
        {q.isPending ? <p role="status" className="mt-4 text-sm text-text-muted">Loading the form…</p>
          : q.isError ? <Notice tone="danger" title="The form could not be loaded" className="mt-4">{(q.error as unknown as Problem).detail ?? "Please try again later."}</Notice>
            : (
              <form noValidate method="post" onSubmit={send} className="relative mt-4 flex flex-col gap-4" aria-describedby={list.length || refused ? "signup-summary" : undefined}>
                {list.length || refused ? (
                  <div id="signup-summary" ref={summary} tabIndex={-1} role="alert" className="rounded-lg border border-border border-l-4 border-l-danger bg-surface-raised px-4 py-3 text-sm outline-none" data-signup-summary>
                    <p className="font-semibold">{list.length ? "Please check the form" : "Not sent"}</p>
                    {refused ? <p className="mt-0.5 text-text-muted">{refused}</p> : null}
                    {list.length ? <ul className="mt-1 list-disc pl-5 text-text-muted">{list.map((m) => <li key={m}>{m}</li>)}</ul> : null}
                  </div>
                ) : null}
                <Field label="Work email" error={errors.email}><Input type="email" inputMode="email" name="email" value={v.email} onChange={(e) => set("email", e.target.value)} autoComplete="email" maxLength={254} required /></Field>
                <Field label="Password" hint={errors.password ? undefined : PASSWORD_RULE} error={errors.password}><Input type="password" name="password" value={v.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" maxLength={256} required /></Field>
                <Field label="Firm name" error={errors.firmName}><Input name="organization" value={v.firmName} onChange={(e) => set("firmName", e.target.value)} autoComplete="organization" maxLength={120} required /></Field>
                <div className="text-sm"><p className="text-xs font-medium">Country</p><p data-signup-country>Canada</p><p className="text-xs text-text-muted">Expat Ready is for Canadian immigration work. This can't be changed later.</p></div>
                <div className="text-sm" data-signup-plan>
                  <p className="text-xs font-medium">Plan</p>
                  {changing ? (
                    <div className="mt-1 flex flex-wrap items-end gap-2">
                      <Field label="Choose a plan" className="min-w-40 flex-1" error={errors.planCode}><Select value={plan?.code ?? ""} onChange={(e) => set("plan", e.target.value)}>{plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</Select></Field>
                      <Field label="Billing" className="min-w-32"><Select value={v.period} onChange={(e) => set("period", e.target.value as Period)}><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></Select></Field>
                      <Button type="button" variant="outline" onClick={() => setChanging(false)}>Done</Button>
                    </div>
                  ) : <p><span data-signup-plan-line>{plan ? `${plan.name}, ${periodWord(v.period)}` : "—"}</span> <Button type="button" variant="link" className="h-auto px-1 py-0" onClick={() => setChanging(true)} data-signup-plan-change>Change</Button></p>}
                  {errors.planCode && !changing ? <p role="alert" className="text-xs text-text-danger">{errors.planCode}</p> : null}
                </div>
                <Terms terms={q.data.terms} agree={v.agree} error={errors.acceptedTerms} onChange={(b) => { set("agree", b); if (b) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "acceptedTerms"))); }} />
                <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden"><input ref={trap} name={TRAP} type="text" tabIndex={-1} autoComplete="off" defaultValue="" /></div>
                <Button type="submit" size="lg" busy={busy} className="self-start" data-signup-submit>{action}</Button>
              </form>
            )}
        <p className="mt-4 text-sm">Already have an account? <Link className="text-text-link underline" to="/account">Sign in</Link></p>
      </section>
    </Frame>
  );
}

export function Terms({ terms, agree, error, onChange }: { terms: Plans["terms"]; agree: boolean; error?: string; onChange: (b: boolean) => void }) {
  const id = React.useId();
  const docs = termsInOrder(terms);
  return (
    <div className="text-sm" data-signup-terms>
      <div className="flex items-start gap-2">
        <input id={id} type="checkbox" checked={agree} onChange={(e) => onChange(e.target.checked)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-note` : `${id}-docs`} className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]" data-signup-agree />
        <label htmlFor={id}>I agree to the Terms of Service, Privacy Notice and Data Processing Terms</label>
      </div>
      <ul id={`${id}-docs`} className="mt-1 pl-6 text-xs text-text-muted">
        {docs.map((t) => <li key={t.id} data-signup-term={t.kind}><a className="text-text-link underline" href={safeUrl(t.url) ?? undefined} target="_blank" rel="noopener noreferrer">{KIND_LABEL[t.kind] ?? t.kind}<span className="sr-only"> (opens in a new tab)</span></a>, version {t.version}</li>)}
      </ul>
      {error ? <p id={`${id}-note`} role="alert" className="mt-1 pl-6 text-xs text-text-danger" data-signup-terms-error>{error}</p> : null}
    </div>
  );
}

export function Resend({ sentAt, busy, onClick }: { sentAt: number; busy: boolean; onClick: () => void }) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = Math.ceil((sentAt + RESEND_MS - now) / 1000);
  return (
    <div className="mt-4">
      <Button variant="outline" busy={busy} disabled={left > 0} onClick={onClick} data-signup-resend>Send it again</Button>
      {left > 0 ? <p className="mt-1 text-xs text-text-muted" aria-live="off">You can send it again in {left} s.</p> : null}
    </div>
  );
}
