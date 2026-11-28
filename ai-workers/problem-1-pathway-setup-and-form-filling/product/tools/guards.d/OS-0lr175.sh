# LR-175 (file named OS-0lr175.sh: check-guards-d.sh reads only OS-<digits>…) (founder A455, Lead 13, 28 Nov): the lite
# check writes the stamp with mode lite, gap names the mode, reads owed are found, and a full check that would not fit
# the budget runs the lite check. Each row switches one part off, so check-lead-watch-lite.sh must then fail.
TESTS="$TESTS check-lead-watch-lite.sh"   # LR-175: lite under 50 requests, stamp mode lite, gap quiet then loud
MUT="$MUT"'
LR175 stamp|product/tools/lead-watch-lite.sh|s/^echo "\$now" > "\$stamp.\$\$" && mv -f "\$stamp.\$\$" "\$stamp"; echo lite/: ; echo lite/|check-lead-watch-lite.sh
LR175 mode|product/tools/lead-watch-lite.sh|s/echo lite > "\$stamp-mode/echo full > "$stamp-mode/|check-lead-watch-lite.sh
LR175 gapmode|product/tools/lead-watch.sh|s/md=\${md:+ (\$md)}/md=/|check-lead-watch-lite.sh
LR175 owed|product/tools/lead-watch-lite.sh|s/if (n, sha) not in read and/if False and/|check-lead-watch-lite.sh
LR175 bold|product/tools/lead-watch-lite.sh|s/ready for lead read(?: and label)?:?/ready for lead read/|check-lead-watch-lite.sh
LR175 window|product/tools/lead-watch-lite.sh|s/\[ "\$c0" -lt "\$qfrom" \] \&\& qfrom=\$c0/:/|check-lead-watch-lite.sh
LR175 fallback|product/tools/lead-watch.sh|s/^  bash "\$TOOLS\/lead-watch-lite.sh" "\$SINCE"; exit/  exit/|check-lead-watch-lite.sh'
