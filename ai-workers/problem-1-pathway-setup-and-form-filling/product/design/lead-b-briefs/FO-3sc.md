# Brief: FO-3sc, one concept for the booking screens (records; cloud lane; row owner Lead B)

Written 15 Nov by Lead B (6) for Lead 57 (P-613). Row: BACKLOG FO-3sc (records; waits on nothing; FO-3 is on `main`). It unblocks FO-3w (public booking pages) → J-37 and J-38, and FO-3st1-3 → J-41 and J-42. Effort: Opus 5.5 medium; the fresh challenge is a separate Fable 5.2 medium session (P-608).

---
You are a builder for the Expat Ready Pathway Configurator. Run `/next screens FO-3sc` and take **one row, FO-3sc**: one records PR adding `screens/fo-3-booking/concept.md`, its mock-up `screens/fo-3-booking/design/*.html` and `challenge.md`, using the skill `screen-concept`.

**Read only these:** what `python3 product/tools/trace-requirements.py --brief FO-3sc` prints (AG-4-16..20, -36..39, -49, -50, -62, -63, -67; AG-4-40, -56); BACKLOG rows FO-3w, FO-3st1, FO-3st2, FO-3st3, FO-3a, FO-3s5 (so the concept covers each one's screens); on `main`, `api/src/front-office/booking/` (`service.ts`'s rules, `slots.ts`, `public.controller.ts`'s routes) for what the API already does; FO-3sr's route table (brief `lead-b-briefs/FO-3sr.md` on `lead-b-front-office`; PR #1811); the approved FO-4 concept as the house pattern (`git show origin/lead-b-front-office:ai-workers/problem-1-pathway-setup-and-form-filling/product/screens/fo-4-sales/concept.md`); `EXPERIENCE.md`; P-473's style.

**What the concept covers** (the row's list, each part named):
* **Public (FO-3w):** `/book` and `/book/<slug>` → month slot picker in the visitor's zone with "(change)" → form → confirmation (add to calendar, reschedule and cancel links, join details); the reschedule and cancel pages by link with no login; inside the self-service limit the page says reply or call; bad, expired or voided links get one plain message; iframe embedding.
* **Staff (FO-3st1-3):** the calendar (day, week, list; mine or the team's by permission; office time named), New booking (outside my hours with a warning, AG-4-63), booking detail with reschedule and cancel, **the attendance question** (Attended or No-show, answered by a person, never guessed, AG-4-39), then **the consult record** (AG-4-49) whose next step is a button (AG-4-50), including "Prepare a retainer" (FO-3a part 2 sets `prepareRetainer`, rev 16.16 (b)); My availability (named hour sets, each with its zone; time off; an Owner or Admin entering a colleague's, AG-4-62); Settings → Booking types and Advanced → Timings.
* **Calendar sync (FO-3s5):** a section of My account, so there is one design.
* **States:** empty, loading, slot taken while choosing, link expired or voided, inside the self-service limit, a DST day, a zone change.
* **Copy:** every string written in full.
* **Who sees what:** from the keys (`agent/booking:create|edit|list`, `agent/booking-type:manage`; a host always sees and answers their own, AG-4-67).

**Done when (named; the reviewer ticks each):**
* **DW1** each FO-3w, FO-3st1-3 and FO-3s5 journey is listed with its expected result, so those rows' builders can name their tests from it;
* **DW2** every rule is cited by its AG-4 id;
* **DW3** every string is in full;
* **DW4** each screen names the API route it calls, marked "on `main`", "FO-3sr" or "FO-3a (not built)";
* **DW5** a fresh challenge (`challenge.md`) is answered with every Major closed, making the concept r2;
* **DW6** Lead B approves in writing on the PR (P-223 (4)): ask with a PR comment "Question for the tech lead / Lead B: approve FO-3sc r2?".
At most three founder questions, each with a recommendation (expected none: P-560 settles consult then retainer).

**Touch list:** `screens/fo-3-booking/concept.md`, `screens/fo-3-booking/design/*.html`, `screens/fo-3-booking/challenge.md`. No app code.

**Duplicate check (P-526):** `screens/` on `main` and on `lead-b-front-office`, open PRs (`FO-3sc`, `fo-3-booking`); one `Duplicate check:` line. **Breaker:** no (records); reviewer only.

**P-610:** a records PR; if the mock-up files push it past 800 lines, keep one HTML file per screen group (public, staff calendar, settings) and say so.

**P-605/P-606 (every Lead B brief from 15 Nov):** Opus 5.5; no model switch mid-session. Finish whole: if an item turns out to need more than its touch list, stop and ask in a PR comment. Never widen the row silently, and never leave a part for later. Read only the requirement text the trace tool prints.

**Rules (standard, every PF/FO brief):** P-559: firm tables, real sign-in and billing are ours in the PF/FO modules (amends P-335/P-357). One row, one session, one PR; new files only outside the touch list. Opus reviewer (P-303); re-review reads only the diff (P-277); label `review: approved` only after `Reviewer: Approve <sha>` and green CI (P-277, P-385); merge `main` only on a conflict (P-270). **Before asking for the label (rows rev 16, Lead 47: 4 of 4 labelled PRs went red after the label on 14 Nov):** run, on `main` merged into your branch, the suites of every CI part that was red on any earlier head of this PR, plus every suite in the shard that shares the demo database with yours, and paste the result lines in the PR. Live AI off, US$0, never a priced button (P-175). No real keys anywhere. Push after every step (P-557). Questions as a PR comment headed "Question for the tech lead"; report to the current Lead (`tools/current-lead.sh`) for the merge queue and to **Lead B** (row owner, branch `lead-b-front-office`, hand-over `product/design/lead-b-state.md`) for the row. Cross-module port interfaces, their fakes and shared event payload types go in `prototype/studio/ports/` (`zod` only; case-side contract v0.1 §1 rule 3); adapters stay in the module's folder; never import `engine/` or case-side files (rows rev 14.1). Event names come from `prototype/studio/ports/events.ts` (`EVENT.*`, FO-1a); add a new name there, never a string literal (rev 15.1). A database function in your migration carries your area's prefix (`fo_sales_`, `fo_booking_`, `fo_compliance_`, `fo_signing_`, `fo_retainer_`, `money_`, `msg_`, `plat_`, `platform_`), never a bare `fo_` name another area may also use, and your migration's stamp is later than the newest on `main` when it merges (rows rev 15.2, the FO-1a/FO-1b clash). Every token earns its outcome (P-556): read only the files named here and the code you change.
---
