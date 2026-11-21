# Break report: FO-4as Assign / Reassign on one lead (PR #2620, R1.32)

Head tested: 3118d3827 (the web bundle served already held its `returnFocus` change; 8480fc613 + focus fix). Isolated copy
`screens_as` on :4532, database `xr_studio_screens_as`, `PLATFORM_IDENTITY=local`; never :4400. Sample rows only, AI off, US$0.
Rules: AG-2-13c (rules 1-4, 11, 15, §12), AG-2-86, BR-4, BR-5, X-4. There is no concept.md / challenge.md / build-notes.md
in this folder; scope is the PR's own claim (Assign/Reassign panel, owner history, one-user hiding) and the brief.
Extra rows made for the attack: Read-only, Admin, a Case Officer "Leaver" (deactivated and reactivated), 60 bulk staff
(left DEACTIVATED). Scripts and screenshots: the session scratchpad (`t1.mjs` … `t7.mjs`, `shots/`), not committed.

## Findings

**Major**

1. **One-user firm still shows "N unassigned" in the Sales menu** (X-4, rule 15). The PR hides the chip, the column and Take it,
   but not the menu badge (`sales-frame.tsx:19-31`; it is counted for anyone with view.all or assign). Repro: sample-solo, a lead
   with no owner, sign in as the solo Owner → menu reads "Leads · 1 unassigned"; clicking it opens Leads on Mine (no Unassigned
   list exists for them), where that lead is not shown. Same after a firm drops to one user: "25 unassigned" (shots/t4-solo-list.png, t5-two-to-one.png).
2. **Owner history loses whom: anyone not in the assignees answer becomes "A colleague"** (rule 4; `lead-owner.tsx:65` names
   the target with `useOwners().name`, which only knows active people, and only for holders of `assign`). Repro: T assigns a lead
   to Admin, then to Owner; Admin is deactivated. As the Case Manager the history reads "Second representative (Sample)
   assigned it to A colleague". As Case Officer or Read-only both lines read "… assigned it to A colleague" while the Owner line
   just above names "Representative (Sample)". The audit holds the id and the timeline service already resolves names of
   deactivated staff (`timeline.ts:53-55`); the screen drops them exactly in the leaver case AG1-D7 is about.
3. **Sharing setting off: Reassign cannot be reached, and Assign ends on a false "Lead not found"** (rule 1: works "in every mode
   of the sharing setting"). With `platform.everyone_sees_all` = false: (a) a Case Manager or Owner opening a colleague's lead gets
   "Lead not found / There is no such lead in your firm" (visibility in `common.ts:59-68`; the panel is never offered);
   (b) assigning an unassigned lead to the Case Officer answers `{id, done:true}`, the toast says "L-00007 is now Case officer
   (Sample)'s." and the page under it switches to "Lead not found. There is no such lead in your firm, or it is not one you may
   see.", focus on `<body>` (`lead-owner.tsx:32,35` just closes and invalidates; shots/t2-5-done-true.png). (a) has its cause in the
   existing read; (b) is the panel's handling of `done:true`.

**Minor**

4. **After a refusal, a hidden choice is sent again.** Chosen Case Officer; meanwhile Owner assigns to Case Officer; Assign →
   "Case officer (Sample) already has this lead…". The panel now says Reassign, Case Officer is filtered out and no radio is
   checked, but `to` still holds them (`lead-owner.tsx:25,37`): clicking Reassign posts again and repeats the same refusal instead
   of "Choose who gets the lead." (shots/t1-2-after-refusal.png).
5. **A person deactivated while the panel is open stays offered.** Chose "Leaver", deactivated them, Assign → 422 "Choose an
   active person of your firm." (no name, not saying they left); the picker still lists them on every retry, because
   `onSettled` invalidates only `["fo","leads"]`, not `["fo","assignees"]` (`lead-owner.tsx:35`). Rule 2 "never offered".
   Same after a firm drops to one user with the panel open: all leavers stay listed (shots/t1-3-deactivated-target.png).
6. **Lead closed by someone else while the panel is open: the refusal is never shown.** Assign → 409 "Only an open lead can be
   assigned."; the re-read lead is CLOSED, `mayAssign` turns false, the panel unmounts with its message
   (`lead-page.tsx:155`), no toast, focus falls to `<body>` (shots/t1-4-closed-while-open.png).
7. **"(Inactive) Name" lead: rail and panel disagree.** Rail "Owner (Inactive) Leaver (Sample)", panel "L-00009 · now nobody"
   (`lead-owner.tsx:40`). The behaviour (Assign, Take it, expected owner accepted) is right; the words contradict.
8. **Owner history ignores `more`.** A lead assigned, then 600 notes: the timeline keeps the newest 500 lines, the history
   shows an empty list with no words while the rail names the owner (`lead-owner.tsx:59-60`). An empty history (lead without an
   arrival audit line) also renders an empty `<ol>` with no text.
9. **Assignees failing hides everything without saying so.** `GET leads/assignees` → 500 in a three-person firm: no Owner line,
   Take it, Assign, history, Unassigned chip or Owner column, and no error (`prospect-actions.tsx:22`, `oneUser ?? true`).
   ?view=unassigned silently becomes Mine.
10. **Firm going from 2 users to 1: the leaver's open leads lose every way to be owned but Engage.** No Unassigned chip, no owner
    column, no Take it, no Assign; they are absent from Mine and only appear under All open with nothing marking them (15 leads
    in the repro). X-4 asks for the hiding; nothing tells the remaining user that leads wait for an owner. The menu badge (1)
    still counts them.
11. **Clicks.** AG-2-13c §12: "Assign takes 2 (open the picker, choose)". The panel takes 3 (open, choose, Assign); Enter on a
    radio does not submit.

## What held

- Permissions: Case Officer and Read-only see no Assign/Reassign, and `POST assign` answers 403 MISSING_PERMISSION; Admin,
  Owner and Case Manager get the button. A solo Owner posting to firm A's lead → 404; assigning to another firm's staff → 422.
- Races (5 runs, three at once: Case Manager assigns, Owner assigns, Case Officer takes; all `expectedOwnerStaffId:null`):
  exactly one 200, the others 409 "Case officer (Sample) already has this lead.", one audit line each time. Same person in two
  tabs: one 200, one 409. Stale reassign by screens: refused naming the new owner, nothing changed, rail updates.
- Double-click on Assign: one POST, one audit line. Escape and Cancel are blocked while the request is pending.
- Body validation: missing `expectedOwnerStaffId`, null body, array, numeric or SQL-like `staffId` → 400/422; upper-case UUIDs
  accepted and stored lower-case. Assign on an engaged or closed lead → 409; closed lead shows no Assign.
- Deactivated people are never in a freshly opened picker; Read-only staff are offered (rule 11: not filtered by role).
- "(Inactive) Name" lead: Assign (not Reassign), Take it shown, assign succeeds with the inactive owner as expected owner.
- History wording: "Arrived, added by <name>" for a lead added by hand, "<name> took it", "<name> assigned it to <name>",
  oldest first, with time; engage writes its own take line.
- One-user firm (sample-solo): lead page has no owner line, Take it, Assign or history; Leads has no Unassigned chip, no Owner
  column, no Take it; ?view=unassigned falls back to Mine.
- Keyboard: Enter opens the panel with focus on the first radio, arrows choose, Tab cycles inside the dialog, Escape closes and
  focus returns to Assign/Reassign; the error Notice is `role=alert`.
- Widths: 1024 px, 720×450 (1440 at 200 %), 320 px: no sideways scroll, footer buttons in view; with 66 people at 200 % the list
  scrolls inside the panel and the 60th person can be chosen and assigned.
- No page errors in any run.
