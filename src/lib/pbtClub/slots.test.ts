import { describe, it, expect } from "vitest";
import { mergeContiguousSlots } from "./slots";

describe("mergeContiguousSlots", () => {
  it("連続する時間帯を1つにまとめる", () => {
    expect(
      mergeContiguousSlots(["6:00-9:00", "9:00-17:00", "17:00-23:00"]),
    ).toEqual(["6:00-23:00"]);
  });

  it("途切れている時間帯はそのまま別々に残す", () => {
    expect(mergeContiguousSlots(["6:00-9:00", "17:00-23:00"])).toEqual([
      "6:00-9:00",
      "17:00-23:00",
    ]);
  });

  it("25:00 のような24時超の表記も扱える", () => {
    expect(mergeContiguousSlots(["17:00-23:00", "23:00-25:00"])).toEqual([
      "17:00-25:00",
    ]);
  });

  it("単独の時間帯はそのまま返し、空配列は空配列を返す", () => {
    expect(mergeContiguousSlots(["9:00-17:00"])).toEqual(["9:00-17:00"]);
    expect(mergeContiguousSlots([])).toEqual([]);
  });

  it("読み取れない表記は結合せずそのまま残す", () => {
    expect(mergeContiguousSlots(["終日", "6:00-9:00"])).toEqual([
      "終日",
      "6:00-9:00",
    ]);
    expect(mergeContiguousSlots(["6:00-9:00", "終日"])).toEqual([
      "6:00-9:00",
      "終日",
    ]);
  });
});
