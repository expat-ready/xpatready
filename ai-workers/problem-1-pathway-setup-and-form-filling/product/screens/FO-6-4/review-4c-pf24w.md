# FO-6 part 4c — review round 5, the PF-24w fix (9b3ac365a..df81a0b48)

Commit `df81a0b48` on #3490. Diff: one file, `prototype/studio/api/src/features/front-office-signing.ts` (+10 −1). The reviewer did not build it. Only this change is reviewed; the rest of #3490 was approved in earlier rounds (`review-4c.md`). The change has no screen concept and no visible UI change, so the BIC scorecard is N/A. The journey score below covers what this change can affect: whether a lane copy and a test copy start, and the stand-in page walk on a lane copy.

## What changed
The feature's default export took the environment from `process.env.PLATFORM_ENVIRONMENT` at module load. It now uses a local `loadedEnvironment()`, which returns `platformConfig().environment` and maps `ConfigRefused` with `environment === "unset"` to `undefined` (so not local). Any other refusal is re-thrown. This copies `platform/files/choose.ts:71-74` exactly.

## Correctness
* **The loader is already cached when this line runs.** The feature imports `MESSAGES_MAIL` from `features/platform-messages.ts`. That module calls `boundFiles()` and `platformConfig()` at load (`platform-messages.ts:26-27`). ESM runs a dependency's body before the importer's, so the new call is a cache hit: `settings.ts:224-229` keeps `loaded`, and the secrets were scrubbed on the first call. The new call adds no read of `process.env` and no second scrub.
* **The real server's start order is unchanged.** `main.ts:240` calls `registerFeatures` first. `features.ts:18-20` imports the feature files in sorted order, and the loader has run before this module's body. A refused configuration still fails the start at the same import, and DW2 (no PLATFORM_ENVIRONMENT, so the start exits non-zero) stays green.
* **Tests that build an app from this feature alone.** `check_fo6_fake_page.ts:15` sets `PLATFORM_ENVIRONMENT ??= "local"` before its dynamic import, so the loader reads local and the page is registered: 18/18. I ran a probe in the scratchpad that imports the feature under 4 values:
  * unset: `ConfigRefused` thrown at `platform-messages.ts:27`, before this module runs (the same as before the fix);
  * `local`: the page is registered and its controller is constructed;
  * `test` without secrets: `ConfigRefused` thrown at `platform-messages.ts:26` (the same as before);
  * ` local` (padded): see m1.
* **Other environment reads in this PR, and whether pf24w counts them on a `test` copy: it does not.**
  * `fake-page.ts:98` (the controller's constructor) runs only when Nest builds `FakeSigningPageController`. That happens only when the feature registers it, which is local only.
  * `fake-page.ts:28` `isLocal()` is called only from `fake()`, inside the page's two handlers (`:103`, `:113`), so only on a request to a route that exists only on local.
  * J-15 W1's "read again" window (10 requests and a Demo reset on the test copy) stays at 0.
  * Both reads still break the letter of the PF-24w rule on a local copy (m2).

## Tests run
From the worktree's `prototype/`, with node v24.21.0. Ports are from the runtime range 4430–4439; :4400 was never used.

| Check | Result |
|---|---|
| `check_pf24w_environment.ts 4436 pf24wrv` at df81a0b48 | **28 passed, 0 failed** |
| the same, with the old line put back (`export default signingFeatureFor(process.env.PLATFORM_ENVIRONMENT);`) | **27 passed, 1 failed**: `FAIL PF-24w J-15 W1 pass: at start each of the 24 settings' names … is read exactly once` with `PLATFORM_ENVIRONMENT=2 … at <anonymous> (api/src/features/front-office-signing.ts:51:46)` |
| restored with `git checkout -- <file>`; `git status --short` | clean (apart from this report) |
| `check_fo6_fake_page.ts` | 18/18 |
| `check_features_registry.ts` | 27 passed, 0 failed |
| `check_fo6_door.ts 4438 xr_studio_rv4cd` on an isolated local copy (`PLATFORM_IDENTITY=local`) | 42/42, including all 6 "door E (part 4c)" cases: the fake's link is on the copy's own origin, signing on the stand-in page reads CLIENT_SIGNED, and the representative signs last, so the request reads SIGNED |
| isolated local copy `rv4cl` :4438: `GET /api/public/sign-fake/fake-x/y/z` | 404 `text/html` "Test signing page" (the page's own readable 404): the page is registered through the loader's `local` |

So the fix is the line that turns pf24w red. The page registration on local still works end to end.

## Findings
**Blocker:** none. **Major:** none.

* **Minor m1: a padded value now fails the start where it used to start without the page.** The loader trims (`settings.ts:135`), so `PLATFORM_ENVIRONMENT=" local"` loads as `local`, and the feature registers the page and points the fake's links at it. The controller's constructor then compares the raw `" local"` (`fake-page.ts:98`) and throws `the stand-in signing page is registered with PLATFORM_ENVIRONMENT= local; it exists only in local` (probe output). Before the fix the page was simply left out.
  * It fails closed and no launcher sets a padded value (start.sh and isolated.sh set `local`), so this is not a security fault, only a misleading start error.
  * Fix: m2's change removes it.
* **Minor m2: `fake-page.ts:28` and `:98` still read `process.env.PLATFORM_ENVIRONMENT`.** This is against PF-24w's rule as `platform/MODULE.md:27` and `choose.ts:64-66` write it: read once, by the loader, never from process.env again. Nothing counts these reads (see Correctness), but they are a second source of truth for the same fact. That is how m1 can happen.
  * Fix: both should ask the loader the same way (one shared helper next to `assertStandInPageAllowed`, or `platformConfig().environment`). The constructor guard and the request-time check then see what the feature saw.
* **Minor m3: the new comment overstates the "unset" case.** It says unset is "an app of this feature alone, as the tests build". No such app can be built: the import of `platform-messages.ts` throws `ConfigRefused` first (probe; `check_fo6_fake_page.ts:15` says so too).
  * The catch is harmless and matches `choose.ts`.
  * Fix: reword the comment to say the branch is defensive, so no one later relies on unset loading this module.
* **Minor m4: an older read, outside this diff, not counted against this PR.** `front-office/signing/link-mail.ts:19` (FO-6 part 4a, `d2481df77`) reads `(process.env.PLATFORM_ENVIRONMENT ?? "local")` each time it sends.
  * That is both a re-read and a default to the most permissive value, which rev 16.5 / PF-24w forbids. J-15 W1 misses it because no signing email is sent in its window.
  * Recorded for a follow-up row (the loader's `environment`); it does not block this commit.

## Journey score (reviewer, the one score for this check)
This is scripted evidence only. The diff changes no page, so visual and word criteria carry over from `journey-test-reviewer-4c-2026-11-24.md`; this round re-checked them only by the door walk and the 404 page above.

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | Door E: Send to SIGNED on the stand-in page; the test copy starts and answers ready (pf24w) |
| Next step obvious | ½ | Unchanged from the 4c journey (used-link wording) |
| Plain words | ½ | Unchanged; plus m1's start message, which is confusing for a padded value |
| Feedback and state | 1 | Readable 404 page on local; the test copy refuses no route it should serve |
| Correct data | 1 | One loader read at start, zero later (J-15 W1); door E state lines exact |
| Error recovery | ½ | Unchanged (a failed delivery needs a new Send) |
| Accessibility and screen sizes | 1 | No page change; the 4c axe and widths results stand |
| Speed | 1 | 404 page in 6 ms, ready in 16 ms |
| Visual quality | 1 | No change |
| Trust and sources | 1 | The stand-in exists only on local (fails closed elsewhere); Sample only |

**8.5 / 10. Pass** (8 or more, no 0).

## Could not check
I did not run the full CI merge batch. I did not walk the page in a visible browser this round, because the diff changes no page. The scratchpad probe is not a committed test.

Reviewer: Approve df81a0b484434aa109b927608ae0e9ce37978637

Verdict: Approve
