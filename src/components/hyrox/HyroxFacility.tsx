"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { HYROX_STATIONS } from "./stations";

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

// 設備（配置図・器具リスト）の公開準備が整ったら true にする
const FACILITY_READY = false;

// サーキット配置図（楕円トラック）の座標計算
const CX = 500;
const CY = 230;
const RX = 380;
const RY = 170;

const NODES = HYROX_STATIONS.map((station, i) => {
  const angle = ((-90 + i * 45) * Math.PI) / 180;
  return {
    ...station,
    x: CX + RX * Math.cos(angle),
    y: CY + RY * Math.sin(angle),
  };
});

export default function HyroxFacility() {
  const t = useTranslations("HyroxPage.facility");
  const ts = useTranslations("HyroxPage.stations");

  return (
    <section className="bg-deep-black pt-8 pb-12 lg:pt-12 lg:pb-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        {/* 見出し */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-150px" }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <h2 className="font-serif text-4xl font-black tracking-[0.15em] text-text-light sm:text-5xl lg:text-6xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-xs tracking-[0.25em] text-text-gray sm:text-sm">
            {t("titleJa")}
          </p>
          <div className="mx-auto mt-4 h-[3px] w-14 bg-accent" />
        </motion.div>

        {FACILITY_READY ? (
          <>
            <motion.p
              className="mt-8 max-w-2xl text-sm leading-loose text-text-gray lg:text-base"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-120px" }}
              transition={{ duration: 1.0, ease: EASE }}
            >
              {t("lead")}
            </motion.p>

            {/* サーキット配置図 */}
            <motion.figure
              className="mt-14 lg:mt-20"
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-120px" }}
              transition={{ duration: 1.2, ease: EASE }}
            >
              <figcaption className="mb-6 text-xs uppercase tracking-[0.3em] text-text-gray">
                {t("diagramTitle")}
              </figcaption>
              <svg
                viewBox="0 0 1000 460"
                role="img"
                aria-label={t("diagramAria")}
                className="mx-auto h-auto w-full max-w-4xl"
              >
                {/* ランニングトラック（破線＝走行ライン） */}
                <ellipse
                  cx={CX}
                  cy={CY}
                  rx={RX}
                  ry={RY}
                  fill="none"
                  className="stroke-accent"
                  strokeWidth={2}
                  strokeDasharray="3 12"
                  strokeLinecap="round"
                />
                {/* 中央ラベル */}
                <text
                  x={CX}
                  y={CY - 8}
                  textAnchor="middle"
                  className="fill-text-light"
                  fontSize={30}
                  fontWeight={800}
                  letterSpacing={3}
                >
                  {t("circuitName")}
                </text>
                <text
                  x={CX}
                  y={CY + 24}
                  textAnchor="middle"
                  className="fill-text-gray"
                  fontSize={15}
                  letterSpacing={2}
                >
                  {t("circuitMeta")}
                </text>
                <text
                  x={CX}
                  y={CY + 48}
                  textAnchor="middle"
                  className="fill-text-gray"
                  fontSize={12}
                  letterSpacing={4}
                >
                  {t("circuitNameJa")}
                </text>
                {/* 8ステーションのノード */}
                {NODES.map((node) => (
                  <g key={node.key}>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={27}
                      className="fill-accent"
                    />
                    <text
                      x={node.x}
                      y={node.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className="fill-deep-black"
                      fontSize={20}
                      fontWeight={800}
                    >
                      {node.number}
                    </text>
                  </g>
                ))}
              </svg>
            </motion.figure>

            {/* 設置器具リスト */}
            <motion.div
              className="mt-16 lg:mt-20"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-120px" }}
              transition={{ duration: 1.1, ease: EASE }}
            >
              <h3 className="mb-8 text-xs uppercase tracking-[0.3em] text-text-gray">
                {t("equipmentTitle")}
              </h3>
              <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-white/10 sm:grid-cols-3 lg:grid-cols-4">
                {HYROX_STATIONS.map((station) => (
                  <li key={station.key} className="bg-deep-black p-5 lg:p-6">
                    <span className="font-serif text-sm font-bold text-accent">
                      {station.number}
                    </span>
                    <p className="mt-2 text-sm font-bold text-text-light sm:text-base">
                      {ts(`${station.key}.name`)}
                    </p>
                    <p className="mt-1 text-xs text-text-gray">
                      {ts(`${station.key}.nameJa`)}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs leading-relaxed text-text-gray">
                {t("note")}
              </p>
            </motion.div>
          </>
        ) : (
          <motion.div
            className="mt-10 flex min-h-[220px] items-center justify-center rounded-sm border border-white/10 lg:mt-14"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 1.0, ease: EASE }}
          >
            <div className="text-center">
              <p className="font-serif text-3xl font-black tracking-[0.2em] text-text-light sm:text-4xl">
                {t("preparing")}
              </p>
              <p className="mt-3 text-xs tracking-[0.35em] text-text-gray">
                {t("preparingSub")}
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
