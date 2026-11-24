# Review: PF-19e, sealed TRANSACTIONAL bodies and the platform's own mail off the daily cap (runtime row, no screen)

**Verdict: Ship after fixes** for `570c344b483ace08ee761d08c704a53d2c367de3` (`claude/runtime-pf19e-sealed`, draft PR #3406). Reviewer: Opus 5.5, fresh context, did not build it. 24 Nov 2026.
* Brief: Lead B's PF-19e brief with its 18 Nov amendment (read from `origin/lead-b-front-office`). Diff `origin/main...570c344b4`: 17 files.
* Journey score: **8.5/10, pass** (`journey-test-reviewer-2026-11-24.md`).
* All my evidence was gathered on 570c344b4 and finished by 06:02 UTC. At 06:04 another session edited `identity/service.ts`, `send/messages.ts`, `action-names.ts` and two suites in this same checkout. Those edits are uncommitted and I did not review them.

## What I ran
* `check_pf19e_sealed_bodies.ts`: **24/24**.
* Through `run-suites.sh --only`, all PASS: pf19r_senders 27, pf19b_sending 42, pf19b_mail 29, pf19p 68, pf19a 94, pf19b2_ses 46, pf19b3_delivery 24, pf13 30, pf13b 32, pf21c 48, pf24 84, pf4b 57, pf6m 12, pf6m2 19, pf18a 72.
* `check_pf4_identity.ts`: by its usage line on :4432, **120/120**. Under `run-suites.sh` it fails because the runner names copies `runtime_*` while the suite expects `xr_studio_pf4`. That is a runner mismatch, not caused by this diff.
* `tools/check-port-contracts.mjs`: 0 problems. `graph.mjs` ran; the row has no screen, so nothing for it in GRAPH.md.
* **Mutations (each put back with `git checkout`, before the other session's edits):**
  * Sealing off: DW1 and DW2 fail (5 FAIL).
  * Worker cap exemption off: the DW3 pass case fails.
  * Hourly limit off: the DW3 429 case and the code case fail.
  * `notice_not_sent` audit off: DW4 fails.
  * `capHolds` exemption off: DW3 fails.
  * So every new rule has a test that fails without it.
* An isolated copy on :4431 (runtime ports, never :4400). Journeys in headless Chromium plus psql and API reads. Run twice. The copy is now stopped and its database dropped.

## Builder decisions
1. **Parts of 8000, owner `<outboxId>.<n>.<of>`, platform rows under the all-zero firm: agree.** The box takes at most 8192 characters (`secret-box/aes-gcm.ts:14`). The index and the count are bound into each part, so a dropped, added or reordered part is refused. A part never opens for another firm or message (DW1 fail case). I measured a 4,165-byte sealed invitation with no token, address or subject text in it.
2. **`MessageSend.system` with the `system:` key prefix, no migration: agree.** Only internal callers build `MessageSend` (no HTTP body is parsed into it). A forged prefix is refused (DW3), and the per-address count is serialised by an advisory lock (default READ COMMITTED, so the count after the lock sees committed rows). But see m2 and m3 on how the limit is scoped.
3. **Fixed local key, refusal elsewhere: agree.** Outside local, `loadPlatformConfig` already refuses to start without `PLATFORM_SECRET_BOX_KEYS` (`config/settings.ts:142`), so the refusal branch is only a backstop. See m1.
4. **MAIL_PORT is already on main: agree.** On main, `features/platform-staff-read.ts:18` binds `MAIL_PORT` with `useExisting: MESSAGES_MAIL`.
5. **Partly agree.**
   * The reset path's 409 keeps PF-19r's newer ruled words and now adds an audit line. That is fine once it is recorded (m5).
   * **I disagree on the invitation path:** see M1 and M2. Brief item 4 names "invitation or two-step reset", and `identity/service.ts` is on the touch list for it. There is no `challenge.md`, and I could not read the PR to see whether Lead B accepted the change.
6. **DW5 rewritten per the amendment: agree.** Invitations at the cap are SENT and the day's count stays at 49. Receipts are still held at the 51st (`check_pf19r_senders.ts:243-264`).

## Issues
**Major (must fix before Approve)**
* **M1: over the hourly limit, an invitation or a Resend answers 2xx `emailed:false` instead of 429.** On Resend, the old link is already revoked, so the person is left with no working link.
  * Cause: `MessageLimited` is swallowed by `catch { return { emailed: false }; }` (`api/src/platform/identity/service.ts:403`). `resend` revokes and commits before it emails (`:485-499`).
  * The toast says "Use Resend under Invited", and each further Resend in that hour revokes again and sends nothing.
  * This breaks brief item 3 ("above it, 429 with a plain sentence"). The breaker's B1 found the same, and I confirmed it in the code at this commit.
  * Fix: write the invitation in the caller's transaction (as the reset does with `mailIn`). Over the limit, answer 429 with a sentence and roll back. Add a DW3 case for an invitation and for a Resend.
* **M2: an invitation to a suppressed address still answers 201 `emailed:false`; brief item 4 asks for 409 and an audit line.**
  * The only audit line is `platform.invitation.created` with the summary "an invitation was sent". I checked it on the copy (J3), and it is untrue for an invitation that was never emailed.
  * Fix: do item 4 on the invitation path (409 in the brief's words, plus an audit line). Otherwise record Lead B's ruling that PF-19r DW2 stands, and still write a not-emailed audit line. Add the DW4 case for it.
* **M3: the amendment asks for one test per sender showing its stored file holds no link, token or code. Three of the four senders have no such test.**
  * Checked: the invitation (DW1). Also checked, though not senders the amendment names: a receipt and the platform account code (DW2).
  * Not checked: the provider's code email (DW3 sends `118833` but never reads its file), the two-step reset notice, and the complaint reminder's last resort to the firm contact address. Its TRANSACTIONAL class is set only when there is no staff id (`complaints/complaints.ts:504-506`), so that is exactly the sender a class change could quietly unseal.
  * Fix: add those three file assertions to `check_pf19e_sealed_bodies.ts`.

**Minor (should fix)**
* **m1:** `Messages` and `PlatformInbox` fall back to the local constant key in any environment when no box is passed (`send/messages.ts:100`, `messages/demo-inbox.ts:25`). Only one app construction exists today, and it passes the box. Fix: make the default `bodyBoxOf(platformConfig())`, or refuse outside local.
* **m2:** the limit is per firm and address, while the brief says "a platform per-address limit" (`send/messages.ts:126-130`). Five emails per firm means 5 × N an hour across N firms. Fix: count across firms, or record Lead B's ruling.
* **m3:** codes, resets, invitations and the account-takeover notice share one bucket. Five forgot-password events (no sign-in needed) block an Owner's reset and silence the takeover notice for an hour. Also, the limit is checked before the consent gate, so a suppressed address that is over the limit gets "try again in an hour" instead of "update the address" (J4, run 2). Fix: exempt the takeover notice, or record the choice.
* **m4:** message bodies are not a `SealedValueStore`, so `versionCounts` and RUNBOOK-secrets step 4 do not see QUEUED or held bodies. After a key is retired they fail as "content changed" (`send/messages.ts:87-89`). Fix: add a runbook line (no queued TRANSACTIONAL rows before retiring), or use a clearer reason.
* **m5:** the reset 409 keeps PF-19r's words instead of the brief's sentence (`session/service.ts:224`). This is acceptable as Lead B's newer ruling, but it should be recorded on the PR.
* **m6:** the hourly count leaves out `"channel" = 'EMAIL'`, so the `(firm_id, channel, address)` index serves only its first column (`send/messages.ts:128`).
* **m7:**
  * The `MessageLimited` class sits between `MessageRepeated`'s doc comment and its class (`ports/messages.ts:103-109`).
  * There is a stale "(unsealed: question to the tech lead…)" note at `identity/service.ts:394` (STANDARDS §7: comments say why, never status).

## D1-D20 (1-5)
| D | Score | Evidence |
|---|---|---|
| D1 | 3 | Items 1 and 2 are met. Items 3 and 4 are met only on the reset path (M1, M2). |
| D2 | 3 | The hash is of the sealed bytes and parts are bound to their owner, but Resend over the limit leaves no working link (M1). |
| D3 | 4 | One sealing module, reusing SecretBoxPort and its shared contract (run on `bodyBoxOf`). |
| D4, D7, D8, D12, D14 | N/A | No screen, no AI. Team, invite panel and activity log pages unchanged. |
| D5 | 4 | Two resets at once answer 200 and 200, and nothing returned 500 on any path. A body that does not open fails closed. |
| D6 | 3 | The refused reset has its line, visible in the Activity log. The invitation's line says "sent" when it was not (M2). |
| D9 | 3 | Over the limit, an invitation loops on Resend (M1). |
| D10 | 4 | The 409 and 429 sentences are plain and do not quote the address. |
| D11 | 3 | The invitation toast gives no reason when the limit holds it. |
| D13 | 4 | axe: 0 violations (team, invite panel, activity log). No sideways scroll at 400, 1024 and 1440 px. Keyboard sign-in and opening the panel work. I did not check 200% zoom. |
| D15 | 4 | Sign-in 0.6-0.8 s, invitation 134-250 ms. Index note in m6. |
| D16 | 4 | Five mutations each caught. Per-sender file tests are missing (M3). |
| D17, D20 | simulated only | No intended user walked it. |
| D18 | 3 | Audit summaries are accurate for the reset, but not for a suppressed invitation. |
| D19 | 4 | Invite, then a sealed file, then the worker sends it, then the demo inbox shows the link, then the invitee page "Join your firm on Expat Ready" opens. |

**BIC-01 to BIC-20 (EXPERIENCE §6):** all N/A. This is a platform runtime row, not a case-side screen.

**[M] lines that apply:**
* No secrets in code: met. The local key is documented as no secret and is used on local only (see m1).
* Personal data never logged: met. The DW5 scan is clean, and the copy's api.log has 0 `invitation#t=` lines.
* Server authorisation: met (J7: 403 `MISSING_PERMISSION`).
* RFC 9457 errors: met (409 and 429 with codes).
* Idempotent creates: met. The prefixed key keeps `(firm_id, idempotency_key)` unique, and a repeat answers the first row.
* A rule's test fails when the rule is removed: met (mutations above).
* Read paths indexed: partly (m6).
* OWASP rate limits: partly (m2, m3).
* Module card: met (`MODULE.rows/PF-19e.md`).
* Comments say why: partly (m7).
* Migrations: none.

## What I could not check
* PR #3406's body and comments: the GitHub API refused the repository path from here, so I could not see whether the deviations in items 4 and 5 are recorded there.
* A headed (visible) browser, 200% zoom, a real screen reader, real KMS or SES, and D17/D20.

Verdict: Changes 570c344b483ace08ee761d08c704a53d2c367de3

## Round 2: `633b89afb2f5bfb9979d5f2e1742431070e0d638` (diff since 570c344b4 only, P-277)

**Verdict: Ship.** All three Majors are fixed. No Blocker or Major is open. Reviewer: Opus 5.5, 24 Nov 2026.

### What I ran at 633b89afb
* **Suites, all PASS:** pf19e 27/27, pf19r_senders 28/28, pf19b_sending 42, pf19b_mail 29, pf19p 68, pf4b 57, pf6m2 19, pf21c 48, pf13 30, pf24 84, pf4c_batch_invite 24, pf4c1b_batch 19, pf4dn 15.
* **Mutations:** each was put back with `git checkout`, and the tree is clean afterwards.
  * The invitation's 409 off: the new DW4 invitation case fails.
  * The invitation's 429 off: the new DW3 Resend case fails.
  * The new suppressed-before-limit order put back to limit-first: still 27/27, so no test covers it (n1).
* **Copy:** an isolated copy on :4431 at 1024 px, headless Chromium (round2.mjs in the session scratchpad). The copy is stopped and its database dropped.

### Round 1 fixes
* **M1: fixed.**
  * The single invite and Resend now write the email inside their own transaction, through `invitationIn` and `mailIn` (`identity/service.ts:408-421`). `mailReady` runs before the firm's row lock, and the dispatch happens after the commit.
  * In the person panel, Resend went ok four times. The fifth Resend (the sixth email) showed "We send at most 5 account emails an hour to one address, so this invitation was not sent. Try again in an hour." in the panel's "Not done" notice.
  * Afterwards exactly one invitation is open, and its token hash matches a link in the demo inbox. So the last emailed link is kept.
* **M2: fixed.**
  * The invite panel's row shows "We couldn't send email to r2gone…@example.com. Ask your firm's Owner or Admin to check it." axe found 0 violations on that state.
  * No invitation and no outbox row are kept. One `platform.invitation.not_sent` line is written in its own transaction.
  * PF-19r DW2 was updated to the 409.
* **M3: fixed.** New stored-file checks:
  * the reset notice and the code email (`check_pf19e_sealed_bodies.ts:207-210`);
  * the complaint reminder's last resort (`check_pf19r_senders.ts:230-232`).
  * Each asserts a sealed file with none of the message's words.
* **m3 order: fixed** (`send/messages.ts:144`): a suppressed address gets its refusal, never the limit.
* **m6: fixed:** the count now filters on channel.
* **m7: fixed:** the class order in `ports/messages.ts`, and the stale comment.
* **Breaker m4:** a log line of ids and the refusal code when a body does not open. It holds no body.
* **Left as questions for the tech lead on the PR:** m2 (per-firm scope), m3 (shared bucket), m4 (bodies are no SealedValueStore) and m5 (reset words). I could not read the PR from here (GitHub API path refused), so I take the builder's word that they are posted. They do not block.

### Open (Minor, should)
* **n1:** the suppressed-before-limit order (`send/messages.ts:144`) has no test. Moving the limit check back in front of the gate keeps the suite green (STANDARDS §7: a rule's test fails when the rule is removed). Fix: one DW4 case for an address that is both suppressed and at its limit, expecting 409.
* **n2:** the batch route `POST /api/platform/staff/invitations/batch` still emails after its commit, through the catch-all (`identity/service.ts:396-403, 485`).
  * A suppressed row, or one over the limit, answers `emailed:false`. Its audit line says "an invitation was sent", and a later Resend revokes it.
  * No web page calls this route: the invite panel posts each row singly. So I treat this as a Minor.
  * Fix: give batch rows the same `invitationIn` per row, or record the batch as out of scope on the PR.
* **m1 (round 1): still open and not on the coordinator's list.** `Messages` and `PlatformInbox` still fall back to the local constant key in every environment when no box is passed (`send/messages.ts:105`, `messages/demo-inbox.ts:25`).

Verdict: Approve 633b89afb2f5bfb9979d5f2e1742431070e0d638
