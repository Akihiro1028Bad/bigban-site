/**
 * 早朝リピーター集計が読み書きする Notion の ID。秘密情報ではない(アクセスには NOTION_TOKEN が要る)。
 * 親ページ「早朝ピックル常連」は bigban-growth 連携に共有済みであること。
 */
const PEOPLE_DB = "0ad4f81d9f1542efadad494f7b20830c";

export const NOTION_IDS = {
  ledgerDb: "f93a73e9821e4a70b8ed72d3b413c203",
  peopleDb: PEOPLE_DB,
  recordsDb: "c441a833d93d47a1a081486b9cad3034",
  sessionsDb: "eb043ff647f54d4cb94cb33f03f7f0a4",
  bridgePage: "3ea99efa346b81509137f63474f06afd",
  peopleDbUrl: `https://www.notion.so/${PEOPLE_DB}`,
} as const;
