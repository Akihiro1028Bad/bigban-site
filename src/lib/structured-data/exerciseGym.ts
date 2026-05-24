import { SITE_URL } from "@/constants/site";
import type { Locale } from "@/i18n/routing";

export interface ExerciseGymSchema {
  "@context": "https://schema.org";
  "@type": "ExerciseGym";
  "@id": string;
  name: string;
  url: string;
  parentOrganization: { "@id": string };
  sport: string[];
  areaServed: { "@type": "AdministrativeArea"; name: string };
}

export function buildExerciseGym(locale: Locale): ExerciseGymSchema {
  const url =
    locale === "ja" ? `${SITE_URL}/hyrox` : `${SITE_URL}/${locale}/hyrox`;
  return {
    "@context": "https://schema.org",
    "@type": "ExerciseGym",
    "@id": `${SITE_URL}/#hyrox`,
    name: "THE PICKLE BANG THEORY — HYROX Training Area",
    url,
    parentOrganization: { "@id": `${SITE_URL}/#facility` },
    sport: ["HYROX", "Functional Fitness"],
    areaServed: { "@type": "AdministrativeArea", name: "千葉県市川市" },
  };
}
