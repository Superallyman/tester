#!/usr/bin/env bash
# Runs every tests/e2e/*.mts against a running dev server (TEST_BASE_URL, default http://localhost:3000)
# and the database in DATABASE_URL. Tests use throwaway claude-e2e*@e2e.invalid accounts and remove them.
# Pass file names to run only those: npm test -- tests/e2e/auth.mts
# The dev server compiles pages on first use and unloads idle ones after about a minute, so a page can take
# several seconds to appear mid-run; the tests wait up to 30 s for pages.
set -u
cd "$(dirname "$0")/.."
# On optotester-dev Chromium needs locally unpacked system libraries; see the headless browser notes
[ -f "$HOME/.cache/optotester-pw/env.sh" ] && . "$HOME/.cache/optotester-pw/env.sh"
unset NODE_PATH

files=("$@")
[ ${#files[@]} -eq 0 ] && files=(tests/e2e/*.mts)
base="${TEST_BASE_URL:-http://localhost:3000}"
# The dev server restarts itself when it nears its memory limit (likely on a small VM); wait until it answers
wait_for_server() {
  for _ in $(seq 60); do
    curl -s -o /dev/null -m 5 "$base/api/auth/providers" && return 0
    sleep 1
  done
  echo "dev server at $base is not answering"; return 1
}

status=0
for f in "${files[@]}"; do
  wait_for_server || exit 1
  echo "=== $f"
  out=$(npx tsx --env-file=.env.local "$f" 2>&1 | grep -v "Skipping host requirements"; exit "${PIPESTATUS[0]}")
  code=$?
  # A dropped connection means the dev server restarted mid-file (see above), not that a check failed:
  # wait for it and run the file once more, saying so
  if [ $code -ne 0 ] && grep -qE "ECONNRESET|socket hang up|ECONNREFUSED" <<<"$out"; then
    echo "$out" | grep -E "^(PASS|FAIL)" | tail -3
    echo "--- dev server dropped the connection (restart); running $f again"
    wait_for_server || exit 1
    out=$(npx tsx --env-file=.env.local "$f" 2>&1 | grep -v "Skipping host requirements"; exit "${PIPESTATUS[0]}")
    code=$?
  fi
  echo "$out"
  [ $code -eq 0 ] || status=1
done
[ $status -eq 0 ] && echo "=== all test files passed" || echo "=== SOME TESTS FAILED"
exit $status
