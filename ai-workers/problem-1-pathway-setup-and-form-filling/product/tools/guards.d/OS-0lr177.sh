# LR-177 (file named OS-0lr177.sh: check-guards-d.sh reads only OS-<digits>…; founder A455, 28 Nov 15:5x IST): nobody waits
# unseen: app-view.json, the four app-view ACTs (waiting, idle with work left, finished not archived, view over 15 min)
# and a lane brief's "Do it yourself" section.
TESTS="$TESTS check-wait-unseen.sh"   # LR-177: nobody waits unseen
MUT="$MUT"'
LR177 json|product/tools/app-view-save.sh|s/^python3 -I "\$TOOLS\/app-view-json.py"/true "$TOOLS\/app-view-json.py"/|check-wait-unseen.sh
LR177 time|product/tools/app-view-json.py|s/fromtimestamp(saved - mins \* 60/fromtimestamp(saved/|check-wait-unseen.sh
LR177 archive|product/tools/app-view-check.sh|s/if (m + 0 > 10) print/if (m + 0 > 9999) print/|check-wait-unseen.sh
LR177 diy|product/tools/brief-check.sh|s/  if \[ -z "\$diy" \]; then bad=/  if false; then bad=/|check-wait-unseen.sh
LR177 tool|product/tools/brief-check.sh|s/  elif ! printf/  elif false \&\& ! printf/|check-wait-unseen.sh
LR177 blank|product/tools/brief-check.sh|s/{if (n) exit; next} f {print; n = 1}/{exit} f {print; n = 1}/|check-wait-unseen.sh'
