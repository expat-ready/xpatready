// PF-13 part 1a (row 47 "one email layout with the firm's branding"; AG-1-9, AG-16-2; P-629, P-630; gate entry 16): the
// one email layout, built with react-email 6.11.6's components (tables and inline styles, so Outlook draws it) through
// React.createElement (no JSX, no tsconfig change). It draws the firm's sender name, its logo (part 1b gives the link),
// its brand colour as the header's rule, the body, AG-16-2's footer (address, phone, licence text) and the "Sent by" line.
// Never the tagline, banner or favicon (P-629: deliverability). Every firm value is text: React escapes it. The body's own
// HTML (a template's, already escaped field by field by the caller) is placed as given. ports/messages.ts keeps a
// plain-string layout() for the fake (ports are zod only); the adapter replaces it with this one before it stores the message.
import { createElement as h, type ReactNode } from "react";
import { Body, Container, Head, Html, Img, Section, Text, render } from "react-email";
import type { EmailBrand } from "../../branding/branding.ts";

const FONT = "Arial,Helvetica,sans-serif";
const lines = (t: string, style: Record<string, string>) => t.split(/\n{2,}/).map((p, i) => h(Text, { key: i, style }, ...p.split("\n").flatMap((l, j) => j ? [h("br", { key: j }), l] : [l])));

/** The rendered HTML of one firm email. `replyable` false: a platform account message, nobody to reply to. */
export async function emailLayout(brand: EmailBrand, words: { subject: string; text: string; html?: string }, replyable = true): Promise<string> {
  const p = { margin: "0 0 16px", fontSize: "15px", lineHeight: "22px", color: "#1f2933", fontFamily: FONT };
  const header: ReactNode[] = [];
  // Width and height as attributes too: Outlook ignores CSS sizes (review m8 on #2624).
  if (brand.logoUrl) { const w = brand.logoWidth ?? 48, ht = brand.logoHeight ?? 48; header.push(h(Img, { key: "logo", src: brand.logoUrl, alt: brand.name, width: String(w), height: String(ht), style: { display: "block", width: `${w}px`, height: `${ht}px`, margin: "0 0 8px" } })); }
  header.push(h(Text, { key: "name", style: { margin: "0", fontSize: "18px", fontWeight: "bold", color: "#1f2933", fontFamily: FONT } }, brand.name));
  const body = words.html !== undefined ? h("div", { style: p, dangerouslySetInnerHTML: { __html: words.html } }) : lines(words.text, p);
  const small = { margin: "0 0 8px", fontSize: "12px", lineHeight: "18px", color: "#52606d", fontFamily: FONT };
  const doc = h(Html, { lang: "en" },
    h(Head, null, h("title", null, words.subject)),
    h(Body, { style: { margin: "0", backgroundColor: "#f4f5f7", fontFamily: FONT } },
      h(Container, { style: { maxWidth: "600px", backgroundColor: "#ffffff" } },
        h(Section, { style: { padding: "16px 24px", borderBottom: `3px solid ${brand.colour}` } }, ...header),
        h(Section, { style: { padding: "24px" } }, body),
        h(Section, { style: { padding: "16px 24px", borderTop: "1px solid #e4e7eb" } },
          ...(brand.footer ? lines(brand.footer, small) : []),
          h(Text, { style: small }, `Sent by ${brand.name}.${replyable ? " Reply to this email to reach them." : ""}`)))));
  return render(doc);
}
