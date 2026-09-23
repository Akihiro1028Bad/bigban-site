import { COACH_INSTAGRAM_URL, SITE_URL } from "@/constants/site";

import type { Locale } from "@/i18n/routing";

export interface PersonSchema {
  "@context": "https://schema.org";
  "@type": "Person";
  "@id": string;
  name: string;
  alternateName: string[];
  jobTitle: string;
  description: string;
  worksFor: { "@id": string };
  sameAs: string[];
  knowsAbout: string[];
}

const ORG_REF = { "@id": `${SITE_URL}/#organization` } as const;
const INSTAGRAM_NISHIMURA = "https://www.instagram.com/akihiko.rst";
const INSTAGRAM_YOSHIDA = "https://www.instagram.com/yuta_yoshida_pickleball";
const BRAND = "THE PICKLE BANG THEORY";

// ExerciseGym の employee から参照する。/hyrox ページでのみ出力する。
export const SEKIYOSHI_ID = `${SITE_URL}/#person-sekiyoshi`;

const SEKIYOSHI_TEXT: Record<Locale, { jobTitle: string; description: string }> = {
  ja: {
    jobTitle: `HYROX日本代表 / ${BRAND} メインコーチ`,
    description: `日本におけるHYROXの先駆者であり、現HYROX日本代表。スパルタンレース初代日本王者、トライアスロンでも日本一に輝いたハイブリッドアスリート。${BRAND}（ザ ピックルバン セオリー）のHYROXメインコーチ。`,
  },
  en: {
    jobTitle: `HYROX Japan National Team athlete / Head Coach at ${BRAND}`,
    description: `A pioneer of HYROX in Japan and a current HYROX Japan National Team athlete. Spartan Race's first-ever Japanese champion and a national triathlon title holder. Head HYROX coach at ${BRAND}.`,
  },
};

export function buildPersonNishimura(): PersonSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${SITE_URL}/#person-nishimura`,
    name: "西村昭彦",
    alternateName: ["Akihiko Nishimura", "ニシムラアキヒコ"],
    jobTitle: "RST Agency株式会社 代表取締役 / 施設プロデューサー",
    description: `クロスミントン世界選手権ミックスダブルス4連覇・シングルス2連覇を達成した世界最優秀選手。2023年よりピックルボールに転向し、選手活動に加え大会ディレクター・施設プロデューサーとして活動。${BRAND}（ザ ピックルバン セオリー）の創業者。`,
    worksFor: ORG_REF,
    sameAs: [INSTAGRAM_NISHIMURA],
    knowsAbout: [
      "Pickleball",
      "Crossminton",
      "Badminton",
      "ラケットスポーツ",
    ],
  };
}

export function buildPersonYoshida(): PersonSchema {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": `${SITE_URL}/#person-yoshida`,
    name: "吉田 祐太",
    alternateName: ["吉田祐太", "Yuta Yoshida", "ヨシダユウタ"],
    jobTitle: "PBT契約選手 / プロピックルボールプレイヤー",
    description: `東京都出身のピックルボール選手。クロスミントン世界ランキング1位を獲得後、2023年からピックルボールを開始。Pickleball X Championship 2025 優勝、Pickleball Award Japan年間特別選手賞受賞、2025年賞金王。${BRAND}（ザ ピックルバン セオリー）契約選手。`,
    worksFor: ORG_REF,
    sameAs: [INSTAGRAM_YOSHIDA],
    knowsAbout: [
      "Pickleball",
      "Crossminton",
      "Soft Tennis",
      "ラケットスポーツ",
    ],
  };
}

export function buildPersonSekiyoshi(locale: Locale): PersonSchema {
  const text = SEKIYOSHI_TEXT[locale];
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": SEKIYOSHI_ID,
    name: "関吉大亮",
    alternateName: ["Daisuke Sekiyoshi", "せきよしだいすけ"],
    jobTitle: text.jobTitle,
    description: text.description,
    worksFor: ORG_REF,
    sameAs: [COACH_INSTAGRAM_URL],
    knowsAbout: [
      "HYROX",
      "Functional Fitness",
      "Spartan Race",
      "Triathlon",
    ],
  };
}
