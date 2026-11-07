#!/usr/bin/env python3
"""リールの音をコードで合成する(曲を使わない場合)。
使い方: python3 sound.py <リールのフォルダ>
<フォルダ>/cues.json を読み、<フォルダ>/out/sound.wav を書く(音量の調整は build.sh が -14 LUFS に揃える)。

cues.json の形(秒はすべて映像と同じ時計):
{
  "duration": 15, "bpm": 120,
  "beats": [[2.6, 12.4]],            # この区間はキック(拍頭)とハイハット(裏拍)
  "soft_beats": [[12.4, 15]],         # 弱いキックだけ
  "whoosh": [2.6, 6.0],               # 場面転換(指定時刻の0.25秒前から鳴る)
  "click": [3.0, 3.45],               # 小さな要素が出る瞬間
  "ding": [[10.3, 1318, 1.8, 0.4]],   # [時刻, 周波数Hz, 長さ, 音量] 数字が決まる瞬間・通知
  "pad": [[110, 0, 2.7, 0.06]]        # [周波数Hz, 開始, 長さ, 音量] 持続音
}
"""
import json, sys, wave, os
import numpy as np

folder = sys.argv[1]
cues = json.load(open(os.path.join(folder, "cues.json")))
sr = 48000
T = float(cues["duration"])
n = int(sr * T)
out = np.zeros(n)
rng = np.random.default_rng(7)  # 毎回同じ音になるよう種を固定


def add(sig, at):
    i = int(at * sr)
    if i >= n:
        return
    j = min(n, i + len(sig))
    out[max(i, 0):j] += sig[max(0, -i):j - i]


def kick(a=0.9):
    u = np.arange(int(.35 * sr)) / sr
    f = 50 + 90 * np.exp(-u * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-u * 9) * a


def hat():
    u = np.arange(int(.06 * sr)) / sr
    x = np.diff(rng.standard_normal(len(u)), prepend=0)
    return x * np.exp(-u * 70) * 0.12


def click():
    u = np.arange(int(.05 * sr)) / sr
    return np.sin(2 * np.pi * 2400 * u) * np.exp(-u * 120) * 0.35


def whoosh(d=.45):
    u = np.arange(int(d * sr)) / sr
    k = np.cumsum(rng.standard_normal(len(u)))
    k -= np.convolve(k, np.ones(40) / 40, "same")
    return k / np.abs(k).max() * np.sin(np.pi * u / d) ** 2 * 0.35


def ding(f0, d, a):
    u = np.arange(int(d * sr)) / sr
    return sum(np.sin(2 * np.pi * f0 * m * u) * g for m, g in [(1, 1), (2.01, .4), (3.0, .18)]) * np.exp(-u * 3.2) * a


def pad(f, at, d, a):
    u = np.arange(int(d * sr)) / sr
    env = np.minimum(1, u / .6) * np.minimum(1, (d - u) / .8)
    add(sum(np.sin(2 * np.pi * f * m * u) for m in (1, 1.5, 2)) * env * a, at)


b = 60 / cues.get("bpm", 120)
for s, e in cues.get("beats", []):
    k = 0
    while s + k * b < e:
        add(kick(), s + k * b); add(hat(), s + k * b + b / 2); k += 1
for s, e in cues.get("soft_beats", []):
    k = 0
    while s + k * b < e:
        add(kick(.55), s + k * b); k += 1
for at in cues.get("whoosh", []):
    add(whoosh(), at - 0.25)
for at in cues.get("click", []):
    add(click(), at)
for at, f, d, a in cues.get("ding", []):
    add(ding(f, d, a), at)
for f, at, d, a in cues.get("pad", []):
    pad(f, at, d, a)

t = np.arange(n) / sr
out *= np.minimum(1, (T - t) / 0.6)  # 最後の0.6秒でフェードアウト
out /= np.abs(out).max() * 1.05
os.makedirs(os.path.join(folder, "out"), exist_ok=True)
with wave.open(os.path.join(folder, "out", "sound.wav"), "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((out * 32767).astype(np.int16).tobytes())
print("ok", os.path.join(folder, "out", "sound.wav"))
