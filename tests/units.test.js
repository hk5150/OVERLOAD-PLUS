import { describe, it, expect, beforeEach } from "vitest";
import { loadDomainModule } from "./helpers/loadDomain.js";

// 保存は常にkg、表示と入力のときだけ換算するという前提を縛る。
// 特に「lbで入力した値がkg保存を経て往復しても元に戻る」ことが崩れると、
// 前回と同じ重量かどうかの判定(セット行のRIR差分)が無言で壊れる。
// docs/多言語化.md の「決定 2」に対応する。

const u = loadDomainModule("src/domain/units.js");

beforeEach(() => u.setUnit("kg"));

describe("単位の決定", () => {
  it("保存された設定を最優先する", () => {
    expect(u.resolveUnit("lb", "ja-JP")).toBe("lb");
    expect(u.resolveUnit("kg", "en-US")).toBe("kg");
  });

  it("保存が無ければアメリカ英語のときだけlbを既定にする", () => {
    expect(u.resolveUnit(null, "en-US")).toBe("lb");
    expect(u.resolveUnit(null, "en-GB")).toBe("kg");
    expect(u.resolveUnit(null, "ja-JP")).toBe("kg");
    expect(u.resolveUnit(null, undefined)).toBe("kg");
  });

  it("未対応の値はkgにフォールバックする", () => {
    expect(u.resolveUnit("stone", "en-US")).toBe("lb");
    expect(u.setUnit("stone")).toBe("kg");
  });
});

describe("kgのときは何も変えない", () => {
  it("換算も丸めも入らない", () => {
    expect(u.toU(62.5)).toBe(62.5);
    expect(u.fromU(62.5)).toBe(62.5);
    expect(u.wU(62.5)).toBe(62.5);
    expect(u.uLabel()).toBe("kg");
  });

  it("端数のあるkg(自重種目の実効重量など)も丸めずに通す", () => {
    expect(u.toU(66.5)).toBe(66.5);
    expect(u.fromU("66.5")).toBe(66.5);
  });

  // 0.5刻みでない重量を入れている既存ユーザーの記録を、表示するだけで書き換えないこと。
  it("0.5刻みでないkgを丸めない", () => {
    expect(u.wU(62.3)).toBe(62.3);
    expect(u.wStr(62.3)).toBe("62.3");
    expect(u.wU(70.25)).toBe(70.25);
  });
});

describe("lb表示への換算", () => {
  beforeEach(() => u.setUnit("lb"));

  it("ラベルがlbになる", () => {
    expect(u.uLabel()).toBe("lb");
  });

  it("100kgは約220.5lb", () => {
    expect(u.toU(100)).toBeCloseTo(220.462, 3);
    expect(u.wU(100)).toBe(220.5);
  });

  it("表示は0.5lb刻みに丸める", () => {
    expect(u.wU(60)).toBe(132.5);   // 132.277… → 132.5
    expect(u.wStr(60)).toBe("132.5");
  });

  it("空欄・不正値は0として扱う(入力途中で落ちないように)", () => {
    expect(u.toU("")).toBe(0);
    expect(u.fromU("")).toBe(0);
    expect(u.toU(undefined)).toBe(0);
    expect(u.wU(null)).toBe(0);
  });
});

describe("lb入力の往復(ここが崩れると同一負荷判定が壊れる)", () => {
  beforeEach(() => u.setUnit("lb"));

  it("5lb刻みの入力は往復しても同じ値に戻る", () => {
    for (let lb = 5; lb <= 500; lb += 5) {
      expect(u.wU(u.fromU(lb)), `${lb}lb`).toBe(lb);
    }
  });

  it("2.5lb刻みの入力も往復しても同じ値に戻る", () => {
    for (let lb = 2.5; lb <= 200; lb += 2.5) {
      expect(u.wU(u.fromU(lb)), `${lb}lb`).toBe(lb);
    }
  });

  it("同じlb入力は必ず同じkg値になる(比較がkgで行われるため)", () => {
    expect(u.fromU(135)).toBe(u.fromU("135"));
    expect(u.fromU(135)).not.toBe(u.fromU(137.5));
  });
});

describe("単位切り替え時の入力値の読み替え", () => {
  it("lb→kg は小数1桁に丸める(入力欄に小数10桁が出ないように)", () => {
    expect(u.convWeightStr("60", "kg", "lb")).toBe("132.5");
    expect(u.convWeightStr("135", "lb", "kg")).toBe("61.2");
  });

  it("lb→kg→lb を全域で往復しても値が戻る(1桁丸めが0.5lb丸めに吸収される)", () => {
    for (let lb = 2.5; lb <= 500; lb += 2.5) {
      const kg = u.convWeightStr(String(lb), "lb", "kg");
      expect(u.convWeightStr(kg, "kg", "lb"), `${lb}lb`).toBe(String(lb));
    }
  });

  it("lbで入力した5lb刻みの値はkgを経由しても表示上ずれない", () => {
    const kg = u.convWeightStr("135", "lb", "kg");
    expect(u.convWeightStr(kg, "kg", "lb")).toBe("135");
  });

  it("同じ単位なら文字列をそのまま返す", () => {
    expect(u.convWeightStr("62.3", "kg", "kg")).toBe("62.3");
  });

  // 未入力を "0" にすると、まだやっていないセットが実施済みに見えてしまう。
  it("空欄は空欄のまま", () => {
    expect(u.convWeightStr("", "kg", "lb")).toBe("");
    expect(u.convWeightStr(null, "kg", "lb")).toBe(null);
  });
});

describe("増加幅", () => {
  it("kgのときは保存値そのまま", () => {
    expect(u.incU(2.5)).toBe(2.5);
    expect(u.incU(5)).toBe(5);
    expect(u.incU(1)).toBe(1);
  });

  // kgの既定値を2.5lb刻みに丸めると、そのまま英語圏の実機の刻みになる。
  // lb専用のテーブルを別に持たずに済むという設計判断の裏付け。
  it("lbのときはkgの既定値がそのまま実機の刻みになる", () => {
    u.setUnit("lb");
    expect(u.incU(5), "マシン").toBe(10);
    expect(u.incU(2.5), "単関節・バーベル / 多関節・バーベル").toBe(5);
    expect(u.incU(2), "多関節・ダンベル片手").toBe(5);
    expect(u.incU(1), "単関節・ダンベル片手").toBe(2.5);
  });

  it("lbの刻みは2.5lbを下回らない(0刻みで±が効かなくなるのを防ぐ)", () => {
    u.setUnit("lb");
    expect(u.incU(0.5)).toBe(2.5);
    expect(u.incU(0)).toBe(2.5);
  });
});
