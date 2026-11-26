# OS-85 part 2 (Lead 2, 26 Nov): lead-watch shows no ACT about an event over 72 h old (retry-watch, outside-deps-watch):
# act-age.py moves it to a stale list, shown as one ACT a week; a new event (a new date) shows at once.
TESTS="$TESTS check-act-age.sh"
MUT="$MUT"'
OS85b age|product/tools/act-age.py|s/            (stale if t is not None and now - t > timedelta(hours=o.hours) else keep).append(l)/            keep.append(l)/|check-act-age.sh
OS85b weekly|product/tools/act-age.py|s/            if not isinstance(last, (int, float)) or nowe - last >= WEEK:/            if True:/|check-act-age.sh
OS85b nearest|product/tools/act-age.py|s/ for k in (-1, 0, 1)\]/ for k in (0,)]/|check-act-age.sh
OS85b live|product/tools/act-age.py|s/ and not any(re.search(x, l) for x in o.live) else None/ else None/|check-act-age.sh
OS85b outside|product/tools/lead-watch.sh|s/ --name outside --state "\$STATE_DIR" --live .decision date \[^:\]\* reached.)/ --name outside --state "$STATE_DIR")/|check-act-age.sh
OS85b rollup|product/tools/retry-watch.py|s/ + (f", newest pass over 72 h ago (at {ist(max(t for _, t in part))})" if tag else "")//|check-retry-watch.sh
OS85b quiet|product/tools/lead-watch.sh|s/ACT   stale outside.stale outside)/ACT   stale outside)/|check-act-age.sh
OS85b wired|product/tools/lead-watch.sh|s/ 2>\&1 . python3 -I "\$TOOLS\/act-age.py" --name retry --state "\$STATE_DIR")/ 2>\&1)/|check-act-age.sh'
