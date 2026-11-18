#!/usr/bin/env bash
# Build unsigned .app zip(s) from an official Electron darwin release, on Linux or macOS.
# Required env: APP_NAME (file/display name), APP_ID (bundle id)
# Optional: APP_SRC (folder with main.js + package.json, default desktop-mac)
#           ELECTRON_VERSION (default 33.2.1), ARCHS ("arm64 x64"), OUT_DIR (dist-mac)
set -euo pipefail
APP_NAME=${APP_NAME:?}
APP_ID=${APP_ID:?}
APP_SRC=${APP_SRC:-desktop-mac}
ELECTRON_VERSION=${ELECTRON_VERSION:-33.2.1}
ARCHS=${ARCHS:-arm64 x64}
OUT_DIR=${OUT_DIR:-dist-mac}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC="$ROOT/$APP_SRC"
test -f "$SRC/main.js"
test -f "$SRC/package.json"
if [ -d "$SRC/web" ]; then
  ASSET_DIR=web
elif [ -d "$SRC/app" ]; then
  ASSET_DIR=app
else
  echo "desktop source must contain web/ or app/" >&2
  exit 1
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
mkdir -p "$ROOT/$OUT_DIR"
# Include the first-run note next to the app inside each zip
NOTE="$WORKDIR/OPEN-ON-MAC.txt"
if [ -f "$SRC/OPEN-ON-MAC.txt" ]; then cp "$SRC/OPEN-ON-MAC.txt" "$NOTE"
elif [ -f "$(dirname "$0")/OPEN-ON-MAC.txt" ]; then cp "$(dirname "$0")/OPEN-ON-MAC.txt" "$NOTE"
else
  printf '%s\n' "Unsigned build. Right-click the app → Open." > "$NOTE"
fi

for arch in $ARCHS; do
  zipname="electron-v${ELECTRON_VERSION}-darwin-${arch}.zip"
  echo "Downloading $zipname"
  curl -fsSL -o "$WORKDIR/$zipname" "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/$zipname"
  stage="$WORKDIR/stage-$arch"
  mkdir -p "$stage"
  unzip -q "$WORKDIR/$zipname" -d "$stage"
  app="$stage/Electron.app"
  test -d "$app"
  rm -rf "$app/Contents/Resources/default_app.asar"
  mkdir -p "$app/Contents/Resources/app"
  # Copy the Electron app (main.js, package.json, web/)
  cp "$SRC/main.js" "$SRC/package.json" "$app/Contents/Resources/app/"
  cp -R "$SRC/$ASSET_DIR" "$app/Contents/Resources/app/$ASSET_DIR"
  # optional extras used by some existing desktop shells
  for extra in icon.png icon.ico servers.json preload.js; do
    [ -e "$SRC/$extra" ] && cp -R "$SRC/$extra" "$app/Contents/Resources/app/"
  done
  if [ -f "$SRC/OPEN-ON-MAC.txt" ]; then cp "$SRC/OPEN-ON-MAC.txt" "$app/Contents/Resources/app/"; fi

  # Rename the bundle and set identity keys without breaking Electron's executable name.
  plist="$app/Contents/Info.plist"
  if command -v plutil >/dev/null 2>&1; then
    plutil -replace CFBundleDisplayName -string "$APP_NAME" "$plist"
    plutil -replace CFBundleName -string "$APP_NAME" "$plist"
    plutil -replace CFBundleIdentifier -string "$APP_ID" "$plist"
  else
    python3 - "$plist" "$APP_NAME" "$APP_ID" <<'PY'
import pathlib, re, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text()
name, bid = sys.argv[2], sys.argv[3]
def repl(key, value, text):
    pat = rf'(<key>{re.escape(key)}</key>\s*<string>)([^<]*)(</string>)'
    if re.search(pat, text):
        return re.sub(pat, rf'\g<1>{value}\g<3>', text, count=1)
    return text
text = repl('CFBundleDisplayName', name, text)
text = repl('CFBundleName', name, text)
text = repl('CFBundleIdentifier', bid, text)
p.write_text(text)
PY
  fi
  dest="$stage/${APP_NAME}.app"
  mv "$app" "$dest"
  cp "$NOTE" "$stage/OPEN-ON-MAC.txt"
  slug=$(echo "$APP_NAME" | tr ' ' '-' | tr -d "/:")
  out="$ROOT/$OUT_DIR/${slug}-macos-${arch}-unsigned.zip"
  rm -f "$out"
  (
    cd "$stage"
    # -y keeps Electron's internal symlinks
    zip -qry "$out" "${APP_NAME}.app" OPEN-ON-MAC.txt
  )
  echo "Wrote $out ($(du -h "$out" | cut -f1))"
done
ls -la "$ROOT/$OUT_DIR"
