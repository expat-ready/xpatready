# AUD-5 part 2: resume note (parked, superseded)

**Parked** by Build Lead C (07:4x IST 19 Nov, P-716). **AUD-5 part 2 goes ahead as expat-ready/xpatready#2197.** This lane's PR, expat-ready/xpatready#2194, is **superseded**. It stays open with no label and was turned back into a draft, so this note's push starts no full ci run. Nothing was deleted or closed.

## Where things are
* **Branch:** `claude/upbeat-bardeen-k2tdqn`.
* **Reviewed head:** `1c9e952b96cde18670b0e6d2af078c83e92900bd`. `Reviewer: Approve 1c9e952b9…` is posted on #2194. The commit holding this note sits on top and changes no code.
* **Repository:** `expat-ready/xpatready`. This copy's `origin` is the old address, which GitHub redirects for git and the GitHub tools; `gh api` does not follow the redirect.
* **What #2194 holds:** AUD-5 part 2 to brief `build-lead-c-briefs/AUD-5-2.md`, in four files:
  * `ports/keep-period.ts`;
  * its contract;
  * `api/src/platform/keep-period/service.ts`;
  * the new `tests/check_aud5_check.ts`, 56/56.

  `check_aud5_keep_periods` passes unchanged (57/57). The breaker's Blocker and two Majors are fixed, each with a test.
* **CI when parked:** pr-rules, module-cards and label had passed; kind, skeleton and the code scans were still running.

## For #2197 (things this lane found that may help)
* **Category holds:** a closed client file must also be held by a CATEGORY hold on the case-side categories (breaker F1, the Blocker).
* **Callers' extra subjects:** callers need a way to add the case's people (PERSON) and the dates the case was open (DATE) (breaker F2).
* **Firm scope:** under the walled database, a check in another firm's scope or with none reads the firm's number as "not set" and holds as none. That gives a false OK unless the check refuses outside its own firm scope (breaker F3/F4).
* **Part 1's test passes unchanged only if:**
  * `KeepCheckNotBuilt` stays exported and is thrown first when no hold store is wired;
  * part 1's contract keeps exactly 5 cases;
  * the one-line `check` bodies its DW1 source check reads stay.
* **Two holds:** the hold fake orders same-millisecond holds by a random id, so assert reasons as a set, not in order.
* **`main`'s card:** `module-cards.py tree` fails on `main` itself (`api/src/front-office/MODULE.md`, 42 lines over 40).

## Open questions (were in #2194's body)
* The firm's number is read outside the caller's transaction, because the caller's transaction is the hold store's. This is for PF-21b part 2 and the caller rows.
* The joined `reason` is not capped.
* What counts as a WARN reason is the deleter's rule (BR-8).
* Two reviewer nits: the one-day future limit for non-billing classes has no test, and one test writes a settings row with `changed_by = 'test'`.

## On restart
Nothing to do unless the tech lead revives #2194. By default the branch stays as it is.
