import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import HyroxHero from "@/components/hyrox/HyroxHero";
import HyroxFacility from "@/components/hyrox/HyroxFacility";
import HyroxServices from "@/components/hyrox/HyroxServices";
import HyroxIntro from "@/components/hyrox/HyroxIntro";
import HyroxFilm from "@/components/hyrox/HyroxFilm";
import HyroxCoach from "@/components/hyrox/HyroxCoach";
import HyroxProgram from "@/components/hyrox/HyroxProgram";
import HyroxPicklePromo from "@/components/hyrox/HyroxPicklePromo";
import HyroxCampaign from "@/components/hyrox/HyroxCampaign";

export default function HyroxContent() {
  return (
    <>
      <HomeNavigation />
      <main>
        <HyroxHero />
        <HyroxCampaign variant="banner" />
        <HyroxFacility />
        <HyroxServices />
        <HyroxIntro />
        <HyroxFilm />
        <HyroxCoach />
        <HyroxProgram />
        <HyroxPicklePromo />
      </main>
      <HomeFooter />
    </>
  );
}
