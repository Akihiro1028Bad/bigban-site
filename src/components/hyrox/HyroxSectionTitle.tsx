interface HyroxSectionTitleProps {
  /** 英語の大見出し(デザイン要素) */
  title: string;
  /** 日本語の小見出し。検索エンジンが読む語を入れるため h2 の中に含める。 */
  titleJa: string;
}

/**
 * /hyrox 各セクション共通の見出し。英語の大見出しの見た目は維持しつつ、
 * 下の日本語小見出しを同じ h2 の span にして見出しの中身に検索語を含める。
 */
export default function HyroxSectionTitle({
  title,
  titleJa,
}: HyroxSectionTitleProps) {
  return (
    <>
      <h2 className="font-serif text-4xl font-black tracking-[0.15em] text-text-light sm:text-5xl lg:text-6xl">
        {title}{" "}
        <span className="mt-3 block font-sans text-xs font-normal tracking-[0.25em] text-text-gray sm:text-sm">
          {titleJa}
        </span>
      </h2>
      <div className="mx-auto mt-4 h-[3px] w-14 bg-accent" />
    </>
  );
}
