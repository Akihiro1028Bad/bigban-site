"use client";

import { useTranslations } from "next-intl";
import HomeNavigation from "@/components/home/HomeNavigation";
import HomeFooter from "@/components/home/HomeFooter";

const ITEM_KEYS = [
  "seller",
  "manager",
  "address",
  "phone",
  "hours",
  "email",
  "website",
  "price",
  "additionalFees",
  "delivery",
  "paymentMethod",
  "paymentTiming",
  "cardPayment",
  "returns",
  "deadline",
  "shippingCost",
] as const;

const HREF_MAP: Readonly<Record<string, string>> = {
  phone: "tel:09055233879",
  email: "mailto:hello@rstagency.com",
  website: "https://rstagency.com",
};

interface TokushohoContentProps {
  /** COLUMN ナビリンク表示フラグ(server で isCmsColumnsEnabled() を渡す)。既定 false。 */
  showColumns?: boolean;
}

export default function TokushohoContent({
  showColumns = false,
}: TokushohoContentProps) {
  const t = useTranslations("Tokushoho");

  return (
    <>
      <HomeNavigation showColumns={showColumns} />
      <main className="min-h-screen bg-deep-black text-text-light pt-[calc(6rem+var(--promo-banner-h))] lg:pt-[calc(7rem+var(--promo-banner-h))]">
        <div className="mx-auto max-w-3xl px-6 lg:px-12 py-16 lg:py-20">
          <h1 className="text-2xl lg:text-3xl font-bold tracking-wide mb-12">
            {t("heading")}
          </h1>

          <dl className="divide-y divide-text-gray/10">
            {ITEM_KEYS.map((key) => {
              const href = HREF_MAP[key];
              const value = t(`${key}Value`);
              const isExternal = href?.startsWith("http");

              return (
                <div
                  key={key}
                  className="py-5 sm:grid sm:grid-cols-3 sm:gap-4"
                >
                  <dt className="text-sm font-medium text-text-gray">
                    {t(key)}
                  </dt>
                  <dd className={`mt-1 text-sm text-text-light sm:col-span-2 sm:mt-0${key === "address" ? " whitespace-pre-line" : ""}`}>
                    {href ? (
                      <a
                        href={href}
                        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                        className="text-accent hover:underline"
                      >
                        {value}
                      </a>
                    ) : (
                      value
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      </main>
      <HomeFooter />
    </>
  );
}
