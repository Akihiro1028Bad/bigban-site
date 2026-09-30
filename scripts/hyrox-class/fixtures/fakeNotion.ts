/** テスト用の Notion の偽物。書いた値には実 API と同じく plain_text を補う。 */
import type { NotionBlock, NotionClient } from "../../early-morning/notionClient";
import type { NotionPage } from "../../early-morning/notionProps";

interface StoredPage {
  db: string;
  properties: Record<string, unknown>;
  archived: boolean;
}

function addPlainText(_key: string, value: unknown): unknown {
  const content = (value as { text?: { content?: unknown } } | null)?.text?.content;
  return typeof content === "string" ? { ...(value as object), plain_text: content } : value;
}

function withPlainText(properties: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(properties, addPlainText)) as Record<string, unknown>;
}

export class FakeNotion implements NotionClient {
  pages = new Map<string, StoredPage>();
  blocks: NotionBlock[] = [];
  log: string[] = [];
  /** getDatabase が返す列名(列 ID は列名と同じにする)。 */
  columns: readonly string[] = [];
  /** この DB の queryAll を失敗させる。 */
  failQueryDb: string | null = null;
  failAppend = false;
  private seq = 0;

  seed(db: string, properties: Record<string, unknown>): string {
    const id = `seed${++this.seq}`;
    this.pages.set(id, { db, properties, archived: false });
    return id;
  }

  live(db: string): NotionPage[] {
    return [...this.pages.entries()]
      .filter(([, page]) => page.db === db && !page.archived)
      .map(([id, page]) => ({ id, properties: page.properties }));
  }

  async getDatabase() {
    return { properties: Object.fromEntries(this.columns.map((name) => [name, { id: name }])) };
  }

  async queryAll(databaseId: string): Promise<NotionPage[]> {
    if (databaseId === this.failQueryDb) throw new Error(`query ${databaseId} failed`);
    return this.live(databaseId);
  }

  async createPage(databaseId: string, properties: Record<string, unknown>) {
    const id = `new${++this.seq}`;
    this.pages.set(id, { db: databaseId, properties: withPlainText(properties), archived: false });
    this.log.push(`create ${databaseId}`);
    return { id, properties };
  }

  async updatePage(pageId: string, properties: Record<string, unknown>) {
    const page = this.pages.get(pageId) as StoredPage;
    page.properties = { ...page.properties, ...withPlainText(properties) };
    this.log.push(`update ${pageId}`);
  }

  async archivePage(pageId: string) {
    (this.pages.get(pageId) as StoredPage).archived = true;
    this.log.push(`archive ${pageId}`);
  }

  async listChildren() {
    return this.blocks;
  }

  async deleteBlock(blockId: string) {
    this.blocks = this.blocks.filter((block) => block.id !== blockId);
  }

  async appendChildren(_blockId: string, children: readonly unknown[]) {
    if (this.failAppend) throw new Error("append failed");
    this.blocks = [
      ...this.blocks,
      ...children.map((child) => ({ ...withPlainText(child as Record<string, unknown>), id: `blk${++this.seq}`, type: "code" })),
    ];
  }
}
