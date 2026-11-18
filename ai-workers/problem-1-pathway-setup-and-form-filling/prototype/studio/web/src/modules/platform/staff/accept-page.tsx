// PF-6 part 2b (concept pf-6-staff r2 §4 "Accept invitation", BR-4; AG-1-12): the public page the invitation email
// opens (/invitation#t=…, identity/service.ts). The token is taken out of the address before anything is sent, as the
// sign-in link's page does. GET /api/public/invitations/:token answers the state: valid → firm, email and "Continue to
// set your password", which posts the accept once and follows the hand-off; expired or no longer valid → the server's
// fixed words. The token goes only in the path of those two public calls (Referrer-Policy: no-referrer, no-store).
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Frame, useWhere } from "@/components/frame";
import { Button, Notice } from "@/components/ui/controls";
import { problemOf } from "@/modules/front-office/sales/contract";

const State = z.union([
  z.object({ state: z.literal("VALID"), firmName: z.string(), email: z.string(), next: z.string() }),
  z.object({ state: z.string(), words: z.string() }),
]);
type View = { step: "loading" } | { step: "valid"; firmName: string; email: string; next: string } | { step: "closed"; words: string };
const NOT_VALID = "This invitation is no longer valid.";
/** A visit with no link in the address (a reload of the cleaned page, a bare visit): nothing is sent. */
const NO_LINK = "Open the invitation link from your email again.";

/** The token is read once per page load and kept only in memory (a reload of the cleaned address asks for the email's link again). */
let held: string | null = null;
function takeToken() {
  const t = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t");
  if (window.location.hash) window.history.replaceState(window.history.state, "", window.location.pathname);
  if (t) held = t;
  return held;
}
async function call(token: string, accept = false) {
  const res = await fetch(`/api/public/invitations/${encodeURIComponent(token)}${accept ? "/accept" : ""}`, { method: accept ? "POST" : "GET", headers: { accept: "application/json" } });
  const text = await res.text();
  const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  return { res, data };
}

/** The place line names this page (the outside frame's default is the client's "Your questions"). */
function Place() { useWhere([{ label: "Invitation" }], null); return null; }

export function AcceptPage() {
  const [view, setView] = React.useState<View>({ step: "loading" });
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  const navigate = useNavigate();
  const token = React.useRef<string | null>(null);
  React.useEffect(() => {
    // A second invitation link opened in this tab changes only the part after "#": it is read too (review m1).
    const load = () => {
    const had = token.current, t = takeToken();
    if (t === had && had) return;
    token.current = t; setError(null);
    if (!token.current) { setView({ step: "closed", words: NO_LINK }); return; }
    setView({ step: "loading" });
    void (async () => {
      try {
        const { res, data } = await call(token.current!);
        const s = res.ok ? State.safeParse(data) : null;
        if (s?.success && s.data.state === "VALID" && "firmName" in s.data) setView({ step: "valid", firmName: s.data.firmName, email: s.data.email, next: s.data.next });
        else setView({ step: "closed", words: s?.success && "words" in s.data ? s.data.words : problemOf(data, res.status).detail ?? NOT_VALID });
      } catch { setView({ step: "closed", words: "Could not reach the server. Open the link from your email again." }); }
    })();
    };
    load();
    window.addEventListener("hashchange", load);
    return () => window.removeEventListener("hashchange", load);
  }, []);
  const accept = async () => {
    if (!token.current || busy) return;
    setBusy(true); setError(null);
    try {
      const { res, data } = await call(token.current, true);
      const url = (data as { handOff?: { url?: unknown } })?.handOff?.url;
      if (res.ok && typeof url === "string" && url.startsWith("/")) { held = null; navigate(url, { replace: true }); return; }
      const words = problemOf(data, res.status).detail ?? NOT_VALID;
      // A refusal (410 used or expired; 409 the email signs in to another firm) ends this link: no Continue that cannot work (break m8).
      if (res.status >= 400 && res.status < 500) setView({ step: "closed", words }); else setError(words);
    } catch { setError("Could not reach the server. Please try again."); } finally { setBusy(false); }
  };
  return (
    <Frame area="outside" title="Invitation">
      <Place />
      <section aria-labelledby="accept-h" className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-sm" data-accept={view.step}>
        <h1 id="accept-h" className="text-lg font-semibold">Join your firm on Expat Ready</h1>
        {view.step === "loading" ? <p role="status" className="mt-2 text-sm text-text-muted">Checking your invitation…</p>
          : view.step === "closed" ? <Notice tone="warn" title="This link cannot be used" className="mt-3"><span data-accept-words>{view.words}</span></Notice>
            : <>
              <dl className="mt-3 flex flex-col gap-2 text-sm"><div><dt className="text-text-muted">Firm</dt><dd data-accept-firm className="[overflow-wrap:anywhere]">{view.firmName}</dd></div>
                <div><dt className="text-text-muted">Your email</dt><dd data-accept-email className="[overflow-wrap:anywhere]">{view.email}</dd></div></dl>
              {error ? <Notice tone="danger" title="Not done" className="mt-3"><span data-accept-error>{error}</span></Notice> : null}
              <Button className="mt-4" busy={busy} onClick={() => void accept()} data-accept-continue>{view.next}</Button>
            </>}
      </section>
    </Frame>
  );
}
