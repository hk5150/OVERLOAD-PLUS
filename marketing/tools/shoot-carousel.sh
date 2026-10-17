#!/bin/bash
# カルーセル(フィード用 4:5、1080×1350)の各枚を JPEG にする。carousel.html の <section class="scene"> を ?s=N で1枚ずつ
# Chrome のヘッドレスで撮り、<フォルダ>/out/1.jpg〜N.jpg と、確認用の横並び <フォルダ>/sheet.png を作る。
# 予約に入れるときは out/*.jpg と caption.txt を、予約フォルダの中の番号のフォルダ(例 予約/JP/0014/)にコピーする。
# 使い方: shoot-carousel.sh <カルーセルのフォルダ>(手本は ~/Desktop/KURABELL-reels/carousel/c1-basics/)
set -euo pipefail
dir="$(cd "$1" && pwd)"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
n=$(grep -c 'class="scene' "$dir/carousel.html")
mkdir -p "$dir/out"; rm -f "$dir"/out/*.png "$dir"/out/*.jpg
for k in $(seq 1 "$n"); do
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
    --window-size=1080,1350 --screenshot="$dir/out/$k.png" "file://$dir/carousel.html?s=$k" >/dev/null 2>&1
  sips -s format jpeg -s formatOptions 92 "$dir/out/$k.png" --out "$dir/out/$k.jpg" >/dev/null
  rm -f "$dir/out/$k.png"
done
inputs=(); fc=""; st=""
for k in $(seq 1 "$n"); do inputs+=(-i "$dir/out/$k.jpg"); fc+="[$((k-1)):v]scale=360:450[a$k];"; st+="[a$k]"; done
ffmpeg -loglevel error -y "${inputs[@]}" -filter_complex "${fc}${st}hstack=inputs=$n" "$dir/sheet.png"
echo "$dir/sheet.png ($n slides)"
