# R1.26 Public enquiry form, hardened against abuse: fresh reader's verdict (P-339)

Reader: independent, read-only (files, `git show`, REST `gh api`), 20 Nov 2026, main ce8e05b1d (FO-4b, PR #2451). Ran nothing. P = `product/`, S = `prototype/studio/`.

**Verdict: parts missing: FO-4 (its web-form settings panel, handed on to row FO-4w) and FO-2's web-form settings API. No verdict, no Works (P-606).**
**Confidence: 90%** that R1.26 cannot be scored today. The other 10% is a ruling question: does the Lead's PR answer, "R1.26 stays Partial", count as a P-606 score? Either way, Works is ruled out.

## Q1: have all the parts merged? No.
- FO-4's row (P/BACKLOG.md:332) lists "web form page (hosted) **and its settings panel**". The hosted page is merged. The panel is not: S/web/src has no settings screen, and the only web-form files are `web-form-page.tsx`, `routes.tsx` and `embed/*`. FO-4b's row (:333) says "waits on: FO-2, FO-4 (settings panel)".
- FO-2's row (:324) includes "web-form settings (on/off, allowed sites, consent wording version, thank-you text) (Owner, Admin)". There is no such route on main. The only write routes in `S/api/src/front-office/sales/` are the leads and prospects ones and the public `POST :token/submissions` (public.ts:228).
- The seed creates the form switched off: `enabled: false`, no consent wording and no allowed sites (S/api/src/front-office/firm-seed.ts:118). Every proof turns it on with SQL: check_fo4_sales_browser.ts:35 (hosted) and check_fo4b_embed_browser.ts:62 (embed, `allowed_sites`). So on main a firm cannot switch its form on or embed it through the product (P-33). This applies to the hosted form too, not only the embed.
- Row FO-4w is named in the PR #2451 body ("the next row, FO-4w") but **does not exist** in P/BACKLOG.md or STATE.md on main (grep "FO-4w": no hits). P/MVP-CHECKLIST.md:64 still lists parts "FO-2, FO-4, FO-4b" and says "part missing FO-4b", which is now stale.

## Q2: the Done-when clauses on main, using the setup a test made by SQL
| Clause | Hosted form | Embed | By screens? |
|---|---|---|---|
| A visitor's enquiry becomes a lead | Met: fo4_1/2.txt 45/45 (DW1 pass line 6) | Met: fo4b_1/2.txt 45/45 (utm spring) | Visitor side yes. Firm side no: the form is switched on by SQL |
| Hidden field refused, nothing said | Met by API: public.ts:117; check_fo2:163; CAPABILITIES R1.26 walk (201, nothing stored) | Met by browser: fo4b_1.txt:30 | API and test only on hosted; browser on embed |
| Too-fast send refused | Met by API: public.ts:174-180, :117; CAPABILITIES walk | Met: fo4b_1.txt:31 | Same |
| Rate limit | Met by API: public.ts:30 (30/min per address, 60 per token), :88-91, :161-169; check_fo2:175-180 (31st → 429; 61st per token → 429) | Met: fo4b_1.txt:44 ("wait a minute", answers kept, no lead) | Embed only, by test. The 429 says "Too many requests", which is honest and reveals nothing about bot detection |
| Same send twice makes one lead | Met by API: intakeKey `form:<id>:<submissionId>` (public.ts:122); CAPABILITIES walk | Met: fo4b_1.txt:23; the breaker sent 8 at once and got 1 lead | Test only |
| Each field's message on the field | Met by screens (CAPABILITIES walk; fo4_1.txt:5) | Met: fo4b_1.txt:14, :16; form-embed.js:128 | Yes |

The embed keeps every clause: it calls the same `submit` with no separate path. Gate A (P-317, P-348) is not met. No screen walk covers the firm switching the form on or getting the snippet, and none goes on to R1.27's first step.

## Q3: findings from the break report and review, checked against main's code
- M1 (honeypot shown under a strict CSP): **closed**. form-embed.js:116-117 uses the `hidden` attribute; fo4b_1.txt:32.
- m1 (form switched off after drawing) and R1 (lost connection reported as "not available"): **closed**. public.ts:196 `openRefusals`, :144 `corsFor`.
- m3 (busy state): **closed**, form-embed.js:160. Other click ids kept as OTHER: **closed**, form-embed.js:20.
- m2 (records claim more than main delivers): **closed in wording** (snippet.ts:3-5, qa/built/R1.26.md). The gap behind it is open, as Q1 says.
- Still open, all Minor and accepted in the PR: (a) a body over 32 KB, refused by the middleware (public.ts:186), cannot be read by the page, so the visitor is told "check your connection"; (b) a site removed from allowed sites mid-fill gets the same line; (c) the suite fills the address's minute; (d) graph.mjs does not see the OPTIONS route.

## New findings
1. **Records gap (Major, process):** FO-4w is promised in the PR but has no BACKLOG row. MVP-CHECKLIST row 26 names neither it nor FO-2's settings API. The capability's real last part is not tracked anywhere on main.
2. **Product gap (Major, part missing):** no staff path switches the web form on or sets its consent wording, thank-you text or allowed sites. firm-seed.ts:118 starts the form switched off. A new firm cannot receive any web enquiry without a database edit, so FO-4w must also cover FO-2's settings API, not only the panel and snippet.
3. **Minor, existing before FO-4b:** the rate limit is an in-memory Map in each process (public.ts:162-169). It resets on restart and is not shared between instances. Fine for the reference app; note it before a multi-instance deploy.
4. **Minor (FO-2 wording, still open):** a first name of "!!!" gets "this is required." on the field (fo4b_1.txt:16), which is the wrong reason.

## Q4: what Works would need
1. Row FO-4w shaped and merged: the settings API (on/off, consent wording, thank-you text, allowed sites; Owner and Admin; audited) and the panel with `embedSnippet` and Copy.
2. `tests/journeys/j_26.ts` with `Completes: R1.26`. By screens it would cover:
   - the Owner switches the form on, adds a site and copies the snippet;
   - a visitor sends from the hosted page and from the embed, and each send makes one lead in Unassigned leads;
   - field messages, the honeypot, the too-fast send and the rate limit;
   - a double send makes one lead;
   - it ends at R1.27's first step.
3. j_26 green twice on GitHub on main, then a fresh reader's verdict. MVP-CHECKLIST row 26 updated to the new parts.
