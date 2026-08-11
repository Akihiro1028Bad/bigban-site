import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { Analytics } from "@vercel/analytics/next";
import GoogleAnalyticsTag from "@/components/GoogleAnalyticsTag";
import { SITE_URL, OG_IMAGE } from "@/constants/site";
import PreHydrationScripts from "@/components/PreHydrationScripts";
import { notFound } from "next/navigation";
import { Orbitron, Inter, Noto_Sans_JP } from "next/font/google";
import { routing } from "@/i18n/routing";
import StructuredData from "@/components/StructuredData";
import {
  buildSportsActivityLocation,
  buildOrganization,
  buildWebSite,
  buildPersonNishimura,
  buildPersonYoshida,
} from "@/lib/structured-data";
import "../globals.css";

import type { Metadata, Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
};

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
  display: "swap",
  preload: false,
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface MetadataProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({
  params,
}: MetadataProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const googleVerification = process.env.GOOGLE_SITE_VERIFICATION;

  return {
    metadataBase: new URL(SITE_URL),
    // 各ページは固有名のみ設定し、ブランド名はテンプレートで付与（表記ゆれ防止）。
    // home / teaser はブランド名を含む完成形を title.absolute で渡し二重付与を回避する。
    title: {
      template: "%s | THE PICKLE BANG THEORY",
      default: "THE PICKLE BANG THEORY",
    },
    openGraph: {
      type: "website",
      siteName: t("og.siteName"),
      locale: locale === "ja" ? "ja_JP" : "en_US",
      images: [OG_IMAGE],
    },
    // images は指定しない。指定すると Next.js の自動補完 (twitter.images ←
    // openGraph.images) が止まり、記事の opengraph-image が og:image を上書きしても
    // twitter:image が共通ロゴのまま残る。未指定なら og:image に追従する。
    twitter: {
      card: "summary_large_image",
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    ...(googleVerification
      ? { verification: { google: googleVerification } }
      : {}),
  };
}

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${orbitron.variable} ${inter.variable} ${notoSansJP.variable}`}
      suppressHydrationWarning
    >
      <body className="grain-overlay">
        <PreHydrationScripts />
        <StructuredData
          data={[
            buildWebSite(),
            buildSportsActivityLocation(locale),
            buildOrganization(),
            buildPersonNishimura(),
            buildPersonYoshida(),
          ]}
        />
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Analytics />
        <GoogleAnalyticsTag />
      </body>
    </html>
  );
}
