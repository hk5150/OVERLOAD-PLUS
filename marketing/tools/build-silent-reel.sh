#!/bin/bash
# ナレーションなしのリール(文字 + テーマソング、15〜20秒)を作る。2026-10-10 から新しいリールはこの型。
# 使い方: build-silent-reel.sh <リールのフォルダ> <出力ファイル(絶対パスで。相対だと <フォルダ> の中に出る)>
#   <フォルダ>/reel.html     場面を <section class="scene" id="s1"> … で並べる(既存のリールと同じ。?s=N でその場面だけ出る)
#   <フォルダ>/durations.txt  場面ごとの秒数を1行ずつ(無ければ 1場面目 2.5秒、ほか 3.5秒、最後 2.5秒)
# 1場面目は「動きのある写真 + 結論の予告」にする(文字だけの見出し画面から始めない。視聴が最初の数秒で離れていたため)。
# 文字は読み上げないので、1場面あたり日本語 25字・英語 12語くらいまで。合計は 15〜20秒に収める。
set -euo pipefail
dir="$(cd "$1" && pwd)"; out="$2"
# 素材(テーマソング)は制作フォルダにある。REELS で変えられる
REELS="${REELS:-$HOME/Desktop/KURABELL-reels}"
bgm="$REELS/theme/kurabell-theme.mp3"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cd "$dir"

n=$(grep -c 'class="scene' reel.html)
mkdir -p frames
for k in $(seq 1 "$n"); do
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
    --window-size=1080,1920 --screenshot="$dir/frames/s$k.png" "file://$dir/reel.html?s=$k" >/dev/null 2>&1
done

durs=()
if [ -f durations.txt ]; then
  while read -r d; do [ -n "$d" ] && durs+=("$d"); done < durations.txt
  [ "${#durs[@]}" -eq "$n" ] || { echo "durations.txt の行数(${#durs[@]})と場面の数($n)が違う" >&2; exit 1; }
else
  for k in $(seq 1 "$n"); do
    if [ "$k" -eq 1 ] || [ "$k" -eq "$n" ]; then durs+=("2.5"); else durs+=("3.5"); fi
  done
fi
total=$(IFS=+; echo "${durs[*]}" | bc)

inputs=(); vf=""; vin=""
for i in $(seq 0 $((n - 1))); do
  k=$((i + 1))
  frames=$(printf "%.0f" "$(echo "${durs[$i]} * 30" | bc)")
  # -loop 1 にしない。zoompan は入力1コマから d コマを作るので、ループ入力だと場面が数十倍に伸び、1場面目だけの動画になる(2026-10-10 に踏んだ)
  inputs+=(-i "frames/s$k.png")
  # 静止画のままにしない。1場面目は少し強めにズームして「動き」を出す
  z=$([ "$k" -eq 1 ] && echo 0.0012 || echo 0.0004)
  vf+="[$i:v]scale=2160:3840,zoompan=z='1+$z*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$frames:s=1080x1920:fps=30,setsar=1[v$k];"
  vin+="[v$k]"
done
fade_st=$(echo "$total - 1.2" | bc)

ffmpeg -loglevel error -y "${inputs[@]}" -i "$bgm" -filter_complex "\
${vf}${vin}concat=n=$n:v=1:a=0,format=yuv420p[v];\
[$n:a]atrim=0:${total},afade=t=in:d=0.3,afade=t=out:st=${fade_st}:d=1.2,aresample=48000,alimiter=limit=0.95:level=disabled[a]" \
  -map "[v]" -map "[a]" -t "$total" \
  -c:v libx264 -profile:v high -crf 19 -r 30 -c:a aac -b:a 192k -movflags +faststart \
  "$out"
echo "scenes=$n total=${total}s"
