import {
  SITE_URL,
  RESERVE_PATH,
  INSTAGRAM_URL,
  GOOGLE_BUSINESS_PROFILE_URL,
  LABOLA_SHOP_URL,
  TENNISBEAR_EVENTS_URL,
} from "@/constants/site";
import {
  FACILITY_LATITUDE,
  FACILITY_LONGITUDE,
  FACILITY_TELEPHONE,
  buildFacilityAddress,
  buildFacilityGeo,
  buildFacilityOpeningHours,
} from "./facilityLocation";

import type {
  GeoCoordinatesSchema,
  OpeningHoursSpecificationSchema,
  PostalAddressSchema,
} from "./facilityLocation";

export interface LocationFeatureSpecification {
  "@type": "LocationFeatureSpecification";
  name: string;
  value: boolean;
}

export interface SportsActivityLocationSchema {
  "@context": "https://schema.org";
  "@type": "SportsActivityLocation";
  "@id": string;
  name: string;
  url: string;
  logo: string;
  image: string;
  sport: string;
  address: PostalAddressSchema;
  geo: GeoCoordinatesSchema;
  telephone: string;
  email: string;
  priceRange: string;
  openingHoursSpecification: OpeningHoursSpecificationSchema[];
  sameAs: string[];
  parentOrganization: { "@id": string };
  potentialAction: {
    "@type": "ReserveAction";
    target: string;
  };
  amenityFeature: LocationFeatureSpecification[];
  hasMap: string;
  paymentAccepted: string;
  currenciesAccepted: string;
  alternateName: string[];
  description: string;
  slogan: string;
}

const AMENITY_NAMES = [
  "空調完備",
  "男女別更衣室",
  "レンタル用具",
  "無人チェックイン",
  "自動販売機",
] as const;

const ALTERNATE_NAMES = [
  "ザ ピックルバン セオリー",
  "ピックルバンセオリー",
] as const;

const DESCRIPTION =
  "千葉県市川市 本八幡駅徒歩1分、営業時間6:00-23:00のインドアピックルボール施設。クロスミントン世界王者 西村昭彦がプロデュース。DecoTurfハードコート3面、トレーニングエリア併設、無人チェックインで利用可能。レッスン、大会、リーグ、イベント会場としても利用可能。";

const SLOGAN = "小さなディンクから、大きなムーブメントへ。";

// 施設の同一性シグナル。ここに並ぶ外部プロフィールが本サイトと同一実体である
// ことを申告し、ナレッジパネル / ローカルパックでの実体解決を助ける。
// 自サイトの URL は url / @id で示すため含めない。
const SAME_AS = [
  INSTAGRAM_URL,
  GOOGLE_BUSINESS_PROFILE_URL,
  LABOLA_SHOP_URL,
  TENNISBEAR_EVENTS_URL,
] as const;

export function buildSportsActivityLocation(
  _locale: string
): SportsActivityLocationSchema {
  return {
    "@context": "https://schema.org",
    "@type": "SportsActivityLocation",
    "@id": `${SITE_URL}/#facility`,
    name: "THE PICKLE BANG THEORY",
    url: SITE_URL,
    logo: `${SITE_URL}/logos/yoko-neon.png`,
    image: `${SITE_URL}/images/facility.webp`,
    sport: "Pickleball",
    address: buildFacilityAddress(),
    geo: buildFacilityGeo(),
    telephone: FACILITY_TELEPHONE,
    email: "hello@rstagency.com",
    priceRange: "¥4980-¥7980",
    openingHoursSpecification: buildFacilityOpeningHours(),
    sameAs: [...SAME_AS],
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
      "@type": "ReserveAction",
      target: `${SITE_URL}${RESERVE_PATH}`,
    },
    amenityFeature: AMENITY_NAMES.map((name) => ({
      "@type": "LocationFeatureSpecification",
      name,
      value: true,
    })),
    hasMap: `https://www.google.com/maps?q=${FACILITY_LATITUDE},${FACILITY_LONGITUDE}`,
    // 会場での支払い手段(= /reserve の FAQ と同じ射程)。特商法ページは
    // 銀行振込を含む3種を法定表示しているが、あちらは請求・振込を伴う取引も
    // 含む網羅列挙なので、施設情報としてはここに載せない。
    paymentAccepted: "Credit Card, PayPay",
    currenciesAccepted: "JPY",
    alternateName: [...ALTERNATE_NAMES],
    description: DESCRIPTION,
    slogan: SLOGAN,
  };
}
