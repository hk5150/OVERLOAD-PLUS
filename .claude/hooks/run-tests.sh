#!/bin/sh
# 実装ファイルを編集した直後に npm test を回し、落ちたら知らせる。
#
# なぜフックにするか: CLAUDE.md の罠リスト筆頭「JSXの構文エラーはBabelが走るまで
# 表面化しない」に対する最短の打ち手だから。tests/sync-www.test.js が beforeAll で
# scripts/sync-www.js の build() を実行し、その中で esbuild が #appsrc を JSX として
# パースするので、構文エラーはテストで落ちる。全186テストで0.8秒しかかからない。
#
# ブロックはしない(advisory)。連続編集の途中では、まだ CACHE を bump していない・
# まだ en の訳を書いていない、といった理由で一時的に落ちるのが正常なため。
file=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[ -n "$file" ] || exit 0

# 実装に関わるファイルだけを対象にする(docs や .md の編集で毎回走らせない)
case "$file" in
  */index.html|*/sw.js) ;;
  */src/*|*/scripts/*|*/tests/*) ;;
  *) exit 0 ;;
esac

repo=$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null) || exit 0

out=$(cd "$repo" && npx vitest run 2>&1) && exit 0

# 落ちた場合だけ、失敗したテスト名を抜き出して伝える
summary=$(printf '%s\n' "$out" | grep -E '^\s*(×|FAIL|Tests .*failed)' | head -12)
printf '%s' "$out" | grep -q 'esbuild\|Transform failed\|Unexpected' \
  && hint='JSXの構文エラーの可能性が高い(esbuildがパースに失敗している)。' \
  || hint=''
jq -n --arg s "$summary" --arg h "$hint" \
  '{systemMessage: ("npm test が落ちています。\($h)\n\($s)")}'
