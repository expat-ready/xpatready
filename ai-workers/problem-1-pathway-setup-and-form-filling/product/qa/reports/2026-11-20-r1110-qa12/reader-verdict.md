# R1.110 client identity check: fresh reader's verdict (P-303), 20 Nov 2026

Reader: fresh context, Opus 5.5, ran nothing (code, evidence and screenshots only). Tree: main 3912aa7e6 + qa commit 7bdc05b23. P = `ai-workers/problem-1-pathway-setup-and-form-filling/product`, S = `…/prototype/studio`.

**Done when.** `P/MVP-CHECKLIST.md:78` has no Done when column (statuses only), so the only wording is `P/qa/CAPABILITIES.md:180`. qa quotes it exactly. `trace-requirements.py --brief R1.110` would print "no Release 1 row R1.110" and exit 2 (`P/tools/trace-requirements.py:297-300`: it takes BACKLOG row ids). On FO-13i (`P/BACKLOG.md:368`), Source is P-579 plus Code s. 24(2)(a). It has no team requirement id: P-579 says "No card found", so nothing under `domain/requirements-*` defines this capability. The expiry rule is the firm's own (P-735; Unconfirmed: no counsel). The scope of FO-13s (`P/BACKLOG.md:369`) is "an Identity check panel on the lead-and-prospect screen (FO-4) **and the client view**". FO-13s1 (`:374`) narrowed it to the lead page only.

## (a) Method, document type, issuing country, expiry: recorded and shown. Yes
- Recorded: `S/api/src/front-office/compliance/identity/service.ts:78,86-102` validates the body, and `:174-175` inserts it. The columns are at `S/prisma/schema/front-office-compliance.prisma:115-121`.
- Shown: `S/web/src/modules/front-office/compliance/identity/identity-panel.tsx:65` (method), `:61,69` (type, country, last 4) and `:70` (expiry).
- J-110 asserts all four at `S/tests/journeys/j_110.ts:105-107` ("Passport, IN ···4K9Z", the expiry, /Document copy/). The screenshot `local-b-w3-listed-1440.png` shows them.
- The issuing country appears as its ISO code ("IN"), not its name. This is acceptable.

## (b) Who and when: both recorded and shown, but J-110 asserts only "who"
- Recorded: who is `checkedBy: ctx.staffId` from the session (`service.ts:175`), never from the body. When is `checkedAt @default(now())` (`prisma:128`). Both come back from the server at `service.ts:207`.
- Shown: "Nov 20, 2026, 3:49 p.m. by Case officer (Sample)" (`identity-panel.tsx:66`; screenshot W3).
- **J-110 does not assert "when".** W3 checks `includes(O.displayName)` only (`j_110.ts:107`), and no step asserts `checkedAt` on screen or in the database. "When" is therefore shown but not tested.
- Separately, `arrivedLabel` formats the time in the browser's zone, not the firm's (`S/web/src/modules/front-office/sales/time.ts:14`, no `timeZone`).

## (c) Expired document refused as the basis, on the server and on the field. Yes
- Server: an expiry before the firm's today (in the firm's zone, on the injected clock) answers 422 `fields.documentExpiry` before anything is stored (`service.ts:159-162`). Today itself still records.
- `S/tests/qa/check_qa510_expired_id_document.ts:66-91` covers future, today, past, the firm's yesterday that is still today in UTC, a zone behind UTC, a replay after midnight, and no row or event written. It passed 9/9 twice (`qa510-1.log`, `qa510-2.log`).
- Field: the server's `fields` go to `Field error` (`identity-panel.tsx:111-113,156`), which sets `aria-invalid` (`S/web/src/components/ui/controls.tsx:59`).
- J-110 W5 asserts the 422 and the sentence on the field, with the row count unchanged (`j_110.ts:126-133`). It passed 11/11 twice (`j110-local-a.txt`, `j110-local-b.txt`). Screenshot W5 shows the red sentence under "Expiry date".

## (d) "Shown on the client": No
- The panel is on the lead page (`S/web/src/modules/front-office/sales/lead-page.tsx:126`) and the prospect page (`prospect-page.tsx:133`). Both are pre-client records.
- The clause says "on the client", and its own build row names "the client view" (`BACKLOG.md:369`). A lead page does not meet that.
- CS-K1s (#2511) is **not on main**: its head 9e5e01e5f is only on `origin/claude/screens-csk1s-clients` and a merge-queue branch. `S/web/src/runtime/` on main has no `clients.tsx`.
- Even on that branch, `runtime/clients.tsx` has no mention of the identity check (a grep for "identity" finds nothing). Merging CS-K1s alone will not close this clause.

## (e) Verdict: **Partial**, held by clause (d)
(a) and (c) work and (b) works on screen. The capability is held because no client view shows the check, and no row on main or in flight puts it there. Even after (d) is built, a Works verdict would also need the J-110 walks on GitHub (FO-13s1 Done when, `BACKLOG.md:374`: "pass on GitHub and qa walks it"), and those are not in yet.

## (f) QA-510: close it. Yes
QA-510 was the API gap: 201 for an expired passport. The rule now holds on main, with both pass and fail cases (`service.ts:161-162`), passed 9/9 twice, and J-110 W5 confirms it by screens. Closing it is right (`P/qa/BUGS-CLOSED.md:7`). The pending GitHub walks bear on R1.110's verdict, not on this bug.

## (g) New findings
1. **Gap, Major (holds R1.110): no identity check on the client view.** FO-13s's scope includes "the client view" (`BACKLOG.md:369`). FO-13s1 built only the lead page (`:374`), and CS-K1s's `clients.tsx` has no panel. No backlog row owns the rest; it needs one (an FO-13s part 2 or a line on CS-K1s).
2. **Test gap, Minor: J-110 never asserts "when".** `j_110.ts:105-107` checks who but not `checkedAt`, although the Done when says "with who and when". Fix: assert the row's date and time against the saved `checked_at`.
3. **Gap, Minor (a question for the Lead, then the founder): a check whose document has since expired still counts.** Retainer Send counts any check (`S/api/src/front-office/retainers/service.ts:508`), so a passport that expires the day after it was checked clears the warning for good. The panel also never marks such a check as expired (`identity-panel.tsx:70`). P-735 covers refusing an expired document at recording. Whether "refused as the basis" also covers Send is not decided.
4. **Minor (cosmetic): the time a check was made is shown in the browser's zone, not the firm's** (`time.ts:14`). This is shared with the lead's "Arrived" row.
