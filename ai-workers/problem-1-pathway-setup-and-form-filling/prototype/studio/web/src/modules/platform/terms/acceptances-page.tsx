// PF-5t part 2 (Lead B's brief PF-5t.md "Part 2, screens"): Settings → Terms, the firm's acceptances from part 1's
// GET /api/platform/terms/acceptances (agent/settings:list): who, when and which version, newest first, a page at a time.
// A person without the key who opens it by its address sees the server's refusal. Wording Sample. Unconfirmed: no counsel.
import * as React from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, Notice, Table } from "@/components/ui/controls";
import { PlatformFrame } from "../frame";
import { staffApi, StaffApiError, useStaffToken } from "../session";
import { Acceptances, kindLabel, safeUrl } from "./contract";

function List() {
  const token = useStaffToken();
  const q = useInfiniteQuery({
    queryKey: ["pf", "terms", "acceptances", token], enabled: !!token, retry: false, initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => Acceptances.parse(await staffApi(`/platform/terms/acceptances?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`)),
    getNextPageParam: (last) => last.nextCursor,
  });
  if (q.isError && !q.data) return <Notice tone="danger" title="Not available"><span data-terms-refused>{q.error instanceof StaffApiError ? q.error.message : "Could not load the acceptances. Please try again."}</span></Notice>;
  if (!q.data) return <p role="status" className="text-sm text-text-muted" data-loading>Loading the acceptances…</p>;
  const rows = q.data.pages.flatMap((p) => p.acceptances);
  return (
    <>
      {rows.length === 0 ? <p className="text-sm text-text-muted" data-terms-empty>No acceptances recorded yet.</p> : (
        <Table head={["Who", "Terms", "Version", "For", "Accepted"]} label="Terms acceptances">
          {rows.map((a) => {
            const href = safeUrl(a.url);
            return (
              <tr key={a.id} data-acceptance={a.id}>
                <td className="[overflow-wrap:anywhere]">{a.staffName}</td>
                <td>{kindLabel(a.kind)}</td>
                <td>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-text-link underline">{a.version}<span className="sr-only"> (opens in a new tab)</span></a> : a.version}</td>
                <td>{a.forFirm ? "The firm" : "Their own"}</td>
                <td><time dateTime={a.acceptedAt}>{new Date(a.acceptedAt).toLocaleString()}</time></td>
              </tr>
            );
          })}
        </Table>
      )}
      {q.isError ? <Notice tone="danger" title="Could not load more" className="mt-3">{q.error instanceof StaffApiError ? q.error.message : "Please try again."}</Notice> : null}
      {q.hasNextPage ? <Button variant="outline" className="mt-3" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()} data-terms-more>Show more</Button> : null}
      <p className="mt-3 text-xs text-text-muted">{q.data.pages[0].note}</p>
    </>
  );
}

export function TermsAcceptancesPage() {
  return (
    <PlatformFrame crumbs={[{ label: "Terms" }]}>
      <h1 className="mb-1 text-xl font-semibold">Terms</h1>
      <p className="mb-4 text-sm text-text-muted">Who accepted which version of our terms, and when. An Owner accepts the terms of service and data processing terms for the firm; each person accepts the privacy notice as their own.</p>
      <List />
    </PlatformFrame>
  );
}
