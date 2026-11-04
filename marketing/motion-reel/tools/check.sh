#!/bin/bash
# 書き出したリールの「証拠」を作る。全編を何度も見直す代わりにこれを見て採点する。
# 使い方: check.sh <リールのフォルダ> [一番動きの速い秒(既定 6.0)]
# 出力(<フォルダ>/reviews/):
#   contact.jpg  2コマ/秒を10枚ずつ並べた一覧
#   strip.jpg    速い動きの前後12コマ(崩れ・塊・ちらつき探し)
#   phone.jpg    幅360pxに縮めた主要場面(スマホで読めるか)
#   loop.mp4     2回続けて再生(ループのつなぎ目)
#   決定性       同じ秒を2回描いてハッシュが一致するか
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dir="$(cd "$1" && pwd)"; fast="${2:-6.0}"
v="$dir/out/reel.mp4"; r="$dir/reviews"; mkdir -p "$r"

ffmpeg -nostdin -v error -y -i "$v" -vf "fps=2,scale=270:-2,tile=10x3" -frames:v 1 "$r/contact.jpg"
ffmpeg -nostdin -v error -y -ss "$(echo "$fast - 0.2" | bc)" -t 0.4 -i "$v" -vf "fps=30,scale=270:-2,tile=12x1" -frames:v 1 "$r/strip.jpg"
ffmpeg -nostdin -v error -y -i "$v" -vf "fps=1,scale=360:-2,tile=8x2" -frames:v 1 "$r/phone.jpg"
ffmpeg -nostdin -v error -y -stream_loop 1 -i "$v" -c copy "$r/loop.mp4"

cd "$r"
node "$here/render.cjs" "$dir/index.html" --stills 10 >/dev/null && mv still_10.jpg a.jpg
node "$here/render.cjs" "$dir/index.html" --stills 10 >/dev/null && mv still_10.jpg b.jpg
if cmp -s a.jpg b.jpg; then echo "決定性: OK(10秒目が2回とも同じ)"; else echo "決定性: NG(10秒目が描くたびに変わる。タイマーか Math.random が残っている)"; fi
rm -f a.jpg b.jpg
ffmpeg -nostdin -i "$v" -af ebur128=framelog=quiet -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | sed 's/^ */音量 /'
echo "見る: $r/contact.jpg strip.jpg phone.jpg"
