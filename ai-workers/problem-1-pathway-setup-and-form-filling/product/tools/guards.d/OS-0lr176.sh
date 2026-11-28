# LR-176 (file named OS-0lr176.sh: check-guards-d.sh reads only OS-<digits>…; founder A455, 28 Nov 15:5x IST): every session's
# Stop hook refuses a last message asking the founder or the Lead for a step the session's own tools can do, unless it
# names an allowed reason (sign-in, password, 2FA or one-time code, payment, a new account or key, a permission
# widening, or a refused tool call quoted word for word).
MUT="$MUT"'
LR176 every|product/tools/founder-click-guard.sh|s/^\[ -n "\$lane" \] .. lane=unbound/[ "$lane" != lead ] \&\& exit 0/|check-founder-click-guard.sh
LR176 stop|product/tools/stop-check.sh|s/^fc=\$(printf/[ "$LANE" = lead ] \&\& fc=$(printf/|check-founder-click-guard.sh
LR176 who|product/tools/founder-click-guard.sh|s/you = YOU.search(k) or WHO.search(k) or/you = YOU.search(k) or/|check-founder-click-guard.sh
LR176 refused|product/tools/founder-click-guard.sh|s/ or REFUSED.search(text) else/ else/|check-founder-click-guard.sh
LR176 steps|product/tools/founder-click-guard.sh|s/(comment.post)\\b\[/(xcomment)\\b[/|check-founder-click-guard.sh
LR176 rerun|product/tools/founder-click-guard.sh|s/\\bre-?run\\b\[/\\bxre-?run\\b[/|check-founder-click-guard.sh'
