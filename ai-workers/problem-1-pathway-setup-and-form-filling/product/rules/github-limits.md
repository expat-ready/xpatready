# GitHub API limits — what every agent here must know (LR-174, founder A455)

Founder A455 (28 Nov 15:3x IST): "make sure they are enforced in the lab ... everywhere agent is aware". The session-start hook points every session here.

## The facts (28 Nov 2026; source: GitHub docs, "Rate limits for the REST API", https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
| Token | Limit | Source |
|---|---|---|
| The Lead's user OAuth token (`gho_`, from `gh auth token`) | 5,000 REST requests/hour | GitHub docs: "a personal rate limit of 5,000 requests per hour" (quoted by Lead 13, 28 Nov) |
| A GitHub App owned by the organization, on Enterprise Cloud (`ghs_` installation token) | 15,000/hour | same page (quoted by Lead 13, 28 Nov) |
| `GITHUB_TOKEN` in Actions on Enterprise Cloud | 15,000/hour per repository | same page (quoted by Lead 13, 28 Nov) |
| Anything else (a personal token, a second user token) | Enterprise Cloud does not raise it | same page |

`GET /rate_limit` reports the numbers and, per GitHub's rate-limit endpoint page, does not itself count against the limit. That page was not re-read on 28 Nov: docs.github.com was unreachable from the lane's cloud container. Every REST answer carries the `x-ratelimit-limit`, `-used`, `-remaining` and `-reset` headers. The meter reads those headers.

## Measured (28 Nov, IST)
* One `lead-watch.sh` run used about **2,650** requests: two full checks in an hour spend more than the user token holds.
* The token hit **0 at 14:03** and again by **15:19**. Reads, labels and the check stamp stalled, and both standbys raised the gap alarm at 15:25 and 15:28 (LR-175).

## The rules (enforced)
1. **Every GitHub call the Lead's tools make goes through `tools/gh.sh` or is metered by `tools/github-meter.sh`.** gh.sh logs one line per call (`github-meter.sh calls` sums them per script). `github-meter.sh run <script> -- <cmd>` logs a script's cost from the headers.
2. **lead-watch's top line is the budget:** token kind, limit, used, remaining, reset, and whether the org App token is in use.
3. **A full check that would not fit the remaining budget does not run** (`github-meter.sh fits lead-watch-full` against `tools/github-budget.tsv`). It makes one ACT and runs the lite check instead.
3b. **The lite check keeps the Lead alive (LR-175):** `lead-watch.sh lite` (or `--lite`) costs under 50 requests (budget line `lead-watch-lite`, measured). It gives the lab line, merges since the last check, questions for the tech lead and reads owed. It writes the check stamp with mode `lite`, so the standbys' `lead-watch.sh gap` stays quiet while the Lead checks and names the mode of the last check. When the budget is short, run lite rather than nothing.
4. **Every metered script has a budget line** in `tools/github-budget.tsv`. `check-github-budget.sh` fails a script over its line, and lead-watch makes an ACT of it. Lower a line when a cut lands (LR-098: GraphQL, only what changed).
5. **The org App token is for reads and measures.** The App is "expat-ready-lead": App ID 5964540, installation 186772580 (not secret), owned by expat-ready and installed only on xpatready. The founder verified it at 15:4x IST, 28 Nov: limit 15000, 200 on expat-ready/xpatready, 404 on any other repository. When its key file exists, `tools/app-token.sh` mints a 1-hour installation token. It caches the token in `$TMPDIR` (mode 600) until 5 min before expiry. Defaults: `XR_APP_ID`, `XR_APP_INSTALLATION_ID`, and `XR_APP_KEY_FILE` = `~/.config/expat-ready/lead-app.pem`. `XR_APP=off` switches the App off. gh.sh sends reads **of expat-ready/xpatready** on it, and the meter measures with it. An installation token cannot reach another repository or `/user`, so `api user`, the backup repository, `-R <other>`, GraphQL and search stay on the user token. An App read refused with 401, 403 or 404 is asked once more on the user token. Without the key, both use the user token, and the top line says which.
6. **Comments and labels stay on the founder's user token.** The lead-read and label gates check who commented, so "Reviewer: Approve", "Ready for Lead read", labels, merges and every other write go on the user token. gh.sh decides per call: a non-GET `api` call, a body (`-f`, `-F`, `--input`) without `-X GET`, a GraphQL mutation, and every `gh pr/issue` verb that is not view, list, checks, diff or status. With the App in use, the top line also shows the user token's remaining budget for writes.
7. **The App's private key (`.pem`) lives outside the repository** (`~/.config/expat-ready/lead-app.pem`, mode 600). app-token.sh refuses a key inside the repository and never prints it. The push guard refuses any `.pem`.
8. **Budget-saving habits:** read once and pass the answer (lead-watch's early jobs), ask for only what changed (`since`, ETags, GraphQL), and run no polling loop against the REST API.

## Known gaps (written, not hidden)
* A few tools still call `curl` with `gh auth token` directly (same-cause.py, queue-depth.py, cycle-timeline.py, lead-label.sh and other label/PR scripts). Without the App, the header-based total of a metered run counts their requests; with the App, that total is the App token's, and their user-token reads show only in the top line's user remaining. The per-call log does not name them, and they read on the user token even when the App is configured. Routing them through gh.sh is a follow-up.
* A measured cost counts every use of the same token during the run, so other sessions on that token add to it. It is an upper bound for the script itself.
