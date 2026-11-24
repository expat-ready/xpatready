// PF-5t part 2 (Lead B's brief PF-5t.md "Part 2, screens"; wave1-terms.md): while the signed-in person has terms to accept
// (part 1's GET /me/terms; any other call answers 428 TERMS_PENDING), PlatformFrame shows this one page instead of its
// content: "We've updated our <kind>." with each pending version's link, "I accept" and Sign out. Accepting sends every
// pending version at once and the person carries on where they were: the same address, and (break M2) the page and any
// open panel stay mounted underneath, hidden, so what they typed is kept; the terms page is a full-screen modal over them.
// The server decides what is pending: a non-Owner is only ever asked for the privacy notice (part 1's rule).
// Wording Sample. Unconfirmed: no counsel.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Notice } from "@/components/ui/controls";
import { useTabActive } from "@/components/workspace";
import { staffApi, StaffApiError } from "../session";
import { kindLabel, kindWords, listWords, MyTerms, safeUrl } from "./contract";

const KEY = (token: string | null) => ["fo", "me", "terms", token] as const;   // under ["fo", "me"]: the frame re-checks it on every move

/** The person's pending terms. A 428 anywhere on a staff page (terms published while signed in) checks them again. */
export function useTermsPending(token: string | null, enabled: boolean) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY(token), enabled: enabled && !!token, retry: false, queryFn: async () => MyTerms.parse(await staffApi("/platform/me/terms")) });
  React.useEffect(() => {
    // Only while the last terms answer was a success (break M1): if GET /me/terms itself fails, a page's 428 shows the
    // server's words there and never starts a loop of re-asks.
    const again = (e: unknown) => { if (e instanceof StaffApiError && e.status === 428 && e.problem.code === "TERMS_PENDING" && qc.getQueryState(KEY(token))?.status === "success") void qc.invalidateQueries({ queryKey: KEY(token) }); };
    const offQ = qc.getQueryCache().subscribe((ev) => {
      if (ev.type !== "updated" || ev.action.type !== "error") return;
      again(ev.action.error);
      // Break M2: a page that had an answer keeps it while the terms page is up (its 428 is not shown, so a page that
      // swaps itself for an error never unmounts an open panel and what was typed in it); accepting asks it again.
      const { query } = ev, e = ev.action.error, kept = query.state.data;
      if (e instanceof StaffApiError && e.status === 428 && kept !== undefined && query.queryKey[2] !== "terms") queueMicrotask(() => qc.setQueryData(query.queryKey, kept));
    });
    const offM = qc.getMutationCache().subscribe((ev) => { if (ev.type === "updated" && ev.action.type === "error") again(ev.action.error); });
    return () => { offQ(); offM(); };
  }, [qc, token]);
  // Until the first answer for this session the frame waits (no flash of a page whose calls would answer 428). Once it has
  // settled, a later re-check never takes the page away (break M1); an error leaves the page to say its own.
  const settled = React.useRef<string | null>(null);
  if (token && (q.data !== undefined || q.isError)) settled.current = token;
  return { terms: q.data && q.data.pending.length > 0 ? q.data : null, checked: !!token && settled.current === token };
}

const NOT_CURRENT = "These terms changed again while you were reading. The versions now current are shown above; please accept those.";

/** The element focused before the terms page opened, if still on screen; else the page's heading (WCAG 2.4.3). */
function focusBack(before: Element | null) {
  if (before instanceof HTMLElement && before !== document.body && before.isConnected && before.getClientRects().length > 0) { before.focus(); return; }
  const h = document.querySelector<HTMLElement>("main h1");
  if (h) { if (!h.hasAttribute("tabindex")) h.tabIndex = -1; h.focus(); }
}

export function TermsPage({ token, terms, signOut, leaving }: { token: string | null; terms: MyTerms; signOut: () => void; leaving: boolean }) {
  const qc = useQueryClient(), shown = useTabActive();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const errorRef = React.useRef<HTMLDivElement>(null);
  const before = React.useRef<Element | null>(typeof document === "undefined" ? null : document.activeElement);
  React.useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const kinds = [...new Set(terms.pending.map((t) => kindWords(t.kind)))];
  const accept = async () => {
    setBusy(true); setError(null);
    try {
      const r = MyTerms.parse(await staffApi("/platform/me/terms/accept", { method: "POST", json: { versionIds: terms.pending.map((t) => t.id) } }));
      qc.setQueryData(KEY(token), r);
      if (r.pending.length === 0) {
        // The page underneath takes the focus back (review m2, break m3) once this page has closed.
        setTimeout(() => { if (document.activeElement === document.body || document.activeElement === null) focusBack(before.current); }, 50);
        // The page's own answers that were refused with 428 are asked again (nothing else moves: the same address).
        for (const queryKey of [["fo"], ["pf"]]) await qc.invalidateQueries({ queryKey, predicate: (x) => x.queryKey[2] !== "terms" });
      }
    } catch (e) {
      setError(e instanceof StaffApiError ? (e.problem.code === "TERMS_NOT_CURRENT" ? NOT_CURRENT : e.message) : "Could not save your acceptance. Please try again.");
      if (e instanceof StaffApiError && e.status === 400) void qc.invalidateQueries({ queryKey: KEY(token) });   // not current any more: show the versions now current
    } finally { setBusy(false); }
  };
  // PF-31: this dialog is always open and portals to the page's body, so only the shown workspace tab draws it (a hidden
  // tab's copy would put a second terms page over the shown one).
  if (!shown) return null;
  return (
    <DialogPrimitive.Root open modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-surface" />
        <DialogPrimitive.Content aria-describedby="pf-terms-why" className="fixed inset-0 z-[60] overflow-y-auto px-4 py-6 outline-none"
          onOpenAutoFocus={(e) => { e.preventDefault(); heading.current?.focus(); }} onCloseAutoFocus={(e) => { e.preventDefault(); focusBack(before.current); }}
          onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <section aria-labelledby="pf-terms" className="mx-auto mt-6 max-w-xl rounded-xl border border-border bg-surface-raised p-6 shadow-sm [overflow-wrap:anywhere]" data-terms-page>
            <DialogPrimitive.Title asChild><h1 id="pf-terms" ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">We've updated our {listWords(kinds)}.</h1></DialogPrimitive.Title>
            <p id="pf-terms-why" className="mt-1 text-sm text-text-muted">Please read {terms.pending.length > 1 ? "them" : "it"} and accept to carry on. You can sign out instead.</p>
            <ul className="mt-4 flex flex-col gap-2" aria-label="Updated terms">
              {terms.pending.map((t) => {
                const href = safeUrl(t.url);
                return (
                  <li key={t.id} className="rounded-lg border border-border p-3 text-sm" data-terms-item={t.kind}>
                    <span className="font-medium">{kindLabel(t.kind)}</span>{" · version "}<bdi>{t.version.trim() || "not named"}</bdi>
                    <span className="text-text-muted">{" · published "}{new Date(t.publishedAt).toLocaleDateString()}</span>
                    <span className="block">{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-text-link underline outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">Read the {kindWords(t.kind)} (opens in a new tab)</a> : <span className="text-text-muted">The link to this text is not available.</span>}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-text-muted" data-terms-note>{terms.note}</p>
            {error ? <div ref={errorRef} tabIndex={-1} className="mt-3 outline-none"><Notice tone="danger" title="Not accepted"><span data-terms-error>{error}</span></Notice></div> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button busy={busy} disabled={leaving} onClick={() => void accept()} data-terms-accept>I accept</Button>
              <Button variant="ghost" busy={leaving} disabled={busy} onClick={signOut} data-terms-sign-out>Sign out</Button>
            </div>
          </section>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
