# Review: PR #2839 (R1.30 DW4 List race, test only) at 325ef09ff1aae432cb09ebfb4ab79b1c3b168c5f

Reviewer: a fresh session that did not write the change. Scope: the 3 added lines in
`prototype/studio/tests/check_r130_prospect_source.ts` (`git diff origin/main...HEAD`). This is not a screen build, so the
concept dimensions (D1–D20, the BIC scorecard and the graph check) do not apply. Copy: `isolated.sh rev_r130 4433`
(runtime ports). :4400 was not used and no app file was touched. Probes ran from the scratchpad only, never from the repo.

## Verdict: Ship (Approve). No Blocker, no Major.

## Runs (all on :4433, fresh database each start)
| Run | Result |
|---|---|
| The suite as committed, 4 times on 3 copies | 32/32 each time |
| Probe: 600 ms delay on the List's `?source=` fetch, fix line removed, 2 runs | 31/32 both times. The DW4 List line FAILs with rows `[]` and the right URL (`…&source=Referral+<run>`): the CI signature |
| Same delay, fix line kept, 2 runs | 32/32 both times |
| Probe: the client fetch drops `source=` but the query key still changes ("strip") | 29/32. The DW4 List line FAILs at `ok()` listing every row, and so do the reload line and DW5 "fixed". No false pass |
| Probe: 17 s delay (longer than the new wait) | The suite stops on a `TimeoutError` at the new wait (row P-00009, the Referral row), exit 1. It fails loudly |

## Findings on the five questions
1. **The root cause is right, and it is the only race on this path.** The chip (`chosen={src.sources}`, source-filter.tsx:40-41)
   and the query key (`qs`, pipeline-page.tsx:131, :134) come from the same `src.sources` in the same render. No
   `placeholderData` is set (pipeline-page.tsx:134; lib/api.ts:46 defaults are retry, staleTime and refetchOnWindowFocus
   only). So the first commit that shows the chip also shows `<Loading>` (:150). A MutationObserver walk counted
   **0 commits with a Phone call row under the chip and 1 commit with Loading under the chip**, even locally with a
   55-128 ms answer. `useAddressSources` (source-filter.tsx:74-81) adds no delay here: a `data-source` checkbox exists only
   once `known` has data, so after the click `sources` already contains Referral and `ready` stays true. A background
   refetch keeps the data, so `sources` never falls back to `[]`. The URL (`setParams`, replace) and the focus (Escape →
   `close(true)`) settle synchronously. One more detail: the order of the two waits matters. Referral rows are also in the
   unfiltered table, so the old `tPhone`-detached wait must come first. The PR keeps that order. A key already in the
   cache shows its cached rows for that source at once, with no Loading. That is still correct for the test.
2. **The assertion is as strong as before.** The full `ok()` expression is unchanged. If the client stops sending `source=`
   but changes the key, `ok()` fails on `!shown.has(tComma)` (strip probe above). If the List ignores the source
   altogether (key and fetch), the Phone call row never leaves and line 110 throws after 15 s. If the filtered answer is
   empty or wrong, the new wait throws after 15 s. Every regression fails, and none passes. All rows come from one
   `rows.data.map` commit, so reading once the Referral row is there also sees the Case Officer's row.
3. **This is not a product bug.** A skeleton named "Loading prospects" (role=status) in place of the list while a new
   filter loads is the written state: EXPERIENCE.md:43 says "loading (skeletons)", and BIC-18 (:79) says "loading uses
   skeletons, never 'No records' before data". Keeping the old rows under the new chip is what break M1 refused
   (source-filter.tsx:92-94). Speed is within STANDARDS.md:58 (filter < 200 ms): 55-128 ms locally. The CI failure needed
   only a few ms of Loading, not a slow answer.
4. **The other reads in the suite are safe from this race.** After a reload (:117), `ready` is false while the sources load,
   so nothing unfiltered is ever fetched, and the Referral row can only come from the filtered list. The board switch
   (:122) waits for `data-card`, which only the board draws, behind its own Loading. The board clear (:133) shows the
   cached unfiltered board, which is correct. DW5 "fixed" (:167) comes after `badRange` (no table at all), so any row is
   from the new key. Under the delay probe without the fix, DW5 "fixed" still passed. But its wait swallows the timeout
   (see m1). The `tPhone` wait at :156 can pass on the old table, but nothing is read after it.
5. **Rules: the new line meets them.** It has no `.catch`, a 15 s timeout, and a comment naming the batch. It names no person
   and is a test-only change.

## Issues
- **m1 (Minor, Should, pre-existing, not in this diff):** WAY-OF-WORKING.md:38 says "A wait a test relies on fails loudly …
  (no `.catch(() => undefined)` after a wait)". The same suite breaks it at :167 (the DW5 List read, the same shape of race
  this PR fixes), :172 and :185. (:182 `networkidle` is not relied on.) No false pass results, because the following
  `ok()` checks the row or URL. But a slow answer then reads as "the list does not follow the range" instead of a
  timeout. Fix: drop the `.catch` at :167, :172 and :185, in this PR or a follow-up minor-bugs PR.
- **Note (not a finding):** a timeout at the new wait (like the existing one at :110) stops the suite before `summary()`,
  so the later checks do not run. CI is still red, with a TimeoutError that names the row.
- **Note:** the builder's repro (`tests/zz_r130_slow_repro.ts`) was untracked and disappeared from the shared tree during this
  review, so it is not in the PR. The 600 ms claim was reproduced independently above.

## Journey test (reviewer role, the one score for this check; embedded here because only this file may be written)
Persona: the Case Manager (Sample, "Second representative"). Goal: "show me only the prospects that came from referrals."
Walked headless on :4433 with screenshots, twice: List → keyboard only (18 Tabs to Source, Enter puts focus in Find,
type, Tab to the checkbox, Space, Escape returns focus to Source) → the 2 Referral rows only, chip "Referral …", "Source (1)"
→ 1024 and 400 px with no sideways scroll, axe 0 violations → reload keeps the chip and the rows → "Remove source" by
keyboard restores every row, clears the address and returns focus to Source → a 1.5 s slow answer for a new source shows
the "Loading prospects" skeleton, no row under the chip, then only that source's row. There were no page or console
errors. First view took 432-539 ms. Error paths (sources outage with Try again, an unknown source in the address) are
covered by the suite's DW4 fail lines (passed).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Referral rows only, kept across reload and Board/List |
| Next step obvious | 1 | Chip with ×, "All sources", "Clear filters" |
| Plain words | 1 | "Source (1)", "Remove source: …", "Loading prospects" |
| Feedback and state | ½ | Named skeleton, never stale (0 stale commits). The whole table blinks to a skeleton even on a 55 ms answer. That is to the bar, not a finding |
| Correct data | 1 | UI rows match API DW1–DW3 (Referral 2, own-only 1) |
| Error recovery | 1 | Outage: Try again and no unfiltered fetch. Unknown source dropped |
| Accessibility and sizes | 1 | Keyboard path, focus return, axe 0, 400/1024/1440 |
| Speed | 1 | Filter 55-128 ms (< 200 ms), first view < 1 s |
| Visual quality | 1 | Screenshots at 1440 (filtered, loading) are clean |
| Trust and sources | 1 | No AI on this path. Sample data labelled "(Sample)" |
| **Total** | **9.5 / 10** | Pass (8 or more, no 0) |

## Could not check
A real screen reader. An intended user's unaided walk (D17/D20 stay with the founder). The GitHub runner itself:
the race was reproduced locally with a route delay, not on shard 7.

Reviewer: Approve 325ef09ff1aae432cb09ebfb4ab79b1c3b168c5f
