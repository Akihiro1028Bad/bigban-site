import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import { isCmsColumnsEnabled } from "@/config/featureFlags";
import HyroxHero from "@/components/hyrox/HyroxHero";
import HyroxFacility from "@/components/hyrox/HyroxFacility";
import HyroxServices from "@/components/hyrox/HyroxServices";
import HyroxIntro from "@/components/hyrox/HyroxIntro";
import HyroxFilm from "@/components/hyrox/HyroxFilm";
import HyroxCoach from "@/components/hyrox/HyroxCoach";
import HyroxNextRace from "@/components/hyrox/HyroxNextRace";
import HyroxProgram from "@/components/hyrox/HyroxProgram";
import HyroxPicklePromo from "@/components/hyrox/HyroxPicklePromo";
import { currentTimeMs } from "@/lib/hyroxRaces";

export default function HyroxContent() {
  const showColumns = isCmsColumnsEnabled();

  return (
    <>
      <HomeNavigation showColumns={showColumns} />
      <main>
        <HyroxHero />
        <HyroxFacility />
        <HyroxServices />
        <HyroxIntro showColumnLink={showColumns} />
        <HyroxFilm />
        <HyroxCoach />
        <HyroxNextRace initialNowMs={currentTimeMs()} />
        <HyroxProgram />
        <HyroxPicklePromo />
      </main>
      <HomeFooter />
    </>
  );
}
