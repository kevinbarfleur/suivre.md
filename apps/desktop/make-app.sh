#!/usr/bin/env bash
# Bundle the menu-bar agent into a proper .app (LSUIElement, ad-hoc signed).
# A real bundle gives a stable identity so the Input Monitoring grant for the
# double-Command hotkey sticks, and a strict local-networking ATS exception.
set -euo pipefail
cd "$(dirname "$0")"

swift build -c release

APP="build/suivre.app"
BIN=".build/release/suivre-desktop"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN" "$APP/Contents/MacOS/suivre-desktop"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>suivre</string>
  <key>CFBundleDisplayName</key><string>suivre</string>
  <key>CFBundleIdentifier</key><string>md.suivre.desktop</string>
  <key>CFBundleExecutable</key><string>suivre-desktop</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key><string>md.suivre.desktop</string>
      <key>CFBundleURLSchemes</key><array><string>suivre</string></array>
    </dict>
  </array>
  <key>NSHumanReadableCopyright</key><string>suivre.md</string>
</dict>
</plist>
PLIST

codesign --force --sign - "$APP"
echo "Built $APP"
