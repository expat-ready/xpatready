# OS-130 (lab bundle A4 "Review converges", LR-130, LR-133, LR-135, LR-121; Lead 10 kept the name, 28 Nov): a start brief
# with a "Done when" carries a stop rule (brief-check.sh), and REVIEW.md, the reviewer agent, /next and the lead skill carry
# the review rules (check-review-converges.sh).
TESTS="$TESTS check-review-converges.sh"
MUT="$MUT"'
OS130 brief stop rule|product/tools/brief-check.sh|s/  bad="$bad$(stop_bad)"/  :/|check-g4-rules.sh
OS130 stop rule match|product/tools/brief-check.sh|s/stop_rule() { grep -qiE/stop_rule() { true; return; grep -qiE/|check-review-converges.sh
OS130 round cap count|product/tools/brief-check.sh|s/\$C\[ -\](turn/$C[ -]X(turn/|check-review-converges.sh'
