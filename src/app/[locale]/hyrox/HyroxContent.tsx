"use client";

import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";
import HyroxHero from "@/components/hyrox/HyroxHero";
import HyroxIntro from "@/components/hyrox/HyroxIntro";
import HyroxCoach from "@/components/hyrox/HyroxCoach";
import HyroxStations from "@/components/hyrox/HyroxStations";
import HyroxGallery from "@/components/hyrox/HyroxGallery";
import HyroxProgram from "@/components/hyrox/HyroxProgram";

export default function HyroxContent() {
  return (
    <>
      <HomeNavigation />
      <main>
        <HyroxHero />
        <HyroxIntro />
        <HyroxCoach />
        <HyroxStations />
        <HyroxGallery />
        <HyroxProgram />
      </main>
      <HomeFooter />
    </>
  );
}
