# FO-5f2 (retainers: template safety): independent review (P-303, P-605, high effort)

* **PR:** #1809 (draft), branch `claude/confident-hamilton-pjgmw8`. **Commit reviewed:** `caedcec1604a10227db0c4673ebffecf7f9afe04` against `origin/main`. The head is now `03ee1ae22`, which adds only `qa/built/FO-5f2.md`, so the app code is the same. Reviewer: Opus; I did not build this. Date: 15 Nov 2026.
* **What I read:** the row FO-5f2 (`BACKLOG.md` on `origin/lead/2026-11-07-lead31`); "Rev 16.15" in `design/lead-b-rows-2026-11-14.md` (`origin/lead-b-front-office`); `screens/FO-5f/fo5f2-handover.md`; the PR body (DW1-DW8, Q1-Q3); `git diff origin/main...caedcec16` (7 files). From docxtemplater 3.71.1 I read `get-content-types.js`, `get-relation-types.js`, `docxtemplater.js` (compile at 480-545, updateFileTypeConfig, getTemplatedFiles at 758-777), `modules/common.js`, `filetypes.js`, `content-types.js`, `file-type-config.js`, `doc-utils.js` (str2xml, defaults), `inspect-module.js` and `get-tags.js`. Paths below are under `prototype/studio/` unless they say otherwise.
* **Scope:** this row is API only (the template screens are FO-5s). So BIC-01 to BIC-20 and the screen walks (keyboard, 1024 px, 200 %) are N/A. Journey report: `journey-test-reviewer-2026-11-15.md`.

## Runs
* `tests/check_fo5f2_template_safety.ts`: **62 passed, 0 failed** (exit 0, 11.7 s). `tests/check_fo5_retainers.ts` (local PostgreSQL): **232 passed, 0 failed** (exit 0).
* `graph.mjs --check`: G1 0 · G2 0 · G3 55 · G4 0 · G5 0 · G6 17. The retainer routes in G3 were there before this PR. `docx-worker.ts` is not in G6.
* Probes, one process each under `timeout`. Scripts: `/tmp/claude-0/-home-user-xpatready/1350ca85-7653-5e6c-af92-51b453c4608e/scratchpad/rev_fo5f2/probe.ts` and `http.mts` (the scratch folder under `tests/` is deleted).
* HTTP: isolated copy `rev_fo5f2` on :4473 (`PLATFORM_IDENTITY=local PLATFORM_SAMPLE_SEED=on`), as user-R. It was started and stopped in the same command.

## Named cases
- [x] **DW1.** The suite: all 14 ways in, each with the flood and with `{client.passport}`, refused while the page read answered (slowest 92 ms). HTTP step 6: the `.rels`-named header with `{client.passport}` → 422 PARTS_NOT_ALLOWED in 14 ms.
- [x] **DW2.** The suite: the 9 KB file with 2 M `<a/>` → TOO_COMPLEX in 178 ms; 25 MB → 613 ms; a `.rels` over 256 KB → 11 ms; just under 256 KB is accepted. In docxtemplater only `[Content_Types].xml` and `_rels/.rels` reach str2xml (`get-content-types.js:30`, `get-relation-types.js:8`; `xmlFileNames` defaults to the first one only). Both are capped in `load()` (`docx.ts:64-77`) before any parse.
- [x] **DW3.** The suite: 3,504 ms, 63 reads, slowest 282 ms; the next template and render work. My probe sent 5 jobs at once: both heavy jobs → TOO_COMPLEX ("reaching memory limit"), and the 3 jobs queued behind them were accepted. HTTP step 10: 422 in 4.4 s; the 37 page reads made meanwhile all answered 200 (slowest 332 ms).
- [x] **DW4.** The suite covers its 5 places. Also, `{client.passport}` in `word/glossary/settings.xml` is listed by the library walk (item 3), so it would be refused.
- [x] **DW5.** The suite: 3, 4 and 115 ms, each tag is `=<< >>=`. Item 4's options are in 3.71.1's schema (`docxtemplater.js:29-35`, `lexer.js:284`).
- [~] **DW6.** LibreOffice: met (a real LibreOffice 24.2 save). Both files render byte-identically to today, part by part. Word: partly met, see m-3.
- [ ] **DW7.** Not met: one way in takes 5 s and gets past the cap. See M-1.
- [ ] **DW8.** The breaker's, running separately; not judged here.

## The five items
| # | Holds? | Evidence |
|---|---|---|
| 1 Allowlist before any parse | yes, with m-1 | A Default can type only rels, xml or images, none of which docxtemplater templates. An Override pairs one type with one path, exactly and case-sensitively, so duplicates can only repeat allowed pairs. Entities, comments and single quotes are refused. Five 250 KB grammar inputs built to make the regexes slow were each refused in 5-19 ms. Odd zip names: both sides read the same pizzip `files` map, so duplicate names collapse the same way on both sides. A case variant of a templated name is not templated by docxtemplater (it looks names up exactly), and the scan still counts its braces (`/\.xml$/i`). |
| 2 Worker, limits, 5 s | yes, with m-2 | Out of memory → TOO_COMPLEX. The timeout fired at 5,308 ms ("over 5000 ms"). Jobs queued behind a breach succeed. The process exits on its own with an idle worker (0 ms), including after a breach. `docx.ts` imports the worker only as a type (erased at run time). |
| 3 Tags from the library | yes | `inspect-module.js:12` needs lodash, which is not installed. The `postparsed` walk reads the same structure `getTags` reads. I compared 14 tag shapes with `main`'s `placeholdersOf`: 13 give the same list (loops, m4, `{@raw}`, `{^inv}`, row loops, split runs). The dash loop now also lists `fees`, which is stricter and still unknown. |
| 4 No delimiter change | yes | DW5 |
| 5 Brace pre-count kept | **partly** | M-1 |

## Findings
**M-1 Major: `word/glossary/settings.xml` gets past the brace pre-count and the 2000-placeholder cap (item 5, DW7, B-19).**
* **Where:** `docx.ts:109` allows `/word/glossary/settings.xml` as settings. `scanParts` skips every `word/glossary/` path (`docx.ts:237`, `:246`). But docxtemplater compiles every part typed as settings (`modules/common.js:20`, `commonContentTypes`), and the render rewrote that part (`<Company>Passport </Company>`).
* **Repro (`probe.ts glossFlood`, `glossCap`):** 1.5 M lone `{` in that part's `<Company>` → TOO_COMPLEX only when the worker times out: 5,308 ms on upload and 5,413 ms on render. Over HTTP: 5,032 ms (step 7). DW7 asks for under 2 s, and every firm's template job waits behind it.
* 3,000, 20,000 and 60,000 `{client.name}` there are **accepted** (60,000: 524 ms, renders in 582 ms). HTTP step 8: 3,000 → 201. The same 3,000 in the body are refused (TOO_MANY_PLACEHOLDERS).
* **Fix:** do not skip by the `word/glossary/` path any part docxtemplater compiles. Skip only the glossary document type, or count `word/glossary/settings.xml` like `word/settings.xml`. Word writes that part whenever there are building blocks, so keep it on the allowlist (Q2). Add DW7 and B-19 lines for it.

**m-1 Minor: `Extension="constructor"` or `"__proto__"` → 500, not 422.** At `docx.ts:143`, `DEFAULTS[ext.toLowerCase()]?.test` finds `Object.prototype` members: `TypeError: … ?.test is not a function`. HTTP step 9: 500 "Something went wrong on the server". **Fix:** `Object.hasOwn(DEFAULTS, k)`, or a `Map`, plus a fail test.

**m-2 Minor: no test reaches the 5 s timeout.** Every breach in the suite is out of memory (DW3), so removing the `setTimeout` at `docx.ts:176` leaves all 62 green. **Fix:** add a time-bound case, for example M-1's flood once M-1 is fixed, or a smaller run count that times out before it runs out of memory.

**m-3 Minor (Q3): the "word" fixture's `[Content_Types].xml`, the very part the grammar checks, was written by python-docx, not Word.** Its declaration is `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>\n`, the lxml form. Word writes double quotes and CRLF. My probe gave the fixture Word's form, then added footnotes, endnotes, `custom.xml` Overrides and `emf`/`jpg` Defaults: all accepted. **Fix:** none in this PR. Record that DW6's Word half is a stand-in until the founder supplies a file saved by Word.

## The questions to the tech lead
* **Q1 (touch list):** accept. The six `await`s are mechanical and FO-5 is 232/232. One correction: PF-6b **#1808 is open** (opened 07:27 UTC) and touches `retainers/service.ts`. `git merge-tree caedcec16 pr1808` merges cleanly, so update the PR body's "no PF-6b PR is open".
* **Q2 (four allowlist additions):** accept; each one is in a fixture or written by Word. The glossary addition needs M-1's fix.
* **Q3:** accept as a stand-in (m-3).

*Notes, not findings:* (a) There is one unbounded queue: a hostile upload holds every firm's template work for up to 5 s, and N such uploads hold it for N × 5 s (probe: jobs waited 4.2 s and 7.4 s). That follows from the ruled "one worker"; it is for the row owner. (b) An idle worker has no `error` listener (`docx.ts:160` removes it). An uncaught error there would become an unhandled `error` event in the API process. `handle()` catches everything, so I found no input that reaches this. A permanent no-op listener would close it. (c) On render, an `UnreadableDocx` is not caught (`service.ts:332`), so a stored template that was accepted before and is refused now gives a generic 500. That was already true for unreadable files on `main`.

## D1-D20 (API row; D7, D8, D12-D14 N/A; D17, D20 not walked by a user)
D1 3: items 1-4 met, item 5 partly · D2 3: B-19's cap gets past through M-1 · D3 4: one worker, one gate for upload and render · D4 N/A · D5 4: out of memory, timeout and queued jobs recover; the API keeps answering · D6 N/A · D9 4 · D10 4: both sentences are worded as the row says · D11 3: m-1 gives a 500 · D15 3: M-1 (5 s); normal uploads 93-793 ms · D16 3: 62 + 232 green, m-2 · D18 4: refusals name the tag · D19 N/A.

## What I could not check
* A file saved by Microsoft Word itself (none in the container). There is no screen, so no browser walk, axe check, 1024 px or 200 %.
* The render path over HTTP (prospect, retainer). Render was run directly.
* CI on the PR.

**To fix before Approve (this is a Block in the WAY-OF-WORKING sense: a Major is open):** M-1, with its DW7 and B-19 tests. The Minors may be fixed here or recorded.

**Round 1 verdict:** Changes requested (`caedcec16`).

## Round 2 (diff only, P-277): `git diff caedcec16 53aa60d46`
* **Commit reviewed:** `53aa60d4684d683bad2e21a0bcea57817ddfb1a0`. I read the diff of `docx.ts` and the test file and the breaker's `break-report.md` (F1, F2). For the fixture I checked only that the JSON is the same (the parsed content is equal at both commits).
* **Suites at this head:** `check_fo5f2_template_safety` **70 passed, 0 failed**; `check_fo5_retainers` **232 passed, 0 failed** (B-23's glossary lines included).

| Round 1 | Fix | Holds? |
|---|---|---|
| M-1 glossary settings | `skipped` is by type only (`docx.ts:258`) | yes. My round-1 probes again: 1.5 M `{` → TOO_MANY_PLACEHOLDERS in 33 ms (upload) and 20 ms (render); 3,000, 20,000 and 60,000 `{client.name}` → refused in 4-14 ms. DW7 and B-19 lines added |
| m-1 prototype keys | `Object.hasOwn` (`docx.ts:145`) | yes: `constructor`, `__proto__`, `toString`, `hasOwnProperty` → PARTS_NOT_ALLOWED; tests added |
| m-2 timeout untested | `workerTimeout.ms`, set to 20 ms in one test | yes: the timeout path is now tested |
| m-3 Word fixture | none (a stand-in until the founder supplies a file saved by Word) | recorded, as agreed |
| Idle-worker note | a permanent `error` listener; `exit` clears `live` and `worker` (`docx.ts:173`) | **no**: it brings in M-2 below |
| Breaker F1, F2 | two lanes (renders first), at most 8 uploads wait, then 422 TEMPLATES_BUSY | yes as built: the F1 and F2 tests pass, and renders wait for at most the job in flight |

**M-2 Major (new in this round): after a timeout breach, the job queued behind it leaves its worker running and orphaned. Each such pair leaks one worker in the API process.**
* **Cause:** `onBreach` (`docx.ts:187`) sets `worker = null` and calls `w.terminate()`, but it leaves `live` pointing at the dying worker. `pump()` starts the next job at once, and `worker` becomes that job's new worker. Then the old worker's `exit` arrives: `terminate()` is asynchronous on a timeout, whereas after an out-of-memory error the exit comes in the same tick. The idle listener at `docx.ts:173` sees `live === w` and sets `worker = null`, which wipes the new worker's handle. The new worker finishes its job and stays alive, idle and unreferenced. The next job starts yet another worker.
* **Repro** (`/tmp/claude-0/-home-user-xpatready/1350ca85-7653-5e6c-af92-51b453c4608e/scratchpad/rev_fo5f2/leak.ts`): each round is a file that breaches by the time limit, with a good upload queued right behind it.
  * Real limits, 5 s, on one busy core (`taskset -c 0` beside a busy loop): `TOO_COMPLEX (over 5000 ms)` then `accepted`. Threads went 13 → 14 → 15 over 3 rounds, and 8 → 12 over 5 rounds in an earlier run.
  * With the suite's 20 ms knob: threads 13 → 17 and RSS 134 → 289 MB over 10 rounds. Threads went up by one exactly in the rounds whose second job was accepted.
  * Control, a memory breach with a good job queued behind it: threads stayed at 13 for 8 rounds.
* **Why it matters:** a firm that alternates a slow file with a good one grows the shared process by one worker per pair, without limit. That works against the row's goal ("can never take down the API") and may feed the breaker's F2.
* **Fix:** in `onBreach`, also clear `live` when `live === w`. Or let the `exit` listener clear `worker` only while `worker` still resolves to `w`. Add a test: a timeout breach with a job queued behind it, then one more job; assert that no extra worker was started (a start counter, or the thread count back at its baseline).

*Notes, not findings:*
* `TEMPLATES_BUSY` lets one firm that keeps 9 slow uploads in flight make other firms' uploads be refused (renders keep going). That is the price of the ruled "one worker"; it is for the row owner.
* `workerTimeout` is a mutable export used as a test knob. That is acceptable.

**To fix before Approve:** M-2, with its test. Round 1's findings are closed.

Verdict: Changes requested
