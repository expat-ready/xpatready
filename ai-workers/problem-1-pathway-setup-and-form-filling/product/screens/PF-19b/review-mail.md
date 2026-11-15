# PF-19b booking mail review: MailPort over MessagePort (runtime, no screen)

Reviewer: Opus 5.5, fresh context (I did not build this). PR #1860, branch `claude/great-thompson-b4rfib`, commit **4275ff5488daa6353405062bc61cbd24d9d9137c**, against `git diff origin/main...4275ff548` (10 files, +251 −19). Reviewed 15 Nov 2026. Live AI off, US$0, no keys.
Scope: API only, no screen. The UI walks, the 1024 px / 200 % checks, the BIC table and D8-D14 are N/A (caller's instruction). The journey score is below and is the one score for this check.

## What I ran
* `tsx --tsconfig api/tsconfig.json tests/check_pf19b_mail.ts` → **16 passed, 0 failed** (5 s).
* Neighbouring suites at this commit:
  * `check_fo3_booking` 133/0, `check_fo3sr_routes` 29/0, `check_pf19b_sending` 40/0
  * `check_pf4b_session_reads` 51/0 (LocalMail on the changed contract), `check_pf21_complaints` 107/0, `check_pf23w_jobs_wired` 31/0
* `typecheck.mjs`: no new errors (15 known). It needs `NODE_OPTIONS=--max-old-space-size=8192` here; the default heap aborts.
* `graph.mjs --check`: G1 0, G2 0, G4 0, G5 0.
* Isolated copy `rvmail` on :4437 (runtime range, never :4400), stopped afterwards:
  * the app boots with `MESSAGES_MAIL` injected into `BOOKING_PORTS`
  * `GET /api/demo/platform-inbox?address=…` → 200, and 403 with `x-actor: user-P`
  * The demo seeds no platform firm or consultation type, so I could not book in the running app (as the PR says).
* **Mutations** (scratch worktree, each reverted; with the result of `check_pf19b_mail`):
  * (A) `runtime-ports.ts` back on `fakeMail` → BM1 pass and BM2 pass fail. This is the J-38 "fails on the fake" proof.
  * (B) no throw when not QUEUED → BM3 fail fails.
  * (C) dispatch failure rethrown → BM4 fail fails.
  * (D) inbox without attachments → BM1, BM5 and BM6 pass fail.
  * (E) no person check in MessagesMail → BM2 fail fails. Without the check the gate still refuses, but with a ZodError.
  * (F) host mail without `person` → BM2 pass fails.
  * (G) booker mail without `person` → BM1 pass fails.
  * (H) reminder and attendance-ask mail without `person` → **16/0 and FO-3 133/0: nothing fails** (see M1).
* **Probe** (scratch copy of the suite): a booking for 2026-10-28 15:00 Toronto, with the clock moved 31 h. The 24 h reminder went through MessagesMail: `SENT`, `SERVICE`, `FO_PERSON`, and it is in the inbox. So the code works today. It is just not tested.

## Correctness, checked
| Question | Result | Evidence |
|---|---|---|
| At most once per send call | Met | A random `mail:<uuid>` key per call. One short `$transaction` writes the attachments first, then one row. Dispatch errors are logged and not thrown (`mail.ts:30-35`, BM4). The sweep sends after `SWEEP_AFTER_MS` (BM4 pass). |
| Booking job retries | Met for a failed transaction. Noisy for a permanent refusal (m1). | It throws only when the row is not QUEUED, or before or at the commit. |
| Manage-token voiding on throw | Met | `service.ts:516-519` voids the token on every throw. A dispatch failure no longer throws, so the token stays live for the email the sweep sends. |
| Firm isolation of attachments | Met | `LocalFiles` keeps each firm's files under `<root>/<firm>/mail/<id>/<file>`. `Messages.send` refuses `msg/` keys and keys from another firm (`messages.ts:71`). The inbox reads with the row's own `firmId` (`demo-inbox.ts:35`). The key is sanitised to FileKey's form (`attachmentKeyOf`). |
| Personal data in logs | Met | The log line holds the outbox id and the error name only (BM4 checks there is no address). `MessageRefused` texts carry reasons and keys, not addresses. |
| Demo inbox exposure | Met | 404 outside the demo workspace and 403 for a client persona, both unchanged from part 1 (BM6 fail). The host's `.ics` names only the host and the firm. |
| Other MailPort callers | No regression | `person` is optional. Complaints stay on `fakeMail` and identity on `LocalMail`. The contract's `await inbox` works for sync inboxes too (PF-4b 51/0). |
| Reply-To | As built, booking unchanged | MessagePort always uses the firm's contact address. Booking already passed `firm.contactEmail`, so nothing changes for booking. `replyTo` and `templateKey` are dropped without a word in `mail.ts` (m3). |

## Findings
**Blocker:** none.

**M1 (Major): two of the four `person` lines this PR adds are untested, and the fake cannot catch their loss.**
* `service.ts:541` (reminders, `SERVICE` + `FO_PERSON`) and `service.ts:553` (attendance ask, `SERVICE` + `STAFF`) can be deleted and every suite still passes (mutation H).
* `fakeMail` does not enforce the new rule (no `person` on SERVICE or MARKETING → refused), so FO-3's 133 checks can never notice.
* In the running app, a reminder without `person` throws `MessageRefused` on every try and ends on the dead-letter list: no reminder is ever sent.
* Three open PRs edit this file: #1831 rewrites `runAttendanceAsk`, and #1830 and #1828 also change `service.ts`. A lost or missing `person` is a likely merge outcome.
* **Fix:** a named test (BM7) that runs the 24 h and 1 h reminder jobs through `runtimeBookingPorts(mail)`. Pass: `SENT`, `SERVICE`, `FO_PERSON`, in the inbox. Fail: the same reminder without `person` is refused and not in the inbox. Do the same for the attendance ask while it still sends (STAFF).

**Minor**
* **m1, a permanent refusal is retried.** A suppressed booker throws, so PF-14 tries 3 more times (`DEFAULT_RETRY`). Each try writes a new SUPPRESSED row, issues and voids a token, and writes an `.ics` file. Then the job goes to the dead-letter list: 4 rows for one email. Nothing wrong is sent. Note it for part 2 (a non-retryable refusal), or tell the caller that a SUPPRESSED row is final.
* **m2, at most once holds only per call.** The booking job runs at least once (pg-boss). If it runs again after the commit (a crash before the job completes, or a 15 min expiry), it gets a new random key and sends a second email. This is the same as on `fakeMail`, so it is not a regression, but the outbox's idempotency key goes unused. Suggest an optional `MailMessage.idempotencyKey` that booking fills from its job key (part 2 or J-38).
* **m3, silent drops.** `mail.ts`'s header does not say that `replyTo` (the firm's contact address wins) and `templateKey` are dropped. Say it in the header, or refuse a `replyTo` that is not the firm's contact address. Otherwise a later caller (staff mail with `SYSTEM_REPLY_TO`) changes behaviour unseen.
* **m4, unbounded inbox text.** The demo inbox returns the full text of every `text/*` attachment. `MailAttachment.bytes` has no size cap, and the list is up to 50 messages × 10 attachments (`demo-inbox.ts:36`). Cap it (e.g. 64 KB plus `truncated: true`). Demo only.
* **m5, error type.** `MailMessage` accepts a subject with an inner line break and a text over 100 000 characters. `MessageSend` refuses both with a ZodError (not `MessageRefused`), inside the transaction, after the attachment files were written (orphans). Nothing is sent, but the header's "throws MessageRefused" is not exact. Align the two schemas, or map the error.
* **m6, test honesty.** BM1's two "fail" cases and BM5 fail still pass on `fakeMail` (mutation A). They check booking behaviour, not this change. The real proofs are BM1 pass, BM2 pass and BM2 fail. Rename them, or swap in a case that fails on the fake.
* **m7, deviation from the brief (judged).** The PF-19b brief says booking mail stays on `fakeMail` until J-37/J-38. The current Lead's task asked for the move. My judgement: acceptable, because it is
  * said aloud in the PR, with a one-file rollback;
  * meeting J-38's own criterion (a swap test that fails on the fake: mutation A);
  * no change to booking's Reply-To or words.

  Two things are still needed. Before the label, the PR should show Lead B's acknowledgement, or the Lead's written override: the row owner's file and brief. PF-19b part 2's "MailPort becomes a thin caller of MessagePort (one line)" should reuse `MessagesMail`, not add a second adapter. Record that in Lead B's brief. J-38's "waits on PF-4b (the demo-inbox sending adapter)" is now partly met.

## Journey score (reviewer role, API journeys; UI walks N/A by the caller)
Journeys (all run against the suite or my probe):
* J1 the booker books, and the invite is in the demo inbox over HTTP (BM1, BM6)
* J2 the host's copy (BM2)
* J3 move, then cancel (BM5)
* J4 the 24 h reminder (probe)
* J5 a suppressed address (BM3)
* J6 a dispatch failure, recovered by the sweep (BM4)
* J7 a client persona (403)

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | The invite is read from `GET /api/demo/platform-inbox` (BM6). |
| Next step obvious | ½ | No page and no seeded type, so a person cannot book in the running app yet (the PR says so). |
| Plain words | 1 | The mail words are unchanged; the refusals are plain. |
| Feedback and state | 1 | The outbox shows `SENT` / `SUPPRESSED` with the reason. |
| Correct data | 1 | One UID; SEQUENCE rises; class and subject kind are right; Reply-To is the firm's. |
| Error recovery | ½ | The sweep recovers a failed dispatch. A suppressed address is retried 4 times (m1). A job that runs twice sends twice (m2). |
| Accessibility and screen sizes | N/A | No UI changed. |
| Speed | 1 | The inbox route answers in 6-15 ms; the suite runs in 5 s. |
| Visual quality | N/A | No UI changed. |
| Trust and sources | 1 | The response names `stand_in: SI-20` and `provider: local`; nothing leaves the machine. |

**Score: 7 of 8 applicable criteria, 8.5 / 10. Pass** (8 or more, no 0). To raise it: M1's test, then m1 and m2.

Could not check: a real pg-boss retry of `booking.mail` (fakeJobs never retries; m1 and m2 are read from code); a booking in the running app (no seed); D17/D20 (no intended user).

Verdict: Changes requested (M1)

## Re-review 9e79149
Read only `git diff 4275ff548..9e79149d0` (P-277), on 15 Nov 2026. The changes: `service.ts` (4 job keys), `mail.ts`, `ports/mail.ts`, `demo-inbox.ts`, the suite, and the records.

**What I ran:**
* `check_pf19b_mail` **25/0**.
* Neighbouring suites: `check_fo3_booking` 133/0, `check_pf0p_ports` 113/0, `check_pf4b_session_reads` 51/0, `check_pf19b_sending` 40/0, `check_fo3sr_routes` 29/0.
* `typecheck.mjs`: no new errors (15 known).

**Mutations** (scratch worktree, each reverted):
* (H) delete the reminder and attendance `person` → BM7 pass and BM7 fail both fail.
* (K) drop `job.key` from the booker's mail → BM8 (booking's own job rerun) fails.
* (L) skip the `MessageSend` pre-check → both BM9 subject cases fail.
* (M) skip the address pre-check → BM9's address case fails.
* (N) attachments back in one folder → the suite stops on `FileKeyTaken`.
* (P) remove the 64 KB cap → **25/0** (untested, n2).

| Earlier finding | Status | Evidence |
|---|---|---|
| **M1** reminder and attendance `person` untested | **Closed** | BM7 pass: the 24 h and 1 h reminders are `SENT`, `SERVICE`, `FO_PERSON`, and the host's question is `SENT`. BM7 fail: a booker suppressed after booking → reminders `SUPPRESSED` (COMPLAINT), and the inbox holds only the confirmation. Mutation H. |
| m1 permanent refusal retried | Reduced | The job key makes a retry answer the same SUPPRESSED row, so there are no extra rows now. Each retry still issues and voids a token and stores an orphan `.ics` (n1). Left as Minor, agreed. |
| m2 at most once only per call | **Closed** | `MailMessage.idempotencyKey` (max 180, plus `mail:` stays within MessageSend's 200). Booking passes `job.key` on all four sends. The real runner gives the caller's key back (`pgboss-jobs.ts:344`). A repeated row that is QUEUED or SENT is a success, and only SUPPRESSED, FAILED or BOUNCED throw. BM8 at the port and through booking's own handler. Mutation K. |
| m3 replyTo and templateKey silently dropped | **Closed** | The `mail.ts` header says so. |
| m4 unbounded inbox text | **Closed** in code | `INBOX_TEXT_MAX` is 64 KB; above it the text is null and the size is still listed. No test (n2). |
| m5 ZodError after files stored | **Closed** | `MessageSend.safeParse` and `normaliseAddress` run before any `files.put`. Issue texts are zod messages and paths, with no values. The address refusal never quotes the address. BM9. Mutations L and M. |
| m6 vacuous fail cases | Open, Minor | Unchanged. The new BM7, BM8 and BM9 fail cases are real. |
| m7 brief deviation | Open, Minor | There is still no comment on the PR from Lead B or from the Lead. Record the acknowledgement or the override before the label. Part 2 reuses `MessagesMail`. |
| break m3 key collisions | **Closed** | `mail/<id>/<n>/<name>`; a `.meta` or `.tmp` name gets a trailing `-`. BM9. Mutation N. |

**New, Minor only**
* **n1.** On a rerun or retry, the attachments are stored under a fresh random `mailId` before the repeated row answers, so every rerun leaves an orphan file. The person mail's rerun also leaves a live manage token that nobody received (the coordinator noted it). Use the key for the attachment folder when one is given (e.g. a hash of it), and void the unused token when `repeated`.
* **n2.**
  * No case checks the 64 KB cap (mutation P passes).
  * Only the booker's `job.key` is proved: dropping the key from the host, reminder or attendance send alone passes BM8.
  * One BM case per key, or one case looping over the four, would close this.
* **n3.** A job key of 181-200 characters is valid for JobPort but refused by `MailMessage` (max 180), and would fail on every try. Booking's keys are about 60 characters, so there is no live risk. Note it at the field.

There is no Blocker and no Major open. The journey score is unchanged at **8.5 / 10**. Error recovery is still ½ (n1, m1's retries), but the twice-run job now sends once.

Verdict: Approve 9e79149d0e98d10599c7d4a72c49bdd2678920b6
