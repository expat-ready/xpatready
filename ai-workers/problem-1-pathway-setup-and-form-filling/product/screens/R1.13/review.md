# R1.13 part PF-23m review: log calls carry ids, rule names and an error's class, never its text (runtime, no screen)

PR #2626, branch `claude/runtime-r113-logs`, head `0f49fafb05395236eaaae4254447c67cb0aeb0bc`, base `9af529c57`. Independent reviewer, 20 Nov 2026 (UTC), Opus 5.5.

**Read:**
- BACKLOG row PF-23m, and SA-11-37 (`trace-requirements.py --brief PF-23m`);
- `screens/R1.13/shape.md`, including its "As built";
- the full diff: 19 call-site files, `redact.ts` `dbRuleOf`, `check_pf23m_log_calls.ts`, `j_13.ts`, the module row and `qa/built/R1.13.md`;
- `log.ts`, `redact.ts` and `hook.ts` `patchConsole`.

**N/A (no screen, no concept):** concept fit, the keyboard / 1024 px / 200 % walk, the §3–§4 menu and words, team look, `EXPERIENCE.md` [M] lines, BIC-01–20, and D8–D14, D17 and D20.
Journey score: **9/10, pass** (`journey-test-reviewer-2026-11-20.md`).

## What I ran
- **`check_pf23m_log_calls.ts`:** 12/12.
- **J-13 on rv13 :4436:** 7/7, run twice.
- **Live probe of a moved site:** `plainRunText` through `GET /api/runs/:id` with the seeded person. It held, with 0 leaking lines.
- **Break-it on the booking door:** a non-English name, an over-long name and a double submit. It held.
- **Related suites (each on its own database):**

  | Suite | Result |
  |---|---|
  | `check_fo3_booking` | 133/0 |
  | `check_pf14_jobs` | 95/0 |
  | `check_pf23w_jobs_wired` | 31/0 |
  | `check_pf15_limits` | 69/0 |
  | `check_pf25_web_address` | 68/0 |

- **`tsc -p api/tsconfig.json`:** no error in any changed file. The errors it prints are in other tests and predate this change.
- **`count-any --against origin/main`:** 416 = 416, not rising.
- **`graph.mjs --check`:** exit 0.
- **DW1 against the base:** the same regexes find 26 lines on the merge base, so the scan bites. But 7 of the 33 moved sites were invisible to it (m1).

## The questions asked
- **Enough to diagnose, and no other behaviour change?**
  - Yes for the 27 `logPort.error` sites. They keep the event, record ids (batchId, jobId, copyId, firmId, runId), the error's class, code and frames, and `rule` where a database refusal is likely. Every catch keeps its return value and job writes unchanged.
  - The one behaviour change beyond the text is the level: about 25 sites go from `console.warn` (warn) to `logPort.error` (error). Nothing counts or alarms on level today (`observability/` grep); PF-23c should not page on level alone.
  - Diagnosability drops at 5 sites (m2, m3).
  - `firms.ts` `whyNot` is removed, with no remaining caller in the repo.
- **Is the scan too narrow?** Yes as a regression guard (m1), but nothing leaks today. I checked more widely than the scan:
  - every console call under `api/src` (27 remain);
  - `${e}`, `${error}`, `JSON.stringify(e)`, `.stack` and Nest `Logger`;
  - the injected `log?.(`/`warn` callbacks (`messages.ts` 188/239, `mail.ts` 74/97, `email/local.ts` 52, `person-link.ts` 107, `signup.ts` 169), which already log `e.name` only;
  - `console.error(e)` / `console.error("…", e)` (`demo.ts` 134/175/250, `intake.ts` 106, `main.ts` 226), which `patchConsole` reduces to `safeError`.

  The three CLI `JSON.stringify({ error: String(e) })` answers are named exceptions, and the PR flags them as a question.
- **Is dbRuleOf safe?** Yes.
  - It returns either Prisma's `meta.constraint`, or a quoted name directly after `constraint|trigger|policy|function`.
  - The name must be identifier-shaped (≤63 characters) and survive `redactText` unchanged, so a passport-shaped name or an email is refused (DW3 fail).
  - PostgreSQL's own messages put a schema name there. In the 498 `RAISE EXCEPTION` lines in `prisma/`, none puts a `%` value after those words.
  - Residual risk: a custom message of the form `constraint "<one-word value>"` would pass. None exists, so this is not a finding.
- **J-13 honesty.**
  - The Stripe exception is narrow and justified. It matches the exact whole line, exempts only the JSON-ness test (not the leak scan), and really appeared as line 1 of rv13's log with `CLAUDECODE=1`. A version bump that changes the line would fail loudly.
  - W1, W3 and W4 test real behaviour. W2 passes without reaching any moved site (m5).
- **Project rules.**
  - No personal names: "Zelda Quixote" is a de-identified fictional fixture, as SA-11-37 Fixtures asks.
  - P-170: `STUCK_JOB_MS` is marked Sample, and so are the firm and host rows.
  - `any` is flat. `j_13.ts`'s three test-side `any`s carry disable comments, as in the other journeys.
  - The module row was added.

## D-scores (code, test and standards dimensions; 1–5)
| D | Score | Evidence |
|---|---|---|
| D1 Requirement fit | 4 | SA-11-37 rules 1 and 3 are met at all 33 sites (ids, rule names, no parser or launcher text). The row's literal DW1 is met. DW2 is met by construction rather than at each site (m4) |
| D2 Data integrity | N/A | No write path changed (the catch bodies are unchanged) |
| D5 Stability and recovery | 5 | Each catch keeps its recovery. `logPort` never throws (`JsonLog.write` falls back). Double submit gives 409 |
| D6 Freshness and governance | N/A | No content |
| D7 AI trust | N/A | No AI output changed |
| D15 Speed | 5 | No new I/O; requests took 5 to 152 ms on rv13 |
| D16 Testability | 4 | Each Done-when line has a pass and a fail. Reverting any listed site to `console.*` fails DW2, because its `logPort` call is gone. Weak points: the scan's regression reach (m1) and W2 (m5) |
| D18 Provenance | 4 | Lines carry correlationId, firmId and the database rule. The plainRunText line names no run (m3) |
| D19 Capability closure | 3 | As the shape says, R1.13 cannot complete until PF-23c (alarm to a person; 90 days in ca-central-1), held under P-251. Not a finding |

STANDARDS [M] lines:
- Met: "Personal data minimised and never logged"; "Strict TypeScript, no `any`" (flat); "a rule's test fails when the rule is removed" (spot-checked by reading DW2 and the booking and plainRunText cases); the module card row.
- Not affected: the rest.

## Issues (Blocker 0 · Major 0 · Minor 5)
**m1 (Should): the DW1 scan misses text passed in variables, so it does not guard new code of the kind this PR fixed.**
- `WRITES`/`LEAKS` (`check_pf23m_log_calls.ts:27-28`) look only at `console.*` and `this.warn(`, and only at `.message`, `String(e|err|error|x)`, `whyNot(` and `${e|err|x}`.
- Against the base, 7 of the 33 moved sites pass the scan: `rounds.ts` 169/178/200/205 (`sj?.refused`, `why`, `a.error`), `people-ai.ts` 289/293 and `plain-run-text.ts` 8 (`t.slice`).
- The scan also misses `${error}`, `.stack`, `JSON.stringify(e)`, `logPort.*` fields built from text (`{ why: e.message }`), injected `log?.(` callbacks and multi-line calls.
- Fix: widen `WRITES` to `logPort\.\w+\(` and `\blog\??\.?\(`. Add `\.stack\b`, `JSON\.stringify\((e|err|error)\)`, `\$\{(error|why|reason)\b` and `\.(err|refused|error)\b` to `LEAKS`. Plant one fail line per added form.

**m2 (Should): after a failed AI start, the launcher's reason is now recorded nowhere.**
- `rounds.ts:170` `ai_stub_refused`, `rounds.ts:179` `ai_live_not_run`, `people-ai.ts:290/294` keep only `exit` and `refused: true|false`.
- The person sees a generic reason. For a stub refusal there is no run file.
- The reasons are mostly the launcher's own words (`p2/launch.ts` 111-115, 179), and they were the only clue.
- The two provider sites are fine: their words stay in the run file.
- Fix: map the refusal to a closed code (for example `digest_mismatch`, `sources_changed`, `no_stub_pass`, `launcher_threw`, `other`) and log that code, never the text.

**m3 (Should): the `run_message_kept_from_page` line names no record** (`plain-run-text.ts:9`).
- Live, one `GET /api/runs/:id` wrote 3 such lines with only `length` and `correlationId`. The request line's route is the pattern `/api/runs/:id`, so nothing says which run it was.
- SA-11-37 rule 1 asks for a record id.
- Fix: an optional `ref` argument (batch or job id) from `runs.ts:53/82` and `ai.ts:454`, logged as `{ ref, length }`.

**m4 (Should): DW2 as built throws the seeded person at only 3 of the 33 sites** (plainRunText and the two booking warns). The other 30 rest on the static shape check plus the logger's contract.
- This is disclosed in the shape's "As built", and every field at the head is an id, a count, a boolean or `dbRuleOf`, which I read site by site.
- But the shape regex (`:83`) accepts any bare identifier in the fields object (`{ why }`), so it proves "no template", not "ids only".
- Fix: tighten the field check to ids, literals, `.length`, `!!…` and `dbRuleOf(…)`. Or record the DW2 wording change in `challenge.md`, so the row's "at each moved site" is not silently narrowed.

**m5 (Should): J-13 W2 reaches no moved site, so it would pass at the merge base too.**
- Run 2's 41 log lines hold no PF-23m event. The `qa/built` line ("J-13 walks it") overstates this a little.
- Fix: add one J-13 step on the running copy that reaches a moved site. For example, my probe: a FAILED run whose step message holds a server path and the seeded person, then `GET /api/runs/:id`. Assert the plain words on the page, one `run_message_kept_from_page` line, and no seeded value.

## Could not check
- The full `run-suites.sh --changed` set. It selects everything, including browser suites on fixed ports, while another session runs suites, so I ran the related server-free suites instead.
- c8 coverage.
- The 29 moved sites that need a database fault or an AI launcher on a running copy (checked by reading them and by DW2).
- PF-23c's W5 and W6.
- Note for the Lead: the trace tool warns "SA-11-37 has no @hash (now @fdf6cb2f)" on the BACKLOG row. This PR does not touch that row.

**Verdict: Approve.** There is no open Blocker or Major. The five Minors are Should-fix and can follow in this PR or the next part (PF-23c).

## Re-review (diff only) at cbef4f6cf
Diff `0f49fafb0..cbef4f6cf` (one commit). It touches `plain-run-text.ts`, `rounds.ts`, `people-ai.ts`, `runs.ts`, `ai.ts`, `check_pf23m_log_calls.ts`, `j_13.ts` and the shape's "As built". The review and journey files it adds are byte-identical to mine.

**What I ran:**
- `check_pf23m_log_calls.ts`: 15/15.
- J-13 on rv13 :4436: 8/8 (W3b included). rv13 is stopped.
- `check_forms_rounds`: 78/0.
- `count-any --against origin/main`: 416 = 416.
- `graph.mjs --check`: exit 0.
- `tsc`: no error in `api/src` or in the changed tests.

**The five Minors:**
- **m1: fixed.**
  - `WRITES` now also covers `log?.(`, `this.d.log?.(` and `logPort.*`.
  - `LEAKS` adds `.err`, `.stack`, `.refused`, `.error`, `why`, `${error}` and `JSON.stringify(e)`, plus a text variable after a literal and a template inside `logPort` fields.
  - The 7 lines the old scan missed are now fail cases, and all are flagged. Safe forms, including `console.error("…", e)` and a `launcherReason(…)` field, are not flagged.
  - Multi-line calls are still left to review. This is disclosed, and not a finding.
- **m2: fixed.**
  - `launcherReason` returns a closed set of codes (guard, usage_limit, live_off, timeout, not_found, spend_cap, busy, other, none). It never returns the text, and the test shows a seeded string gives `other`.
  - The two digest and sources refusals in `p2/launch.ts` (112/115) map to `other`. That is coarse, but safe and still better than nothing. Not a finding.
- **m3: fixed.**
  - `plainRunText(t, runId)` is called from `runs.ts` 53/79/82 and `ai.ts` 454.
  - On rv13 the lines carry `runId`: the batch id for the run message, and the job id for the step message.
  - The test asserts `runId`, so removing it fails the test.
- **m4: fixed.**
  - `textyFields` refuses text-like names or values in the fields object, as `{ why }` or `{ note: why }`. It passes ids and codes (after `launcherReason(…)` is replaced by `CODE`).
  - Its fail case is present.
- **m5: fixed.**
  - J-13 W3b reaches a moved site on the running copy, through a FAILED run with the seeded person in the step message and `GET /api/runs/:id`.
  - It checks plain words on the page, a log line with the run's id, and no seeded value. On rv13, 0 lines held a seeded value.

**New exception:** `platform/identity/sample-seed.ts:30`.
- It logs only when `d.why.startsWith("refused")`, which is one fixed sentence ("refused: PLATFORM_ENVIRONMENT=production never seeds Sample firms", lines 19-21). No input reaches it.
- The file is open PR #2001's, and the check fails if the line moves.
- I accept the exception.

**New findings:** none.
Journey score: unchanged at 9/10. "Next step obvious" would now earn 1, so 8 of 8 applicable, but I did not re-walk the other journeys.

Verdict: Approve at cbef4f6cf (Blocker 0 · Major 0 · Minor 0 open).
