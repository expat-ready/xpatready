# AUD-5 part 2: not ready as briefed (runtime lane, 22 Nov, against main 73c4e4dcd)

**Question for the tech lead:** the brief (A286) asks for "deleting inside a keep period is refused with the record class named, after it allowed", proven by `check_aud5_keep_periods.ts` and an R1.105 journey step on an isolated copy. Two things on `main` stop that, so I have built nothing.

## What is on main (evidence)
1. **AUD-5 part 2 has merged** (#2197: `94d27d3ca`, `d262a57b2`, `7a715130b`, `be65d001d`). It added `KeepPeriods.check` / `checkFor`, `tests/check_aud5_check.ts` and the contract cases. qa's board line for R1.105 ("AUD-5 part 2 (in flight)", 18 Nov) is out of date. Its commit says: "No caller outside the test", as `design/briefs/AUD-5.md` part 2 asked ("Callers wired in their own rows").
2. **There is no real hold check in the app.** `KeepPeriods.check` throws `KeepCheckNotBuilt` unless something is provided under `KEEP_CHECK_HOLDS`. Nothing provides it. PF-21b part 2 (`plat_legal_hold` and the real `LegalHoldPort` adapter in `api/src/platform/register/holds/`) is "not built" (`BACKLOG.md` line 634). There is no `api/src/platform/register/`, and no open PR for it.
3. **There is no deleter for any class in the keep-period table.** PF-11c (purge), PF-21d (erasure), CS-X3 (case delete door) and CS-D6 Dispose are all unbuilt, and none has an open PR. The only `@Delete` routes are booking settings, branding assets and complaints (complaints are always refused). None of those is a keep-period class.

So a person cannot reach "refused inside a keep period" anywhere in the app. Making it reachable means building PF-21b part 2 (schema, a permission key, breaker: yes) and at least one deleter row. Both are outside AUD-5, and the rules don't let me invent a deleter or a hold store (P-604, rule 4).

## Recommendation
* **(Recommended) Unblock it in this order:** (1) PF-21b part 2, the hold register and real adapter, with the adapter provided under `KEEP_CHECK_HOLDS`. (2) **CS-X3**, the case-side delete door, as the first real caller. It is already shaped to call `check()`. A closed file inside the firm's reminder gives WARN (needs a reason), and a trust entry gives FLOOR (refused, class named). Its pack then carries the R1.105 "deleting inside it refused" step. (3) qa re-scores R1.105. I can take (1) next in this lane if you assign it.
* Alternative: AUD-5 part 3 adds a test-only deleter route. Not recommended: it proves nothing a person can do, and qa would score it Partial again.
* Either way, qa's R1.105 line should read "AUD-5 part 2 merged (#2197); waits on PF-21b part 2 and a first caller (CS-X3 / PF-11c / PF-21d)".

Duplicate check: searched open PRs (22 Nov), `git branch -r` for aud-5 / keep / retention (none), `main`'s code for `KeepPeriods`, `KEEP_CHECK_HOLDS` and `@Delete`, and BACKLOG for PF-21b, PF-21d, CS-X3 and PF-11c. Found AUD-5 part 2 already merged (#2197).
