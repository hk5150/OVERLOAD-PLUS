#!/usr/bin/env python3
"""TikTok と YouTube ショートの「今週の予約セット」を作る(2026-10-31)。

北村さんの判断で有料の投稿代行は使わず、北村さんが週1回まとめて予約する(TikTok Studio は 10日先まで、
YouTube Studio は先の日付まで予約できる)。このスクリプトは、その回に要るものを1枚の md にそろえる:
どの動画を何日の何時に出すか、TikTok のキャプション、YouTube のタイトルと説明文、毎回の設定。

- 動画とキャプションは iCloud Drive の KURABELL-TikTok/NN-題.mp4・.txt(TikTok 用に作ったもの)
- 何をもう予約したかは state.json に残す(このスクリプトが割り当てた分は「予約済み」とみなす。
  予約できなかった本があれば --release NN で戻す)
- YouTube の説明文は TikTok のキャプションから作る(reports/youtube/README.md の決まり:
  保存・コメントの呼びかけを除き、検索の一文にチャンネルのリンクを添え、ハッシュタグの先頭に #Shorts)。
  タイトルは marketing/tiktok/youtube-titles.tsv にあればそれ、無ければ冒頭の問いに【筋トレ】を付ける

launchd からは iCloud Drive が読めないので、Claude のルーティン(週1回)か手で動かす。

使い方:
  python3 video-kit.py [--start YYYY-MM-DD] [--days 7] [--dry-run]
  python3 video-kit.py --release tiktok 12     # 予約できなかった本を、次のセットに戻す
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

# 公開の時刻。TikTok・YouTube とも同じ日の 12:30(reports/youtube/README.md)
POST_TIME = "12:30"
# 1日1本ずつ。ストックが少ないときは、詰めずに先の日を空ける
PER_DAY = {"tiktok": 1, "youtube": 1}

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


def plan(state, start, days):
    items = stock()
    slots = {}
    for platform in ("tiktok", "youtube"):
        todo = [it for it in items if it["no"] not in state[platform]]
        d, used = start, 0
        for it in todo:
            if d >= start + timedelta(days=days):
                break
            slots.setdefault(d, []).append((platform, it))
            used += 1
            if used >= PER_DAY[platform]:
                d, used = d + timedelta(days=1), 0
    return items, slots


def render(items, slots, state, start, days):
    titles = youtube_titles()
    end = start + timedelta(days=days - 1)
    lines = [f"# 予約セット {start:%m/%d}〜{end:%m/%d}", ""]
    lines.append(f"作成: {datetime.now():%Y-%m-%d %H:%M}(video-kit.py)。公開はどれも {POST_TIME}。")
    lines.append("")
    if not slots:
        lines += ["今週予約する動画はありません(ストックが尽きています)。新しい動画を KURABELL-TikTok に足してください。", ""]
    lines += ["## 一覧", "", "| 日 | TikTok | YouTube |", "|---|---|---|"]
    for i in range(days):
        d = start + timedelta(days=i)
        cells = {"tiktok": "", "youtube": ""}
        for platform, it in slots.get(d, []):
            cells[platform] = f"{it['no']} {it['title']}"
        lines.append(f"| {d:%m/%d}({WEEKDAYS[d.weekday()]}) | {cells['tiktok'] or '—'} | {cells['youtube'] or '—'} |")
    lines.append("")
    left = {p: [it["no"] for it in items if it["no"] not in state[p] and all(
        not (pp == p and x["no"] == it["no"]) for v in slots.values() for pp, x in v)] for p in ("tiktok", "youtube")}
    lines.append(f"このセットの後に残るストック: TikTok {len(left['tiktok'])}本、YouTube {len(left['youtube'])}本")
    lines.append("")

    lines += [
        "## 毎回の設定",
        "",
        "**TikTok**(Mac の Chrome で https://www.tiktok.com/tiktokstudio/upload 。予約は 10日先まで。iPhone のアプリでは予約できない)",
        "1. 右上のアカウントが @kurabell_workout_log_jp か確かめる",
        "2. 動画を選び、説明欄の文字を全部消してから、下のキャプションを貼る",
        "3. 「AI生成コンテンツ」をオン(写真とナレーションが AI 生成)",
        "4. カバーは 1秒あたりのコマ(1コマ目は文字が出始め)",
        f"5. 「予約投稿」をオンにして、日付と {POST_TIME} を入れて「予約する」",
        "",
        "**YouTube**(YouTube Studio https://studio.youtube.com 、または iPhone の YouTube アプリ)",
        "1. チャンネルが KURABELL(@kurabell_workout_log_jp)か確かめる",
        "2. タイトルと説明文を貼る",
        "3. 「いいえ、子ども向けではありません」",
        "4. 「改変または合成されたコンテンツ」は「はい」",
        f"5. 公開設定は「スケジュールを設定」で、日付と {POST_TIME}(日本時間)",
        "",
        "終わったら、プロジェクトのチャットに「予約した」と一言ください(できなかった本があれば番号も)。",
        "",
    ]

    for d in sorted(slots):
        for platform, it in slots[d]:
            memo, body = split_caption(it["txt"].read_text(encoding="utf-8"))
            lines.append(f"## {d:%m/%d}({WEEKDAYS[d.weekday()]}) {'TikTok' if platform == 'tiktok' else 'YouTube'} {it['no']} {it['title']}")
            lines.append("")
            lines.append(f"動画: `KURABELL-TikTok/{it['mp4'].name}`")
            if memo:
                lines.append(f"メモ: {memo}")
            lines.append("")
            if platform == "tiktok":
                lines += ["キャプション:", "", "```", body, "```", ""]
            else:
                title, desc = youtube_text(body, it["no"], titles)
                lines += ["タイトル:", "", "```", title, "```", "", "説明文:", "", "```", desc, "```", ""]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", help="最初の日(既定は明日)")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--dry-run", action="store_true", help="md を標準出力に出すだけで、state も書かない")
    ap.add_argument("--release", nargs=2, metavar=("PLATFORM", "NO"), help="予約できなかった本を戻す(tiktok 12 など)")
    a = ap.parse_args()

    state = load_state()
    if a.release:
        platform, no = a.release
        if state.get(platform, {}).pop(f"{int(no):02d}", None) is None:
            sys.exit(f"{platform} {no} は予約済みになっていません")
        save_state(state)
        print(f"{platform} {int(no):02d} を戻しました。次の予約セットに入ります")
        return

    start = date.fromisoformat(a.start) if a.start else date.today() + timedelta(days=1)
    items, slots = plan(state, start, a.days)
    md = render(items, slots, state, start, a.days)
    if a.dry_run:
        print(md)
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{start:%Y-%m-%d}.md"
    out.write_text(md + "\n", encoding="utf-8")
    for d, v in slots.items():
        for platform, it in v:
            state[platform][it["no"]] = f"予約セット {start:%Y-%m-%d}({d:%m/%d} {POST_TIME})"
    save_state(state)
    n = sum(len(v) for v in slots.values())
    print(f"{out}\n{n} 件(TikTok {sum(1 for v in slots.values() for p, _ in v if p == 'tiktok')}・YouTube {sum(1 for v in slots.values() for p, _ in v if p == 'youtube')})")


if __name__ == "__main__":
    main()
