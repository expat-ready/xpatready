// PF-13 part 2 (concept screens/PF-13 §4; AG-1-9 "a live preview SHALL be shown before save"): the three previews, drawn from the
// values on the form, saved or not. The email one follows the one email layout (api/src/platform/messages/layout/email-layout.ts:
// logo, name, the brand colour as the header's rule). Every firm value is text or an <img> source: nothing is placed as HTML.
import * as React from "react";

export type PreviewValues = { firmName: string; senderName: string; colour: string; logo: string | null; favicon: string | null; banner: string | null };

function Figure({ title, name, children }: { title: string; name: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <figure aria-labelledby={id} data-preview={name} className="m-0 flex flex-col gap-1.5">
      <figcaption id={id} className="text-xs font-medium text-text">{title}</figcaption>
      <div className="overflow-hidden rounded-lg border border-border bg-white text-[#1f2933]">{children}</div>
    </figure>
  );
}
const Logo = ({ src, name, className }: { src: string | null; name: string; className: string }) => (src ? <img data-preview-logo src={src} alt={`${name} logo`} className={className} /> : null);
const Lines = () => <div aria-hidden className="flex flex-col gap-1.5 px-4 py-3"><span className="h-2 w-3/4 rounded bg-[#e4e7eb]" /><span className="h-2 w-1/2 rounded bg-[#e4e7eb]" /></div>;

export function BrandingPreview({ v }: { v: PreviewValues }) {
  return (
    <section aria-labelledby="branding-preview-h" className="flex flex-col gap-4" data-branding-preview data-preview-colour={v.colour}>
      <div><h2 id="branding-preview-h" className="text-lg font-semibold">Preview</h2>
        <p className="text-sm text-text-muted">This is how clients will see your firm. Nothing is saved until you press Save.</p></div>
      <Figure title="Client page" name="page">
        <div className="flex items-center gap-2 border-b border-[#e4e7eb] bg-[#f4f5f7] px-3 py-1.5 text-xs">
          {v.favicon ? <img data-preview-favicon src={v.favicon} alt="Favicon" className="size-4 shrink-0 object-contain" /> : <span aria-hidden className="size-4 shrink-0 rounded-sm bg-[#cbd2d9]" />}
          <span className="min-w-0 truncate">{v.firmName}</span>
        </div>
        {v.banner ? <img data-preview-banner src={v.banner} alt="Banner" className="block h-20 w-full object-cover" /> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderTop: `4px solid ${v.colour}` }}>
          <div className="flex min-w-0 items-center gap-3"><Logo src={v.logo} name={v.firmName} className="h-10 max-w-32 shrink-0 object-contain" />
            <span className="min-w-0 text-base font-semibold [overflow-wrap:anywhere]">{v.firmName}</span></div>
          <span data-preview-button className="rounded-md px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: v.colour }}>Continue</span>
        </div>
        <Lines />
      </Figure>
      <Figure title="Email" name="email">
        <p className="border-b border-[#e4e7eb] px-4 py-1.5 text-xs">From: <span data-preview-sender className="font-medium [overflow-wrap:anywhere]">{v.senderName}</span></p>
        <div className="px-4 py-3" style={{ borderBottom: `3px solid ${v.colour}` }}>
          <Logo src={v.logo} name={v.firmName} className="mb-2 block h-12 max-w-full object-contain" />
          <p className="text-lg font-bold [overflow-wrap:anywhere]">{v.senderName}</p>
        </div>
        <Lines />
      </Figure>
      <Figure title="PDF document" name="pdf">
        <div className="mx-4 flex items-center gap-3 pb-2 pt-4" style={{ borderBottom: `2px solid ${v.colour}` }}>
          <Logo src={v.logo} name={v.firmName} className="h-8 max-w-28 shrink-0 object-contain" />
          <span className="min-w-0 text-sm font-semibold [overflow-wrap:anywhere]">{v.firmName}</span>
        </div>
        <Lines />
      </Figure>
    </section>
  );
}
