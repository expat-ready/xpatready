// CS-D6 part 1 (R1.69; brief design/briefs/CS-D6.md part 1): a stored file's details, opened from a document line's
// "File details" (checklist.tsx): its fingerprint (SHA-256) with a copy button, "Check the file is unchanged" (AG-9-31),
// and "Read by" (AG-9-32), shown only to holders of agent/document:view-access-log (others see no list). Both calls take
// the firm staff sign-in (PF-4's bearer session) through `staffApi`, never the Studio's simulated person; with none,
// the staff sign-in shows inline. Every rule stays in the API (api/src/case-document-reads.ts).
import * as React from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Notice } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";
import { staffApi, StaffApiError, useMe, useSessionEnd, useStaffToken } from "@/modules/platform/session";
import { SignInCard } from "@/modules/platform/frame";

export const VIEW_ACCESS_LOG = "agent/document:view-access-log";
type Line = { id: string; at: string; action: string; who: string; summary: string };
type Page = { document: { id: string; file_name: string; sha256: string }; lines: Line[]; next: string | null };
type Check = { unchanged: boolean; sha256: string; found_sha256: string | null; checked_at: string };

/** The trail's action words as a person reads them (B148: codes in words). */
const ACTION: Record<string, string> = { viewed: "Opened the file", previewed: "Previewed", "read by AI": "Read by AI", "read by rules": "Read by the rules", "checked unchanged": "Checked: unchanged", "found changed": "Checked: changed" };
/** "23 Nov 2026, 14:05" (P-407), in the viewer's own time zone. */
const when = (at: string) => new Date(at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const why = (e: unknown) => !(e instanceof StaffApiError) ? "Could not reach the server. Please try again." : e.status === 403 ? "Your role does not allow this." : e.message;

export function DocumentReads({ doc }: { doc: { id: string; file_name: string; sha256: string } }) {
  const token = useStaffToken();
  const because = useSessionEnd();
  // Breaker m3: after an inline sign-in the card goes; focus moves to the first thing the person can do next.
  const check = React.useRef<HTMLButtonElement>(null), wasSignedOut = React.useRef(!token);
  React.useEffect(() => { if (token && wasSignedOut.current) requestAnimationFrame(() => check.current?.focus()); wasSignedOut.current = !token; }, [token]);
  const me = useMe();
  const mayRead = (me.data?.keys ?? []).includes(VIEW_ACCESS_LOG);
  // Review m4: "Copied" for a few seconds, or why not (a browser may refuse the clipboard).
  const [copied, setCopied] = React.useState<null | "copied" | "refused">(null);
  React.useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(null), 4000); return () => clearTimeout(t); }, [copied]);
  const copy = async () => { try { await navigator.clipboard.writeText(doc.sha256); setCopied("copied"); } catch { setCopied("refused"); } };
  return (
    <div className="min-w-0 space-y-4 text-sm" data-document-reads={doc.id}>
      <section aria-labelledby={`fp-${doc.id}`} className="space-y-1">
        <h3 id={`fp-${doc.id}`} className="font-semibold">Fingerprint (SHA-256)</h3>
        <p className="text-xs text-text-muted">A code made from the file's contents when it was uploaded. Any change to the file gives a different code.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 break-all rounded bg-surface px-2 py-1 font-mono text-xs" data-fingerprint>{doc.sha256}</code>
          <Button size="sm" variant="outline" onClick={() => void copy()} data-copy-fingerprint>{copied === "copied" ? "Copied" : "Copy"}</Button>
          <span className={copied === "refused" ? "text-xs text-text-danger" : "sr-only"} role="status" data-copy-status>{copied === "copied" ? "Fingerprint copied" : copied === "refused" ? "This browser did not allow copying: select the code and copy it." : ""}</span>
        </div>
      </section>
      {!token ? <>
        {because ? <Notice tone="warn" title="Your firm staff sign-in ended"><span data-reads-session-ended>{because === "SIGNED_IN_ELSEWHERE" ? "You signed in on another device." : because === "TOKEN_EXPIRED" ? "The sign-in expired." : "You were signed out."} Sign in again to check the file or see who read it.</span></Notice> : null}
        <SignInCard embedded />
      </> : <>
        <CheckUnchanged id={doc.id} button={check} />
        {me.isLoading ? <Skeleton className="h-16 w-full" /> : mayRead ? <ReadBy id={doc.id} /> : null}
      </>}
    </div>
  );
}

function CheckUnchanged({ id, button }: { id: string; button: React.RefObject<HTMLButtonElement | null> }) {
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<Check | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const check = async () => {
    setBusy(true); setError(null);
    if (busy) return;
    try { setResult(await staffApi<Check>(`/runtime/documents/${id}/check-unchanged`, { method: "POST" })); await qc.invalidateQueries({ queryKey: ["pf", "document-reads", id] }); }
    catch (e) { setError(why(e)); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-1" aria-live="polite">
      {/* Breaker m3: aria-busy, never disabled, so focus stays on the button while the check runs. */}
      <Button ref={button} size="sm" variant="secondary" aria-busy={busy || undefined} onClick={() => void check()} data-check-unchanged>{busy ? <span className="size-3.5 animate-spin motion-reduce:animate-none rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}Check the file is unchanged</Button>
      {result ? (result.unchanged
        ? <p className="text-xs" data-check-result="unchanged">Unchanged: the stored file still matches its fingerprint (checked {when(result.checked_at)}).</p>
        : <Notice tone="danger" title="The file has changed"><span data-check-result="changed">{result.found_sha256 ? "The stored file no longer matches the fingerprint taken at upload." : "The stored file is missing."} Ask the client to upload it again. This check is recorded.</span></Notice>) : null}
      {error ? <p role="alert" className="text-xs text-text-danger" data-check-error>{error}</p> : null}
    </section>
  );
}

function ReadBy({ id }: { id: string }) {
  const token = useStaffToken();
  const q = useInfiniteQuery({
    queryKey: ["pf", "document-reads", id, token], enabled: !!token, retry: false, initialPageParam: "",
    queryFn: ({ pageParam }) => staffApi<Page>(`/runtime/documents/${id}/reads${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (p) => p.next ?? undefined,
  });
  const lines = q.data?.pages.flatMap((p) => p.lines) ?? [];
  // Breaker m3: "Show older" goes once the last page is in; focus moves to the first line it brought.
  const list = React.useRef<HTMLOListElement>(null), firstNew = React.useRef<number | null>(null);
  React.useEffect(() => { const i = firstNew.current; if (i !== null && !q.isFetchingNextPage) { firstNew.current = null; if (!q.hasNextPage) (list.current?.children[i] as HTMLElement | undefined)?.focus(); } }, [q.isFetchingNextPage, q.hasNextPage]);
  return (
    <section aria-labelledby={`rb-${id}`} className="space-y-1" data-read-by>
      <h3 id={`rb-${id}`} className="font-semibold">Read by</h3>
      {q.isLoading ? <Skeleton className="h-16 w-full" />
        : q.isError ? <Notice tone="danger" title="The list could not be loaded">{why(q.error)}</Notice>
        : !lines.length ? <p className="text-xs text-text-muted">Nobody has opened this file yet.</p>
        : <ol ref={list} className="divide-y divide-border rounded-lg border border-border" data-read-lines>
            {lines.map((l) => <li key={l.id} tabIndex={-1} className="outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 grid gap-0.5 px-2.5 py-1.5 sm:grid-cols-[10rem_minmax(0,1fr)]" data-read-line={l.action}>
              <span className="text-xs text-text-muted">{when(l.at)}</span>
              <span className="min-w-0 [overflow-wrap:anywhere]"><bdi className="font-medium">{l.who}</bdi> · {ACTION[l.action] ?? l.action}</span>
            </li>)}
          </ol>}
      {q.hasNextPage || q.isFetchingNextPage ? <Button size="sm" variant="ghost" aria-busy={q.isFetchingNextPage || undefined} onClick={() => { if (!q.isFetchingNextPage) { firstNew.current = lines.length; void q.fetchNextPage(); } }} data-read-more>{q.isFetchingNextPage ? "Loading…" : "Show older"}</Button> : null}
    </section>
  );
}
