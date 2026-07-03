/**
 * 構成案タブの「画像ディレクター」UI(house style バナー ＋ セクション毎の
 * 「出す / 出さない」トグル・画像スロット・ImageDirector)の表示フラグ。
 *
 * 現状この UI はセッション state(`imageInstructions`)にしか反映されず、保存先
 * (Notion/API)も下書き生成側の読込も未実装(#62 本文画像・「下書き編集フェーズで
 * 本格実装」/ 設計: docs/superpowers/specs/2026-06-30-proto-backend-reconciliation.md)。
 * 指定しても消えて生成にも効かない「死んだ UI」で操作者を混乱させるため、既定で隠す。
 *
 * 生成パイプラインまで結線する実装フェーズで `true` に切り替える。UI・子コンポーネント・
 * テスト・親(ApproveClient/DetailPanel)の配線はそのまま残すので、復帰はこの1行でよい。
 */
export function isImageDirectorEnabled(): boolean {
  return false;
}
