---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/web/src/components/**"
---
# Module card: web-components (P-615)
Shared pieces every screen uses: the frame, the UI kit, AI launch, channels, conditions and setup strips. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `frame.tsx` one frame (header, "where am I", toasts) around every screen, words in `where.ts`; `ui/` the team's controls (Button, Dialog, Input, Select, badges, states); `ai-launch.tsx` how an AI step is started; `channels.tsx` "Filed as"; `conditions.tsx`, `form-field-conditions.tsx` rule editors; `setup-strip.tsx`, `next-step.tsx` setup progress; `lifecycle/` remove and retire actions.
**Owner area.** shared by screens, forms and runtime lanes (Unconfirmed: no lane map in code).
**Entry points.** `Frame` (`@/components/frame`), `@/components/ui/*`, `AiLaunchDialog`, `FormMasters` (ai-launch.tsx), `useNextStep`, `SetupStrip`.

**Invariants (set by).**
- One frame around every screen: set-up, case, client and demo inbox (P-447 (2), BK-3).
- Only Live and Saved are offered; the stub pass stays an API path for tests; Live is never started with the live switch off (P-227, P-175).
- AI proposals go to the review queue, never applied here (P-149 (1), P-120).
- Refused channels stay in the list, greyed, with the reason; only what IRCC accepts is offered (P-143).
- One next step per combination; the server's `nextAction` is the only source (BR-13).
- The setup strip only reports (P-118 Q5).
- A dialog opens on its first field, not on Close (QA-41).
- UI follows the team's components and tokens (STANDARDS §1).

**Tables.** none directly (web).
**Tests.** `tests/check_bk3_frame.ts`, `tests/check_bk2_fold_outs.ts`, `tests/check_ai_launch_paths.ts`, `tests/check_bk11_release_fill_trials.ts`, `tests/check_focus_ring_browser.cjs`.
**Row lists (P-712).** Never hand-edit this card's frozen `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.rows/<ROW>.md` next to it (one file per row; `module-cards.py` fails the PR otherwise).

**Do not.**
- Add a second header, toast stack or button style.
- Work out the next step in the browser.
- Offer a third AI mode.
