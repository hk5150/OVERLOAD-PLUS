#!/bin/bash
# リールのナレーションを1場面ぶん作る(Gemini 3.8 Flash TTS、声 Charon)。2026-10-11 から新しいリールはナレーションあり。
# 使い方: tts.sh <出力.mp3> <ja|en> <読む文>
# JP の文では KURABELL を「クラベル」と書く。EN は koo-rah-bell と読ませる指示を入れてある。
# 費用はおよそ1文1〜3クレジット(Obsidian Knowledge/genspark-tts-cost.md)
# 落とし穴: audio_urls をそのまま curl すると "Access denied" の JSON が返る。gsk download の download_url を使う。
#           gsk download -s(保存)は止まることがあったので使わない
set -euo pipefail
out="$1"; lang="$2"; text="$3"
if [ "$lang" = ja ]; then
  ins="Male narrator. Calm, clear, confident Japanese narration for a fitness education short video. Natural pace, slightly brisk."
else
  ins="Male narrator. Calm, clear, confident American English narration for a fitness education short video. Natural pace, slightly brisk. Pronounce KURABELL as koo-rah-bell."
fi
params=$(python3 -c 'import json,sys; print(json.dumps({"speakers":[{"speaker":"Speaker1","voice_name":"Charon"}],"instructions":sys.argv[1]}))' "$ins")
# Genspark が混んでいると 524(Cloudflare のタイムアウト)で data が null になる。5分で打ち切って1回だけやり直す
# (macOS に timeout が無いので perl の alarm で切る)
pick='import json,sys
try: print(json.load(sys.stdin)["data"]["generated_audios"][0]["audio_urls"][0])
except Exception: pass'
url=""
for try_ in 1 2; do
  url=$(perl -e 'alarm shift; exec @ARGV' 300 gsk audio -m google/gemini-3.8-flash-tts -p "$params" -f "$(basename "$out" .mp3)" "$text" 2>/dev/null | python3 -c "$pick" || true)
  [ -n "$url" ] && break
done
[ -n "$url" ] || { echo "tts.sh: Genspark が音声を返さなかった(2回)。時間をおいてやり直す" >&2; exit 1; }
dl=$(perl -e 'alarm shift; exec @ARGV' 120 gsk download "$url" 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["data"]["download_url"])')
tmp=$(mktemp)
curl -sfL "$dl" -o "$tmp"
mkdir -p "$(dirname "$out")"
ffmpeg -loglevel error -y -i "$tmp" -ac 1 -ar 24000 -c:a libmp3lame -b:a 128k "$out"
rm -f "$tmp"
printf "%s %ss\n" "$out" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")"
