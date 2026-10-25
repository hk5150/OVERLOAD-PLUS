#!/bin/bash
# pinned.html(横長 3105×1350)を撮って、ピン留め用の3枚(1080×1350 の JPEG)に切り出す。
# out/1.jpg が一覧の左、3.jpg が右。確認用に、一覧での見え方(3:4 に切った3枚を並べたもの)を out/grid.png に作る。
# 使い方: shoot.sh [pinned.html | pinned-en.html](既定は pinned.html。出力は out/ または out-en/)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
page="${1:-pinned.html}"
out="$here/out"; [[ "$page" == *-en.html ]] && out="$here/out-en"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$out"
"$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
  --window-size=3105,1350 --screenshot="$out/wide.png" "file://$here/$page" >/dev/null 2>&1
python3 - "$out" <<'PY'
import sys
from PIL import Image
out = sys.argv[1]
wide = Image.open(f"{out}/wide.png").convert("RGB")
# 隣どうしを 67.5px 重ねて切る(一覧では左右 33.75px ずつ隠れるので、そこで継ぎ目がつながる)
for i, x in enumerate([0, 1013, 2025], 1):
    wide.crop((x, 0, x + 1080, 1350)).save(f"{out}/{i}.jpg", quality=92)
# 一覧の見え方: 各枚の中央 3:4(1012×1350)を、2px のすき間を空けて並べる
gap, w = 2, 1012
grid = Image.new("RGB", (w * 3 + gap * 2, 1350), "white")
for i in range(3):
    s = Image.open(f"{out}/{i + 1}.jpg")
    grid.paste(s.crop((34, 0, 34 + w, 1350)), (i * (w + gap), 0))
grid.resize((grid.width // 3, 450)).save(f"{out}/grid.png")
PY
rm -f "$out/wide.png"
echo "$out/grid.png"
