import { describe, it, expect } from "vitest";
import { loadDomainModule } from "../helpers/loadDomain.js";

// window.Capacitor が無い(=ネイティブでない)状態で読み込む。normalizeRows はグローバル関数
// なので、プラグインが取れない場合でも検証できる。
const { normalizeRows } = loadDomainModule("src/domain/db/capacitorSqliteDriver.js", { window: {} });

describe("normalizeRows — iOS実機で確認したCapacitorSQLiteのquery()戻り値の形を吸収する", () => {
  it("先頭要素が {ios_columns:[...]} というメタデータ行の場合、それを取り除いて残りをそのまま返す", () => {
    // 実機で実際に観測した形: [{ios_columns:["key","value"]}, {key:"split",value:"null"}, ...]
    const values = [
      { ios_columns: ["key", "value"] },
      { key: "split", value: "null" },
      { key: "profile", value: "{\"bodyweight\":70}" },
    ];
    expect(normalizeRows(values)).toEqual([
      { key: "split", value: "null" },
      { key: "profile", value: "{\"bodyweight\":70}" },
    ]);
  });

  it("データが0件(メタデータ行のみ)なら空配列を返す", () => {
    expect(normalizeRows([{ ios_columns: ["key", "value"] }])).toEqual([]);
  });

  it("valuesが空配列なら空配列を返す", () => {
    expect(normalizeRows([])).toEqual([]);
  });

  it("先頭要素がios_columnsを持たない通常の行オブジェクトなら、そのまま全件返す(メタ行なしのケース)", () => {
    const values = [{ key: "split", value: "null" }];
    expect(normalizeRows(values)).toEqual(values);
  });

  it("nullやundefinedを渡しても例外を投げず空配列を返す", () => {
    expect(normalizeRows(null)).toEqual([]);
    expect(normalizeRows(undefined)).toEqual([]);
  });
});
