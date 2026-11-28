# OS-35 (LR-046, P-302; FP #164): check-docs fails a STATE "updated:" time over 30 minutes ahead of the clock, even when
# it is already on the base (any other gap on the base still only warns). The m3 clean-up of #164 is #3847's (open).
MUT="$MUT"'
OS35 ahead|product/tools/check-docs.sh|s/^if ahead > 30: print/if False: print/|check-state-page.sh
OS35 base|product/tools/check-docs.sh|s/^  case "\$msg" in \*" min ahead of the clock "\*) mine=1;; esac$/  :/|check-state-page.sh'
