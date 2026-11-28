# OS-451 (lab bundle A11 "Factory autonomy", founder A451, 28 Nov; named OS-451 because check-guards-d.sh reads only
# OS-<digits> names): idle lab lanes, register lag and the open-PR cap in lead-watch step 10e (factory-watch.py), and the
# dry-run pause list (pause-label.sh), each switched off once below, so check-factory-watch.sh must go red.
TESTS="$TESTS check-factory-watch.sh"
MUT="$MUT"'
OS451 idle|product/tools/factory-watch.py|s/        if m > lim:/        if False:/|check-factory-watch.sh
OS451 ready on head|product/tools/factory-watch.py|s/        if head and any(/        if False and any(/|check-factory-watch.sh
OS451 lane comment|product/tools/factory-watch.py|s/ and not NOT_LANE.match(c.get("body") or "")\]/]/|check-factory-watch.sh
OS451 lab only|product/tools/factory-watch.py|s/if dependabot(p) or labels(p) or not is_lab(p):/if dependabot(p):/|check-factory-watch.sh
OS451 register|product/tools/factory-watch.py|s/            if i in status and status\[i\]\[1\].startswith("Intended"):/            if False:/|check-factory-watch.sh
OS451 register window|product/tools/factory-watch.py|s/        if at and ts(at) < since:/        if False:/|check-factory-watch.sh
OS451 cap|product/tools/factory-watch.py|s/    if n > c:/    if False:/|check-factory-watch.sh
OS451 cap paused|product/tools/factory-watch.py|s/ and "paused" not in labels(p))/)/|check-factory-watch.sh
OS451 unread|product/tools/factory-watch.py|s/            print(f"ACT   factory watch {k}: {e}: this check is not done")/            pass/|check-factory-watch.sh
OS451 lead-watch step|product/tools/lead-watch.sh|s/^fw=$(python3 -I "$TOOLS\/factory-watch.py" ${FACTORY_ARGS:-} 2>&1)/fw=$(true 2>\&1)/|check-factory-watch.sh
OS451 dry run|product/tools/pause-label.sh|s/; apply=0$/; apply=1/|check-factory-watch.sh'
