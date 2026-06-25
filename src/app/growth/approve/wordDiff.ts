/**
 * 元 vs 新の語句単位 diff(#M4)。DOM 非依存の純ロジック。
 *
 * 文字単位の LCS で「変わっていない/追加/削除」のセグメントに分け、承認画面で
 * 元と新の差分をハイライト表示するために使う(構成案・タイトル等の短文向け)。
 */

export type DiffSegmentType = "same" | "add" | "del";

export interface DiffSegment {
  type: DiffSegmentType;
  text: string;
}

/** before→after の差分セグメント列。連続する同種は1セグメントにまとめる。 */
export function wordDiff(before: string, after: string): DiffSegment[] {
  const a = [...before];
  const b = [...after];
  const m = a.length;
  const n = b.length;
  // LCS 長の DP。
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const segs: DiffSegment[] = [];
  const push = (type: DiffSegmentType, ch: string): void => {
    const last = segs[segs.length - 1];
    if (last && last.type === type) last.text += ch;
    else segs.push({ type, text: ch });
  };

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("del", a[i]);
      i++;
    } else {
      push("add", b[j]);
      j++;
    }
  }
  while (i < m) {
    push("del", a[i]);
    i++;
  }
  while (j < n) {
    push("add", b[j]);
    j++;
  }
  return segs;
}
