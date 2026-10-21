#!/bin/sh
# run_check.sh <worktree of bcs/integ> <build dir>: builds the C++ cores outside Unreal (gcc and clang, strict FP)
# and diffs every number they print against the game's own JS run in Node. Prints the count of differing values.
set -e
WT="$1"; OUT="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"; SRC="$HERE/../../Source/LegendRising"
mkdir -p "$OUT"
INC="-I$SRC -I$SRC/Ball -I$SRC/Strike"
CORE="$SRC/Ball/LRDetMath.cpp $SRC/Ball/LRBallCore.cpp"
STRIKE="$SRC/Strike/LRStrikeSolver.cpp $SRC/Strike/LRShotMeter.cpp"
for T in ball strike; do
  if [ "$T" = ball ]; then FILES="$CORE"; else FILES="$CORE $STRIKE"; fi
  [ -f "$HERE/core_check_$T.cpp" ] || continue
  g++ -std=c++17 -O2 -ffp-contract=off -Wall -Wextra -Wshadow -Wno-unknown-pragmas $INC $FILES "$HERE/core_check_$T.cpp" -o "$OUT/${T}_gcc"
  clang++ -std=c++17 -O2 -Wall -Wextra -Wshadow $INC $FILES "$HERE/core_check_$T.cpp" -o "$OUT/${T}_clang"
  node "$HERE/${T}_trace.mjs" "$WT" > "$OUT/${T}_js.txt"
  "$OUT/${T}_gcc" > "$OUT/${T}_gcc.txt"; "$OUT/${T}_clang" > "$OUT/${T}_clang.txt"
  for C in gcc clang; do
    N=$(diff "$OUT/${T}_js.txt" "$OUT/${T}_$C.txt" | grep -c '^<' || true)
    echo "$T/$C: $(wc -l < "$OUT/${T}_js.txt") lines, $N differ"
  done
done
