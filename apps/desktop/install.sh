#!/usr/bin/env bash
# Build and install the app into /Applications so Spotlight, Raycast, Launchpad
# and Finder launch it like any other app. Falls back to ~/Applications if
# /Applications isn't writable.
set -euo pipefail
cd "$(dirname "$0")"

./make-app.sh

SRC="build/suivre.app"
DEST_DIR="/Applications"
if [ ! -w "$DEST_DIR" ]; then
    DEST_DIR="$HOME/Applications"
    mkdir -p "$DEST_DIR"
fi
DEST="$DEST_DIR/suivre.app"

# Stop any running instance so we don't end up with two menu-bar items.
pkill -f "suivre.app/Contents/MacOS/suivre-desktop" 2>/dev/null || true
sleep 1

rm -rf "$DEST"
cp -R "$SRC" "$DEST"
echo "Installed $DEST"
open "$DEST"
