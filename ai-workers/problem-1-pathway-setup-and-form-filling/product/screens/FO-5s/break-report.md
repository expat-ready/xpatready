# FO-5s part 1 — break report (R1.53, PR #2802, commit 95ff4d2d9)

Breaker, 21 Nov 2026. Isolated copy `brk_fo5s` on :4573 (PLATFORM_IDENTITY=local, Sample firms re-seeded, the starter template,
prospects and conflict checks per `tests/check_fo5s_retainer_screens_browser.ts` lines 1-75); copy stopped afterwards. Scripts
and screenshots are in the session scratchpad (`…/scratchpad/brk/`), not committed. Scope: the Retainer card, the retainer page
and `GET /api/front-office/prospects/:id/retainers` (concept r2 §4 S2-S5). Templates screen, Withdraw/Signed offline panels
and the public signing page are out of scope and were not counted. Every name and amount below is Sample.

**Totals: 0 Blocker · 4 Major · 9 Minor.**

## Majors

**M1 — A decimal comma multiplies the fee by 100.** Steps: on a Draft, Fee 1 amount `1500,50`, Save. Expected: refused, or
read as CAD 1,500.50. Actual: version 2 stores 15005000 cents = **CAD 150,050.00**, with no warning (`1,5` gives CAD 15.00).
A French-Canadian decimal comma silently becomes a much larger fee in the client's agreement. `web/src/modules/front-office/
retainers/contract.ts:58` (`replace(/,/g, "")` drops every comma before the regex at :60).

**M2 — Edit on a sent retainer ends the client's request at Save, not at Send (BR-9).** Steps: send v2; Edit; amount 5000;
"Save as version 3"; leave. Expected (BR-9): "version n+1, the end of the old request, the new request and one email happen
together or not at all; leaving without sending changes nothing"; the primary is "Send updated version to Client B". Actual:
Save alone sets v2 `end_reason=UPDATED`, emits `retainer.request_ended` and moves the retainer to DRAFT v3. The client's link is
dead and nothing new was sent; the card only says "Draft · Version 3 · Continue the draft". The page text ("Version 2 stays as
it was sent; version 3 is a draft to send again") never says the client's link stops. `retainer-page.tsx:126-128` (Save is the
primary; no combined "Send updated version"); server side `api/src/front-office/retainers/service.ts:523-524`. No FO-5 route sends
an edit atomically. If a later ruling changed BR-9, the concept still needs updating.

**M3 — A long fee label causes sideways scroll on the sent (read) view.** Steps: save a fee label of 120 characters with no
spaces (the input allows 120), send, open the page. Expected: wraps (STANDARDS: no sideways scroll at 375/1024). Actual: overflows
by **801 px at 375 px and 368 px at 1024 px**. Screenshot `scratchpad/brk/shots/long-375.png`. `retainer-page.tsx:122` (the
read-view `<ul>`/`<li>` has no `[overflow-wrap:anywhere]`, unlike the title and values).

**M4 — The representative, with "everyone sees all" off, is shown controls that always fail, and a dead prospect link (BR-3,
BR-18).** Steps: draft by user-R with user-T (Case Manager) as representative; set `platform.everyone_sees_all=false`; sign in
as T and open the retainer. Expected (BR-3): T may open the retainer page and the prospect's header; buttons follow keys and
state. Actual: the page offers Remove, Add a fee row, Save as version 2 and Check and send. Save gives "No such retainer in your
firm." *on the retainer's own page* (API: PATCH and send are both 404, because `visible(…, change=true)` refuses the
representative). The header link `P-000nn` opens "Prospect not found" (`GET /prospects/:id` 404 for T). So the representative-only
branch of the new list route (T lists p1 → 200, `mine: true`) has no screen that can reach it: the card lives on a prospect
page T cannot open. `retainer-page.tsx:65` (`mayEdit` checks only key + status), `:89`; `service.ts:206`; the card
`retainer-card.tsx` is reachable only through the prospect page. Screenshot `scratchpad/brk/shots/rep-save-refused.png`.

## Minors

- **m1 Stale send in a second tab is misleading.** Tab A sends v2; tab C (still showing Draft) → Check and send → Send. Server
  held (one `retainer.sent` audit line). Tab C, though, still shows "Draft" and Check and send, with "Only a draft is sent. Edit it
  to make a new version first.": wrong advice (a colleague sent it), and no reload happens because only `CHANGED` refetches.
  `retainer-page.tsx:40, :48`; screenshot `shots/stale-send.png`.
- **m2 Stale save throws away what the person typed.** Tab A saves v2 (2000); tab B types 3000 + "Tab B label", Save → 409 shown
  ("newer version (2) … Open it again"). Then the refetch silently replaces B's inputs with A's values (2000/"Fee"), and the
  message still says "Open it again". Nothing says what changed (STANDARDS §3 "stale save → 409 with what changed").
  `retainer-page.tsx:34, :40`.
- **m3 A CAD 0.00 fee counts as "the fee" and the retainer can be sent.** Amount `0` → no blocker, `canSend: true`, sent with
  "Total fees CAD 0.00". BR-6 says at least one fee row with an amount. `"CAD 0.00"` is truthy at `service.ts:377`.
- **m4 Amount limits disagree, and the error uses the word "cents".** The client accepts up to 9 dollar digits
  (`contract.ts:60`); the server caps at CAD 100 million (`service.ts:36`). `999999999` reaches the server and the field shows "A
  fee amount is a whole number of cents up to CAD 100 million." (`service.ts:120`), in cents language on a field typed in dollars.
- **m5 Focus is lost after Edit and Remove (keyboard).** Activating Edit (`retainer-page.tsx:99`) or "Remove fee n" (`:119`)
  removes the focused button; focus falls to `<body>` (measured), and a keyboard user starts again from the top.
- **m6 The summary link for a signer blocker focuses nothing.** "Choose who signs" / "The signer needs an email" link to
  `#fo-signer`, a `<dt>` with no `tabIndex` (`retainer-page.tsx:23, :103, :150`). Likewise `#fo-rep` on a sent retainer that is not
  being edited (the field is not rendered).
- **m7 A read-only person gets editing words.** READ_ONLY sees the red "Before sending:" summary (`role="alert"`, links to
  fields they cannot change; `retainer-page.tsx:148`), and the card says "Continue the draft" (`retainer-card.tsx:54`). There are no
  buttons (correct).
- **m8 The new route answers 422, not 404, for a malformed id.** `GET /prospects/abc/retainers` → 422 "prospectId is not an id."
  The brief says else 404, and `GET /retainers/abc` answers 404. `service.ts:436` (`uuidOf` throws before `?? notFound`).
- **m9 The new route is not marked `@OwnOrAll("agent/prospect")`.** It returns records by prospect visibility but escapes PF-6b's
  DW6/DW7 sweep, which only covers marked routes (`tests/check_pf6b_permission_rules.ts:261-274`). `retainers/routes.ts:59`.
  (Its behaviour held in my own sweep, below.) Also, a reload mid-edit drops typed values with no prompt (noted, not counted).

## What held

- New route: another firm's prospect, and sample-firm on a solo prospect → 404; unknown uuid / a retainer id as prospect id → 404;
  uppercase uuid works; SQL-ish id → 422 (no leak); no token 401; a person with no keys 403 naming `agent/retainer:list`;
  setting off: non-owner non-rep 404, owner sees all, the representative sees only theirs (`mine: true`), not-rep 404,
  READ_ONLY 404; setting on: READ_ONLY lists.
- Amounts refused on the field with nothing saved: `99999999999`, `1e3`, `-5`, `1 500`, full-width `１５００`, `.5`, `12.`.
  French/Chinese/Arabic/emoji labels saved and shown. ON_DATE with no date saves and blocks Send ("A fee due on a date needs its
  date.", on the field and in the summary). Deleting every fee row saves an empty version and blocks Send.
- Concurrency: stale status save refused ("now sent (your page showed a draft)"); a double-click on Save makes one version; a
  double-click on Send sends once (one audit line); a double-click on Prepare makes one retainer; the server refuses a non-Draft
  send.
- Roles: READ_ONLY has no Edit/Save/Send/Download in the UI, and PATCH/send are 403 by API. Another firm's retainer or a
  malformed id by URL → "Retainer not found".
- Layout: card at 375 px and the page at 720 px (200 % of 1440) show no sideways scroll except M3. Prepare panel by keyboard:
  opens with focus on Template; Tab reaches Cancel / Prepare retainer; focus stays trapped. No page errors in any run.

## Re-check at c20dae7 (Majors + diff since 95ff4d2; copy `brk_fo5s` :4573, stopped)
- **M1 fixed.** `1500,50`, `1,5`, `12,50`, `0,50`, `1,5000`, `1,000,000,000`, `100000000.01`, `999999999` are refused on the field,
  nothing saved; `1,500` → 150000, `1,500.50` → 150050, `100,000,000.00` (the cap) saved. m4 fixed too.
- **M3 fixed.** 120-character unbroken fee labels and template name: 0 px sideways scroll on draft and sent pages at 375/720/1024 px.
- **M4 fixed.** T, the representative, with the setting off: only Download and the Code items, no summary, `P-…` is plain text; the
  send API is still 404 for T; the owner keeps every control.
- **M2 → Minor for this PR.** The warning before Save and the "Version n is not sent yet" notice after it show (verified). The BR-9
  gap ("together or not at all") stays open in FO-5, with the tech lead. Still Minor: the card then says only "Draft · Continue the
  draft", with no word that the client cannot sign (`retainer-card.tsx:54`).
- **New, Who signs (company).** Held: a person who is not a contact → 422; a no-email contact saves and shows "blocks Send"; 375 px OK.
  **Minor:** choosing the empty option enables Save, which makes an identical new version with the old signer kept
  (`retainer-page.tsx:43` sends `signerPersonId` only when set; `changed` at :68 counts the empty pick as a change).
