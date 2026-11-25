# FO-13s part 2 review: the client page shows the identity checks (R1.110, QA-610, QA-611), PR #2568

Independent reviewer, 20 Nov 2026 (screen-review skill, fresh context, did not build this). Exact head **c4f56a357**. Inputs: `concept.md` (part 1; recording stays on the lead or prospect page), `qa/BUGS.md` QA-610/QA-611 (as written on main), the diff (8 files including the W6 screenshot), STANDARDS, EXPERIENCE §6, QUALITY. App on isolated copies :4446 and :4447, both stopped; the suites' own copies were on ports shifted by +38000 (`COPY_PREFIX=rvw`), never :4400. Journey test: `journey-test-reviewer-2026-11-20.md`, **8.5/10**.

**Verdict: Block** (also "Ship after fixes": two Majors, both small to fix).

## Runs at c4f56a357
* `j_110.ts` passed 14/14 on two fresh copies, exit 0. `run-suites.sh --only "check_fo13s_identity_browser.ts check_csk1s_clients_browser.ts"` exit 0 (28/28, 33/33). `tsc --noEmit` on web exit 0. `graph.mjs`: G1 0 · G2 0 (G3 174 and G6 16 were already on main).
* **Mutations (STANDARDS §7 [M]):** (a) mount removed (`false &&`): W6 fails (timeout on `[data-check]`, non-zero exit). (b) `readOnly` dropped: "W6 fail" goes red, 13/14. (c) the panel shows a fixed wrong time (`arrivedLabel("2031-01-01T03:07:00Z")`): **14/14 still pass**, so "when" is not really checked (Major 2). Every mutation was reverted, and the tree was clean afterwards.
* **Probes (Playwright plus SQL on my copy):** client page at 1440/1024/375 and 512 px ×2 (1024 at 200 %): no sideways scroll, and axe (WCAG 2.2 A/AA, whole page) found nothing on any state. Keyboard: Tab from the heading reaches "Open copy", a 3 px ring shows, and Enter downloads `identity-copy.pdf`. Lead, open prospect and won prospect pages all still show "Record a check" and the check.

## The questions asked
* **Is exposing `fo_person_id` safe?** Yes. `one()` reads only `clientOfFirm` (scoped to the firm), behind `agent/case:show`. The id is a uuid that is never displayed. Reading the checks still goes through the server's `agent/prospect:show` and `person()` visibility (`identity/service.ts:120-140`). Another firm's person gets 404 (`firmScope`). Nothing new is readable.
* **Is read-only right, and is the copy right?** Read-only is right: concept §1 and §7 keep recording on the lead or prospect page. "Identity checks are recorded on the person's lead or prospect page." is plain, but see S2.
* **Viewer with `case:show` but not `prospect:show`:** I removed `prospect:show` from CASE_MANAGER on my copy. The section then reads "Seeing identity checks needs a role that sees prospects: ask your firm's Owner or Admin.", which is sensible. **But the sibling refusal is not handled** (Major 1).
* **COMPANY client:** the database allows at most one of person/company (`case_client_one_front_office_check`), so `fo_person_id` is null and no panel shows. The page renders cleanly and axe finds nothing (my CL-00002). A client whose link is still pending (`fo_link_pending`) also shows no panel, silently. That is transient and acceptable.
* **Lead and prospect pages unchanged?** Yes. `me` and `readOnly` default to the old behaviour. The new 403 branch cannot be reached there (both pages already need `prospect:show`). The fo13s suite passed 28/28.
* **Is W6 strong?** It is strong on the mount, read-only, type, country, last 4 and expiry (exact text). Method (`/Document copy/`) and who (`by <name>`) are substring checks but sound. "When" is a regex `/\b20\d\d\b.*\d{1,2}:\d{2}/` that any date and time satisfies (mutation c). Convert goes through the API, and the client is found by a DB query (S1).

## Issues, ranked
1. **Major (Must): a client the viewer may see says "No such person in your firm." with a dead Try again.** When "everyone sees all" is off (`platform.everyone_sees_all`, a supported setting that FO-2 and FO-13i test), a case-side viewer who does not own the person's lead or prospect gets 404 from `GET people/:id/identity-checks`. On my copy, Second representative (CASE_MANAGER) saw a red danger Notice and a Try again that can never succeed, on a client page that `GET clients/:id` serves them. The page contradicts itself (BIC-18 "read-only says why"; the concept's BR-8 pattern). Evidence: `identity-panel.tsx:194-197` handles only 403, and screenshot step J5 in the journey report. None of the client mount's states is tested or axe-checked in a suite (403 line, 404, read-only empty, company), which also misses STANDARDS §7 [M] "axe-core on every screen state" and §3.10 "a passing and a failing test". **Fix:** on the read-only mount, treat 404 like 403: one muted line saying the checks are shown to whoever may see the person's lead or prospect, with no Try again. Add a browser case each (setting off as a non-owner; a role without `prospect:show`; an empty person client; a company client), with axe.
2. **Major (Must): "when" is not asserted. QA-611's expected result is not met, and STANDARDS §7 [M] is not met.** QA-611 asks to "assert the row's date and time against the saved `checked_at`". W6 (`j_110.ts:151-153`) passes with a time five years off (mutation c). **Fix:** read `checked_at` (the DB row, or the list API's `checkedAt`) and compare the row's `… by …` text with the same `Intl` format the panel uses (`sales/time.ts` `arrivedLabel`), in the browser's zone as the panel does today (QA-613 stays separate).
3. **Should S1: the J-110 header now says something false.** Its scaffolding line says "everything else is by screens", but W6's Convert to client is `api(rTok, "POST", …/convert)` and the client id comes from `db.caseClient.findFirst`. The screen path exists: "Convert to client" on the prospect page, then the Clients list (I walked Clients → search → client). Click through the screens, or name both shortcuts in the scaffolding line. This is not P-33 Major: the screens do the job.
4. **Should S2: the read-only empty line points to a page some clients do not have.** A person client made when a case opened (`clients.ts newClient` → a fresh `fo_person`, no lead, no prospect; my CL-00003) reads "Identity checks are recorded on the person's lead or prospect page." There is no such page for them. Make the wording hold for that client, for example by naming the case when `prospect_id` is null.
5. **Should S3:** the client page sends a request it already knows will be refused: `me.keys` lacks `agent/prospect:show`, which leaves a 403 in the console. Check the key in `IdentityCheckPanel` (`can(me, "agent/prospect:show")`) and show the line without the request.
6. **Minor:** the section's `h2` is `text-sm` while the page's other `h2` ("Cases") is `text-lg` (`identity-panel.tsx:190` vs `clients.tsx:184`). Two same-level headings in two sizes on one page.
* Carried, not this PR: QA-613 (times in the browser's zone) and QA-612.

## D1–D20 (this change only)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | R1.110 "shown on the client" is met for a person client (W6, probe). The not-visible state is wrong (issue 1) |
| D2 Data integrity | 5 | Read-only, nothing written; the server keeps every rule |
| D3 Reuse | 5 | The same panel and contract; no copied logic |
| D4 Rule integrity | N/A | No configuration rules |
| D5 Stability and recovery | 3 | Try again on 404 can never recover (issue 1) |
| D6 Freshness and governance | 4 | Who and when shown on every check; the time zone is QA-613 |
| D7 AI trust | N/A | No AI |
| D8 Orientation | 5 | Breadcrumb Clients › name; the section sits under the offer card |
| D9 Flow | 4 | The empty state says where to record, without a link; wrong for case-opened clients (S2) |
| D10 Language | 4 | Plain lines; the 404 shows a false technical sentence |
| D11 Feedback and state | 3 | Loading, empty and 403 drawn; 404 is not (issue 1) |
| D12 Visual quality | 4 | Team tokens and card; heading size mismatch (minor) |
| D13 Accessibility and responsive | 5 | axe clean on 6 states; 375/1024/1440 and 200 %; keyboard opens the copy |
| D14 Team look | 5 | `@/components/ui/controls`, as the lead page |
| D15 Speed | 5 | One request for the section, no per-row request; J-110 runs in about 6 s |
| D16 Testability | 3 | Two of three W6 checks fail when their rule is removed; "when" does not; new states untested |
| D17 First-use | simulated only | No intended user walked it |
| D18 Provenance | 5 | Who checked and when, on every row |
| D19 E2E closure | 4 | Lead → check → won → client shows it, end to end in J-110 |
| D20 Pain and wow | simulated only | Founder's or an intended user's walk |

## BIC-01–BIC-20 (case-side screen; evidence: `w6-client-1440.png`, my 1024/375/512×2 probes)
BIC-01–10, 12, 13, 15–17: **N/A** (a read-only list: no questions, inputs, documents, tasks, signing or review on this section). BIC-11 **Met** (no button added). BIC-14 **Met** (no chip or icon-only control). BIC-18 **Partly** (empty and 403 teach; the 404 shows a false error; issue 1 is the Must). BIC-19 **Met** (one heading, no primary button, three type sizes). BIC-20 **Met** (keyboard, visible focus, 1024 px at 200 % with no sideways scroll, headings in order).

## Not checked
A real screen reader; an intended user's unaided walk (D17, D20); a reload while the section loads; CI on this head (I read no GitHub checks). Retrofit mapping: N/A, new (concept §2).

**Verdict: Block.** To fix: issue 1 (the read-only mount's 404, and tests with axe for its states) and issue 2 (assert "when" against `checked_at`). The Shoulds can be fixed here or listed in a follow-up row.

## Round 2: aedc8e6be (diff c4f56a357..aedc8e6be)
* **Verdict: Approve.** Both Majors and S1–S3 are fixed. I verified each fix by running it and by removing it to watch its test go red. No Blocker or Major is open.
* **My runs at aedc8e6be (fresh copies :4446, :4447, :4448, all stopped; screenshots restored):**
  * `check_fo13s_identity_browser.ts` 36/36, exit 0. Its four part-2 cases pass, each with axe.
  * `j_110.ts` 14/14, exit 0.
  * `tsc --noEmit` on web, exit 0.
* **Mutations (STANDARDS §7 [M]), each reverted:**
  * `hidden` forced false: the suite fails (TimeoutError waiting for `[data-identity-hidden]`).
  * `enabled: maySee` removed: "no identity request is sent" goes red (1 request), 35/36.
  * The panel shows a fixed wrong time: W6 goes red ("Jan 1, 2031, 3:07 a.m." ≠ expected), 13/14.

| Round 1 issue | Status at aedc8e6be |
|---|---|
| M1: a 404 on the read-only mount showed a false error; client-mount states untested | **Closed.** `identity-panel.tsx` `hidden`: a muted `data-identity-hidden` line, with no Notice and no Try again. A 404 on the lead or prospect page keeps the old error, which is right there. Suite part 2 tests the list, read-only, everyone-sees-all off as a non-owner, and no key, each with axe. The company client is covered by the database constraint (round 1 probe); a dedicated test is not needed |
| M2: "when" not asserted (QA-611) | **Closed.** W6 compares `[data-checked]` text with the stored `checked_at` formatted as `arrivedLabel` formats it (en-CA medium/short, browser zone), and the attribute with `checked_at` itself. It fails on a wrong time (mutation above) |
| S1: J-110 header | Closed. Convert and the database lookup are named as scaffolding |
| S2: empty line for case-opened clients | Closed. "A check is recorded on a lead or prospect page; this person's checks are listed here once recorded." This holds for every person client |
| S3: request sent without the key | Closed. `ID_KEY.show`; the query is `enabled` only with it, and the line shows at once. Tested (0 requests) |
| Minor: heading size | Accepted as is. It is the panel's own section heading, the same as on the lead and prospect pages. Not a Should |

* **Notes, not findings:**
  * HIDDEN_REASON simplifies the visibility rule. It leaves out signers and company contacts, but it is accurate for the starter roles.
  * The S3 case edits the global `platform_role_permission` on the suite's own copy and restores it in `finally`. That is fine on an isolated database.
  * QA-613 (times in the browser's zone) remains open, separately.
* **Journey score:** rises to **9.5/10**. Feedback and state go to 1 (the not-visible state is plain), error recovery goes to 1 (no dead Try again), and next step obvious stays ½ (no link from the client to the lead or prospect page; out of scope).
* **Not checked in round 2:** CI on this head; a real screen reader; an intended user's walk (D17, D20).

**Verdict: Approve aedc8e6be9476ee500d3951deb239e6eb7058483.**
