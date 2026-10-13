#!/bin/bash
# Instagram 用のリール(1080x1920)を TikTok 用にする。映像を 80% に縮めて、周りに背景色の余白を付ける。
# TikTok は縦長の iPhone(19.5:9)で画面いっぱいに映すため、左右が約1割ずつ切れる(左右 97px)。
# リールの文字は左端から 60〜72px にあるので、そのままだと TikTok でだけ切れた(2026-10-13 北村さん指摘)。
# 余白は左右 108px・上 150px・下 234px(下は TikTok のキャプションとボタンが重なる側なので厚め)
# 使い方: tiktok-safe.sh <元の mp4> <出力の mp4>
set -euo pipefail
ffmpeg -loglevel error -y -i "$1" -vf "scale=864:1536,pad=1080:1920:108:150:0x141517,setsar=1" \
  -c:v libx264 -profile:v high -crf 19 -r 30 -c:a copy -movflags +faststart "$2"
echo "$2"
