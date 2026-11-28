# LR-168 (file named OS-0lr168.sh: check-guards-d.sh reads only OS-<digits>…; founder A455, 28 Nov): the Lead's check stamp
# pushed to lead/check-stamp; lead-gap.yml sets a red lead-check-gap on main's tip when it is over 20 min old.
TESTS="$TESTS check-check-stamp-push.sh"   # LR-168: a gap alarm that needs no Mac
MUT="$MUT"'
LR168 age|product/tools/check-stamp.sh|s/if \[ "\$age" -gt "\$MAX" \]; then echo "failure/if false; then echo "failure/|check-check-stamp-push.sh
LR168 none|product/tools/check-stamp.sh|s/{ echo "failure no Lead check stamp/{ echo "success no Lead check stamp/|check-check-stamp-push.sh
LR168 ff|product/tools/check-stamp.sh|s/ \${par:+-p "\$par"} -m/ -m/|check-check-stamp-push.sh
LR168 push|product/tools/lead-watch.sh|s/sp=\$(bash "\$TOOLS\/check-stamp.sh" push "\$TOOLS" 2>\&1) \&\& echo "\$sp" .. ACT "\$sp"/sp=ok; echo "$sp"/|check-check-stamp-push.sh
LR168 status|../../.github/workflows/lead-gap.yml|s/context: "lead-check-gap"/context: "other"/|check-check-stamp-push.sh'
