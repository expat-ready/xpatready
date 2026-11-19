# Builders and qa — word for word from RULES.md as of P-612 (15 Nov), moved by G-3 (P-611, P-615; nothing cut, P-188)

The rule register is `RULES.md`; this file holds the long text its rows came from. The whole page as it was: `history/RULES-2026-11-15-1415-before-register.md`.

## Builders and qa
* One row per session and per PR, fresh branch from `origin/main`; **one session per branch** (P-278, P-436 (2)). **No duplicates (P-526):** a duplicate check before shaping and before building (BACKLOG, open PRs incl. records, `main`'s code, BUGS, the team's product), one `Duplicate check:` line in row and PR; found → the Lead picks the copy that stays, the other goes first. Rows name what they touch and wait on; overlapping touch lists never run at once. No ruling lives only in an unmerged PR: records PRs over 24 h are merged or closed. A lane ends when its PR is labelled (P-337); a warm lane may take one more row that builds on what it knows (P-341).
* PRs under ~800 lines, split by layer when big: schema → API → screen (P-436 (4), P-438 (1)). **One builder at a time** on `prisma/schema.prisma` and `api/src/case-prepare.ts`; the Lead names the holder in STATE (P-438 (2)). Two PRs carrying a migration take different stamps (P-348 (8)).
* Merge `main` in only on a conflict (P-270); a PR that has merged `main` three times lands next (P-436 (1)).
* Reviews on **Opus** (P-303): reviewer always; breaker only for money, schema, permissions or a new screen (P-278). Re-review reads only the diff since the last Approve (P-277, P-436 (5)); a pure merge of `main` that touches none of the PR's files needs no review, and the Lead records that check (P-318 (1)). At most two review rounds, then the Lead decides (P-293 (3)).
* Label `review: approved` only with a PR comment `Reviewer: Approve <exact head sha>` (label guard, P-385) and green CI. Builders label after Approve (P-277); **qa labels paid-result PRs** (P-275).
* New screens: a walk by screens before the first review (P-352) and a best-in-class section in the concept (P-392). No combination key, form number or program-specific branch in engine code (P-319, P-425).
* A mutating route that a pack's set-up calls needs a caller in `web/src` or an allow-list line (P-348 (4)). Each form's own official words decide who fills it and what it asks (QA-221 ruling, 4 Nov). No multi-tenant work in the existing reference-app code; tenants, environments and real users were the team's (P-335, P-357), **except the new platform and front-office modules (PF-*, FO-*), which build firm tables, real sign-in and billing (P-559)**: POC code, rules, forms and tools are held to production grade.
* Held parts are listed in STATE and nobody builds them (P-251, P-265, P-284); the founder lifted the P-235 to P-248 holds (P-316); Express Entry's police and medical block is the one hard stop besides Validate (P-172, P-315).
* Questions as a PR comment headed "Question for the tech lead"; every brief says "report to the current Lead (`tools/current-lead.sh`)" (P-293 (2), P-373, P-409). Builders never edit `STATE.md`, `RULES.md`, `DECISIONS.md`, `BACKLOG.md`; qa alone edits `qa/CAPABILITIES.md` and `qa/BUGS.md` (P-314).
* qa: one row per lane, in parallel; packs on GitHub's machines; gate A by screens (P-434). Live AI off and US$0 in every lane; never press a priced button (P-175).


## Full rows moved word for word from RULES.md by Lead 80, 16:4x IST 18 Nov (RULES.md under 25 KB, P-611)

| P-385 | Label review: approved only on a `Reviewer: Approve <exact head sha>` comment and green CI; builders label, qa labels paid-result PRs (P-277, P-275). | CI: label-guard.yml, label-guard.sh, label-sweep.sh (tests check-label-guard.sh, check-label-sweep.sh) | P-612 |

| P-683 | Approve on the branch first, then open the PR non-draft (amends P-646). | prose (lane briefs) | 17 Nov |  (moved word for word by Lead 80, 19:0x IST 18 Nov)
* **Agent lines for qa (founder 19 Nov, "Let a session edit"; kept here because the qa skill is at its 10 KB limit):** **Module cards (P-712):** never hand-edit a card's frozen `Tests.`, `Tables.` or `Entry points.` line; add your row's items in `<card without .md>.rows/<ROW>.md` next to the card (one file per row, at most 6 lines starting `Tests:`, `Tables:` or `Entry points:`); a hand-edit of a frozen line in a PR under review is a finding. **Finish by capability (P-719):** work one Release 1 item's whole chain (parts, J-row, qa proof); about 8 items in flight; start a new item only when one is Proven; prove in item order, an in-flight item's last part first after Blockers.
