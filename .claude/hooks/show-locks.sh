#!/bin/sh
# 複数の Claude Code セッションの連携用。.locks/ にある「作業中」の印を、
# セッション開始時とユーザーの発言ごとに文脈へ出す(何も無ければ何も出さない)。
# 印の書き方・消し方は CLAUDE.md の「複数セッションの連携」。
found=""
for f in "$CLAUDE_PROJECT_DIR/.locks"/*.md; do
  [ -f "$f" ] || continue
  # 12時間より古い印は、消し忘れの可能性として知らせる。消すのはセッション側の判断(CLAUDE.md の例外)
  if [ -n "$(find "$f" -mmin +720 2>/dev/null)" ]; then
    stale=" (12時間以上前の印。list_sessions で持ち主が動いていなければ消して進めてよい)"
  else
    stale=""
  fi
  if [ -z "$found" ]; then
    echo "[複数セッションの連携] 作業中の印があります(セッション名が自分なら自分の印)。他のセッションの作業に触る前に、CLAUDE.md の「複数セッションの連携」に従ってください。"
    found=1
  fi
  echo "--- $(basename "$f")$stale"
  cat "$f"
done
exit 0
