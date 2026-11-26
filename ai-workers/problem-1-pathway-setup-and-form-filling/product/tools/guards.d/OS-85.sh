# OS-85 (Lead 2, 26 Nov, "no hot spot"): mutation rows live in guards.d, one file per item; check-guards-d.sh fails a row
# or block written in check-guards.sh, a block or row added to the frozen 000-base.sh, an odd file name, or an item file
# that does more than add rows and tests.
TESTS="$TESTS check-guards-d.sh"
MUT="$MUT"'
OS85 inline|product/tools/check-guards-d.sh|s/        out.append(f"check-guards.sh:{i} holds/        pass  # out.append(f"check-guards.sh:{i} holds/|check-guards-d.sh
OS85 frozen|product/tools/check-guards-d.sh|s/        if rows > nr:/        if False:/|check-guards-d.sh
OS85 name|product/tools/check-guards-d.sh|s/        out.append(f"guards.d\/{n}: name it/        pass  # out.append(f"guards.d\/{n}: name it/|check-guards-d.sh
OS85 command|product/tools/check-guards-d.sh|s/        out.append(f"guards.d\/{n}:{i} is neither/        pass  # out.append(f"guards.d\/{n}:{i} is neither/|check-guards-d.sh
OS85 quote|product/tools/check-guards-d.sh|s/            elif "." in s or not ROW.match(s):/            elif not ROW.match(s):/|check-guards-d.sh
OS85 base grammar|product/tools/check-guards-d.sh|s/^    inside = False; any_row = False$/    inside = False; any_row = False\n    if base: L = []/|check-guards-d.sh
OS85 watched|product/tools/checks-changed.py|s/ or "\/tools\/guards.d\/" in path//|check-checks-changed.sh
OS85 loader|product/tools/check-guards.sh|s/LC_ALL=C ls -- \*.sh/ls -- *.sh/|check-guards-d.sh'
