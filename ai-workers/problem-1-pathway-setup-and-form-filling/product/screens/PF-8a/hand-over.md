# PF-8a hand-over (builder, runtime lane, 19 Nov 2026 ~16:3x IST)

**Head:** `1a9e1d9cd` on `claude/exciting-hopper-fvivo0`. **No PR yet** (P-683: the PR opens only after the reviewer's Approve).

**Question for the tech lead (P-293 (3)):** both review rounds are used.
* Round 1 (at 36f5e8cd2): Block, Major: three ways round the region guard. Fixed, each with a fail test.
* Round 2, diff-only (at d019bdcda): those three are closed. It found one new Major: `first_hit` in `skeleton.yml` returned 1 under `bash -e`, so a records-only push to an app PR would turn the skeleton job red.
* The fix (at 1a9e1d9cd): `return 0`, proven on five stubbed cases under `bash -e`. Also the guard's synth now gets `cdk.json`'s context (round 2's Minor).

**Recommendation:** a third, diff-only check of `git diff d019bdcda 1a9e1d9cd` by the same reviewer: two changed lines plus one test-env line. A fresh reviewer would re-read about 780 lines for no gain.

**After Approve:**
1. Post `Reviewer: Approve <full sha>`.
2. Open the PR non-draft with `pr-body-draft.md` (fill in the `deploy-synth` run).
3. Do not label: the tech lead reads the `.github/` change first.

Other questions (1-5) are in `pr-body-draft.md`. `review.md` is 109 lines, over the skill's 100-line limit, because both rounds' facts are kept (P-188).
