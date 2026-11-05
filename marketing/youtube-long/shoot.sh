#!/bin/bash
cd "$(dirname "$0")"; mkdir -p slides
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for n in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16; do
  "$CH" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 --window-size=1920,1080 --user-data-dir=/private/tmp/claude-501/ylong-chrome --virtual-time-budget=1500 --screenshot="$PWD/slides/s$n.png" "file://$PWD/slides.html?s=$n" >/dev/null 2>&1
done
ffmpeg -loglevel error -y -pattern_type glob -i 'slides/s*.png' -vf "scale=480:-1,tile=4x4:padding=6" -frames:v 1 slides-sheet.png
ls slides | wc -l
