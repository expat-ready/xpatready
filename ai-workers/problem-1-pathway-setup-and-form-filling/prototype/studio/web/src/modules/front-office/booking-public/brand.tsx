// PF-13 part 3 (R1.23 "client pages … show them"; AG-1-6, AG-1-9, AG-16-2; P-629; FO-3w option (b), rev 16.39; Lead 4, 22 Nov):
// the firm's brand on its public booking pages, read from the open door GET /api/public/firms/:firmKey/branding (PF-13 part 1b:
// name, colour, accent colour, tagline and image links, no id). The frame draws the banner above its header, the logo beside
// the firm's name and the tagline under it, the brand colour on the header's rule and as the page's primary colour (buttons,
// ticks), and the favicon as the tab's icon. Every value is text or an <img> source, never HTML. A colour the server stored is
// at least 4.5:1 on white (part 1a), so white text on it keeps WCAG AA. Until a firm sets a value, the read answers ExpatReady's
// neutral colour and no images (AG-16-2), and the page shows exactly that.
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { publicCall } from "./contract";

const HEX = /^#[0-9a-f]{6}$/i;
export const PublicBrand = z.object({
  name: z.string(), colour: z.string(), tagline: z.string().nullable(),
  logo: z.string().nullable(), favicon: z.string().nullable(), banner: z.string().nullable(),
});
export type PublicBrand = z.infer<typeof PublicBrand>;

/** A stored image's link on this page's own address (the read answers an absolute link built from the server's public address). */
export const samePath = (link: string | null) => { if (!link) return null; try { const u = new URL(link, window.location.origin); return u.pathname.startsWith("/api/public/firms/") ? `${u.pathname}${u.search}` : null; } catch { return null; } };
/** The hover shade: the colour mixed 20% toward black, so white text on it gains contrast, never loses it. */
export function darker(hex: string): string {
  const c = (i: number) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.8).toString(16).padStart(2, "0");
  return `#${c(1)}${c(3)}${c(5)}`;
}

/** The firm's brand for its public pages: the read and whether it has ended (an answer, a refusal or a failure). */
export function usePublicBrand(firmKey: string) {
  const q = useQuery({ queryKey: ["public-brand", firmKey], enabled: !!firmKey, retry: false, refetchOnWindowFocus: false, staleTime: 60_000,
    queryFn: () => publicCall(`firms/${encodeURIComponent(firmKey)}/branding`, PublicBrand) });
  return { brand: q.data && HEX.test(q.data.colour) ? q.data : null, settled: !q.isPending || !firmKey };   // a read that does not fit: no brand
}

/** How long a page that has found its firm waits for the brand before it draws without one (break M2). */
export const BRAND_WAIT_MS = 3000;
/** The brand a page draws, decided once per firm: the read's, when it has ended in time and names this page's firm (the booking
 *  read gives the firm's name, never its key: a manage link opened under another firm's address must not wear that firm's
 *  brand, break M1); else none. `waiting` while the page has its firm but not yet the decision (it shows its loading state). */
export function useDrawnBrand(firmKey: string, firm: string | undefined) {
  const { brand, settled } = usePublicBrand(firmKey);
  const [late, setLate] = React.useState<string | null>(null);
  const decided = React.useRef<{ key: string; firm: string; brand: PublicBrand | null } | null>(null);
  React.useEffect(() => {
    if (firm === undefined || settled) return;
    const t = setTimeout(() => setLate(firmKey), BRAND_WAIT_MS);
    return () => clearTimeout(t);
  }, [firmKey, firm, settled]);
  if (decided.current && (decided.current.key !== firmKey || decided.current.firm !== firm)) decided.current = null;
  if (!decided.current && firm !== undefined && (settled || late === firmKey)) decided.current = { key: firmKey, firm, brand: brand && brand.name === firm ? brand : null };
  return { brand: decided.current?.brand ?? null, waiting: firm !== undefined && !decided.current };
}

/** The page's primary colour, its focus ring (break m1) and the header rule's colour, as CSS custom properties on the frame. */
export const brandStyle = (b: PublicBrand | null): React.CSSProperties | undefined =>
  b ? ({ "--color-primary": b.colour, "--color-primary-hover": darker(b.colour), "--color-ring": b.colour, "--brand-rule": b.colour } as React.CSSProperties) : undefined;

/** The tab's icon while the page is open; the app's own icon comes back when it closes or the firm has none. */
export function useFavicon(link: string | null) {
  React.useEffect(() => {
    if (!link) return;
    const el = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]') ?? document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" }));
    const before = el.getAttribute("href"), type = el.getAttribute("type");
    el.setAttribute("href", link); el.removeAttribute("type");
    return () => { if (before === null) el.removeAttribute("href"); else el.setAttribute("href", before); if (type !== null) el.setAttribute("type", type); };
  }, [link]);
}

/** An image of the brand that simply goes away if its link stops answering (a replaced image's old link is 404). */
export function BrandImage({ src, ...rest }: { src: string } & Omit<React.ComponentProps<"img">, "src">) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  return failed ? null : <img src={src} onError={() => setFailed(true)} {...rest} />;
}
