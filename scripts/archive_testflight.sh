#!/bin/sh
set -eu

: "${ASC_KEY_ID:?ASC_KEY_ID is required}"
: "${ASC_ISSUER_ID:?ASC_ISSUER_ID is required}"
: "${ASC_KEY_PATH:?ASC_KEY_PATH is required}"
: "${RELEASE_BUNDLE_ID:?RELEASE_BUNDLE_ID is required}"
: "${RELEASE_WIDGET_BUNDLE_ID:?RELEASE_WIDGET_BUNDLE_ID is required}"
: "${RELEASE_APP_GROUP_ID:?RELEASE_APP_GROUP_ID is required}"
: "${RELEASE_APP_PROFILE:?RELEASE_APP_PROFILE is required}"
: "${RELEASE_WIDGET_PROFILE:?RELEASE_WIDGET_PROFILE is required}"
: "${RELEASE_VERSION:?RELEASE_VERSION is required}"
: "${RELEASE_BUILD_NUMBER:?RELEASE_BUILD_NUMBER is required}"

case "$RELEASE_BUNDLE_ID" in
    com.CHULANOV.UniShare|com.CHULANOV.UniShare.*|*placeholder*|*example*)
        echo "Refusing to upload to the App Store record suspended under Guideline 5.6" >&2
        exit 1
        ;;
esac
case "$RELEASE_WIDGET_BUNDLE_ID" in
    "$RELEASE_BUNDLE_ID".Widget) ;;
    *) echo "Widget bundle ID must be ${RELEASE_BUNDLE_ID}.Widget" >&2; exit 1 ;;
esac
case "$RELEASE_APP_GROUP_ID" in
    group."$RELEASE_BUNDLE_ID") ;;
    *) echo "App Group must be group.${RELEASE_BUNDLE_ID}" >&2; exit 1 ;;
esac
case "$RELEASE_VERSION" in *[!0-9.]|.*|*.) echo "Invalid release version" >&2; exit 1;; esac
case "$RELEASE_BUILD_NUMBER" in ''|*[!0-9]*) echo "Invalid build number" >&2; exit 1;; esac
[ -f "$ASC_KEY_PATH" ] || { echo "App Store Connect API key file does not exist" >&2; exit 1; }
[ -s Config/Secrets.xcconfig ] || { echo "Config/Secrets.xcconfig is missing or empty" >&2; exit 1; }

make test-static

export DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
WORK_DIR=${RUNNER_TEMP:-${TMPDIR:-/tmp}}/unishare-release-$(date +%Y%m%d%H%M%S)-$$
ARCHIVE_PATH=${ARCHIVE_PATH:-"$WORK_DIR/UniShare.xcarchive"}
EXPORT_OPTIONS=${EXPORT_OPTIONS:-"$WORK_DIR/ExportOptions.plist"}

mkdir -p "$WORK_DIR"
[ ! -e "$ARCHIVE_PATH" ] || { echo "Archive path already exists: $ARCHIVE_PATH" >&2; exit 1; }

RELEASE_IDENTITY=Config/ReleaseIdentity.xcconfig
RELEASE_IDENTITY_BACKUP="$WORK_DIR/ReleaseIdentity.original.xcconfig"
if [ -e "$RELEASE_IDENTITY" ]; then
    cp "$RELEASE_IDENTITY" "$RELEASE_IDENTITY_BACKUP"
fi
cleanup() {
    if [ -e "$RELEASE_IDENTITY_BACKUP" ]; then
        cp "$RELEASE_IDENTITY_BACKUP" "$RELEASE_IDENTITY"
    else
        rm -f "$RELEASE_IDENTITY"
    fi
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

cat > "$RELEASE_IDENTITY" <<EOF
UNISHARE_APP_BUNDLE_ID = $RELEASE_BUNDLE_ID
UNISHARE_WIDGET_BUNDLE_ID = $RELEASE_WIDGET_BUNDLE_ID
APP_GROUP_ID = $RELEASE_APP_GROUP_ID
UNISHARE_APP_PROFILE = $RELEASE_APP_PROFILE
UNISHARE_WIDGET_PROFILE = $RELEASE_WIDGET_PROFILE
MARKETING_VERSION = $RELEASE_VERSION
CURRENT_PROJECT_VERSION = $RELEASE_BUILD_NUMBER
EOF

xcodegen generate --spec project.yml

xcodebuild archive \
    -project UniShare.xcodeproj \
    -scheme UniShare \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    -archivePath "$ARCHIVE_PATH" \
    CODE_SIGN_STYLE=Manual

cat > "$EXPORT_OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>upload</string>
<key>signingStyle</key><string>manual</string>
<key>signingCertificate</key><string>Apple Distribution</string>
<key>teamID</key><string>FLSHXRH925</string>
<key>provisioningProfiles</key><dict>
<key>${RELEASE_BUNDLE_ID}</key><string>${RELEASE_APP_PROFILE}</string>
<key>${RELEASE_WIDGET_BUNDLE_ID}</key><string>${RELEASE_WIDGET_PROFILE}</string>
</dict>
<key>uploadSymbols</key><true/>
<key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST

xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS" \
    -allowProvisioningUpdates \
    -authenticationKeyPath "$ASC_KEY_PATH" \
    -authenticationKeyID "$ASC_KEY_ID" \
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
