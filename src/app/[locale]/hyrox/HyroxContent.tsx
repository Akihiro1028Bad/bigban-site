"use client";

import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import HyroxHero from "@/components/hyrox/HyroxHero";
import HyroxFacility from "@/components/hyrox/HyroxFacility";
import HyroxServices from "@/components/hyrox/HyroxServices";
import HyroxIntro from "@/components/hyrox/HyroxIntro";
import HyroxCoach from "@/components/hyrox/HyroxCoach";
import HyroxProgram from "@/components/hyrox/HyroxProgram";

export default function HyroxContent() {
  return (
    <>
      <HomeNavigation />
      <main>
        <HyroxHero />
        <HyroxFacility />
        <HyroxServices />
        <HyroxIntro />
        <HyroxCoach />
        <HyroxProgram />
      </main>
      <HomeFooter />
    </>
  );
}
