import { SITE_URL } from "@/constants/site";

export interface ServiceSchema {
  "@context": "https://schema.org";
  "@type": "Service";
  name: string;
  description: string;
  serviceType: string;
  provider: { "@id": string };
  areaServed: {
    "@type": "AdministrativeArea";
    name: string;
  };
}

interface ServiceDefinition {
  name: string;
  description: string;
  serviceType: string;
}

const SERVICE_DEFINITIONS: readonly ServiceDefinition[] = [
  {
    name: "コートレンタル",
    description:
      "時間貸しのレンタルコート。無人チェックインで手軽に予約・利用可能。早朝6:00から深夜23:00まで。",
    serviceType: "コートレンタル",
  },
  {
    name: "レッスン & クリニック",
    description:
      "トップ選手による直接指導。レベル別プログラムで初心者から上級者まで対応。海外トッププレーヤーを招聘した特別クリニックも開催予定。",
    serviceType: "ピックルボールレッスン",
  },
  {
    name: "トレーニングプログラム",
    description:
      "フィジカルトレーニングを取り入れたピックルボール強化プログラム。併設トレーニングエリアでコンディショニング。プレーの質を根本から高める。",
    serviceType: "トレーニングプログラム",
  },
  {
    name: "大会 & リーグ",
    description:
      "オリジナル大会・リーグを定期開催。賞金付きトーナメントから幅広いレベルに対応したリーグ戦まで。",
    serviceType: "大会・リーグ運営",
  },
  {
    name: "イベント",
    description:
      "1面ショーコートへのレイアウト変更で本格的な観戦イベントを実現。異業種コラボレーションやプロモーションイベントの会場としても。",
    serviceType: "イベント企画・会場提供",
  },
  {
    name: "HYROXトレーニング",
    description:
      "ランニングと8種目のファンクショナルワークアウトで競う世界的フィットネスレース HYROX。本格的なトレーニングエリアを併設予定。",
    serviceType: "HYROXトレーニング",
  },
] as const;

const AREA_SERVED = {
  "@type": "AdministrativeArea" as const,
  name: "千葉県市川市",
};

export function buildServices(): ServiceSchema[] {
  return SERVICE_DEFINITIONS.map((def) => ({
    "@context": "https://schema.org",
    "@type": "Service",
    name: def.name,
    description: def.description,
    serviceType: def.serviceType,
    provider: { "@id": `${SITE_URL}/#facility` },
    areaServed: AREA_SERVED,
  }));
}
