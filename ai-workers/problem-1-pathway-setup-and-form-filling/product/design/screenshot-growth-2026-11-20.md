# Screenshot growth — clean-up stage 8 proposal (20 Nov 2026)

Plan: `repo-cleanup-plan-2026-11-17.md` §3, stage 8 ("keep the 3 named per screen in git (≤300 KB each); the rest go to CI artifacts (30-day retention) or Git LFS for new files only; a size guard in the push guard; ADR in `docs/decisions/`"). Full-power plan item 70 ("policy, not urgent"). Written by the clean-up lane; **nothing here is a rule until the tech lead (and, where marked, the founder) decides. The ADR follows the answers to A–C below.**

## Measured (facts, US$0)
- `image-size.sh b26ad9430..7eb57a4a1` (base: the last first-parent main commit before 00:00 UTC 13 Nov; head: main at 13:15 IST 20 Nov, 07:45 UTC) counts every image file **new to git history** in the range, including ones a later commit shrank or deleted (PRs merge with merge commits, `.mergify.yml` `merge_method: merge`, so every branch commit stays on main):
  **1,363 image files in 7 days, 192 MB raw (~172 MB packed); 145 over 300 KB, 83 MB (43% of the bytes).** Of the 145: 132 under `product/screens/`, 9 `product/cockpit/`, 4 `product/qa/`. Median of the 145: 377 KB; largest 1,852 KB.
- The tree at the head holds fewer: comparing only the two end commits gives 733 images, 87 MB, 50 over 300 KB. The difference is images committed and later replaced on PR branches: history keeps them, so the history figure is the growth that matters (Opus review on #2461, Major 1).
- So a 300 KB cap checked on every commit stops a bit under half of the growth (~12 MB a day). The rest is many images under 300 KB: the count per item and replaced intermediate screenshots drive it.
- The repository is ~2.3 GB, mostly screenshots (plan §Summary). History keeps every byte; only new growth can be stopped (AGENTS rule 1: no history rewrite).

## Where the plan's wording meets existing rules (judgment; confidence high on 1–3)
1. **"The rest go to CI artifacts (30-day retention)"** deletes evidence after 30 days and keeps it outside the repository. That conflicts with P-188 (git history is the archive) and P-557 (nothing lives only in an account). Not recommended without a founder decision.
2. **Git LFS** is new technology: STANDARDS §1 gate first. It also costs: GitHub LFS bandwidth and storage quotas, every clone and CI checkout needs `git lfs`, and Mergify and the cloud sessions must fetch LFS objects. Not recommended now.
3. **"The 3 named per screen"** is not defined anywhere (no DECISIONS row, skill or standard names them). Journey-test and screen-review need screenshots at 1440 and 1024 px (EXPERIENCE BIC-19), so any count rule must come with the list of which ones stay, or it lowers review quality.
4. **P-188 also says "no size limits on records".** A per-image cap lowers an image's resolution or encoding, not the facts a record holds; still, it could be read as a size limit on records, so the founder should confirm it (question A).
5. A **blocking** cap would refuse about 20 image files a day today; each refusal costs a builder a retry. This lane's start brief (the tech lead relaying the founder's ask, 20 Nov ~13:3x IST; in the session prompt, not yet in a repo file) says clean-up must never slow or lower the quality of product work, so blocking waits until screenshots are small by default (step 2).

## Proposal (in order; each step only on the tech lead's word)
1. **This PR — report only.** `product/tools/image-size.sh` lists every image file new to history in a range over `IMAGE_MAX_KB` (default 300); exit 0 unless `--enforce`. Its test `check-image-size.sh` (22 cases, throwaway repo, including a depth-1 clone) runs in `check-guards.sh`. Wired into no guard.
2. **Make small the default where screenshots are taken** (no lane slowed): screenshots for records at `deviceScaleFactor: 1`, viewport-only rather than full page unless the check needs the page, PNG palette compression or JPEG quality 80 for photos of pages; commit the final screenshot once rather than each attempt. This is a change to the studio test helpers and the screen-build and journey-test skills: a separate PR by the lane that owns them.
3. **Report in CI for one week:** a non-failing step in `guards.yml` prints the report on each PR, range `origin/main..HEAD` (Lead-read, A154 change-log row). The tool works on CI's default depth-1 checkout once `origin/main` is fetched (it leaves out the base commit's own files), so no full history is needed.
4. **Then enforce** in `push-guard.sh` / the CI guard with `--enforce` at 300 KB for new images under `product/`, once step 2 has landed and the report shows few hits. An image that must be larger (a full-page proof) is named in an allow list file, as the push guard's L1 list does for test PDFs.
5. **Count:** only after the tech lead names which screenshots each record type keeps (e.g. concept: 1440 + 1024; build: 1440 + 1024 + one state; review/break/journey: failures only). Then the skills say so; no automatic removal of existing files.

## Questions (for the tech lead; the founder where P-188/P-557 are touched)
- A. Accept steps 1 and 3–4 as above (report, then enforce at 300 KB with an allow list), and put point 4 (P-188 "no size limits on records") to the founder?
- B. Which screenshots does each record type keep (step 5)? Until answered, no count rule.
- C. CI artifacts or LFS: drop both (recommended), or put one to the founder?
