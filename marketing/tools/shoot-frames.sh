#!/bin/bash
# リールの各場面を画像にする。reel.html の <section class="scene"> を ?s=N で1枚ずつ Chrome のヘッドレスで撮り、
# <フォルダ>/frames/s1.png〜sN.png と、確認用の横並び <フォルダ>/sheet.png を作る(sheet は目で見て文字のはみ出しを確かめる用)
# 使い方: shoot-frames.sh <リールのフォルダ>
set -euo pipefail
dir="$(cd "$1" && pwd)"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
n=$(grep -c 'class="scene' "$dir/reel.html")
mkdir -p "$dir/frames"; rm -f "$dir"/frames/s*.png
for k in $(seq 1 "$n"); do
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
    --window-size=1080,1920 --screenshot="$dir/frames/s$k.png" "file://$dir/reel.html?s=$k" >/dev/null 2>&1
done
inputs=(); fc=""; st=""
for k in $(seq 1 "$n"); do inputs+=(-i "$dir/frames/s$k.png"); fc+="[$((k-1)):v]scale=360:640[a$k];"; st+="[a$k]"; done
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "${fc}${st}hstack=inputs=$n" "$dir/sheet.png"
echo "$dir/sheet.png ($n scenes)"
