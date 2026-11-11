#!/usr/bin/env bash
# Builds the Google Play version: android/build/DropHavoc.aab (Android App Bundle), signed with the owner's UPLOAD key.
# Differences from the sideloaded APK (build.sh): no REQUEST_INSTALL_PACKAGES and no APK self-update (Play policy:
# a Play app updates only through Play); meta-data drophavoc.store=play makes the app send shell updates to Play.
# Game-file updates (JavaScript in the WebView, app/files.json) stay: Play allows interpreted code in a WebView.
#
#   UPLOAD_KEYSTORE=/path/upload.jks UPLOAD_KS_PASS=... [UPLOAD_ALIAS=upload] bash android/build-aab.sh
# Needs what build.sh needs, plus aapt2 and bundletool (BUNDLETOOL=/path/bundletool-all.jar).
set -euo pipefail
cd "$(dirname "$0")"
: "${UPLOAD_KEYSTORE:?set UPLOAD_KEYSTORE to the upload key (.jks) - kept outside the repo}"
: "${UPLOAD_KS_PASS:?set UPLOAD_KS_PASS}"
UPLOAD_ALIAS=${UPLOAD_ALIAS:-upload}
BUNDLETOOL=${BUNDLETOOL:-bundletool-all.jar}
ANDROID_JAR=${ANDROID_JAR:-${ANDROID_HOME:-/workspace/android-sdk}/platforms/android-34/android.jar}
[ -f "$ANDROID_JAR" ] || ANDROID_JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
[ -f "$BUNDLETOOL" ] || { echo "bundletool jar not found: $BUNDLETOOL (https://github.com/google/bundletool/releases)"; exit 1; }

# 1. the game bundle (assets/www + files.json) comes from build.sh
bash build.sh >/dev/null
A=build/aab; rm -rf "$A"; mkdir -p "$A/gen" "$A/classes" "$A/module/manifest" "$A/module/dex"

# 2. Play manifest: drop the self-update pieces, mark the store, then refuse to continue if they remain
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { playManifest } from './play-manifest.mjs';
writeFileSync('build/aab/AndroidManifest.xml', playManifest(readFileSync('AndroidManifest.xml', 'utf8')));
"
bash check-play-manifest.sh build/aab/AndroidManifest.xml

# 3. resources in protobuf form (what bundles carry), Java, dex
aapt2 compile --dir res -o "$A/res.zip"
aapt2 link --proto-format -o "$A/base.apk" -I "$ANDROID_JAR" --manifest "$A/AndroidManifest.xml" \
  -A build/assets --java "$A/gen" --auto-add-overlay "$A/res.zip"
javac -nowarn --release 8 -cp "$ANDROID_JAR" -d "$A/classes" $(find src "$A/gen" -name '*.java' ! -name UpdateProvider.java) 2> "$A/javac.log" || { cat "$A/javac.log"; exit 1; }
if command -v dalvik-exchange >/dev/null 2>&1; then
  dalvik-exchange --dex --output="$A/module/dex/classes.dex" "$A/classes"
else
  (cd "$A/classes" && jar cf ../classes.jar .); d8 --lib "$ANDROID_JAR" --min-api 21 --output "$A/module/dex" "$A/classes.jar"
fi

# 4. module layout: manifest/, dex/, res/, assets/, resources.pb  ->  base.zip  ->  .aab
(cd "$A" && mkdir -p unz && cd unz && unzip -q ../base.apk)
bash check-play-manifest.sh "$A/unz/AndroidManifest.xml"
mv "$A/unz/AndroidManifest.xml" "$A/module/manifest/"
mv "$A/unz/resources.pb" "$A/module/"
[ -d "$A/unz/res" ] && mv "$A/unz/res" "$A/module/"
[ -d "$A/unz/assets" ] && mv "$A/unz/assets" "$A/module/"
(cd "$A/module" && zip -qr -0 ../base.zip assets && zip -qr ../base.zip . -x 'assets/*')
rm -f build/DropHavoc.aab
java -jar "$BUNDLETOOL" build-bundle --modules="$A/base.zip" --output=build/DropHavoc.aab
jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$UPLOAD_KEYSTORE" -storepass "$UPLOAD_KS_PASS" build/DropHavoc.aab "$UPLOAD_ALIAS" >/dev/null
jarsigner -verify build/DropHavoc.aab | tail -1
echo "Built $(pwd)/build/DropHavoc.aab ($(du -h build/DropHavoc.aab | cut -f1)) - upload this in Play Console"
