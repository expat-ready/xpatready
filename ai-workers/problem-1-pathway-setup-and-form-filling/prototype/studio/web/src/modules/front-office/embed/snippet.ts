// FO-4b (AG-2-5 rule 2): the one snippet a firm copies onto its own site: a link to the hosted form (what a visitor
// gets when the script is blocked or the site is not allowed) and the script that draws the form in its place
// (form-embed.js, served at /api/public/embed/form.js). The browser suite builds its test page from it, so what the firm
// copies is what is tested. Sales › Settings › Web form (FO-4w, web-form-settings-page.tsx) shows it with Copy, beside
// the allowed sites the embed needs.
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `base` is our site's origin (scheme, host, port); `token` the form's public token. */
export function embedSnippet(base: string, token: string, linkText = "Send us an enquiry"): string {
  const origin = new URL(base).origin, t = encodeURIComponent(token);
  return `<div data-expatready-form="${attr(token)}"><a href="${attr(`${origin}/front-office/web-form/${t}`)}">${attr(linkText)}</a></div>\n`
    + `<script src="${attr(`${origin}/api/public/embed/form.js`)}" async></script>`;
}
