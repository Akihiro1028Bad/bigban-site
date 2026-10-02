import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import type { Locale } from "@/i18n/routing";
import { shouldShowColumns } from "@/lib/columns/visibility";
import HyroxHero from "@/components/hyrox/HyroxHero";
import HyroxFacility from "@/components/hyrox/HyroxFacility";
import HyroxServices from "@/components/hyrox/HyroxServices";
import HyroxIntro from "@/components/hyrox/HyroxIntro";
import HyroxFilm from "@/components/hyrox/HyroxFilm";
import HyroxCoach from "@/components/hyrox/HyroxCoach";
import HyroxNextRace from "@/components/hyrox/HyroxNextRace";
import HyroxProgram from "@/components/hyrox/HyroxProgram";
import HyroxFaq from "@/components/hyrox/HyroxFaq";
import HyroxAccess from "@/components/hyrox/HyroxAccess";
import HyroxPicklePromo from "@/components/hyrox/HyroxPicklePromo";
import HyroxTrial from "@/components/hyrox/HyroxTrial";
import { currentTimeMs } from "@/lib/hyroxRaces";

interface HyroxContentProps {
  locale: Locale;
}

export default async function HyroxContent({ locale }: HyroxContentProps) {
  // 英語はコラムが0件の間、ナビのリンクも入門コラムへの内部リンク(404になる)も出さない。
  const showColumns = await shouldShowColumns(locale);

  return (
    <>
      <HomeNavigation showColumns={showColumns} />
      <main>
        <HyroxHero />
        <HyroxTrial />
        <HyroxFacility />
        <HyroxServices />
        <HyroxIntro showColumnLink={showColumns} />
        <HyroxFilm />
        <HyroxCoach />
        <HyroxNextRace initialNowMs={currentTimeMs()} />
        <HyroxProgram />
        <HyroxFaq />
        <HyroxAccess />
        <HyroxPicklePromo />
      </main>
      <HomeFooter />
    </>
  );
}
