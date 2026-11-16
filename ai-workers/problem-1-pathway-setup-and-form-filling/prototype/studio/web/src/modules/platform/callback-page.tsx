// PF-6 part 1 (PF-4b's hand-off: provider.ts gives /sign-in/callback#code=…): the public page the sign-in link opens.
// The code is read from the address and taken out of it before anything is sent (history.replaceState), so a reload,
// the history list or a shared screenshot never holds it and a reload never posts it twice. The code goes in the body of
// POST /api/platform/session/callback (never in a URL), with no bearer token (an older tab's session is not proof).
import * as React from "react";
import { Link, Navigate } from "react-router-dom";
import { Frame } from "@/components/frame";
import { Notice } from "@/components/ui/controls";
import { problemOf } from "@/modules/front-office/sales/contract";
import { SignInCard } from "./frame";
import { setStaffToken, staffToken, useStaffToken } from "./session";

const USED = "This sign-in link has been used or has expired. Sign in again.";
/** Codes this page has sent already (React's development double effect, a second mount): each is posted once. */
const sent = new Set<string>();

export function CallbackPage() {
  const [state, setState] = React.useState<{ step: "working" | "done" | "refused"; words?: string; tokenThen?: string | null }>({ step: "working" });
  const token = useStaffToken();
  // A link opened while this page is already showing changes only the part after "#" (no reload): each one is taken (break M2).
  React.useEffect(() => {
    const take = () => {
      const code = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("code");
      if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
      if (!code) { if (!sent.size) setState(staffToken() ? { step: "done" } : { step: "refused", words: USED, tokenThen: null }); return; }
      if (sent.has(code)) return;
      sent.add(code);
      setState({ step: "working" });
      void (async () => {
        try {
          const res = await fetch("/api/platform/session/callback", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ code }) });
          const text = await res.text();
          const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
          const r = data as { token?: unknown; expiresIn?: unknown };
          if (res.ok && typeof r?.token === "string") { setStaffToken(r.token, typeof r.expiresIn === "number" ? r.expiresIn : undefined); setState({ step: "done" }); return; }
          setState({ step: "refused", words: problemOf(data, res.status).detail ?? USED, tokenThen: staffToken() });
        } catch { setState({ step: "refused", words: "Could not reach the server, so this link was not used. Open the link from your email again, or sign in below.", tokenThen: staffToken() }); }
      })();
    };
    take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, []);
  // A sign-in from the card below (or another way) after the refusal opens My account (break M1).
  if (state.step === "done" || (state.step === "refused" && token && token !== state.tokenThen)) return <Navigate to="/account" replace />;
  const signedIn = state.step === "refused" && !!token;
  return (
    <Frame area="outside" title="Sign in">
      {state.step === "working" ? <p role="status" className="text-sm text-text-muted" data-loading>Signing you in…</p>
        : <><Notice tone={signedIn ? "warn" : "danger"} title={signedIn ? "This link was not used" : "Not signed in"} className="mx-auto mt-6 max-w-md"
            action={signedIn ? <Link className="whitespace-nowrap text-text-link underline" to="/account">Open My account</Link> : undefined}>
            <span data-callback-refused>{state.words}</span>{signedIn ? " You are still signed in as before." : null}</Notice>
          {signedIn ? null : <SignInCard />}</>}
    </Frame>
  );
}
