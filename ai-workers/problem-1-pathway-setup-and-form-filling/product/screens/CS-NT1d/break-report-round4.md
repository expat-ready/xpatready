# CS-NT1d break report, round 4 (PR #3822, R1.76 CS-NT1 part 4): breaker, 26 Nov

**Range:** a0bbd3adf..4e8d59b69. **Targets:** `staffWhoMaySee` (`api/src/case-access.ts:53`), its census allow-list entry (`tests/check_csw3_firm_scope.ts:279`, `:288`), and the shared `Tip` (`web/src/components/status.tsx:16-28`).

**Copy and clean-up**
* Ran on an isolated copy `br4_csnt1d` on **:4436**, started with `AI_LIVE=off PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`.
* Never touched :4400, never ran prisma generate, ran no model (US$0).
* Every planted row and every removed key was put back before the stop. After the runs: 6 `view.all` rows, 0 `br4` grants or team rows, 4 ACTIVE staff, and case A back in firm A.
* The copy is stopped (its database and files were removed).
* The scripts are in the session's scratchpad, not committed.
* **The worktree:** I changed nothing in it apart from this file. While I was running, `screens/CS-NT1d/review.md` was modified in /home/user/wt4: its round 4 section was added at 18:44 UTC. That is the reviewer's work running at the same time in the same tree. I left it untouched.

**Setup**
* Firm A is `sample-firm`, with Owner R, case manager T and case officer O.
* Firm B is `sample-solo`, with Owner S.
* Case A was opened by firm A (x-actor user-O, client user-P). Case B was opened by firm B (x-actor user-S).
* Staff signed in through `POST /api/platform/session/local`.

## Attempts on staffWhoMaySee, the people route and the mention check (all held)
| # | What I did | Expected | Actual |
|---|---|---|---|
| 1 | `GET /runtime/cases/A/notes/people` as firm A's Owner | firm A staff only | 200: O and R (on the case), then T. All 3 are firm A. |
| 2 | The same case A with **firm B's** session | 404 | 404 "No such case in your firm." |
| 3 | Firm B's case B with firm A's session; then with firm B's | 404; firm B's own list | 404; 200 with S only |
| 4 | Case id in upper case; no token; client actor (x-actor user-P) with no session | same list; 401; 401 | 200 with 3 people; 401; 401 |
| 5 | Pointed case A's client `file_owner` at **S's staff id**. Added open OFFICER team rows on case A naming S's id, `user-S` (S's actor id) and S's id in upper case | S never listed | Not listed. The list is unchanged: 3 people, all firm A. |
| 6 | A grant for S naming **firm A** (`platform_role_grant` with firm A and staff S, role OWNER) | refused, or never effective | Refused by FK `platform_role_grant_firm_id_staff_id_fkey`. Then planted with `session_replication_role=replica` (FKs off): S is still not listed. `s.firm_id = firmScope(firmId)` and `g.firm_id = s.firm_id` (`case-access.ts:55`, `:63`) keep it out. |
| 7 | Same as 5 and 6, plus `agent/case:view.all` removed from **all six roles**, so only the view.own rule applies | only firm A's file owner or team members | O and R only. T is out, and S is still out with the firm A grant, the file owner and the 3 team rows. |
| 8 | Same as 7, plus a team row naming `user-T` (T's actor id) | T listed, on the case | T listed with `onCase: true`. The actor-id branch works. |
| 9 | Mention S on add, and on edit (`PUT …/text`) | 400 | 400 "Mention people of your firm only." on both (`service.ts:112`) |
| 10 | T set to SUSPENDED, then DEACTIVATED: listed? mentioned on add? on edit? | not listed; 400 on both | Not listed. 400 "Mention people who can open this case (not: Second representative (Sample))." on add and on edit. |
| 11 | T's only grant ended (`ended_at` set) | not listed; mention 400 | Not listed; edit with a mention gets 400 (same words). Grant put back. |
| 12 | Moved case A and its client to firm B's `firm_id` (FKs off), leaving `firm_key` on sample-firm | 404 for both firms | Firm A gets 404 and firm B gets 404 (`subjectOf`'s firm_key check plus `caseScopeWhere`'s firm_id). Firm B's mention of S on it: 404. Restored. |
| 13 | Firm B adds a note on case A with a mention of S | 404, nothing written | 404 |
| 14 | Mentions: duplicate ids (one in upper case); 21 ids; the all-zero UUID; an injected `' or '1'='1` | deduplicated; 400; 400; 400 | 201 with one mention; 400 "At most 20 people."; 400 "firm only"; 400 "A staff member's id." |
| 15 | 10 parallel mentions of T while T is set to DEACTIVATED | none notifies a deactivated person | All 10 got 400 (the deactivation landed first) |

**Lead condition: the census entry is firm-scoped, not merely allow-listed. Confirmed by attack.**
* `csw3-spike.sh census` at 4e8d59b69 lists 59 files. `case-access.ts` is listed for 1 raw SQL call, which is the `$queryRaw` in `staffWhoMaySee`.
* Every table that query reads is tied to the one firm:
  * staff, by `s.firm_id = firmScope(firmId)`, which throws on a non-UUID;
  * the case, by `c.firm_id = s.firm_id`;
  * client and team rows, only through `c`;
  * grants, by `g.firm_id = s.firm_id`.
* `platform_role_permission` has no firm column, but it is a global catalogue keyed by the enum role (`platform.prisma:355-364`), so the join on role alone leaks nothing.
* The firm comes from `subjectOf` (`service.ts:132-141`), which is already the session's firm and inside the reader's caseScope.
* None of the planted rows in 5-8 (cross-firm file owner, team rows, a grant naming firm A, view.own only) put a firm B person in the list.

## Attempts on the shared Tip (case page `/cases/A`, 1440 x 900 unless stated; Chromium via Playwright)
| # | What I did | Expected | Actual | Severity |
|---|---|---|---|---|
| T1 | Focus `[data-applicant-tip]`, which is below the fold (top 917 px with a 900 px viewport); the page scrolls 437 px | open after the scroll | Still open at 700 ms | held |
| T2 | Focus it, then press Tab 100 ms later; also Shift+Tab 50 ms later | closes at once | 0 tooltips 250 ms later and 1 s later, for both | held |
| T3 | Focus it, then call `blur()` 100 ms later | closes | 0 | held |
| T4 | Focus it, then Escape 50 ms later | closes at once, focus stays | 0 tooltips; focus stays on the trigger; no reopen by 950 ms | held |
| T5 | Hover a tip, then move away (in steps) | opens, then closes | opens, then 0 | held |
| T6 | Hover, click the trigger, then move away 100 ms later | closed, not stuck | 0 (the trigger keeps focus) | held |
| T7 | Click elsewhere 100 ms after focus; wheel-scroll 1 s after focus | closes | 0 and 0 | held |
| T8 | Tab through 60 stops at 60 ms each | never more than 1 open; none left | at most 1 open at once; 0 at the end; no page error | held |
| T9 | Focus a tipped button that navigates ("Hand to Client A (simulated)"), then Enter 150 ms later | goes to the next page with no tip left | navigated; 0 tips | held |
| m1 | Focus the tipped button "About: relies on an employer case" (`runtime/employer.tsx:43`), then press **Enter 150 ms later** | Radix closes a tip when its trigger is activated (onClick, then onClose); the case at 800 ms shows this | **Still open** after 700 ms (1 tooltip); at 800 ms it closes (0). `change` (`status.tsx:27`) treats every close within 600 ms of focus as the page scroll, including the activation's close. The tip still closes on blur or Escape, so WCAG 1.4.13 is met. Screenshot: scratchpad `enter-150.png` | **Minor** |
| m2 | Focus "About: relies on an employer case" by keyboard, then **hover the "Stand-in" tip 100 ms later** | one tip at a time: before this change, Radix closes the open tip when another opens | **Both tips open at once** (both contents shown) at 1440 x 900 and at 720 x 450, which stands in for 200 % zoom. After the pointer leaves, the focused one stays open; Escape closes all. Same cause, `status.tsx:27`. | **Minor** |

* **Repro for m1 and m2:** start the copy as above, then open `/cases/<id>` as x-actor user-O. Call `locator.focus()` on the button, wait 100-150 ms, then press Enter (m1) or move the mouse over `getByText("Stand-in").first()` (m2). Count `getByRole("tooltip")`.
* **Possible fix (I changed nothing):** let `change` ignore only a close that happens while the window scrolls, for example by recording a `scroll` timestamp instead of the focus time, or by checking `e.type`. A click and another tip's open would then still close it.

## Not checked or out of scope
* I did not re-run c95 or A24-3, because they write screenshots into the tree.
* I did not re-run the committed suites; the reviewer reports 56/56 and 48/48 at the same SHA.
* Client-note mentions (`kind: "client"`) never call `staffWhoMaySee`, so they are outside this range.

**Findings:** 0 Blocker, 0 Major, 2 Minor (m1 and m2, both from the 600 ms close window in the shared Tip). Nothing I tried put another firm's staff into `staffWhoMaySee` or the mention check.

Verdict: Approve 4e8d59b6969aa8ee2769d84283c5a97b075ee4a6
