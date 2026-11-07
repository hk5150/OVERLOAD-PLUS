#!/bin/bash
# 朝の4役(marketing/roles/)が無人で使う入口。reel.sh に無いものだけをここに置く。
# 無人の回は許可の一覧に無い形のコマンドで止まるので、許可の一覧には
# `Bash(/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/morning.sh *)` の1行で入れる。
# 使い方:
#   morning.sh grid <出力.png> <画像>...        画像を高さ540にそろえて横に並べた1枚を作る(カバーの並びの確認用)
#   morning.sh gain <入力.mp4> <出力.mp4> <dB>   音量を dB だけ上げ下げした別の mp4 を作る(映像はそのまま)
#   morning.sh unlock                           朝の4役の作業中の印(.locks/morning-sns.md)を消す
# 入力のファイルは消さない・上書きしない。
set -euo pipefail

LOCK="/Users/hajimekitamura/OVERLOAD-PLUS/.locks/morning-sns.md"

cmd="${1:-}"; shift || true
case "$cmd" in
  grid)
    [ $# -ge 3 ] || { echo "使い方: morning.sh grid <出力.png> <画像> <画像>..." >&2; exit 2; }
    out="$1"; shift
    args=(); filters=""; labels=""
    i=0
    for img in "$@"; do
      args+=(-i "$img")
      filters+="[$i:v]scale=-2:540[v$i];"
      labels+="[v$i]"
      i=$((i+1))
    done
    mkdir -p "$(dirname "$out")"
    ffmpeg -loglevel error -y "${args[@]}" -filter_complex "${filters}${labels}hstack=inputs=$i" -frames:v 1 "$out"
    echo "$out"
    ;;
  gain)
    [ $# -eq 3 ] || { echo "使い方: morning.sh gain <入力.mp4> <出力.mp4> <dB>" >&2; exit 2; }
    in="$1"; out="$2"; db="$3"
    [ "$in" != "$out" ] || { echo "入力と出力を同じにしない" >&2; exit 2; }
    [ ! -e "$out" ] || { echo "出力がもうある: $out" >&2; exit 2; }
    ffmpeg -loglevel error -i "$in" -c:v copy -af "volume=${db}dB" -c:a aac -b:a 192k "$out"
    ffmpeg -hide_banner -nostats -i "$out" -af volumedetect -vn -f null - 2>&1 | grep -E 'mean_volume|max_volume' | sed -e 's/.*\] //'
    ;;
  unlock)
    rm -f "$LOCK"
    echo "消した: $LOCK"
    ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
