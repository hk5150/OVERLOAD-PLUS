#!/usr/bin/env python3
"""プロジェクトのダッシュボード(Overview の Custom view)用に、毎日の数字を1枚にまとめる。

自分では App Store Connect・Instagram の API を叩かない。ほかの仕組みが毎日書いたものを読むだけ:
  App Store   Obsidian の Projects/kurabell-metrics.md・kurabell-appstore-daily.md(12時のルーティン)
  Instagram   reports/instagram/*.csv(~/Insta/kurabell/insights.py、11:55 の launchd)
  予約投稿    ~/Insta/kurabell/reels/予約/{JP,EN}(autopost.py が名前順に出す)
  TikTok      reports/tiktok/tiktok-stats.csv(tiktok-stats.py、11:50 の launchd)
  ルーティン  reports/routines/appstore-metrics.md・marketing-pdca.md の最後の回
YouTube ショートだけは、ここで公開のショート一覧ページを読む(API キーなし。チャンネル登録者数はページに出ていない)。

使い方:
  python3 dashboard-digest.py [--out-dir DIR] [--no-youtube]

出力(--out-dir、既定は reports/dashboard/):
  latest.md         最新のまとめ(コーディネーターに送る文面そのもの)
  YYYY-MM-DD.md     同じものを日付で残す(同じ日に2回動かすと上書き)
YouTube の再生数は reports/youtube/youtube-stats.csv に日付ごとに足す(同じ日の行は置き換える)。
"""
import argparse
import csv
import datetime as dt
import glob
import os
import plistlib
import re
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HOME = os.path.expanduser("~")
VAULT = os.path.join(HOME, "Library/Mobile Documents/com~apple~CloudDocs/Obsidian AI連携/Projects")
REELS = os.path.join(HOME, "Insta/kurabell/reels")
AUTOPOST_PLIST = os.path.join(HOME, "Library/LaunchAgents/com.kurabell.autopost.{}.plist")
YOUTUBE_SHORTS = "https://www.youtube.com/@kurabell_workout_log_jp/shorts"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")
IG_ACCOUNTS = [("JP", "@kurabell_workout_log_jp"), ("EN", "@kurabell_workout_log_en")]


def read(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def md_rows(text, header_start):
    """header_start で始まる Markdown の表の行を、セルのリストで返す。"""
    rows, inside = [], False
    for line in (text or "").splitlines():
        if line.startswith(header_start):
            inside = True
            continue
        if inside:
            if not line.startswith("|"):
                if rows:
                    break
                continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if cells and set(cells[0]) <= set("-: "):
                continue
            rows.append(cells)
    return rows


def short(d):
    """2026-10-27 → 10/27"""
    try:
        x = dt.date.fromisoformat(d)
        return f"{x.month}/{x.day}"
    except ValueError:
        return d


# --- App Store ---------------------------------------------------------------

def appstore():
    L = ["## App Store(直近30日)"]
    rows = md_rows(read(os.path.join(VAULT, "kurabell-metrics.md")), "| 取得日 |")
    rows = [r for r in rows if len(r) >= 10 and r[2].isdigit()]
    if not rows:
        return L + ["- 実績ログ(Obsidian の kurabell-metrics.md)が読めなかった", ""]
    cur, prev = rows[-1], rows[-2] if len(rows) >= 2 else None

    def val(i):
        if prev and prev[i].isdigit() and cur[i].isdigit():
            d = int(cur[i]) - int(prev[i])
            return f"{cur[i]}({'+' if d > 0 else '±' if d == 0 else ''}{d})"
        return cur[i]

    L.append(f"- 取得 {short(cur[0])}・分析は {short(cur[1])} まで")
    L.append(f"- 表示 {val(2)} / 閲覧 {val(3)} / 初回DL {val(4)} / 再DL {val(5)} / CVR {cur[6]}")
    L.append(f"- 課金 {cur[7]}件 / 収益 {cur[8]}")
    memo = cur[9]
    m = re.search(r"前回以降[::](.*?)(?:取得は|$)", memo)
    if m:
        L.append(f"- 審査・配信: {m.group(1).strip().rstrip('。')}")
    daily = md_rows(read(os.path.join(VAULT, "kurabell-appstore-daily.md")), "| 日付 |")
    daily = [r for r in daily if len(r) >= 4 and r[1].isdigit()][-7:]
    if daily:
        L.append("- 日ごと(表示/閲覧/初回DL): " + "、".join(
            f"{short(r[0])} {r[1]}/{r[2]}/{r[3]}" for r in daily))
    return L + [""]


# --- Instagram ----------------------------------------------------------------

def instagram():
    L = ["## Instagram"]
    fpath = os.path.join(REPO, "reports/instagram/instagram-followers.csv")
    spath = os.path.join(REPO, "reports/instagram/instagram-stats.csv")
    try:
        with open(fpath, encoding="utf-8") as f:
            followers = list(csv.DictReader(f))
        with open(spath, encoding="utf-8") as f:
            stats = list(csv.DictReader(f))
    except OSError:
        return L + ["- reports/instagram/ の CSV が読めなかった", ""]
    for key, acct in IG_ACCOUNTS:
        fr = [r for r in followers if r["account"] == acct]
        if not fr:
            continue
        last = fr[-1]
        prev = fr[-2] if len(fr) >= 2 else None
        diff = f"(前日比 {int(last['followers']) - int(prev['followers']):+d})" if prev else ""
        L.append(f"- {key} フォロワー {last['followers']}{diff}・{short(last['date'])} 時点")
        day = max((r["date"] for r in stats if r["account"] == acct), default=None)
        posts = sorted([r for r in stats if r["account"] == acct and r["date"] == day],
                       key=lambda r: r["posted"], reverse=True)[:3]
        for p in posts:
            L.append(f"  - {short(p['posted'])}「{p['title'][:28]}」閲覧 {p['views']}・リーチ {p['reach']}"
                     f"・いいね {p['likes']}・保存 {p['saved']}")
    L += queue()
    return L + [""]


def post_time(key):
    try:
        with open(AUTOPOST_PLIST.format(key.lower()), "rb") as f:
            iv = plistlib.load(f).get("StartCalendarInterval")
        iv = iv[0] if isinstance(iv, list) else iv
        return f"{iv['Hour']}:{iv.get('Minute', 0):02d}"
    except (OSError, KeyError, TypeError, IndexError, plistlib.InvalidFileException):
        return None


def queue():
    L = []
    for key, _ in IG_ACCOUNTS:
        try:
            items = sorted({os.path.splitext(n)[0] for n in os.listdir(os.path.join(REELS, "予約", key))
                            if not n.startswith(".")})
        except OSError:
            L.append(f"- {key} 予約: フォルダが読めなかった")
            continue
        done = sorted(n[:10] for n in os.listdir(os.path.join(REELS, "投稿済み", key))
                      if re.match(r"\d{4}-\d{2}-\d{2}_", n))
        nxt = ""
        if done:
            d = dt.date.fromisoformat(done[-1]) + dt.timedelta(days=2)
            t = post_time(key)
            nxt = f"、最後の投稿 {short(done[-1])}・次は {d.month}/{d.day}{' ' + t if t else ''} ごろ"
        L.append(f"- {key} 予約 {len(items)}本({', '.join(items) or 'なし'}){nxt}")
    return L


# --- TikTok -------------------------------------------------------------------

def tiktok():
    L = ["## TikTok(@kurabell_workout_log_jp)"]
    try:
        with open(os.path.join(REPO, "reports/tiktok/tiktok-stats.csv"), encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
    except OSError:
        return L + ["- reports/tiktok/tiktok-stats.csv が読めなかった", ""]
    day = max(r["date"] for r in rows)
    today = [r for r in rows if r["date"] == day]
    prof = next((r for r in today if r["kind"] == "profile"), None)
    vids = sorted([r for r in today if r["kind"] == "video"], key=lambda r: r["posted"], reverse=True)
    total = sum(int(v["views"] or 0) for v in vids)
    head = f"- {short(day)} 時点: 投稿 {len(vids)}本・再生合計 {total}"
    if prof and prof.get("followers"):
        head += f"・フォロワー {prof['followers']}"
    L.append(head)
    for v in vids[:3]:
        L.append(f"  - {short(v['posted'])}「{v['title'][:24]}」再生 {v['views']}・いいね {v['likes']}")
    return L + [""]


# --- YouTube ------------------------------------------------------------------

def youtube(enabled):
    L = ["## YouTube ショート"]
    if not enabled:
        return L + ["- 取得しなかった(--no-youtube)", ""]
    try:
        req = urllib.request.Request(YOUTUBE_SHORTS, headers={
            "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9", "Cookie": "CONSENT=YES+1; SOCS=CAI"})
        with urllib.request.urlopen(req, timeout=30) as r:
            html = r.read().decode("utf-8", "replace")
    except OSError as e:
        return L + [f"- ショート一覧が読めなかった({e})", ""]
    # 一覧は新しい順。各ショートの読み上げ用の文に「題, 1,234回視聴」が入っている
    found = re.findall(r'"accessibilityText":"(.+?), ([\d,]+)回視聴', html)
    ids = re.findall(r'"reelWatchEndpoint":\{"videoId":"([\w-]{11})"', html)
    if not found:
        return L + ["- ショート一覧に再生数が見つからなかった(ページの形が変わったかもしれない)", ""]
    vids = []
    seen = set()
    for i, (title, views) in enumerate(found):
        if title in seen:
            continue
        seen.add(title)
        vids.append({"title": title, "views": int(views.replace(",", "")),
                     "id": ids[i] if i < len(ids) else ""})
    today = dt.date.today().isoformat()
    path = os.path.join(REPO, "reports/youtube/youtube-stats.csv")
    old = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            old = [r for r in csv.DictReader(f) if r["date"] != today]
    prev_day = max((r["date"] for r in old), default=None)
    prev = {r["title"]: int(r["views"]) for r in old if r["date"] == prev_day}
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["date", "id", "title", "views"])
        w.writeheader()
        w.writerows(old)
        w.writerows({"date": today, **v} for v in vids)
    total = sum(v["views"] for v in vids)
    head = f"- 公開 {len(vids)}本・再生合計 {total}"
    if prev:
        head += f"({short(prev_day)} から {total - sum(prev.values()):+d})"
    L.append(head)
    for v in sorted(vids, key=lambda v: v["views"], reverse=True)[:3]:
        L.append(f"  - 「{v['title'][:26]}」{v['views']}回")
    L.append(f"  - いちばん新しい: 「{vids[0]['title'][:26]}」{vids[0]['views']}回")
    return L + [""]


# --- ルーティン -----------------------------------------------------------------

def routines():
    L = ["## ルーティンの最後の回"]
    for name, label in [("appstore-metrics", "12時 App Store実績"), ("marketing-pdca", "13時 PDCA")]:
        text = read(os.path.join(REPO, f"reports/routines/{name}.md")) or ""
        secs = re.split(r"^## ", text, flags=re.M)
        if len(secs) < 2:
            L.append(f"- {label}: 記録が無い")
            continue
        last = secs[-1]
        L.append(f"- {label}: {last.splitlines()[0].strip()}")
        ask = re.search(r"北村さんの判断が要ること[::]\s*(.+)", last)
        if ask:
            L.append(f"  - 判断が要ること: {ask.group(1).strip()}")
    return L + [""]


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out-dir", default=os.path.join(REPO, "reports/dashboard"))
    ap.add_argument("--no-youtube", action="store_true")
    a = ap.parse_args()
    now = dt.datetime.now()
    L = [f"# KURABELL ダッシュボードの数字({now:%Y-%m-%d %H:%M} 時点)", ""]
    L += appstore() + instagram() + tiktok() + youtube(not a.no_youtube) + routines()
    text = "\n".join(L).rstrip() + "\n"
    os.makedirs(a.out_dir, exist_ok=True)
    for name in ["latest.md", f"{now:%Y-%m-%d}.md"]:
        with open(os.path.join(a.out_dir, name), "w", encoding="utf-8") as f:
            f.write(text)
    sys.stdout.write(text)


if __name__ == "__main__":
    main()
