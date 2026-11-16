// FO-3w (concept §4 "Public"; AG-4-16 rule 3; A1, P-629): the booking pages' own small frame, no Studio shell and no
// staff session. It shows the firm's operating name from FO-3pa's answers; PF-13 adds the firm's logo, colours and
// tagline here, in the slot under the name (data-brand-slot), as its own Done when line.
import * as React from "react";
import { Loading } from "../sales/loading";
import { NOT_AVAILABLE, TRY_LATER, type Problem } from "./contract";

export function PublicFrame({ firm, title, children }: { firm?: string; title: string; children: React.ReactNode }) {
  React.useEffect(() => { document.title = title; }, [title]);
  return (
    <div className="min-h-full bg-surface">
      <header className="border-b border-border bg-surface-raised py-3">
        <div className="mx-auto w-full max-w-4xl px-4">
          <p className="min-h-6 text-base font-semibold [overflow-wrap:anywhere]" data-firm-name>{firm ?? ""}</p>
          <div data-brand-slot />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
/** What a page shows while its first answer is loading or after it was refused: skeletons, the one not-found, the
 *  rate limit's sentence or the server's own (BR-2, BR-6). */
export function Gate({ pending, error, children }: { pending: boolean; error: unknown; children: () => React.ReactNode }) {
  if (pending) return <PublicFrame title="Book a meeting"><Loading label="Loading" rows={4} /></PublicFrame>;
  if (error) {
    const p = error as Problem;
    const text = p.status === 404 ? NOT_AVAILABLE : p.status === 429 ? TRY_LATER : "This page could not be loaded. Please try again.";
    return <PublicFrame title={p.status === 404 ? NOT_AVAILABLE : "Book a meeting"}><h1 className="text-xl font-semibold" data-public-state={p.status === 404 ? "not-found" : "error"}>{text}</h1></PublicFrame>;
  }
  return <>{children()}</>;
}
