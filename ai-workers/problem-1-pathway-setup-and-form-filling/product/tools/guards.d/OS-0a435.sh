# A435 (file named OS-0a435.sh: check-guards-d.sh reads only OS-<digits>…; "A435" is the founder ask) (LR-158, founder 27 Nov; #3936): the Lead's one label command for a Lead-read PR, and the auto-queue's own cases
# kept. Each row switches one of lead-label.sh's refusals off, so check-lead-label.sh must then fail.
TESTS="$TESTS check-lead-label.sh check-auto-queue-cases.sh"   # A435: the Lead's one label command; the auto-queue's cases kept
MUT="$MUT"'
A435 head|product/tools/lead-label.sh|s/^last=""$/last="Reviewer: Approve $head"/|check-lead-label.sh
A435 who|product/tools/lead-label.sh|s/(.author_association == "OWNER" or /(true or .author_association == "OWNER" or /|check-lead-label.sh
A435 draft|product/tools/lead-label.sh|s/^\[ "\$(jq -r .draft <<< "\$pr")" = false \]/true/|check-lead-label.sh
A435 moved|product/tools/lead-label.sh|s/^if \[ "\$now" != "\$head" \]; then/if false; then/|check-lead-label.sh
A435 main|product/tools/lead-label.sh|s/^  git -C "\$top" show "refs\/lead-label\/main:\$rel" 2>\/dev\/null .*/  true \\/|check-lead-label.sh
A435 pages|product/tools/lead-label.sh|s/^while \[ "\$p" -le 30 \]; do/while [ "$p" -le 1 ]; do/|check-lead-label.sh
A435 shape|product/tools/lead-label.sh|s/length == 1 and (.\[0\] . type == "array" and all(.\[\]; type == "object"))/true/|check-lead-label.sh
A435 locale|product/tools/lead-label.sh|s/^export LC_ALL=C /: /|check-lead-label.sh
A435 read|product/tools/lead-label.sh|s/^\[ -n "\$read_ok" \] .. no/true .. no/|check-lead-label.sh
A435 cap|product/tools/lead-label.sh|s/^\[ "\$p" -le 30 \] .. no/true .. no/|check-lead-label.sh
A435 edited|product/tools/lead-label.sh|s/^ *. select(.created_at != null and .*$/      /|check-lead-label.sh
A435 fence|product/tools/lead-label.sh|s/gsub("```\[\\\\s\\\\S\]\*?(```.\$)"; "")/./|check-lead-label.sh
A435 leads|product/tools/lead-label.sh|s/(\$leads . length) == 0 or/true or/|check-lead-label.sh'
