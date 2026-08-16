import { SITE_URL, RESERVE_PATH } from "@/constants/site";

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
  address: {
    "@type": "PostalAddress";
    addressCountry: string;
    postalCode: string;
    addressRegion: string;
    addressLocality: string;
    streetAddress: string;
  };
  geo: {
    "@type": "GeoCoordinates";
    latitude: number;
    longitude: number;
  };
  telephone: string;
  email: string;
  priceRange: string;
  openingHoursSpecification: Array<{
    "@type": "OpeningHoursSpecification";
    dayOfWeek: string[];
    opens: string;
    closes: string;
  }>;
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

const LATITUDE = 35.7239695;
const LONGITUDE = 139.9317222;

const ALTERNATE_NAMES = [
  "ザ ピックルバン セオリー",
  "ピックルバンセオリー",
] as const;

const DESCRIPTION =
  "千葉県市川市 本八幡駅徒歩1分、営業時間6:00-23:00のインドアピックルボール施設。クロスミントン世界王者 西村昭彦がプロデュース。DecoTurfハードコート3面、トレーニングエリア併設、無人チェックインで利用可能。レッスン、大会、リーグ、イベント会場としても利用可能。";

const SLOGAN = "小さなディンクから、大きなムーブメントへ。";

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
    address: {
      "@type": "PostalAddress",
      addressCountry: "JP",
      postalCode: "272-0021",
      addressRegion: "千葉県",
      addressLocality: "市川市",
      streetAddress: "八幡2-16-6 八幡ハタビル 6階",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: LATITUDE,
      longitude: LONGITUDE,
    },
    telephone: "+81-90-5523-3879",
    email: "hello@rstagency.com",
    priceRange: "¥4980-¥7980",
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        opens: "06:00",
        closes: "23:00",
      },
    ],
    sameAs: ["https://www.instagram.com/thepicklebangtheory"],
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
    hasMap: `https://www.google.com/maps?q=${LATITUDE},${LONGITUDE}`,
    // 会場での支払い手段(= /reserve の FAQ と同じ射程)。特商法ページの
    // 銀行振込は RST Agency の通信販売条件であり、来場者の決済手段ではない。
    paymentAccepted: "Credit Card, PayPay",
    currenciesAccepted: "JPY",
    alternateName: [...ALTERNATE_NAMES],
    description: DESCRIPTION,
    slogan: SLOGAN,
  };
}
