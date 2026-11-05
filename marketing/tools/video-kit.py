#!/usr/bin/env python3
"""TikTok の「今週の予約セット」を作る(2026-10-31)。

北村さんの判断で有料の投稿代行は使わず、北村さんが週1回まとめて予約する(TikTok Studio は 10日先まで予約できる)。
このスクリプトは、その回に要るものを1枚の md にそろえる: どの動画を何日の何時に出すか、キャプション、毎回の設定。
YouTube は13時のルーティンが Studio に予約するので、ここには入れない(2026-11-05。二重に上がるため)。

- 動画とキャプションは iCloud Drive の KURABELL-TikTok/NN-題.mp4・.txt(TikTok 用に作ったもの)
- 何を割り当てたかは state.json に残す。公開日を過ぎても公開ページの投稿数(reports/tiktok/tiktok-stats.md)に
  届いていない本は、予約されなかったとみなして次のセットに戻す(11/1〜11/7 のセットが出されないまま「予約済み」になっていた)
- 13時のルーティンが YouTube の説明文を作るときのために、youtube_text() と --youtube NN を残してある

launchd からは iCloud Drive が読めないので、Claude のルーティン(週1回)か手で動かす。

使い方:
  python3 video-kit.py [--start YYYY-MM-DD] [--days 7] [--dry-run]
  python3 video-kit.py --release tiktok 12     # 予約できなかった本を、次のセットに戻す
  python3 video-kit.py --youtube 18            # YouTube のタイトルと説明文を出す
"""

import argparse
import json
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
VIDEOS = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/KURABELL-TikTok"
OUT_DIR = VIDEOS / "予約セット"
STATE = REPO / "reports/video-kit/state.json"
TITLES = REPO / "marketing/tiktok/youtube-titles.tsv"
TIKTOK_STATS = REPO / "reports/tiktok/tiktok-stats.md"

# 公開の時刻。YouTube と同じ 12:30(reports/youtube/README.md)
POST_TIME = "12:30"

WEEKDAYS = "月火水木金土日"


def load_state():
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    # 始めた時点の状態(2026-10-31)。TikTok は 01〜07 が投稿済み、YouTube は 03〜12 が予約済み(01・02 は出さない)
    return {
        "tiktok": {f"{n:02d}": "投稿済み(2026-10-31 以前)" for n in range(1, 8)},
        "youtube": {f"{n:02d}": "予約済み(2026-10-31 以前)" for n in range(1, 13)},
    }


def save_state(state):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def stock():
    """KURABELL-TikTok の NN-題.mp4 を番号順に。キャプションの .txt が無い本は出さない。"""
    items = []
    for mp4 in sorted(VIDEOS.glob("[0-9][0-9]-*.mp4")):
        m = re.match(r"(\d\d)-(.+)\.mp4$", mp4.name)
        txt = mp4.with_suffix(".txt")
        if m and txt.exists():
            items.append({"no": m.group(1), "title": m.group(2), "mp4": mp4, "txt": txt})
    return items


def split_caption(text):
    """先頭の【投稿メモ】と、本文に分ける。"""
    if "\n----\n" in text:
        memo, body = text.split("\n----\n", 1)
        memo = re.sub(r"^【投稿メモ[^】]*】", "", memo.strip())
        return memo.strip(), body.strip()
    return "", text.strip()


def youtube_titles():
    titles = {}
    if TITLES.exists():
        for line in TITLES.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#") and "\t" in line:
                no, title = line.split("\t", 1)
                titles[no.strip()] = title.strip()
    return titles


def youtube_text(body, no, titles):
    lines = body.splitlines()
    hook = lines[0].strip() if lines else ""
    title = titles.get(no) or (hook.replace("、", "") + "【筋トレ】")
    out = []
    for line in lines:
        s = line.strip()
        # 保存・コメントの呼びかけは YouTube では外す(ショートの説明欄は開かれにくく、呼びかけが浮く)
        if s.startswith("📌") or s.startswith("💬"):
            continue
        if s == "App Storeで「KURABELL」と検索":
            line = "App Storeで「KURABELL」と検索(チャンネルのリンクからも開けます)"
        if s.startswith("#") and not s.startswith("#Shorts"):
            line = "#Shorts " + s
        out.append(line)
    desc = re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()
    return title, desc


def release_unposted(state):
    """公開日を過ぎたのに公開ページの投稿数に届いていない本を、次のセットに戻す。"""
    if not TIKTOK_STATS.exists():
        return []
    m = re.search(r"投稿 (\d+)", TIKTOK_STATS.read_text(encoding="utf-8"))
    if not m:
        return []
    posted = int(m.group(1))
    back = []
    for no, note in list(state["tiktok"].items()):
        d = re.search(r"公開 (\d{4}-\d\d-\d\d)", note)
        if d and int(no) > posted and date.fromisoformat(d.group(1)) < date.today():
            del state["tiktok"][no]
            back.append(no)
    return back


def plan(state, start, days):
    items = stock()
    todo = [it for it in items if it["no"] not in state["tiktok"]]
    slots = {start + timedelta(days=i): it for i, it in enumerate(todo[:days])}
    return todo, slots


def render(todo, slots, start, days, back):
    end = start + timedelta(days=days - 1)
    lines = [f"# TikTok の予約セット {start:%m/%d}〜{end:%m/%d}", ""]
    lines.append(f"作成: {datetime.now():%Y-%m-%d %H:%M}(video-kit.py)。公開はどれも {POST_TIME}。YouTube は13時のルーティンが予約するので、ここにはありません。")
    lines.append("")
    if back:
        lines += [f"前のセットで公開されなかった {'・'.join(back)} を入れ直しました。", ""]
    if not slots:
        lines += ["今週予約する動画はありません(ストックが尽きています)。", ""]
    lines += ["## 一覧", "", "| 日 | 動画 |", "|---|---|"]
    for d, it in slots.items():
        lines.append(f"| {d:%m/%d}({WEEKDAYS[d.weekday()]}) | {it['no']} {it['title']} |")
    lines += ["", f"このセットの後に残るストック: {len(todo) - len(slots)}本", ""]
    lines += [
        "## 毎回の設定",
        "",
        "Mac の Chrome で https://www.tiktok.com/tiktokstudio/upload を開く(予約は 10日先まで)。",
        "1. 右上のアカウントが @kurabell_workout_log_jp か確かめる",
        "2. 動画を選び、説明欄の文字を全部消してから、下のキャプションを貼る",
        "3. 「AI生成コンテンツ」をオン(写真とナレーションが AI 生成)",
        "4. カバーは 1秒あたりのコマ(1コマ目は文字が出始め)",
        f"5. 「予約投稿」をオンにして、日付と {POST_TIME} を入れて「予約する」",
        "",
    ]
    for d, it in slots.items():
        memo, body = split_caption(it["txt"].read_text(encoding="utf-8"))
        lines += [f"## {d:%m/%d}({WEEKDAYS[d.weekday()]}) {it['no']} {it['title']}", "", f"動画: `KURABELL-TikTok/{it['mp4'].name}`"]
        if memo:
            lines.append(f"メモ: {memo}")
        lines += ["", "キャプション:", "", "```", body, "```", ""]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", help="最初の日(既定は明日)")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--dry-run", action="store_true", help="md を標準出力に出すだけで、state も書かない")
    ap.add_argument("--release", nargs=2, metavar=("PLATFORM", "NO"), help="予約できなかった本を戻す(tiktok 12 など)")
    ap.add_argument("--youtube", metavar="NO", help="YouTube のタイトルと説明文を出す")
    a = ap.parse_args()

    if a.youtube:
        no = f"{int(a.youtube):02d}"
        it = next((x for x in stock() if x["no"] == no), None)
        if not it:
            sys.exit(f"{no} の動画がありません")
        title, desc = youtube_text(split_caption(it["txt"].read_text(encoding="utf-8"))[1], no, youtube_titles())
        print(f"{title}\n\n{desc}")
        return

    state = load_state()
    if a.release:
        platform, no = a.release
        if state.get(platform, {}).pop(f"{int(no):02d}", None) is None:
            sys.exit(f"{platform} {no} は予約済みになっていません")
        save_state(state)
        print(f"{platform} {int(no):02d} を戻しました。次の予約セットに入ります")
        return

    back = release_unposted(state)
    start = date.fromisoformat(a.start) if a.start else date.today() + timedelta(days=1)
    todo, slots = plan(state, start, a.days)
    md = render(todo, slots, start, a.days, back)
    if a.dry_run:
        print(md)
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{start:%Y-%m-%d}.md"
    out.write_text(md + "\n", encoding="utf-8")
    for d, it in slots.items():
        state["tiktok"][it["no"]] = f"予約セット {start:%Y-%m-%d}(公開 {d:%Y-%m-%d} {POST_TIME})"
    save_state(state)
    print(f"{out}\n{len(slots)} 本(残り {len(todo) - len(slots)} 本)")


if __name__ == "__main__":
    main()
