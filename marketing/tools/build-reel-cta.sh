#!/bin/bash
# build-reel.sh(制作フォルダ)と同じ組み立てで、最後の場面(参考文献とロゴと検索の一文)にも声を入れる版。
# TikTok のストック見直し(2026-10-17)で「アップストアで、クラベルと検索。」を最後の場面で読み上げるために作った。
# <フォルダ>/audio/sN.mp3(N は最後の場面)があれば、最後の場面の長さは max(3秒, 声の長さ + 0.5秒) にして声を重ねる。
# 無ければ build-reel.sh と同じ(最後の場面は3秒・無音)。寄りは 2.5% で止める。
# 使い方: build-reel-cta.sh <リールのフォルダ> <出力ファイル>
set -euo pipefail
dir="$(cd "$1" && pwd)"; out="$2"
cd "$dir"

n=$(ls frames/s*.png | wc -l | tr -d ' ')
na=$((n - 1))
durs=()
for i in $(seq 1 $na); do
  a=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "audio/s$i.mp3")
  durs+=("$(echo "$a + 0.45" | bc)")
done
last_audio=""
if [ -f "audio/s$n.mp3" ]; then
  last_audio="audio/s$n.mp3"
  a=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$last_audio")
  durs+=("$(python3 -c "print(max(3.0, $a + 0.5))")")
else
  durs+=("3.0")
fi

inputs=(); vf=""; vin=""
for i in $(seq 0 $((n - 1))); do
  k=$((i + 1))
  frames=$(printf "%.0f" "$(echo "${durs[$i]} * 30" | bc)")
  inputs+=(-i "frames/s$k.png")
  vf+="[$i:v]scale=2160:3840,zoompan=z='min(1+0.00035*on,1.025)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$frames:s=1080x1920:fps=30,setsar=1[v$k];"
  vin+="[v$k]"
done

af=""; mixin=""; start=0; m=0
for i in $(seq 0 $((n - 1))); do
  k=$((i + 1))
  f="audio/s$k.mp3"
  if [ "$k" -eq "$n" ] && [ -z "$last_audio" ]; then break; fi
  ms=$(printf "%.0f" "$(echo "($start + 0.15) * 1000" | bc)")
  inputs+=(-i "$f")
  af+="[$((n + m)):a]adelay=${ms}|${ms},aresample=48000[a$k];"
  mixin+="[a$k]"
  m=$((m + 1))
  start=$(echo "$start + ${durs[$i]}" | bc)
done
total=0
for d in "${durs[@]}"; do total=$(echo "$total + $d" | bc); done

ffmpeg -nostdin -loglevel error -y "${inputs[@]}" -filter_complex "\
${vf}${vin}concat=n=$n:v=1:a=0,format=yuv420p[v];\
${af}${mixin}amix=inputs=$m:normalize=0,apad=whole_dur=${total},alimiter=limit=0.95[a]" \
  -map "[v]" -map "[a]" -t "$total" \
  -c:v libx264 -profile:v high -crf 19 -r 30 -c:a aac -b:a 192k -movflags +faststart \
  "$out"
echo "total=$total"
