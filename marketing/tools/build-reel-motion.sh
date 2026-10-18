#!/bin/bash
# 動きのある場面(shoot-motion.js で撮った <フォルダ>/motion/sK/*.png)をつないで、ナレーションを重ねる(TikTok 13、2026-10-18)。
# 音の重ね方は build-reel-cta.sh と同じ(各場面の頭から 0.15秒で声を入れる。最後の場面の声は audio/sN.mp3 があれば入れる)。
# 場面の長さは shoot-motion.js が書いた <フォルダ>/durations.txt(コマ数で丸めた値)を使う。寄りは zoompan ではなく、場面の中の動きで付ける。
# 出力はナレーションだけの mp4。この後は add-theme.sh → tiktok-safe.sh
# 使い方: build-reel-motion.sh <リールのフォルダ> <出力ファイル>
set -euo pipefail
dir="$(cd "$1" && pwd)"; out="$2"
case "$out" in /*) ;; *) out="$PWD/$out" ;; esac
cd "$dir"

durs=(); while IFS= read -r d; do [ -n "$d" ] && durs+=("$d"); done < durations.txt
n=${#durs[@]}
[ "$(ls -d motion/s* | wc -l | tr -d ' ')" -eq "$n" ] || { echo "motion/ の場面の数が durations.txt と合わない" >&2; exit 1; }

inputs=(); vin=""
for k in $(seq 1 "$n"); do
  inputs+=(-framerate 30 -i "motion/s$k/%05d.png")
  vin+="[$((k - 1)):v]"
done

af=""; mixin=""; start=0; m=0
for k in $(seq 1 "$n"); do
  f="audio/s$k.mp3"
  if [ -f "$f" ]; then
    ms=$(printf "%.0f" "$(echo "($start + 0.15) * 1000" | bc)")
    inputs+=(-i "$f")
    af+="[$((n + m)):a]adelay=${ms}|${ms},aresample=48000[a$k];"
    mixin+="[a$k]"
    m=$((m + 1))
  fi
  start=$(echo "$start + ${durs[$((k - 1))]}" | bc)
done
total=$start

ffmpeg -nostdin -loglevel error -y "${inputs[@]}" -filter_complex "\
${vin}concat=n=$n:v=1:a=0,format=yuv420p,setsar=1[v];\
${af}${mixin}amix=inputs=$m:normalize=0,apad=whole_dur=${total},alimiter=limit=0.95[a]" \
  -map "[v]" -map "[a]" -t "$total" \
  -c:v libx264 -profile:v high -crf 19 -r 30 -c:a aac -b:a 192k -movflags +faststart \
  "$out"
echo "total=$total"
