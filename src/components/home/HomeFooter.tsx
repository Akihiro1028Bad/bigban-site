"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { NAV_ITEMS } from "@/constants/navigation";

import FooterNewsletter from "./FooterNewsletter";

export default function HomeFooter() {
  const t = useTranslations("Navigation");
  const tFooter = useTranslations("HomeFooter");
  const tCommon = useTranslations("Common");

  return (
    <footer className="bg-deep-black">
      <div className="h-px" style={{ background: 'linear-gradient(90deg, transparent, #306EC3, transparent)' }} />

      <div className="mx-auto max-w-7xl px-6 lg:px-12 py-12 lg:py-16">
        <FooterNewsletter />
      </div>

      <div className="border-t border-text-gray/15" />

      <div className="mx-auto max-w-7xl px-6 lg:px-12 py-12 lg:py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          {/* Left: Logo + Brand display */}
          <div>
            <Image
              src="/logos/yoko-neon.png"
              alt={tCommon("logoAlt")}
              width={200}
              height={32}
              className="h-8 w-auto"
            />
            <p className="mt-3 text-xs tracking-[0.2em] text-text-gray">
              {tFooter("brandJa")}
            </p>
          </div>

          {/* Center: Nav links */}
          <nav className="flex flex-wrap gap-x-6 gap-y-3 justify-center lg:justify-center">
            {NAV_ITEMS.map((item) => {
              const ja = t(`${item.id}Ja`);
              const className =
                "flex flex-col items-center leading-tight text-sm tracking-[0.15em] text-text-gray hover:text-text-light transition-colors";
              const label = (
                <>
                  <span>{t(item.id)}</span>
                  {ja ? (
                    <span
                      aria-hidden
                      className="mt-0.5 text-[9px] font-normal normal-case tracking-normal text-text-gray"
                    >
                      {ja}
                    </span>
                  ) : null}
                </>
              );
              return item.kind === "page" ? (
                <Link key={item.id} href={item.href} className={className}>
                  {label}
                </Link>
              ) : (
                <a key={item.id} href={item.href} className={className}>
                  {label}
                </a>
              );
            })}
          </nav>

        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-text-gray/20">
        <div className="mx-auto max-w-7xl px-6 lg:px-12 py-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <p className="text-xs text-text-gray">
              {tFooter("copyright")}
            </p>
            <Link
              href="/tokushoho"
              className="text-xs text-text-gray hover:text-text-light transition-colors"
            >
              {tFooter("tokushoho")}
            </Link>
          </div>
          <p className="text-xs text-text-gray">
            {tFooter("address")}
          </p>
        </div>
      </div>
    </footer>
  );
}
