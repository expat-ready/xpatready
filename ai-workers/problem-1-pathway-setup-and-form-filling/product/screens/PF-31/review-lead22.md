# PF-31 (b) web, PR 3193: review of the Lead 22 commit (full run 45329451249)

Head reviewed: `c3dd02a12d725519cabd1e2989eed6206df04fcd`. Scope, set by the tech lead: this one commit only (`git show c3dd02a12`), two files.
- `tests/check_pf31_multitab_browser.ts`: the usage line and the required arguments.
- `web/src/components/workspace.tsx`: `keptTabsOf` and the new `local → person` branch in `onStaffChange`.

Earlier rounds' D1–D20 and BIC scores are not rescored here. Running copy: `rv22` on :4798 (xr_studio_rv22), `AI_LIVE=off PLATFORM_IDENTITY=local`. It was restarted fresh between suites and stopped at the end. I never used :4400. The probes ran from the scratchpad with Playwright, signing in as staff user-R and user-T of sample-firm.

**Verdict: Approve.** No Blocker or Major is open. Two Minor notes follow, and neither blocks.

## 1. check_pf31 now runs on its own copy

**The pattern matches.** I ran the runner's own block (`run-suites.sh:356` and `:369-375`) in a shell against the file at this commit.

| Input | Result |
|---|---|
| The old line (`tsx tests/…`) | `NOMATCH`. This is why the suite ran with no copy and failed with "fetch failed". |
| New line, no prefix | Matches: name `screens_pf31`, port 4794, env `AI_LIVE=off PLATFORM_IDENTITY=local`, tool `tsx`, arguments ` 4794 xr_studio_screens_pf31` |
| New line, prefix `lead`, slot 1 | Name `lead_screens_pf31`, arguments `14794 xr_studio_lead_screens_pf31` |
| New line, prefix `ci`, slot 3 | Name `ci_screens_pf31`, arguments `16794 xr_studio_ci_screens_pf31` |

So the port and database substitution (`iname`/`iport`, then the `sed` at `:375`) produces the copy the runner starts, as intended. `grep -m1 "studio/tests/check_pf31_multitab_browser.ts"` finds only line 15, so no earlier header line can be picked up by mistake.

**The port and name are unique.** I took the first `isolated.sh <name> <port> start` line of every `tests/check_*` file at this commit. 4794 occurs once (this suite), and so does the name `screens_pf31`. 4731 is `check_pf18ns_bell_browser.ts`, as the commit says. `git grep 4794` finds nothing else under studio, product/tools or .github. Other suites share ports with each other, but that predates this commit and is outside its scope.

**The arguments are now required** (`check_pf31_multitab_browser.ts:27-28`). With no arguments, and with only a port, the suite prints the usage line and exits 2; I ran both. The `xr_studio_[a-z0-9_]+` check comes before the existing :4400 / `xr_studio_demo` refusal, which is unchanged. No other caller runs the suite without arguments: the only other mentions are the MODULE.rows `Tests:` lines.

**My run:** `tsx tests/check_pf31_multitab_browser.ts 4798 xr_studio_rv22` on a fresh copy passed **76/76**, exit 0, all three B1 lines included.

## 2. check_csd6: signing in on a page's own card keeps the page

**My run:** `check_csd6_reads_browser.ts 4798 xr_studio_rv22` passed **18/18**. This includes "File details shows the staff sign-in inline", the Unchanged check after signing in, and the W3 focus and 390 px lines.

**The fix is narrow** (`workspace.tsx:252-262`). It applies only when `was === "local"` and the new owner is a person. `owner` can never be `NOBODY`, because `ownerNow()` returns a scope or "local". In that case:
- the mounted tabs, dirty marks and dialogs stay as they were;
- every other staff member's kept list is removed (`:257`, the same rule as `:266`);
- the person's own well-formed kept tabs that are not already shown are appended (`keptTabsOf`, `:85-90`, the same validation as `load()`).

All other transitions keep their old handling: `NOBODY → local` uses `startAlone`, `NOBODY → person` and `person → person` reset through `load()`, and `person → local` ended by itself changes nothing.

## 3. B1: can A's tabs, pages or typing reach B? No path found

The only ways `shownOwner` becomes "local" are page load (`:122`) and the reset at `:265-269`, which remounts everything from `load()`. So whenever the new branch runs, every mounted page was built while no staff session existed. No mounted page can hold A's in-memory state when B signs in. Path by path:

- **Sign out on purpose.** `onForget` sets `NOBODY` (`:274`), and `drafts.tsx:122` removes every staff list and every draft. The next sign-in is `NOBODY → person` and takes the reset path. If the session had already ended, Sign out changes no scope, so `startAlone` does not run. `shownOwner` is still `NOBODY` all the same, so B again resets.
- **Session ended by itself, no reload.** `:263` keeps `shownOwner = A`, so B's sign-in is `A → B` and resets (`:265-269`).
- **Session ended by itself, then reload (the case the lead asked about).** After a time expiry, or after the 401 removed the token, `staffScope()` is null at load. `read()` rejects an expired `expiresAt`, and `ended` is in memory only, so it is null after a reload. So `shownOwner = "local"`, and `load()` reads only `storeOf("local")` and the current address.
  - A's list is never read, because `load()` reads `storeOf(ownerNow())` only.
  - The "local" list never holds staff addresses (the persist filter at `:130`).
  - The "local" list never holds A's tabs: while A was shown, the list was written to `storeOf(A)` (`:131`).
  - B signing in then removes `storeOf(A)` (`:257`) before reading B's list, and `drafts.tsx` drops A's drafts on the change of owner.
  - The one thing carried over is the address in the browser's address bar, freshly mounted after the reload. Before this commit `load()` also kept that address (`:100-112`), so nothing new is exposed.
- **Staff answers in the query cache.** `setStaffToken` removes the `["fo"]` and `["pf"]` caches on every sign-in or sign-out (`session.ts:36`), so the pages that are kept refetch with B's token.

**Probed in the browser on rv22.** I ran two starts: straight onto a staff page, and from the Studio first.
1. R signs in, opens Offices, an office edit and Team, and types into the office name (a draft).
2. R's token passes its `expiresAt` and the page reloads. This shows the sign-in card, with one tab and owner "local". R's list and draft are still stored, kept for R.
3. T signs in on the page's own card.

Result, both starts: T has one tab, the current address. Storage holds only `xr.workspace.v1:local`; R's list and R's draft are gone. R's typing appears nowhere: not in storage, not on the page, not in any office name field.

I also probed the same steps with **R** signing in again at step 3. R gets back all three tabs and the typed value, so the new `keptTabsOf` join works for the same person.

## 4. Findings (not blocking)

1. **Minor: tabs over the 12-tab limit are dropped silently when signing in from no staff session** (`workspace.tsx:260`).
   - **Cause.** `[...now.current.tabs, ...joining].slice(0, TAB_CAP)` drops the person's kept tabs beyond 12 without a word.
   - **Effect.** The next persist (`:131`) overwrites `storeOf(owner)`, so the dropped tabs are lost for good.
   - **Compare.** `load()` tells the person when it has to close one (`:108-110`, `:118`).
   - **Reach.** This needs signed-out (Studio or case-area) tabs on screen plus a large kept list, so it is rare. A notice like `load()`'s would cover it.
2. **Minor/nit: nothing is written until the next tab change when no kept tabs join** (`workspace.tsx:260`).
   - **Cause.** With nothing joining, `setWs` is not called, so the persist effect does not run.
   - **Effect.** `storeOf(owner)` is written only on the next tab change. A reload before then rebuilds from the person's previous list plus the address, and the signed-out tabs that were on screen do not follow.
   - **Impact.** No data is exposed or lost beyond the tab list.

## Journey score
Unchanged at **10/10**. A sign-in card inside a page now leaves the open dialog where it was (CS-D6 W1–W3 pass). The same person gets their tabs and typing back. Another person on the same browser tab never sees the last person's tabs or typing.

**Verdict: Approve**

(b) Approve c3dd02a12d725519cabd1e2989eed6206df04fcd
