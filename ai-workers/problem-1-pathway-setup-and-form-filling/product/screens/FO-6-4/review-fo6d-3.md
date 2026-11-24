# FO-6d part 3 — review, round 1 (5b5978832)

Independent reviewer, round 1, PR #3542 (`claude/runtime-fo6d-link-emails`), head `5b5978832`. I did not build it. Row FO-6d part 3, Release 1 item R1.54. Diff `git diff origin/main...5b5978832`: 3 files (`any-document/service.ts` +14/-5, `tests/check_fo6d_any_document.ts` +14, `MODULE.rows/FO-6d-3.md` new). It merges cleanly with today's main (`git merge-tree --write-tree origin/main 5b5978832` gives one tree and no conflicts). On main, #3460 changed `sendPleaseSign`'s body but kept its signature.

## What holds (with evidence)

- **Token shape matches the door.** The token is `${firmId.replace(/-/g, "")}.${randomBytes(32).toString("base64url")}` (service.ts:129). origin/main `signing/door.ts:34` `TOKEN_SHAPE = /^([0-9a-f]{8})…([0-9a-f]{12})\.[A-Za-z0-9_-]{43}$/`, and the firm id is rebuilt from groups 1-5 (door.ts:58). I added a temporary assertion to the suite that runs main's regex on both emailed tokens. It printed `SHAPE true,true 76,76`: both match, the rebuilt firm id equals firm A's, and each is 76 characters. I then removed the assertion.
- **Each signer gets their own token, and only its sha256 is stored.** `links` is a Map keyed by signer id (service.ts:130), and each row gets `sha(links.get(s.id)!)`. The firm signer's token is `sha(plain())` inline and never kept (service.ts:138). Suite line 138 checks distinct links whose sha256 equals each row's. Line 141 checks the plain token is not in `fo_signer`, `audit_event` or the GET read. Nothing logs the token: `sendPleaseSign` logs only the error name (`link-mail.ts:30`).
- **Emails go only after the commit.** The loop at service.ts:150 is after the `try { $transaction } catch { cancel; throw }` block (service.ts:145-146). A throwing transaction therefore never reaches it. I checked this with a temporary probe: a `before insert` trigger on `fo_signing_document` raises an error for a title starting `BOOM`, so the transaction fails after the adapter's send. Result on the PR's code: `PROBE-TXFAIL 500 emails 0 cancels 1`. All refusals run before the adapter's send, and line 173 covers them (no email).
- **One failed email does not stop the others.** `sendPleaseSign` never throws, so the loop continues. Probe: a fake mail with `failOn` for one signer's `signing.please_sign`. Output: `PROBE-FAILONE 201 ["cy.fo6d@example.com"]`. The send stands (201) and the other signer still got their email.
- **A person on two requests gets one email per request.** The idempotency key is `signing:<request>:please-sign:<person>` (link-mail.ts:26). Bea is on Q1 and Q5 and gets one email on each (lines 138 and 235).
- **The firm signer is never emailed.** Line 235 checks that only the client gets an email on Q5.
- **Same pattern as the retainer path.** This follows `prepareRetainerSigning` / `afterCommit` (signing/service.ts:61-73): plain tokens stay in memory, the email goes after the commit, kind OTHER uses the "document" wording.
- **Scope.** No migration, route, permission key or new mail sender. `any-document/service.ts` holds no mail port; it calls the existing sender `link-mail.ts`. The MODULE.rows facts match the code. One exception, "A failed email is logged and the send stands": the code does this (probe above), but no suite line proves it (m1).

## Tests run (from `prototype/`, node v24.21.0, `npx tsx --tsconfig studio/api/tsconfig.json …`)

| Run | Result |
|---|---|
| `studio/tests/check_fo6d_any_document.ts` on the PR | `40 passed, 0 failed` |
| `studio/tests/check_pf19r_every_sender.ts` | `21 passed, 0 failed` (`link-mail.ts {"mailSend":1}` "Please sign" classified; no new file holds a mail port) |
| Mutation 1: drop the email loop (service.ts:150 under `if (0)`) | `37 passed, 3 failed` (lines 138, 141, 235) |
| Mutation 2: also email the firm signer its own token | `39 passed, 1 failed` (line 235: `["bea.fo6d@example.com","rep.fo6d@example.com"]`) |
| Mutation 3: store the plain token in `link_token_sha256` | 9 failed (the send is refused with a 500; lines 138 and 141 among them) |
| **Mutation 4: email before the transaction (loop moved into the `try`, ahead of `$transaction`)** | **`40 passed, 0 failed`: survives** |
| Mutation 4 plus the BOOM probe | `PROBE-TXFAIL 500 emails 2 cancels 1`: two clients get a "Please sign" link to a request that does not exist |

After every run I restored the files with `git checkout -- <file>`. `git status --short` then shows only this report.

## Findings

**Blocker:** none.

**Major**

- **M1. No suite line fails when the "only after the commit" rule is removed** (`tests/check_fo6d_any_document.ts`, around line 173; rule at `any-document/service.ts:150`). Mutation 4 above passes 40/40. The only "emails nobody" line (173) covers refusals, and they all happen before the adapter's send, so none of them reaches the transaction. This breaks STANDARDS.md §3.10 ("Every business rule has a passing and a failing test"). The rule is claimed in this row's MODULE.rows, and the retainer path this item follows has the test: `check_fo6_door_code.ts:100` "a Send whose transaction does not commit emails nothing" and `:107` "a failure after the request is recorded … emails nothing". If this regresses, clients get a signing email whose link 404s at the door.
  **Fix:** add one fail line that makes the transaction throw after `port.send`. For example, a temporary `before insert` trigger on `fo_signing_document` or `audit_event` (the BOOM probe above), or an `audit` option that throws. Assert a 500/refusal, `please()` unchanged, one adapter cancel, and no new request. Then confirm mutation 4 fails it.

**Minor**

- **m1. "A failed email is logged and the send stands" has no suite line** (`MODULE.rows/FO-6d-3.md:1`; `check_fo6d_any_document.ts`). My `failOn` probe shows it works (201, the other signer emailed). But nothing pins it, while the retainer path has `check_fo6_door_code.ts:112`. **Fix:** a pass line with a `fakeMail({ failOn })` for one signer of a two-signer send: 201, the request is SENT, and the other signer has exactly one "Please sign".
- **m2 (note, not a defect).** The retainer path lowercases the firm id in the token (`signing/service.ts:64` `.toLowerCase()`), but this path does not (service.ts:129). `ctx.firmId` comes from the staff row read from the database (`platform/identity/service.ts:152`), and Postgres returns lowercase uuids, so the token matches `TOKEN_SHAPE` today (the probe above). The two paths would match if this one did the same. It is optional.

## Journey score (reviewer role, one score for this check): 8/10, provisional

There is no browser walk. This PR changes no screen, and the door that opens the link is not on this branch, so a person cannot click through from the email. The journeys are scored on the server: (J1) send to two people, each opens their email; (J2) send with a firm signer; (J3) refused send; (J4) failure after the adapter; (J5) one email fails.

| Criterion | Score | Evidence |
|---|---|---|
| task completed | 1 | J1: both people get their own link in the door's shape (lines 138, SHAPE probe) |
| next step obvious | 1 | the email says "Open this link to read and sign it" plus the link (link-mail.ts on main) |
| plain words | 1 | "Please sign your document with <firm>", the Sample wording from 4a |
| feedback and state | ½ | J5: the sender sees 201 but is not told that one person's email failed (logged only, as in 4a) |
| correct data | 1 | only the sha256 is stored, one email per person per request (lines 138, 141, 235) |
| error recovery | ½ | J4 is correct in code but unpinned (M1); no resend for a failed link email (4a's scope) |
| accessibility and screen sizes | ½ | not walked (no screen changed) |
| speed | 1 | suite 7.7 s wall; emails go one by one after the commit, at most 9 signers |
| visual quality | ½ | not walked (plain-text email only) |
| trust and sources | 1 | Sample wording labelled; Reply-To is the firm; "for you alone: please do not forward it" |

Not checked: a real email client, a person's unaided walk (D17/D20 stay with the founder), and the end-to-end click from the email into the door (#3460 is on main, not on this branch).

Verdict: Changes
