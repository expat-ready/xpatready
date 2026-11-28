# LR-128 (lab register, lane automation-measures-2, 28 Nov): the daily measures line can say where the tokens went, by
# skill and by subagent (usage-by.py). Each row breaks one rule of the count, so check-usage-by.sh must then fail.
TESTS="$TESTS check-usage-by.sh"   # LR-128: tokens by skill and subagent
MUT="$MUT"'
LR128 window|product/tools/usage-by.py|s/            elif since <= t <= until:/            elif True:/|check-usage-by.sh
LR128 spawn|product/tools/usage-by.py|s/            walk(sub, since, until, spawn.get(meta.get("toolUseId"), "(none)"),/            walk(sub, since, until, "(none)",/|check-usage-by.sh
LR128 cache|product/tools/usage-by.py|s/"cache_read_input_tokens", "output_tokens"))/"output_tokens"))/|check-usage-by.sh
LR128 unread|product/tools/usage-by.py|s/^            bad\["lines"\] += 1$/            pass/|check-usage-by.sh
LR128 dedupe|product/tools/usage-by.py|s/ and not (mid and mid in seen):$/:/|check-usage-by.sh'
