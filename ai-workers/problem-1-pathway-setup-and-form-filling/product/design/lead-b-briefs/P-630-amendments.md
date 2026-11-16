# P-630 amendments: adopted email editor, email layout and Word-to-PDF (Lead B (6), rev 16.47, 16 Nov 08:0x IST)

Under P-630 the founder gave the Lead build-or-adopt, and Lead 64 adopted three tools subject to the STANDARDS §1 gate. The gate entries are **15, 16 and 17** in `design/tech-gate-platform-front-office-2026-11-14.md`: a copy of `main`'s file with the three entries added, on branch `lead-b-front-office`, for the Lead to copy whole. The evidence is `design/research-templates-2026-11-16.md` on `lead/2026-11-07-lead31`. **Paste each block above its brief.** Where a block differs from its brief, the block wins.

**Lead B's approval (row owner of the PF/FO gate, STANDARDS §1):**
* **Entry 15, `@react-email/editor` 1.7.18 with Tiptap 3.32.2: approved, with its conditions.** We store our own JSON, the server makes the HTML from an allow-listed schema, versions are pinned exactly, no Tiptap package is below 3.30.5, and the bundle has no CLI packages.
* **Entry 16, `react-email` 6.11.6: approved.** Its code runs on the adapter side, never in `ports/`, and `@react-email/components` (deprecated) is not used.
* **Entry 17, Gotenberg 8.40.0 by digest: approved only with its five conditions.** Only the LibreOffice route is enabled; it sits on the private network with no outbound access; a size cap and timeout apply, with the `.docx` kept on any failure; the port has a fake, so CI runs no container; any advisory is patched within 7 days. It is a security exception to the 14-day rule, because every older release has unpatched critical advisories. Our own LibreOffice-only container is the named fallback.
* Licences: Unconfirmed: no counsel.

## New row PF-Le: the P-630 libraries in one PR (the PF-L rule, P-576 (4))
| PF-Le | records + runtime (libraries) | **Gate entries 15 and 16 into `package.json` and the lockfile, in one small PR:** `@react-email/editor` 1.7.18, `react-email` 6.11.6, and every `@tiptap/*` package the editor needs, at 3.32.2, all exact. Installed with `--before=2026-11-02T23:59:59Z`. **Touch:** `package.json`, the lockfile, the gate file (the install line: lockfile entries added, `npm audit` before and after, including the `react-email` CLI's dependencies) | the exact versions; no `@tiptap/*` below 3.30.5 in the lockfile; `npm ci` and every suite pass unchanged; the web build's output contains no `socket.io`, `esbuild`, `chokidar` or `@babel` code; no code uses the packages yet | P-630; STANDARDS §1 · **waits on:** nothing (no open PR edits `package.json`; check at start) · **size:** S |

## PF-19s, the templates screen (BACKLOG row; concept first, no brief yet)
Replace the row's "(a plain text box with the field picker, row 46)" with:
* "**the React Email editor (`@react-email/editor`, gate entry 15) with our field picker on its mention feature.** The picker lists the fields the registry gives for the template's module, and choosing one inserts a field chip `{ type: "field", attrs: { key } }`. Fields are never typed as code."
* "**The screen saves the editor's JSON, never its HTML.** The preview is the server's: PF-19c part 2's preview route, which makes the HTML."
* "Only these nodes and marks are offered: paragraph, heading (levels 2–3), bold, italic, underline, link, bullet and ordered list, hard break, field. No code block, image upload or columns in Release 1."
* "For WhatsApp, the screen shows the template's Meta status (PF-19c, below) and edits only plain text with fields."

Add to waits on: **PF-Le**. Add to Done when: "a pasted `<script>` or `onerror=` reaches neither the saved JSON nor the preview; a `javascript:` link is refused at the field." The concept states the editor's limits (P-223 (4)).

## PF-19c, the template registry (`lead-b-briefs/PF-19c.md`; #1908 is revising it as r12, and this block applies on top)
* **The body is stored as our editor JSON** (Tiptap's document format, gate entry 15), with field nodes `{ type: "field", attrs: { key } }`. A body is accepted only if it parses with the allow-listed schema (the node and mark list above). Anything else → 400 naming the node.
* **The server makes the HTML:** `@tiptap/html`'s `generateHTML` with our allow-listed extensions, in `api/src/platform/messages/templates/render.ts`. Field nodes are filled through the existing allow-list with HTML escaping (rev 16.25). The plain-text part is made from the same JSON. `fillFields` keeps its role for plain text and subjects. **No template language is typed by firms** (no Handlebars, no Liquid; P-630 keeps this).
* **WhatsApp's Meta-approved-template status (P-630, research §2.5, Meta's message-template docs):** a WHATSAPP template version also stores:
  - `metaTemplateName`;
  - `metaCategory` (`UTILITY | MARKETING | AUTHENTICATION`);
  - `metaLanguage`;
  - its placeholders mapped to our field keys, with an example value each (Meta requires one);
  - `metaStatus` per firm WhatsApp sender: `NOT_SUBMITTED | PENDING | APPROVED | REJECTED | PAUSED | DISABLED`, with the status time and Meta's reason.
  - **A WHATSAPP version may be published, but `send()` refuses it unless its status is `APPROVED`**: a `msg_send_refusal` row naming the status, never silent (rev 16.42).
  - Submitting to Meta and reading status back is **FO-11**'s (the WhatsApp adapter), not this row's. Here the statuses are stored and checked, and the fake sets them.
  - Added Done when: `PF-19c DW10 pass/fail`. Pass: an `APPROVED` WhatsApp version sends. Fail: `PENDING`, `REJECTED` and `PAUSED` are each refused with the status named.
* **Touch list adds:** `api/src/platform/messages/templates/render.ts` (new); the `platform-messages.prisma` columns above, in part 1's migration.
* **Waits on adds: PF-Le** (for `@tiptap/html`, which comes with the editor's Tiptap set). If `@tiptap/html` is not in PF-Le's lockfile, PF-Le adds it at 3.32.2.

## PF-13, firm branding: the email layout (`lead-b-briefs/PF-13.md` with `P-627-amendments.md`)
* **Part 1 rebuilds `layout()` with `react-email` 6.11.6 components** (gate entry 16), in new `api/src/platform/messages/layout/`, using `React.createElement` (no `tsconfig` change).
  - `ports/messages.ts` keeps `layout()`'s signature (now taking the branding values) and **a plain-string fake**, because ports are zod only. The real layout is wired in by the adapter.
  - It carries the logo, the brand colour, the sender name and AG-16-2's footer (rev 16.45, as confirmed by Lead 64). It never carries the banner, tagline or favicon (P-629).
* Touch list: part 1's `ports/messages.ts` line stays (the signature and fake); add `api/src/platform/messages/layout/*.ts`.
* **Waits on adds: PF-Le.**
* Added Done when: `PF-13 DW12 pass/fail`. Pass: the layout's HTML passes a check that it uses tables for structure and inline styles (the Outlook rule). Fail: a firm value containing `<`, `>` or `"` appears escaped.

## FO-5p, preview (`lead-b-briefs/FO-5p.md`): no change to its part 1
* FO-5p keeps answering the `.docx` preview as briefed. **The PDF preview is FO-5p part 2**, which starts when **PF-Fp** is on `main`.
  - It adds "Download as PDF" through `DocumentRenderPort.toPdf`.
  - It has its own Done when line: the same "Preview — not sent" mark on every page.
  - If the PDF fails, the `.docx` is still offered.
  - Its touch list is FO-5p's preview files only.
* **Lead B's structure ruling:** the converter is platform infrastructure, so a row of its own (PF-Fp), not FO-5p's. FO-5p would otherwise carry a container, a port change and network rules inside a retainer row.

## New row PF-Fp: Word to PDF through Gotenberg (gate entry 17)
| PF-Fp | runtime + infrastructure (platform: documents) | **`DocumentRenderPort.toPdf(docx) → pdf`** (zod only, its fake in `ports/`; a shared contract, so the release Lead reads it, P-423), the real adapter in `api/src/front-office/render/gotenberg.ts`, and the container in PF-8's infrastructure. The five conditions of gate entry 17 are its Done when: (1) only `/forms/libreoffice/convert` (Chromium routes, webhooks and `downloadFrom` disabled by flag); (2) private network, no outbound network, no secrets, no shared volume; (3) 10 MB cap and 30 s timeout (Sample), failure → no PDF, the `.docx` kept; (4) CI and the demo use the fake; (5) the image pinned by digest, 8.40.0. **Touch:** `ports/` (the document render port file), `api/src/front-office/render/gotenberg.ts`, PF-8's stack file (one service), `tests/check_pffp_pdf.ts` | a pass and a fail per condition (the fail cases: a request to a Chromium route → 404 from the container; a 10 MB + 1 byte file → refused before sending; a timeout → `.docx` kept); a sample Word file converts with its text intact (checked by reading the PDF's text) | gate entry 17; P-630; AG-12-89 · **waits on:** FO-5 (its render), PF-8 (the stack; the adapter and fake can merge first, the container line after) · **breaker: yes (outside input: firm Word files)** · **size:** M |
