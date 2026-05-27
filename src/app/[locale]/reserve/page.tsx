import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { parseLocale } from "@/i18n/routing";

interface ReservePageProps {
  params: Promise<{ locale: string }>;
}

export default async function ReservePage({ params }: ReservePageProps) {
  const { locale: rawLocale } = await params;
  const locale = parseLocale(rawLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  return (
    <main className="min-h-screen bg-deep-black flex flex-col items-center py-16 px-4">
      <h1 className="text-text-light font-serif text-2xl sm:text-3xl tracking-wide mb-8">
        予約（埋め込みテスト）
      </h1>
      <div className="w-full max-w-[1100px]">
        <iframe
          src="https://yoyaku.labola.jp/r/shop/3452/event/?embed=normal"
          title="予約フォーム"
          className="w-full h-[500px] border-0 bg-white rounded-sm"
        />
      </div>
    </main>
  );
}
