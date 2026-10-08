#!/bin/bash
# iOS 版をアーカイブして TestFlight へアップロードする。
# 認証は App Store Connect の API キーで行う(Xcode の Apple Account のサインインが切れていても通る)。
#
#   npm run ios:upload              # テスト → www 生成 → cap sync → アーカイブ → アップロード
#   npm run ios:upload -- --dry-run # アップロードせず、書き出し(署名)までで止める。認証の確認用
#
# キーはリポジトリに置かない。~/.appstoreconnect/kurabell.json の keyId / issuerId と、
# ~/.appstoreconnect/private_keys/AuthKey_<keyId>.p8 を使う(指標を取る日次ルーティンと同じキー)。
# 版番号(MARKETING_VERSION / CURRENT_PROJECT_VERSION)は先に上げておくこと。同じ番号は二度上げられない。
set -euo pipefail
cd "$(dirname "$0")/.."

DRY=0
[ "${1:-}" = "--dry-run" ] && DRY=1

CFG="$HOME/.appstoreconnect/kurabell.json"
KEY_ID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).keyId)' "$CFG")
ISSUER=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).issuerId)' "$CFG")
KEY="$HOME/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8"
[ -f "$KEY" ] || { echo "API キーが見つからない: $KEY" >&2; exit 1; }
AUTH=(-allowProvisioningUpdates -authenticationKeyPath "$KEY" -authenticationKeyID "$KEY_ID" -authenticationKeyIssuerID "$ISSUER")

PBX=ios/App/App.xcodeproj/project.pbxproj
VER=$(grep -m1 'MARKETING_VERSION = ' "$PBX" | sed 's/.*= \(.*\);/\1/')
BUILD=$(grep -m1 'CURRENT_PROJECT_VERSION = ' "$PBX" | sed 's/.*= \(.*\);/\1/')
echo "== KURABELL ${VER} (${BUILD}) $([ $DRY = 1 ] && echo '[dry-run]')"

# cap sync は、node_modules がシンボリックリンクの worktree だと Podfile にリンク先の実パスを書き込む。
# アーカイブ中はそのままにして(戻すと Pods と食い違って失敗する)、終わったら戻す
restore_podfile() { git diff --quiet -- ios/App/Podfile ios/App/Podfile.lock 2>/dev/null || git checkout -- ios/App/Podfile ios/App/Podfile.lock; }
trap restore_podfile EXIT

npm test --silent
npm run sync-www
LANG=en_US.UTF-8 npx cap sync ios

ARCH="$HOME/Library/Developer/Xcode/Archives/$(date +%Y-%m-%d)/KURABELL ${VER} (${BUILD}).xcarchive"
rm -rf "$ARCH"
(cd ios/App && xcodebuild archive -workspace App.xcworkspace -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCH" "${AUTH[@]}" -quiet)

OPTS=ios/ExportOptions.plist
OUT="/tmp/kurabell-export-${BUILD}"
if [ $DRY = 1 ]; then
  OPTS=$(mktemp -t kurabell-export).plist
  cp ios/ExportOptions.plist "$OPTS"
  /usr/libexec/PlistBuddy -c "Set :destination export" "$OPTS"
fi
rm -rf "$OUT"
xcodebuild -exportArchive -archivePath "$ARCH" -exportOptionsPlist "$OPTS" -exportPath "$OUT" "${AUTH[@]}"
echo "== 完了: ${VER} (${BUILD}) $([ $DRY = 1 ] && echo "を $OUT に書き出した(アップロードはしていない)" || echo 'をアップロードした')"

# アップロードした後は、TestFlight で使えるようになるまで待って、appstore/<版>/testflight_*.txt があれば「テスト内容」を入れる
if [ $DRY = 0 ]; then
  node scripts/asc/testflight.mjs "$BUILD" --wait --apply || echo "TestFlight の後処理は失敗した(アップロード自体は済んでいる): node scripts/asc/testflight.mjs $BUILD --wait --apply で再実行できる"
fi
