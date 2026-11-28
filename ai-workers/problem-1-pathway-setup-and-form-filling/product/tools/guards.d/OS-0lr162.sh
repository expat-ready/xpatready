# LR-162 (file named OS-0lr162.sh: check-guards-d.sh reads only OS-<digits>…) (Lead 11 on #4017, 28 Nov): push-guard.sh
# runs image-size.sh --enforce. Each row switches one part of the call off, so check-push-guard-images.sh must then fail.
TESTS="$TESTS check-push-guard-images.sh"   # LR-162: the push guard refuses an image over 300 KB
MUT="$MUT"'
LR162 range|product/tools/push-guard.sh|s/img_out=\$(bash "\$GDIR\/image-size.sh" --enforce "\$range" 2>&1)/img_out=$(bash "$GDIR\/image-size.sh" "$range" 2>\&1)/|check-push-guard-images.sh
LR162 unpushed|product/tools/push-guard.sh|s/image-size.sh" --enforce --remote/image-size.sh" --remote/|check-push-guard-images.sh
LR162 closed|product/tools/push-guard.sh|s/^  elif \[ "\$img_rc" != 0 \]; then/  elif false; then/|check-push-guard-images.sh'
