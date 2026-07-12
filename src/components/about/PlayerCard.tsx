"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import InstagramIcon from "@/components/icons/InstagramIcon";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

export interface Player {
  name: string;
  ig: string;
  bio: string;
  image?: string;
  imageAlt?: string;
}

interface PlayerCardProps {
  player: Player;
}

export default function PlayerCard({ player }: PlayerCardProps) {
  const t = useTranslations("About");

  return (
    <div className="bg-gradient-to-b from-accent/[0.04] to-transparent border border-text-gray/10 rounded-sm overflow-hidden h-full">
      <div className="relative aspect-[4/5] bg-text-gray/5 overflow-hidden">
        {player.image ? (
          <>
            <Image
              src={player.image}
              alt=""
              aria-hidden="true"
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover blur-2xl scale-110"
            />
            <Image
              src={player.image}
              alt={player.imageAlt ?? player.name}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-contain"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-text-gray text-sm">{t("photoPlaceholder")}</span>
          </div>
        )}
      </div>
      <div className="p-6">
        <p className="text-text-light text-lg @lg:text-xl font-semibold mb-1">
          {player.name}
        </p>
        {player.ig && (
          <a
            href={`https://www.instagram.com/${player.ig.replace(/^@/, "")}/`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCtaClick("instagram", "about_player", player.ig)}
            className="inline-flex items-center gap-1.5 text-text-light/90 text-sm @lg:text-base mb-3 hover:text-accent transition-colors"
          >
            <InstagramIcon className="w-4 h-4 @lg:w-[18px] @lg:h-[18px]" />
            <span>{player.ig}</span>
          </a>
        )}
        {player.bio && (
          <p className="text-text-light/90 text-sm @lg:text-base leading-relaxed whitespace-pre-line">
            {player.bio}
          </p>
        )}
      </div>
    </div>
  );
}
