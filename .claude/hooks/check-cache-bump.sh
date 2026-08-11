#!/bin/sh
# Reminds to bump sw.js's CACHE version when index.html changes but sw.js doesn't yet reflect it.
file=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
case "$file" in
  */index.html) ;;
  *) exit 0 ;;
esac

repo=$(git -C "$(dirname "$file")" rev-parse --show-toplevel 2>/dev/null) || exit 0

git -C "$repo" diff --quiet HEAD -- index.html 2>/dev/null && exit 0
git -C "$repo" diff HEAD -- sw.js 2>/dev/null | grep -q '^[+-].*CACHE' && exit 0

echo '{"systemMessage": "index.html has uncommitted changes but sw.js CACHE version has not been bumped yet — remember to update it before shipping (see CLAUDE.md cache-busting note)."}'
