// PF-6 part 2a (BR-5, AG-1-42; PF-4b's 401 STEP_UP_REQUIRED): "Confirm it's you". A change the server refuses for an
// old sign-in keeps the session (staffApi would end it on any 401), asks the person to sign in again, and the same
// change is sent once more after the new sign-in. On the local stand-in the sign-in again is PF-4's local route; the
// provider's own sign-in page is the identity join's (concept §2 honest boundary).
import * as React from "react";
import { Button, Dialog, Notice } from "@/components/ui/controls";
import { problemOf } from "@/modules/front-office/sales/contract";
import { endSession, staffApi, StaffApiError, staffToken, useLocalSignIn } from "../session";

export const CONFIRM_WORDS = "Confirm it's you: sign in again to give or remove the Owner role.";
/** One staff change: as staffApi, except that a step-up refusal leaves the session open. */
export async function staffChange<T>(path: string, json: unknown, method = "POST"): Promise<T> {
  const token = staffToken();
  const res = await fetch(`/api${path}`, { method, headers: { accept: "application/json", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(json) });
  const text = await res.text();
  const data: unknown = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (res.ok) return data as T;
  const problem = problemOf(data, res.status);
  if (res.status === 401 && problem.code !== "STEP_UP_REQUIRED" && staffToken() === token) endSession(problem.code ?? "NOT_SIGNED_IN");
  throw new StaffApiError(res.status, problem);
}

/** A change waiting for the sign-in again. Kept outside React: the new sign-in remounts the page (PlatformFrame). */
type Waiting = { staffId: string; path: string; json: unknown; method: string; what: string };
let waiting: Waiting | null = null;
export const takeWaiting = (staffId: string) => { const w = waiting?.staffId === staffId ? waiting : null; if (w) waiting = null; return w; };

export function ConfirmItsYou({ ask, onClose }: { ask: Waiting & { detail: string } | null; onClose: () => void }) {
  const signIn = useLocalSignIn();
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  const go = async () => {
    setBusy(true); setError(null);
    try {
      const me = await staffApi<{ firmKey: string; email: string }>("/platform/me");
      waiting = ask;   // the page sends it once more when it opens again under the new sign-in
      await signIn(me.firmKey, me.email);
    } catch (e) { waiting = null; setError(e instanceof StaffApiError ? e.message : "Could not sign in again. Please try again."); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!ask} onOpenChange={(o) => { if (!o) { setError(null); onClose(); } }} title="Confirm it's you" description={CONFIRM_WORDS}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={() => void go()} data-sign-in-again>Sign in again</Button></>}>
      <p className="text-sm" data-step-up-words>{ask?.detail}</p>
      {error ? <Notice tone="danger" title="Not signed in" className="mt-3">{error}</Notice> : null}
    </Dialog>
  );
}
