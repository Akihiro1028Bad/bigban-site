// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
}));

import { readdir, readFile } from "node:fs/promises";

import { GET } from "./route";

const BASE = "http://localhost/api/growth/prompts";

function getReq(token: string | null = null): Request {
  const url = new URL(BASE);
  const headers: Record<string, string> = {};
  if (token !== null) headers.Authorization = `Bearer ${encodeURIComponent(token)}`;
  return new Request(url, { method: "GET", headers });
}

/** prompts ディレクトリと examples ディレクトリで返す一覧を出し分ける。 */
function mockReaddir(prompts: string[], examples: string[]): void {
  vi.mocked(readdir).mockImplementation((async (dir: string) =>
    String(dir).endsWith("examples") ? examples : prompts) as unknown as typeof readdir);
}

/** suffix 一致で内容を返す readFile。throwFor に含むパス suffix は読み取り失敗にする。 */
function mockReadFile(throwFor: string[] = []): void {
  vi.mocked(readFile).mockImplementation((async (p: string) => {
    if (throwFor.some((s) => p.endsWith(s))) throw new Error(`ENOENT ${p}`);
    if (p.endsWith("facility-context.json")) return '{"open":false}';
    return `<<${p.split("/").pop()}>>`;
  }) as unknown as typeof readFile);
}

beforeEach(() => {
  flags.authEnabled = false; // 既定はオフ(開発段階)
  vi.mocked(readdir).mockReset();
  vi.mocked(readFile).mockReset();
});

afterEach(() => {
  delete process.env.APPROVE_SECRET;
});

describe("GET /api/growth/prompts", () => {
  it("認証有効でトークン不正なら 401", async () => {
    flags.authEnabled = true;
    process.env.APPROVE_SECRET = "secret";
    const res = await GET(getReq("wrong"));
    expect(res.status).toBe(401);
  });

  it("プロンプト・例・参考ドキュメント・前提情報をまとめて返す", async () => {
    mockReaddir(["weekly.md", "drafts.md", "README.txt"], ["example-trend.md"]);
    mockReadFile();

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      facilityContext: string | null;
      groups: { group: string; phases: { filename: string }[] }[];
    };
    expect(json.success).toBe(true);
    expect(json.facilityContext).toBe('{"open":false}');
    const byGroup = Object.fromEntries(
      json.groups.map((g) => [g.group, g.phases.map((p) => p.filename)]),
    );
    expect(byGroup["分析"]).toEqual(["weekly.md"]);
    expect(byGroup["執筆"]).toEqual(["drafts.md"]);
    expect(byGroup["文体の例"]).toEqual(["example-trend.md"]);
    // 参考ドキュメント(CLAUDE.md 先頭 + style-guide / ai-news-prompt / runbook)
    expect(byGroup["参考ドキュメント"]).toEqual([
      "CLAUDE.md",
      "growth-article-style.md",
      "ai-news-prompt.md",
      "growth-weekly-runbook.md",
    ]);
    // 運用・セットアップ(microCMS 手動運用マニュアルのみ)
    expect(byGroup["運用・セットアップ"]).toEqual(["news-admin-manual.md"]);
  });

  it("examples ディレクトリが無くても他は返す", async () => {
    vi.mocked(readdir).mockImplementation((async (dir: string) => {
      if (String(dir).endsWith("examples")) throw new Error("ENOENT");
      return ["weekly.md"];
    }) as unknown as typeof readdir);
    mockReadFile();

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { groups: { group: string }[] };
    expect(json.groups.some((g) => g.group === "文体の例")).toBe(false);
    expect(json.groups.some((g) => g.group === "分析")).toBe(true);
  });

  it("一部の参考ドキュメントが読めなくても残りは返す", async () => {
    mockReaddir(["weekly.md"], []);
    mockReadFile(["ai-news-prompt.md"]); // 1点だけ欠落

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      groups: { group: string; phases: { filename: string }[] }[];
    };
    const refs = json.groups.find((g) => g.group === "参考ドキュメント");
    expect(refs?.phases.map((p) => p.filename)).toEqual([
      "CLAUDE.md",
      "growth-article-style.md",
      "growth-weekly-runbook.md",
    ]);
  });

  it("facility-context が読めなくても返す(facilityContext=null)", async () => {
    mockReaddir(["weekly.md"], []);
    mockReadFile(["facility-context.json"]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; facilityContext: string | null };
    expect(json.success).toBe(true);
    expect(json.facilityContext).toBeNull();
  });

  it("プロンプトディレクトリが読めなければ 500", async () => {
    vi.mocked(readdir).mockImplementation((async (dir: string) => {
      if (String(dir).endsWith("examples")) return [];
      throw new Error("ENOENT");
    }) as unknown as typeof readdir);
    mockReadFile();

    const res = await GET(getReq());
    expect(res.status).toBe(500);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });
});
