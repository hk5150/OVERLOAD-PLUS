#!/usr/bin/env python3
"""TikTok の公開ページから、プロフィールと投稿ごとの再生数を読んで記録する。

ログインも API キーも使わない(誰でも見られるページの HTML に埋め込まれた JSON を読むだけ)。
TikTok はプロフィールの HTML に投稿の一覧を入れないので、投稿は URL を1本ずつ開く。
URL は marketing/tiktok/published/*.md と marketing/tiktok/urls.txt から集める。
プロフィールのページは curl だと WAF の確認画面で止まる(2026-10-16、Mac で確認)。
そのときは投稿ページに入っている投稿者の数字(authorStats)でフォロワー数などを埋める。

使い方:
  python3 tiktok-stats.py [--account kurabell_workout_log_jp] [--out-dir DIR] [--dry-run]

出力(--out-dir、既定は reports/tiktok/):
  tiktok-stats.csv  日付ごとの履歴(同じ日に2回動かすと、その日の行を置き換える)
  tiktok-stats.md   最新の表と、投稿ごとの再生数の推移
"""
import argparse
import csv
import datetime as dt
import glob
import json
import os
import re
import sys
import time
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/18.0 Safari/605.1.15")
FIELDS = ["date", "kind", "id", "url", "title", "posted", "views", "likes",
          "comments", "shares", "saves", "followers", "videos"]


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept-Language": "ja-JP,ja;q=0.9"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def scope(html):
    m = re.search(r'<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>(.*?)</script>',
                  html, re.S)
    if not m:
        raise ValueError("ページに __UNIVERSAL_DATA_FOR_REHYDRATION__ が無い(ブロックされたか、ページの形が変わった)")
    return json.loads(m.group(1)).get("__DEFAULT_SCOPE__", {})


def profile(account):
    d = scope(fetch(f"https://www.tiktok.com/@{account}")).get("webapp.user-detail", {})
    info = d.get("userInfo")
    if not info:
        raise ValueError(f"プロフィールが読めない(statusCode={d.get('statusCode')})")
    s = info.get("stats", {})
    return {"followers": s.get("followerCount"), "likes": s.get("heartCount"),
            "videos": s.get("videoCount")}


def video(url):
    d = scope(fetch(url)).get("webapp.video-detail", {})
    item = (d.get("itemInfo") or {}).get("itemStruct")
    if not item:
        raise ValueError(f"投稿が読めない(statusCode={d.get('statusCode')})")
    s = item.get("statsV2") or item.get("stats") or {}
    posted = item.get("createTime")
    a = item.get("authorStatsV2") or item.get("authorStats") or {}
    return {
        "author": {"followers": a.get("followerCount"), "likes": a.get("heartCount"),
                   "videos": a.get("videoCount")},
        "id": item.get("id"),
        "title": (item.get("desc") or "").splitlines()[0][:40] if item.get("desc") else "",
        "posted": dt.datetime.fromtimestamp(int(posted)).strftime("%Y-%m-%d") if posted else "",
        "views": s.get("playCount"), "likes": s.get("diggCount"),
        "comments": s.get("commentCount"), "shares": s.get("shareCount"),
        "saves": s.get("collectCount"),
    }


def video_urls(account):
    pat = re.compile(r"https://www\.tiktok\.com/@[\w.]+/(?:video|photo)/\d+")
    found = []
    files = sorted(glob.glob(os.path.join(REPO, "marketing/tiktok/published/*.md")))
    files.append(os.path.join(REPO, "marketing/tiktok/urls.txt"))
    for f in files:
        if os.path.exists(f):
            with open(f, encoding="utf-8") as fh:
                found += pat.findall(fh.read())
    seen, out = set(), []
    for u in found:
        vid = u.rsplit("/", 1)[1]
        if vid not in seen:
            seen.add(vid)
            out.append(u)
    return out


def load(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def write_md(path, rows, account, errors):
    days = sorted({r["date"] for r in rows})
    last = days[-1] if days else ""
    today = [r for r in rows if r["date"] == last]
    prof = next((r for r in today if r["kind"] == "profile"), None)
    vids = sorted((r for r in today if r["kind"] == "video"),
                  key=lambda r: r["posted"], reverse=True)
    L = [f"# TikTok の数字(@{account})", "",
         f"公開ページから毎日読んだ値。最終取得: {last}。"
         "作り方は `marketing/tools/tiktok-stats.py`。", ""]
    if prof:
        L += [f"- フォロワー {prof['followers']} / いいね合計 {prof['likes']} / 投稿 {prof['videos']}", ""]
    L += ["## 投稿ごと(最新)", "",
          "| 投稿日 | 投稿 | 再生 | いいね | コメント | シェア | 保存 |",
          "|---|---|--:|--:|--:|--:|--:|"]
    for r in vids:
        L.append(f"| {r['posted']} | [{r['title'] or r['id']}]({r['url']}) | {r['views']} | "
                 f"{r['likes']} | {r['comments']} | {r['shares']} | {r['saves']} |")
    if not vids:
        L.append("| | (投稿の URL がまだ無い) | | | | | |")
    recent = days[-14:]
    L += ["", "## 再生数の推移(直近14日)", "",
          "| 投稿 | " + " | ".join(d[5:] for d in recent) + " |",
          "|---|" + "--:|" * len(recent)]
    by = {}
    for r in rows:
        if r["kind"] == "video":
            by.setdefault(r["id"], {})[r["date"]] = r
    for vid, hist in by.items():
        name = hist[max(hist)]["title"] or vid
        L.append(f"| {name} | " + " | ".join(hist.get(d, {}).get("views", "") for d in recent) + " |")
    if errors:
        L += ["", f"## {last} に読めなかったもの", ""] + [f"- {e}" for e in errors]
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--account", default="kurabell_workout_log_jp")
    ap.add_argument("--out-dir", default=os.path.join(REPO, "reports/tiktok"))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    today = dt.date.today().isoformat()
    new, errors = [], []
    try:
        p = profile(a.account)
    except Exception as e:  # noqa: BLE001  1件失敗しても残りは取る
        p, profile_error = None, f"プロフィール: {e}"
    author = None
    for u in video_urls(a.account):
        time.sleep(2)
        try:
            v = video(u)
            author = author or (v["author"] if v["author"]["followers"] is not None else None)
            new.append({"date": today, "kind": "video", "url": u, **v})
        except Exception as e:  # noqa: BLE001
            errors.append(f"{u}: {e}")
    if p or author:
        new.insert(0, {"date": today, "kind": "profile", "id": a.account,
                       "url": f"https://www.tiktok.com/@{a.account}", **(p or author)})
    else:
        errors.insert(0, profile_error)

    if a.dry_run:
        print(json.dumps({"rows": new, "errors": errors}, ensure_ascii=False, indent=1))
        return 0 if new else 1
    if not new:
        print("\n".join(errors), file=sys.stderr)
        return 1  # 何も読めなかった日は履歴を書き換えない

    os.makedirs(a.out_dir, exist_ok=True)
    csv_path = os.path.join(a.out_dir, "tiktok-stats.csv")
    rows = [r for r in load(csv_path) if r["date"] != today] + new
    rows = [{k: "" if r.get(k) is None else str(r[k]) for k in FIELDS} for r in rows]
    with open(csv_path, "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    write_md(os.path.join(a.out_dir, "tiktok-stats.md"), rows, a.account, errors)
    print(f"{len(new)} 件を記録、失敗 {len(errors)} 件 → {a.out_dir}")
    for e in errors:
        print("  " + e, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
