# 宇宙人マスコット画像生成ガイド

THE PICKLE BANG THEORY の記事・告知画像で使用する宇宙人マスコットの正典です。ローカル／クラウドのどちらで画像生成する場合も、この文書と参照画像を入力に含めます。

## 正典となる参照素材

- キャラクター基準: `public/images/news/pbt-club-launch-eyecatch-v5-balanced-mascot.png`
- 公式ロゴ: `public/logos/yoko-neon.png`
- 千葉県ガイドの確定例: `public/images/news/pickleball-chiba-guide-eyecatch-v3.png`

参照画像は構図の複製ではなく、キャラクターの同一性、頭身、服装、仕上げの基準として使用します。ロゴを新しく解釈・創作せず、公式ロゴを参照させます。

## キャラクター仕様

- 明るいグレーの宇宙人。大きな黒いアーモンド形の目と、親しみやすい小さな笑顔
- ちびキャラに寄りすぎない、全身が見えるバランス型のマスコット頭身
- 両手とも **合計4本指（親指1本＋指3本）**。開いた手と道具を握る手の両方に適用
- 黒い公式ロゴTシャツ、黒いショートパンツ、ネイビーのスポーツシューズ
- シューズにはライムイエローのアクセントを使用
- ピックルボール用パドルと穴あきボールを正しい形で描く
- 表情とポーズは友好的で、スポーティーかつ活動的にする

## ビジュアル方針

- 基調色: ブラック `#000000`、ディープブルー `#11317B`
- 発光色: ブライトブルー `#306EC3`、エレクトリックシアン
- アクセント: ライムイエロー `#F6FF54`
- テキスト: ライトグレー `#E6E6E6` または白
- 親しみやすさとプレミアム感を両立し、幼児向けの表現にはしない
- 記事テーマに応じて背景を設計し、無関係なページと同じ背景を流用しない
- 地域ガイドでは、地図、海岸線、街の光、地点ピンなど、その地域を示す要素を優先する

## 生成時の基本指示

```text
Use the balanced alien mascot from the character reference as the identity and proportion guide.
Every hand has exactly four digits total: one thumb plus three fingers.
Keep the friendly gray face, large black almond-shaped eyes, black official-logo T-shirt,
black shorts, and navy athletic shoes with lime-yellow accents.
Use the official logo reference faithfully; do not invent or reinterpret the logo.
Show a correct pickleball paddle and perforated pickleball.
Keep the character friendly, energetic, premium, and not overly chibi.
```

案件ごとに、用途、背景、構図、ポーズ、正確に表示する文言を追加します。日本語を画像内に含める場合は、文言を引用符で囲み、余分な文字を追加しないよう明記します。

## 避ける表現

- 5本指、6本指、指の本数が判別できない手
- 極端なちび頭身、人間に近すぎる長身、怖い表情
- テニスラケット、通常のボール、変形したパドル
- 公式ロゴに似せた別ロゴ、崩れたブランド名
- 余分な手足、複数のマスコット、透かし
- 記事テーマと関係のない施設背景や、他競技のビジュアルの流用

## Git管理

`public/images/news/` は生成途中の作業ファイルを除外するため、既定で `.gitignore` の対象です。確定して再利用する画像だけを個別にGitへ追加し、試作案はコミットしません。
