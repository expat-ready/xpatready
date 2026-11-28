# LR-174 (file named OS-0lr174.sh: check-guards-d.sh reads only OS-<digits>…) (founder A455, Lead 13, 28 Nov): the GitHub
# budget meter, its budget lines, lead-watch's top line, the org App token and the push guard's .pem refusal. Each row
# switches one part off, so its test must then fail.
TESTS="$TESTS check-github-budget.sh check-app-token.sh"   # LR-174: budget lines enforced; App token minted, cached, preferred
MUT="$MUT"'
LR174 over|product/tools/github-meter.sh|s/else if (last\[s\] + 0 > B\[s\] + 0)/else if (0)/|check-github-budget.sh
LR174 fits|product/tools/github-meter.sh|s/if \[ "\$REMAIN" -ge "\$b" \]; then/if true; then/|check-github-budget.sh
LR174 top|product/tools/lead-watch.sh|s/2>&1); say "\$gm"$/2>\&1)/|check-github-budget.sh
LR174 cache|product/tools/app-token.sh|s/exp - 300/exp - 0/|check-app-token.sh
LR174 inrepo|product/tools/app-token.sh|/case "\$real" in "\$r"\/\*)/d|check-app-token.sh
LR174 ghapp|product/tools/gh.sh|s/then export GH_TOKEN="\$t"; fi/then :; fi/|check-app-token.sh
LR174 writes|product/tools/gh.sh|s/"api "\*) ;; \*) return 1;;/"api "*) ;; *) return 0;;/|check-app-token.sh
LR174 pem|product/tools/push-guard.sh|s/gz.pem)/gz)/|check-push-guard-fixtures.sh'
