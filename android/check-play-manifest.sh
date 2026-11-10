#!/usr/bin/env bash
# Fails if a Play manifest (XML or the merged protobuf from aapt2) still asks to install APKs.
set -euo pipefail
file="${1:?manifest path}"
if [ ! -f "$file" ]; then
  echo "Play manifest not found: $file"
  exit 1
fi
if grep -a -q 'REQUEST_INSTALL_PACKAGES' "$file"; then
  echo "Play manifest must not contain REQUEST_INSTALL_PACKAGES: $file"
  exit 1
fi
if grep -a -q 'UpdateProvider' "$file"; then
  echo "Play manifest must not contain the APK self-updater: $file"
  exit 1
fi
echo "Play manifest ok: $file"
