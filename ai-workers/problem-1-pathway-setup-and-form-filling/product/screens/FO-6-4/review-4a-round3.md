# FO-6 part 4a (#3433): review round 3 (kept here so #3433's head stays 1438deef9)


## Round 3 (diff only, P-277): `14201132f..1438deef96d9bd2a2edcc3f513c124d136dc6511`
* Scope: one file, `tests/check_fo6_door.ts`, +3 −1 (a 4b line, PENDING under 4a, so not exercised today).
* CodeQL fix: `pathIs` splits the Set-Cookie on `;`, trims, and passes only when an attribute's first 5 chars are `path=` (any case) and the rest equals `/api/public/sign/<token>` exactly. Tested in the scratchpad: `Path=` / `PATH=` with the exact path pass; `…/<token>/code`, no Path, `Path=/`, `Path=/api/public/sign/`, and `.` used as a wildcard (`abxc` for `ab.c`) all fail. Equal to or stricter than the old regex (token case now exact; `path=` inside a cookie value no longer matches). The diff builds no other pattern from data; the other regexes are literals. Note: `Path = /x` with spaces around `=` would fail. That is stricter, and Nest/Express never emits it.
* `Card unchanged:` true. `features/front-office-signing.ts` gains only a comment and a side-effect import of `email-code.ts`. The api-features card's purpose, entry points, invariants, tables and tests do not change. The setting and new files are listed in `front-office/MODULE.rows/FO-6-4a.md`.
* New findings: none.

`Reviewer: Approve 1438deef96d9bd2a2edcc3f513c124d136dc6511`

Verdict: Approve
