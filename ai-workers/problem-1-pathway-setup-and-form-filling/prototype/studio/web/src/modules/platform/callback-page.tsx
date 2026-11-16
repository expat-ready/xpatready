// PF-6 part 1 (PF-4b's hand-off: provider.ts gives /sign-in/callback#code=…): the public page the sign-in link opens.
// The code is read from the address and taken out of it before anything is sent (history.replaceState), so a reload,
// the history list or a shared screenshot never holds it and a reload never posts it twice. The code goes in the body of
// POST /api/platform/session/callback (never in a URL), with no bearer token (an older tab's session is not proof).
import * as React from "react";
import { Navigate } from "react-router-dom";
import { Frame } from "@/components/frame";
import { Notice } from "@/components/ui/controls";
import { problemOf } from "@/modules/front-office/sales/contract";
import { SignInCard } from "./frame";
import { setStaffToken, staffToken } from "./session";

const USED = "This sign-in link has been used or has expired. Sign in again.";
/** Codes this page has sent already (React's development double effect, a second mount): each is posted once. */
const sent = new Set<string>();

export function CallbackPage() {
  const [state, setState] = React.useState<{ step: "working" | "done" | "refused"; words?: string }>({ step: "working" });
  React.useEffect(() => {
    const code = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("code");
    if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
    if (!code) { setState(staffToken() ? { step: "done" } : { step: "refused", words: USED }); return; }
    if (sent.has(code)) return;
    sent.add(code);
    void (async () => {
      try {
        const res = await fetch("/api/platform/session/callback", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ code }) });
        const text = await res.text();
        const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
        const r = data as { token?: unknown; expiresIn?: unknown };
        if (res.ok && typeof r?.token === "string") { setStaffToken(r.token, typeof r.expiresIn === "number" ? r.expiresIn : undefined); setState({ step: "done" }); return; }
        setState({ step: "refused", words: problemOf(data, res.status).detail ?? USED });
      } catch { setState({ step: "refused", words: "Could not sign in. Please try again." }); }
    })();
  }, []);
  if (state.step === "done") return <Navigate to="/account" replace />;
  return (
    <Frame area="outside" title="Sign in">
      {state.step === "working" ? <p role="status" className="text-sm text-text-muted" data-loading>Signing you in…</p>
        : <><Notice tone="danger" title="Not signed in" className="mx-auto mt-6 max-w-md"><span data-callback-refused>{state.words}</span></Notice><SignInCard /></>}
    </Frame>
  );
}
