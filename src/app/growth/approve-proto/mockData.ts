/**
 * 承認画面プロトタイプのモックデータ(#proto)。
 *
 * 「THE PICKLE BANG THEORY」(営業中の屋内ピックルボール施設)の
 * グロース記事を模した、見た目検証用のダミー。外部 I/O は一切しない。
 */
import { migrateImageHint } from "./imageIntent";
import { mediaSvgUrl } from "./mediaLibrary";
import type { MediaKind } from "./mediaLibrary";
import type { Advice, Article, ChecklistItem, ProposalStatus } from "./types";

let propSeq = 0;
/** 施策(proposal)のモックを作る。stage=idea ＋ proposalStatus で施策ビューに出す。 */
function prop(
  title: string,
  category: string,
  status: ProposalStatus,
  evidence: string[],
  hue: number,
  rejectNote?: string
): Article {
  propSeq += 1;
  return {
    id: `p${propSeq}`,
    title,
    stage: "idea",
    score: 60 + propSeq * 3,
    awaitingYou: false,
    updatedLabel: `${propSeq}日前`,
    excerpt: `[${category}] 施策候補`,
    keyword: title,
    hue,
    wordCount: 0,
    readMinutes: 0,
    outline: [{ heading: category, summary: "" }],
    prompt: "(構成案承認後に生成)",
    refs: [],
    bodyHtml: "",
    hasEyecatch: false,
    bodyImages: 0,
    decorations: 0,
    advice: { overall: 0, scores: [], strengths: [], fixes: [] },
    checklist: [
      { key: "eyecatch", label: "アイキャッチ", done: false },
      { key: "body", label: "本文", done: false },
      { key: "words", label: "文字数 1,200+", done: false },
      { key: "decoration", label: "装飾", done: false },
    ],
    proposalStatus: status,
    proposalCategory: category,
    proposalRejectNote: rejectNote,
    evidence,
  };
}

const MOCK_PROPOSALS: Article[] = [
  prop("梅雨に効く『雨でも濡れない屋内』訴求", "季節・イベント", "pending", ["派生元 表示数 +32%", "『屋内 ピックルボール』掲載順位 ↑3", "CTR 2.1%"], 205),
  prop("パドルの選び方を比較表で", "比較・選び方", "pending", ["『パドル 選び方』impr 1.8k", "CTR 低 (1.4%)", "競合上位を分析"], 320),
  prop("法人向け『チームビルディング』切り口", "法人・団体", "pending", ["問い合わせ +5件", "『福利厚生 スポーツ』increasing"], 255),
  prop("ピックルボールの歴史", "SEO記事", "rejected", ["impr 少", "検索需要 弱"], 30, "検索需要が小さく後回し"),
  // --- サイト施策 ---
  {
    id: "prop-site-1",
    title: "ヒーローのレイアウト変更",
    stage: "idea",
    score: 64,
    awaitingYou: false,
    updatedLabel: "1時間前",
    excerpt: "PCで予約ボタンがFV外。直帰率が高い。",
    keyword: "LP改善",
    hue: 270,
    wordCount: 0,
    readMinutes: 0,
    outline: [],
    prompt: "",
    refs: [{ title: "競合A の予約導線", source: "ref" }],
    bodyHtml: "",
    hasEyecatch: false,
    bodyImages: 0,
    decorations: 0,
    advice: { overall: 0, scores: [], strengths: [], fixes: [] },
    checklist: [],
    proposalStatus: "pending",
    proposalKind: "site",
    proposalCategory: "LP改善",
    evidence: ["直帰率 62%"],
    siteDetail: {
      whatChange: "ファーストビューを予約導線優先の縦構成に",
      whereTarget: "トップLP ヒーローセクション",
      whyReason: "PCで予約ボタンがFV外。直帰率が高い",
    },
  },
  // --- イベント施策 ---
  {
    id: "prop-event-1",
    title: "初心者クリニックを7月開催",
    stage: "idea",
    score: 58,
    awaitingYou: false,
    updatedLabel: "2時間前",
    excerpt: "梅雨〜夏の体験申込の季節需要を取り込む。",
    keyword: "集客",
    hue: 140,
    wordCount: 0,
    readMinutes: 0,
    outline: [],
    prompt: "",
    refs: [],
    bodyHtml: "",
    hasEyecatch: false,
    bodyImages: 0,
    decorations: 0,
    advice: { overall: 0, scores: [], strengths: [], fixes: [] },
    checklist: [],
    proposalStatus: "pending",
    proposalKind: "event",
    proposalCategory: "集客",
    evidence: ["体験申込の季節需要"],
    eventDetail: {
      whenLabel: "7月中旬",
      audience: "初心者・未経験者",
      format: "屋内クリニック 90分",
      capacity: "12〜16名",
    },
  },
  // --- その他施策 ---
  {
    id: "prop-other-1",
    title: "LINE友だち限定クーポン",
    stage: "idea",
    score: 52,
    awaitingYou: false,
    updatedLabel: "3時間前",
    excerpt: "初回体験者の再来店率を底上げする。",
    keyword: "CRM",
    hue: 30,
    wordCount: 0,
    readMinutes: 0,
    outline: [],
    prompt: "",
    refs: [],
    bodyHtml: "",
    hasEyecatch: false,
    bodyImages: 0,
    decorations: 0,
    advice: { overall: 0, scores: [], strengths: [], fixes: [] },
    checklist: [],
    proposalStatus: "pending",
    proposalKind: "other",
    proposalCategory: "CRM",
    evidence: ["友だち 2,400人"],
    freeNote: "初回体験者へ翌週リピート用のクーポンをLINEで配布。再来店率の底上げを狙う。",
  },
];

function checklist(
  eyecatch: boolean,
  body: boolean,
  words: boolean,
  decoration: boolean
): ChecklistItem[] {
  return [
    { key: "eyecatch", label: "アイキャッチ", done: eyecatch },
    { key: "body", label: "本文", done: body },
    { key: "words", label: "文字数 1,200+", done: words },
    { key: "decoration", label: "装飾", done: decoration },
  ];
}

function advice(overall: number, fixes: Advice["fixes"]): Advice {
  return {
    overall,
    scores: [
      { label: "文体の自然さ", score: Math.min(100, overall + 4) },
      { label: "構成の流れ", score: overall - 2 },
      { label: "具体性・根拠", score: overall - 8 },
      { label: "内部リンク導線", score: overall - 14 },
    ],
    strengths: [
      "施設の確定事実(屋内・開業日)に沿っていて誇張がない",
      "一文が短く、翻訳調を避けた自然な日本語になっている",
    ],
    fixes,
  };
}

const introBody = `
<h2>はじめに</h2>
<p>「ピックルボールって、最近よく聞くけど実際どんなスポーツ？」——そんな声をよく耳にします。テニスと卓球とバドミントンを<strong>いいとこ取り</strong>したような競技で、ルールはシンプル。初めてでも、最初の1時間でじゅうぶん楽しめます。</p>
<p>この記事では、はじめての方が知っておくと安心な基本ルールと、続けたくなる魅力を、屋内施設ならではの視点でまとめました。</p>
<blockquote>結論から言うと、運動が得意でなくても大丈夫。むしろ「久しぶりに体を動かす人」にこそ向いています。</blockquote>
<h2>30秒でわかる基本ルール</h2>
<ul>
<li>コートはテニスの約4分の1。動く範囲が狭く、ラリーが続きやすい。</li>
<li>サーブは下から。速い球が苦手でも入れやすい。</li>
<li>ネット近くの「キッチン」には立ち入れない。だから初心者でも前に詰められすぎない。</li>
</ul>
<figure><figcaption>図：コートの広さイメージ(イメージ図)</figcaption></figure>
<h2>はじめての1時間の過ごし方</h2>
<p>受付でパドルを借りて、コートへ。スタッフが最初にサーブとカウントだけ教えます。あとは打って、笑って、また打つ。これだけで一周します。</p>
<h3>持ち物</h3>
<ul>
<li>動きやすい服装と室内シューズ(レンタルあり)</li>
<li>水分。屋内でも意外と汗をかきます。</li>
</ul>
<h2>まとめ</h2>
<p>むずかしく考えず、まず一度コートに立ってみてください。次は「もっとうまくなりたい」と思っているはずです。</p>
`;

const indoorBody = `
<h2>雨の日も、猛暑日も関係ない</h2>
<p>屋外コートの最大の弱点は天気。せっかく予定を空けても、雨ひとつで流れてしまいます。屋内施設なら、その心配がありません。</p>
<ul>
<li>天候に左右されず、予定が立てやすい</li>
<li>空調管理で、夏も冬も同じコンディション</li>
<li>紫外線を気にせずプレーできる</li>
</ul>
<blockquote>「予定どおりに運動できる」——これは続ける上で、思った以上に大きな価値です。</blockquote>
<h2>夜でも安心、仕事帰りに寄れる</h2>
<p>ナイター照明のちらつきや見えづらさもなし。均一な光で、ボールがはっきり見えます。</p>
`;

const publishedBody = `
<h2>グランドオープン記念、最大3つの特典</h2>
<p>グランドオープンを記念して、先着・期間限定の特典をご用意しました。</p>
<ul>
<li>初回コート利用料が無料</li>
<li>パドルレンタルが1ヶ月間半額</li>
<li>友だち紹介で双方にドリンクチケット</li>
</ul>
<h2>予約はオンラインで完結</h2>
<p>会員登録から予約まで、スマホで数分。当日の受付もスムーズです。</p>
`;

const RAW_ARTICLES: Article[] = [
  {
    id: "a1",
    title: "ピックルボールとは？初心者が最初の1時間で知るべきルールと魅力",
    stage: "draft_review",
    score: 94,
    awaitingYou: true,
    updatedLabel: "8分前",
    excerpt: "テニスと卓球のいいとこ取り。最初の1時間で楽しめる理由を、屋内施設の視点で。",
    keyword: "ピックルボール 初心者 ルール",
    hue: 218,
    wordCount: 1640,
    readMinutes: 5,
    outline: [
      { heading: "はじめに", summary: "競技の立ち位置と記事のねらい" },
      { heading: "30秒でわかる基本ルール", summary: "コート・サーブ・キッチンの3点", imageHint: "diagram: コートの広さ比較" },
      { heading: "はじめての1時間の過ごし方", summary: "受付→レクチャー→プレーの流れ" },
      { heading: "まとめ", summary: "まず一度コートに立つ、への背中押し" },
    ],
    prompt:
      "営業中の屋内ピックルボール施設のブログとして、初心者向けに『ピックルボールとは』を解説する記事を作成。施設の確定事実のみ使用し、未確定の料金やイベント詳細は書かない。文体は翻訳調・AIっぽさを避け、一文を短く。タイトルは盛らない。内部リンクを1〜2本想定。",
    refs: [
      { title: "公式ルール概要(社内資料)", source: "growth/refs/rules.md" },
      { title: "施設コンテキスト", source: "facility-context.json" },
    ],
    bodyHtml: introBody,
    hasEyecatch: true,
    bodyImages: 1,
    decorations: 2,
    advice: advice(88, [
      {
        quote: "テニスと卓球とバドミントンをいいとこ取りしたような競技で",
        reason: "3競技の列挙がやや冗長で、リズムが重い。",
        suggestion: "「テニスを小さく、優しくしたような競技」と一言で。",
      },
      {
        quote: "むずかしく考えず、まず一度コートに立ってみてください。",
        reason: "締めは良いが、次アクションへの内部導線がない。",
        suggestion: "体験予約 or 施設紹介ページへの内部リンクを添える。",
      },
    ]),
    checklist: checklist(true, true, true, true),
  },
  {
    id: "a2",
    title: "インドア施設で雨の日も快適に。屋内ピックルボールの3つの利点",
    stage: "draft_review",
    score: 81,
    awaitingYou: true,
    updatedLabel: "26分前",
    excerpt: "天候に左右されない、空調で年中快適、夜も見やすい。屋内ならではの価値を整理。",
    keyword: "屋内 ピックルボール 雨の日",
    hue: 165,
    wordCount: 1180,
    readMinutes: 4,
    outline: [
      { heading: "雨の日も、猛暑日も関係ない", summary: "天候非依存の価値" },
      { heading: "夜でも安心、仕事帰りに寄れる", summary: "ナイター照明の均一さ" },
    ],
    prompt:
      "屋内施設の利点(天候・空調・照明)を3点に絞って紹介。具体的な数値は未検証のため使わない。",
    refs: [{ title: "施設コンテキスト", source: "facility-context.json" }],
    bodyHtml: indoorBody,
    hasEyecatch: true,
    bodyImages: 0,
    decorations: 1,
    advice: advice(76, [
      {
        quote: "思った以上に大きな価値です。",
        reason: "主観表現が続くと説得力が下がる。",
        suggestion: "「予定の組みやすさ」を1つの具体シーンで見せる。",
      },
    ]),
    checklist: checklist(true, true, false, true),
  },
  {
    id: "a3",
    title: "開業前カウントダウン：内覧会の見どころと当日の流れ",
    stage: "outline_review",
    score: 88,
    awaitingYou: true,
    updatedLabel: "1時間前",
    excerpt: "オープン前の内覧会で何が見られるか。構成案の段階。",
    keyword: "ピックルボール 内覧会",
    hue: 38,
    wordCount: 0,
    readMinutes: 0,
    outline: [
      { heading: "内覧会とは", summary: "目的と対象者" },
      { heading: "見どころ3選", summary: "コート/カフェ/レンタル", imageHint: "mascot: 案内する宇宙人" },
      { heading: "当日の流れ", summary: "受付→見学→体験打ち" },
      { heading: "参加方法", summary: "予約導線(詳細は未確定のため概要のみ)" },
    ],
    prompt:
      "内覧会の告知記事の構成案。日時・予約方法の詳細は未確定のため概要に留め、確定後に追記する前提で書く。",
    refs: [{ title: "施設コンテキスト", source: "facility-context.json" }],
    bodyHtml: "",
    hasEyecatch: false,
    bodyImages: 0,
    decorations: 0,
    advice: advice(70, []),
    checklist: checklist(false, false, false, false),
  },
  {
    id: "a4",
    title: "失敗しないパドル選び。重さ・グリップ・素材の見かた",
    stage: "outline_review",
    score: 72,
    awaitingYou: true,
    updatedLabel: "3時間前",
    excerpt: "初購入者向けに選定軸を整理する構成案。",
    keyword: "ピックルボール パドル 選び方",
    hue: 280,
    wordCount: 0,
    readMinutes: 0,
    outline: [
      { heading: "まずレンタルで試す", summary: "施設レンタルへの導線" },
      { heading: "3つの選定軸", summary: "重さ/グリップ/素材", imageHint: "diagram: 重さと振りやすさ" },
      { heading: "タイプ別おすすめ", summary: "パワー型/コントロール型" },
    ],
    prompt: "パドル選びの基礎。特定商品の断定的推奨は避け、選定軸の解説に徹する。",
    refs: [{ title: "用具ガイド(社内資料)", source: "growth/refs/gear.md" }],
    bodyHtml: "",
    hasEyecatch: false,
    bodyImages: 0,
    decorations: 0,
    advice: advice(64, []),
    checklist: checklist(false, false, false, false),
  },
  {
    id: "a5",
    title: "会社の福利厚生にピックルボール。法人プランの活用例",
    stage: "generating",
    score: 69,
    awaitingYou: false,
    updatedLabel: "たった今",
    excerpt: "本文を生成しています…",
    keyword: "ピックルボール 法人 福利厚生",
    hue: 255,
    wordCount: 0,
    readMinutes: 0,
    outline: [
      { heading: "なぜいま社内交流に", summary: "" },
      { heading: "活用シーン", summary: "" },
    ],
    prompt: "法人向け活用例。料金は未確定のため概念のみ。",
    refs: [],
    bodyHtml: "",
    hasEyecatch: false,
    bodyImages: 0,
    decorations: 0,
    advice: advice(0, []),
    checklist: checklist(false, false, false, false),
    generatingStep: "本文を執筆中(セクション 2 / 4)",
  },
  {
    id: "a6",
    title: "30代40代に効く理由：ピックルボールの運動強度を科学する",
    stage: "generating",
    score: 63,
    awaitingYou: false,
    updatedLabel: "たった今",
    excerpt: "アイキャッチを生成しています…",
    keyword: "ピックルボール 運動強度 中年",
    hue: 200,
    wordCount: 0,
    readMinutes: 0,
    outline: [{ heading: "適度な強度という強み", summary: "" }],
    prompt: "運動強度の話。未検証の数値・医学的断定は避ける。",
    refs: [],
    bodyHtml: "",
    hasEyecatch: false,
    bodyImages: 0,
    decorations: 0,
    advice: advice(0, []),
    checklist: checklist(false, false, false, false),
    generatingStep: "アイキャッチを生成中",
    genProgress: 45,
    stuck: true,
  },
  {
    id: "a7",
    title: "ナイター利用で平日夜をアクティブに。仕事帰りの新習慣",
    stage: "scheduled",
    score: 77,
    awaitingYou: false,
    updatedLabel: "昨日",
    excerpt: "公開予約済み。仕事帰りの利用シーンを提案。",
    keyword: "ピックルボール ナイター 平日",
    hue: 222,
    wordCount: 1320,
    readMinutes: 4,
    outline: [
      { heading: "平日夜という空白", summary: "" },
      { heading: "屋内ナイターの快適さ", summary: "" },
    ],
    prompt: "平日夜の利用提案。",
    refs: [{ title: "施設コンテキスト", source: "facility-context.json" }],
    bodyHtml: indoorBody,
    hasEyecatch: true,
    bodyImages: 1,
    decorations: 2,
    advice: advice(82, []),
    checklist: checklist(true, true, true, true),
    scheduledLabel: "6/30(月) 09:00 公開予定",
  },
  {
    id: "a8",
    title: "ダブルスの基本フォーメーション入門",
    stage: "idea",
    score: 58,
    awaitingYou: false,
    updatedLabel: "2日前",
    excerpt: "ネタ案。基本の立ち位置とローテーションを解説する企画。",
    keyword: "ピックルボール ダブルス 戦術",
    hue: 145,
    wordCount: 0,
    readMinutes: 0,
    outline: [
      { heading: "基本の立ち位置", summary: "" },
      { heading: "前に出るタイミング", summary: "" },
    ],
    prompt: "(構成案承認後に生成)",
    refs: [],
    bodyHtml: "",
    hasEyecatch: false,
    bodyImages: 0,
    decorations: 0,
    advice: advice(0, []),
    checklist: checklist(false, false, false, false),
  },
  {
    id: "a9",
    title: "コートサイドカフェのこだわり。プレー後の一杯",
    stage: "idea",
    score: 49,
    awaitingYou: false,
    updatedLabel: "3日前",
    excerpt: "ネタ案。施設併設カフェの体験価値を紹介する企画。",
    keyword: "ピックルボール カフェ 施設",
    hue: 28,
    wordCount: 0,
    readMinutes: 0,
    outline: [{ heading: "運動後の体に", summary: "" }],
    prompt: "(構成案承認後に生成)",
    refs: [],
    bodyHtml: "",
    hasEyecatch: false,
    bodyImages: 0,
    decorations: 0,
    advice: advice(0, []),
    checklist: checklist(false, false, false, false),
  },
  {
    id: "a10",
    title: "グランドオープン記念キャンペーン詳細",
    stage: "published",
    score: 90,
    awaitingYou: false,
    updatedLabel: "6/24 公開",
    excerpt: "公開済み。先着特典と予約方法を案内。",
    keyword: "ピックルボール オープン キャンペーン",
    hue: 48,
    wordCount: 980,
    readMinutes: 3,
    outline: [
      { heading: "記念特典", summary: "" },
      { heading: "予約方法", summary: "" },
    ],
    prompt: "オープン記念の告知。",
    refs: [],
    bodyHtml: publishedBody,
    hasEyecatch: true,
    bodyImages: 1,
    decorations: 1,
    advice: advice(85, []),
    checklist: checklist(true, true, false, true),
    metrics: { views: 2140, users: 1680, deltaPct: 32, series: [180, 205, 250, 300, 345, 410, 450] },
  },
  {
    id: "a11",
    title: "ピックルボール vs テニス：始めやすさをやさしく比較",
    stage: "published",
    score: 84,
    awaitingYou: false,
    updatedLabel: "6/20 公開",
    excerpt: "公開済み。これから始める人向けの比較記事。",
    keyword: "ピックルボール テニス 違い",
    hue: 190,
    wordCount: 1450,
    readMinutes: 5,
    outline: [
      { heading: "コートと道具", summary: "" },
      { heading: "最初の上達カーブ", summary: "" },
    ],
    prompt: "テニス経験者/未経験者の両方に向けた比較。",
    refs: [],
    bodyHtml: introBody,
    hasEyecatch: true,
    bodyImages: 2,
    decorations: 3,
    advice: advice(83, []),
    checklist: checklist(true, true, true, true),
    metrics: { views: 1560, users: 1190, deltaPct: -6, series: [262, 250, 232, 214, 206, 198, 218] },
  },
  {
    id: "a12",
    title: "雨でも濡れない。屋内コートの快適さを写真で",
    stage: "published",
    score: 79,
    awaitingYou: false,
    updatedLabel: "6/16 公開",
    excerpt: "公開済み。屋内施設の快適さをビジュアルで伝える記事。",
    keyword: "屋内 ピックルボール 写真",
    hue: 205,
    wordCount: 1120,
    readMinutes: 4,
    outline: [{ heading: "屋内の快適さ", summary: "" }],
    prompt: "屋内の快適さをビジュアル中心で。",
    refs: [],
    bodyHtml: indoorBody,
    hasEyecatch: true,
    bodyImages: 2,
    decorations: 2,
    advice: advice(80, []),
    checklist: checklist(true, true, false, true),
    metrics: { views: 1180, users: 910, deltaPct: 18, series: [120, 130, 150, 165, 172, 188, 205] },
  },
  {
    id: "a13",
    title: "週末家族で楽しむ。子どもと一緒のピックルボール入門",
    stage: "published",
    score: 73,
    awaitingYou: false,
    updatedLabel: "6/12 公開",
    excerpt: "公開済み。ファミリー層向けの入門記事。",
    keyword: "ピックルボール 子ども 家族",
    hue: 95,
    wordCount: 1340,
    readMinutes: 4,
    outline: [{ heading: "家族で始める", summary: "" }],
    prompt: "ファミリー向け入門。",
    refs: [],
    bodyHtml: introBody,
    hasEyecatch: true,
    bodyImages: 1,
    decorations: 1,
    advice: advice(78, []),
    checklist: checklist(true, true, true, true),
    metrics: { views: 740, users: 590, deltaPct: 41, series: [42, 58, 70, 95, 120, 150, 205] },
  },
  {
    id: "a14",
    title: "ピックルボールの消費カロリーは？30分プレーの目安",
    stage: "published",
    score: 68,
    awaitingYou: false,
    updatedLabel: "6/8 公開",
    excerpt: "公開済み。運動効果を気にする層向け。",
    keyword: "ピックルボール カロリー 運動",
    hue: 18,
    wordCount: 980,
    readMinutes: 3,
    outline: [{ heading: "30分の目安", summary: "" }],
    prompt: "消費カロリーの目安。未検証の数値は断定しない。",
    refs: [],
    bodyHtml: indoorBody,
    hasEyecatch: true,
    bodyImages: 0,
    decorations: 1,
    advice: advice(72, []),
    checklist: checklist(true, true, false, false),
    metrics: { views: 540, users: 430, deltaPct: -14, series: [110, 98, 86, 74, 66, 60, 52] },
  },
];

const KINDS: MediaKind[] = ["mascot", "minimal", "diagram", "photo"];

const DISCLAIMER =
  '<p class="proto-disclaimer">※本記事はAIが作成し、担当者が確認・編集しています。料金・営業時間などの最新情報は公式情報をご確認ください。</p>';

// a2 に「存在しないパスへの内部リンク」を仕込み、公開前チェックの block を見せる。
const BROKEN_LINK = '<p>くわしくは<a href="/ja/news/removed-old-article">こちらの記事</a>もご覧ください。</p>';
// a2 に NG語・AI定型を仕込み、文体チェックの検出を見せる。
const STYLE_SAMPLE = "<p>誰でも簡単に上達できる最高のスポーツです。いかがでしたか？</p>";

function deriveSearch(a: Article) {
  const m = a.metrics!;
  const clicks = Math.round(m.users * 0.34);
  const impressions = Math.round(m.views * 4.2);
  const head = a.keyword.split(/\s+/);
  return {
    clicks,
    impressions,
    ctr: Math.round((clicks / impressions) * 1000) / 10,
    position: Math.round((14 - m.deltaPct / 8) * 10) / 10,
    topQueries: [a.keyword, `${head[0]} ${head[1] ?? "とは"}`, `${head[0]} 屋内`].filter(Boolean),
  };
}

function deriveHypothesis(a: Article): Article["hypothesis"] {
  const head = a.keyword.split(/\s+/)[0];
  return {
    articleType: "単記事（SEO）",
    targetReader: `「${a.keyword}」を調べる初心者・検討層`,
    searchIntent: `「${head}」の基本と始め方を知りたい`,
    winningAngle: "屋内施設ならではの実体験で、具体的に書く",
    successMetric: "検索流入 ＋ 体験予約への内部リンククリック",
    plannedCta: "施設紹介 / 体験予約ページへの内部リンク",
  };
}

/** mock 記事に画像URL・免責文・仮説・メタ・検索成績などを付与して仕上げる。 */
function finalize(a: Article): Article {
  const kind = KINDS[Math.abs(Math.round(a.hue)) % KINDS.length];
  let bodyHtml = a.bodyHtml;
  if (bodyHtml) {
    if (a.id === "a2") bodyHtml += BROKEN_LINK + STYLE_SAMPLE;
    bodyHtml += DISCLAIMER;
  }
  return {
    ...a,
    bodyHtml,
    // 旧 imageHint を新 ImageInstruction へ正規化(欠落・既存指定はそのまま)。
    outline: a.outline.map((s) =>
      s.imageInstruction ? s : { ...s, imageInstruction: migrateImageHint(s.imageHint) }
    ),
    eyecatchUrl: a.hasEyecatch ? mediaSvgUrl(kind, a.hue) : undefined,
    bodyImageUrls:
      a.bodyImages > 0
        ? Array.from({ length: a.bodyImages }, (_, i) => mediaSvgUrl("diagram", (a.hue + (i + 1) * 50) % 360))
        : undefined,
    hypothesis: a.hypothesis ?? deriveHypothesis(a),
    metaDescription: a.metaDescription ?? a.excerpt,
    metrics: a.metrics ? { ...a.metrics, search: a.metrics.search ?? deriveSearch(a) } : undefined,
    publishedDaysAgo:
      a.publishedDaysAgo ??
      (a.metrics ? ({ a10: 5, a11: 9, a12: 13, a13: 17, a14: 35 } as Record<string, number>)[a.id] ?? 10 : undefined),
  };
}

export const MOCK_ARTICLES: Article[] = [...RAW_ARTICLES, ...MOCK_PROPOSALS].map(finalize);
