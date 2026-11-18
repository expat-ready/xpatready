# PF-19e: PR draft (overlapped on PF-19p #1961; the PR opens only after #1961 merges)

**State (18 Nov, about 00:2x IST on 19 Nov):** built on `claude/modest-faraday-0k9dsj` from `claude/funny-edison-0xod9n` at 2aa433a4e. The reviewer gave Approve at c0e2ffcf2 after one diff-only round. The breaker ran once. Waiting for #1961 to merge.

**Next steps:**
1. `git fetch origin main && git merge --no-edit origin/main` (P-270).
2. Re-run the suites below.
3. Get a diff-only re-review of the merge.
4. Open the PR non-draft with `Reviewer: Approve <head>`.
5. The tech lead's P-423 read is needed (secrets and the shared send path). No schema change, no migration.

Title: `runtime: PF-19e — sealed transactional bodies; staff and system mail on the one send path (AG-1-70)`

First line: changes a shared contract. `MessagesMail` gains `system: true` and `sendInTransaction`. `Messages` gains `sendSystem`. The app's `MAIL_PORT` is now `SYSTEM_MAIL`.

## What and why
* **Sealed at rest.** Every TRANSACTIONAL body (invitation links, reset notices, codes) is stored sealed by SecretBoxPort, purpose `message-body`, for its firm. Platform account messages are sealed in the platform's own space. The row's hash is the hash of the sealed bytes. Only the send worker and the demo inbox open a body. Marketing and service bodies are unchanged.
* **One send path.** Staff and system mail goes through the one send path: the app's `MAIL_PORT` is `MessagesMail` with `system: true`.
* **Cap exemption.** These emails are exempt from the firm's daily cap and are not counted in it. Instead, at most 5 an hour go to one address (Sample), and above that the answer is 429 with a plain sentence.
* **Suppressed addresses.** An invitation, resend or two-step reset to a suppressed address answers 409 "We couldn't send email to <address>. Ask your firm's Owner or Admin to check it." It writes an audit line with no address in it, and never answers 500.

## Done when (tests/check_pf19e_sealed_bodies.ts, 34 checks)
DW1 to DW5 each have a pass and a fail.

DW2's "fails when sealing is removed" was shown once. With sealing removed, 5 checks failed (23 passed, 5 failed); sealing was then put back.

Break and review fixes, each with a check that fails on the earlier head:
* 25 parallel resets give only 200 and 429 (16 × 500 before).
* A refused resend keeps the last link working.
* A suppressed address makes no invitation.
* A suppressed address over the limit still gets 409.

## Checks at c0e2ffcf2 (all exit 0)
| Suite | Passed |
|---|---|
| PF-19e | 34 |
| PF-4b (isolated copy) | 57 |
| PF-4 (isolated copy) | 119 |
| PF-4c | 24 |
| PF-6m | 12 |
| PF-6m2 | 19 |
| PF-6r | 17 |
| PF-5t | 42 |
| PF-5v | 7 |
| PF-12 | 100 |
| PF-19a | 94 |
| PF-19b | 42 |
| PF-19b2 | 44 |
| PF-19b mail (with the shared mail contract) | 29 |
| PF-19p | 68 |
| PF-24 | 84 |

The shared mail contract also runs on `MessagesMail` with `system: true`, inside PF-19e.

`graph.mjs --check` exit 0. `count-any` 417 → 417.

Walk at 1440 px on an isolated copy:
* Team › Invite people → "invitation sent".
* The demo inbox shows the link.
* The stored file is sealed and holds no link.
* An invite to a suppressed address shows the sentence on its row (`screens/pf-6-staff/screenshots/pf19e-1440-invite-*.png`).
* api.log holds no `#t=`.

## Touch-list deviations (said here, P-605)
* New files: `send/body-seal.ts` and `send/system-mail.ts`.
* `features/platform-messages.ts`: one `SYSTEM_MAIL` provider.
* `identity/session/service.ts`: the two-step reset lives there, not in `identity/service.ts`.
* `send/mail.ts`: `sendInTransaction`, so the reset's notice is written in the reset's own transaction. This fixed the M1 500s that both the reviewer and the breaker found.
* Two older tests updated:
  * PF-19b2 DW13 pinned "MAIL_PORT stays LocalMail until Lead B rules"; this row is that ruling.
  * PF-19b DW6 now opens the sealed body.
* A local server with no key ring uses a local-only generated key in `studio/var/local-message-body.key` (git-ignored). Test and production need the configured ring.

Duplicate check: searched BACKLOG*.md, qa/BUGS.md, open PR titles (PF-19*, send/messages.ts, MAIL_PORT) and main's code (`message-body`, `sendSystem`); none.

Card: MODULE.md updated. Cost: US$0, live AI off.

## Minors left (listed, P-293)
* **m3 / break m3:** the 5-an-hour limit is per firm and address, not across firms. Under PF-12's walls a platform-wide count needs a new bypass use. This is the first question below.
* **Break M2:** in the demo workspace, `GET /api/demo/platform-inbox` shows invitation links to anyone without signing in. The brief asks the demo inbox to show the link. Before this row, invitation emails existed only in memory. This is the second question below.
* **Break m5:** the worker still accepts a plain body file on a TRANSACTIONAL row if someone with both file and database write access replaces the file and its hash. Bodies stored before PF-19e are plain, so refusing plain files would fail them.
* **Review n1:** a once-per-firm lock wait. When a firm's very first message row is created by another request while a reset holds the firm lock, PostgreSQL aborts one after about 1 s (a 500 on that reset, or emailed: false). Not reproduced. The fix would be to create msg_firm when the firm is created (another row's file).
* Outbox bodies are not in the re-encrypt job. MODULE.md says to drain the outbox before retiring a key.

## Questions for the tech lead
1. Should the hourly limit be platform-wide per address (a new `BYPASS_USES` entry), or is per firm enough? Recommendation: per firm for Release 1; platform-wide with PF-12's next bypass review.
2. Should the demo platform inbox ask for a signed-in staff member, or for the demo workspace's own persona, before it shows invitation links? Recommendation: yes, as a follow-up row on `demo-inbox.ts`, since anyone who can reach the demo can take a staff seat today.
3. Should msg_firm be created at firm creation (review n1)? Recommendation: yes, a one-line follow-up in `firms/` sign-up and the seed.
