# CS-NT1 part 3: one item split out, for the tech lead (25 Nov, builder, runtime lane)

**What:** the client's timeline (AG-13-33: "the portal timeline is the client-visible subset only"; brief part 3, DW15) is not in PR #3649. Everything else in the brief's part 3 is in it: notes on a case client, the case timeline (AG-13-30..32), and @mentions (AG-13-22, DW12).

**Premise corrected:** the first PR body said `ports/notifications.ts` was not on main. That was wrong: it is on main since c299aaa57 (PF-18np, 15 Nov). The reviewer's M1 caught it, and @mentions are now built in this PR.

**Why the split:** size (P-610, under 800 changed lines with tests). With mentions the PR is at about 790 lines. The client's timeline needs a client-facing read on the simulated client's path in `runtime.ts` (part 1 touched it with one hook), a client-visible filter over both sources, and its pass and fail tests (DW15). That is about 120 lines, which would take the PR over the limit.

**Evidence that R1.76 does not wait on it:** j_76's 27 steps never read a client timeline (W1-W8: staff notes, case, person and prospect timelines, the walls). BACKLOG row CS-NT1's Done when does not name it either: the client half there is "a `CLIENT_VISIBLE` note appears in the portal read", which part 1's `clientNotesOf` already proves.

**Proposal:** a row line **CS-NT1 part 3b**, the client's timeline (AG-13-33, DW15, about 200 lines, runtime lane), right after part 4. It touches `case-notes/timeline.ts` (a `clientVisible` mode), one read in the client's case path, and a new test. Breaker: yes (portal visibility).

**Needs:** the tech lead's yes in a PR comment on #3649 (or a ruling to build it in this PR with a size waiver).
