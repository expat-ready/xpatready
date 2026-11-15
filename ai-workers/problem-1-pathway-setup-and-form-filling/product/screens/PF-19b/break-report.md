# PF-19b part 1: break report (one sending path)

Breaker, 15 Nov. Commit `8064504e4` on `claude/great-keller-dkedpc` (PR #1824). Scope: brief PF-19b part 1 only (`git show 9446bd33a:…/design/lead-b-briefs/PF-19b.md`).
How: a scratch script in the session scratchpad (built like `tests/check_pf19b_sending.ts`: every migration, Sample firms, `fakeJobs` + `FakeClock`, `LocalFiles`, real `ConsentStore`) on its own database `xr_studio_brk_pf19b_<pid>`, which was dropped afterwards. HTTP checks ran on an isolated copy `br_pf19b` on :4492, first as the demo workspace and then restarted with `STUDIO_WORKSPACE_KEY=firm`; the copy was stopped and its database and files removed. Never :4400. Live AI off, US$0, no keys, nothing sent out. The PR's own suite still passes 30/30. No code changed.

**Result: 0 Blocker, 2 Major, 9 Minor.** Every rule the brief names (DW0-DW8) held in its direct form. The Majors are a cross-firm gap in recovering from a crash, and a gap in the consent gate.

## Breaks

**M1 (Major): one firm's held backlog stops every other firm's crash recovery (DW4 under load).** `api/src/platform/messages/send/messages.ts:129`
* Steps: firm B is on trial and already at its cap (50 sent today). Commit 505 sends for B and age them 30 minutes. Then commit one firm A message, age it 5 minutes and never dispatch it (a crash between commit and dispatch). Advance the clock 5 sweeps, then a further hour.
* Actual: the firm A row stays `QUEUED` after every sweep and after the hour. As a control, mark B's backlog `FAILED`: the next sweep sends A's row (`SENT`). The sweep takes the 500 oldest `QUEUED` rows from all firms (`take: 500`, ordered by `createdAt`). B's held rows never leave `QUEUED`, so they fill every batch. At 50 a day, B's backlog takes about 10 days to drain, and other firms' orphaned messages wait that long.
* Should: a crash after commit sends once, soon, whatever another firm has queued. Options: leave held rows out of the crash sweep (for example `stateReason IS NULL`) and retry them on their own pass, or take a fair share per firm.
* Fail-test: the steps above, expecting firm A's row `SENT` within 2 sweeps.

**M2 (Major): marketing goes to an address that never consented, under another person's consent.** `messages.ts:69`; gate `consent/consent-store.ts:134`
* Steps: person P1 gives a MARKETING email consent in firm A. Then call `send({ firmId: A, class: "MARKETING", person: P1, address: "stranger@example.com" })`.
* Actual: `QUEUED`, and it sends. The gate checks only the subject's consent. Nothing ties the address to that person (a consent row holds no address).
* Should: marketing without consent for the receiving address is `SUPPRESSED`, so the address must belong to the consenting person. If this is meant to be the caller's duty, Lead B should rule on it and say so in the `MessagePort` doc (`ports/messages.ts:26`). As built, one wrong person id sends marketing to anyone.
* Fail-test: the steps above, expecting `SUPPRESSED` (or `MessageRefused`).

**m1 (Minor): a client persona opens the demo inbox by its persona name.** `api/src/platform/messages/demo-inbox.ts:21`
* Steps (HTTP, :4492): `GET /api/demo/platform-inbox?address=client.a@example.com` with `x-actor: client` or `client-b`.
* Actual: 200, with both firms' messages to that address. `user-P` and `user-Q` get 403. `actorOf` (`api/src/core.ts:59`) accepts the persona name as that same person, but the guard compares `a.id` only. `person-link.ts:424` has the same gap, but that file is outside this row.
* Should: 403 for any header that names a client.
* Fail-test: `inbox.list(x, "client")` returns 403.

**m2 (Minor): the job key can be used up before the real dispatch, so the message waits for the sweep.** `messages.ts:84`
* Steps: (a) call `dispatch(firmA, [B's outbox id])`, then B's own `dispatch(B, [id])`. (b) Call `dispatch` inside the caller's transaction before commit, run the job, then commit.
* Actual: in both cases the row stays `QUEUED`, and re-enqueueing `msg.send:<id>` answers `{queued:false}`. The worker skipped the row (another firm's, or not yet committed), and the job key `msg.send:<id>` is used once only. The message then waits at least 2 minutes for the sweep, or days with M1.
* Should: a dispatch that finds nothing to send does not use up the key (refuse a row of another firm, or key the job by firm and id).
* Fail-test: (a) and (b) above, each expecting `SENT` after its own correct dispatch.

**m3 (Minor): the subject is not limited to one line or 200 characters.** `ports/messages.ts:21`, `messages.ts:64`
* Actual: template `Hi {{ name }}` filled with a 5,000-character value containing `\r\nBcc: …` is stored with a 5,031-character subject that contains CRLF. A direct subject with `\r\nBcc:` is also accepted (`QUEUED`).
* Should: one line, at most 200 characters, after filling, before part 2's SES adapter puts it in a mail header.
* Fail-test: both inputs give `MessageRefused`.

**m4 (Minor): the caller's HTML is stored and served unchanged.** `ports/messages.ts:77`, `demo-inbox.ts:33`
* Actual: `content.html = "<img src=x onerror=alert(1)>"` comes back unchanged in the inbox's `html` field over HTTP. No screen renders it yet.
* Should: sanitise it, or drop raw `html` from `MessageSend` (the brief's input is "subject + body", with one fixed layout).
* Fail-test: the stored `html` contains no `onerror`.

**m5 (Minor): another person's rendered message can be attached.** `messages.ts:68`
* Actual: `attachments: ["msg/<A>/outbox/<other outbox id>.json"]` is accepted (`QUEUED`). That file is a different client's message.
* Should: attachments may not be keys under `msg/<firm>/outbox/`.
* Fail-test: that send is refused.

**m6 (Minor): concurrent same-key sends with a stricter isolation level throw instead of answering `repeated`.** `messages.ts:51-53`
* Actual: 4 concurrent sends at `RepeatableRead` give 1 row and 3 `P2002` errors. The snapshot is taken before the advisory lock, so the later sends never see the first row. No double send.
* Should: answer `repeated: true`, or catch `P2002` and re-read.
* Fail-test: `Promise.all` of 4 sends at `RepeatableRead` gives 4 results with the same `outboxId`.

**m7 (Minor): an unknown firm gives a raw database error, not the refusal the code intends.** `messages.ts:49` runs before the check at `:55`
* Actual: a uuid that is not a platform firm gives a Prisma `23503` error on `msg_firm`, not `MessageRefused("… is not a platform firm")`.
* Fail-test: expect `MessageRefused`.

**m8 (Minor): not every state gets a `MsgEvent` line.** `messages.ts:97-99`
* Actual: `SUPPRESSED` (at send, or later by the worker) and a held send write no event. Only `SENT` and `FAILED` do. The `MsgEventKind` enum has no `SUPPRESSED` or `QUEUED`, so adding them means a schema change. The PR should name this gap and not leave it silent.

**m9 (Minor, part 1's worker design, which part 2 inherits): the provider is called inside the database transaction.** `messages.ts:115`
* Actual: `adapter.deliver` runs while the firm's `msg_send_counter` row lock is held, before commit. The `local` adapter is harmless. With SES, a commit that fails after SES accepted the mail leaves the row `QUEUED`, so the sweep sends it again (twice). Every send for the firm also waits behind the provider's response time.
* Fail-test (for part 2): an adapter that succeeds, then a forced commit failure; expect at most one provider call per outbox id.

## What held
* **One idempotency key:** 10 concurrent sends, half with the firm id in upper case, give 1 row: 1 `repeated:false` and 9 `repeated:true`.
* **Two workers on one row:** 6 concurrent `deliver` calls give `sent` once and `skipped` 5 times, with 1 `SENT` event.
* **Cap at 49:** 8 concurrent workers give 1 `sent` and 7 `held` (`QUEUED`, "daily limit"). The counter ends at 50, with 1 `send_cap_reached` alert.
* **Suppression spellings:**
  * These were all `SUPPRESSED`: upper case, surrounding spaces, `<…>`, a trailing dot, U+200B, U+2063, U+034F, a fullwidth `＠` and letters, the Kelvin sign, a trailing NBSP, an upper-case domain.
  * These were refused, so nothing was sent: U+180E, `..`, `<…>.`, a quoted local part, `mailto:`.
* **DW3:** a rolled-back send leaves no row, and neither dispatch nor the sweep sends it.
* **DW6:** a deleted file, and a file rewritten together with its `.meta`, each give `FAILED` "content changed".
* **Templates:**
  * Firm B's firm-only template is refused for A.
  * B's template with the same key is ignored for A.
  * A's own template wins over a newer platform version.
  * The platform template is used when the firm has none.
  * The database refuses a firm version on a platform template.
* **Attachments:**
  * B's file key in A: refused.
  * `../<B>/…` and `%2e%2e/…`: rejected by `FileKey`.
  * B's outbox key in A: refused.
* **Firm id in upper case:** send, dispatch and deliver all work. `deliver(A, B's id)` gives `skipped`, and B's row is untouched.
* **Sweep:** it queued only `QUEUED` rows (9). `SENT` events went from 1 to 10, and no row has two `SENT` events. `SENT`, `FAILED` and `SUPPRESSED` rows were never resent.
* **MARKETING or SERVICE with no person:** refused by `MessageSend`.
* **HTTP, demo workspace:**
  * `user-P` and `user-Q`: 403.
  * Odd addresses (empty, missing, `address` given twice, 400+ characters, `<x>.`): 400.
  * POST: 404.
  * Newest first; each firm's own sender name and Reply-To; `<CLIENT.A@example.com>` finds `client.a@example.com`.
  * `demo_message` stayed at 0.
* **HTTP, non-demo workspace:** 404 for every persona and for a bad address.
* **Wiring:** the sweep is on the live runner (`platform_jobs.schedule`: `msg.outbox_sweep`, every minute).
