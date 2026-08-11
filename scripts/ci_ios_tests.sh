#!/bin/sh
set -eu

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
DERIVED_DATA=${DERIVED_DATA:-"$PWD/DerivedData/CI"}

xcodegen generate --spec project.yml

DEVICE_ID=$(xcrun simctl list devices available -j | \
    jq -r '[.devices[][] | select(.name | startswith("iPhone"))][0].udid')
[ -n "$DEVICE_ID" ] && [ "$DEVICE_ID" != null ] || {
    echo "No available iPhone simulator was found" >&2
    exit 1
}

xcodebuild test \
    -project UniShare.xcodeproj \
    -scheme UniShare \
    -destination "platform=iOS Simulator,id=$DEVICE_ID" \
    -derivedDataPath "$DERIVED_DATA" \
    CODE_SIGNING_ALLOWED=NO
