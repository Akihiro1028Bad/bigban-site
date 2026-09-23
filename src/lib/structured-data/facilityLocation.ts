// 施設の所在地・連絡先・営業時間。SportsActivityLocation(/#facility) と
// ExerciseGym(/#hyrox) は同じ建物の同じ施設なので、ここを単一ソースにして
// 片方だけ古くなる二重管理を防ぐ。

import { BUSINESS_HOURS } from "@/constants/site";

export interface PostalAddressSchema {
  "@type": "PostalAddress";
  addressCountry: string;
  postalCode: string;
  addressRegion: string;
  addressLocality: string;
  streetAddress: string;
}

export interface GeoCoordinatesSchema {
  "@type": "GeoCoordinates";
  latitude: number;
  longitude: number;
}

export interface OpeningHoursSpecificationSchema {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string[];
  opens: string;
  closes: string;
}

export const FACILITY_LATITUDE = 35.7239695;
export const FACILITY_LONGITUDE = 139.9317222;

export const FACILITY_TELEPHONE = "+81-90-5523-3879";

export function buildFacilityAddress(): PostalAddressSchema {
  return {
    "@type": "PostalAddress",
    addressCountry: "JP",
    postalCode: "272-0021",
    addressRegion: "千葉県",
    addressLocality: "市川市",
    streetAddress: "八幡2-16-6 八幡ハタビル 6階",
  };
}

export function buildFacilityGeo(): GeoCoordinatesSchema {
  return {
    "@type": "GeoCoordinates",
    latitude: FACILITY_LATITUDE,
    longitude: FACILITY_LONGITUDE,
  };
}

export function buildFacilityOpeningHours(): OpeningHoursSpecificationSchema[] {
  return [
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
      opens: BUSINESS_HOURS.opens,
      closes: BUSINESS_HOURS.closes,
    },
  ];
}
