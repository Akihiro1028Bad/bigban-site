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

import { PROMPT_REGISTRY } from "@/lib/growth/promptRegistry";

import { GET } from "./route";

const BASE = "http://localhost/api/growth/prompts";

function getReq(token: string | null = null): Request {
  const url = new URL(BASE);
  const headers: Record<string, string> = {};
  if (token !== null) headers.Authorization = `Bearer ${encodeURIComponent(token)}`;
  return new Request(url, { method: "GET", headers });
}

/** prompts / shared / examples ディレクトリで返す一覧を出し分ける。 */
function mockReaddir(prompts: string[], examples: string[], shared: string[] = []): void {
  vi.mocked(readdir).mockImplementation((async (dir: string) =>
    String(dir).endsWith("examples")
      ? examples
      : String(dir).endsWith("shared")
        ? shared
        : prompts) as unknown as typeof readdir);
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
    mockReaddir(
      ["weekly.md", "drafts.md", "README.txt"],
      ["example-trend.md"],
      ["article-idea.md", "growth-goals.md"],
    );
    mockReadFile();

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      facilityContext: string | null;
      warnings: string[];
      groups: { group: string; phases: { filename: string; path: string }[] }[];
    };
    expect(json.success).toBe(true);
    expect(json.facilityContext).toBe('{"open":false}');
    expect(json.warnings).toEqual([]);
    const byGroup = Object.fromEntries(
      json.groups.map((g) => [g.group, g.phases.map((p) => p.path)]),
    );
    for (const group of new Set(PROMPT_REGISTRY.map((entry) => entry.group))) {
      expect(byGroup[group]).toEqual(
        PROMPT_REGISTRY.filter((entry) => entry.group === group)
          .sort((a, b) => a.order - b.order)
          .map((entry) => entry.path),
      );
    }
  });

  it("登録済み資料はディレクトリ列挙結果に依存せずマニフェストから全件読み込む", async () => {
    mockReaddir([], [], []);
    mockReadFile();

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      groups: { phases: { path: string }[] }[];
    };
    expect(json.groups.flatMap((group) => group.phases.map((phase) => phase.path))).toEqual(
      expect.arrayContaining(PROMPT_REGISTRY.map((entry) => entry.path)),
    );
  });

  it("sourceKind=prompt の登録ファイルが1件でも欠落したら500", async () => {
    mockReaddir(["weekly.md"], [], []);
    mockReadFile(["scripts/growth/prompts/drafts.md"]);

    const res = await GET(getReq());
    expect(res.status).toBe(500);
  });

  it("shared / example の登録ファイル欠落はファイル単位のwarningにする", async () => {
    mockReaddir([], [], []);
    mockReadFile([
      "scripts/growth/prompts/shared/article-idea.md",
      "scripts/growth/prompts/examples/example-trend.md",
    ]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { warnings: string[] };
    expect(json.warnings).toEqual(
      expect.arrayContaining([
        "任意資料 scripts/growth/prompts/shared/article-idea.md を読み込めませんでした。",
        "任意資料 scripts/growth/prompts/examples/example-trend.md を読み込めませんでした。",
      ]),
    );
  });

  it("未登録Markdownはマニフェスト読込とは別の補完スキャンでその他に追加する", async () => {
    mockReaddir(["unregistered.md"], [], []);
    mockReadFile();

    const res = await GET(getReq());
    const json = (await res.json()) as {
      groups: { group: string; phases: { path: string }[] }[];
    };
    expect(json.groups.find((group) => group.group === "その他")?.phases).toEqual([
      expect.objectContaining({ path: "scripts/growth/prompts/unregistered.md" }),
    ]);
  });

  it("未登録Markdownの読込失敗はwarningにして除外する", async () => {
    mockReaddir(["unregistered.md"], [], []);
    mockReadFile(["unregistered.md"]);
    const res = await GET(getReq());
    const json = (await res.json()) as { warnings: string[]; groups: { phases: { path: string }[] }[] };
    expect(json.warnings).toContain("任意資料 scripts/growth/prompts/unregistered.md を読み込めませんでした。");
    expect(json.groups.flatMap((group) => group.phases).some((phase) => phase.path.endsWith("unregistered.md"))).toBe(false);
  });

  it("examples ディレクトリが無くても他は返す", async () => {
    vi.mocked(readdir).mockImplementation((async (dir: string) => {
      if (String(dir).endsWith("examples")) throw new Error("ENOENT");
      if (String(dir).endsWith("shared")) return [];
      return ["weekly.md"];
    }) as unknown as typeof readdir);
    mockReadFile();

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { warnings: string[]; groups: { group: string }[] };
    expect(json.warnings).toContain("任意資料 scripts/growth/prompts/examples を読み込めませんでした。");
    expect(json.groups.some((g) => g.group === "文体例")).toBe(true);
    expect(json.groups.some((g) => g.group === "実行プロンプト")).toBe(true);
  });

  it("任意ディレクトリ全体欠落時は登録個別warningだけにしdir warningを重複させない", async () => {
    vi.mocked(readdir).mockImplementation((async (dir: string) => {
      if (String(dir).endsWith("examples")) throw new Error("ENOENT examples");
      return [];
    }) as unknown as typeof readdir);
    vi.mocked(readFile).mockImplementation((async (p: string) => {
      if (String(p).includes("scripts/growth/prompts/examples/")) {
        throw new Error(`ENOENT ${p}`);
      }
      if (String(p).endsWith("facility-context.json")) return '{"open":false}';
      return `<<${String(p).split("/").pop()}>>`;
    }) as unknown as typeof readFile);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { warnings: string[] };
    const exampleWarnings = json.warnings.filter((warning) =>
      warning.includes("scripts/growth/prompts/examples"),
    );
    expect(exampleWarnings).toHaveLength(
      PROMPT_REGISTRY.filter((entry) => entry.sourceKind === "example").length,
    );
    expect(exampleWarnings).not.toContain(
      "任意資料 scripts/growth/prompts/examples を読み込めませんでした。",
    );
  });

  it("一部の参考ドキュメントが読めなくても残りと warning を返す", async () => {
    mockReaddir(["weekly.md"], []);
    mockReadFile(["ai-news-prompt.md"]); // 1点だけ欠落

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      warnings: string[];
      groups: { group: string; phases: { path: string }[] }[];
    };
    expect(json.warnings).toContain(
      "任意資料 docs/operations/ai-news-prompt.md を読み込めませんでした。",
    );
    expect(json.warnings.join(" ")).not.toContain(process.cwd());
    const refs = json.groups.find((g) => g.group === "正典・共通ルール");
    expect(refs?.phases.map((p) => p.path)).toEqual([
      "CLAUDE.md",
      "AGENTS.md",
      "docs/operations/growth/00-canon.md",
      "docs/operations/growth-article-style.md",
      "scripts/growth/prompts/shared/article-idea.md",
    ]);
  });

  it("facility-context が読めなくても返す(facilityContext=null)", async () => {
    mockReaddir(["weekly.md"], []);
    mockReadFile(["facility-context.json"]);

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      facilityContext: string | null;
      warnings: string[];
    };
    expect(json.success).toBe(true);
    expect(json.facilityContext).toBeNull();
    expect(json.warnings).toContain(
      "任意資料 scripts/growth/facility-context.json を読み込めませんでした。",
    );
  });

  it("補完スキャンのディレクトリが読めなくても登録済み資料を返しwarningにする", async () => {
    vi.mocked(readdir).mockImplementation((async (dir: string) => {
      if (String(dir).endsWith("examples")) return [];
      throw new Error("ENOENT");
    }) as unknown as typeof readdir);
    mockReadFile();

    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; warnings: string[] };
    expect(json.success).toBe(true);
    expect(json.warnings).toEqual(
      expect.arrayContaining([
        "任意資料 scripts/growth/prompts を読み込めませんでした。",
        "任意資料 scripts/growth/prompts/shared を読み込めませんでした。",
      ]),
    );
  });
});
