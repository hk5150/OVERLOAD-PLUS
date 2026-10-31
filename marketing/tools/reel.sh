#!/bin/bash
# 13時のルーティンが「ちょっと確かめる」ために打っていた複合コマンド(for・パイプ・;・&&)を1本にまとめた入口。
# ルーティンは無人で動くので、許可の一覧に無い形のコマンドを打つとそこで確認待ちになり、その日の回が終わらない
# (2026-10-31 13:02 に for で ffprobe を回す1行で止まった。10/27 は mv、10/21 は curl・git show)。
# 許可の一覧には `Bash(/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/reel.sh *)` の1行で入れてある。
# 使い方:
#   reel.sh durations <ファイルかフォルダ>...      mp3・mp4 の長さ(秒)を1行ずつ。フォルダなら中の mp3・mp4 を名前順に
#   reel.sh inspect <mp4>                         長さ・平均音量・最大音量・解像度(できた動画の確認。平均は -18〜-19dB が目安)
#   reel.sh check <mp4> <出力フォルダ> <秒>...      その秒のコマを <出力フォルダ>/<秒>.png に切り出す(フォルダは作る)
#   reel.sh queue                                 Instagram の予約(JP・EN)の残りを番号つきで
#   reel.sh files <フォルダ>                       フォルダの中身を再帰で(サイズつき)
# 読むだけ・作るだけで、消したり名前を変えたりはしない。
set -euo pipefail

INSTA_QUEUE="/Users/hajimekitamura/Insta/kurabell/reels/予約"

dur() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

cmd="${1:-}"; shift || true
case "$cmd" in
  durations)
    [ $# -ge 1 ] || { echo "使い方: reel.sh durations <ファイルかフォルダ>..." >&2; exit 2; }
    for p in "$@"; do
      if [ -d "$p" ]; then
        found=0
        while IFS= read -r f; do found=1; printf '%s\t%s\n' "$(dur "$f")" "$f"; done \
          < <(find "$p" -maxdepth 1 -type f \( -name '*.mp3' -o -name '*.mp4' -o -name '*.m4a' -o -name '*.wav' \) | sort -V)
        [ "$found" = 1 ] || echo "(音声・動画なし) $p"
      else
        printf '%s\t%s\n' "$(dur "$p")" "$p"
      fi
    done
    ;;
  inspect)
    [ $# -eq 1 ] || { echo "使い方: reel.sh inspect <mp4>" >&2; exit 2; }
    f="$1"
    echo "長さ: $(dur "$f") 秒"
    echo "映像: $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$f")"
    ffmpeg -hide_banner -nostats -i "$f" -af volumedetect -vn -f null - 2>&1 | grep -E 'mean_volume|max_volume' | sed -e 's/.*\] //'
    ;;
  check)
    [ $# -ge 3 ] || { echo "使い方: reel.sh check <mp4> <出力フォルダ> <秒>..." >&2; exit 2; }
    f="$1"; out="$2"; shift 2
    mkdir -p "$out"
    for s in "$@"; do
      ffmpeg -loglevel error -y -ss "$s" -i "$f" -frames:v 1 "$out/$s.png"
      echo "$out/$s.png"
    done
    ;;
  queue)
    for acc in JP EN; do
      echo "== $acc"
      ls -1 "$INSTA_QUEUE/$acc" 2>/dev/null | sed -E 's/\.(mp4|txt|jpg)$//' | sort -u || true
    done
    ;;
  files)
    [ $# -eq 1 ] || { echo "使い方: reel.sh files <フォルダ>" >&2; exit 2; }
    find "$1" -type f -exec ls -l {} + | awk '{print $5"\t"$9}' | sort -k2
    ;;
  *)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
