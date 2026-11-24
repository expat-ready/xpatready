# PF-21rs R0: review (runtime, no screen), head 0d756d5ed64ebac1b5206a2a6bdb3e1c563cd190

PR #3492, branch `claude/relaxed-ride-bud4nd`. Reviewer: a fresh context that did not build it. Scope: the code diff under `prototype/` (concept §6 and §8 for intent; the concept and challenge are already approved records).
While this review ran, the branch moved to `9c4aeca51` (breaker round 1). **This review covers `0d756d5` only.** Where the newer commit seems to touch a finding, that is noted, but it was not reviewed.

**Verdict: Changes.** The product code is sound. No firm-wall, module-wall or audit defect was found. Three things keep CI red, each with a small fix: an existing suite now fails (M1), a type error (M2), and the module-card check (M3).

## Facts (run or read at 0d756d5)
| Check | Result |
|---|---|
| `tests/check_pf21rs_r0.ts` | 15 passed, 0 failed |
| `tests/check_pf21c_breaches.ts` | 48 passed, 0 failed |
| `tests/check_bypass_uses.ts` | 52 passed, 0 failed |
| `tests/check_pf21b_requests.ts` (CI picks it: `select-suites.mjs` line 397) | 13 passed, **1 failed**: `unexpected error — asBypass: "platform.register.firm-names" is not allowed outside a request`. The suite stops there, so its later DW checks never run |
| Type check (`product/tools/typecheck.mjs`) | web 0 errors. api (12.5 GB heap; at 8 GB tsc ran out of memory here) has **1 new error**: `tests/check_pf21rs_r0.ts(101): TS2345 Argument of type 'unknown' is not assignable to parameter of type 'symbol'` |
| `module-cards.py pr` (PR body as of now) | **FAIL**: modules api-features and api-platform were touched, but neither card nor a `Card unchanged:` line was changed |
| Size, migration | 321 lines added and 21 removed under `prototype/` (under 800). No migration. |
| Red test first | `83ee78546` adds only `check_pf21rs_r0.ts`. Afterwards only the tamper step changed (it now writes on disk, past the write-once port) |

**Firm walls (holds).**
* A firm session gets 403 on `GET /breaches/:id` and sees no names (tested).
* `storedWords` checks the firm three ways: `WHERE firm_id` plus RLS under `withFirm(firmId)` on `msg_outbox`; the file under that firm's key; and `outboxId`/`firmId` inside the stored file. It returns only `{subject, text}` (tested, R0-2).
* Our staff reach it only through `one()`, with BREACH_READ_KEY (Owner, Auditor), and only for outbox ids recorded on our own notice rows.
* Asking for firm A's id as firm B gives null.

**Module wall (holds).** `breaches/service.ts` never names `msg_outbox` or files (grep). The words come in through `BREACH_WORDS`, which is wired `useExisting: MESSAGE_PORT` (tested in the R0 wiring line).

**Bypass rules (hold).**
* The use is declared in `names.bypass.ts` with `audit: "platform"`. `touchPlatform` runs in its own transaction.
* Probe with `inRequest` against the real routes: allowed on `GET /api/system/register/{breaches,breaches/:id,holds,requests/:id}`; refused on `GET …/breaches/:id/notices` and `GET /api/system/firms`.
* One use at a time: `firmNames` is never nested in another use, and the `withFirm` in `storedWords` runs after `named()` returns, not inside `asBypass`.
* `direct: true` matches the four console precedents (`platform.console.*`). It covers only suites in "direct" mode, not walled ones (see M1).
* Auditing a read of `platform_firm` rows as "platform" (one firm-less line) is a ruling the Lead already made (Lead 29 on #3492, cited in `why`), the same as `platform.console.firms-list`.

**AUD-3 (holds).**
* The changed GETs are `@ReadsAcrossFirms`: breaches `routes.ts:21,24`, holds `:16`, requests `:17,20`. Each writes one `cross_tenant.access` line.
* `storedWords` writes no line, and `withFirm` sits inside the handler, before the interceptor writes its line.
* Firm A's and B's trails stay unchanged across the reads (tested).

**Other callers (hold).**
* `list`, `read` and `one` are called only by their GET routes.
* `check_pf21c_breaches.ts:357` is refused by the database before `named()` runs.
* `check_pf21b_holds.ts` builds `LegalHolds` but never calls `list` directly. I did not run it; the builder runs it.
* `j_85` and `j_86` go through HTTP.

**Performance.**
* Each list makes a fixed number of calls: one names transaction (plus its audit line) and one staff query.
* `one()` adds one `storedWords` transaction per notice (see m1).

**Concept fit.**
* §6(a) and (b) are present: `firms[]`, `firmName`, `sentByName`, `openedByName`, `decidedByName`, event and step `actorName`, and the hold's placed and released names.
* One difference from the concept: it says `words: null, wordsNote`; the build returns `subject: null, text: null, wordsNote`. That is the shape the Lead's brief names, so it is not a finding.

## Findings (Blocker → Major → Minor)
**Blockers: none.**

**M1 (Major, CI red): an existing suite breaks.**
* Where: `tests/check_pf21b_requests.ts:177` calls `svc.read(as, fid)` straight, with no request scope. That suite runs `wallUnscopedQueries()` at line 71. `fid` names a firm, so `requests/service.ts:150` → `names.ts:228` `asBypass` refuses: there is no route, and `direct` does not apply in a walled process.
* Failing scenario: run that suite. It fails at DW5, and the rest of its checks never run.
* Fix (test wiring only; the refusal itself is right): run the call inside `inRequest({ method: "GET", path: \`/api/system/register/requests/${fid}\` }, () => svc.read(as, fid))`, or read it over HTTP with a fresh owner token. Then re-run the suite.
* Not touched by `9c4aeca`.

**M2 (Major, CI `types` red): a type error in the new test.**
* Where: `tests/check_pf21rs_r0.ts:101`. `[BREACH_MESSAGES, BREACH_WORDS, DATA_REQUEST_DAILY].includes(... as unknown)` is a `symbol[]` given an `unknown`.
* Fix: `([BREACH_MESSAGES, BREACH_WORDS, DATA_REQUEST_DAILY] as unknown[]).includes(...)`.

**M3 (Major, CI `module-cards` red; STANDARDS §7 [M] module card): no card update.**
* Two modules are touched: `api/src/platform` (messages, register, ports) and `api/src/features`. Neither has a card or fragment change, and the PR body still describes the earlier records-only stage, with no `Card unchanged:` line.
* Fix: add `api/src/platform/MODULE.rows/PF-21rs-R0.md` (Tests: `check_pf21rs_r0.ts`; Entry points: `MessageWordsPort.storedWords`, `register/names.ts`, `names.bypass.ts`) and a line for `features`, or give the reason in the body. Bring the PR body up to date for R0.

**m1 (Minor, STANDARDS §4/§5 "no N+1", bounded concurrency): the words read runs every notice at once.**
* Where: `breaches/service.ts:149-152`. `Promise.all` starts one interactive transaction per notice, all together. A breach can name up to 200 firms (`service.ts:73`), and the pool default is 10. Each transaction holds a connection during a file read (S3 in the cloud).
* Failing scenario: a 200-firm breach starves the shared pool, and transactions risk Prisma's default 2 s `maxWait`.
* One read per firm is inherent to the approved design (each firm has its own scope).
* Fix: read one at a time, or with a small fixed limit. `9c4aeca` appears to do the first.

**m2 (Minor): a storage error fails the whole page.**
* Where: `messages.ts:167`. If `files.get` throws (a storage error), the exception propagates, so `GET /breaches/:id` answers 500 for the whole breach instead of that notice's `wordsNote`. `JSON.parse` at `:169` is unguarded, but it is reachable only when the hash matches, so in practice never.
* Fix: treat a throwing `get` as null. `9c4aeca` appears to.

**m3 (Minor, STANDARDS §7 "a rule's test fails when the rule is removed"): the missing-file case is untested.**
* The R0-1 header says "missing or changed", but only the changed-file case is exercised (`check_pf21rs_r0.ts:150-155`). Removing the `!file` guard (`messages.ts:168`) would not fail any line; it would turn into a 500.
* Fix: delete one notice's stored file (on disk) and assert 200, `subject: null`, and a `wordsNote`.

**m4 (Minor): the names route pattern is wider than the routes.**
* Where: `names.bypass.ts:3`, `(\/[^/]+)?`. It also admits `GET /api/system/register/holds/<x>`, which is not a route. Harmless today: no handler there, and `firmNames` is called only from the named reads.
* Fix: list the five routes exactly. `9c4aeca` says it does.

## Journey test (reviewer role)
**Not scored: this PR has no screen** (concept §7 Q1: R0 is runtime only). The API journeys the screens will lean on are covered by the suite above: Owner reads the words, Auditor reads names and words, a tampered file shows the note, a firm token gets 403. The journey score belongs to PR A1, A2 and B.

## Not checked
* `9c4aeca` and its `break-report.md`.
* The other selected suites (the builder runs them).
* A real S3 store.
* The CI run itself (`gh pr view` GraphQL is blocked here; head SHA confirmed through REST).

Verdict: Changes 0d756d5ed64ebac1b5206a2a6bdb3e1c563cd190

## Round 2 (diff only), head 24f576ad1fd909b7e6fdc11d7f53f5ebadd1f4d8
Scope: `git diff 0d756d5ed..24f576ad1` (commits `9c4aeca51` breaker round 1 and `24f576ad1` review round 1). Not switched, committed or pushed.

**Run here at 24f576ad1:**
* `check_pf21rs_r0.ts`: 23 passed, 0 failed.
* `check_pf21b_requests.ts`: 27 passed, 0 failed.
* `module-cards.py pr` (with no PR body): PASS, 2 modules touched.
* Size: 398 lines added and 23 removed under `prototype/` (under 800).
* Not rerun here, as asked: the type check (builder running), `check_pf21b_holds.ts` and `check-port-contracts.mjs` (builder: 67/67, 0 problems).

| Round-1 item | Answer in the diff | Status |
|---|---|---|
| M1 requests suite | `check_pf21b_requests.ts:178` reads inside `inRequest({ method: "GET", url: "/api/system/register/requests/<id>" })`. `routeOf` takes `url` when `path` is absent, so the route matches the declared use. The suite is back to 27/27. | Closed |
| M2 type error | `check_pf21rs_r0.ts:104` casts the array (`as unknown[]`). The type check is the builder's to confirm. | Closed, pending the builder's type check |
| M3 module card | `api/src/platform/MODULE.rows/PF-21rs-R0.md` and `api/src/features/MODULE.rows/PF-21rs-R0.md` (2 lines each, Entry points and Tests). The check passes. | Closed. The PR body still describes the design stage; updating it is the builder's hand-off. |
| m1 all notices at once | `breaches/service.ts:218-224`: one notice at a time, in a `for … of` loop. | Closed |
| m2 storage error gives 500 | `messages.ts:172` `files.get(...).catch(() => null)`; `:174-175` a guarded `JSON.parse` plus an object check. Tested with a throwing store and a non-JSON body whose hash matches (the hash and `.meta` are rewritten, so the `JSON.parse` branch is really reached). | Closed |
| m3 missing file untested | The new R0-1 line deletes B's file and asserts 200, null words and `WORDS_UNREADABLE`. Without the `!file` guard, `sha256Hex(null.bytes)` throws inside the transaction, giving 500, so the line fails as it should. | Closed |
| m4 route pattern too wide | `names.bypass.ts:3`: `GET …/(breaches\|requests)(/:id)?` plus `GET …/holds` exactly, which is the five real GET routes. | Closed |

**New in this diff (checked):**
* `ports/contracts/message-words-port.contract.ts` is run against the real `Messages`: own message, upper-case ids, another firm's message, a changed file, and malformed or unknown ids, each null and never an error.
* The changed-file case uses firm A's second recipient. If that recipient were missing, the break-m1 line before it fails rather than passing vacuously.
* No product behaviour changed beyond the null paths above. Firm walls, the module wall, the bypass and AUD-3 are as in round 1.

**Minor (new, optional; does not block):**
* `messages.ts:172` turns any store error into null with no operations log line. During a storage outage our staff then read "missing or has changed since it was sent", which reads like tampering, and nothing in the logs says why.
* Fix if wanted: one `logPort.warn` (outbox id and error name only) in the catch. It is cheap and stays inside the current design.

**Blockers: none. Majors: none.** All seven round-1 findings are closed.

Verdict: Approve 24f576ad1fd909b7e6fdc11d7f53f5ebadd1f4d8
