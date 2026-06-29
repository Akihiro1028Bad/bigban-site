/**
 * ビジュアル方向の比較モック(#proto2・ステージ2)。
 *
 * 確定IA「パイプライン1本道」の盤を、3つの美的方向の実トークンで描き分けて並べる。
 * 静的モック(ロジックなし)。ユーザーがブラウザで見比べて1方向を選ぶための叩き台。
 */
import type { CSSProperties } from "react";

interface Theme {
  key: string;
  name: string;
  vibe: string;
  vars: Record<string, string>;
  /** 盤背景(ネビュラ等の装飾)。無ければ単色 --bg。 */
  boardBg?: string;
  /** サーフェスにガラス(blur)を効かせるか。 */
  glass?: boolean;
  /** 解錠CTAの塗り色(コスミックは黄)。既定は --accent。 */
  unlock?: string;
  /** CTA文字色(塗り上)。 */
  onUnlock?: string;
  /** 角丸(カード)。 */
  radius: number;
  fontStack: string;
  /** 影方針。 */
  cardShadow?: string;
}

const THEMES: Theme[] = [
  {
    key: "editorial",
    name: "A. ダーク上質エディトリアル",
    vibe: "深夜の編集室 — 紺墨地に髪の毛のような細罫、真鍮の差し色。装飾を削ぎ静けさで信頼を作る。",
    radius: 10,
    fontStack: `"Inter", "Noto Sans JP", system-ui, sans-serif`,
    cardShadow: "none",
    unlock: "transparent",
    onUnlock: "#C8A45C",
    vars: {
      "--bg": "#070A11",
      "--surface": "#0C1019",
      "--surface2": "#11161F",
      "--border": "rgba(214,222,235,0.08)",
      "--border-strong": "rgba(214,222,235,0.16)",
      "--text": "#E9ECF2",
      "--muted": "#8A93A4",
      "--accent": "#C8A45C",
      "--ready": "#5BB98C",
      "--progress": "#C8A45C",
      "--fail": "#D97B6C",
      "--info": "#6E8BB5",
    },
  },
  {
    key: "cosmic",
    name: "B. 没入コスミック",
    vibe: "深宇宙の管制室 — 黒の真空にBright Blueの星雲、Accent黄が解錠の合図として一点だけ灯る。",
    radius: 14,
    fontStack: `"Noto Sans JP", system-ui, sans-serif`,
    glass: true,
    boardBg:
      "radial-gradient(120% 90% at 12% 0%, rgba(48,110,195,0.18), transparent 55%), radial-gradient(110% 90% at 100% 100%, rgba(17,49,123,0.24), transparent 60%), #05070e",
    cardShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
    unlock: "#F6FF54",
    onUnlock: "#06080f",
    vars: {
      "--bg": "#05070e",
      "--surface": "rgba(16,22,38,0.62)",
      "--surface2": "rgba(26,34,56,0.72)",
      "--border": "rgba(120,150,220,0.16)",
      "--border-strong": "rgba(120,150,220,0.30)",
      "--text": "#e9edf7",
      "--muted": "#9aa6c2",
      "--accent": "#306EC3",
      "--ready": "#3ddc97",
      "--progress": "#f9b94e",
      "--fail": "#f87171",
      "--info": "#5b9eff",
    },
  },
  {
    key: "clean",
    name: "C. クリアデイ（クリーンSaaS）",
    vibe: "昼の編集デスク — 白に近い温かい紙面に黒インクの操作系、状態だけが彩度で語る高密度な道具。",
    radius: 10,
    fontStack: `system-ui, -apple-system, "Noto Sans JP", sans-serif`,
    cardShadow: "0 1px 0 rgba(20,22,28,0.03)",
    unlock: "#1B1C1E",
    onUnlock: "#ffffff",
    vars: {
      "--bg": "#F4F3EF",
      "--surface": "#FFFFFF",
      "--surface2": "#FBFBFA",
      "--border": "#E8E7E1",
      "--border-strong": "#D3D2CA",
      "--text": "#1B1C1E",
      "--muted": "#8A8B86",
      "--accent": "#2563EB",
      "--ready": "#16A34A",
      "--progress": "#7C3AED",
      "--fail": "#DC2626",
      "--info": "#2563EB",
    },
  },
];

const STATIONS: { label: string; count?: number; tone?: string; active?: boolean }[] = [
  { label: "◎ 要対応", count: 5, tone: "accent", active: true },
  { label: "● 戻りあり", count: 1, tone: "ready" },
  { label: "構成まち", count: 2 },
  { label: "下書きまち", count: 2 },
  { label: "予約まち" },
  { label: "待機中", count: 4 },
  { label: "ネタ", count: 6 },
  { label: "公開済み" },
];

interface RowDef {
  filled: number;
  title: string;
  keyword: string;
  chip: string;
  chipTone: string;
  action: string;
  dot?: string;
  muted?: boolean;
}

const ROWS: RowDef[] = [
  { filled: 2, title: "ピックルボールとは？初心者が最初の1時間で知るべきこと", keyword: "ピックルボール 初心者", chip: "構成案", chipTone: "info", action: "構成を承認" },
  { filled: 4, title: "雨でも濡れない。屋内コートの快適さを写真で伝える", keyword: "屋内 ピックルボール", chip: "下書き", chipTone: "ready", action: "下書きを承認", dot: "ready" },
  { filled: 4, title: "パドルの選び方：重さ・グリップ・素材の3軸", keyword: "パドル 選び方", chip: "下書き", chipTone: "progress", action: "戻りを確認", dot: "progress" },
  { filled: 2, title: "梅雨に効く『濡れない屋内』訴求の体験レポート", keyword: "梅雨 屋内 運動", chip: "生成中", chipTone: "progress", action: "AIが執筆中 2/4", muted: true },
];

function Stepper({ filled, theme }: { filled: number; theme: Theme }) {
  const total = 6;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }} aria-hidden>
      {Array.from({ length: total }).map((_, i) => {
        const done = i < filled;
        const cur = i === filled;
        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span
              style={{
                width: cur ? 8 : 7,
                height: cur ? 8 : 7,
                borderRadius: "50%",
                background: done ? "var(--accent)" : "transparent",
                border: done ? "none" : `1.5px solid ${cur ? "var(--accent)" : "var(--border-strong)"}`,
                boxShadow: theme.glass && (done || cur) ? "0 0 6px rgba(48,110,195,0.7)" : "none",
              }}
            />
            {i < total - 1 && <span style={{ width: 8, height: 2, background: done ? "var(--accent)" : "var(--border)" }} />}
          </span>
        );
      })}
    </span>
  );
}

function BoardMock({ theme }: { theme: Theme }) {
  const wrapStyle = { ...theme.vars, fontFamily: theme.fontStack } as CSSProperties;
  const surfaceGlass = theme.glass ? { backdropFilter: "blur(18px) saturate(140%)" as const } : {};

  return (
    <div
      style={{
        ...wrapStyle,
        background: theme.boardBg ?? "var(--bg)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: theme.cardShadow,
      }}
    >
      {/* 上部: ループヘルス + 投げた依頼トレイ + ⌘K */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "9px 14px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          ...surfaceGlass,
          fontSize: 11.5,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ready)" }} />
          ループ：最終巡回 14:20 ✓
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)" }}>
          投げた依頼：修正2・画像1待機
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ready)" }} /> 1件戻りあり
          </span>
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 7, padding: "2px 7px" }}>⌘K</span>
      </div>

      <div style={{ display: "flex", minHeight: 318 }}>
        {/* 左レール: 段階別ステーション */}
        <nav style={{ width: 168, flexShrink: 0, padding: "8px 8px", borderRight: "1px solid var(--border)", background: "var(--surface)", ...surfaceGlass }}>
          {STATIONS.map((s) => {
            const toneVar = s.tone ? `var(--${s.tone})` : "var(--muted)";
            return (
              <div
                key={s.label}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 34,
                  padding: "0 8px",
                  borderRadius: 8,
                  background: s.active ? "var(--surface2)" : "transparent",
                  color: s.active ? "var(--text)" : "var(--muted)",
                  fontSize: 12.5,
                }}
              >
                {s.active && <span style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 2, borderRadius: 2, background: "var(--accent)" }} />}
                <span style={{ flex: 1 }}>{s.label}</span>
                {s.count != null && (
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontSize: 11,
                      fontWeight: 500,
                      minWidth: 18,
                      textAlign: "center",
                      padding: "1px 5px",
                      borderRadius: 999,
                      background: s.tone ? "var(--surface2)" : "transparent",
                      color: s.tone ? toneVar : "var(--muted)",
                    }}
                  >
                    {s.count}
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        {/* メイン: あなた待ち + 記事行 + 確信メーター/解錠CTA */}
        <main style={{ flex: 1, minWidth: 0, padding: "12px 14px", background: "var(--bg)" }}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>
            あなた待ち 5件：構成承認2・下書き承認2・戻り1 ・ <span style={{ color: "var(--text)" }}>推定18分</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ROWS.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: theme.radius,
                  background: r.muted ? "var(--surface2)" : "var(--surface)",
                  border: i === 0 ? "1px solid var(--border-strong)" : "1px solid var(--border)",
                  ...surfaceGlass,
                  opacity: r.muted ? 0.78 : 1,
                }}
              >
                <Stepper filled={r.filled} theme={theme} />
                <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 7, background: "var(--surface2)", border: "1px solid var(--border)" }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: r.muted ? "var(--muted)" : "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{r.keyword}</div>
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: `var(--${r.chipTone})`, background: "var(--surface2)", borderRadius: 999, padding: "2px 8px", flexShrink: 0 }}>
                  {r.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: `var(--${r.dot})`, boxShadow: theme.glass ? `0 0 5px var(--${r.dot})` : "none" }} />}
                  {r.chip}
                </span>
                <span style={{ fontSize: 12, color: r.muted ? "var(--muted)" : "var(--accent)", flexShrink: 0, whiteSpace: "nowrap" }}>{r.muted ? r.action : `次：${r.action}`}</span>
              </div>
            ))}
          </div>

          {/* 確信メーター + 公開前ゲート + 解錠CTA(署名要素) */}
          <div style={{ marginTop: 12, padding: 12, borderRadius: theme.radius, background: "var(--surface)", border: "1px solid var(--border)", ...surfaceGlass }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
              <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.04em" }}>確信</span>
              <span style={{ display: "inline-flex", gap: 4 }} aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} style={{ width: 14, height: 6, borderRadius: 3, background: i < 4 ? "var(--accent)" : "var(--border-strong)" }} />
                ))}
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>公開前ゲート</span>
              <span style={{ display: "inline-flex", gap: 6 }}>
                <Gate color="var(--fail)" n={1} />
                <Gate color="var(--progress)" n={2} />
                <Gate color="var(--ready)" n={8} />
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                disabled
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 14px",
                  borderRadius: theme.radius,
                  fontSize: 12.5,
                  fontWeight: 500,
                  border: "1px solid var(--border-strong)",
                  background: "var(--surface2)",
                  color: "var(--muted)",
                  cursor: "not-allowed",
                }}
              >
                🔒 下書きを承認 → 公開予約（ロック）
              </button>
              <span style={{ fontSize: 11.5, color: "var(--fail)" }}>あと1項目：AI生成の注記が無い</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
              ↑ 全🟢で解錠 →{" "}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: theme.radius, fontSize: 12.5, fontWeight: 500, background: theme.unlock, color: theme.onUnlock, border: theme.unlock === "transparent" ? "1px solid var(--accent)" : "none", boxShadow: theme.glass ? "0 0 14px rgba(246,255,84,0.45)" : "none" }}>
                ✓ 公開予約（解錠時のイメージ）
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Gate({ color, n }: { color: string; n: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--muted)" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {n}
    </span>
  );
}

export default function StylePickerPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#1b1d22", padding: "28px 20px 64px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <h1 style={{ color: "#fff", fontSize: 20, fontWeight: 600, margin: "0 0 4px", fontFamily: "system-ui" }}>
          ビジュアル方向の比較（ステージ2）
        </h1>
        <p style={{ color: "#9aa2ad", fontSize: 13, margin: "0 0 28px", fontFamily: "system-ui" }}>
          確定IA「パイプライン1本道」の盤を、3つの美的方向の実トークンで描き分けたモックです。同じ中身・違う世界観。1つ選んでください。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          {THEMES.map((t) => (
            <section key={t.key}>
              <div style={{ marginBottom: 9, fontFamily: "system-ui" }}>
                <div style={{ color: "#fff", fontSize: 15, fontWeight: 600 }}>{t.name}</div>
                <div style={{ color: "#9aa2ad", fontSize: 12.5, marginTop: 2 }}>{t.vibe}</div>
              </div>
              <BoardMock theme={t} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
