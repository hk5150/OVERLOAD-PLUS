#!/bin/bash
# リール1本を書き出す: 映像(seek(t)を30fpsで撮る) → 音(cues.json から合成、または track.wav) → -14 LUFS → mp4 + カバー
# 使い方: build.sh <リールのフォルダ> [秒数(既定は cues.json の duration)]
# 出力: <フォルダ>/out/reel.mp4, <フォルダ>/out/cover.jpg(0秒目=問いかけの場面)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
dir="$(cd "$1" && pwd)"
dur="${2:-$(python3 -c "import json;print(json.load(open('$dir/cues.json'))['duration'])")}"
mkdir -p "$dir/out"

node "$here/render.cjs" "$dir/index.html" "$dir/out/video.mp4" 30 "$dur"

if [ -f "$dir/track.wav" ]; then cp "$dir/track.wav" "$dir/out/sound.wav"; else python3 "$here/sound.py" "$dir"; fi
# 2回測る(1回で済ませると短い曲は -15〜-16 LUFS に落ちる)
m=$(ffmpeg -nostdin -hide_banner -i "$dir/out/sound.wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
g() { echo "$m" | python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -nostdin -loglevel error -y -i "$dir/out/sound.wav" \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(g input_i):measured_TP=$(g input_tp):measured_LRA=$(g input_lra):measured_thresh=$(g input_thresh):offset=$(g target_offset):linear=true,aresample=48000" \
  -ac 2 "$dir/out/sound_norm.wav"
# 鐘などの尖った音があると上の処理は頭打ちで目標に届かないので、足りない分を上げてリミッターで抑える
i=$(ffmpeg -nostdin -i "$dir/out/sound_norm.wav" -af ebur128=framelog=quiet -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
ffmpeg -nostdin -loglevel error -y -i "$dir/out/sound_norm.wav" -af "volume=$(echo "-14 - ($i)" | bc)dB,alimiter=limit=0.89:level=false" "$dir/out/sound_final.wav"
mv "$dir/out/sound_final.wav" "$dir/out/sound_norm.wav"

ffmpeg -nostdin -loglevel error -y -i "$dir/out/video.mp4" -i "$dir/out/sound_norm.wav" -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k -t "$dur" -movflags +faststart "$dir/out/reel.part.mp4"
mv "$dir/out/reel.part.mp4" "$dir/out/reel.mp4"
ffmpeg -nostdin -loglevel error -y -i "$dir/out/reel.mp4" -frames:v 1 -q:v 2 "$dir/out/cover.jpg"
echo "ok $dir/out/reel.mp4"
