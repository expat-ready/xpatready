# PF-5t part 1 review: terms re-asked (428 TERMS_PENDING), acceptances shown (PR #1957)

Reviewed commit `3fa6b36fd3305e76bc25cd3122d5ecdcdca86cb3` (branch `claude/runtime-terms-reask`, `git rev-parse HEAD` matched), against Lead B's brief `lead-b-briefs/PF-5t.md` part 1 (rev 16.61), `STANDARDS.md`, `QUALITY.md`. Reviewer: Opus, high effort (shared guard, P-278). This part is API and guard only, so the UI dimensions and the BIC scorecard are N/A. Wording and versions are Sample. **Unconfirmed: no counsel.**

## What I ran
* `tests/check_pf5t_terms.ts`: **33 passed, 0 failed** (6 s). Neighbouring suites at this head: PF-4b 53/53, PF-5 53/53, PF-6b 24/24, PF-21w 83/83, features registry 27/27, PF-19b sending 40/40, PF-4 110/111 (the 1 is part B, which needs its isolated copy on :4541, the same as the PR body says).
* **Mutation pass** on a scratch copy (repo untouched). I removed each rule and ran the suite again:

| Removed or changed | Suite |
|---|---|
| the guard's terms check | 7 fail |
| the `for update` firm lock in accept | 1 fail (3 of 3 runs) |
| `isOwner` in the firm-terms branch of `pending` | 2 fail |
| the Owner check in accept | 2 fail |
| `a.staff_id = p.id` (privacy notice, per person) | 1 fail |
| `a.firm_id = f.id` (firm terms, per firm) | 1 fail |
| `firmScope` on the acceptances list | 3 fail |
| the start-up TERMS_GATE check | 1 fail |
| the audit line | 1 fail |
| the replay filter | 2 fail |
| the current-version check | 1 fail |
| `every` changed to `some` in the exemption match | **survives** (harmless: every handler declares one path) |
| the "published after joining" clause (`c.published_at > p.created_at`) | **survives** (the deviation's own rule has no test) |

* **Break attempts:** a version published between the sign-up form and email verification (below, M1). I timed the gate: about 0.6 ms more per guarded request (200 calls: 7.5 ms on a gated route, 6.9 ms on exempt `/me`).
* CI at review time: pr-rules green after the body edit, guard green, module-cards being re-run (the PR body now has `Card unchanged:` for `features/MODULE.md`).

## Guard review (the points I was asked to look at)
* **428 exemption:** matched on the handler's declared method and path (`guard.ts:91-95`, `:116`), never on the request path. Letter case, a trailing slash and `..` cannot widen it (tested). HEAD maps to the GET handler. An unknown method gives `"?"`, which is refused (fails closed). Only the four routes in `gate.ts:14-19` are exempt, and each is declared exactly once.
* **Ordering:** the terms check runs after `authenticate` (401), the keys check (403) and the licence check (403 NOT_LICENSED), and before `req.platform` is set. `sign-in` routes and undeclared non-platform paths (public doors, webhooks) return before it (`guard.ts:101-103`). The test covers 401 and 403 before 428, and the public door and sign-in door while terms are pending.
* **Start-up check and `@Optional` TERMS_GATE:** there is one guard instance (`features/platform-identity.ts:11`, `useExisting`) in the one module that `registerFeatures` fills. So the gate is present whenever the feature is registered, and start-up stops if the terms routes are served without the gate (tested, and the mutation fails). If `mustAccept` throws, the answer is a 500, not a pass. The `@Optional` injection therefore does not fail open, apart from a build with the whole feature file removed, which also removes the routes.
* **No other guard rule changed:** the diff only adds lines. `onModuleInit` keeps its order (`assertEveryRouteDeclared`, then the licence keys).
* **Firm scoping:** `pending` joins the staff row on both `staffId` and `firmId` (`service.ts:77`). Acceptances are filtered by the person's firm. The list uses `firmScope` (`service.ts:121`), and the composite foreign key (firm, staff) keeps `include: staff` inside the firm. Versions are a global catalogue, so "another firm's version" cannot happen, and the acceptance row is always written with the caller's own firm.
* **Raw SQL:** Prisma tagged templates only, every value bound (`::uuid` casts). The seed's `to_regclass` check is read-only.
* **Accept (concurrency and replay):** the firm row is locked first, then the current versions are read, then existing acceptances, then new rows and one audit line, all in one transaction (`service.ts:98-115`). Two Owners at once record the firm version once, and a replay writes nothing and answers the same (both tested). Under READ COMMITTED, the read after the lock sees the other transaction's committed rows, so this is sound.
* **Audit line:** `platform.terms.accepted`, actor, `detail { staffId, versionIds }` (new ids only), no audit line on a replay. This meets the brief.

## Question 1 (the deviation): sound in intent, but it opens one hole
Measuring "new" from when the person or firm was created avoids blocking invited staff and the roughly 30 suites that insert staff directly, without writing acceptances nobody gave. That reasoning is sound, and the invited-staff gap the builder names is a question for the tech lead, not a defect here. **But it keys "already accepted" on a creation date instead of on what was accepted**, and that produces M1.

## Blockers
None.

## Majors
* **M1: a firm whose sign-up straddles a new version is never asked to accept it.** `signup.ts:183` (PF-5) records the versions named on the sign-up form, at verification, up to 24 h later. The firm and Owner rows are created at verification, after the new version's `published_at`. So `c.published_at > f.created_at` / `> p.created_at` is false (`service.ts:80-81`), and the new current version is never pending, even though the Owner accepted only the older one.
  * Reproduced on a scratch copy: I published a new terms of service and a new privacy notice between `signUp` and `verify`. Afterwards the new Owner's `pending` was `[]` while their acceptances were the older versions only.
  * This is exactly the case row 100 names ("a new version asks again"), and the brief's literal rule would catch it.
  * **Fix (inside the touch list):** a version is also pending when the person (privacy notice) or the firm (firm terms) has accepted an *earlier* version of the same kind but not this one. That is `(c.published_at > p.created_at or exists (acceptance of this kind with an older version))`, and the same for the firm.
  * Add a test that publishes mid-sign-up, plus a test of the created-at clause, which survives mutation today.

## Minors
* m1: the acceptances list has no cursor pagination. STANDARDS §6 [M] ("cursor pagination") is not met. `GET staff` sets the same precedent, and the list is bounded by staff × versions. Fix: a cursor like complaints (`complaints.ts:159`), or record the gap.
* m2: accept also takes a *current but not pending* version, for example a privacy notice that was current when the person joined. The brief says "only pending versions". This is harmless and arguably useful for the invited-staff gap, but it is an undocumented deviation: say so in the PR body, or answer 400.
* m3: `for update` on `platform_firm` conflicts with the `FOR KEY SHARE` lock that every foreign-key insert in that firm takes, so the firm's writes queue behind an accept for its few milliseconds. `for no key update` serialises accepts just as well without that.
* m4: `every` versus `some` in the exemption match cannot be told apart by any test (each handler declares one path). Either works. Keep `every`, which fails closed for a handler with several paths.
* m5: the graph tool (`qa/graph.json`) lists the three new routes with `testedBy: []`. That is the tool's limitation: no `/platform` route is detected as tested. It is not this PR's.

## Standards [M] lines that apply
* Server authorisation, deny by default: **met**. Every route is declared; the Owner-only check is in the service.
* RFC 9457 Problem Details with field errors: **met** (400 CHECK_FIELDS, TERMS_NOT_CURRENT; 403 OWNER_ONLY; 428 TERMS_PENDING).
* Concurrency and duplicates under a race: **met** (lock plus unique index).
* Migrations: **N/A** (no schema change).
* Indexed reads, no N+1: **met** (one read per request). The firm-terms `not exists` uses the `(firm_id, …)` index prefix.
* Cursor pagination: **not met** (m1).
* Zod schema in the shared package: **partly**. The schema is local to the service, like the other platform services.
* Comments say why, with numbers, no people: **met**. MODULE.md updated: **met**.

## D-scores (API only; UI dimensions N/A)

| Dimension | Score | Evidence |
|---|---|---|
| D1 | 4 | Every DW is met and tested. M1 breaks row 100's "asks again" for a straddling sign-up. |
| D2 | 4 | Race and replay are safe (tested). M1 is a correctness gap. |
| D5 | 5 | Replay and double submit are no-ops. A new session is still asked. |
| D6 | 5 | Who, when and which version, with an audit line. |
| D15 | 5 | About 0.6 ms per request. |
| D16 | 4 | Every rule but the created-at clause fails its test when removed. |
| D18 | 4 | Sample and Unconfirmed notes are in the answers. |
| D3, D4, D7–D14, D19 | N/A | API only; part 2 owns the screens. |
| D17, D20 | Simulated only | No user walk; with the founder. |

BIC-01–BIC-20: N/A (not a case-side screen).

**Journey score (reviewer, the one score for this check): 9/10, pass.** 7.5 of the 8 criteria that apply; accessibility and visual quality are N/A until part 2. See `journey-test-reviewer-2026-11-16.md`.

## Could not check
A real identity provider (Cognito) sign-in; behaviour under PF-12's row-level security (#1910 is not on main yet; the builder's Question 2 covers it); the full CI run on this head (the ready check had not run yet); screens (part 2).

**Verdict: Block**: Changes needed. Fix M1 (with its tests), then re-review the diff only.
