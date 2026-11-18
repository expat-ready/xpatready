// PF-5t part 2 (Lead B's brief PF-5t.md "Part 2, screens"; wave1-terms.md): while the signed-in person has terms to accept
// (part 1's GET /me/terms; any other call answers 428 TERMS_PENDING), PlatformFrame shows this one page instead of its
// content: "We've updated our <kind>." with each pending version's link, "I accept" and Sign out. Accepting sends every
// pending version at once and the person carries on at the same address (nothing navigates). The server decides what is
// pending: a non-Owner is only ever asked for the privacy notice (part 1's rule). Wording Sample. Unconfirmed: no counsel.
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Notice } from "@/components/ui/controls";
import { staffApi, StaffApiError } from "../session";
import { kindLabel, kindWords, listWords, MyTerms, safeUrl } from "./contract";

const KEY = (token: string | null) => ["fo", "me", "terms", token] as const;   // under ["fo", "me"]: the frame re-checks it on every move

/** The person's pending terms. A 428 anywhere on a staff page (terms published while signed in) checks them again. */
export function useTermsPending(token: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY(token), enabled: enabled && !!token, retry: false, queryFn: async () => MyTerms.parse(await staffApi("/platform/me/terms")) });
  React.useEffect(() => {
    const again = (e: unknown) => { if (e instanceof StaffApiError && e.status === 428 && e.problem.code === "TERMS_PENDING") void qc.invalidateQueries({ queryKey: KEY(token) }); };
    const offQ = qc.getQueryCache().subscribe((ev) => { if (ev.type === "updated" && ev.action.type === "error") again(ev.action.error); });
    const offM = qc.getMutationCache().subscribe((ev) => { if (ev.type === "updated" && ev.action.type === "error") again(ev.action.error); });
    return () => { offQ(); offM(); };
  }, [qc, token]);
  // Until the first answer the frame waits (no flash of a page whose calls would answer 428); an error leaves the page to say its own.
  return { terms: q.data && q.data.pending.length > 0 ? q.data : null, checked: q.data !== undefined || q.isError };
}

export function TermsPage({ token, terms, signOut, leaving }: { token: string | null; terms: MyTerms; signOut: () => void; leaving: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => { heading.current?.focus(); }, []);
  const kinds = [...new Set(terms.pending.map((t) => kindWords(t.kind)))];
  const accept = async () => {
    setBusy(true); setError(null);
    try {
      const r = MyTerms.parse(await staffApi("/platform/me/terms/accept", { method: "POST", json: { versionIds: terms.pending.map((t) => t.id) } }));
      qc.setQueryData(KEY(token), r);
      // The page's own answers that were refused with 428 are asked again (nothing else moves: the same address).
      if (r.pending.length === 0) for (const queryKey of [["fo"], ["pf"]]) await qc.invalidateQueries({ queryKey, predicate: (x) => x.queryKey[2] !== "terms" });
    } catch (e) {
      setError(e instanceof StaffApiError ? e.message : "Could not save your acceptance. Please try again.");
      if (e instanceof StaffApiError && e.status === 400) void qc.invalidateQueries({ queryKey: KEY(token) });   // not current any more: show the versions now current
    } finally { setBusy(false); }
  };
  return (
    <section aria-labelledby="pf-terms" className="mx-auto mt-6 max-w-xl rounded-xl border border-border bg-surface-raised p-6 shadow-sm" data-terms-page>
      <h1 id="pf-terms" ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">We've updated our {listWords(kinds)}.</h1>
      <p className="mt-1 text-sm text-text-muted">Please read {terms.pending.length > 1 ? "them" : "it"} and accept to carry on. You can sign out instead.</p>
      <ul className="mt-4 flex flex-col gap-2" aria-label="Updated terms">
        {terms.pending.map((t) => {
          const href = safeUrl(t.url);
          return (
            <li key={t.id} className="rounded-lg border border-border p-3 text-sm" data-terms-item={t.kind}>
              <span className="font-medium">{kindLabel(t.kind)}</span>{" · version "}{t.version}
              <span className="text-text-muted">{" · published "}{new Date(t.publishedAt).toLocaleDateString()}</span>
              <span className="block">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-text-link underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">Read the {kindWords(t.kind)} (opens in a new tab)</a> : <span className="text-text-muted">The link to this text is not available.</span>}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-text-muted" data-terms-note>{terms.note}</p>
      {error ? <Notice tone="danger" title="Not accepted" className="mt-3"><span data-terms-error>{error}</span></Notice> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button busy={busy} disabled={leaving} onClick={() => void accept()} data-terms-accept>I accept</Button>
        <Button variant="ghost" busy={leaving} disabled={busy} onClick={signOut} data-terms-sign-out>Sign out</Button>
      </div>
    </section>
  );
}
