---
paths:
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/web/src/*.{ts,tsx}"
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/web/src/lib/**"
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/web/src/modules/**"
  - "ai-workers/problem-1-pathway-setup-and-form-filling/prototype/studio/web/src/styles/**"
---
# Module card: web-shell (P-615)
The web app's shell: routes, the API client, module pages seam, shared words and styles. Read this before editing these files; update it in the same PR when an entry point, invariant, table or test below changes (or say `Card unchanged: <reason>` in the PR body).

**Purpose.** `main.tsx` mounts the app; `App.tsx` routes and the demo menu; `modules.tsx` gathers `modules/*/routes.tsx`; `lib/api.ts` every API call and the current person; `lib/*` shared words (`item-words`, `people`, `field-name`); `styles/` tokens and levels; `ChangePreview.tsx`.
**Owner area.** shared by every lane (Unconfirmed: no lane map in code).
**Entry points.** `App`, `APP_ROUTES` and `ModuleRoute` (`modules.tsx`), `setActor` and the API helpers (`lib/api.ts`).

**Invariants (set by).**
- A module adds pages in `modules/<name>/routes.tsx`, never in `App.tsx`; a clash of addresses stops the app (P-559, PF-1, `modules/README.md`).
- `APP_ROUTES` matches `App.tsx`'s routes; the test fails when they differ.
- `actor` is the one current person; only `setActor` changes it (P-484).
- The simulated person travels as `x-actor`; the server decides and refuses in plain words.
- Firm-staff pages (`modules/front-office/`, `modules/platform/`) call `/api/platform/*` and `/api/front-office/*` with PF-4's bearer token through `modules/platform/session.ts` (`staffApi`, `useMe`; `sales/session.ts` is its re-export), never `lib/api.ts`; a change of person drops every `["fo", …]` and `["pf", …]` answer (FO-4, PF-6).
- Our console's pages (`modules/system/`) call `/api/system/*` with our own staff's token through `modules/system/session.ts` (`systemApi`, sessionStorage `xr-system-session`), never `staffApi` or `lib/api.ts`; neither session's token is sent to the other's routes, and a change of session drops every `["sys", …]` answer (PF-17 part 4).
- Demo-only controls sit in one menu, never part of the product (P-35); the menu offers the six agreed combinations (P-148).
- `styles/tokens.css` is the team's tokens, copied unchanged.
- One way to say who can be in an application (`lib/people.ts`, P-161 (2)).

**Tables.** none directly (web).
**Tests.** `tests/check_pf1_module_routes.ts`, `tests/check_fo4_sales_browser.ts`, `tests/check_bk4a.ts`, `tests/check_forms_held_conditions_pure.ts`, `tests/check_bk3_frame.ts`, `tests/check_pf6a_frame_browser.ts`.
**Row lists (P-712).** Never hand-edit this card's frozen `Tests.`, `Tables.` or `Entry points.` line: put your row's items in `MODULE.rows/<ROW>.md` next to it (one file per row; `module-cards.py` fails the PR otherwise).

**Do not.**
- Edit `styles/tokens.css` by hand.
- Route a module page from `App.tsx`.
- Read who the person is anywhere but `getActor()`/`setActor` (`lib/api.ts`), or, on firm-staff pages, `useMe()` (`modules/platform/session.ts`; `sales/session.ts` is its re-export).
