// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import { saveSnapshot, type SnapshotFs } from "./snapshot";

function createFs(): SnapshotFs & { order: string[] } {
  const order: string[] = [];
  return {
    order,
    mkdir: vi.fn(async () => {
      order.push("mkdir");
    }),
    writeFile: vi.fn(async () => {
      order.push("writeFile");
    }),
  };
}

describe("saveSnapshot", () => {
  it("日付つきパスに整形済み JSON を書き込み、パスを返す", async () => {
    const fs = createFs();
    const data = { period: { start: "2026-06-08", end: "2026-06-14" } };

    const path = await saveSnapshot(data, {
      fs,
      dir: "/repo/data/snapshots",
      date: "2026-06-18",
    });

    expect(path).toBe("/repo/data/snapshots/2026-06-18.json");
    expect(fs.mkdir).toHaveBeenCalledWith("/repo/data/snapshots", {
      recursive: true,
    });
    expect(fs.writeFile).toHaveBeenCalledWith(
      "/repo/data/snapshots/2026-06-18.json",
      `${JSON.stringify(data, null, 2)}\n`,
      "utf-8"
    );
  });

  it("ディレクトリを作成してからファイルを書く", async () => {
    const fs = createFs();
    await saveSnapshot({ a: 1 }, { fs, dir: "/tmp/x", date: "2026-01-01" });
    expect(fs.order).toEqual(["mkdir", "writeFile"]);
  });
});
