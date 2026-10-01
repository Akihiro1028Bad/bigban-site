// GA4 は自社サイトと LaBOLA を同じプロパティで計測する。ホストを分けて集計するための部品。
// 自動アクセスは 2026-09-16 から LaBOLA のカレンダーに来ている「画面 800x600・Linux」の巡回
// (V 調査 2026-09-30。自社の処理ではなく第三者の巡回とみている)。
export const SITE_HOST = "www.thepicklebang.com";
export const LABOLA_HOST = "yoyaku.labola.jp";
const AUTOMATED_SCREEN = "800x600";
const AUTOMATED_OS = "Linux";

export function stringFilter(fieldName, value, matchType = "EXACT") {
  return { filter: { fieldName, stringFilter: { matchType, value } } };
}

export function hostFilter(host) {
  return stringFilter("hostName", host);
}

/** 画面 800x600 かつ Linux のときだけ除く。どちらか片方だけの実ユーザーは巻き込まない。 */
export function excludeAutomatedAccess() {
  return {
    notExpression: {
      andGroup: {
        expressions: [stringFilter("screenResolution", AUTOMATED_SCREEN), stringFilter("operatingSystem", AUTOMATED_OS)],
      },
    },
  };
}

export function andFilters(...expressions) {
  const list = expressions.filter((expression) => expression !== undefined);
  if (list.length === 0) return undefined;
  return list.length === 1 ? list[0] : { andGroup: { expressions: list } };
}
