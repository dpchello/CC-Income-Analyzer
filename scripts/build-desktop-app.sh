#!/usr/bin/env bash
# build-desktop-app.sh — (re)build the Harvest desktop control app.
#
# Order matters: `osacompile` signs the bundle as it writes it, so the brand
# icon has to be dropped in BEFORE we (re-)sign. Doing it the other way —
# osacompile, then copy the icon over the signed bundle — is what left an
# earlier build with an invalid signature ("a sealed resource is missing or
# invalid", which Gatekeeper can reject as "damaged"). This script always
# re-signs as the LAST step.
#
# Builds to a temp path and swaps in atomically, so a failed build never leaves
# you without a working app.
#
#   scripts/build-desktop-app.sh                 # installs ~/Desktop/Harvest.app
#   scripts/build-desktop-app.sh /Applications/Harvest.app
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/Harvest.applescript"
ICON="$SCRIPT_DIR/Harvest.icns"
DEST="${1:-$HOME/Desktop/Harvest.app}"
TMP_DIR="$(mktemp -d)"
TMP_APP="$TMP_DIR/Harvest.app"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "→ compiling $SRC"
osacompile -o "$TMP_APP" "$SRC"

if [ -f "$ICON" ]; then
  echo "→ applying brand icon"
  cp "$ICON" "$TMP_APP/Contents/Resources/applet.icns"
fi

echo "→ re-signing (ad-hoc) so the seal covers the icon"
codesign --force --sign - "$TMP_APP"

echo "→ verifying seal"
codesign --verify --strict --verbose=2 "$TMP_APP"

echo "→ installing to $DEST"
rm -rf "$DEST"
mv "$TMP_APP" "$DEST"
touch "$DEST"   # nudge Finder to refresh the icon cache

echo "✓ Built and sealed: $DEST"
