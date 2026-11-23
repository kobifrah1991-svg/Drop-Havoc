#!/usr/bin/env bash
# Builds DropHavoc.apk (offline practice vs bots) from the web game.
# Needs (Debian/Ubuntu): aapt dalvik-exchange zipalign apksigner android-sdk-platform-23 openjdk-17-jdk-headless, plus Node.js.
set -euo pipefail
cd "$(dirname "$0")"
# Compile against Android 36, the same API as android:targetSdkVersion in AndroidManifest.xml.
ANDROID_JAR=${ANDROID_JAR:-${ANDROID_HOME:-/workspace/android-sdk}/platforms/android-36/android.jar}
if [ ! -f "$ANDROID_JAR" ]; then ANDROID_JAR=/usr/lib/android-sdk/platforms/android-36/android.jar; fi
if [ ! -f "$ANDROID_JAR" ]; then ANDROID_JAR=/usr/lib/android-sdk/platforms/android-23/android.jar; fi
OUT=build
# Prefer Google cmdline SDK + Temurin 17 when Debian aapt/dx are missing (Java 21 breaks d8 here).
if [ -d /workspace/android-sdk/build-tools/34.0.0 ]; then
  export PATH="/workspace/android-sdk/build-tools/34.0.0:$PATH"
fi
if [ -z "${JAVA_HOME:-}" ] && [ -x /workspace/androidtools/jdk/bin/java ]; then
  export JAVA_HOME=/workspace/androidtools/jdk
  export PATH="$JAVA_HOME/bin:$PATH"
fi


rm -rf "$OUT" && mkdir -p "$OUT/assets/www" "$OUT/gen" "$OUT/classes"

# 1. Bundle the game into one classic script (WebView can't load ES modules from file://)
ln -sfn ../shared ../public/shared
trap 'rm -f ../public/shared' EXIT
npx --prefix .. esbuild entry.js --bundle --format=iife --minify --target=es2020 --loader:.glb=dataurl --loader:.hdr=dataurl --log-level=warning --outfile="$OUT/assets/www/game.js"
python3 - <<'PY'
import re
s = open('../public/index.html', encoding='utf-8').read()
s = re.sub(r'\s*<script type="importmap">.*?</script>', '', s, flags=re.S)
s = s.replace('<script type="module" src="client.js"></script>', '<script src="game.js"></script>')
open('build/assets/www/index.html', 'w', encoding='utf-8').write(s)
PY
cp ../public/style.css "$OUT/assets/www/"
cp -r ../public/icons "$OUT/assets/www/icons"  # 0.16.28: action button icons
cp -r ../public/img "$OUT/assets/www/img"      # 0.16.28: Scitedra logo
cp -r ../public/fonts "$OUT/assets/www/fonts"  # 0.16.66: Black Ops One for the game logo (OFL)
mkdir -p "$OUT/assets/www/vendor" && cp ../node_modules/peerjs/dist/peerjs.min.js "$OUT/assets/www/vendor/"  # friend rooms (WebRTC)

# 1b. 0.16.53 files.json: the list the app uses to update its game files by itself (published as <site>/app/)
python3 - <<'PY'
import hashlib, json, os, re
root = 'build/assets/www'
ver = re.search(r'versionName="([^"]+)"', open('AndroidManifest.xml').read()).group(1)
shell = int(re.search(r'versionCode="(\d+)"', open('AndroidManifest.xml').read()).group(1))
files = []
for d, _, names in os.walk(root):
    for n in sorted(names):
        full = os.path.join(d, n); rel = os.path.relpath(full, root).replace(os.sep, '/')
        if rel == 'files.json': continue
        b = open(full, 'rb').read()
        files.append({'path': rel, 'size': len(b), 'sha256': hashlib.sha256(b).hexdigest()})
json.dump({'version': ver, 'shell': shell, 'files': sorted(files, key=lambda f: f['path'])}, open(root + '/files.json', 'w'), indent=0)
PY

# 2. Resources + manifest, Java, dex
aapt package -f -m -M AndroidManifest.xml -S res -I "$ANDROID_JAR" -J "$OUT/gen" -A "$OUT/assets" -F "$OUT/unsigned.apk"
javac -nowarn --release 8 -cp "$ANDROID_JAR" -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java') 2> "$OUT/javac.log" || { cat "$OUT/javac.log"; exit 1; }
if command -v dalvik-exchange >/dev/null 2>&1; then
  dalvik-exchange --dex --output="$OUT/classes.dex" "$OUT/classes"
else
  # Google build-tools (needs Java 17; Java 21 + loose .class files can NPE)
  (cd "$OUT/classes" && jar cf ../classes.jar .)
  d8 --lib "$ANDROID_JAR" --min-api 21 --output "$OUT" "$OUT/classes.jar"
fi
(cd "$OUT" && aapt add -f unsigned.apk classes.dex >/dev/null)

# 3. Align and sign. The keystore and its passwords stay off git: env vars, or android/keystore.properties
# (see keystore.properties.example). This script does not generate a key.
prop() {
  local key="$1" file="$2" line
  [ -f "$file" ] || return 0
  line=$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 || true)
  line=${line#*=}
  printf '%s' "${line%$'\r'}"
}
KS=${DROP_HAVOC_KEYSTORE:-$(prop storeFile keystore.properties)}
KS_PASS=${DROP_HAVOC_KS_PASS:-$(prop storePassword keystore.properties)}
KEY_PASS=${DROP_HAVOC_KEY_PASS:-$(prop keyPassword keystore.properties)}
ALIAS=${DROP_HAVOC_KEY_ALIAS:-$(prop keyAlias keystore.properties)}
ALIAS=${ALIAS:-arena}
KEY_PASS=${KEY_PASS:-$KS_PASS}
if [ -z "$KS" ] || [ -z "$KS_PASS" ] || [ ! -f "$KS" ]; then
  echo "Sideload signing key not configured. Set DROP_HAVOC_KEYSTORE and DROP_HAVOC_KS_PASS, or create android/keystore.properties from keystore.properties.example. Do not commit the keystore or the passwords." >&2
  exit 1
fi
export DROP_HAVOC_KS_PASS="$KS_PASS"
export DROP_HAVOC_KEY_PASS="$KEY_PASS"
zipalign -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
apksigner sign --ks "$KS" --ks-pass env:DROP_HAVOC_KS_PASS --key-pass env:DROP_HAVOC_KEY_PASS --ks-key-alias "$ALIAS" --out DropHavoc.apk "$OUT/aligned.apk"
apksigner verify DropHavoc.apk && echo "Built $(pwd)/DropHavoc.apk ($(du -h DropHavoc.apk | cut -f1))"
