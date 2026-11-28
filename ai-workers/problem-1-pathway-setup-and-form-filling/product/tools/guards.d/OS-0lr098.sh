# LR-098 (file named OS-0lr098.sh: check-guards-d.sh reads only OS-<digits>…; "LR-098" is the lab register row, lane
# automation-measures; founder P-860): lead-watch's per-PR GitHub reads through a few GraphQL queries (gh_graphql.py),
# REST when GraphQL fails. Each row switches one rule off, so check-gh-graphql.sh must then fail.
TESTS="$TESTS check-gh-graphql.sh"   # LR-098: GraphQL bundle for lead-watch's scripts (sle-watch first)
MUT="$MUT"'
LR098 bot|product/tools/gh_graphql.py|s/"user": {"login": login + "\[bot\]" if bot and not login.endswith("\[bot\]") else login,/"user": {"login": login,/|check-gh-graphql.sh
LR098 batch|product/tools/gh_graphql.py|s/    for i in range(0, len(numbers), PR_BATCH):/    for i in range(0, len(numbers) and 1):/|check-gh-graphql.sh
LR098 missing|product/tools/gh_graphql.py|s/            if not isinstance(p, dict):/            if False:/|check-gh-graphql.sh
LR098 errors|product/tools/gh_graphql.py|s/ or out.get("errors") or not out.get("data"):/:/|check-gh-graphql.sh
LR098 sleuse|product/tools/sle-watch.py|s/        comments = bundle\[n\]\["comments"\] if bundle is not None else /        comments = /|check-gh-graphql.sh
LR098 slefall|product/tools/sle-watch.py|s/    except Exception as e:   # GraphQLError, or the helper missing: REST, as before/    except ImportError as e:/|check-gh-graphql.sh'
