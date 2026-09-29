/**
 * HYROX 参加者集計が読み書きする Notion の ID。秘密情報ではない(アクセスには NOTION_TOKEN が要る)。
 * 親ページ「HYROX クラス参加者」は bigban-growth 連携に共有済みであること。
 */
const PEOPLE_DB = "06a5645c55474146a5e7dc396f46065d";

export const NOTION_IDS = {
  ledgerDb: "f93a73e9821e4a70b8ed72d3b413c203",
  peopleDb: PEOPLE_DB,
  recordsDb: "58785847d0f8478d986c74a2bb555508",
  sessionsDb: "e87eedaddd36473da5b39ff5c7205eb2",
  bridgePage: "3ea99efa346b81f49801c4a72cf75539",
  peopleDbUrl: `https://www.notion.so/${PEOPLE_DB}`,
} as const;
