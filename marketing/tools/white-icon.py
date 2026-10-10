"""プロフィール写真の背景(暗いグレー)を白にする。

画像の端から「暗くて色の薄い」画素を塗りつぶして背景とみなす(プレートやシャフトの中の暗い部分は端とつながらないので残る)。
境目はぼかして、白に溶かす。プレートの下の影は背景と同じ色なのでいったん消し、薄い影を描き直す。
"""
import numpy as np
from collections import deque
from PIL import Image, ImageFilter

src = Image.open(str(__import__("pathlib").Path(__file__).resolve().parents[2] / "marketing/instagram/assets/icon.png")).convert("RGB")
a = np.asarray(src).astype(np.int16)
h, w, _ = a.shape
mx, mn = a.max(2), a.min(2)
# 背景: 明るさ90以下・彩度が低い(赤いプレート、銀のシャフトのハイライトは外れる)
cand = (mx <= 95) & ((mx - mn) <= 22)
bg = np.zeros((h, w), bool)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if cand[y, x] and not bg[y, x]:
            bg[y, x] = True; q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if cand[y, x] and not bg[y, x]:
            bg[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not bg[ny, nx]:
            bg[ny, nx] = True; q.append((ny, nx))
# 物体の「確かな部分」(赤・明るい銀)を太らせて閉じ、シャフト先端や下側の暗い部分を物体側に戻す
sure = Image.fromarray(((~cand) * 255).astype(np.uint8))
closed = sure.filter(ImageFilter.MaxFilter(45)).filter(ImageFilter.MinFilter(45))
closed = np.asarray(closed) > 127
# 閉じた形の内側の穴も埋める(端から届かない部分は物体)
outside = np.zeros((h, w), bool)
q = deque((y, x) for y in (0, h - 1) for x in range(w) if not closed[y, x])
q.extend((y, x) for x in (0, w - 1) for y in range(h) if not closed[y, x])
for y, x in q: outside[y, x] = True
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and not closed[ny, nx] and not outside[ny, nx]:
            outside[ny, nx] = True; q.append((ny, nx))
bg = bg & outside
fg = Image.fromarray(((~bg) * 255).astype(np.uint8))
# 1px の穴や毛羽を消してから、境目を少しぼかす
# 縁に残る元の暗い背景の線を消すため、輪郭を2px内側に寄せる
fg = fg.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
alpha = np.asarray(fg).astype(np.float32)[..., None] / 255
# 影: 物体の形を下にずらして大きくぼかした薄いグレー
ys, xs = np.nonzero(~bg)
shadow = Image.new("L", (w, h), 0)
sh = np.zeros((h, w), np.uint8)
cy = ys.max()
ell = Image.new("L", (w, h), 0)
from PIL import ImageDraw
d = ImageDraw.Draw(ell)
cx = (xs.min() + xs.max()) / 2
d.ellipse([cx - (xs.max() - xs.min()) * 0.42, cy - 28, cx + (xs.max() - xs.min()) * 0.42, cy + 22], fill=70)
ell = ell.filter(ImageFilter.GaussianBlur(26))
white = np.full((h, w, 3), 255, np.float32)
s = np.asarray(ell).astype(np.float32)[..., None] / 255
base = white * (1 - s) + np.array([150, 150, 150], np.float32) * s
out = a.astype(np.float32) * alpha + base * (1 - alpha)
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(str(__import__("pathlib").Path.home() / "Desktop/KURABELL-reels/profile/profile-white.png"))
print("背景とみなした割合:", round(bg.mean() * 100, 1), "%")
