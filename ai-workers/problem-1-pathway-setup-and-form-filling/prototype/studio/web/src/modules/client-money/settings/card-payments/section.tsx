// FO-7s2 part 1 (concept screens/fo-7s-money/concept-settings.md "Card payments"; AG-16-14 to -18, AG-6-49): the Card payments
// section of Getting paid. The Owner (agent/payment-rail:connect) reads FO-7c's status in words with one next step; the button
// asks for step-up first ("Confirm it's you") and then opens Stripe's hosted set-up page. Anyone else sees "Only the Owner
// manages card payments" and no button (FO-7c answers them 403; their on/off line waits on a `cardPayments` read, Question 1).
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button, Notice } from "@/components/ui/controls";
import { usePlatformStaff } from "@/modules/platform/frame";
import { staffApi, StaffApiError, useStaffToken } from "@/modules/platform/session";
import { ConfirmItsYou, staffChange, takeWaiting } from "@/modules/platform/staff/step-up";
import { Account, ACCOUNT_PATH, backWords, CONNECT_KEY, Onboarding, ONBOARDING_PATH, refusalWords, safeStripeUrl, said } from "./contract";

const WAIT_ID = "card-payments";   // the change kept across "Confirm it's you" (one per page, never a person's id)

export function CardPaymentsSection({ go = (u: string) => window.location.assign(u) }: { /** test seam: where the browser goes */ go?: (url: string) => void }) {
  const me = usePlatformStaff(), token = useStaffToken(), owner = me.keys.includes(CONNECT_KEY);
  const [params] = useSearchParams(), back = backWords(params.get("account"));
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState<string | null>(null);
  const [ask, setAsk] = React.useState<React.ComponentProps<typeof ConfirmItsYou>["ask"]>(null);
  const q = useQuery({ queryKey: ["fo", "money", "payment-account", token], enabled: !!token && owner, retry: false, queryFn: async () => Account.parse(await staffApi(ACCOUNT_PATH)) });

  const connect = async () => {
    setBusy(true); setError(null);
    try {
      const r = Onboarding.parse(await staffChange(ONBOARDING_PATH, {}));
      if (!safeStripeUrl(r.url)) { setError("Stripe's set-up page could not be opened. Nothing was changed. Please try again."); return; }
      go(r.url);
    } catch (e) {
      if (e instanceof StaffApiError && e.problem.code === "STEP_UP_REQUIRED") { setAsk({ staffId: WAIT_ID, path: ONBOARDING_PATH, json: {}, method: "POST", what: "", need: "connect card payments", detail: "Confirm it's you: sign in again, then try once more." }); return; }
      setError(e instanceof StaffApiError ? refusalWords(e.status, e.problem.code, e.problem.detail) : "Could not reach Stripe now. Nothing was changed. Please try again.");
    } finally { setBusy(false); }
  };
  // Back from "Confirm it's you": the kept Connect is sent once more under the new sign-in.
  React.useEffect(() => { if (owner && takeWaiting(WAIT_ID)) void connect(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps -- once, on opening

  const head = <h2 id="card-payments" className="text-lg font-semibold">Card payments</h2>;
  if (!owner) return (
    <section aria-labelledby="card-payments" className="flex flex-col gap-2 rounded-xl border border-border p-4" data-card-payments="read-only">
      {head}<p className="text-sm text-text-muted" data-card-words>Only the Owner manages card payments.</p>
    </section>
  );
  const a = q.data, s = a ? said(a) : null;
  return (
    <section aria-labelledby="card-payments" className="flex flex-col gap-3 rounded-xl border border-border p-4" data-card-payments={a?.status ?? "loading"}>
      {head}
      {back ? <Notice tone="info" title="Stripe"><span data-card-back>{back}</span></Notice> : null}
      {q.isError ? <Notice tone="danger" title="Could not load card payments"><span data-card-error>{q.error instanceof StaffApiError ? q.error.message : "Please reload the page."}</span></Notice>
        : !a || !s ? <p role="status" className="text-sm text-text-muted">Loading card payments…</p>
          : (
            <>
              {a.alert && a.status === "PENDING" ? <Notice tone="danger" title="Payment account disconnected"><span data-card-alert>{a.alert.words}</span></Notice> : null}
              <p className={s.tone === "danger" ? "text-sm font-medium text-danger" : "text-sm"} role={s.broken ? "alert" : undefined} data-card-words>{s.words}</p>
              {s.broken && a.status !== "PENDING" ? <p className="text-sm text-text-muted">Until you reconnect, clients see your payment details instead of a card button.</p> : null}
              {s.step ? <div><Button busy={busy} onClick={() => void connect()} data-card-step>{s.step}</Button></div> : null}
            </>
          )}
      {error ? <Notice tone="danger" title="Not connected"><span data-card-refused>{error}</span></Notice> : null}
      <ConfirmItsYou ask={ask} onClose={() => setAsk(null)} />
    </section>
  );
}
