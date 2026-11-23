// PF-5s S8 Invited sign-up (concept pf-5s-saas r2 §4 S8, BR-13, §5, §7b M4 and m8; R1.90; PF-5's
// GET|POST /api/public/signup/:token, PR #3040). Our staff hand over a private single-use link
// (/sign-up/invited#token=…). The page takes the token out of the address before anything is sent and keeps it in memory
// only, reads what the link offers (a GET that changes nothing) and shows S2's form with the link's email, country, plan
// and period fixed: the person adds a password, the firm name and the terms tick. The link's POST starts the same email
// check as the self-serve sign-up, so the next screen is Check your email, then the email's Confirm (verify-page.tsx).
// Unknown, used, expired and malformed links are one answer from the door (404) and one page here (BR-13, m8).
// Deviations from the concept, kept because the door decides (challenge.md): the plan has no Change (M4) since the link
// names the plan and period and the body cannot; the email check is still asked (BR-13 said not again) since the door
// sends the provider's code to the link's email.
import * as React from "react";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Frame, useWhere } from "@/components/frame";
import { Button, Field, Input, Notice } from "@/components/ui/controls";
import { byField, call, PASSWORD_RULE, periodWord, TERMS_REQUIRED, type Period, type Problem } from "./api";
import { Resend, Terms } from "./signup-page";

const Invite = z.object({
  email: z.string(), countryCode: z.string(), period: z.enum(["MONTHLY", "YEARLY"]), expiresAt: z.string(),
  plan: z.object({ code: z.string(), name: z.string(), trialDays: z.number() }),
  terms: z.array(z.object({ id: z.string(), kind: z.string(), version: z.string(), url: z.string() })),
});
type Invite = z.infer<typeof Invite>;
/** BR-13 and §5: the one page for a link that cannot be used (unknown, used, expired, malformed). */
export const DEAD = "This sign-up link doesn't work. It may have been used or expired. Ask us for a new one.";
const NO_LINK = "Open the link from your invitation again.";
const SLOW = "Too many tries from here. Wait a minute, then open the link again.";
type Gone = { title: string; words: string; ask: boolean };
type View = { step: "loading" } | { step: "form"; invite: Invite } | { step: "sent"; invite: Invite } | { step: "gone"; gone: Gone } | { step: "error"; words: string };

let held: string | null = null;
/** The token leaves the address at once (history, referrer, screenshots), as the email link's page does. */
function takeToken() {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
  const token = h.get("token");
  if (token !== null) held = token;
  return held;
}
const goneOf = (p: Problem): Gone | null =>
  p.status === 404 ? { title: "This sign-up link doesn't work", words: DEAD, ask: true }
    : p.code === "PLAN_GONE" ? { title: "This link's plan is not offered", words: p.detail ?? "The plan on this link is no longer offered. Ask us for a new link.", ask: true }
      : p.status === 429 ? { title: "Please wait a minute", words: SLOW, ask: false } : null;

function Place({ label }: { label: string }) { useWhere([{ label }], null); return null; }

/** A second link opened in the same tab changes only the address's hash (no page load): start again from that link. */
export function InvitedSignUpPage() {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const on = () => { if (new URLSearchParams(window.location.hash.replace(/^#/, "")).has("token")) { takeToken(); setN((x) => x + 1); } };
    window.addEventListener("hashchange", on); return () => window.removeEventListener("hashchange", on);
  }, []);
  return <Invited key={n} />;
}

function Invited() {
  const [token] = React.useState(takeToken);
  const [view, setView] = React.useState<View>(token ? { step: "loading" } : { step: "gone", gone: { title: "This sign-up link doesn't work", words: NO_LINK, ask: true } });
  const [v, setV] = React.useState({ password: "", firmName: "", agree: false });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [refused, setRefused] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false), [sentAt, setSentAt] = React.useState(0);
  const inFlight = React.useRef(false);
  const summary = React.useRef<HTMLDivElement>(null), heading = React.useRef<HTMLHeadingElement>(null);
  const read = React.useCallback(async () => {
    if (!token) return null;
    try { const invite = Invite.parse(await call(`signup/${encodeURIComponent(token)}`)); return invite; } catch (x) {
      const p = x as Problem, gone = goneOf(p);
      if (gone) { held = null; setView({ step: "gone", gone }); } else setView({ step: "error", words: p.detail ?? "The invitation could not be read. Please try again." });
      return null;
    }
  }, [token]);
  React.useEffect(() => { let live = true; void read().then((invite) => { if (live && invite) setView({ step: "form", invite }); }); return () => { live = false; }; }, [read]);
  const title = view.step === "sent" ? "Check your email" : view.step === "gone" ? view.gone.title : "Sign up";
  React.useEffect(() => { document.title = `${title} · Expat Ready`; if (view.step === "sent" || view.step === "gone") heading.current?.focus(); }, [title, view.step]);
  const focusSummary = () => requestAnimationFrame(() => summary.current?.focus());

  const post = async (invite: Invite) => call(`signup/${encodeURIComponent(token ?? "")}`, { password: v.password, firmName: v.firmName, acceptedTerms: v.agree ? invite.terms.map((t) => t.id) : [] });
  /** A refusal the page must act on: the link gone, the terms changed while the page was open, or a field's words. */
  const refusal = async (p: Problem) => {
    const gone = goneOf(p);
    if (gone && p.status !== 429) { held = null; setView({ step: "gone", gone }); return; }
    const f = byField(p.errors);
    if (f.acceptedTerms) {
      const fresh = await read();
      if (fresh) setView({ step: "form", invite: fresh });
      setV((x) => ({ ...x, agree: false })); setErrors(f); setRefused("The terms have changed since this page opened. Read the current versions and tick again.");
    } else { setErrors(f); setRefused(Object.keys(f).length ? null : gone ? SLOW : p.detail ?? "Not sent. Please try again."); }
    focusSummary();
  };
  const send = async (e: React.FormEvent, invite: Invite) => {
    e.preventDefault();
    if (inFlight.current) return;
    const own: Record<string, string> = {};
    if (v.password === "") own.password = "Choose a password.";
    else if (v.password.length < 12) own.password = PASSWORD_RULE;
    if (!v.firmName.trim()) own.firmName = "Enter your firm's name.";
    if (!v.agree) own.acceptedTerms = TERMS_REQUIRED;
    setErrors(own); setRefused(null);
    if (Object.keys(own).length) { focusSummary(); return; }
    inFlight.current = true; setBusy(true);
    try { await post(invite); setSentAt(Date.now()); setView({ step: "sent", invite }); }
    catch (x) { await refusal(x as Problem); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const again = async (invite: Invite) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setRefused(null);
    try { await post(invite); setSentAt(Date.now()); } catch (x) {
      const p = x as Problem, gone = goneOf(p);
      if (gone && p.status !== 429) { held = null; setView({ step: "gone", gone }); }
      else if (byField(p.errors).acceptedTerms) { setView({ step: "form", invite }); await refusal(p); }
      else setRefused(gone ? SLOW : p.detail ?? "Not sent. Please try again.");
    } finally { inFlight.current = false; setBusy(false); }
  };

  const card = "mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-sm";
  if (view.step === "gone") return (
    <Frame area="outside" title={view.gone.title}>
      <Place label="Sign-up link" />
      <section aria-labelledby="invited-h" className={card} data-invited="gone">
        <h1 id="invited-h" ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">{view.gone.title}</h1>
        <p className="mt-2 text-sm" data-invited-words>{view.gone.words}</p>
        {view.gone.ask ? <p className="mt-2 text-sm text-text-muted">To ask for a new link, reply to the invitation email.</p> : null}
        <p className="mt-4 text-sm"><Link className="text-text-link underline" to="/account" data-invited-sign-in>Already set up? Sign in</Link></p>
      </section>
    </Frame>
  );
  if (view.step === "sent") return (
    <Frame area="outside" title="Check your email">
      <Place label="Check your email" />
      <section aria-labelledby="invited-h" className={card} data-invited="sent" data-signup-check>
        <h1 id="invited-h" ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">Check your email</h1>
        <p className="mt-2 text-sm">We sent a link and a 6-digit code to <strong data-signup-sent-to className="[overflow-wrap:anywhere]">{view.invite.email}</strong>. It works once, for 24 hours.</p>
        <p className="mt-2 text-sm text-text-muted">Open the link in the email to confirm your sign-up. No email after a few minutes? Check your spam folder.</p>
        {refused ? <Notice tone="danger" title="Not sent" className="mt-3">{refused}</Notice> : null}
        <Resend sentAt={sentAt} busy={busy} onClick={() => void again(view.invite)} />
      </section>
    </Frame>
  );
  const invite = view.step === "form" ? view.invite : null;
  const action = invite && invite.plan.trialDays === 0 ? "Sign up" : "Start free trial";
  const list = Object.values(errors);
  return (
    <Frame area="outside" title="Sign up">
      <Place label="Sign up" />
      <section aria-labelledby="invited-h" className={card} data-invited={view.step}>
        <h1 id="invited-h" className="text-lg font-semibold">{action === "Sign up" ? "Sign up" : "Start your free trial"}</h1>
        <p className="mt-1 text-sm text-text-muted">You were invited to Expat Ready. No card needed.{invite && invite.plan.trialDays > 0 ? ` ${invite.plan.trialDays} days free (Sample).` : ""}</p>
        {view.step === "loading" ? <p role="status" className="mt-4 text-sm text-text-muted">Loading your invitation…</p>
          : view.step === "error" ? <Notice tone="danger" title="The invitation could not be loaded" className="mt-4">{view.words}</Notice>
            : invite ? (
              <form noValidate method="post" onSubmit={(e) => void send(e, invite)} className="mt-4 flex flex-col gap-4" aria-describedby={list.length || refused ? "invited-summary" : undefined}>
                {list.length || refused ? (
                  <div id="invited-summary" ref={summary} tabIndex={-1} role="alert" className="rounded-lg border border-border border-l-4 border-l-danger bg-surface-raised px-4 py-3 text-sm outline-none" data-signup-summary>
                    <p className="font-semibold">{list.length ? "Please check the form" : "Not sent"}</p>
                    {refused ? <p className="mt-0.5 text-text-muted">{refused}</p> : null}
                    {list.length ? <ul className="mt-1 list-disc pl-5 text-text-muted">{list.map((m) => <li key={m}>{m}</li>)}</ul> : null}
                  </div>
                ) : null}
                <div className="text-sm"><p className="text-xs font-medium">Work email</p><p className="[overflow-wrap:anywhere]" data-invited-email>{invite.email}</p><p className="text-xs text-text-muted">This invitation is for this email only.</p></div>
                {/* A password manager saves the new password against the invited email. */}
                <input type="email" name="email" value={invite.email} autoComplete="username" readOnly hidden />
                <Field label="Password" hint={errors.password ? undefined : PASSWORD_RULE} error={errors.password}><Input type="password" name="password" value={v.password} onChange={(e) => setV((x) => ({ ...x, password: e.target.value }))} autoComplete="new-password" maxLength={256} required /></Field>
                <Field label="Firm name" error={errors.firmName}><Input name="organization" value={v.firmName} onChange={(e) => setV((x) => ({ ...x, firmName: e.target.value }))} autoComplete="organization" maxLength={120} required /></Field>
                <div className="text-sm"><p className="text-xs font-medium">Country</p><p data-signup-country>Canada</p><p className="text-xs text-text-muted">Expat Ready is for Canadian immigration work. This can't be changed later.</p></div>
                <div className="text-sm"><p className="text-xs font-medium">Plan</p><p data-invited-plan>{invite.plan.name}, {periodWord(invite.period as Period)}</p><p className="text-xs text-text-muted">Set by your invitation. You can change it later in Plan and billing.</p></div>
                <Terms terms={invite.terms} agree={v.agree} error={errors.acceptedTerms} onChange={(b) => { setV((x) => ({ ...x, agree: b })); if (b) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "acceptedTerms"))); }} />
                <Button type="submit" size="lg" busy={busy} className="self-start" data-signup-submit>{action}</Button>
              </form>
            ) : null}
        <p className="mt-4 text-sm">Already have an account? <Link className="text-text-link underline" to="/account">Sign in</Link></p>
      </section>
    </Frame>
  );
}
