# Screenshot growth — clean-up stage 8 proposal (20 Nov 2026)

Plan: `repo-cleanup-plan-2026-11-17.md` §3, stage 8 ("keep the 3 named per screen in git (≤300 KB each); the rest go to CI artifacts (30-day retention) or Git LFS for new files only; a size guard in the push guard; ADR"). Full-power plan item 70 ("policy, not urgent"). Written by the clean-up lane; **nothing here is a rule until the tech lead (and, where marked, the founder) decides.**

## Measured (facts, US$0)
- `check-image-size.sh <main 13 Nov>..<main 20 Nov>` (base `b26ad9430`, first-parent main at 00:00 13 Nov): **733 images added or changed in 7 days, 87 MB; 50 over 300 KB (27 MB, 32% of the bytes)**. Of the 50: 37 under `product/screens/`, 9 `product/cockpit/`, 4 `product/qa/`. Median of the 50: 441 KB; largest 1,780 KB.
- So a 300 KB cap alone stops about a third of the growth (~4 MB a day). The other two thirds are many images under 300 KB: the count per item, not the size, drives most of it.
- The repository is ~2.3 GB, mostly screenshots (plan §Summary). History keeps every byte; only new growth can be stopped (AGENTS rule 1: no history rewrite).

## Where the plan's wording meets existing rules (judgment; confidence high on 1–3)
1. **"The rest go to CI artifacts (30-day retention)"** deletes evidence after 30 days and keeps it outside the repository. That conflicts with P-188 (records keep their facts) and P-557 (nothing lives only in an account). Not recommended without a founder decision.
2. **Git LFS** is new technology: STANDARDS §1 gate first. It also costs: GitHub LFS bandwidth and storage quotas, every clone and CI checkout needs `git lfs`, and Mergify and the cloud sessions must fetch LFS objects. Not recommended now.
3. **"The 3 named per screen"** is not defined anywhere (no DECISIONS row, skill or standard names them). Journey-test and screen-review need screenshots at 1440 and 1024 px (EXPERIENCE BIC-19), so any count rule must come with the list of which ones stay, or it lowers review quality.
4. A **blocking** size guard in the push guard would refuse about 7 images a day today; each refusal costs a builder a retry. The founder's rule for this lane: never slow product work.

## Proposal (in order; each step only on the tech lead's word)
1. **This PR — report only.** `product/tools/check-image-size.sh` lists every image a range adds or changes over `IMAGE_MAX_KB` (default 300); exit 0 unless `--enforce`. Test `check-image-size-test.sh` (14 cases, throwaway repo). Wired into nothing.
2. **Make small the default where screenshots are taken** (no lane slowed): screenshots for records at `deviceScaleFactor: 1`, viewport-only rather than full page unless the check needs the page, PNG palette compression or JPEG quality 80 for photos of pages. This is a change to the studio test helpers and the screen-build and journey-test skills: a separate PR by the lane that owns them.
3. **Report in CI for one week:** a non-failing step in `guards.yml` prints the report on each PR (Lead-read, A154 change-log row).
4. **Then enforce** in `push-guard.sh` / the CI guard with `--enforce` at 300 KB for new images under `product/`, once step 2 has landed and the report shows few hits. An image that must be larger (a full-page proof) is named in an allow list file, as the push guard's L1 list does for test PDFs.
5. **Count:** only after the tech lead names which screenshots each record type keeps (e.g. concept: 1440 + 1024; build: 1440 + 1024 + one state; review/break/journey: failures only). Then the skills say so; no automatic removal of existing files.

## Questions (for the tech lead; the founder where P-188/P-557 are touched)
- A. Accept steps 1 and 3–4 as above (report, then enforce at 300 KB with an allow list)?
- B. Which screenshots does each record type keep (step 5)? Until answered, no count rule.
- C. CI artifacts or LFS: drop both (recommended), or put one to the founder?
