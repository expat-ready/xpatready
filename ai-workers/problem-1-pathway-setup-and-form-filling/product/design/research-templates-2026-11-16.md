# Templates: build or buy? Research for the founder

Date read: 16 Nov 2026 (all prices and facts below were read on this date).
Scope: (a) email and WhatsApp message templates; (b) Word document templates (retainer and consultation agreements), PDF output, hand-off to signing.
Method: facts come from each project's own GitHub repository (stars, licence, latest release, read through the GitHub API), the npm registry (latest version and date), the GitHub security advisory database, and the vendors' own pricing and docs pages. Anything not from those is marked **Unverified**. Legal readings of licences are marked **Unconfirmed: no counsel**.

---

## 1. The short answer

1. **Keep our own template registry (PF-19c).** Nothing on the market gives us per-firm templates, per-module field lists, versions and our tenancy rules without either lock-in or a per-firm bill. The registry is the part that is ours.
2. **Do not hand-build the message editor (PF-19s).** Adopt the free, open-source **React Email Editor** (`@react-email/editor`, MIT, built on Tiptap). It gives a modern editor, slash commands, columns, themes and email-ready HTML. Our field picker becomes a small "mention" add-on (Tiptap's mention feature is already one of its parts).
3. **Do not let firms write a template language.** The security record of the popular template languages is poor for this use: Handlebars had 10 advisories in 2026, three of them critical code-execution flaws (Oct 2026); LiquidJS had a critical code-execution flaw in May 2026 and several more since. Instead, store fields as structured "field chips" and fill them ourselves from an allow-list. Plain words: firms pick fields from a list; they never type code.
4. **Keep docxtemplater for Word, on its free core.** Conditions and loops are in the free core (the founder's deferred "conditional sections" need no paid module). Buy at most one paid module later (Image, for the firm logo inside Word) at €500 a year.
5. **Add Gotenberg (MIT, free, self-hosted) for Word-to-PDF.** It wraps LibreOffice and Chromium in one container. No paid API is needed for PDF.
6. **Do not adopt a notification platform (Knock, Courier, Novu) now.** Their per-firm branding and multi-tenancy sit in "Enterprise, contact sales" tiers, and WhatsApp templates are controlled by Meta's approval process anyway.
7. **Do not adopt a document-generation API (Carbone Cloud, Docmosis, PDFMonkey, Documint, PandaDoc).** Our volumes are small, the free tools cover the need, and each would add a second place where client data lives.

Rough saving versus the current plan: about **8 to 13 builder-days** now, and **15 to 25 builder-days** of the deferred extras become cheap or free (section 8). These are my estimates, not measured.

---

## 2. Message templates: the candidates

### 2.1 Editors (what the firm admin types into)

| Tool | What it is | Licence and what it obliges us | Maturity (16 Nov 2026) | Customise? | Fit |
|---|---|---|---|---|---|
| **React Email Editor** (`@react-email/editor`) | Embeddable visual email editor built on Tiptap/ProseMirror; bubble menus, slash commands, 2-4 columns, themes, image upload, exports email-ready HTML and plain text, custom extensions | MIT: keep the copyright notice; nothing else | Part of react-email (19,939 stars). Editor package first published 18 Feb 2026, latest 1.8.7 on 13 Nov 2026. Young: under one year old | Full: it is React code in our app; custom nodes for field chips and firm footer | **Best fit.** Same stack as ours (React, TypeScript). Field picker = Tiptap "mention" extension, already a dependency. Merge fields are not documented as a built-in feature, so we add them (small) |
| **React Email** (components + `render`) | Write email layouts as React components; renders to HTML that works in Outlook/Gmail | MIT | 19,939 stars; latest release 13 Nov 2026; backed by Resend | Full | Use for our **fixed outer layout** (logo, colours, footer) that wraps every firm's message |
| **MJML** | Markup language that compiles to email-safe HTML | MIT | 18,294 stars; stable 5.4.1 (Sep 2026), v6 alpha Oct 2026 | Full | Good engine, but a second layout language next to React Email. Two past path-traversal advisories (`mj-include`, latest Dec 2025): never let tenants use includes |
| **Unlayer** (`react-email-editor`) | Polished drag-and-drop email builder; the React wrapper is MIT but the editor itself loads from Unlayer's servers (`editor.unlayer.com/embed.js`) | Wrapper MIT; the editor is a **paid hosted service**. Pricing: Free; Launch US$250/mo (white-label, custom tools); Scale US$750/mo (smart merge tags, header and footer, team collaboration); Optimize US$2,000/mo; on-premise only on Enterprise (custom). Source: https://unlayer.com/pricing | Wrapper 5,258 stars, 2.1.3 (Oct 2026) | Medium: custom tools and CSS on higher tiers; the core is closed | Works, but our users' editor would depend on a third-party script and a US$3,000-9,000 a year bill; branding removal needs a paid tier. Lock-in: designs are Unlayer JSON |
| **GrapesJS** (+ newsletter preset, + `grapesjs-mjml`) | Open-source page/email builder framework | Core BSD-3-Clause (permissive; keep notice). Preset BSD-3 | Core 26,407 stars, 0.23.9 (Nov 2026; still pre-1.0). Newsletter preset last release Jun 2023. XSS advisory fixed in 0.19.5 (2022). Paid "Studio SDK" for embedding is Enterprise, contact sales (https://grapesjs.com/pricing) | Very high, but you build a lot of the UI yourself | Too heavy for "booking confirmation" texts; it is a page builder. Good only if we later want marketing newsletters |
| **Easy Email Editor** | Drag-and-drop email editor on React + MJML | MIT (free part); paid "Easy Email Pro" adds cross-browser support, React 19, responsive mobile UI. Pro price not published | 2,991 stars; npm 4.17.1 (Jun 2026); no GitHub releases; last push Aug 2026. Open-source version **supports Chrome only** (its own README) | High | Not recommended: Chrome-only free version, slowing activity, paid path unpriced |
| **Maizzle** | Build-time framework for coding HTML emails with Tailwind | MIT | 1,622 stars; 6.3.2 (Nov 2026) | Full | Developer tool, not a tenant editor. Not needed if we use React Email |

### 2.2 Merge-field filling (how {client name} becomes "Client A")

| Tool | Safety record (GitHub advisory database) | Verdict |
|---|---|---|
| **Handlebars** (MIT, 18,692 stars, 4.7.10 Oct 2026) | 10 advisories in 2026 alone, including 3 critical "JavaScript injection" flaws on 8 Oct 2026; older remote-code-execution flaws (2019, 2021). It compiles templates into JavaScript | **Do not use for tenant-written templates** |
| **LiquidJS** (MIT, 1,888 stars, 10.30.1 Oct 2026) | Designed for untrusted templates (Shopify-style), with `ownPropertyOnly`, `outputEscape: "escape"`, `strictVariables`, memory and render limits. But: critical remote-code-execution flaw fixed in 10.26.0 (May 2026); more than 10 advisories since May 2026, latest 7 Oct 2026 (an `ownPropertyOnly` bypass) | Usable with strict settings and fast patching; still a standing risk |
| **Mustache** (logic-less; MIT, 16,723 stars) | 2 advisories ever; but last release 2021 | Safe idea, stale project |
| **Our own fill from field chips** | No template language at all: the editor stores `{type: "field", key: "booking.date"}` nodes; the server looks each key up in a per-module allow-list, HTML-escapes the value and inserts it | **Recommended.** Smallest attack surface; about 1-2 days to build; also gives "must-fill" checks for free (we know every field used) |

### 2.3 Notification platforms (editor + sending + logs as a service)

| Platform | Licence / model | Public price (read 16 Nov 2026) | Multi-tenant fit | Lock-in |
|---|---|---|---|---|
| **Novu** | Core MIT; `/enterprise` folder commercial. Repo 40,341 stars, active (push 15 Nov 2026) | Free 10,000 workflow runs/mo; Pro from US$30/mo (30,000 runs, advanced email editor, removes Novu branding); Team from US$250/mo; **self-hosting listed as Enterprise**; overage US$1.20 per 1,000 runs. https://novu.co/pricing | Multi-tenancy not stated on the pricing page. WhatsApp Business provider support: **Unverified** | Medium: workflows defined in Novu |
| **Knock** | Commercial SaaS | Free to 10,000 messages; Starter US$250/mo with 50,000 included, then US$0.005 each; **per-tenant branding is Enterprise only**; translations Enterprise only; version history on all tiers. https://knock.app/pricing | Good concepts (tenants built in), but branding per firm needs Enterprise | High |
| **Courier** | Commercial SaaS | Free 10,000 sends/mo; Business US$0.005 per send (all sends); **multi-tenant support Enterprise only**. https://www.courier.com/pricing | Enterprise only | High |

Cost at our scale (my assumption: about 300 messages a firm a month):

| | 50 firms (≈15,000/mo) | 100 firms (≈30,000/mo) |
|---|---|---|
| Novu cloud | ≈US$30/mo (Pro) | ≈US$30/mo (Pro) |
| Knock | US$250/mo Starter, but per-firm branding needs Enterprise (no public price) | same |
| Courier | ≈US$75/mo, but multi-tenant needs Enterprise (no public price) | ≈US$150/mo, same caveat |

Why not now: (1) the features we need (per-firm branding, tenants) sit behind "contact sales"; (2) the editor would be theirs, not inside our screens; (3) client data (names, case updates) leaves our system to another US processor, which adds a privacy review; (4) WhatsApp needs Meta-approved templates anyway (below). Revisit if we need digests, in-app inbox and delivery analytics across many channels.

### 2.4 Sending services (SendGrid, Postmark)

| | Template features | Fit |
|---|---|---|
| **SendGrid** dynamic templates | Handlebars-based; templates have versions and one "active" version; visual Design Editor and Code Editor; per-account template limits (number not stated on the page). https://www.twilio.com/docs/sendgrid/ui/sending-email/how-to-send-an-email-with-dynamic-templates | Templates live in **our** SendGrid account, not per firm; editing would happen in SendGrid's console. Use SendGrid/Postmark only as the **pipe**: we send finished HTML |
| **Postmark** | Mustachio (logic-light, HTML-escapes by default), shared Layouts for header/footer. https://postmarkapp.com/support/article/1077-template-syntax | Same: good delivery, not a tenant editor |

### 2.5 WhatsApp: a hard outside rule

Meta's own docs: outside a 24-hour customer-service window, only **Meta-approved message templates** can be sent; each template has a category (utility, marketing, authentication), placeholders `{{1}}` or named `{{first_name}}`, an example value per placeholder, and automatic review that can take up to 24 hours; approved templates can later be paused or disabled. Source: https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/

What this means for us: a WhatsApp reminder is not freely editable like an email. Our registry must store the WhatsApp text in Meta's format, submit it for approval per firm's WhatsApp number, and track status (pending, approved, rejected, paused). No editor or platform removes this step. **Start Meta business verification early** (an outside dependency with lead time).

---

## 3. Document templates: the candidates

| Tool | What it does | Licence and obligation | Maturity | Safety | Fit and cost |
|---|---|---|---|---|---|
| **docxtemplater** + pizzip (current plan) | Fills `{tags}` in a firm's own Word file; keeps their formatting | Dual MIT or GPLv3: we choose MIT (keep the notice). Paid modules are commercial | 3,651 stars; 3.71.1 on 15 Oct 2026; one main maintainer | Default parser only looks up `scope[tag]`, no expressions. The optional "angular expressions" parser had 4 remote-code-execution advisories (latest May 2026); if we ever use it: angular-expressions 1.5.2 or newer, `csp: true` (default from 3.68.7), `disabledSyntaxes: ["CallExpression"]` (docxtemplater's own security notes) | **Keep.** Free core includes `{tag}` replacement, **conditions and loops** (https://docxtemplater.com/pricing/). Paid: One module €500/yr; PRO €1,250/yr (up to 4 modules, 5 instances); Enterprise €3,000/yr (all 19 modules); Premium €9,000/yr. Useful paid modules: Image (logo), HTML (rich text into Word), Styling, Table. Whether SaaS use is allowed is **not stated**: ask before buying |
| **Carbone** | Fills DOCX/ODT/XLSX and converts to PDF; self-hosted or cloud API | **Carbone Code License 2.0** (source-available, not open source). Free to use inside our product, but **not** to offer it as a hosted document-generation service or a competing generator (licence summary, effective 26 Oct 2026). **Unconfirmed: no counsel** | 2,147 stars; npm 3.9.2 on 12 Nov 2026 | Template language with formatters; no code execution claimed. Not independently checked | Community (free self-host): substitutions, loops, conditions, formatters. PDF conversion and versioning appear to be Enterprise features (page ambiguous). Cloud: Free 100 docs/mo; Essential €29/mo for 1,000; Essential Plus €95/mo for 5,000. On-prem Fit €1,500; Unlimited from €2,940/yr. https://carbone.io/pricing.html. Not better than docxtemplater + Gotenberg for us; licence is a restriction |
| **Docmosis** | DOCX templates to PDF/DOCX | Commercial | Long-standing vendor | Not checked | Cloud US$49-78/mo (4,000+ pages, no overage charge); self-host Tornado US$3,795 one-off (50 templates) to US$17,145 (unlimited). https://www.docmosis.com/products/cloud/pricing.html. T-100's 50-template cap is too low for 100 firms × several templates |
| **PDFMonkey** | HTML/CSS templates rendered to PDF in Chrome | Commercial SaaS (EU) | n/a | Templates are HTML + JavaScript | €15/mo for 3,000 docs. https://pdfmonkey.io/pricing. **Wrong shape:** firms bring Word files, not HTML |
| **Documint** | Template-to-PDF service | Commercial SaaS; **not SOC 2** (its own page) | n/a | n/a | US$39/mo (2,400 docs/yr) to US$249/mo; DOCX upload not mentioned. https://documint.me/pricing. Not a fit |
| **PandaDoc API** | Documents, templates, e-signature in one | Commercial | n/a | n/a | Free 5 docs/mo; API Developer US$40/mo for 40 docs; Enterprise custom. https://www.pandadoc.com/api/pricing/. Would replace both our filling and our signing port; deep lock-in |
| **BoldSign API** (our signing vendor) | Templates from uploaded DOCX/PDF, text tags that become signature fields, prefilled field values | Commercial | n/a | n/a | US$30/mo base with 40 envelopes, then US$0.75 each; unlimited templates; custom branding. https://boldsign.com/esignature-api-pricing/ ; template API: https://developers.boldsign.com/template/create-template/ |
| **Gotenberg** | Docker API: Word to PDF (LibreOffice), HTML to PDF (Chromium), merge, PDF/A, stamping, form fill | MIT | 13,598 stars; 9.5.1 on 14 Nov 2026; very active | The repo gives no guidance on untrusted input. Our rule: run it only on the private network, never public; it should not fetch outside URLs. Treat this as our hardening, not its claim | **Adopt** for PDF. Free; one more container to run |

**BoldSign tip that saves work:** put BoldSign "text tags" (signature, date, initials markers) in the firm's Word template. docxtemplater fills the client data; BoldSign turns the tags into signing fields. No hand-placing of signature boxes per firm. Keep the tags behind our signing port so a second vendor can map them.

Signing cost at our scale (assumption: 5 signed agreements a firm a month): 50 firms ≈ 250 envelopes ≈ US$30 + 210 × 0.75 = **≈US$188/mo**; 100 firms ≈ 500 envelopes ≈ **≈US$375/mo** (BoldSign's own worked example matches the 500 figure).

Document generation cost at our scale (assumption: 20 documents a firm a month): 1,000 or 2,000 docs a month. Self-hosted docxtemplater + Gotenberg: **€0 in licences** (plus hosting). Carbone Cloud would be €29-95/mo; Docmosis Cloud US$49-78/mo.

---

## 4. "Can they be fully customised?"

| Tool | How far | What limits it |
|---|---|---|
| React Email Editor, React Email, MJML, GrapesJS, Easy Email (free), Maizzle, LiquidJS, docxtemplater core, Gotenberg | **Fully.** We own the code in our app; we can fork | Our time. MIT/BSD let us change and ship without opening our code |
| docxtemplater paid modules, Easy Email Pro | High: source shipped to us, but commercial terms | Licence terms (SaaS clause unknown for docxtemplater) |
| Carbone Community | High for use; restricted for resale as a service | Carbone Code License |
| Unlayer, GrapesJS Studio SDK | Medium: configuration, custom tools, CSS on higher tiers | Closed core; price tiers gate features |
| Knock, Courier, Novu cloud, SendGrid, Postmark, PandaDoc, Docmosis, PDFMonkey, Documint, BoldSign | Low: settings and APIs only | Vendor roadmap |

No tool we found uses AGPL, so no tool here would force us to publish our code. (Carbone and Novu enterprise are the two non-permissive cases, both noted above.)

---

## 5. Safety rules that follow from the evidence

1. Firms never write template code. Fields are chips from a per-module allow-list; unknown keys are refused at save time.
2. Every field value is HTML-escaped on fill; rich text from firms is sanitised to an allow-list of tags before saving and again before sending.
3. Never compile tenant text with Handlebars; if LiquidJS is ever used, pin it to the newest version with `ownPropertyOnly`, `outputEscape: "escape"`, `strictVariables`, `strictFilters`, memory and render limits, no file system, and patch within days.
4. docxtemplater stays on its default parser. If we need "if" logic in Word, use its built-in `{#condition}…{/condition}` sections, not the expression parser.
5. No MJML `mj-include`, no outside URLs in templates, no tenant-supplied scripts.
6. Gotenberg on a private network only, with outbound network blocked.
7. Firm logos: stored by us, resized, served from our domain.

---

## 6. Lock-in summary

| Choice | Lock-in |
|---|---|
| React Email Editor, React Email, docxtemplater, Gotenberg | Low: open formats (Tiptap JSON, HTML, DOCX, PDF), MIT |
| Unlayer | Medium-high: Unlayer design JSON and hosted script |
| Novu / Knock / Courier | High: workflows and templates live in the vendor |
| PandaDoc | High: documents, templates and signatures together |
| BoldSign | Low-medium if kept behind our signing port; text tags are a vendor format, map them per vendor |

---

## 7. Recommended stack

| Need | Adopt | Keep ours | Cost at 50 / 100 firms |
|---|---|---|---|
| Template registry: per firm, per module, per channel, status, versions | — | **PF-19c registry** (ours) | €0 |
| Message editor with field picker | **`@react-email/editor`** (MIT) + Tiptap mention for field chips | Field list per module, chip rules | €0 |
| Branded outer layout (logo, colours, footer) | **React Email** components (MIT) | Firm brand settings | €0 |
| Filling message fields | — | **Our own allow-list fill** (no template language) | €0 |
| Preview with a real record | React Email `render` | "Pick a record" picker | €0 |
| Sending email | Existing email sender (SendGrid or Postmark as a pipe) | — | per provider |
| WhatsApp | Meta's template API | Approval status in the registry | Meta's per-message fees |
| Word filling | **docxtemplater core + pizzip** (MIT, already through our gate) | Upload, tag checking, field list | €0; optional Image module €500/yr |
| Conditional sections, loops in Word | docxtemplater core (free) | — | €0 |
| PDF output | **Gotenberg** (MIT, self-hosted) | — | €0 + one container |
| Signing | **BoldSign** behind our signing port, using text tags | Signing port | ≈US$188 / ≈US$375 per month |
| Version history, restore, where-used | — | Ours, in the registry (simple tables) | €0 |
| Not adopted now | Unlayer, GrapesJS, Easy Email, Maizzle, Handlebars, LiquidJS, Knock, Courier, Novu, Carbone, Docmosis, PDFMonkey, Documint, PandaDoc | — | — |

Note: React Email Editor, React Email and Gotenberg are new technology for us and must pass the gate in `product/STANDARDS.md` §1 first. React Email Editor is under a year old; mitigate by storing our own field-chip JSON so we could swap editors.

---

## 8. Build time saved versus the current plan (my estimates, not measured)

| Item | Current plan (build ourselves) | With the recommended stack | Saved |
|---|---|---|---|
| PF-19s editor with field picker | Plain textarea + picker ≈ 5-8 days to reach a modern, safe editor (rich text, links, lists, preview, insert at cursor) | Wire React Email Editor + chip extension ≈ 2-3 days | **≈3-5 days**, and a much better editor |
| Branded email layout that works in Outlook/Gmail | Hand-written HTML tables ≈ 3-5 days | React Email components ≈ 1 day | **≈2-4 days** |
| Merge fields | A template language plus hardening ≈ 3-4 days | Allow-list chip fill ≈ 1-2 days | **≈2 days**, and less risk |
| PDF output | Not planned; a LibreOffice wrapper of our own ≈ 2-3 days | Gotenberg ≈ 0.5-1 day | **≈1-2 days** |
| Deferred: conditional / must-fill sections | Feared paid module or own parser | docxtemplater core sections (free); must-fill from chip list | **≈5-8 days** |
| Deferred: version history, restore, where-used | ≈10-15 days | Same tables, simpler because templates are structured JSON with known field keys | **≈3-5 days** |
| Signature placement per firm | Hand-placed fields per template | BoldSign text tags in the Word file | **≈2-4 days** |

Total: about **8-13 days now** and **10-17 days on the deferred extras**.

---

## 9. Open points for the founder

1. Approve React Email Editor, React Email and Gotenberg to go through the technology gate (STANDARDS §1).
2. Start Meta WhatsApp Business verification and template approval early (outside dependency, lead time).
3. Before buying any docxtemplater module, ask docxtemplater in writing whether a commercial licence covers a multi-tenant SaaS.
4. Carbone's licence and the processor question for notification platforms: **Unconfirmed: no counsel**.

## Sources (all read 16 Nov 2026)

- GitHub repositories and API: mjmlio/mjml, resend/react-email, unlayer/react-email-editor, GrapesJS/grapesjs, GrapesJS/preset-newsletter, zalify/easy-email-editor, maizzle/framework, handlebars-lang/handlebars.js, harttle/liquidjs, janl/mustache.js, novuhq/novu, open-xml-templating/docxtemplater (LICENSE), carboneio/carbone (LICENSE), gotenberg/gotenberg
- GitHub Advisory Database (npm): handlebars, liquidjs, mjml, angular-expressions, grapesjs, mustache, docxtemplater (none found)
- npm registry: @react-email/editor (readme), @react-email/render, mjml, docxtemplater, pizzip, carbone, liquidjs, handlebars, easy-email-editor
- https://react.email/docs/editor/overview · https://react.email/docs/introduction
- https://unlayer.com/pricing · https://docs.unlayer.com/docs/getting-started
- https://grapesjs.com/pricing
- https://novu.co/pricing · https://github.com/novuhq/novu
- https://knock.app/pricing · https://www.courier.com/pricing
- https://www.twilio.com/docs/sendgrid/ui/sending-email/how-to-send-an-email-with-dynamic-templates · https://postmarkapp.com/support/article/1077-template-syntax
- https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/
- https://docxtemplater.com/pricing/ · https://docxtemplater.com/docs/angular-parse/ · https://docxtemplater.com/docs/configuration/
- https://carbone.io/pricing.html · https://www.docmosis.com/products/cloud/pricing.html · https://pdfmonkey.io/pricing · https://documint.me/pricing · https://www.pandadoc.com/api/pricing/
- https://boldsign.com/esignature-api-pricing/ · https://developers.boldsign.com/template/create-template/
- https://github.com/gotenberg/gotenberg

Not verified on the vendor's own page (treat as **Unverified**): Novu's WhatsApp provider and multi-tenancy; Knock's and Courier's WhatsApp support and embedded editors; Docmosis and Carbone template safety; Unlayer free-plan branding.
