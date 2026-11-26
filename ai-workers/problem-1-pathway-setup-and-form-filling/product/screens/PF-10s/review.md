# PF-10s review: My account › Import (R1.35), head e069de2ca10ba86bc9e34cde00eaa462d2e070e8

Reviewer: fresh context, did not build it. Scope: `git diff db4b82e91..HEAD` only (PF-10t and PF-10b part 1 were reviewed before). Concept and challenge read from `main` (`screens/PF-10s/` is not in this branch). Isolated copy `rev10s` on :4433, started and stopped by me (`PLATFORM_IDENTITY=local`, live AI off, US$0). Journey score and walk: `journey-test-reviewer-2026-11-26.md`.

**Scale: Ship after fixes.** One Major (Must): ticking the declaration and then unmapping the consent column leaves Import disabled for good, with the stale-columns message, which is wrong. The rest is solid: j_35 17/17 and the browser check 16/16 on my copy; the engine binding, double click, Continue import and roles all held when I tried to break them.

## Checks
1. **Concept fit:** list, template, the three steps, saved-mapping banner, declaration, Owner attestation and the Admin line, the preview chips with tooltips, `Import N people` with its three disabled reasons, Running (n of rows, no percentage), Continue import after 60 s, the result with "Imported from {source}", list rows opening at their step, the re-import "Nothing new to import." All present and working. Gaps: no **By** column in the list (§4); a long source name wraps in the page title instead of one line with full text on hover (§4 States).
2. **Used as the Owner:** mouse at 1440, keyboard only (Tab to New import → source → Next → Preview → chip with Space → Import with Enter, from the check), 1024 px and 720 px (200 % zoom at 1440): no sideways page scroll. Wrong role: the Case Officer gets no entry, no access on `/platform/import`, `/new` and `/:id`, and a 403 from the API.
3. **Menu and words:** "Import" comes after "Templates" under My account, behind `agent/import:view-report` (Lead 5's answer). Plain words; no ids, hashes or paths on the main path. Team shell, components and tokens.
4. **[M] lines:** STANDARDS §3.10 (pass and fail tests), §4 background work (run queued as a job, polled), §5 no request per row (one rows page of 50; poll only while Running), §6 server authorisation (403 checked), §7 axe on every state: **partly**. The scripts run axe only on the list and the result. I ran axe on the file, columns and preview steps at 1440 and 375 px: 0 violations. §8 uploads: type and size checked by the API, non-UTF-8 and repeated-header errors shown on the file field. EXPERIENCE §2.10 errors on the field: met (source, file, declaration). §2.12: met (see 2). §4 states: all drawn except "long names one line".
5. **Code:** `staffApi`'s `csv` option is additive and sets `text/csv` only when it is used. Every rule is decided on the server and the page only shows it. Double-clicking Import gave one run and 2 people. A dead job, forced with SQL, finished once after Continue. A malformed or unknown id shows "No such import in your firm." **Bug:** `import-flow.tsx:145` sends `declared: needsDecl && declared`, but `:193` passes the raw `declared` state to `runBlocked`, and `contract.ts:87` compares it with `mapping.declared`. When consent is unmapped after the box was ticked, the two never match again.
6. **Retrofit:** the team has no import screen (concept §2; Unverified by the challenger). Nothing to map.
7. **BIC scorecard:** N/A as a whole. This is a firm settings screen, not case-side, and the concept did not opt in. I scored the "Always" rows below anyway as a cross-check.
8. **Graph:** G3 lists the `/platform/imports/*` routes as "no test reaches". The tool does not see `staffApi(...)` calls, and every platform route shows the same (306 entries). j_35 reaches each route. This is not a finding against this PR.

## D1–D20 (independent reviewer, browser and scripts)
| D | Score | Evidence |
|---|---|---|
| D1 | 4 | BR-1 to BR-6 each behave and are tested; the "By" column is missing |
| D2 | 5 | double click → one run; re-import → 0 to create; consent only for "yes" rows with the declaration |
| D3 | 5 | page reads PF-10b's contract; zod at the edge; no logic copied from the server |
| D4 | N/A | no dependent questions |
| D5 | 3 | reload, Back, Continue import all recover; the declaration trap needs a reload |
| D6 | 4 | an audit line per step (uploaded, dry_run, finished); "By" missing from the list |
| D7 | N/A | no AI |
| D8 | 4 | My account › Import › This import; stepper; title names the source |
| D9 | 4 | one primary per step; disabled reasons in words; the Owner's separate Confirm is a wrong turn (see S1) |
| D10 | 5 | tooltips on every chip and pill; reasons in words, never the cell |
| D11 | 4 | busy buttons, running count, Continue; the false "columns changed" reason in M1 |
| D12 | 4 | team components; the long title wraps over 8 lines at 375 px |
| D13 | 4 | keyboard path, axe clean, 1024 and 200 %; at 375 px "Import as" is off screen (S3) |
| D14 | 4 | team tokens and components, the platform frame |
| D15 | 5 | no request per row; one page of 50; polls only while running |
| D16 | 4 | 17/17 + 16/16, re-run by me; no axe on the step states; the M1 path is untested |
| D17, D20 | simulated only | no intended user walked it |
| D18 | 5 | "Imported from Old CRM"; origin IMPORT underneath; attestation shows "Unconfirmed: no counsel" |
| D19 | 4 | import ends on the result rows by the Lead's answer (contacts view is a later row) |

## BIC "Always" rows and screen laws (1440 / 375 px)
BIC-11 Met (one filled button per step) · BIC-13 Partly (errors on the field with fixes; no top summary, fine for a short form; the M1 reason is wrong) · BIC-14 Met (chip and pill tooltips on hover and focus; attestation detail in Details) · BIC-18 Met (empty teaches, loading, no-access says why) · BIC-19 Met · BIC-20 Partly (see S3). UXL-09 Not met: primary buttons are 36 px at 375 px (shared `Button`, same on Offices; not this diff). UXL-10 Partly (S3). Other UXL rows Met or N/A.

## Issues, ranked
* **M1 Must (Major): the declaration trap.** Steps: a CSV with a Marketing column → tick the declaration → set Marketing to "Don't import" → Preview. Import stays disabled with "The columns changed. Preview again before importing." Preview again changes nothing, and only a reload frees it (my walk: `d-decl-trap-1440.png`; disabled after Preview again: true; after reload: false). Fix: pass the effective value `declared && consentMapped(columns, fields)` to `runBlocked` (import-flow.tsx:193), or clear `declared` when no consent column is mapped. Add the failing test: helper `runBlocked(b{declared:false}, colsWithoutConsent, effective)` returns null, and a browser step (tick, unmap, Preview → Import enabled).
* **S1 Should:** the Owner ticks the attestation but presses Preview without Confirm. The preview is made unbound, so Import shows "An Owner must confirm first; then Preview again.", and Back loses the tick (`s-tick-no-confirm-1440.png`). Challenge M1's fix was that the tick posts the attestation before the dry run. Fix: Preview posts the attestation first when it is ticked, or refuses on the box ("Confirm first").
* **S2 Should:** the imports list has no **By** column (concept §4; challenge back-end plan: names from `GET /api/platform/staff`, one request). imports-page.tsx:154.
* **S3 Should:** at 375 px the Columns table pushes "Import as", the step's only control, off screen with no scroll cue (UXL-10; `w-columns-375.png`). Fix: hide "First values" below `sm` (`headClass`), or show the sample under the column name.
* **S4 Should:** the page title does not truncate a long source name (concept §4 "long names: one line, full on hover"); import-flow.tsx:261.
* **S5 Should:** add axe on the file, columns and preview states to `check_pf10s_import_browser.ts` (STANDARDS §7 "axe-core on every screen state"; I found them clean by hand).
* Minor: on the result, merged rows still read "Fills only empty fields" (present tense), and a FAILED batch's notice is titled "Nothing imported" over "Done: 0 created…".

## Could not check
A real screen reader; an Admin account (none in the Sample data; the check stubs it); a 5,000-row file's timing; two tabs re-previewing at once (server guard reviewed in PF-10b). My screenshots are in the session scratchpad (`rev10s/shots/`), not committed. j_35 overwrote the committed J-35 screenshots on my copy; I restored them with `git checkout`.

**Verdict: Block** (not approved: one open Major; on the screen-review scale this is Ship after fixes, `Changes`). Fix list: M1 (with its failing test). S1–S5 should be fixed or given a follow-up row.
