# A389 part 1 (file named OS-0a389.sh: check-guards-d.sh reads only OS-<digits>…; "A389" is the founder ask, guard 41, founder 25 Nov):
# qa/clauses.tsv; each row switches one of clauses.py's refusals off, so check-clauses.sh must then fail.
TESTS="$TESTS check-clauses.sh"
MUT="$MUT"'
41 works|product/tools/clauses.py|s/^            elif st.split(" ")\[0\] == "Works":/            elif False:/|check-clauses.sh
41 evidence|product/tools/clauses.py|s/^                if not (EVIDENCE.match(os.path.normpath(ev)) and os.path.isfile(os.path.join(P, ev)) or own_note(caps\[rid\], l)):/                if False:/|check-clauses.sh
41 commit|product/tools/clauses.py|s/^                if not re.fullmatch(r"\[0-9a-f\]{7,40}", l\["commit"\]):/                if False:/|check-clauses.sh
41 drift|product/tools/clauses.py|s/^        if \[l\["clause"\] for l in ls\] != split/        if False and [] != split/|check-clauses.sh
41 none|product/tools/clauses.py|s/^        if not ls:/        if False:/|check-clauses.sh
41 status|product/tools/clauses.py|s/^            if l\["status"\] not in STATUS:/            if False:/|check-clauses.sh
41 date|product/tools/clauses.py|s/^                if not real_date(l\["date"\]):/                if False:/|check-clauses.sh
41 r1|product/tools/clauses.py|s/^            bad.append(f"{rid}: in clauses.tsv but not an R1 row/            print(f"{rid}: in clauses.tsv but not an R1 row/|check-clauses.sh
41 short|product/tools/clauses.py|s/^            MALFORMED.append(c\[1\]); continue/            continue/|check-clauses.sh
41 prefix|product/tools/clauses.py|s/^            elif st.split(" ")\[0\] == "Works":/            elif st == "Works":/|check-clauses.sh
41 normpath|product/tools/clauses.py|s/EVIDENCE.match(os.path.normpath(ev))/ev.startswith("qa\/")/|check-clauses.sh
41 note|product/tools/clauses.py|s/ and l\["commit"\] == v\[1\])$/)/|check-clauses.sh
41 notworks|product/tools/clauses.py|s/^    v = verdict(row) if row\["status"\].split(" ")\[0\] == "Works" else None/    v = verdict(row)/|check-clauses.sh
41 isfile|product/tools/clauses.py|s/os.path.isfile(os.path.join(P, ev))/os.path.exists(os.path.join(P, ev))/|check-clauses.sh
41 keep|product/tools/clauses.py|s/^            if k:/            if False:/|check-clauses.sh'
