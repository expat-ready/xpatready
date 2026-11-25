# R1.13: fresh reader's verdict (qa 11, 25 Nov 2026, ~02:1x IST)

The reader was a fresh Opus agent. It only read the code and the evidence; it ran nothing and changed nothing. It read main b0448da8b and the branch aws/2026-11-22-staging-proof at 69b57dc9d.

**Reader: Partial.** Confidence is high on the code and the evidence, and medium on the verdict. Two items are owed. Neither is a defect.

## Clauses
* **One logger, structured lines.** Met as code.
  * `log.ts` and `hook.ts` hold the one logger.
  * pf23m checks that `api/src` has no bare console calls.
  * j_13 W1 finds one JSON request line per request, with its correlation id and route pattern.
  * j_13 W2 finds every line is JSON. The one named exception is the Stripe hint, written only when an agent session starts the copy.
* **No personal data, with a fail case.** Met.
  * W2 checks the seeded name, each word of it, the email and the passport number.
  * Its probe flags a planted line. W3b does the same on the failed-run page.
  * pf23 adds redaction.
* **An error reaches the alarm.** Met, on recorded answers.
  * The six fixtures are byte-identical to 69b57dc9d's files.
  * In `20-30`, 38 real 503s raised OK → ALARM at 04:22:34Z, and the action ran on the on-call topic. The script never calls set-alarm-state.
  * W4 shows the stuck-job alarm once, on the copy.
* **An alarm reaches a person.** Met in part.
  * `45`: SNS delivered 2, failed 0.
  * `43`: one confirmed email subscription. That read was taken at 16:57Z, twelve hours after the alarm.
  * The founder's own words are not yet in a DECISIONS row. Once a row records them with the receipt time (about 09:52 IST = 04:22Z), this clause is met.
* **Logs kept 90 days in Canada.** Met.
  * `42`: `/xr/staging/app` kept 90 days, with an ARN in ca-central-1.
  * The CDK sets `THREE_MONTHS` (`observability.ts:69`) and checks it (`:131`).
  * The app and migration containers log there (`service.ts:190, 211`). QA-641 is closed.

## Owed, per the Works rule
* **Major (P-339): a ci run id for the pf23 pack on main's head, on GitHub's runners.**
  * j_13 does not run the pf23, pf23m or pf23w checks.
  * The walk 45477318897 is on 9b5a93fce. Head b0448da8b has since changed `api/src`, though with no new log call.
* **The founder's own-words DECISIONS row**, with the receipt time.

## Minors
* j_13 W5 checks the subscription as read at 16:57Z, not at alarm time. The DECISIONS row's receipt time closes this.
* The Step 20 answer was an offered option. The row must record words the founder typed himself.
* QA-645 is still Open in BUGS.md, while the R1.13 row says c52b96fa2 fixed it. qa should re-check it and close it.
* `~/run25.sh`, which produced reads 41-45, is not committed.
* The error alarm is proved only on a refused sign-in callback (a 503): real, but narrow.

## qa 11's answer to the Major, 25 Nov ~02:2x IST
* **Run on main b0448da8b**, live AI off, US$0:

| Check | Result |
|---|---|
| `check_pf23_observability` (isolated copy) | 100/100, exit 0 |
| `check_pf23m_log_calls` | 15/15, exit 0 |
| `check_pf23w_jobs_wired` | 31/31, exit 0 |

* **Still owed:** the GitHub ci run id, from the next merge batch whose tree is main's head, and the founder's row.
