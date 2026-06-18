// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import {
  buildEyecatchPrompt,
  generateEyecatch,
  EYECATCH_EDITS_URL,
} from "./eyecatch";
import type { FetchFn } from "./http";

describe("buildEyecatchPrompt", () => {
  it("参照キャラ固定の指示・記事ごとの行為・固定スタイルを1つのプロンプトに組む", () => {
    const action = "happily playing pickleball, swinging a glowing blue paddle";
    const prompt = buildEyecatchPrompt(action);
    // キャラ固定（参照画像の顔を保持）
    expect(prompt).toContain("reference image");
    expect(prompt).toContain("gray");
    expect(prompt).toContain("almond");
    // 記事ごとの行為が差し込まれる
    expect(prompt).toContain(action);
    // 固定スタイル: フラット・宇宙・ブランド配色・16:9・文字なし
    expect(prompt).toContain("flat illustration");
    expect(prompt).toContain("16:9");
    expect(prompt).toContain("#11317B");
    expect(prompt).toContain("#306EC3");
    expect(prompt).toContain("#F6FF54");
    expect(prompt.toLowerCase()).toContain("negative space");
    expect(prompt.toLowerCase()).toContain("no text");
  });

  it("行為部分の前後が自然につながる（二重ピリオドや空アクションを避ける）", () => {
    const prompt = buildEyecatchPrompt("standing confidently with a paddle");
    expect(prompt).not.toContain("..");
    expect(prompt).not.toContain("  ");
  });
});

describe("generateEyecatch", () => {
  const okResponse = (b64: string) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: b64 }] }),
      text: async () => "",
    }) as Awaited<ReturnType<FetchFn>>;

  const deps = (fetchFn: FetchFn) => ({
    fetchFn,
    readFile: vi.fn(async () => Buffer.from("fake-png-bytes")),
  });

  it("edits エンドポイントへ Authorization 付きで POST し、b64 をデコードした Buffer を返す", async () => {
    const b64 = Buffer.from("generated-image").toString("base64");
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(okResponse(b64));
    const d = deps(fetchFn);

    const buf = await generateEyecatch(
      {
        apiKey: "sk-test",
        refPath: "/path/mascot-alien.png",
        prompt: "a prompt",
        size: "1536x1024",
        quality: "high",
      },
      d
    );

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.toString()).toBe("generated-image");
    expect(d.readFile).toHaveBeenCalledWith("/path/mascot-alien.png");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(EYECATCH_EDITS_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test"
    );
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("HTTP エラー時は内容付きで例外を投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
      text: async () => "bad request",
    });
    await expect(
      generateEyecatch(
        { apiKey: "k", refPath: "/r.png", prompt: "p", size: "1536x1024", quality: "high" },
        deps(fetchFn)
      )
    ).rejects.toThrow("400");
  });

  it("レスポンスに b64_json が無ければ例外を投げる", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{}] }),
      text: async () => "",
    });
    await expect(
      generateEyecatch(
        { apiKey: "k", refPath: "/r.png", prompt: "p", size: "1536x1024", quality: "high" },
        deps(fetchFn)
      )
    ).rejects.toThrow();
  });
});
