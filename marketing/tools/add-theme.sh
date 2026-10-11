#!/bin/bash
# ナレーション入りのリール(build-reel.sh の出力)にテーマソングを重ねる。2026-10-11 から新しいリールはこの型に戻した。
# 使い方: add-theme.sh <ナレーションだけの mp4> <出力.mp4>
# 落とし穴(Obsidian Knowledge/ffmpeg-bgm-narration-mix.md):
#   - TTS はモノラル。そのまま amix すると -3dB で左右に振られるので、先にステレオにする
#   - alimiter は既定で全体の音量を下げるので level=disabled
#   - ナレーション中だけ BGM を下げる(sidechaincompress)。サイドチェーン側が先に切れると出力も切れるので apad で延ばす
set -euo pipefail
in="$1"; out="$2"
REELS="${REELS:-$HOME/Desktop/KURABELL-reels}"
bgm="${BGM:-$REELS/theme/kurabell-theme.mp3}"
# BGM の大きさ。with-theme/ の既存9本に合わせた(最後の参考文献の場面で -28dB 前後)
gain="${BGM_GAIN:--13dB}"

total=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
fade_st=$(echo "$total - 1.5" | bc)

ffmpeg -loglevel error -y -i "$in" -i "$bgm" -filter_complex "\
[0:a]aresample=48000,pan=stereo|c0=c0|c1=c0,apad=whole_dur=${total},asplit=2[nar][sc];\
[1:a]atrim=0:${total},aresample=48000,volume=${gain},equalizer=f=2000:t=q:w=1.2:g=-5,afade=t=in:d=0.5,afade=t=out:st=${fade_st}:d=1.5[bg];\
[bg][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];\
[nar][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95:level=disabled[a]" \
  -map 0:v -map "[a]" -t "$total" -c:v copy -c:a aac -b:a 192k -movflags +faststart "$out"
echo "total=${total}s"
