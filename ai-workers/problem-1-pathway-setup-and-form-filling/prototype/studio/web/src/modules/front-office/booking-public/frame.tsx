// FO-3w (concept §4 "Public"; AG-4-16 rule 3; A1, P-629): the booking pages' own small frame, no Studio shell and no
// staff session. It shows the firm's operating name from FO-3pa's answers. PF-13 part 3 (R1.23; brand.tsx) adds the firm's
// banner, logo, tagline, colour and favicon once the page has found the firm (brand.tsx useDrawnBrand); a page that is not
// found shows no brand.
import * as React from "react";
import { useParams } from "react-router-dom";
import { Loading } from "../sales/loading";
import { BrandImage, brandStyle, samePath, useDrawnBrand, useFavicon } from "./brand";
import { NOT_AVAILABLE, TRY_LATER, type Problem } from "./contract";

export function PublicFrame({ firm, title, children }: { firm?: string; title: string; children: React.ReactNode }) {
  React.useEffect(() => { document.title = title; }, [title]);
  const { firmKey = "" } = useParams();
  // The brand read starts with the page's own (the loading frame has no firm yet). Once the page has found its firm it waits
  // for the brand (at most BRAND_WAIT_MS) behind its loading state, then draws once: colours never change and nothing moves
  // in front of the visitor (break M2).
  const { brand, waiting } = useDrawnBrand(firmKey, firm);
  const logo = samePath(brand?.logo ?? null), banner = samePath(brand?.banner ?? null);
  useFavicon(samePath(brand?.favicon ?? null));
  return (
    <div className="min-h-full bg-surface" style={brandStyle(brand)} data-brand-colour={brand?.colour} data-brand-state={waiting ? "waiting" : brand ? "brand" : "none"}>
      {banner ? <BrandImage src={banner} alt="" className="block h-20 w-full object-cover sm:h-28" data-brand-banner /> : null}
      <header className="border-b border-border bg-surface-raised py-3" style={brand ? { borderBottom: "3px solid var(--brand-rule)" } : undefined}>
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-4">
          {logo ? <BrandImage src={logo} alt={`${firm ?? brand?.name ?? "The firm"} logo`} className="h-10 w-auto max-w-32 shrink-0 object-contain sm:max-w-40" data-brand-logo /> : null}
          <div className="min-w-0" data-brand-slot>
            <p dir="auto" className="min-h-6 text-base font-semibold [overflow-wrap:anywhere]" data-firm-name>{firm ?? ""}</p>
            {brand?.tagline ? <p dir="auto" className="text-sm text-text-muted [overflow-wrap:anywhere]" data-brand-tagline>{brand.tagline}</p> : null}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:py-8">{waiting ? <Loading label="Loading" rows={4} /> : children}</main>
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
