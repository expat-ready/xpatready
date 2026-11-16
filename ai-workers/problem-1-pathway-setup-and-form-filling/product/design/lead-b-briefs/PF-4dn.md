# Brief: PF-4dn, the invite carries the person's name (AG-1-10, AG-1-69) (cloud builder lane; row owner Lead B)

Written 17 Nov by Build Lead A (Lead B, 6), rev 16.91. It comes from #2044 (PF-6 part 2a) comment 6931207847, point 1, ruled in comment 6931260376.

**Model: Opus 5.5, effort: medium.** **Breaker: no**: it adds no key, wall or money line.

**Starts when:** #2044 is on `main`, and no open PR touches `identity/service.ts`, `identity/routes.ts` or `identity/session/service.ts`. PF-4c part 1 and PF-6m2 touch those, so whichever starts second waits (P-526). Check at start.

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next runtime PF-4dn` and take **one row** end to end on a fresh branch from `origin/main`, in one PR titled `runtime: PF-4dn — the invite carries the person's name`.

**The rule:** AG-01 §3.2: "invite a new user (name + email + one or more roles…)" (AG-1-10, AG-1-69).

Today:
* `POST /api/platform/staff/invitations` takes only email and roles;
* accept makes the display name from the part of the email before the @;
* PF-6 part 2a (#2044) left the name off its rows for that reason.

**Read only these:** on `main`, `api/src/platform/identity/service.ts` (`invite`), `identity/routes.ts` (the invitation route's input schema), `identity/session/service.ts` (the accept transaction), the invitation model in `prisma/schema/platform.prisma`, and the PF-6 part 2a invite rows in `web/src/modules/platform/`.

**What to build:**
* The invite takes an optional `displayName`: trimmed, 1–120 characters, no control characters. It is stored on the invitation.
* Accept uses it when present, and falls back to the part of the email before the @ as today.
* The invite rows on the Team screen gain one optional "Name" field per row.
* If the invitation model needs a column: one migration, nullable, stamped later than the newest on `main` (the release holder reads it, P-423). Put "Ready for Lead read" at the top of the PR.

**Done when** (P-606; list in the PR body; the reviewer ticks each), in `tests/check_pf4dn_invite_name.ts`:
* `PF-4dn DW1` pass: an invite with `displayName: "Client A Staff"` → accept → the staff member's name is "Client A Staff".
* `PF-4dn DW2` fail:
  - a 121-character name → 400 with plain words, and no invitation stored;
  - a name with a control character → 400.
* `PF-4dn DW3` neither: an invite with no name → accept uses the part of the email before the @, exactly as today. PF-4's and PF-6m2's suites pass unchanged.
* `PF-4dn DW4` screen: the Name field shows on each invite row, is labelled for screen readers (axe clean), and its value reaches the request.

**Touch list:**
* `identity/service.ts` (`invite` only);
* `identity/routes.ts` (that schema only);
* `identity/session/service.ts` (the name at accept only);
* the invitation model plus one migration, if needed;
* the PF-6 invite-row component (one field);
* `tests/check_pf4dn_invite_name.ts`;
* `api/src/platform/MODULE.md` (one line).

If it passes 800 lines (P-610), split it into part 1 (API) and part 2 (field), and name the split in the PR before building.

**PR:**
* Keep it a **draft** until `Reviewer: Approve <head>`, then mark it ready once.
* Opus reviewer (P-303); the re-review reads only the diff (P-277).
* Label `review: approved` only after Approve and green CI (P-385).

**Standard rules:**
* P-559: one row, one session, one PR.
* Merge `main` only on a conflict (P-270).
* Live AI off, US$0, never a priced button (P-175).
* Push after every step (P-557).
* Questions go in a PR comment headed "Question for the tech lead".
* Report to the current Lead (`tools/current-lead.sh`) and to Build Lead A (branch `lead-b-front-office`, `product/design/lead-b-state.md`).
* Never ask for or wait on a network or environment change.
* Read only the files named here and the code you change (P-556).
