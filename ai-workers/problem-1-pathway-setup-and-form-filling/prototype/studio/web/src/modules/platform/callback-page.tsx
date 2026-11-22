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
/** The newest code this page posted: only its answer may change the session (break M1: an older link's late answer
 *  never replaces a later sign-in). */
let latest: string | null = null;
/** The post still waiting for its answer, if any: a mount with nothing to post waits for it, then decides (PF-6f). */
let pending: Promise<void> | null = null, posts = 0;

export function CallbackPage() {
  const [state, setState] = React.useState<{ step: "working" | "done" | "refused"; words?: string; tokenThen?: string | null }>({ step: "working" });
  const token = useStaffToken();
  // A link opened while this page is already showing changes only the part after "#" (no reload): each one is taken (break M2).
  React.useEffect(() => {
    // Nothing to post (Back, a reload, a bare visit, a code already sent): decide from the session once no post is on its
    // way, unless this page has already decided (PF-6f DW1; review m1).
    const decide = async () => {
      while (pending) await pending;
      setState((s) => (s.step !== "working" ? s : staffToken() ? { step: "done" } : { step: "refused", words: USED, tokenThen: null }));
    };
    const take = () => {
      const code = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("code");
      if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
      if (!code || sent.has(code)) { void decide(); return; }
      sent.add(code);
      latest = code;
      setState({ step: "working" });
      const mine = ++posts;
      pending = (async () => {
        try {
          const res = await fetch("/api/platform/session/callback", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ code }) });
          const text = await res.text();
          if (code !== latest) return;   // a newer link was opened meanwhile: its answer decides
          const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
          const r = data as { token?: unknown; expiresIn?: unknown };
          if (res.ok && typeof r?.token === "string") { setStaffToken(r.token, typeof r.expiresIn === "number" ? r.expiresIn : undefined); setState({ step: "done" }); return; }
          setState({ step: "refused", words: problemOf(data, res.status).detail ?? USED, tokenThen: staffToken() });
        } catch {
          sent.delete(code);   // never reached the server: the same link may be opened again here (breaker m3)
          if (code !== latest) return;
          setState({ step: "refused", words: "Could not reach the server, so this link was not used. Open the link from your email again, or sign in below.", tokenThen: staffToken() });
        } finally { if (posts === mine) pending = null; }
      })();
    };
    take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, []);
  // A sign-in from the card below (or another way) after the refusal opens Home (break M1; PF-18h: sign-in lands on Home).
  if (state.step === "done" || (state.step === "refused" && token && token !== state.tokenThen)) return <Navigate to="/home" replace />;
  const signedIn = state.step === "refused" && !!token;
  return (
    <Frame area="outside" title={signedIn ? "Sign-in link" : "Sign in"}>
      {state.step === "working" ? <p role="status" className="text-sm text-text-muted" data-loading>Signing you in…</p>
        // Signed in: one plain notice, never the refusal's "Sign in again" or "Not signed in" beside it (PF-6f DW2).
        : signedIn ? <div data-callback-notice className="mx-auto mt-6 max-w-md"><Notice tone="warn" title="This link was not used."
            action={<Link className="whitespace-nowrap text-text-link underline" to="/account">Open My account</Link>}>
            <span data-callback-refused>You are still signed in.</span></Notice></div>
        : <><Notice tone="danger" title="Not signed in" className="mx-auto mt-6 max-w-md"><span data-callback-refused>{state.words}</span></Notice>
          <SignInCard /></>}
    </Frame>
  );
}
