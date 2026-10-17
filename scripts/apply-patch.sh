#!/usr/bin/env bash
# electron-voice-input — asar patcher for macOS / Linux
#
# Usage:
#   ./apply-patch.sh "<path-to-app.asar>" "<html-inside-asar>" "<js-dest-inside-asar>"
#
# Example:
#   ./apply-patch.sh "/Applications/MyApp.app/Contents/Resources/app.asar" \
#                    "dist/index.html" "dist/voice-input.js"
#
# A backup (app.asar.bak) is always created. Requires Node.js + npx.

set -euo pipefail

ASAR="${1:-}"
HTML_REL="${2:-}"
JS_REL="${3:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_JS="$SCRIPT_DIR/../src/voice-input.js"

if [[ -z "$ASAR" || -z "$HTML_REL" || -z "$JS_REL" ]]; then
  echo "Usage: $0 <app.asar> <html-inside-asar> <js-dest-inside-asar>" >&2
  exit 1
fi

if [[ ! -f "$ASAR" ]]; then echo "Not found: $ASAR" >&2; exit 1; fi
if [[ ! -f "$SRC_JS" ]]; then echo "Missing source: $SRC_JS" >&2; exit 1; fi
command -v npx >/dev/null 2>&1 || { echo "npx (Node.js) is required." >&2; exit 1; }

echo "=== electron-voice-input ==="
echo "asar      : $ASAR"

if grep -qa "voice-input.js" "$ASAR"; then
  echo "This archive is already patched. Nothing to do." >&2
  exit 1
fi

BAK="${ASAR}.bak"
cp -f "$ASAR" "$BAK"
echo "backup    : $BAK"

TMP="$(mktemp -d)"
NEW_ASAR="$(mktemp)"
trap 'rm -rf "$TMP" "$NEW_ASAR"' EXIT

echo "extracting..."
npx --yes @electron/asar extract "$ASAR" "$TMP"

mkdir -p "$(dirname "$TMP/$JS_REL")"
cp -f "$SRC_JS" "$TMP/$JS_REL"
echo "added     : $JS_REL"

if [[ ! -f "$TMP/$HTML_REL" ]]; then
  echo "HTML entry not found inside archive: $HTML_REL" >&2
  exit 1
fi

if ! grep -q "voice-input.js" "$TMP/$HTML_REL"; then
  # insert the script tag just before </body>
  python3 - "$TMP/$HTML_REL" <<'PY'
import sys
p = sys.argv[1]
s = open(p, encoding="utf-8").read()
if "voice-input.js" not in s:
    s = s.replace("</body>", '  <script src="./voice-input.js"></script>\n</body>')
    open(p, "w", encoding="utf-8", newline="").write(s)
PY
  echo "injected  : <script> into $HTML_REL"
fi

echo "repacking..."
npx --yes @electron/asar pack "$TMP" "$NEW_ASAR"

OLD_SIZE=$(wc -c < "$ASAR")
NEW_SIZE=$(wc -c < "$NEW_ASAR")
if [[ "$NEW_SIZE" -lt $((OLD_SIZE * 9 / 10)) ]]; then
  echo "Repacked archive looks too small ($NEW_SIZE vs $OLD_SIZE). Aborted." >&2
  exit 1
fi

cp -f "$NEW_ASAR" "$ASAR"
echo "OK — patched ($OLD_SIZE -> $NEW_SIZE bytes)"
echo "Rollback: cp \"$BAK\" \"$ASAR\""
