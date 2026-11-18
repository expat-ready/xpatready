# PF-19r part 1: question for the tech lead (two rulings disagree)

Builder, cloud runtime lane, 18 Nov (IST). Branch `claude/runtime-pf19r-senders`. The reviewer's M1 asks for this question. The same question goes in the PR as "Question for the tech lead".

## The conflict
* **Earlier ruling: Lead B, rev 16.64.** This was a PR comment on PF-19b part 2, recorded in `product/screens/PF-19b2/review.md:152`. It moved two things to a row called PF-19e: the switch of staff and system mail (`MAIL_PORT`) onto MessagePort, and *sealed* TRANSACTIONAL bodies. The PF-19b2 review lists PF-19e's parts as sealed bodies, an exemption from the daily cap, and a 409 with an audit line. **PF-19e has no BACKLOG row on `main`** (`git grep PF-19e origin/main -- product/BACKLOG*.md`: none), but its brief exists at `product/design/lead-b-briefs/PF-19e.md` on branch `lead-b-front-office` (reviewer, round 2).
* **Newer brief: Build Lead C, 18 Nov,** approved, requested by Lead 81 on the founder's "Yes, go". Part 1 orders `MAIL_PORT` → `MESSAGES_MAIL` now. Part 2 says "the rendered message under msg/<firm>/outbox/ holds the link and the code". It does not mention sealing.

## What part 1 does today
* It binds `MAIL_PORT` to `MESSAGES_MAIL`, as the brief says.
* **Unsealed at rest:** an invitation's plain token, and a sign-in code once the provider's function is wired, sit in `msg/<firm>/outbox/<id>.json` until the file is removed. The database keeps only the token's hash, as before. No log, audit line or refusal text holds them (breaker: 7 secrets searched, 0 found).
* **The daily cap applies to staff mail.** A held invitation is now reported: `emailHeld: "daily limit"`, and the batch answer lists `heldRows`. A two-step reset whose notice would be held is refused with `409 NOTICE_HELD_DAILY_LIMIT`, so nothing is reset.

## Choices
1. **Keep part 1 as built and add the missing PF-19e row** for sealed transactional bodies and the cap exemption. *Recommended:* it keeps the brief and its demo value (one layout, the gate on every path), and the unsealed window is the same as the case side's `demo_message` today. Cost: tokens stay unsealed at rest until PF-19e lands (Sample data only in the reference app; Unconfirmed: no counsel).
2. **Seal in this row.** This means encrypting the rendered TRANSACTIONAL file with SecretBox, and the worker and the demo inbox opening it. It touches `send/messages.ts` and `demo-inbox.ts`, is about +250 lines, and is PF-19b's code.
3. **Hold the binding as main does today** and ship only the complaint reminder and the `sendIn` door. That drops DW1-DW3 of the brief.

Also asked: should TRANSACTIONAL staff mail (invitations, security notices, codes) be **exempt from the daily cap**? Today the cap holds an invitation, and refuses a reset rather than delay its notice. My recommendation: exempt them in PF-19e, together with the sealing.
