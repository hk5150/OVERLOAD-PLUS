#!/bin/bash
# 朝の4役(marketing/roles/)が無人で使う入口。reel.sh に無いものだけをここに置く。
# 無人の回は許可の一覧に無い形のコマンドで止まるので、許可の一覧には
# `Bash(/Users/hajimekitamura/OVERLOAD-PLUS/marketing/tools/morning.sh *)` の1行で入れる。
# 使い方:
#   morning.sh grid <出力.png> <画像>...        画像を高さ540にそろえて横に並べた1枚を作る(カバーの並びの確認用)
#   morning.sh gain <入力.mp4> <出力.mp4> <dB>   音量を dB だけ上げ下げした別の mp4 を作る(映像はそのまま)
#   morning.sh unlock                           朝の4役の作業中の印(.locks/morning-sns.md)を消す
#   morning.sh caption <caption.txt>...         キャプションの長さとタグ数を確かめ、ファイルごとに OK か理由を出す
#   morning.sh abstract <PMID>...               PubMed の抄録を eutils から読んで出す(数字の PMID だけ受ける)
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
  caption)
    # validate_caption は問題が無いと何も返さない。2026-11-09 の品質チェックは結果を見ようと print() で包み、
    # 許可の一覧の形から外れて確認待ちになり、2回とも止まった。結果はここで文字にして出す。
    [ $# -ge 1 ] || { echo "使い方: morning.sh caption <caption.txt>..." >&2; exit 2; }
    /Users/hajimekitamura/Insta/.venv/bin/python - "$@" <<'PY'
import sys
sys.path.insert(0, "/Users/hajimekitamura/Insta/scripts")
import ig_client
failed = False
for path in sys.argv[1:]:
    text = open(path, encoding="utf-8").read()
    try:
        ig_client.validate_caption(text)
        print(f"OK {len(text)}文字 タグ{text.count('#')}個 {path}")
    except Exception as e:
        failed = True
        print(f"NG {e} {path}")
sys.exit(1 if failed else 0)
PY
    ;;
  abstract)
    [ $# -ge 1 ] || { echo "使い方: morning.sh abstract <PMID>..." >&2; exit 2; }
    for id in "$@"; do
      [[ "$id" =~ ^[0-9]+$ ]] || { echo "PMID は数字だけ: $id" >&2; exit 2; }
      echo "=== PMID $id"
      curl -sS --fail --max-time 60 "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=$id&rettype=abstract&retmode=text"
      echo
    done
    ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
