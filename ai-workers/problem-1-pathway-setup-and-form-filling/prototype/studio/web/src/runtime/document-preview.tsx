// CS-D5 part 2 (R1.68, map row 68; concept screens/CS-D5/concept.md r2.1, approved by the tech lead on #3005): a case
// officer reads a client's uploaded file beside the case without downloading it. Opened from the file's name on its
// checklist line (checklist.tsx). The rules (concept §3):
//   BR-2 one short-lived, single-use link (part 1, api/src/case-documents-preview.ts); the bytes are fetched once into
//        memory and drawn on a canvas: never an <iframe>, <embed> or the browser's own PDF plug-in, no URL to the file.
//   BR-3 nothing in the file runs: PDF.js (pdfjs-dist 6, which has no eval or Function path at all) draws pictures of
//        the pages; no annotation or scripting layer, no XFA, the worker from our own origin.
//   BR-5 page turns, zoom and rotate read from memory and write nothing; BR-6 they change the view only and are forgotten
//        on close; BR-7 a link refused before its one fetch (expired, used) is asked for once more, then "could not open".
// Scan state: case files have none until PF-F3 (R1.66); the panel says what the API says and never claims "clean".
import * as React from "react";
import { RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api, ApiError, getActor } from "@/lib/api";
import { Button, Notice, Panel, Pill } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/skeleton";

type Link = { url: string; media_type: string; file_name: string; size_bytes: number; uploaded_at: string; scan: string; contains_scripts: boolean };
type Drawn = { pages: number; draw: (page: number, canvas: HTMLCanvasElement, width: (natural: number) => number, rotation: number) => Promise<void>; close: () => void };
type Shown = { kind: "loading" } | { kind: "ready"; link: Link; doc: Drawn } | { kind: "refused"; title: string; text: string; again?: boolean };
type Zoom = "fit" | "100" | "200";

const TYPES: Record<string, string> = { "application/pdf": "PDF", "image/png": "PNG", "image/jpeg": "JPEG" };
const BROKEN = { kind: "refused", title: "The file could not be opened", text: "The file could not be opened. It may be damaged, or it changed since it was uploaded. Ask for it again." } as const;
const CSS_PER_PT = 96 / 72;   // "100%" as Mozilla's viewer means it: one PDF point at its printed size on screen
const day = (at: string) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The one link (asked again once only when its fetch is refused), then the bytes into memory (BR-2, BR-7). */
async function load(documentId: string): Promise<Shown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let link: Link;
    try { link = await api<Link>(`/runtime/documents/${documentId}/preview-link`, { method: "POST" }); }
    catch (e) {
      const s = e instanceof ApiError ? e.status : 0;
      if (s === 409) return { kind: "refused", title: "Checking for viruses…", text: "This file is still being checked. Try again in a minute.", again: true };
      if (s === 410) return { kind: "refused", title: "Removed — infected file", text: "The virus check found a problem, so this file cannot be opened. Ask the client to upload it again." };
      return { kind: "refused", title: "The file could not be opened", text: (e as Error).message };
    }
    if (!TYPES[link.media_type]) return { kind: "refused", title: "No preview for this file type", text: "Only PDF, PNG and JPEG files open here." };
    const res = await fetch(link.url, { headers: { "x-actor": getActor() }, cache: "no-store" }).catch(() => null);
    if (!res?.ok) continue;
    try { return { kind: "ready", link, doc: await drawer(link.media_type, await res.arrayBuffer()) }; } catch { return BROKEN; }
  }
  return BROKEN;
}

/** One way to draw a page for both PDFs and images: onto a canvas, at the width asked, turned by the view's rotation. */
async function drawer(media: string, bytes: ArrayBuffer): Promise<Drawn> {
  if (media !== "application/pdf") {
    const img = await createImageBitmap(new Blob([bytes], { type: media }));
    return { pages: 1, close: () => img.close(), draw: async (_p, canvas, width, rotation) => {
      const turned = rotation % 180 !== 0, w0 = turned ? img.height : img.width, h0 = turned ? img.width : img.height;
      const css = width(w0 / CSS_PER_PT), scale = css / w0, dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w0 * scale * dpr); canvas.height = Math.round(h0 * scale * dpr);
      canvas.style.width = `${Math.round(w0 * scale)}px`; canvas.style.height = `${Math.round(h0 * scale)}px`;
      const g = canvas.getContext("2d")!; g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      g.translate(w0 / 2, h0 / 2); g.rotate((rotation * Math.PI) / 180); g.drawImage(img, -img.width / 2, -img.height / 2);
    } };
  }
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes), enableXfa: false, disableAutoFetch: true, disableStream: true, stopAtErrors: true });
  const pdf = await loading.promise;
  let task: { cancel: () => void; promise: Promise<void> } | null = null;
  return { pages: pdf.numPages, close: () => { task?.cancel(); void loading.destroy(); }, draw: async (n, canvas, width, rotation) => {
    task?.cancel();
    const page = await pdf.getPage(n), turn = (page.rotate + rotation) % 360;
    const base = page.getViewport({ scale: 1, rotation: turn }), vp = page.getViewport({ scale: width(base.width) / base.width, rotation: turn });
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(vp.width * dpr); canvas.height = Math.round(vp.height * dpr);
    canvas.style.width = `${Math.round(vp.width)}px`; canvas.style.height = `${Math.round(vp.height)}px`;
    task = page.render({ canvas, viewport: vp, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
    try { await task.promise; } catch (e) { if ((e as Error)?.name !== "RenderingCancelledException") throw e; }
  } };
}

/** The preview panel (concept §4): header facts, toolbar (page, zoom, rotate), one page drawn at a time in the only
 *  scrolling area, footer Close. Accept joins the footer with CS-D1 part 2's accept route (not on main yet). */
export function DocumentPreview({ documentId, label, uploadedBy, close, returnFocus }: { documentId: string; label: string; uploadedBy: string; close: () => void; returnFocus: () => HTMLElement | null }) {
  const [shown, setShown] = React.useState<Shown>({ kind: "loading" });
  const [page, setPage] = React.useState(1), [zoom, setZoom] = React.useState<Zoom>("fit"), [rotation, setRotation] = React.useState(0);
  const [avail, setAvail] = React.useState(0), [drawing, setDrawing] = React.useState(false);
  const area = React.useRef<HTMLDivElement>(null), canvas = React.useRef<HTMLCanvasElement>(null), atEnd = React.useRef<"top" | "bottom">("top");
  const open = React.useCallback(() => { setShown({ kind: "loading" }); void load(documentId).then(setShown); }, [documentId]);
  React.useEffect(open, [open]);
  const doc = shown.kind === "ready" ? shown.doc : null;
  React.useEffect(() => () => doc?.close(), [doc]);
  // Fit width follows the page area's width (the panel is wider on wide screens, full width on phones).
  React.useEffect(() => {
    const el = area.current; if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth - 32)); ro.observe(el); return () => ro.disconnect();
  }, [shown.kind]);
  React.useEffect(() => {
    if (!doc || !canvas.current || avail <= 0) return;
    let live = true; setDrawing(true);
    const width = (natural: number) => (zoom === "fit" ? avail : natural * CSS_PER_PT * (zoom === "200" ? 2 : 1));
    doc.draw(page, canvas.current, width, rotation).then(() => {
      if (!live || !area.current) return;
      area.current.scrollTop = atEnd.current === "bottom" ? area.current.scrollHeight : 0; atEnd.current = "top";
    }, () => { if (live) setShown(BROKEN); }).finally(() => { if (live) setDrawing(false); });
    return () => { live = false; };
  }, [doc, page, zoom, rotation, avail]);
  const pages = doc?.pages ?? 0;
  const turn = (to: number, end: "top" | "bottom" = "top") => { if (to < 1 || to > pages) return false; atEnd.current = end; setPage(to); return true; };
  // m4: PageDown scrolls the page area and turns to the next page only at its bottom (PageUp likewise), as Mozilla's viewer.
  const keys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (e.key === "PageDown" && el.scrollTop + el.clientHeight >= el.scrollHeight - 2 && turn(page + 1)) e.preventDefault();
    if (e.key === "PageUp" && el.scrollTop <= 1 && turn(page - 1, "bottom")) e.preventDefault();
  };
  const link = shown.kind === "ready" ? shown.link : null;
  const zoomBtn = (z: Zoom, words: string, tip: string) => <Button key={z} size="sm" variant={zoom === z ? "secondary" : "ghost"} aria-pressed={zoom === z} title={tip} onClick={() => setZoom(z)} data-preview-zoom={z}>{words}</Button>;
  return (
    <Panel open wide onOpenChange={(o) => { if (!o) close(); }} returnFocus={returnFocus} title={link?.file_name ?? "Preview"} description={label}
      badge={link ? (link.scan === "CLEAN" ? <Pill tone="ok" title="Scanned for viruses before it could be opened">Checked: clean</Pill>
        : <Pill tone="warn" title="Virus checks on case files are not built yet; the file is only shown as pictures of its pages">Not scanned yet</Pill>) : null}
      footer={<Button variant="secondary" onClick={close} data-preview-close>Close</Button>}>
      <div className="flex h-full min-h-0 flex-col gap-3" data-document-preview data-preview-state={shown.kind}>
        {shown.kind === "loading" ? <div className="space-y-2" role="status"><p className="text-sm text-text-muted">Opening the file…</p><Skeleton className="h-96 w-full" /></div> : null}
        {shown.kind === "refused" ? <Notice tone={shown.again ? "info" : "danger"} title={shown.title} action={shown.again ? <Button size="sm" variant="secondary" onClick={open}>Try again</Button> : undefined}><span data-preview-refused>{shown.text}</span></Notice> : null}
        {link ? <>
          <p className="text-[13px] text-text-muted [overflow-wrap:anywhere]" data-preview-facts>{TYPES[link.media_type]} · {kb(link.size_bytes)} · Uploaded {day(link.uploaded_at)} by {uploadedBy}</p>
          {link.contains_scripts ? <Notice tone="warn" title="Contains scripts: opened only in the safe viewer"><span data-preview-scripts>The file is shown as pictures of its pages. Nothing in it runs.</span></Notice> : null}
          <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Page view">
            {pages > 1 ? <>
              <Button size="sm" variant="ghost" aria-label="Previous page" title="Previous page" disabled={page <= 1} onClick={() => turn(page - 1)} data-preview-prev><ChevronLeft /></Button>
              <span className="text-sm tabular-nums" aria-live="polite" data-preview-page>Page {page} of {pages}</span>
              <Button size="sm" variant="ghost" aria-label="Next page" title="Next page" disabled={page >= pages} onClick={() => turn(page + 1)} data-preview-next><ChevronRight /></Button>
            </> : null}
            <div role="group" aria-label="Zoom" className="flex gap-1">{zoomBtn("fit", "Fit width", "The page fills the width of the panel")}{zoomBtn("100", "100%", "The page at its printed size")}{zoomBtn("200", "200%", "Twice the printed size")}</div>
            <Button size="sm" variant="ghost" title="Turns the view only; the file is not changed" onClick={() => setRotation((r) => (r + 90) % 360)} data-preview-rotate><RotateCw />Rotate</Button>
          </div>
        </> : null}
        <div ref={area} tabIndex={doc ? 0 : -1} role="region" aria-label={doc ? `Page ${page} of ${pages}` : "Page"} aria-busy={drawing || undefined} onKeyDown={keys}
          className={`min-h-0 flex-1 overflow-auto rounded-lg bg-text/5 p-4 ${doc ? "" : "hidden"}`} data-preview-area>
          <canvas ref={canvas} className="mx-auto block bg-white shadow" data-preview-canvas data-rotation={rotation} />
        </div>
      </div>
    </Panel>
  );
}
