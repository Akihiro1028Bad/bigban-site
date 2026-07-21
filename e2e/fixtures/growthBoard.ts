import type { PendingItem } from "../../src/app/growth/approve/types";

const ASSET_URL = "/logos/tate-neon-logo.svg";

function draftedItem(id: string, title: string): PendingItem {
  return {
    id,
    kind: "idea",
    title,
    subtitle: "E2E fixture",
    stage: "drafted",
    isDraftReady: true,
    contentId: `content-${id}`,
    eyecatchUrl: ASSET_URL,
    hasDraftBody: true,
  };
}

export function proposedBoard(): PendingItem[] {
  return [{
    id: "article-proposed",
    kind: "idea",
    title: "初心者向けピックルボール入門",
    subtitle: "最初の一歩を分かりやすく紹介",
    outline: "## はじめての一歩\n道具と基本ルールを紹介します。",
    stage: "proposed",
  }];
}

export function partialPublishBoard(): PendingItem[] {
  return [draftedItem("article-a", "公開記事A"), draftedItem("article-b", "公開記事B")];
}

export function blockedBoard(): PendingItem[] {
  return [
    { ...draftedItem("article-empty", "本文未入力の記事"), hasDraftBody: false },
    { ...draftedItem("article-no-image", "画像未設定の記事"), eyecatchUrl: undefined },
  ];
}
