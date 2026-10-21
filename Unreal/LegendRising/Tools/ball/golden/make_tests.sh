#!/bin/sh
# make_tests.sh <worktree of bcs/integ>: regenerates Source/LegendRising/Tests/LRBallTests.cpp from the template and
# the golden numbers the game's own JS computes (golden_values.mjs).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
node "$HERE/golden_values.mjs" "$1" > "$HERE/golden.inc.tmp"
python3 - "$HERE/LRBallTests.template.cpp" "$HERE/golden.inc.tmp" "$HERE/../../Source/LegendRising/Tests/LRBallTests.cpp" <<'PY'
import sys
t = open(sys.argv[1]).read(); g = open(sys.argv[2]).read().rstrip("\n")
open(sys.argv[3], "w").write(t.replace("//GOLDEN//", g))
PY
rm -f "$HERE/golden.inc.tmp"
