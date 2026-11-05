#!/bin/bash
# YouTube の長い紹介動画を組み立てる。音声 audio/NN.mp3 + スライド slides/sNN.png + アプリの録画 take.mp4(10〜15 の場面)
set -euo pipefail
cd "$(dirname "$0")"
GAP=0.4
# 場面: 番号 録画の開始秒 crop の y(録画は 1206×2622 の縦。右の枠 896×906 に合わせて 1206×1219 を切り出す)
clip_of(){ case "$1" in
  10) echo "4.5 170";; 11) echo "16.0 510";; 12) echo "23.64 510";;
  13) echo "27.48 510";; 14) echo "34.4 510";; 15) echo "40.6 510";; *) echo "";; esac; }
[ -f cfr.mp4 ] && [ cfr.mp4 -nt take.mp4 ] || ffmpeg -loglevel error -y -i take.mp4 -vf fps=30 -c:v libx264 -crf 14 -preset veryfast -an cfr.mp4
rm -rf seg; mkdir -p seg; : > seg/list.txt
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16; do
  a=$(ffprobe -v error -show_entries format=duration -of csv=p=0 audio/$n.mp3)
  pad=$GAP; [ $n = 16 ] && pad=3.0
  d=$(echo "$a + $pad" | bc -l)
  c=$(clip_of $n)
  if [ -n "$c" ]; then read st y <<<"$c"
    ffmpeg -loglevel error -y -loop 1 -framerate 30 -t $d -i slides/s$n.png -ss $st -t $d -i cfr.mp4 -i audio/$n.mp3 \
      -filter_complex "[1:v]crop=1206:1219:0:$y,scale=896:906:flags=lanczos,setsar=1,tpad=stop_mode=clone:stop_duration=2[w];[0:v][w]overlay=962:42:shortest=1,format=yuv420p[v];[2:a]apad=whole_dur=$d[a]" \
      -map "[v]" -map "[a]" -t $d -r 30 -c:v libx264 -crf 17 -preset medium -c:a aac -b:a 192k seg/$n.mp4
  else
    ffmpeg -loglevel error -y -loop 1 -framerate 30 -t $d -i slides/s$n.png -i audio/$n.mp3 \
      -filter_complex "[0:v]format=yuv420p[v];[1:a]apad=whole_dur=$d[a]" -map "[v]" -map "[a]" -t $d -r 30 -c:v libx264 -crf 17 -preset medium -c:a aac -b:a 192k seg/$n.mp4
  fi
  echo "file '$n.mp4'" >> seg/list.txt
done
ffmpeg -loglevel error -y -f concat -safe 0 -i seg/list.txt -c copy narr.mp4
# BGM を動画の長さまでつなぐ(つなぎ目は2秒のクロスフェード)
T="$HOME/Desktop/KURABELL-reels/theme/kurabell-theme.mp3"
ffmpeg -loglevel error -y -i "$T" -i "$T" -filter_complex "[0][1]acrossfade=d=2" -c:a libmp3lame -b:a 192k bgm-long.mp3
BGM="$PWD/bgm-long.mp3" /Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/add-theme.sh narr.mp4 "$1"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"
