# PF-Fd journey test (reviewer, 16 Nov 2026, commit 4388547cd)

This row is a port method with no screen. The "person" in these journeys is the builder of a calling row (CS-D6 Dispose, CS-X3, PF-F2), who stores and disposes of a firm's files through `FilesPort`. I walked the journeys as calls on `fakeFiles` and `LocalFiles`. The replay is `tests/check_pffd_delete.ts` (22/0) plus my scratch probes outside the repo. No browser, no port, no :4400.

## Journeys (main path first)
1. **Dispose a signed copy.** Put `signed/d-1.pdf`, delete it → `{ deleted: true }`; then `get` null and `exists` false. Held on both adapters.
2. **Retry the dispose (double click).** Delete again → `{ deleted: false }`, no error. Held. Two deletes in the same tick in one process give `true`, then `false`. Across processes the second throws ENOENT (m1, from the code).
3. **Firm wall.** Firm B deletes firm A's key → `false`, and firm A's bytes and sha256 are unchanged. Held. Firm B can still use the same key name for itself.
4. **Upload retry after disposal.** Put the same bytes and type under the disposed key → `FileKeyTaken`. Other bytes → `FileKeyTaken`. The firm id in upper case → `FileKeyTaken`. Held, including on a fresh `LocalFiles` over the same folder (as after a restart).
5. **Bad input.** `..`, `a/../../b`, upper case, a leading slash or a non-uuid firm → refused with zod's message, as `put` does. Held.
6. **Hostile store.** A symlinked folder or a symlinked file pointing out of the firm's folder → refused, and the outside file stays. Held.
7. **Crafted key past the tombstone.** `x.meta`, `x.1.ab.tmp`, `//`, `/./`, a trailing slash, upper case → refused. A child key under a retired path → the retired key stays absent and stays refused. Held.
8. **Never written.** Delete a key that was never stored, or a key that is only a folder → `false`. Held.
9. **Crash between the two steps.** The tombstone is written first, so the key is retired even if removing the bytes fails. Correct from the code; no test fails if the order is reversed (m3).
10. **Handing over to the next row.** The port comment tells CS-D6 and CS-X3 exactly what to do: ask `isHeld`, commit the disposed record naming key and sha256, then delete, and never roll back. The wording "its own transaction" should say "the same transaction" (m4).

## Data underneath
After J1, the `.meta` file holds `{contentType, sha256, deletedAt}`, the bytes file is gone, and no `.tmp` is left. After J3, firm A's folder is unchanged. Nothing outside `<root>/<firm>/` was touched in J6.

## Break-it pass
* Concurrent put retry against a delete across processes: the bytes can be re-linked under a tombstone. Minor (m2): reads stay absent, PF-F2 sweeps the bytes.
* On `main` before this row, `put` of a key that is already a folder answers success with no bytes. Pre-existing and out of scope; it should go to the qa lane.

## Score (adapted to a port row, judged for the caller's builder)
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | J1–J8 work on both adapters |
| Next step obvious | 1 | the port comment gives callers the full order (J10) |
| Plain words | ½ | "its own transaction" blurs the rule the brief states (m4) |
| Feedback and state | 1 | `{ deleted }` is honest: true once, false otherwise, never a false true in one process |
| Correct data | 1 | sha256 and bytes unchanged across the firm wall; the tombstone keeps its sha256 |
| Error recovery | ½ | retries are safe in one process; across processes, ENOENT (m1) and a re-link (m2) |
| Access (stands in for accessibility and screen sizes) | 1 | firm wall and symlink refusal (J3, J6) |
| Speed | 1 | synchronous filesystem calls; the suite takes about 1 s |
| Consistency (stands in for visual quality) | 1 | follows `put`'s claim-by-`.meta` pattern and the shared contract (PF-0c) |
| Trust and sources | ½ | SA-11 BR-7 is cited; two of the rules (the order of the two steps, the `get` tombstone) are not proven by a test (m3) |

**8.5/10, no criterion at 0: passes the journey bar.** Fixes that raise the low scores, most valuable first:
1. m3: a planted tombstone with the bytes still present (the crash-between-steps state).
2. m1: answer ENOENT on the unlink as `deleted: false`.
3. m4: "same transaction" wording.
4. m2: re-check the tombstone after the re-link.

Not tested: a real multi-process race, the S3 adapter (PF-F1), any caller (none on `main` yet). D17 and D20 stay with the founder (there is no user-facing walk for a port).
