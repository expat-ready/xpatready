// PF-5s part 1, S3b Confirm (concept pf-5s-saas r2 §4 S3b, BR-5, §7b M1): the email's link (/sign-up/verify#token=…&code=…,
// written by PF-5's door) opens this page with the code filled in and one button, Confirm my email; only that POST
// confirms and creates the firm, so opening the page (a GET, a mail scanner) changes nothing. The token is taken out of
// the address before anything is sent and kept only in memory. On success the Owner is sent to the sign-in with their
// firm key shown (the trial hand-off is PF-5 part 2's). Wrong code → the door's words on the field; used, expired or
// unknown link → one answer with Sign up again and Sign in; an account that already exists → "You already have an account. Sign in."
import * as React from "react";
import { Link } from "react-router-dom";
import { Frame, useWhere } from "@/components/frame";
import { Button, buttonVariants, Field, Input, Notice } from "@/components/ui/controls";
import { call, type Problem } from "./api";

const EXPIRED = "This link has expired or was already used.";
const NO_LINK = "Open the link from your email again.";
type View = { step: "form" } | { step: "done"; firmKey: string } | { step: "closed"; words: string; signUpAgain: boolean };

let held: { token: string; code: string } | null = null;
function takeLink() {
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
  const token = h.get("token"), code = h.get("code");
  if (token) held = { token, code: code ?? "" };
  return held;
}

function Place() { useWhere([{ label: "Confirm your email" }], null); return null; }

export function VerifyPage() {
  const [linked] = React.useState(takeLink), link = React.useRef(linked);
  const [code, setCode] = React.useState(link.current?.code ?? "");
  const [view, setView] = React.useState<View>(link.current ? { step: "form" } : { step: "closed", words: NO_LINK, signUpAgain: true });
  const [error, setError] = React.useState<string | null>(null), [busy, setBusy] = React.useState(false);
  const heading = React.useRef<HTMLHeadingElement>(null);
  /** Break m1: one confirm at a time, and nothing replaces the done view once the firm key is shown. */
  const inFlight = React.useRef(false), done = React.useRef(false);
  React.useEffect(() => { document.title = "Confirm your email · Expat Ready"; }, []);
  React.useEffect(() => { if (view.step !== "form") heading.current?.focus(); }, [view.step]);
  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || done.current || !link.current) return;
    if (!/^\d{6}$/.test(code.trim())) { setError("Type the 6 digits from the email."); return; }
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const { token } = link.current;
      const r = await call<{ firmKey?: string }>("signup/verify", { token, code: code.trim() });
      held = null; done.current = true;
      setView({ step: "done", firmKey: r.firmKey ?? "" });
    } catch (x) {
      if (done.current) return;
      const p = x as Problem;
      if (p.code === "CODE_WRONG") setError(p.detail ?? "That code is not the one we sent.");
      else if (p.status === 404 || p.status === 422) { held = null; setView({ step: "closed", words: EXPIRED, signUpAgain: true }); }   // 422: a link not { token, code } (PF-28 part 2c)
      else if (p.code === "ACCOUNT_EXISTS" || p.code === "PLAN_GONE") { held = null; setView({ step: "closed", words: p.detail ?? EXPIRED, signUpAgain: p.code === "PLAN_GONE" }); }
      else setError(p.detail ?? "Not confirmed. Please try again.");
    } finally { inFlight.current = false; setBusy(false); }
  };
  return (
    <Frame area="outside" title="Confirm your email">
      <Place />
      <section aria-labelledby="verify-h" className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-sm" data-signup-verify={view.step}>
        {view.step === "done" ? <>
          <h1 id="verify-h" ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">Email confirmed</h1>
          <p className="mt-2 text-sm">Your firm is set up. Sign in with your firm key and your work email.</p>
          <dl className="mt-3 text-sm"><dt className="text-text-muted">Your firm key</dt><dd className="font-mono text-base [overflow-wrap:anywhere]" data-signup-firm-key>{view.firmKey}</dd></dl>
          <p className="mt-1 text-xs text-text-muted">Keep it: you need it to sign in.</p>
          <Link to="/account" className={buttonVariants({ size: "lg", className: "mt-4" })} data-signup-sign-in>Sign in</Link>
        </> : view.step === "closed" ? <>
          <h1 id="verify-h" ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">Confirm your email</h1>
          <Notice tone="warn" title="This link cannot be used" className="mt-3"><span data-signup-verify-words>{view.words}</span></Notice>
          <p className="mt-4 flex flex-wrap gap-4 text-sm">
            {view.signUpAgain ? <Link className="text-text-link underline" to="/sign-up">Send a new link</Link> : null}
            <Link className="text-text-link underline" to="/account">Already confirmed? Sign in</Link>
          </p>
        </> : <>
          <h1 id="verify-h" className="text-lg font-semibold">Confirm your email</h1>
          <p className="mt-1 text-sm text-text-muted">{/^\d{6}$/.test(linked?.code ?? "") ? "The 6-digit code from the email is filled in. Press Confirm my email to finish your sign-up." : "Type the 6-digit code from the email, then press Confirm my email."}</p>
          <form noValidate method="post" onSubmit={confirm} className="mt-4 flex flex-col gap-3">
            <Field label="Code from the email" error={error}><Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="w-40 font-mono tracking-widest" data-signup-code /></Field>
            <Button type="submit" size="lg" busy={busy} className="self-start" data-signup-confirm>Confirm my email</Button>
          </form>
        </>}
      </section>
    </Frame>
  );
}
