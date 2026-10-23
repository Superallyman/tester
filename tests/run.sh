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
status=0
for f in "${files[@]}"; do
  echo "=== $f"
  npx tsx --env-file=.env.local "$f" 2>&1 | grep -v "Skipping host requirements" || true
  [ "${PIPESTATUS[0]}" -eq 0 ] || status=1
done
[ $status -eq 0 ] && echo "=== all test files passed" || echo "=== SOME TESTS FAILED"
exit $status
