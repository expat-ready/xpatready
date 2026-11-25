# FO-6 part 4c: challenge of `plan-4c.md` (P-303)

A fresh, independent challenger wrote this on 24 Nov. It is read-only: it read `plan-4c.md`, `note.md` (rules 11 and 12, and the 4b sections), `plan-4b.md`, the FO-6 row of BACKLOG, QA-770 and the code on `claude/busy-goldberg-jyerm9`. The code read was `signing/*.ts`, `features/front-office-signing.ts`, `retainers/service.ts`, `platform/firm-scope.ts`, `check_fo6_door.ts`, `j_54.ts`, `j_61.ts`, `check_forms_qa53.ts`, `check_pf28_inputs.ts`, `check_fo6_signing_api.ts`, `isolated.sh` and `run-suites.sh`.

## Verdict: **Block**: 1 Blocker, 1 Major, 10 Minors

The Blocker is a short change to the plan's text (row 2 and note rule 11), not a redesign. Once it and the Major are fixed, the plan can be approved without another full challenge. The Lead decides.

## Blocker

**B1. Calling `Signing.receive` in-process from the stand-in page's route is refused by PF-12's bypass check (a 500), so E2 and E6 cannot pass on a copy.**
* What happens today:
  * `Signing.receive` finds the request under `asBypass(SIGNING_WEBHOOK, …)` (`signing/service.ts:131`).
  * That declared use is allowed only on `^POST /api/hooks/signing/[^/]+$` (`signing/webhook.bypass.ts:9`).
  * `asBypass` reads the current request's route from the scope. A route that does not match throws `BypassRefused` "is not allowed on POST /api/public/sign-fake/…" (`platform/firm-scope.ts:283-286`).
  * Every request runs in a scope that carries its route (`firm-scope.ts:434`, `inRequest` at :447; FirmWallsInterceptor applies to `/api/public` too). No in-request way around it exists: outside a scope, a direct call is allowed only when `unscoped === "direct"`, and the API server walls unscoped queries.
* Why it matters:
  * The plan's row 2 ("hands every webhook call … to `Signing.receive("fake", call)`") would answer 500 on Sign. E2 would read SENT or VIEWED, E6 would never reach SIGNED, and j_54 W2 and j_61 W3 would stay red.
  * The plan's unit test `check_fo6_fake_page.ts` would hide this. Run in a suite process with no request scope, `asBypass` passes in direct mode, so the unit test goes green while the copy fails.
  * The test's own header says the opposite of row 2: "marks the client signed … through the copy's own webhook door" (`check_fo6_door.ts:15-16`, and the E2 label at :260). j_61 says "the copy then sending itself the fake's signed event" (`j_61.ts:193-195`).
  * Note rule 11 has the same in-process wording, so this was carried over from the note.
* **Fix:**
  * The POST hands each call, in order, to the copy's own webhook door over loopback: `POST http://127.0.0.1:${STUDIO_PORT}/api/hooks/signing/fake` with the call's headers (`x-fake-signing-signature`, `content-type: application/json`) and its exact body bytes.
  * The hooks controller re-serialises the parsed JSON, and the fake writes its body with `JSON.stringify`, so the HMAC still matches (`hooks.ts:5-7`, :52).
  * Use 127.0.0.1 and the port, not `signingPublicBase()`: the server listens on 127.0.0.1 only (`main.ts:263`), and `STUDIO_PUBLIC_URL` may name another host.
  * Do **not** widen `SIGNING_WEBHOOK`'s routes to the public stand-in path, which would add a cross-firm bypass on a public route.
  * The hook door's limit (120 a minute per address, `hooks.ts:15`) is ample.
  * Update note rule 11 to the same words.
  * The unit test should run the page against a real Nest app, or at least assert that the POST goes through the webhook door, not through `Signing.receive`.

## Major

**M1. The firm link's order "404 (`Retainers.read`) → 422" breaks PF-28's one input rule, and `check_pf28_inputs` (named in Done when) will fail.**
* What breaks:
  * PF-28's sweep probes every keyed body route that user-R can call with a random `:id`. For the `unknown`, `wrong-type` and `missing` probes it requires 422. A 404 from "a random record looked up before the input was read proves nothing, so it does not pass" (`check_pf28_inputs.ts:202-212`).
  * user-R holds `agent/retainer:show`, so the new route is probed. With `Retainers.read` first, all three probes answer 404 and fail.
  * The plan's way out, "gets the new bodies' rows if it asks", means allow-listing a new route against the rule. PF-28 part 5 asks for the opposite on every retainer write door: "reads its fields … before anything is looked up; a malformed id is the one not-found first" (`check_pf28_inputs.ts:278-292`). FO-3c's firm-signer twin does the same (`HostLinkBody`, `consultation-agreement/controller.ts:40-41`: "each body through a strict schema before any lookup").
* **Fix:** use the order `idParam` (malformed id → 404) → strict body (422, nothing read) → `Retainers.read` (404) → no live request (409) → not the firm signer (403) → clients first (409).
  * This leaks no more than the plan's order: a body error never depends on data.
  * E5 (owner, `{}` → 422) passes either way.

## Minor

1. **Several nonces per signer must each stay valid.**
   * The test calls `/session` twice for client A (`check_fo6_door.ts:200` and :206), then opens the **first** link (:252).
   * A nonce store keyed by signer, where a new link replaces the old, would fail E1 and E2. The plan's wording (a nonce kept with its firm, document, signer and expiry) allows a map keyed by nonce; say so plainly.
   * Once a signer signs, end every other nonce of that signer, and check `signed` before calling `act`. `act` does not check it (`port.ts:162-172`), so an older nonce would make a second `signed` hook and a second `completed` hook. Both are refused, but both are stored as noise.
   * Sweep expired nonces from the map.
2. **The nonce is used up before the event is applied, and the fake never sends an event again.**
   * `act` changes the fake's state first. If the loopback hook answers 409 (`NOT_YET`, `CHANGED` or `NOT_READY`), the fake thinks the signer has signed, our tables do not, and no link can ever be made again: `embeddedLink` throws `SigningEnded("signed")`.
   * The firm link's gates (clients first, consent first) and the door's consent-before-session make this rare, but `CHANGED` (`service.ts:154`) can still happen.
   * Fix: retry a 409 from the hook once or twice, as a provider would send it again. Also note that a 409 thrown by `receive` is not "applied: false"; the plan treats the two as one.
3. **The firm signer check, row against plan.**
   * The row and note rule 12 say "the retainer's representative". The plan says "the request's FIRM signer".
   * Today the two are always the same person for a live request of the current version. `representativeStaffId` changes only through Edit, which makes a new version (`retainers/service.ts:561-577`) and is refused once the client has signed (:554). So question 4 is moot.
   * Check both (`fo_signer.staff_id` **and** the retainer's `representativeStaffId`). That costs nothing and meets the row word for word.
4. **Consent write: the audit action's name and the version constant.**
   * The door's consent line is `signing.consent_recorded` (`door.ts:166`); the plan writes `signing.consented`. Use one name, so the trail and the module card read one way.
   * Import `CONSENT_TEXT_VERSION` (`door.ts:33`) instead of writing the literal again.
   * Make the write conditional (`updateMany … where consentedAt: null`). An unconditional update with a new `now()` would hit part 1's "consent written once" trigger (`20261122020000_fo6_signing_tables/migration.sql`, the signer trigger), and the plan's "a second call writes nothing" depends on that condition.
5. **`check_fo6_signing_api` G line pins the feature's providers to exactly `["Signing","SigningDoor"]`** (`check_fo6_signing_api.ts:357-359`).
   * If `firm-link.ts` becomes a class provider, or the stand-in page gets a service, that line fails, and the suite is in Done when.
   * Either keep the firm link a function or a `Signing` method, or update the G line in the same PR (say which). The same goes for `SigningController`'s constructor, which the suite builds as `new SigningController(api, svc)` (:82).
6. **Local-only, built to be testable.**
   * Feature files are imported once (`features.ts:20`), so a `controllers` array built at import time cannot be tested under `test` and then `production` in one process without cache-busted imports.
   * Put the decision in a small exported function (for example `signingControllers(env)` and `fakeForEnv(env)`) that the unit test calls with each value.
   * Defense in depth: each stand-in handler also answers 404 unless `PLATFORM_ENVIRONMENT === "local"` at request time **and** `signingPort()` is the very fake the feature set. On a Mac copy that later runs FO-6v's sandbox adapter, the page must not act on a stale fake.
   * Set the fake in the `Signing` factory, not at import time, and only if no other adapter has been set.
   * The start-up assertion "registered outside local" is tautological when the same file decides the registration; the handler-level check is the one that adds safety.
7. **Escape the page's text.**
   * The page shows the fake envelope's `title`. For FO-6d documents of kind OTHER, staff type that title. The CSP (`default-src 'none'`, no `script-src`) blocks scripts, but HTML-escape the title and side anyway.
   * Never put the envelope's signer `name` on the page or in an error.
8. **The stand-in routes must take no `@Body` or `@Query`.**
   * `check_pf28_inputs` treats `:doc`, `:signer` and `:nonce` under `/api/public` as keys with no real value. A body or query there makes the route "unreached", which fails (`check_pf28_inputs.ts:233-236`).
   * The form posts no fields, so this is easy to keep; say it in the plan.
   * For `check_forms_qa53`, the GET must keep `@OpenRead("…") @Get("…")` on one line, with no `)` in the reason (the scan's regex, `check_forms_qa53.ts:45`).
9. **The QA-770 guard is right; close its race too.**
   * Placement: after `if (!live)` (`service.ts:200`), inside the transaction under the request lock, read `fo_retainer`'s status and `current_version`, then refuse with the receipt kept. That is consistent with the completion's final list (:169-172) and safe for completion order: a firm `signed` refused on a withdrawn retainer leaves `completed` refused too, as today, and the test in `check_fo6_signing_api.ts:332-343` signs before it withdraws, so it is unaffected.
   * The race: Withdraw takes no lock on the request (that is QA-770 itself), so a withdraw that commits between the read and `moveRetainer` still lets the request reach CLIENT_SIGNED while the retainer stays WITHDRAWN, because `moveRetainer` updates 0 rows silently (:224).
   * Fix: when the request moves but `moveRetainer`'s count is not 1, refuse (409 `CHANGED`, the same idea as the completion's check at :240).
   * The firm link's refusal on the same retainer states needs its own test line.
10. **Small points.**
    * `isolated.sh` passes the caller's environment on (`isolated.sh:89`). A `STUDIO_PUBLIC_URL` exported in a shell would move the link base off the copy and fail E1. Unset in the repository and CI today; one sentence in the test's header is enough.
    * The new `check_fo6_fake_page.ts` needs a usage line that `run-suites.sh` can read.
    * The plan's touch list (the features file, `firm-link.ts`, `service.ts`, the two tests) is wider than the note's split row for 4c. Update the note's 4c row with it.

## Sound (checked against the code)
* **E1's origin.** `isolated.sh` sets `STUDIO_PORT=$PORT` and `PLATFORM_ENVIRONMENT=local` by default (`isolated.sh:89`). Nothing in the repository or CI sets `STUDIO_PUBLIC_URL`, and `run-suites.sh` starts copies through `isolated.sh`. So `signingPublicBase()` is `http://localhost:<port>`, which equals the test's `BASE` origin.
* **The provider name.** `Signing.receive` and the hook door accept `"fake"`: they compare `toUpperCase()` with `"FAKE"` (`service.ts:128`, `hooks.ts:45`).
* **A fresh browser.** It works: the nonce is the only key, the page needs no cookie, no script and no extra request, and the CSP permits the form post (`form-action 'self'`).
* **The order's leaks** (apart from M1's PF-28 point): a case officer who passes visibility learns only what `GET …/signing` already tells them, and the 403 comes before CLIENTS_FIRST.
* **Setting the fake at feature start breaks no suite.** Every suite that sets its own fake builds `Signing` directly (`check_fo6_signing_api.ts:75-82`, `check_fo6_door_code.ts:66-68`, `check_fo6d_any_document.ts:81-97`). The route sweeps (`check_pf28_inputs`, `check_r16_deny_sweep`, j_10) only import the feature files. Every signing caller asks `signingPort()` on each call; none caches it. The consultation agreement keeps its own fake (`consultation-agreement/controller.ts:25`) and is untouched.
* **`check_forms_qa53` scans the source whatever the environment** (`check_forms_qa53.ts:35-52`, :182-201), so the REVIEWED "open" row and the PUBLIC_WRITES row are needed, as the plan says. The sweeps set `PLATFORM_ENVIRONMENT ??= "local"`, the same as the copies they probe, so their route lists and the copy agree.
* **The demo** listens on 127.0.0.1 only (`main.ts:263`), so the stand-in page is not reachable from the network.
* **Consent before the firm's link, and gating on CLIENT_SIGNED,** satisfy part 3's `NOT_YET` rules (`service.ts:217-218`), so E6's `signed` then `completed` apply in order.
* **No migration is needed:** the consent columns exist and the nonces live in memory.
* **Scope.** QA-770's signing-path guard is a fair, small addition, asked as question 1. Leaving the door's own reading of a withdrawn retainer to FO-5d is right.
