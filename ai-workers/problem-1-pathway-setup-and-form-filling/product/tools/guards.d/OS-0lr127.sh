# LR-127 (lab register, lane automation-measures-2, 28 Nov): a watch ends when its work does; watch-done.py is its end
# condition. Each row switches one ending off (or makes an unreadable state end a watch), so check-watch-done.sh must fail.
TESTS="$TESTS check-watch-done.sh"   # LR-127: watches end on merge or an empty queue
MUT="$MUT"'
LR127 merged|product/tools/watch-done.py|s/why = None if d\["state"\] == "open" else/why = None if True else/|check-watch-done.sh
LR127 queue|product/tools/watch-done.py|s/why = None if queued else/why = None if True else/|check-watch-done.sh
LR127 unread|product/tools/watch-done.py|s/        return 2$/        return 0/|check-watch-done.sh
LR127 log|product/tools/watch-done.py|s/            f.write(f"{now}\\t{what}\\t{why}\\n")/            pass/|check-watch-done.sh'
