Shared contract: `ports/events/signing.ts` gains the `OTHER` variant of `signing.completed`; FO-6 part 3's webhook (`signing/service.ts` `receive`) hands every non-RETAINER kind to its registered handler (one line).

**FO-6d part 2 of 2.** Part 1 (#3207) and FO-6 part 3 (#3065) are on main, so this PR's diff against main is part 2 only (about 310 changed lines, no migration). The FO-6d review reports (rounds 1-6) moved to #3220's branch, which stays a draft behind this PR (P-610: they are records, not part 2's code).

## What and why (R1.54; AG-5-61 r4)
* **The webhook's OTHER handler** (`any-document/completion.ts`, registered by the feature): viewed and signed move the signer and the request; the firm signer (when added) signs last; nobody signs without recorded consent (FO-6 part 4's door records it); a refusal a later event can lift keeps nothing and answers 409. `completed`: the sealed and audit files are fetched and stored before the transaction (write-once keys), then receipt (request row locked) → evidence → SIGNED → one audit line → `signing.completed` (kind OTHER) last; after the commit "Your signed document" once to each client signer. No prospect, retainer or client write anywhere.
* **The signed copies on a person** (`any-document/person-documents.ts`, `GET /api/front-office/people/:personId/documents`, key `agent/prospect:show`): any kind (retainers too), each only when its **own** prospect is visible (review M2 on #3207).

## Done when → test (`tests/check_fo6d_any_document.ts`, 35 checks with part 1's)
| FO-6d line | check |
|---|---|
| an uploaded PDF signed by two people ends with the sealed copy filed | S4 pass ×4 (SIGNED, hashes, download sha256 = stored, filed on both people, `signing.completed` OTHER schema-checked, two emails) |
| OTHER never moves a prospect or makes a client | S4 fail (after signing: stage unchanged, no `prospect.won`, no retainer) |
| no consent → no signature; the same event twice → once | S4 fail ×2 |
| the firm signer signs last | S5 fail/pass |
| review M2: each copy follows its own prospect | S6 pass/fail |

**j_54:** W7 line 3's route (`GET people/:id/documents`) and line 4's prospect half are here; W7 lines 2-4 still need FO-6 part 4 (the emailed link, code, consent and session, and a signing page for the fake).

## Review
Round 1 covered parts 1 and 2 together (reports: `screens/FO-6d/review.md`, `break-report.md`, on #3220's branch); its M2 is fixed in this part with S6. Left, said: a mismatched consent text version answers 500 on each retry (break m3; FO-6 part 4's door writes one version), a declined OTHER event is stored for FO-5d (break m4; FO-5d's row covers "the adapter's declined event"), orphan files on a failed completion (as retainers).

## Checks and results
* Suites touched (the same 18) at f2ff1f76f: **run 1 exit 0 (18/18), run 2 exit 0 (18/18)**.
* `tests/check_fo6d_any_document.ts` 36/36; size about 700 changed lines on part 1 (P-610).
* Review: round 1 with part 1; round 2 Approve/Approve at 130af5518; the merge of part 1's round 2 fix needs the round 3 asked on #3207.

Duplicate check: as part 1 (#3207); none.
Cost: US$0 (fake adapter, fake mail). On the demo: nothing visible (API only).

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01MXNda5dDH8q1AQGRnF5WM4
