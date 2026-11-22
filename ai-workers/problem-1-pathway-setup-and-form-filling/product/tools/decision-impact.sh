#!/bin/bash
# Decision impact check (P-74): every product decision from P-61 on must become something a person can see and the
# tester can verify — a capability row in qa/CAPABILITIES.md (scheduled now) or a B-row in BACKLOG*.md (scheduled later; the B-rows live in BACKLOG-requirements*.md since 31 Oct).
# B-rows include the Bake's BK-n rows and lettered rows such as B170d (Lead 24, 12 Nov). A mention in a lane note is not enough. Workflow and scope decisions are listed in EXEMPT. Exit 1 if any is missing. Run by the Lead before ending a chat (skill lead) and by
# the qa lane (skill qa). Usage: decision-impact.sh [first P-number, default 61]
# E15 (P-772, 21 Nov): EXEMPT is frozen at P-764; a newer workflow, tooling or scope row says "Kind: workflow.",
# "Kind: tooling." or "Kind: scope." in its own text instead. From P-807 on, every DECISIONS row also states its impact
# (P-254): the word "Impact", or all of "time", "cost" and "quality". A struck-through row is not checked. Test:
# check-decision-impact.sh.
PH="$(cd "$(dirname "$0")/.." && pwd)"; first=${1:-61}; bad=0
EXEMPT=" P-764 P-763 P-762 P-761 P-760 P-759 P-758 P-757 P-756 P-755 P-754 P-753 P-752 P-751 P-750 P-749 P-748 P-747 P-741 P-740 P-739 P-738 P-734 P-733 P-732 P-731 P-730 P-729 P-728 P-727 P-726 P-725 P-724 P-723 P-722 P-721 P-720 P-719 P-718 P-717 P-716 P-715 P-714 P-713 P-712 P-711 P-710 P-709 P-708 P-707 P-706 P-705 P-704 P-703 P-702 P-700 P-699 P-698 P-697 P-696 P-695 P-693 P-692 P-691 P-690 P-689 P-688 P-687 P-686 P-685 P-684 P-683 P-682 P-681 P-680 P-679 P-678 P-677 P-676 P-675 P-674 P-673 P-672 P-671 P-670 P-669 P-668 P-667 P-666 P-665 P-664 P-663 P-662 P-661 P-660 P-659 P-658 P-655 P-656 P-657 P-638 P-640 P-641 P-642 P-643 P-644 P-645 P-646 P-647 P-648 P-649 P-650 P-651 P-652 P-653 P-654 P-616 P-565 P-569 P-573 P-576 P-582 P-589 P-590 P-591 P-592 P-593 P-594 P-595 P-596 P-597 P-598 P-602 P-604 P-605 P-608 P-609 P-610 P-611 P-613 P-614 P-615 P-558 P-557 P-556 P-555 P-554 P-553 P-552 P-551 P-550 P-549 P-548 P-547 P-546 P-545 P-544 P-543 P-542 P-540 P-538 P-537 P-536 P-534 P-533 P-532 P-530 P-529 P-528 P-527 P-524 P-523 P-522 P-521 P-520 P-519 P-517 P-516 P-515 P-514 P-512 P-511 P-509 P-508 P-507 P-506 P-505 P-503 P-502 P-501 P-500 P-499 P-498 P-497 P-487 P-494 P-489 P-488 P-486 P-485 P-482 P-481 P-480 P-479 P-478 P-472 P-468 P-463 P-462 P-461 P-460 P-458 P-457 P-456 P-455 P-454 P-453 P-452 P-451 P-450 P-449 P-448 P-447 P-446 P-445 P-440 P-439 P-436 P-433 P-432 P-431 P-430 P-429 P-428 P-427 P-426 P-424 P-423 P-422 P-421 P-420 P-418 P-416 P-415 P-414 P-413 P-410 P-409 P-407 P-404 P-403 P-402 P-401 P-400 P-399 P-398 P-397 P-396 P-394 P-392 P-391 P-390 P-389 P-388 P-387 P-386 P-385 P-384 P-383 P-382 P-381 P-380 P-379 P-378 P-377 P-376 P-374 P-372 P-371 P-370 P-369 P-368 P-367 P-366 P-365 P-364 P-363 P-362 P-361 P-360 P-359 P-358 P-357 P-356 P-355 P-354 P-347 P-344 P-317 P-338 P-341 P-342 P-335 P-336 P-337 P-320 P-321 P-323 P-324 P-325 P-326 P-327 P-329 P-331 P-332 P-333 P-64 P-200 P-68 P-69 P-70 P-74 P-75 P-81 P-82 P-83 P-84 P-85 P-86 P-87 P-88 P-89 P-91 P-92 P-94 P-101 P-111 P-117 P-124 P-126 P-146 P-153 P-163 P-166 P-167 P-169 P-170 P-173 P-178 P-181 P-182 P-183 P-184 P-185 P-186 P-187 P-188 P-189 P-190 P-191 P-192 P-195 P-199 P-201 P-205 P-196 P-198 P-210 P-211 P-212 P-213 P-197 P-203 P-214 P-204 P-202 P-206 P-215 P-217 P-218 P-219 P-220 P-221 P-224 P-223 P-225 P-228 P-232 P-231 P-234 P-249 P-250 P-251 P-254 P-255 P-257 P-258 P-259 P-260 P-261 P-262 P-263 P-264 P-265 P-267 P-268 P-269 P-276 P-270 P-275 P-277 P-278 P-280 P-281 P-282 P-283 P-285 P-286 P-289 P-290 P-291 P-292 P-293 P-294 P-295 P-296 P-297 P-298 P-299 P-300 P-301 P-302 P-303 P-304 P-305 P-306 P-307 P-308 P-309 P-310 P-311 P-312 P-313 P-314 P-315 P-316 "   # workflow, tooling and scope decisions (P-748 to P-750 size exception, session naming, staging timing; P-747 a ruling on bug rows QA-526/QA-527 already tracked in qa/BUGS.md: Lead 100, 20 Nov) (P-683 to P-711 except the product rows P-694 and P-701, tied to FO-7v and FO-7g: Lead 84, 19 Nov) (no screen of their own; P-616: gate rulings, Lead 59 15 Nov; P-565 to P-610 board, scope, model and workflow rows added by Lead 54, 15 Nov); P-487, P-497, P-498: rulings on bug rows already tracked in qa/BUGS.md (Lead 31, 13 Nov)
EXEMPT_UPTO=764; IMPACT_FROM=807   # one past main's newest row at the last refresh (P-806, 22 Nov); was 773 when written (21 Nov)
for id in $EXEMPT; do [ "${id#P-}" -le "$EXEMPT_UPTO" ] || { echo "EXEMPT FROZEN: $id is in EXEMPT, which ends at P-$EXEMPT_UPTO: tag the row \"Kind: workflow.\", \"Kind: tooling.\" or \"Kind: scope.\" in DECISIONS instead (E15, P-772)"; bad=1; }; done
grep -E '^\| P-[0-9]+[a-z]? \|' "$PH/DECISIONS.md" | while IFS= read -r row; do
  id=$(printf '%s\n' "$row" | sed -E 's/^\| (P-[0-9]+)[a-z]? .*/\1/'); [ "${id#P-}" -ge "$IMPACT_FROM" ] || continue
  printf '%s\n' "$row" | grep -qE '\bImpact\b' && continue
  printf '%s\n' "$row" | grep -qiE '\btime\b' && printf '%s\n' "$row" | grep -qiE '\bcost\b' && printf '%s\n' "$row" | grep -qiE '\bquality\b' && continue
  echo "NO IMPACT: $id does not state its impact: write \"Impact:\" with its effect on time, cost and quality (P-254; E15, P-772)"
done | grep . && bad=1
ids=$(grep -ho '^| ~*P-[0-9]*' "$PH/DECISIONS.md" "$PH"/decisions/*.md | tr -d "~" | tr -d '| ' | sort -t- -k2 -n -u)
for id in $ids; do
  n=${id#P-}; [ "$n" -ge "$first" ] || continue
  case "$EXEMPT" in *" $id "*) echo "$id → workflow or scope (exempt)"; continue;; esac
  # From P-765 on (Lead 3, series 3, 20 Nov): a row that says "Kind: workflow." or "Kind: scope." is exempt by itself, so a
  # new workflow ruling no longer fails every records PR until EXEMPT is edited in a tooling PR (#2480, #2490).
  # E15 (P-772): "Kind: tooling." too, so a tooling ruling never needs an EXEMPT edit (EXEMPT is frozen at P-764).
  grep -qE "^\| ~*$id \|.*Kind: (workflow|scope|tooling)\." "$PH/DECISIONS.md" && { echo "$id → workflow, tooling or scope (Kind: tag)"; continue; }
  rows=$(grep -E "^\| C[0-9.]+ .*\b$id\b" "$PH/qa/CAPABILITIES.md" | cut -d'|' -f2 | tr -d ' ' | tr '\n' ' ')
  later=$(grep -hE "^\| (B[0-9]+[a-z]?|BK-[0-9]+[a-z]?|PF-[0-9]+[a-z]?|FO-[0-9]+[a-z]?|AUD-[0-9]+) .*\b$id\b" "$PH"/BACKLOG*.md | cut -d'|' -f2 | tr -d ' ' | tr '\n' ' ')
  if [ -z "$rows$later" ]; then echo "NO CAPABILITY: $id — nothing a person can see or the tester can check"; bad=1
  else echo "$id → ${rows:+capabilities $rows}${later:+ backlog $later}"; fi
done
exit $bad
