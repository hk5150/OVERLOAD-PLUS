#!/bin/zsh
# 毎朝 06:00 のダウンロード報告(launchd: scripts/asc/com.kurabell.downloads.plist)。
# API で KURABELL・HEART HIIT の日次DLを読み、Obsidian の Projects/app-downloads-daily.md を書き直して、Mac に通知を出す。
# ブラウザのサインインを使わないので、2段階認証では止まらない。
set -u
REPO="$HOME/OVERLOAD-PLUS"
NOTE="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Obsidian AI連携/Projects/app-downloads-daily.md"
LOG="$REPO/reports/downloads/run.log"
mkdir -p "$REPO/reports/downloads"
cd "$REPO" || exit 1
echo "=== $(date '+%F %T')" >> "$LOG"
if /usr/local/bin/node scripts/asc/downloads.mjs --days 14 --md > "$REPO/reports/downloads/latest.md" 2>> "$LOG"; then
  cp "$REPO/reports/downloads/latest.md" "$NOTE"
  # 最新のデータがある日の行を通知に出す
  LATEST=$(grep -o '最新のデータ: \*\*[^*]*' "$NOTE" | sed 's/.*\*\*//')
  ROW=$(grep "^| $LATEST |" "$NOTE" | sed 's/^| //; s/ |$//')
  /usr/bin/osascript -e "display notification \"$ROW(KURABELL | HEART HIIT、初回/再)\" with title \"ダウンロード報告 $LATEST\"" 2>> "$LOG"
  echo "ok latest=$LATEST" >> "$LOG"
else
  /usr/bin/osascript -e 'display notification "API の読み取りに失敗。reports/downloads/run.log を見てください" with title "ダウンロード報告 失敗"'
  echo "failed" >> "$LOG"
fi
