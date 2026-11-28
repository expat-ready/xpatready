# LR-170 (file named OS-0lr170.sh: check-guards-d.sh reads only OS-<digits>…; founder A455, 28 Nov): the founder-click check fires on requests only; a past-tense report ("sat as cards waiting
# for your click") passes, a present one in any clause still asks.
MUT="$MUT"'
LR170 past|product/tools/founder-click-guard.sh|s/ and not PAST.search(c) for c in/ for c in/|check-founder-click-guard.sh
LR170 clause|product/tools/founder-click-guard.sh|s/YOURS.search(c) and not PAST.search(c) for c in re.split(r"\[,;:\]/YOURS.search(k) and not PAST.search(k) for c in re.split(r"[,;:]/|check-founder-click-guard.sh'
