"""リールのカバー画像(1080x1920)を同じ型で作る。

プロフィールの一覧は 9:16 の上下 240px ずつを切った 3:4 で出るので、文字とロゴは y=240〜1680 の内側に置く。
カバーの文言の一覧は、このスクリプトとは別のデータファイル(既定は ~/Desktop/KURABELL-reels/covers/covers.json)に置く。
13時のルーティンが新しいリールのたびに1件足すので、スクリプト(リポジトリ)とデータ(制作フォルダ)を分けている。

    python3 build-covers.py [covers.json] [名前 ...]   → covers.json と同じ場所の out/<名前>.png
    (名前を渡すとその分だけ作る。渡さなければ全部)

covers.json の1件: {"name", "lang": "ja"|"en", "kicker", "line1", "line2", "photo": 写真のパス(制作フォルダから相対)| null, "lastToday": true なら写真の代わりに前回/今日の数字}
"""
import json, pathlib, subprocess, sys

REPO = pathlib.Path(__file__).resolve().parents[2]
REELS = pathlib.Path.home() / "Desktop/KURABELL-reels"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ICON = REPO / "marketing/instagram/assets/icon.png"

CMP = {
    "ja": ('<div class="cmp"><div class="row"><span class="lbl">前回</span><span class="val num">70<small>kg</small>×10<small>回</small></span></div>'
           '<div class="row"><span class="lbl">今日</span><span class="val num g">71.9<small>kg</small>×10<small>回</small></span></div></div>'),
    "en": ('<div class="cmp"><div class="row"><span class="lbl">Last</span><span class="val num">155<small>lb</small>×10</span></div>'
           '<div class="row"><span class="lbl">Today</span><span class="val num g">157.5<small>lb</small>×10</span></div></div>'),
}

CSS = """
@font-face { font-family: "Barlow C"; font-weight: 800; src: url("FONT_URL"); }
:root { --bg:#141517; --line:#2E3237; --text:#F2F0EB; --muted:#A3A8B0; --yellow:#E8B33C; --green:#4CAF6E; }
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:1080px; height:1920px; background:var(--bg); overflow:hidden; }
body { color:var(--text); font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif; position:relative; }
.num { font-family:"Barlow C"; font-weight:800; }
.photo { position:absolute; inset:0; background-size:cover; background-position:center 62%; }
.shade { position:absolute; inset:0; background:linear-gradient(rgba(20,21,23,.96) 0%, rgba(20,21,23,.92) 22%, rgba(20,21,23,.35) 42%, rgba(20,21,23,.15) 60%, rgba(20,21,23,.85) 88%); }
.kicker { position:absolute; left:84px; top:330px; font-size:38px; font-weight:800; color:var(--yellow); letter-spacing:.06em; }
.en .kicker { font-family:"Barlow C"; font-size:46px; letter-spacing:.08em; }
h1 { position:absolute; left:84px; right:84px; top:392px; font-weight:800; font-size:118px; line-height:1.16; letter-spacing:-.01em; }
.en h1 { font-family:"Barlow C"; font-size:128px; line-height:1.0; letter-spacing:0; }
h1 em { font-style:normal; color:var(--yellow); display:block; }
.cmp { position:absolute; left:84px; right:84px; top:900px; }
.cmp .row { display:grid; grid-template-columns:190px 1fr; align-items:baseline; padding:26px 0; border-bottom:3px solid var(--line); }
.cmp .lbl { font-size:44px; color:var(--muted); font-weight:700; }
.cmp .val { font-size:150px; line-height:1; }
.cmp .val small { font-family:"Hiragino Sans",sans-serif; font-size:44px; font-weight:700; color:var(--muted); margin:0 10px 0 6px; }
.cmp .g { color:var(--green); }
.brand { position:absolute; left:84px; top:1540px; display:flex; align-items:center; gap:20px; }
.brand img { width:76px; height:76px; border-radius:18px; }
.brand span { font-family:"Barlow C"; font-weight:800; font-size:54px; letter-spacing:.06em; }
"""

def html(lang, kicker, l1, l2, photo, extra):
    bg = f'<div class="photo" style="background-image:url(\'{photo}\')"></div><div class="shade"></div>' if photo else ""
    css = CSS.replace("FONT_URL", (REPO / "fonts/barlow-condensed-800-latin.woff2").as_uri())
    return (f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8"><style>{css}</style></head>'
            f'<body class="{lang}">{bg}<p class="kicker">{kicker}</p><h1>{l1}<em>{l2}</em></h1>{extra}'
            f'<div class="brand"><img src="{ICON.as_uri()}"><span>KURABELL</span></div></body></html>')


def main():
    data = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else REELS / "covers/covers.json"
    only = set(sys.argv[2:])
    out = data.parent / "out"
    out.mkdir(exist_ok=True)
    for c in json.loads(data.read_text(encoding="utf-8")):
        if only and c["name"] not in only:
            continue
        photo = (REELS / c["photo"]).resolve().as_uri() if c.get("photo") else None
        extra = CMP[c["lang"]] if c.get("lastToday") else ""
        page = out / f"{c['name']}.html"
        page.write_text(html(c["lang"], c["kicker"], c["line1"], c["line2"], photo, extra), encoding="utf-8")
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                        "--force-device-scale-factor=1", "--window-size=1080,1920",
                        f"--screenshot={out / (c['name'] + '.png')}", page.as_uri()], check=True, capture_output=True)
        print(c["name"])


if __name__ == "__main__":
    main()
