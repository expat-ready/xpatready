# Briefs: the join-and-walk rows J-24 to J-48 (P-606 (2), (3); rows rev 16.11 (b), (e)) (cloud builder lanes; row owner Lead B)

**One file for the 15 J-rows, in rev 16.11's rank order.** A lane gets **the shared brief below plus its row's section**. Map rows 9 + 13 have no separate J-row: PF-23w is their join, and its brief carries the J-9 walk. Row 15's join is PF-24w (J-15 walk in its Done when), and row 1's is PF-8c's deploy smoke. **A J-row starts only when every part it waits on is on `main`** (the Lead checks `main`, not the BACKLOG status). It adds no feature, only the joins.

**What is real on `main` (checked 15 Nov 10:13 IST, `git grep 'fake[A-Z]…(' api/src`):** the only fakes in a running path are FO-3 booking's `jobs`, `mail` and `arrival` (`mail` is `fakeMail` in memory, **not** the demo inbox; `main` has no public booking page yet, only its API: #1800) (`api/src/front-office/booking/runtime-ports.ts`). PF-23w swaps `jobs`; `mail` waits on the sending adapter (PF-4b / PF-18n / PF-19b); `arrival` waits on FO-2. Every J-row builder **re-runs that grep in step 0** and lists each fake still in its capability's running path. Every fake listed in the row's section must be gone; any other fake found goes in the PR's Questions, and is never left silently.

---
## Shared brief (paste first, then the row's section)

You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime <J-row>` and take **one row**, end to end on a fresh branch from `origin/main`, one PR.

**The row:** `ai-workers/problem-1-pathway-setup-and-form-filling/product/BACKLOG.md`, row **<J-row>**, made exact by its section in `product/design/lead-b-briefs/J-rows.md` on branch `lead-b-front-office`. Read only these with it:
* the requirement text `python3 product/tools/trace-requirements.py --brief <J-row>` prints (P-604);
* rows rev 16.11 (a) (the DWn naming) and (b) (what a join row owns), in `product/design/lead-b-rows-2026-11-14.md`;
* the parts' merged PRs (only their bodies' "what is wired" and "open items" sections);
* the `journey-test` skill (a walk in a visible browser, replayed as a scripted Playwright check).

**What a join row owns (rev 16.11 (b)):**
* the wiring no part owns;
* every fake-to-real swap the running path needs;
* the screen named in the section (built by its own screen row, which this row waits on);
* the **walk**, `tests/journeys/j_<N>.ts`, from the capability's first step to the **next capability's first step** (gate A).

**Named test cases (P-606: list them in the PR body before writing code; the reviewer ticks one per line):**
* `J-<N> DW<k>`: one per swap. Each test **fails on the fake** and passes on the real adapter.
* `J-<N> W<k>`: one per walk step in the section, run both in a visible browser and as a scripted check, with a screenshot per step in `product/screens/J-<N>/`.

**Duplicate check (P-526):** BACKLOG, open PRs (including records PRs), `main`'s code and BUGS for the capability's map row; one `Duplicate check:` line.

**Breaker: yes** (every J-row: the joined path is new). Reviewer and breaker at high effort. The builder is at medium effort unless the section says high (P-605). qa scores the capability when this row merges (P-606 (2)).

**P-610 (founder, 15 Nov):** keep this PR under 800 changed lines, tests included. If a J-row would pass 800, split its swaps (DW) from its walk (W), swaps first. Re-review reads only the new commits since the last Approve (P-277).

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if a step needs a feature, a schema change or a route the parts did not build, stop and ask in a PR comment. That is a missing part, not this row's work. Never widen the row silently.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.

---
## The rows, in rank order

### J-24: each firm's own web address (map row 24), rank 3
* **Waits on:** PF-25w (after PF-4s) and FO-3w (the public booking page; `main` has only its API, PR #1800). DNS is PF-8b (founder's AWS), so it is **not** in this row: the walk runs on `<firm>.localhost` through the app's own host routing.
* **Swaps:** none on `main` today. List any PF-25w leaves.
* **Screen:** FO-3w's public booking page.
* **Walk:**
  * `W1`: open `http://<firm-key>.localhost:<port>/`;
  * `W2`: it resolves to that firm and shows its booking page, with the firm name and consultation types;
  * `W3`: another firm's key shows that firm, and an unknown key gives the "not found" page, never another firm's;
  * `W4`: ends at row 37's first step: a slot list on the booking page.

### J-109: complaints record (map row 109), rank 4
* **Waits on:** PF-21w (routes), PF-21s (screen; concept first).
* **Swaps:** complaints' `jobs` must be `PlatformJobs` (after PF-23w) and its clock the system clock. Its `mail` may stay `fakeMail` (in memory, not the demo inbox) until the sending adapter lands; name that in the PR.
* **Screen:** PF-21s's list and record page.
* **Walk:**
  * `W1`: a Case Manager logs a complaint;
  * `W2`: its 30-business-day due date shows, counting the firm's closed days (fake clock);
  * `W3`: a Read-only person cannot see it (P-601's keys);
  * `W4`: the Owner closes it with an outcome;
  * `W5`: it ends at the closed complaint in the list. No next capability follows, so the list is the end.

### J-38: time zones and calendar invite files (map rows 38, 40), rank 5
* **Waits on:** FO-3f (merged), FO-3h, PF-23w, FO-3w (the page), and PF-4b's sending adapter writing the demo inbox on the demo copy. The running app's booking mail is `fakeMail` in memory today, so a walk cannot read it (#1800).
* **Swaps:** booking's `mail` from `fakeMail` to the demo-inbox adapter (shared with J-37; whichever lands first does it).
* **Screen:** FO-3w plus the demo inbox.
* **Walk:**
  * `W1`: a booker in Asia/Dubai books 10:00 Toronto;
  * `W2`: the booker's mail reads 7:00 p.m. (Asia/Dubai);
  * `W3`: the host's mail reads 10:00 a.m. (America/Toronto);
  * `W4`: the `.ics` imports at the right instant (UTC);
  * `W5`: ends at row 42's first step: the reschedule link in the booker's mail.

### J-6: permissions, own versus all, money and licence apart (map row 6), rank 6. **Builder at high effort (permissions).**
* **Waits on:** PF-6b, PF-6 (screens), PF-4b.
* **Swaps:** none expected; list any.
* **Screen:** PF-6's staff and roles screens.
* **Walk (R1.6):**
  * `W1`: an Owner opens Roles, where money permissions and licence actions sit in their own groups;
  * `W2`: a Case Officer without `view.all` signs in and sees only their own items in every list;
  * `W3`: an unlicensed Case Manager trying a licence action gets "Only a licensed consultant can do this";
  * `W4`: assigning Billing/Finance shows its own line in the audit view;
  * `W5`: ends at row 5's first step: Invite staff.

### J-5: staff sign-in, two-step, lock-out (map row 5), rank 7. **Builder at high effort (security).**
* **Waits on:** PF-4b (needs the founder's AWS for its Cognito proof), PF-4s, PF-6.
* **Swaps:** the invite mail from the demo inbox to PF-4b's sending adapter (the test environment's, never a real address). Identity runs on `LocalIdentity` in the walk; Cognito is proven in PF-4b.
* **Screen:** PF-6 plus PF-4s's sign-in pages.
* **Walk:**
  * `W1`: the Owner invites a staff member;
  * `W2`: the invitee accepts from the mail;
  * `W3`: sets up two-step;
  * `W4`: signs in;
  * `W5`: the Owner removes them and their next request is refused (lock-out on leaving);
  * `W6`: ends at row 6's first step: the staff list.

### J-49: consent gate before every send (map row 49), rank 8
* **Waits on:** PF-19b.
* **Swaps:** `mail` in the sending path from the fake to PF-19b's adapter (test environment). The consent store is already real (`consent-store.ts`).
* **Screen:** none of its own; the walk uses the screen that sends (FO-4's or the demo).
* **Walk:**
  * `W1`: a marketing send to a person with no consent is blocked with the reason shown;
  * `W2`: the person consents through the web form;
  * `W3`: the send goes out;
  * `W4`: the unsubscribe link withdraws consent and the next send is blocked;
  * `W5`: ends at row 48's first step: delivery state on the message.

### J-27: every lead carries a source (map row 27; J-28 inside it), rank 10
* **Waits on:** FO-2 (API), FO-4 (screens).
* **Swaps:** booking's `arrival` from `fakeArrival` to FO-2's `ArrivalPort` (`runtime-ports.ts`).
* **Screen:** FO-4's sales screens.
* **Walk:**
  * `W1`: a visitor submits the web form;
  * `W2`: a lead appears with its source; its consent per purpose is J-28's own walk (split out, 19 Nov);
  * `W3`: it sits in Unassigned;
  * `W4`: a staff member clicks Take it;
  * `W5`: Engage makes a prospect;
  * `W6`: ends at row 37's first step: book a consultation for the prospect.

### J-28: consent recorded per purpose (map row 28), split out of J-27 (Lead B (7), 19 Nov 12:4x IST, P-733)
* **Why split:** J-37's steps assert no consent, and R1.28's purposes include the web form, so J-37 is not R1.28's J-test. J-27 waits on FO-4 part 2a, part 2b, part 3, FO-2 part 5 and FO-4b. Everything R1.28 needs is on `main` once #2196 (the real `ArrivalPort`, QA-511) merges: qa already walked a ticked web form at 400 px writing one consent with wording, source and time (CAPABILITIES R1.28, 19 Nov). J-27 keeps its W1 and W3-W6 and points to J-28 for W2.
* **Waits on:** #2196 (FO-2 part 3b) on `main`.
* **Swaps:** none (`arrival` is real after #2196).
* **Screen:** the public web form (FO-2/FO-4 part 1 on `main`), the booking page (FO-3w), the unsubscribe page (PF-19b part 2) and the demo inbox.
* **Walk** (each step asserts the stored row underneath, read through the app's own reads or the walk's SQL conditions on the demo copy):
  * `W1`: a visitor submits the web form with EMAIL MARKETING ticked and another purpose unticked → one consent row for the ticked purpose only, with the wording id, source WEB_FORM and the time;
  * `W2`: the same visitor books on the booking page and ticks the booking consent → one BOOKING-source row for that purpose; a booking with the tick off records none (QA-511);
  * `W3`: the one-click unsubscribe link in a marketing mail withdraws EMAIL MARKETING only; the booking purpose stays granted;
  * `W4`: an attempt to edit a consent row is refused (the database trigger), and a new grant supersedes rather than edits;
  * `W5`: ends at row 49's first step: a marketing send to the withdrawn purpose is blocked.
* **Size:** one PR, the walk only (about 250-400 lines). Reviewer. **Proof:** R1.28's J-test (P-733 (3)).

### J-37: public booking page, no double booking (map row 37), rank 11
* **Waits on:** FO-3f, FO-3sr, FO-3sc → FO-3w, PF-23w, FO-2 (real arrival) and PF-4b's demo-inbox sending adapter.
* **Swaps:** booking's `mail` from `fakeMail` to the demo-inbox adapter (as J-38), and `arrival` from `fakeArrival` to FO-2's port (as J-27; whichever lands first does it). These carry PF-23w's deferred J-9 W4 (#1800, Lead B ruling 6889832067): today a reminder due after a restart finds no booker and sends nothing.
* **Screen:** FO-3w (from FO-3sc's concept).
* **Walk:**
  * `W1`: the public page lists slots;
  * `W2`: booker A books one;
  * `W3`: booker B, on the same slot in a second browser, is refused and offered the next slots;
  * `W4`: A's confirmation arrives in the demo inbox;
  * `W4b` (J-9 W4, moved from PF-23w): restart the API; A's reminder still runs at its due time (clock seam on the demo copy, named in the PR) and arrives in the demo inbox;
  * `W5`: ends at row 42's first step: A's manage link.

### J-41: staff hours and time off (map row 41), rank 12
* **Waits on:** FO-3a part 1, FO-3st2.
* **Swaps:** none expected; list any.
* **Screen:** FO-3st2.
* **Walk:**
  * `W1`: a host sets weekly hours;
  * `W2`: adds a day off;
  * `W3`: the public page shows no slots that day and slots only inside the hours;
  * `W4`: ends at row 37's first step: the slot list.

### J-42: reschedule or cancel by link, outcomes, consult record (map row 42), rank 13
* **Waits on:** FO-3sr, FO-3a part 2, FO-3st1, FO-3st3.
* **Swaps:** none beyond PF-23w's (the attendance question runs on pg-boss).
* **Screen:** FO-3st1 and FO-3st3.
* **Walk:**
  * `W1`: the booker reschedules from the mail link;
  * `W2`: both get updated mails;
  * `W3`: after the time, the host answers Attended;
  * `W4`: the consult record is written;
  * `W5`: the next-step button appears;
  * `W6`: ends at row 53's first step: draft a retainer.

### J-53: retainer with the regulator's items, versioned until signed (map row 53), rank 14. **Builder at high effort (money and signatures).**
* **Waits on:** FO-5f #1791 (and FO-5f2 if split), FO-5b, FO-6, FO-5s.
* **Swaps:** FO-6's `SigningPort`, from its fake to the BoldSign **sandbox** adapter (P-561; the founder opens the sandbox when needed, P-568; no real signer). If the sandbox is not open yet, stop and ask; do not walk on the fake.
* **Screen:** FO-5s.
* **Walk:**
  * `W1`: draft from a template;
  * `W2`: edit (a new version);
  * `W3`: send for signature, with the one-time email code (P-564);
  * `W4`: sign in the sandbox;
  * `W5`: the prospect is WON;
  * `W6`: ends at the case side's first step: `prospect.won` makes the client and offers "Open a case?" (FO-8).

### J-104: consultation agreement before the first consult (map row 104), rank 15
* **Waits on:** FO-3c, FO-6, FO-5s.
* **Swaps:** as J-53's `SigningPort` (shared; whichever J-row lands first does it).
* **Screen:** FO-5s.
* **Walk:**
  * `W1`: booking a paid-advice consultation sends the consultation agreement;
  * `W2`: the consult cannot be marked held until it is signed;
  * `W3`: it is signed;
  * `W4`: ends at row 42's first step.

### J-19: a firm is created once, with plan, trial and owner (map row 19), rank 16. **Builder at high effort (money).**
* **Waits on:** PF-5 (Stripe **test mode**; the founder's test account), PF-5s.
* **Swaps:** PF-5's billing port, from its fake to Stripe test mode (test keys only, never live; P-175 still bars any priced button).
* **Screen:** PF-5s.
* **Walk:**
  * `W1`: a firm signs up from the pricing page;
  * `W2`: verifies its email;
  * `W3`: the trial starts with no card;
  * `W4`: the same email cannot create a second firm;
  * `W5`: ends at row 5's first step: invite the first staff member.

### J-29: one person record, duplicate warning, safe merge (map row 29), rank 17
* **Waits on:** FO-9a, FO-9b (the case side's client merge), FO-9s.
* **Swaps:** none expected; list any.
* **Screen:** FO-9s.
* **Walk:**
  * `W1`: a second lead with the same email shows the duplicate warning;
  * `W2`: two leads with no case, document, invoice or money merge automatically (P-574);
  * `W3`: a person with a case goes to the review list and is merged by hand through the guided merge;
  * `W4`: ends at the merged person's timeline.

### J-48: sending, delivery state, bounces (map row 48), rank 19
* **Waits on:** PF-19b, and J-49 (same send path; J-49 first).
* **Swaps:** none beyond J-49's.
* **Screen:** the timeline view the sending row names.
* **Walk:**
  * `W1`: a message is sent;
  * `W2`: its state moves to Delivered on the test environment's delivery event;
  * `W3`: a bounced address marks the message Bounced and suppresses the next send;
  * `W4`: ends at the person's timeline showing both.
