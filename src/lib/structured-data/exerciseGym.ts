import { COURT_PRICES, HYROX_LESSON_PRICES } from "@/constants/pricing";
import { SITE_URL } from "@/constants/site";
import {
  FACILITY_TELEPHONE,
  buildFacilityAddress,
  buildFacilityGeo,
  buildFacilityOpeningHours,
} from "./facilityLocation";
import { SEKIYOSHI_ID } from "./person";

import type { Locale } from "@/i18n/routing";
import type {
  GeoCoordinatesSchema,
  OpeningHoursSpecificationSchema,
  PostalAddressSchema,
} from "./facilityLocation";

export interface ExerciseGymSchema {
  "@context": "https://schema.org";
  "@type": "ExerciseGym";
  "@id": string;
  name: string;
  url: string;
  image: string;
  description: string;
  parentOrganization: { "@id": string };
  sport: string[];
  areaServed: { "@type": "AdministrativeArea"; name: string };
  address: PostalAddressSchema;
  geo: GeoCoordinatesSchema;
  telephone: string;
  openingHoursSpecification: OpeningHoursSpecificationSchema[];
  priceRange: string;
  employee: { "@id": string };
}

/** "¥4,980" のような表示用料金を円の数値にする。 */
function toYen(price: string): number {
  return Number(price.replace(/[^0-9]/g, ""));
}

// レッスン・クラスとエリア時間貸し(通常料金)の最小〜最大。
// 料金定数から組み立て、金額を直書きしない。
function buildPriceRange(): string {
  const amounts = [
    ...Object.values(HYROX_LESSON_PRICES).map((lesson) => lesson.priceYen),
    ...COURT_PRICES.flatMap((row) => [row.weekday, row.weekend]).map(toYen),
  ];
  return `¥${Math.min(...amounts)}-¥${Math.max(...amounts)}`;
}

const DESCRIPTION: Record<Locale, string> = {
  ja: "HYROX公式トレーニングクラブに認定された、千葉・本八幡駅徒歩1分のトレーニングジム。公式8種目対応の器具を常設し、現HYROX日本代表・関吉大亮コーチのクラスも開催。",
  en: "An official HYROX Training Club in Chiba, 1 minute from Motoyawata Station. Equipment for all 8 official HYROX stations is permanently set up, with classes led by current HYROX Japan athlete Coach Daisuke Sekiyoshi.",
};

export function buildExerciseGym(locale: Locale): ExerciseGymSchema {
  const url =
    locale === "ja" ? `${SITE_URL}/hyrox` : `${SITE_URL}/${locale}/hyrox`;
  return {
    "@context": "https://schema.org",
    "@type": "ExerciseGym",
    "@id": `${SITE_URL}/#hyrox`,
    name: "THE PICKLE BANG THEORY — HYROX Training Area",
    url,
    image: `${SITE_URL}/images/hyrox/promo-card.jpg`,
    description: DESCRIPTION[locale],
    parentOrganization: { "@id": `${SITE_URL}/#organization` },
    sport: ["HYROX", "Functional Fitness"],
    areaServed: { "@type": "AdministrativeArea", name: "千葉県市川市" },
    address: buildFacilityAddress(),
    geo: buildFacilityGeo(),
    telephone: FACILITY_TELEPHONE,
    openingHoursSpecification: buildFacilityOpeningHours(),
    priceRange: buildPriceRange(),
    employee: { "@id": SEKIYOSHI_ID },
  };
}
