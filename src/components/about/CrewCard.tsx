"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

export interface CrewMember {
  name: string;
  ig?: string;
  image?: string;
  imageAlt?: string;
  imagePosition?: string;
}

interface CrewCardProps {
  member?: CrewMember;
}

export default function CrewCard({ member }: CrewCardProps) {
  const t = useTranslations("About");

  if (!member) {
    return (
      <div className="bg-gradient-to-b from-accent/[0.04] to-transparent border border-text-gray/10 rounded-sm overflow-hidden">
        <div className="aspect-square bg-text-gray/5 flex items-center justify-center">
          <span className="text-text-gray text-sm">{t("photoPlaceholder")}</span>
        </div>
        <div className="p-4 text-center">
          <p className="text-text-light text-sm font-semibold">{t("crew.comingSoon")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-accent/[0.04] to-transparent border border-text-gray/10 rounded-sm overflow-hidden">
      <div className="relative aspect-square bg-text-gray/5 overflow-hidden">
        {member.image ? (
          <Image
            src={member.image}
            alt={member.imageAlt ?? member.name}
            fill
            sizes="(min-width: 640px) 33vw, 50vw"
            className={`object-cover ${member.imagePosition ?? "object-center"}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-text-gray text-sm">{t("photoPlaceholder")}</span>
          </div>
        )}
      </div>
      <div className="p-3 sm:p-4 text-center">
        <p className="text-text-light text-xs sm:text-sm font-semibold leading-tight">{member.name}</p>
        {member.ig && (
          <a
            href={`https://www.instagram.com/${member.ig.replace(/^@/, "")}/`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCtaClick("instagram", "about_crew", member.ig)}
            className="inline-flex items-center gap-1 text-text-gray text-[10px] sm:text-xs mt-1 hover:text-accent motion-safe:transition-colors truncate max-w-full"
          >
            <InstagramIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="truncate">{member.ig}</span>
          </a>
        )}
      </div>
    </div>
  );
}
