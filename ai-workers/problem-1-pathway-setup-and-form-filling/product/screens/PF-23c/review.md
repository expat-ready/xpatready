# PF-23c review: log group, metric filters and alarms (synth only)

PR #2743, branch `claude/happy-euler-258rhx`, head `5565438f86ee013b58b0f9d6f663b53910869ee6`. Independent reviewer (did not build it), 21 Nov. Reviewed against backlog row PF-23c and the tech lead's brief, not the screen dimensions D1-D20 or the BIC table: this is infrastructure code with no screen.

## What I ran
* `deploy/cdk`: `npm test` passes 29 of 29. `npm run synth` writes both templates and the validation report is empty. I read `cdk.out/xr-production.template.json` resource by resource: 1 log group (90 days, Retain), 11 metric filters, 1 topic, 1 email subscription on `{Ref: OnCallEmail}`, 9 alarms, each with AlarmActions and OKActions pointing at the topic.
* Trial merge of this head with #2725's head `e22e48c24` (PF-8rc, now in the merge queue as #2736): git merges it with no conflict, but `npm test` gives **51 of 57, with 6 failing**. #2725 on its own passes 49 of 49.
* Compared the filters with the app's real line writers on main: `metrics.ts` (requestLine, jobLine, mailLine, alertLine), `log.ts` `trusted()` (its `{...st, ...obj, ...st}` stamping keeps `event` as the line's own field), `jobs.ts`/`platform-jobs.ts` (`ageMs` runs from the job's due time), `alerts.ts` (`STUCK_JOB_MS` = 30 min) and `ports/alert.ts` (ALERT_KINDS).

## Checked and holding
* **Filter syntax:** every pattern is valid CloudWatch JSON-pattern syntax. `$.status >= 500` is a numeric comparison on a number field, so a 499 (aborted request) never counts. `$.ageMs >= 0` matches only when the field is there, because jobLine leaves it out when the age is unknown. MetricValue `$.ageMs`, `$.MailSent` and `$.MailBounced` are numeric fields at the root of the line.
* **Rate alarms:** `IF(FILL(den,0) >= min, 100*FILL(num,0)/den, 0)` never divides by zero and gives 0 when there is no traffic. Both metrics use the same period as the expression.
* **Job age:** the alarm uses Maximum with `> 1,800,000` ms, the same rule as stuckJobs' `>`. The test reads that limit from `alerts.ts`.
* **Metrics instead of EMF:** using metric filters rather than embedded metric format is correct for the plain awslogs driver (metrics.ts review m10).
* **Retention:** RetentionInDays is 90, which meets NFR5-14's "telemetry >= 90 days". The stack's region is pinned by estate.ts, and the region guard passes on this head.
* **On-call address:** the parameter has no default and must be one email address. A hard-coded address and a defaulted address are each caught (test lines 80-85).
* **Fail tests:** each check also runs on a broken copy and catches it: the alarm deleted, the alarm muted, the filter widened to 4xx, the metric orphaned, a 7-day log group, a log group kept for ever, no log group.
* **Values:** there are no immigration values. Every threshold is labelled Sample, and `STUCK_JOB_MS` comes from the app.
* **Files touched:** only `deploy/` files plus `qa/built/R1.13.md`, which WAY-OF-WORKING line 35 requires. No PF-8b file is touched. The estate.ts hunks do not overlap #2725's.

## Findings

### Blocker
**B1. The code clashes with #2725 when combined: main's CDK tests go red, and no required check stops it.** Git merges the two cleanly, but 6 tests fail on the result. `deploy-synth.yml` is report-only and has no `merge_group` trigger, so the queue will not catch this. Whichever PR lands second leaves main red.
* PF-8rc's `typeFindings` / `ESTATE_TYPES` (#2725 `lib/checks.ts:368`) refuses `AWS::Logs::LogGroup`, `AWS::Logs::MetricFilter`, `AWS::SNS::Topic`, `AWS::SNS::Subscription` and `AWS::CloudWatch::Alarm` (PF-8rc test "round 3").
* PF-8rc's `opaque()` guard (#2725 `checks.ts:46-52, :105`) refuses the subscription's `{Ref: OnCallEmail}` as "a parameter set at deploy time ..., whose region the guard cannot read". This fails PF-8rc's region test and PF-8a's region tests ("region pass" and the two allowance tests).
* This PR's own retention-pass test calls `regionFindings(allStacks(app))` with no allowance (`test/observability.test.ts:49`). Once #2725 adds the ca-west-1 copy stacks and the backup plan, that call fails.

Fix: rebase on main after #2725 lands, then make the combined tree pass.
* Add the five types to `ESTATE_TYPES` (a deploy/ file, so in scope).
* Give the email subscription a narrow, tested exemption in the region guard: an `AWS::SNS::Subscription` with `Protocol: email` whose `Endpoint` is a `Ref` to a parameter with an email `AllowedPattern` and no default. Keep a fail case for any other parameter `Ref`. Alternatively, take the address another way that the guard can read. The design choice is the builder's and the tech lead's.
* Call `regionFindings` with PF-8rc's allowance (`test/observability.test.ts:49`), as PF-8a's test does after #2725.
* Show the full `npm test` green on the rebased head.

### Major
**M1. The 5xx threshold ignores the 5xx level that the requirements do state, and the code says they state none.** `lib/observability.ts:15` says "the requirements say what pages, not at what level". But NFR5-15 states "5xx<0.1%", and NFR5-14 asks for "SLO-breach alerting" (ADR, requirements-2026-11-02 `02-Architecture-Decision-Record.md:195, :202`). The alarm pages at 5 %, which is 50 times the SLO (`:24`, `:101`; README `:35`), and only when there are at least 20 requests in 5 minutes. So a sustained 1 % error rate never pages. AGENTS rules 2 and 4 say a value the requirements state is not guessed and a gap is not settled silently.

Fix: cite NFR5-15 at `:15`, `:24` and README `:35`. Then either:
* derive the page level from the SLO (for example 0.1 % over a longer window with a volume floor), or
* keep 5 % as a labelled Sample fast-burn page and record in the PR, or in `screens/PF-23c/challenge.md`, why the page level differs from the SLO, so the founder can decide.

Neither option needs a new alarm.

### Minor
* **m1. OK emails mislead on one-off alarms.** `lib/observability.ts:97` sends OK actions on all 9 alarms. The five alert-kind alarms (`:105-107`, 1-minute period, missing data treated as notBreaching) return to OK about a minute after every alert, so the on-call person gets "OK" for a chain break or breach clock that is still open. The clock sweeps re-raise after `ALERT_REPEAT_MS`, so each record also produces an ALARM/OK pair per sweep. Fix: add the OK action only to the four rate and age alarms, or state plainly in the alarm description that OK means "no new alert line", not "resolved".
* **m2. Alarms carry no description.** None of the alarms sets `alarmDescription` (`:91-95`), so the email carries only the alarm name. Fix: set one per alarm with the rule (BR-2, BR-5, SA8-D40, NFR5-14, NFR5-15) and where to look (log group `/xr/<stage>/app`, filter `{ $.event = "alert" && $.alert = "<kind>" }`), with no line content.
* **m3. The retention check is stricter than NFR5-14.** `retentionFindings` requires every log group in the stack to be exactly 90 days (`:119-123`, test `:47`). NFR5-14 says ">= 90". SA-11 sets retention per data class, including audit and security logs, so a later log group kept longer (PF-8b, SA-11) would fail. Fix: require `RetentionInDays >= 90` and set (not "for ever"), and keep exactly 90 for `/xr/<stage>/app` only.
* **m4. The test does not use the app's real lines.** The filter test runs a local simulator (`matchesFilter`, `:161-174`) on hand-written lines (test `:27-39`). The contract test is a substring search of `metrics.ts` source (test `:142`), so a moved or reformatted line fails it and a semantic change that keeps the old text passes. Accepted for now because deploy-synth installs only the CDK package. Fix, later or noted: move `FILTERS` to a file with no dependencies and let PF-23's studio test match the real lines from `requestLine`, `jobLine`, `mailLine` and `alertLine` (captured with `useLog`) against it.
* **m5. Cross-row hand-offs are not recorded.**
  * AUD-1c's row (BACKLOG line ~1160) expects "PF-23c alarms on [the] absence" of `audit.chain_verify_ok`, and names the alert kind `audit.chain_integrity_failure`. Neither is in this PR. That kind is not in ALERT_KINDS (the filter matches `audit_chain_break` only), and the metric does not exist yet.
  * `mailLine` has no caller on main, so the bounce alarm stays silent until PF-4b's SES adapter and bounce handler call it.

  Fix: list both under README "Held" (`:37`) so neither is lost. No new code is required now.
* **m6. Small README and code notes.** The README routing line (`:36`) should add that SNS email needs the recipient to click AWS's confirmation link after the first deploy, or no alarm arrives. The `RETAIN` log group with a fixed name (`:58-62`) blocks a re-create after a stack delete or a logical-id change. Note that beside the retention line. The mid-file import in `estate.ts:18` can move up with the other imports once #2725 has landed.

## Journey test (reviewer role)
Score: **N/A**. There is no screen, no running service and no person who uses this. It is synth-only CDK, and no step can be walked in a browser. In its place: the synthesized templates were read, the 29 assertions were run, and the result was trial-merged with #2725 (above).

## What I could not check
* Whether CloudWatch accepts each pattern and fires the alarms in a real account. That needs the founder's account (P-782): `aws logs test-metric-filter` against the real lines, plus a test alarm to the on-call address.
* Real SNS delivery and the confirmation step.
* The CDK feature-flag defaults, which are PF-8c's.

Verdict: Changes requested

---

# Round 2: head `004d2bf5f1408026fb1676a5e0b91b10ca574910` (diff only)

Read: `baf2fc6a6` (review fixes) and `004d2bf5f` (after PF-8rc). The merge commit `759eaa0a4` (main, with #2725) was not reviewed line by line. In `deploy/cdk` on this head, `npm test` passes **58 of 58** and `npm run synth` exits 0, both run by me.

## Round 1 findings
* **B1: closed in part.**
  * The five types are added to `ESTATE_TYPES` (`checks.ts`, end of the list).
  * The PF-23c region test now passes `REGION_ALLOW` and runs `typeFindings` (`test/observability.test.ts:49-50`).
  * The estate.ts import is moved to the top.
  * The combined tree with PF-8rc is green.
  * The on-call email exemption is new code and has a hole: see R2-M1.
* **M1: closed.** The page level is NFR5-15's "5xx<0.1%" (ADR line 201, checked) × 14.4, giving 1.44 % (`observability.ts:25-31`).
  * The factor is labelled Sample, and its attribution and the "about two days" claim are correct: 30 / 14.4 ≈ 2.1 days.
  * The test pins the threshold, the SLO and the description.
  * The slow-burn gap is stated for the founder (README, `observability.ts:15-17`).
* **m1: closed.** Alert-line alarms send no OK (`:99`, `ok = false` on the alert loop). `alarmFindings` refuses an OK action on an `alert-` alarm and has a fail case (the `noisy` copy).
* **m2: closed.** Every alarm has a description with its rule and the log group, and no line content. The test checks all of them.
* **m3: closed.** Every log group must be kept at least 90 days and not for ever, and the app's group exactly 90 (`:131-141`). The fail test covers a group kept for ever, a group kept 30 days, the app's group kept 365 days, a longer non-app group that is allowed, and a missing app group.
* **m5 and m6: closed in the README.** Covered: the AUD-1c quiet-checker alarm (held), `mailLine` having no caller, the SNS confirmation link, and the retained fixed-name group.
* **m4: left as noted.** Accepted.

## Findings

### Major
**R2-M1. The on-call exemption also switches off the joined dynamic-reference check on that one subscription.** At `lib/checks.ts:118` the parameter check uses `withoutOnCallEmail(s.template, r)`. The next line, `:120` (the round 2 R2-3 check for a dynamic reference split across `Fn::Join` parts), still runs only when `!opaque(s.template, r).length` on the **unstripped** resource. On the on-call subscription that resource always has the `{Ref: OnCallEmail}` Endpoint, so the condition is always false and the joined check never runs there.

Probe on this head (my own script, `regionFindings` with `REGION_ALLOW`):

| Input | Result |
|---|---|
| The on-call subscription with `Region: {"Fn::Join": ["", ["{{resol", "ve:ssm:/xr/region}}"]]}`. `Region` sets a cross-region subscription. | `[]` (admitted) |
| The same `Region` on a subscription with a literal Endpoint | refused ("a dynamic reference (joined from parts)") |
| A plain `{{resolve:ssm:...}}` in Region | refused |
| `{Ref: OnCallEmail}` in Region | refused |
| Literal `us-east-1` in Region | refused |

So the exemption admits more than "this one Endpoint": it reopens break R2-3 for any other property of that resource. Before this commit the resource was refused outright.

Fix:
* At `:118-120`, compute `const bare = withoutOnCallEmail(s.template, r)` once and use `bare` in both `opaque` calls. Keep `flatten(r, d)` or use `flatten(bare, d)`; the stripped Endpoint is a bare `Ref` and joins as nothing either way.
* Add a sixth fail case to `test/observability.test.ts:58-65`: a joined dynamic reference in the on-call subscription's `Region`.

### Checked and holding (the exemption otherwise)
* **Strict match:** only an exact `{Ref: "OnCallEmail"}` Endpoint, on `AWS::SNS::Subscription`, with `Protocol: "email"`, a String parameter with no default and the exact pattern. A looser pattern, a default, another protocol, another resource and another parameter are each refused (the 5 fail cases, `:60-64`).
* **Other properties still scanned:** only the Endpoint is removed, and only for `opaque`. `{Ref: OnCallEmail}` or `${OnCallEmail}` in any other property is still refused (probed in Region).
* **Region scan unchanged:** `regionsIn(r, d)` still scans the whole unstripped resource, so a literal region in `Region` or `TopicArn` is caught.
* **No import cycle:** `observability.ts` imports `ON_CALL_PARAMETER` from `checks.ts`, so the pattern lives in one place, and `checks.ts` does not import back.

### Minor
None new.

## Journey test (reviewer role)
Score: **N/A**, as in round 1. This is synth-only CDK and nothing can be walked.

Verdict: Changes requested

---

# Round 3: head `861646e827b8ed8efd1ea1f4acb4ee572f014281` (diff only)

Read: `git show 861646e82 -- …/deploy/cdk` (`lib/checks.ts`, 5 lines; `test/observability.test.ts`, 5 lines).

## R2-M1: closed
* **The fix:** `lib/checks.ts:118-121` computes `const bare = withoutOnCallEmail(s.template, r)` once and uses it in both `opaque` calls. The joined dynamic-reference check now runs on the on-call subscription. `flatten(r, d)` still reads the whole resource: the stripped Endpoint is a bare `Ref`, which joins as nothing either way.
* **The probe again:** I re-ran my round 2 probe on this head. A joined `{{resolve:ssm:…}}` in the on-call subscription's `Region` is now refused ("a dynamic reference (joined from parts)"). The other four probe cases are refused as before.
* **The new assertion can fail:** it is at `test/observability.test.ts:67-71`. With `lib/checks.ts` swapped back to `004d2bf5f`, `npm test` gives 57 of 58, and only "PF-23c region guard" fails. With the fix restored, 58 of 58 pass. I ran both myself and restored the file afterwards (working tree clean).
* **Tests and synth on this head:** `npm test` passes 58 of 58 and `npm run synth` exits 0, both run by me.

## Findings
No Blocker and no Major is open. Round 1 m4 stays as accepted (the filter test uses hand-written lines and a source-text contract, because the CI install covers the CDK package only). There are no new Minor findings.

## Journey test (reviewer role)
Score: **N/A**, as in rounds 1 and 2. This is synth-only CDK with nothing to walk. In its place: the synthesized templates were read, all 58 assertions were run, and the probe of the guard was re-run.

## Still held, outside this PR
The AWS proof (P-782): a test alarm reaching the on-call person in the founder's account, the SNS confirmation step, and CloudWatch accepting each pattern for real.

Verdict: Approve 861646e827b8ed8efd1ea1f4acb4ee572f014281
