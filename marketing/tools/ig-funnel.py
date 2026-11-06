"""Instagram のプロフィール閲覧 → リンクのタップ(日ごと、JP・EN)を出す。読むだけ。
使い方: ~/Insta/.venv/bin/python marketing/tools/ig-funnel.py [日数(既定14)]

2026-11-06、毎朝の DL 報告メール(scripts/asc/daily-detail.mjs と一緒に送る)に足すために作った。
ミューズの提案で、SNS の指標をフォロワー数ではなく「リンクのタップ率」で見る(P024 の指標と同じ)。
トークンは ~/Insta/.env(~/Insta/kurabell/common.py が読む)。値は出力に出さない。
"""
import datetime as dt
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path.home() / "Insta" / "kurabell"))
import common  # noqa: E402

GRAPH = "https://graph.instagram.com/v21.0"
DAYS = int(sys.argv[1]) if len(sys.argv) > 1 else 14


def day_metrics(acc, day: dt.date) -> dict:
    since = int(dt.datetime.combine(day, dt.time(), dt.timezone(dt.timedelta(hours=9))).timestamp())
    until = since + 86400
    url = (f"{GRAPH}/{acc.ig_id}/insights?metric=profile_views,website_clicks&period=day"
           f"&metric_type=total_value&since={since}&until={until}&access_token={acc.token}")
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.load(r)["data"]
    return {m["name"]: m.get("total_value", {}).get("value", 0) for m in data}


def main():
    cfg = common.load_config()
    today = dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    days = [today - dt.timedelta(days=i) for i in range(DAYS, 0, -1)]
    print(f"Instagram プロフィール閲覧 → リンクのタップ(日本時間の日付、直近{DAYS}日)")
    print("日付 | JP 閲覧 / タップ | EN 閲覧 / タップ")
    tot = {"jp": [0, 0], "en": [0, 0]}
    rows = {d: {} for d in days}
    for key in ("jp", "en"):
        acc = common.get_account(cfg, key)
        for d in days:
            try:
                m = day_metrics(acc, d)
                pv, wc = m.get("profile_views", 0), m.get("website_clicks", 0)
                tot[key][0] += pv
                tot[key][1] += wc
                rows[d][key] = f"{pv} / {wc}"
            except Exception as e:  # noqa: BLE001
                rows[d][key] = "取得失敗"
                print(f"({key} {d}: {str(e).splitlines()[0][:80]})", file=sys.stderr)
    for d in days:
        print(f"{d} | {rows[d].get('jp', '-')} | {rows[d].get('en', '-')}")
    for key in ("jp", "en"):
        pv, wc = tot[key]
        rate = f"{round(wc / pv * 100, 1)}%" if pv else "-"
        print(f"{key.upper()} 合計: 閲覧 {pv} → タップ {wc}(タップ率 {rate})")
    print("P024 の基準は JP の 10/3〜10/28 で 0.9%(1,583 → 14)")


if __name__ == "__main__":
    main()
