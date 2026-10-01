import { describe, it, expect } from "vitest";
import {
  PBT_CLUB_ADVANCE_BOOKING_DAYS,
  PBT_CLUB_MONTHLY_FEE_YEN,
  PBT_CLUB_MONTHLY_HOUR_CAP,
  PBT_CLUB_POINT_RATE_PERCENT,
} from "@/constants/pbtClub";
import { COURT_PRICES } from "@/constants/pricing";
import { buildRateRows, formatYen } from "@/lib/pbtClub/breakeven";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";

/** オブジェクトの葉までのキーパスを列挙する(配列は要素数をキーに含める)。 */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => keyPaths(item, `${prefix}[${i}]`));
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, child]) =>
      keyPaths(child, prefix === "" ? key : `${prefix}.${key}`),
    );
  }
  return [prefix];
}

interface FaqItem {
  question: string;
  answer: string;
}

const peakRow = buildRateRows(COURT_PRICES, PBT_CLUB_MONTHLY_FEE_YEN).at(-1);
if (!peakRow) throw new Error("料金行が空");

describe("PbtClub 文言", () => {
  it("ja と en でキー構造が一致する", () => {
    expect(keyPaths(enMessages.PbtClub)).toEqual(keyPaths(jaMessages.PbtClub));
  });

  it("ja と en の Metadata.pbtClub がどちらも title/description を持つ", () => {
    for (const messages of [jaMessages, enMessages]) {
      expect(messages.Metadata.pbtClub.title.length).toBeGreaterThan(0);
      expect(messages.Metadata.pbtClub.description.length).toBeGreaterThan(0);
    }
  });

  it("FAQ は ja/en で同数・全て非空", () => {
    const ja = jaMessages.PbtClub.faq.items as FaqItem[];
    const en = enMessages.PbtClub.faq.items as FaqItem[];
    expect(ja.length).toBeGreaterThan(0);
    expect(en).toHaveLength(ja.length);
    for (const item of [...ja, ...en]) {
      expect(item.question.trim()).not.toBe("");
      expect(item.answer.trim()).not.toBe("");
    }
  });

  it("FAQ の数字が確定値の定数と一致する(ja)", () => {
    const text = (jaMessages.PbtClub.faq.items as FaqItem[])
      .map((i) => i.answer)
      .join("\n");
    expect(text).toContain(formatYen(PBT_CLUB_MONTHLY_FEE_YEN));
    expect(text).toContain(`月${PBT_CLUB_MONTHLY_HOUR_CAP}時間`);
    expect(text).toContain(`${PBT_CLUB_ADVANCE_BOOKING_DAYS.general}日前`);
    expect(text).toContain(`${PBT_CLUB_ADVANCE_BOOKING_DAYS.member}日前`);
    expect(text).toContain(`${PBT_CLUB_POINT_RATE_PERCENT}%`);
  });

  it("FAQ の数字が確定値の定数と一致する(en)", () => {
    const text = (enMessages.PbtClub.faq.items as FaqItem[])
      .map((i) => i.answer)
      .join("\n");
    expect(text).toContain(formatYen(PBT_CLUB_MONTHLY_FEE_YEN));
    expect(text).toContain(`${PBT_CLUB_MONTHLY_HOUR_CAP} hours`);
    expect(text).toContain(`${PBT_CLUB_ADVANCE_BOOKING_DAYS.general} days`);
    expect(text).toContain(`${PBT_CLUB_ADVANCE_BOOKING_DAYS.member} days`);
    expect(text).toContain(`${PBT_CLUB_POINT_RATE_PERCENT}%`);
  });

  it("メタ説明の損益分岐が計算値(平日夜・土日祝)と一致する", () => {
    expect(jaMessages.Metadata.pbtClub.description).toContain(
      `月${peakRow.breakEvenHours}時間`,
    );
    expect(enMessages.Metadata.pbtClub.description).toContain(
      `${peakRow.breakEvenHours} hours`,
    );
  });

  it("販促バナーの aria-label がニュース記事ではなく PBT CLUB ページを案内する", () => {
    expect(jaMessages.PromoBanner.ariaLabelPbtClub).not.toMatch(/ニュース/);
    expect(jaMessages.PromoBanner.ariaLabelPbtClub).toContain("PBT CLUB");
    expect(enMessages.PromoBanner.ariaLabelPbtClub).not.toMatch(/news/i);
    expect(enMessages.PromoBanner.ariaLabelPbtClub).toContain("PBT CLUB");
  });
});
