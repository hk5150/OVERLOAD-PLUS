#!/bin/bash
# TikTok 用の動画の最後の場面(参考文献とロゴ、最後の3秒)に「筋トレ記録アプリ。App Storeで「KURABELL」と検索。」を入れる。
# TikTok の個人アカウントはフォロワー1,000人までプロフィールにリンクを貼れないので、「プロフィールのリンクから」の代わりに
# App Store での検索に誘導する(2026-10-15 北村さん)。ロゴの下にある既存の一文(「プロフィールのリンクから。」など)は塗りつぶして置き換える。
# 最後の場面は build-reel.sh が作る3秒(90コマ)の静止画+寄り。同じ寄りで作り直し、tiktok-safe.sh と同じ余白を付けて差し替える。音は元のまま。
# 使い方: tiktok-cta.sh <Instagram 用の元のリール mp4> <tiktok-safe.sh 済みの mp4> <出力の mp4>
set -euo pipefail
src="$1"; safe="$2"; out="$3"
work="$(mktemp -d)"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$src")
ffmpeg -loglevel error -y -ss "$(echo "$d - 2.99" | bc)" -i "$src" -frames:v 1 "$work/last.png"

# ロゴ(赤いアイコン)の位置から、一文の位置を決める(04 の元の HTML ではロゴの上端+118px)
top=$(python3 - "$work/last.png" <<'EOF'
import sys
import numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(int)
red = (a[:, :, 0] > 180) & (a[:, :, 1] < 90) & (a[:, :, 2] < 90)
ys = np.where(red.any(1))[0]
if not len(ys):
    sys.exit("最後の場面にロゴが見つからない")
print(ys.min() + 118)
EOF
)
cat > "$work/cta.html" <<EOF
<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:url(last.png) 0 0/1080px 1920px no-repeat}
body{color:#F2F0EB;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif}
.cover{position:absolute;left:0;right:0;top:$((top - 15))px;height:200px;background:rgb(18,20,22)}
.cta{position:absolute;left:72px;right:150px;top:${top}px;margin:0;font-size:44px;font-weight:800;line-height:1.5}
.cta em{font-style:normal;color:#E8B33C}
</style></head><body><div class="cover"></div><p class="cta">筋トレ記録アプリ。<br><em>App Storeで「KURABELL」と検索。</em></p></body></html>
EOF
"$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
  --window-size=1080,1920 --screenshot="$work/new.png" "file://$work/cta.html" >/dev/null 2>&1

n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$safe")
ffmpeg -loglevel error -y -i "$safe" -loop 1 -framerate 30 -t 3 -i "$work/new.png" -filter_complex "\
[0:v]trim=end_frame=$((n - 90)),setpts=PTS-STARTPTS[a];\
[1:v]scale=2160:3840,zoompan=z='min(1+0.00035*on,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=90:s=1080x1920:fps=30,trim=end_frame=90,\
scale=864:1536,pad=1080:1920:108:150:0x141517,setsar=1[b];\
[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]" \
  -map "[v]" -map 0:a -c:v libx264 -profile:v high -crf 19 -r 30 -c:a copy -movflags +faststart "$out"
echo "$out(確認用の最後の場面: $work/new.png)"
