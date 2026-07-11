// アイキャッチのサムネ。proto(#proto) からの本番移植。
import Image from "next/image";

interface EyecatchThumbProps {
  hue: number;
  size?: number;
  has?: boolean;
  url?: string;
  alt?: string;
}

/** アイキャッチサムネ。url があれば実画像、無ければ色相からのグラデーション。 */
export function EyecatchThumb({
  hue,
  size = 40,
  has = true,
  url,
  alt = "",
}: EyecatchThumbProps) {
  if (has && url) {
    return (
      <Image
        src={url}
        alt={alt}
        width={size}
        height={size}
        unoptimized
        className="approve-eyecatch shrink-0 rounded-[8px] object-cover"
        style={{ width: size, height: size, border: "1px solid var(--p-border)" }}
      />
    );
  }
  if (!has) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-[8px]"
        style={{
          width: size,
          height: size,
          background: "var(--p-bg-active)",
          border: "1px dashed var(--p-border-strong)",
          color: "var(--p-text-3)",
          fontSize: 10,
        }}
      >
        無
      </div>
    );
  }
  return (
    <div
      className="shrink-0 overflow-hidden rounded-[8px]"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 62% 32%), hsl(${
          (hue + 40) % 360
        } 58% 22%))`,
        border: "1px solid var(--p-border)",
        position: "relative",
      }}
    >
      <span
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 70% 25%, hsl(${
            (hue + 20) % 360
          } 70% 55% / 0.55), transparent 60%)`,
        }}
      />
    </div>
  );
}
