# LR-098 (file named OS-0lr098.sh: check-guards-d.sh reads only OS-<digits>…; "LR-098" is the lab register row, lane
# automation-measures; founder P-860): lead-watch's per-PR GitHub reads through a few GraphQL queries (gh_graphql.py),
# REST when GraphQL fails. Each row switches one rule off, so check-gh-graphql.sh must then fail.
TESTS="$TESTS check-gh-graphql.sh"   # LR-098: GraphQL bundle for lead-watch's scripts (sle-watch, proof-read-watch, flow-measure --lead)
MUT="$MUT"'
LR098 bot|product/tools/gh_graphql.py|s/"user": {"login": login + "\[bot\]" if bot and not login.endswith("\[bot\]") else login,/"user": {"login": login,/|check-gh-graphql.sh
LR098 batch|product/tools/gh_graphql.py|s/    for i in range(0, len(numbers), PR_BATCH):/    for i in range(0, len(numbers) and 1):/|check-gh-graphql.sh
LR098 missing|product/tools/gh_graphql.py|s/            if not isinstance(p, dict):/            if False:/|check-gh-graphql.sh
LR098 errors|product/tools/gh_graphql.py|s/ or out.get("errors") or not out.get("data"):/:/|check-gh-graphql.sh
LR098 sleuse|product/tools/sle-watch.py|s/        comments = bundle\[n\]\["comments"\] if bundle is not None else /        comments = /|check-gh-graphql.sh
LR098 slefall|product/tools/sle-watch.py|s/    except Exception as e:   # GraphQLError, or the helper missing: REST, as before/    except ImportError as e:/|check-gh-graphql.sh
LR098 renamed|product/tools/gh_graphql.py|s/x.get("changeType") in ("RENAMED", "COPIED") for x in fs\["nodes"\])/False for x in fs["nodes"])/|check-gh-graphql.sh
LR098 complete|product/tools/gh_graphql.py|s/e\["comments_complete"\] = p\["comments"\]\["totalCount"\] <= COMMENTS/e["comments_complete"] = True/|check-gh-graphql.sh
LR098 prwcache|product/tools/proof-read-watch.py|s/        if name in self.cache:/        if False:/|check-gh-graphql.sh
LR098 prwpart|product/tools/proof-read-watch.py|s/            if e.get("comments_complete"):/            if True:/|check-gh-graphql.sh
LR098 prwfile|product/tools/proof-read-watch.py|s/            if e.get("files") is not None:/            if True:/|check-gh-graphql.sh
LR098 prwfixture|product/tools/proof-read-watch.py|s/        if self.fixture and not self.gql:/        if False:/|check-gh-graphql.sh
LR098 fmfiles|product/tools/flow-measure.py|s/    if e and e.get("files") is not None and e.get("labeled_complete"):/    if e:/|check-gh-graphql.sh
LR098 fmlabel|product/tools/flow-measure.py|s/for x in e\["labeled"\] if x\["label"\] == "review: approved"\]/for x in e["labeled"]]/|check-gh-graphql.sh
LR098 labeled|product/tools/gh_graphql.py|s/e\["labeled_complete"\] = p\["timelineItems"\].get("totalCount", LABELS + 1) <= LABELS/e["labeled_complete"] = False/|check-gh-graphql.sh
LR098 nocount|product/tools/gh_graphql.py|s/.get("totalCount", LABELS + 1) <= LABELS/.get("totalCount", 0) <= LABELS/|check-gh-graphql.sh
LR098 oneline|product/tools/gh_graphql.py|s/raise GraphQLError(" ".join(str(why or r.stderr.strip() or r.stdout.strip() or "gh exit %d" % r.returncode).split())\[:200\])/raise GraphQLError(str(why or r.stderr.strip() or r.stdout.strip() or "gh exit %d" % r.returncode)[:200])/|check-gh-graphql.sh
LR098 sleline|product/tools/sle-watch.py|s/    if snap.get("github"):   # LR-098/    if False:   # LR-098/|check-gh-graphql.sh
LR098 fmcomments|product/tools/flow-measure.py|s/    if e.get("comments_complete"):/    if e:/|check-gh-graphql.sh
LR098 fmfail|product/tools/flow-measure.py|s/        GITHUB.append("REST: GraphQL not used (%s)" % " ".join(str(e).split())\[:80\])/        raise/|check-gh-graphql.sh'
