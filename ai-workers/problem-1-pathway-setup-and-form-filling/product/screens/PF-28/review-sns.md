# Review: PR #3039, PF-28 (R1.10), the SNS notice envelope through the one input rule

Reviewed: `cae19c55c6334098fbe38a01a37683346c811c5a` (branch `claude/runtime-pf28-sns`), diff `origin/main...cae19c55c`, 5 files, +32/-8.
Opus reviewer, read-only. Nothing in the work tree was written or checked out.
**Head moved:** the PR head is now `b3be5cd0f`. It adds one commit on top, a records file only (`product/screens/PF-28/exceptions-status-2026-11-22.md`, +75), with no code. `api/` and `ports/` at `b3be5cd0f` are byte-identical to `cae19c55c`. This verdict names `cae19c55c`.

Judged against: BACKLOG PF-28 with amendment 1 (webhook doors keep the raw body; the schema runs after the signature), `design/lead-b-briefs/PF-28.md`, `api/src/platform/http/input.ts`, and the Stripe precedent (`billing/webhook.ts` `SignedEvent`, a non-strict `z.object` parsed after the signature; `check_pf28_inputs.ts` DW6 and `HOOK`).

## What I ran (scratchpad only, US$0, no :4400, no isolated copy needed)
1. **`schema-probe.mjs`.** `SnsNotice`, copied verbatim from `bounces.ts:32-38`, run with the repo's zod 4.4.3 against AWS's documented JSON.
   * Accepted:
     * SubscriptionConfirmation with the real 256-char Token and SubscribeURL;
     * Notification with Subject and UnsubscribeURL;
     * UnsubscribeConfirmation;
     * an SES-style Notification with no Subject, SignatureVersion 2 and an extra `MessageAttributes`;
     * Timestamp `2012-04-26T20:45:04.751Z`, and also without milliseconds;
     * a Message of 262,144 characters;
     * a 684-char (4096-bit) Signature;
     * a 99-char Subject.
   * Refused: only a `.fifo` TopicArn (see the note under Minor).
2. **`door-probe.mts`.** The real `SesNotices.receive()` from the work tree (code identical to `cae19c55c`), with a fake db and a test signing key. Each envelope was signed with v1 or v2 the way `check_pf19b2_ses.ts` signs.
   * AWS SubscriptionConfirmation v1: `confirmation`, URL logged.
   * AWS UnsubscribeConfirmation v2: `confirmation`.
   * AWS Notification with Subject and UnsubscribeURL, v1: passes the schema (then `ignored`, because "Hello world!" is not SES JSON).
   * SES Notification v2 with no Subject and with MessageAttributes: passes the schema (then `ignored`, no firm tags).
   * Signed, `Timestamp: "yesterday"`: `HttpException 422 {"Timestamp":"This is not in the expected format."}`.
   * Signed SubscriptionConfirmation whose TopicArn is not an ARN: 422 naming `TopicArn`. Nothing was logged and nothing confirmed (the log count stayed at 1, from the first case only).

## The five checks
1. **Schema against real envelopes: holds.**
   * Every documented SNS envelope the door must take passes: all three Types, with and without Subject, SignatureVersion 1 and 2, AWS's real TopicArn and Timestamp formats, and UnsubscribeURL, SubscribeURL and Token.
   * Every bound sits above AWS's own limits: Subject under 100 ASCII characters, Message 256 KiB in bytes (always at least as many characters), MessageId a uuid.
   * Not strict, the same as Stripe's, so fields AWS adds later pass.
   * The test fixtures (`check_pf19b2_ses.ts:122`, `check_pf19b3_delivery.ts:50`, `journeys/j_48.ts:258`) build a subset of the real shape (no Subject, no UnsubscribeURL), and that subset passes too.
   * No wrongly strict field was found.
2. **Order: holds.**
   * Before the signature, `bounces.ts:95-97` reads only what verification itself needs: SigningCertURL, SignatureVersion, Signature, TopicArn (the topic list) and Type (the string to sign).
   * `parseInput(SnsNotice, n)` at `:98` runs after `verify(n)` and before anything else: the SubscriptionConfirmation visit or log, `JSON.parse(Message)`, `enterFirm` and `apply`.
   * A 422 therefore applies nothing. The probe and the new case show this: the suppression count stays 0.
   * The unsigned variant of the new case answers 400, not 422. That pins the order: if someone moves the parse before `verify`, that case fails.
3. **public-routes.ts: holds.**
   * `:55` answers only `HttpException` with status 422, as problem+json with the rule's own body (`type`, `title`, `status`, `detail`, `code: "INVALID"`, `fields`).
   * Every other HttpException still reaches `:56` `if (!(e instanceof NoticeRefused)) throw e` and goes to `ProblemErrors` unchanged. Nothing is swallowed.
   * A 422 thrown later in `apply()` would get the same status here that the global filter would give it.
4. **HOOK widening: honest, with one gap (m1).**
   * The static follower (`tests/lib/routes.ts:124-154`) follows a parameter only when it is passed whole. `notice()` passes `parsed` (the `@Body()` value or the raw text read off `@Req()`), not `body`. So the follower cannot see this parse, and HOOK is the only way the line leaves.
   * That fits amendment 1 ("a signing vendor later"), even though the door lives under `/api/public`, not `/api/hooks`.
   * The new case is a real pass and fail:
     * without line `:98`, the signed "yesterday" notice verifies and is applied (200, suppression row), so `e22.code === 422` fails;
     * with the line, 422 naming Timestamp;
     * unsigned, 400;
     * the existing DW10 pass and M3 and DW9-v1 cases prove the schema does not refuse good notices.
   * A sloppy re-base that leaves the SNS key in the JSON fails check (a) "only shrinks" (`fixedButListed`), because HOOK keeps it out of `unparsed`.
5. **Ceilings: correct.**
   * The list at `cae19c55c` holds unparsed 8, probes 23, exceptions 17. The new line sets 8 / 23 / 17.
   * There will be a conflict with #2933 (open, head `83dba23e7`, its re-base sets unparsed 1 with "part 2's SNS body, still on main"). Whichever merges second must end at **0**. See m4.

## Findings

### Blocker
None.

### Major
None.

### Minor
* **m1. The SNS exemption is not tied to its check** (`tests/check_pf28_inputs.ts:65-70`).
  * Stripe's HOOK entry is judged in the same file, by DW6 over HTTP. The SNS entry points by comment to a case in another file.
  * Failure scenario: a later edit deletes or renames the "PF-28 fail" case in `check_pf19b2_ses.ts`, or moves the parse into a branch that confirmations skip. `check_pf28_inputs` stays green, and nothing says the door's input is unjudged.
  * Fix: one static assertion in `check_pf28_inputs.ts` beside HOOK. For example, `bounces.ts` `receive()` contains `parseInput(SnsNotice, n)` after `await this.verify(n)`, and `check_pf19b2_ses.ts` contains the named case title. Then the exemption fails loudly if its proof goes away.
* **m2. The pass side only guards the test fixture's shape, not AWS's** (`tests/check_pf19b2_ses.ts:122`, `:261-266`).
  * The suite's good notices have no Subject and no UnsubscribeURL, a 3-char Token and account 000000000000, and there is no UnsubscribeConfirmation.
  * Today's schema accepts AWS's documented envelopes (probe above), but nothing would catch a later tightening. Examples: `Subject` made required or capped below 100, `UnsubscribeURL` given a format SNS does not use, a Token cap under 256, `Timestamp` with fixed precision.
  * Failure scenario: such a tightening passes CI. In production every real Notification then answers 422, which SNS does not retry. Bounces and complaints are dropped silently, and addresses that should be suppressed keep receiving mail.
  * Fix: one pass case that signs AWS's documented Notification (with Subject and UnsubscribeURL) and an UnsubscribeConfirmation, and expects them past the schema.
* **m3. A signed notice refused by the schema leaves no trace** (`public-routes.ts:55`).
  * A 422 here means SNS signed something our schema rejects. That can only be schema drift against AWS, exactly the m2 scenario. It is answered and forgotten: no log line, no event.
  * Failure scenario: AWS changes a field's format and the team learns of it only when bounces stop arriving.
  * Fix: one log line on this branch, with ids and field names only (MessageId, the names in `fields`), no values. The existing 400 path logs nothing either, but that path is expected traffic; this one is not.
* **m4. The merge order with #2933** (`tests/check_pf28_inputs.ts:110`).
  * The ceiling check is `<=`. If #2933 merges second and keeps its `UNPARSED_CEILING = 1`, the check still passes with an empty list. That leaves one free slot for a regression the "only shrinks" rule is meant to block.
  * Fix: whoever re-bases second sets unparsed to 0. Only a merge-time note, nothing to change in this PR.

### Nits
* `public-routes.ts:55`: the local 422 body omits the `message: detail` key that `ProblemErrors` adds to every other door's problem answer (`main.ts:185`). No caller reads it (SNS ignores bodies). It is consistent with the door's own 400, which also has no `message`.
* `bounces.ts:34`: the TopicArn pattern refuses `.fifo` names and non-`aws` partitions. Neither can reach this door. FIFO topics deliver to SQS, not HTTP/S, and `verify`'s `CERT_HOST` already refuses `amazonaws.com.cn` and GovCloud certificate hosts. If either ever changes, this line and `CERT_HOST` change together.
* `check_pf28_inputs.ts:67` cites "the tech lead's ask on #2933, 22 Nov". The PR body says "Lead 4, 16:02 IST". I could not find that ask among #2933's issue comments (REST). Cite where it actually lives (a PR review comment, a STATE line, or a hand-over).
* r15-1's "Only this one door" is now "Only these two". The widening has an owner's ask and a named check, so it is honest. m1 would make it as checkable as Stripe's.

## Journey test (reviewer role): adapted, machine door
The journey-test skill is written for a browser screen. This item has no screen: the "user" is Amazon SNS posting text/plain JSON, and our team, who must notice a dropped bounce. Its journeys were walked as signed envelopes through the real `receive()`, not in a browser.

Journeys:
1. SNS confirms the subscription (v1, AWS's documented body). Result: confirmation, URL logged.
2. SNS sends an SES hard bounce with no Subject (v2). Result: past the schema; `check_pf19b2_ses` DW10 shows it applied (200, suppressed).
3. SNS sends a Notification with Subject and UnsubscribeURL (v1). Result: past the schema.
4. UnsubscribeConfirmation. Result: confirmation.
5. Error: signed but malformed (Timestamp, TopicArn). Result: 422 naming the field, nothing applied or confirmed.
6. Error: tampered after signing. Result: 400 first.
7. Recovery: the same bounce twice. Result: one suppression (existing DW9 and j_48 cover it; the schema does not change it).

| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | every real envelope accepted (probes 1 and 2) |
| Next step obvious | 1 | confirmation path unchanged; URL logged when no topic list |
| Plain words | 1 | 422 names the field, in the rule's words |
| Feedback and state | 1 | 200 / 400 / 422 each distinct, problem+json |
| Correct data | 1 | 422 applies nothing (new case, probe 2) |
| Error recovery | ½ | a signed-but-refused notice is final for SNS and leaves no trace (m3) |
| Accessibility and screen sizes | n/a (1) | no screen |
| Speed | 1 | the parse is in-memory; no extra I/O |
| Visual quality | n/a (1) | no screen |
| Trust and sources | 1 | signature first, schema after (amendment 1) |

**Score: 9.5 / 10** (adapted; two criteria scored n/a as 1 because there is no screen). Pass: 8 or more and no 0.
Not tested:
* a real AWS-signed delivery (needs a live topic; the tests sign with their own key, as before);
* a browser walk (there is no UI).

## Verdict
No Blocker and no Major. The schema accepts every real SNS envelope. The order is signature, then schema, then anything of ours. The 422 is correct and swallows nothing. The ceiling is right. m1 to m4 are worth doing but none blocks: m1 and m2 in this PR or a follow-up, m3 as a one-liner, m4 at the merge.

**Verdict: Approve**

Reviewer: Approve cae19c55c6334098fbe38a01a37683346c811c5a

---

## Round 2: diff only, `cae19c55c..f38f63567a125f0e36fdf945382b8996a1e27493`
I read `git diff cae19c55c f38f63567` read-only. The two records files are ignored, as asked (`screens/PF-28/exceptions-status-2026-11-22.md`, and this review, now committed as `screens/PF-28/review-sns.md`). The code diff covers 3 files, +23/-3.
`bounces.ts` is unchanged, so round 1's schema probes still hold.
I did not re-run the suites. The builder reports check_pf19b2_ses 46/46 and check_pf28_inputs 48/48 on `f38f63567`.

* **m1: fixed.**
  * Where: `tests/check_pf28_inputs.ts:71-76`. A new "PF-28 HOOK pass" check reads `bounces.ts` and requires `parseInput(SnsNotice, n)` after `await this.verify(n);` (`p > v`, both found).
  * It also requires `check_pf19b2_ses.ts` to keep both named cases ("PF-28 fail: a signed notice whose envelope breaks the schema" and "PF-28 pass: AWS's documented").
  * What it catches: deleting or renaming either case, removing the parse, or moving it above `verify`. Any of these now fails check_pf28 itself, the same way DW6 guards Stripe's exemption in-file.
  * The check matches text with `indexOf`. That is enough here: no comment in `bounces.ts` contains either literal.
* **m2: fixed.**
  * Where: `tests/check_pf19b2_ses.ts:249-258`. Two cases are signed with SignatureVersion 2, the test's own key, as the file already does:
    * a Notification with `Subject` ("Amazon SES Email Event Notification", 35 characters) and an `UnsubscribeURL` in AWS's form;
    * an UnsubscribeConfirmation with a 256-character Token, a SubscribeURL and an AWS-style Message. It is re-signed after the Message is set, so the signature matches.
  * Both expect 200. A 200 can only follow a passed schema: the Notification then ends "ignored" (a random outbox), the confirmation "confirmation". Any of these tightenings would turn either answer into 422 and fail the case:
    * Subject made required, or capped under 35;
    * a stricter UnsubscribeURL or SubscribeURL;
    * a Token cap under 256;
    * UnsubscribeConfirmation dropped from `Type`.
  * The Token is a repeated plain pattern rather than AWS's hex. The schema bounds only its length, so this proves the same thing.
  * It uses its own address and outbox, so DW10's counts are untouched.
* **m3: fixed.**
  * Where: `public-routes.ts:56-59`. A single `logPort.warn("messages.sns_notice_refused_by_schema", { fields })` on the 422 branch only.
  * What is logged: field names only, at most 20, joined with commas, never values. The names come from `fieldsOf`, which caps each at 64 characters. They pass through PF-23's redaction (`observability/log.ts:44`) and the line carries the correlation id.
  * It does not log the MessageId I suggested. The field names are what show that AWS's format has moved, so this is enough. Optional: add `MessageId` for tracing a single delivery.
  * The 400 and rethrow paths are unchanged; nothing is swallowed.
* **m4:** a note for the merge only. Nothing in the diff. It still applies: whichever of #3039 and #2933 merges second sets `UNPARSED_CEILING` to 0.
* **Nit (citation): fixed.**
  * Where: `check_pf28_inputs.ts:67`. It now cites "Lead 4 16:02 IST 22 Nov, done in #3039", which matches the PR body.
  * The other two nits (no `message` key in the local 422 body; the `.fifo` and other-partition TopicArn) were left as noted. Neither needs a change.

New issues in the round 2 diff: none.
* The new import (`../observability/log.ts`) is the app's one logger; other API code already calls `logPort.warn` the same way (people-ai.ts:291, plain-run-text.ts:9).
* There is no new route, no new field and no new dependency.

The journey score stands at **9.5 / 10** (adapted, machine door). The ½ on error recovery could rise to 1 now that a refused signed notice leaves a warning. I keep 9.5, because I did not watch the line appear on a running copy.

**Verdict: Approve.** No Blocker or Major is open; m1, m2, m3 and the citation nit are fixed; m4 is only a note for the merge.

Reviewer: Approve f38f63567a125f0e36fdf945382b8996a1e27493
