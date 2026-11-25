# J-48 review: join and walk for R1.48 (sending, delivery state, bounces, the firm's sender name)

Reviewer (independent, not the builder) · 19 Nov · branch `claude/sweet-goldberg-5mz60o`, head 0ec7e5dd04c0ccac53953e66920a464139829213.
Diff reviewed: S/tests/journeys/j_48.ts (new), S/api/src/platform/MODULE.rows/J-48.md (new), 3 screenshots (e6c43f480 + 0ec7e5dd0). The stacked PF-19b3 / #2177 / #2196 code was read only to judge the test.
Written here, not in screens/J-48/review.md: the caller said one scratch file and no tracked edits.

## Read
Brief J-48 (origin/claude/build-lead-c-647b40) and J-49 (for the hand-off); j_6.ts (NR pattern); tests/runtime/api.ts (until, recorder); local.ts, bounces.ts, unsubscribe.ts, demo-inbox.ts, person-link.ts (mail, sendRefusal, resendKind), send/messages.ts, booking/service.ts:591-635; walks.yml, walk.mjs; module-cards.py check_fragment.

## Ran (copy j48r on :4438, PLATFORM_IDENTITY=local; stopped afterwards: "stopped j48r", exit 0)
- isolated.sh start: exit 0. Run 1: 37/37, **exit 0**. Run 2, same kept copy: 37/37, **exit 0**.
- `node tools/count-any.mjs --against adab8bd65`: 417 = 417, exit 0. `module-cards.py tree`: PASS, exit 0 (fragment: one `Tests:` line, path exists).
- Copy checks: the DW3 door's 400s took 223-387 ms (the copy tries to fetch the certificate). The host's W1 booking mail is SERVICE and carries List-Unsubscribe plus -Post. Firm B is back to ACTIVE.
- The three re-rendered screenshots were restored with `git checkout`; the tree is clean. Not run: the recorded CI path (no ffmpeg here), HEADED=1 (no display), the brief's "pass unchanged" suites (this diff changes no app code).

## Findings
No Blocker. No Major.

**Minor 1. The W1 host judge passes with nothing to check on a kept copy** (j_48.ts:128, 131; DW4 reuses it at :204).
- `hMailBefore` is read after the booking, not before it, and counts every row ever sent to the host. `inbox(O.email)` returns at once when an earlier run's mail is there, and `hMail[0]` can be that earlier mail.
- Failure case: on the second run, a regression that stops this booking's host mail would still PASS (W1 host, and DW4 through `aAll`). A fresh copy, as CI uses, still catches it.
- Fix: count the host rows before the click and wait for count + 1. Or match this run's mail by the visitor's `Sample ${run}` name or the booking time.

**Minor 2. W3 and W4 send as the client, not as staff, and this departure is not declared** (j_48.ts:161, `x-actor: user-P`, which is Client A).
- The brief says "case staff Send to ..." and "staff send again ... the person sending sees why".
- Both go through the same `mail()` gate (person-link.ts:95-99), so R1.48 is still proven.
- Fix: send as "user-O", or say so in the header and the PR.

**Minor 3. The J-49 ending rests on a wrong rule** (j_48.ts:198-199).
- The comment says "CASL: only marketing does" and the label says "J-49 starts from a marketing email's". The code puts List-Unsubscribe on SERVICE and MARKETING mail (unsubscribe.ts:2, 57-60), and W1's host mail (SERVICE, service.ts:591) carries it. I saw this on the copy.
- The J-49 brief's W1 starts from "the visitor's booking confirmation (SERVICE)". The code sends that confirmation as TRANSACTIONAL (service.ts:601), and this test asserts TRANSACTIONAL.
- Fix: correct the words. Also assert that W1's SERVICE host mail carries List-Unsubscribe and List-Unsubscribe-Post (that is J-49's real first step). Put "Question for the tech lead" on the PR about the class conflict with J-49's brief, rather than settling it silently.

**Minor 4. `.catch(() => undefined)` follows a wait** (j_48.ts:184 waitFor, :186 scrollIntoViewIfNeeded).
- No false pass: :188 requires `words.length >= 1`. But a failure loses its cause, and the house rule says no.
- Fix: let the wait throw, or record `ok(..., false, timeout)`.

**Minor 5. The DW3 "door answers 400" line cannot tell a forged notice from a correctly signed one** (j_48.ts:269-272).
- The copy fetches `sns.ca-central-1.amazonaws.com/...-rec.pem` before it checks the signature. That fetch fails, which gives "certificate not fetched" (bounces.ts:73). A correctly signed notice gets the same 400. It also sends one outbound GET to Amazon.
- Fix: name it "the running copy refuses a notice it cannot verify (400)". The in-process `refusedHere` part is the real proof.

**Minor 6. The NR lines and DW4 prove less than their names say.**
- DW3 NR (:266) says "the next email goes out" but never asserts `next.state === "SENT"`. DW5 NR (:289) is `!held`, so it also passes if firm A's 50th or 51st send fails outright. Fix: assert what the stand-in should do (soft bounce: SENT; active firm: r51 SENT; local setting: provider `local:`).
- DW4 (:205-207) checks Reply-To only for the visitor's and partner's mail. It does not check the invitation, the host mail or firm B's mail, yet the label says "firm B's has firm B's". On the copy all of them were correct. Fix: use `fromFirm` for all five.

**Minor 7. Clean-up gaps** (j_48.ts:152, 291, 110).
- `process.exit(2)` inside the outer try skips the finally: lent seats are not given back, invitations are not revoked, the browser stays open. Throw instead.
- Firm B is restored to the hard-coded 'ACTIVE'. Read its status first and put that back.
- A run killed mid-way leaves seats at +10, and the next run takes that as its baseline.
- Otherwise every path restores: a throw inside DW5 hits its inner finally, and the outer finally gives seats back and revokes invitations.
- bounce@example.com stays suppressed for firm A. No other suite depends on that: check_pf19b3_delivery uses its own database, and the panel suite uses SAMPLE_BOUNCE_ADDRESSES[1].

## Rulings on the declared departures
- a. W3 and W4 by API: acceptable. The case screen belongs to C6.16, and the 409 words are what the sender reads. But see Minor 2: the actor is the client.
- b. DW3 in process with the run's own certificate: acceptable as declared. The brief allows it with "Not verified on the running copy". Reword the door line (Minor 5).
- c. W4's bounce comes from the local adapter's test event: acceptable. It is the PF-19b3 "provider's test event" path through the same `SesNotices.apply`, and DW3 covers SNS.
- d. W2's invitation state read from the database only: acceptable. There is no staff read for a STAFF subject. Raise the question on the PR as the comment says.
- e. The ending: the brief's wording should not stand for the visitor's mail (it is transactional and rightly has no link). But the replacement and its reason are wrong, and they conflict with J-49's brief (Minor 3).
- f. The stand-ins (fakeMail()/LocalMail, the local setting, a firm not on trial): acceptable, and each fails for the stand-in's reason. Tighten them (Minor 6).
- g. No breaker run. Already covered: a forged notice (wrong key), a replayed notice (twice gives one event), another firm's notice (nothing stored), a soft bounce (no suppression). Not covered: a From name with line breaks, and two sends at once past the cap. Neither is a Major here: both test PF-19b and PF-19r code, not this join, and the test adds no code. But BACKLOG names "reviewer and breaker" for this row. The row owner must record the P-303 waiver on the PR, or give those two tries to qa or PF-19b.

## House rules
- No personal names. Sample data only. US$0. The test writes no audit line itself; the app writes them under typed actors (user-O, user-P, staff tokens).
- `any` count unchanged (one commented line, :60). Exits with `summary() ? 1 : 0`. The fragment is valid.

## Journey score (reviewer; scripted plus code reading, not walked headed)

| Criterion | Score | Evidence |
|---|---|---|
| Task done | 1 | 37/37 twice |
| Next step obvious | ½ | J-49 hand-off not reached (Minor 3) |
| Plain words | 1 | "Not sent: this address does not take email from the firm" |
| Feedback and state | 1 | Delivered pill with times (W5 shot) |
| Correct data | 1 | outbox, events, suppression read underneath |
| Error recovery | ½ | refusal seen only as API words |
| Accessibility and sizes | 1 | axe clean on 4 states; 1024/1440 px |
| Speed | ½ | no timings measured |
| Visual quality | 1 | screenshots are clean |
| Trust and sources | 1 | firm's From name, address masked |

**8.5/10, pass.** Not tested: a screen reader, a real user walking it alone.

Reviewer: Approve 0ec7e5dd04c0ccac53953e66920a464139829213
