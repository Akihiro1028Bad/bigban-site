/**
 * 支援者ウォール(/contributors)の掲載データ。
 *
 * クラウドファンディングの支援者エクスポートから、掲載に必要な項目だけを抜き出したもの。
 * 住所・電話番号・メールアドレス・郵便番号・支援金額は意図的に一切持ち込まない。
 * 応援コメントもリターンの約束(お名前＋リンクの掲載)に含まれないため持たない。
 *
 * 設計書: docs/superpowers/specs/2026-07-31-contributors-wall-design.md
 */

export type ContributorTier = "large" | "medium" | "small";

export interface ContributorLogoAsset {
  readonly src: string;
  readonly alt: string;
  /** 縦横比 (width / height)。器の中で contain させるために使う。 */
  readonly aspect: number;
}

export interface Contributor {
  readonly id: string;
  readonly tier: ContributorTier;
  /** 掲載名。備考欄の自由記述から抽出したもの。 */
  readonly name: string;
  /** 掲載希望リンク。希望が無い支援者は undefined。 */
  readonly url?: string;
  readonly logo?: ContributorLogoAsset;
}

const LOGO_YAMATO: ContributorLogoAsset = {
  src: "/contributors/logos/29yamato.jpg",
  alt: "焼肉やまと",
  aspect: 907 / 443,
};

const LOGO_YANESEN: ContributorLogoAsset = {
  src: "/contributors/logos/yanesen-lab-tokyo.png",
  alt: "YANESEN Lab Tokyo",
  aspect: 1,
};

const LOGO_PICKLEBALL_ONE: ContributorLogoAsset = {
  src: "/contributors/logos/pickleball-one.png",
  alt: "株式会社ピックルボールワン",
  aspect: 1755 / 697,
};

export const CONTRIBUTORS: readonly Contributor[] = [
  // ── 大(70,000円) ────────────────────────────────────────────────
  {
    id: "yamato",
    tier: "large",
    name: "焼肉やまと",
    url: "https://29yamato.com/",
    logo: LOGO_YAMATO,
  },
  {
    id: "yanesen-lab",
    tier: "large",
    name: "谷根千ラボ東京",
    logo: LOGO_YANESEN,
    // 備考: 掲載の実務連絡先が別メールに指定されている。リンク先URL未確定。
  },
  {
    id: "pickle-peak",
    tier: "large",
    name: "ピックルピーク",
    url: "https://pickle-peak.com/index.html",
  },
  {
    id: "oarai-btc",
    tier: "large",
    name: "大洗町ビーチテニス＆ピックルボールクラブ",
    url: "https://0202vsignsports.wixsite.com/oaraibtc",
  },
  {
    id: "yuta-ogino",
    tier: "large",
    name: "YUTA OGINO",
    // 備考が「後ほど本人と相談」。掲載名未確定。
  },
  {
    id: "yuki-sadakane",
    tier: "large",
    name: "YUKI SADAKANE",
    // 備考に文字数制限の問い合わせあり。要返信。
  },

  // ── 中(50,000円) ────────────────────────────────────────────────
  {
    id: "pickleball-one",
    tier: "medium",
    name: "株式会社ピックルボールワン",
    logo: LOGO_PICKLEBALL_ONE,
  },
  { id: "hiro-san", tier: "medium", name: "ひろさん" },
  {
    id: "yuta-yoshida",
    tier: "medium",
    name: "吉田 祐太",
    url: "https://www.instagram.com/yuta_yoshida_pickleball",
  },

  // ── 小(20,000円) ────────────────────────────────────────────────
  {
    id: "chiba-pb",
    tier: "small",
    name: "一般社団法人千葉県ピックルボール協会",
    url: "https://pickleball-chiba.com/",
  },
  {
    id: "ibex-sports",
    tier: "small",
    name: "アイベックスポーツ",
    url: "https://ibex-sports.co.jp/",
  },
  {
    id: "kei-sawaki",
    tier: "small",
    name: "Kei SAWAKI",
    url: "https://www.instagram.com/keipball",
  },
  {
    id: "aoi-nakata",
    tier: "small",
    name: "AOI NAKATA",
    url: "https://www.instagram.com/aoi_pickleball",
  },
  {
    id: "picklepon",
    tier: "small",
    name: "Picklepon & Yonepis",
    url: "https://www.instagram.com/picklepon95/",
    // 備考: 文字数超過時は掲載名の修正またはバナー掲載への変更を希望。
  },
  {
    id: "akihisa-kawamoto",
    tier: "small",
    name: "AKIHISA KAWAMOTO",
    url: "https://www.akika-enterprises.com/",
  },
  {
    id: "tharia",
    tier: "small",
    name: "THARIA",
    url: "https://tharia.theshop.jp/",
    // 備考: 数ヶ月以内にロゴ変更予定。差し替え前提。
  },
  { id: "pkuru", tier: "small", name: "pkuru.com" },
  { id: "takehiko-toyoda", tier: "small", name: "豊田 毅彦" },
  { id: "tomotaka-endo", tier: "small", name: "遠藤 共峻" },
  { id: "suzuko-k", tier: "small", name: "Suzuko K." },
  { id: "eiichiro-nemoto", tier: "small", name: "根本英一郎" },
  {
    id: "takehiko-iwanaga",
    tier: "small",
    name: "岩永武彦",
    // 備考: 長い掲載名が可なら「岩永武彦(栃木県喜連川)」を希望。
  },
  { id: "yasunori-matsudaira", tier: "small", name: "松平泰紀" },
  {
    id: "masayoshi-ono",
    tier: "small",
    name: "小野 正善",
    // 備考欄にリターン説明文がそのまま貼られている。掲載名不明。
  },
] as const;

export const TIER_ORDER: readonly ContributorTier[] = ["large", "medium", "small"];

/** 指定ランクの支援者を、データ定義順のまま返す。 */
export function byTier(tier: ContributorTier): readonly Contributor[] {
  return CONTRIBUTORS.filter((c) => c.tier === tier);
}
