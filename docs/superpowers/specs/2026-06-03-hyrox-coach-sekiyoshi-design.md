# HYROX ページ拡張：担当コーチ「関吉大亮」紹介＋実写ギャラリー 設計書

- 作成日: 2026-06-03
- 対象ブランチ: `feature/hyrox-training-area`
- ステータス: ドラフト（レビュー待ち）

## 1. 目的・背景

既存の HYROX ページ `/hyrox`（Hero / What is HYROX / Stations / Program）に、施設の **HYROX担当・関吉大亮（せきよし だいすけ / Daisuke Sekiyoshi）** を主役にしたコーチ紹介と、提供いただいたプロ撮影・大会写真を活かした「今どき・エディトリアル」な実写ビジュアルを追加する。

担当者リサーチ済み（別途ドシエ）。漢字は **「大亮」** で確定。

## 2. スコープ

### やること
- 新セクション **COACH（関吉大亮 紹介）** を追加
- 新セクション **IN ACTION（実写アクションギャラリー）** を追加
- Stations セクションに**実写の雰囲気バンド**を1点追加（カード自体はテキスト維持）
- 共有画像16点の取捨選択・Web最適化・配置
- i18n（ja/en）に `HyroxPage.coach` / `HyroxPage.gallery` を追加
- 既存 `HyroxContent` の構成に新セクションを挿入

### やらないこと（YAGNI）
- **Hero は変更しない**（ユーザー確定：現状維持）
- 全8ステーションへの個別画像差し込み（写真が5/8種目しか無く不均一になるため見送り）
- 予約/料金ロジック等、HYROX以外の変更

## 3. 確定事項（ユーザー回答）
- Hero: 現状維持
- 上半身（シャツレス）アクション写真: **積極的に使用**
- プロフィール実績: **称号＋数値スタッツまで掲載可**
- 進め方: 設計書 → 実装

## 4. 画像インベントリと配置

共有元: `~/Desktop/【共有】関吉さん/`（16点）。Web最適化（リサイズ最大~1800px・必要に応じ回転/変換）し **`public/images/hyrox/`** に配置。配信フォーマットは `next/image` に委譲（webp/avif 自動）。

| 役割 | 採用画像（元ファイル） | 配置先（案） |
|---|---|---|
| コーチ ポートレート | #05 `260520-OKB 68`（腕組み・キャップ・日の丸） | `coach-portrait.jpg` |
| コーチ クレデンシャル | #13 `IMG_6780.HEIC`（HYROX BRISBANE / APAC旗、**90°回転補正**） | `coach-apac.jpg` |
| IN ACTION ① | #08 `44DD…`（サンドバッグ運搬・上半身） | `action-sandbag-carry.jpg` |
| IN ACTION ② | #15 `IMG_7643`（紫照明ランジ） | `action-lunge.jpg` |
| IN ACTION ③ | #10 `IMG_4472`（スレッドプッシュ正面） | `action-sled-push.jpg` |
| IN ACTION ④ | #16 `IMG_7646`（ローイング） | `action-row.jpg` |
| IN ACTION ⑤ | #09 `IMG_1825`（スレッドプル） | `action-sled-pull.jpg` |
| IN ACTION ⑥ | #12 `IMG_5812`（歓喜のラン "OUR SPORT IS HYROX"） | `action-finish.jpg` |
| Stations 雰囲気バンド | #11 `IMG_5801`（アリーナ俯瞰・横長） | `arena-band.jpg` |

予備（未使用・将来差し替え用）: #01–04, #06, #07（スタジオ肖像）, #14（SkiErgウォームアップ）。

画像処理メモ:
- #13 は EXIF 回転が効かず横倒しのため、明示的に90°回転して書き出す。
- HEIC（#13）は JPEG へ変換。
- 元データは高解像度のため、長辺 ~1800px へリサイズして配置（容量削減）。

## 5. 掲載コピー（確定情報ベース・最終文言は本人/RST Agency 確認推奨）

すべて公開情報（大会結果DB・公式アンバサダー投稿・取材記事）に基づく。

**名前**: 関吉大亮 / DAISUKE SEKIYOSHI
**肩書き**: HYROX担当コーチ / HYROX COACH

**称号（ja）**
- HYROX Japan アンバサダー
- HYROX PRO アスリート
- 元スパルタンレース日本代表（2017–2023 / 2018 日韓シリーズ総合優勝）

**数値スタッツ**
- 自己ベスト `1:01:45`
- `18 RACES / 3 SEASONS`
- `APAC CHAMPIONSHIPS` 出場
- 得意種目 `WALL BALLS`

**バイオ（ドラフト・ストイックトーン / 要確認）**
> 日本の HYROX シーンを切り拓いてきた PRO アスリート。スパルタンレース日本代表として世界を転戦し、現在は HYROX Japan アンバサダーとして競技の普及を牽引。"修行僧" の異名どおり、ストイックな鍛錬で限界を更新し続ける。

**リンク**: Instagram `@syugyou_sou`（新しいタブ・`EXTERNAL_LINK_PROPS`）

英語コピーは上記の対訳を `messages/en.json` に用意。

## 6. ページ構成（HyroxContent の挿入順）

```
HomeNavigation
main:
  HyroxHero        （現状維持）
  HyroxIntro       （What is HYROX、現状維持）
  HyroxCoach       ★新規（関吉大亮 紹介）
  HyroxStations    （実写バンド #11 を追加、カードはテキスト維持）
  HyroxGallery     ★新規（IN ACTION）
  HyroxProgram     （現状維持）
HomeFooter
```

## 7. コンポーネント設計

`src/components/hyrox/` に追加（既存パターン踏襲・`"use client"` + framer-motion、ダーク×`#F6FF54`）。

### 7-1. `HyroxCoach.tsx`（新規）
- 左右2カラム（PC）/ 縦積み（SP）。
- ビジュアル: `coach-portrait.jpg`（`next/image`、`object-cover`、アクセント枠 or 微グロー）。任意で `coach-apac.jpg` を小さくインセット（実績の裏付け）。
- 右: eyebrow「COACH」/ 見出し「関吉大亮」＋英字「DAISUKE SEKIYOSHI」/ アクセント罫線 / 称号リスト / **スタッツ行**（数値＋ラベルのグリッド、`font-serif` 数字＋`text-accent`）/ バイオ短文 / Instagram リンク。
- アクセシビリティ: 画像 `alt`、見出し階層 h2、リンクに `aria-label`。

### 7-2. `HyroxGallery.tsx`（新規）
- 見出し「IN ACTION」＋和文サブ。
- 6点のアクション写真をエディトリアルに配置（PC: 不均等マソンリー風 grid、SP: 1〜2列）。
- 各 `next/image`（`sizes` 適切設定、`loading=lazy`）。装飾的なら `alt=""`、説明的にするなら種目名を `alt`。
- `whileInView` + `staggerChildren` でリビール。

### 7-3. `HyroxStations.tsx`（改修）
- グリッド上部または下部に **フルブリードの雰囲気バンド**（`arena-band.jpg`、`aspect-[21/9]` 程度＋黒グラデ＋小さなキャプション）を追加。8カードのテキストUIは維持。

### 7-4. `HyroxContent.tsx`（改修）
- `HyroxCoach` / `HyroxGallery` を import し、§6の順序で挿入。

## 8. i18n（`HyroxPage` 名前空間に追加）

```
HyroxPage.coach: {
  eyebrow, name, nameEn, role,
  titles: [ ... ],            // 称号リスト（配列）
  stats: { pbLabel, pbValue, racesLabel, racesValue, apacLabel, apacValue, signatureLabel, signatureValue },
  bio,                        // バイオ短文
  instagram, instagramAria,   // @syugyou_sou / aria-label
  portraitAlt, apacAlt
}
HyroxPage.gallery: {
  title, titleJa,
  items: [ { alt } x6 ]       // 各写真の alt（種目/シーン名）
}
HyroxPage.stations.bandAlt    // 雰囲気バンドの alt（追加）
```

ja/en 両方に同構造で追加。

## 9. テスト方針（TDD・カバレッジ準拠）

- `HyroxCoach.test.tsx`: 名前「関吉大亮」、称号、スタッツ数値、Instagram リンク（href/`@syugyou_sou`、target=_blank）、portrait の `alt` を検証。
- `HyroxGallery.test.tsx`: 見出し「IN ACTION」、画像6点（`getAllByRole('img')` または alt）を検証。
- `HyroxStations.test.tsx`: 既存に加え、バンド画像の存在を検証（必要なら）。
- `HyroxContent.test.tsx`: 新セクションが描画順に含まれることを検証（必要に応じ）。
- `next/image` は既存テストと同様にモック。

## 10. パフォーマンス / アクセシビリティ
- 画像は最適化済みを配置し `next/image`（自動 webp/avif、レスポンシブ `sizes`、above-fold 以外は lazy）。
- コーチ ポートレートは比較的上部なので必要に応じ `priority` 検討（ただし Hero では無い）。
- コントラスト WCAG AA、`prefers-reduced-motion` 尊重、画像 `alt` 付与。

## 11. リスク・留意点
- **掲載文言（称号・数値・バイオ）は公開情報ベース**。最終確定は本人/RST Agency 確認が望ましい（特にバイオ・"修行僧"表現・「元千葉県警」等の未確実情報は不掲載）。
- 施設サイトに本人公式情報が無いため、Instagram ハンドル等は実装前に最終確認推奨。
- シャツレス写真の使用方針はユーザー承認済み（積極使用）。
- 画像は人物の肖像。公開利用の許諾が取れている前提（共有フォルダ提供＝利用可と解釈）。
