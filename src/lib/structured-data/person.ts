import { SITE_URL } from "@/constants/site";

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
