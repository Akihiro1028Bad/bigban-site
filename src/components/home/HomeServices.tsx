"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

import { Link } from "@/i18n/navigation";
import { EASE } from "@/constants/motion";
import { RESERVE_PATH, reserveHref } from "@/constants/site";
import { trackCtaClick } from "@/lib/analytics/trackEvent";

/**
 * SERVICES に並べるのは「実際に予約できる商品」だけで、/reserve の選択カードと
 * 1対1で対応させる。かつて存在した 03 トレーニングプログラム・04 大会&リーグは、
 * 対応する予約商品が無く CTA を持てないまま読むだけのブロックになっていたため
 * 取り下げた（トレーニングの受け皿は HYROX グループの2枚と解説リンクが担う）。
 */
interface ServiceCard {
  /** messages の HomeServices 配下のキー。 */
  key: string;
  href: string;
  /** GA4 の集計軸。既存系列を切らないため home_services_court は改名しない。 */
  location: string;
  imageSrc: string;
}

// 枠貸しの2枚は ?tab= で /reserve のカレンダー初期タブまで合わせる。
// イベント/クラスは labola の枠貸しとは別系統で対応するタブが無いため素の /reserve。
const PICKLEBALL_CARDS: readonly ServiceCard[] = [
  {
    key: "courtRental",
    href: reserveHref("pickleball"),
    location: "home_services_court",
    imageSrc: "/images/rental.webp",
  },
  {
    key: "pickleEvent",
    href: RESERVE_PATH,
    location: "home_services_pickle_event",
    imageSrc: "/images/open-play.webp",
  },
];

const HYROX_CARDS: readonly ServiceCard[] = [
  {
    key: "hyroxArea",
    href: reserveHref("hyrox"),
    location: "home_services_hyrox_area",
    imageSrc: "/images/hyrox/facility-4.jpg",
  },
  {
    key: "hyroxClass",
    href: RESERVE_PATH,
    location: "home_services_hyrox_lesson",
    imageSrc: "/images/hyrox/class-session.webp",
  },
];

const NOTE_KEYS = ["notePaddle", "noteShoes"] as const;

function ServiceCardGrid({ cards }: { cards: readonly ServiceCard[] }) {
  const t = useTranslations("HomeServices");

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:gap-8">
      {cards.map((card, i) => (
        <motion.article
          key={card.key}
          data-service-card
          className="group flex flex-col overflow-hidden rounded-sm border border-t-2 border-accent/40 border-t-accent bg-white/[0.02]"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, delay: i * 0.12, ease: EASE }}
        >
          {/* モバイルは横長に潰して縦の総量を抑える。 */}
          <div className="relative aspect-[2/1] w-full overflow-hidden sm:aspect-[16/10]">
            <Image
              src={card.imageSrc}
              alt={t(`${card.key}.imageAlt`)}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-105"
            />
          </div>

          <div className="flex flex-1 flex-col p-5 sm:p-7">
            <p className="text-[10px] tracking-[0.25em] text-text-gray">
              {t(`${card.key}.titleEn`)}
            </p>
            {/* font-serif(Orbitron) に和文グリフが無いため、和文見出しは font-sans。
                見出し階層は h2 SERVICES > h3 グループ > h4 商品。 */}
            {/* 24px への拡大は lg から。sm〜md はカード幅が狭く、24px だと
                「オープンプレー・練習会・体験会・大会」が語中で分断される。
                break-keep で折り返しを「・」に限定し、text-balance で2行の長さを
                揃える（無しだと 390〜1024px で「大会」だけが2行目に残る）。 */}
            <h4 className="mt-2 text-balance break-keep font-sans text-xl font-black tracking-wide text-text-light lg:text-2xl">
              {t(`${card.key}.titleJa`)}
            </h4>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-text-gray">
              {t(`${card.key}.description`)}
            </p>
            <Link
              data-service-cta
              href={card.href}
              onClick={() =>
                trackCtaClick("reserveEntry", card.location, t(`${card.key}.cta`))
              }
              className="mt-6 inline-flex w-full items-center justify-center gap-2 bg-accent px-6 py-3.5 text-sm font-bold tracking-[0.15em] text-deep-black transition-all hover:gap-3 hover:bg-accent/90"
            >
              {t(`${card.key}.cta`)}
              <span aria-hidden className="text-base leading-none">
                →
              </span>
            </Link>
          </div>
        </motion.article>
      ))}
    </div>
  );
}

function GroupHeading({
  enKey,
  jaKey,
  leadKey,
}: {
  enKey: string;
  jaKey: string;
  /** カードを読む前に「まず何をすればいいか」を示す導入文。 */
  leadKey: string;
}) {
  const t = useTranslations("HomeServices");

  return (
    <motion.div
      className="mb-6"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 1.0, ease: EASE }}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-text-gray/20 pb-3">
        <h3 className="font-serif text-2xl font-black tracking-[0.2em] text-text-light sm:text-3xl">
          {t(enKey)}
        </h3>
        <span className="text-xs tracking-[0.2em] text-text-gray">
          {t(jaKey)}
        </span>
      </div>
      {/* max-w-3xl(768px)だと HYROX の導入文が2行になり「時/間単位」で語中分断された。
          5xl まで広げて lg 以上は1行に収める。text-balance は折り返す幅で行長を揃える。
          break-keep は使わない: 句読点のない長い文節（「ランと8種目の…レース。」＝約385px）が
          折り返せず、モバイルで横スクロールが発生する。 */}
      <p className="mt-4 max-w-5xl text-balance text-sm leading-relaxed text-text-gray">
        {t(leadKey)}
      </p>
    </motion.div>
  );
}

/**
 * /hyrox への解説導線。カード2枚はどちらも予約の言葉で書かれており、
 * HYROX を知らない人はクリックしない。撤去した HomeHyroxPromo が担っていた
 * 「HYROXとは何か」の入口をここで引き継ぐ（GA の location も同じ）。
 *
 * ベタ塗りは予約CTA専用に温存し、枠線ボタンで一段下の階層に置く。
 */
function HyroxAboutLink() {
  const t = useTranslations("HomeServices");

  return (
    <motion.div
      className="mt-6 text-center"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-120px" }}
      transition={{ duration: 1.0, delay: 0.15, ease: EASE }}
    >
      <Link
        href="/hyrox"
        onClick={() => trackCtaClick("contentClick", "home_hyrox_promo", "hyrox")}
        className="group inline-flex items-center justify-center gap-1.5 border border-accent px-6 py-3 text-xs font-bold tracking-wider text-accent transition-colors hover:bg-accent hover:text-deep-black"
      >
        {t("hyroxAbout")}
        <span
          aria-hidden
          className="text-sm leading-none transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </Link>
    </motion.div>
  );
}

export default function HomeServices() {
  const t = useTranslations("HomeServices");

  return (
    // off-white は名前に反して #0a0a1a（濃紺寄りの黒）。前後の FACILITY / HYROX が
    // 純黒 (#000) なので、わずかに浮くこの帯で「予約できるものの一覧」という
    // 章の切れ目を作る。サイト全体がダークパレットのため白帯にはしない。
    <section id="services" className="bg-off-white text-text-light">
      <div className="mx-auto max-w-7xl px-6 py-14 lg:px-12 lg:py-20">
        <motion.div
          className="mb-10 text-center lg:mb-14"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-5xl font-black tracking-[0.15em] sm:text-6xl lg:text-7xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs tracking-[0.25em] text-text-gray sm:text-sm">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 h-[3px] w-14 bg-accent" />
        </motion.div>

        <GroupHeading
          enKey="pickleballGroup"
          jaKey="pickleballGroupJa"
          leadKey="pickleballLead"
        />
        <ServiceCardGrid cards={PICKLEBALL_CARDS} />

        <div className="mt-12 lg:mt-16">
          <GroupHeading
            enKey="hyroxGroup"
            jaKey="hyroxGroupJa"
            leadKey="hyroxLead"
          />
          <ServiceCardGrid cards={HYROX_CARDS} />
          <HyroxAboutLink />
        </div>

        {/* レンタルシューズが無いため「手ぶらでOK」とは案内せず、必要な持ち物を明示する。 */}
        <motion.div
          className="mt-10 space-y-2 border-t border-text-gray/15 pt-6"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.0, delay: 0.2, ease: EASE }}
        >
          {NOTE_KEYS.map((noteKey) => (
            <div key={noteKey} className="flex items-start gap-3">
              <span aria-hidden className="mt-0.5 text-xs text-accent">
                ▸
              </span>
              <p className="text-sm text-text-gray">{t(noteKey)}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
