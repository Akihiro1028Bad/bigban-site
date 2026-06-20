// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

import {
  buildEyecatchPrompt,
  generateEyecatch,
  generateImage,
  EYECATCH_EDITS_URL,
  IMAGE_GENERATIONS_URL,
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

  it("ピックルボール視覚アンカーと卓球ネガティブを含む（#89: 卓球バイアス対策）", () => {
    const prompt = buildEyecatchPrompt("playing pickleball with a paddle");
    expect(prompt).toMatch(/pickleball/i);
    expect(prompt).toMatch(/whiffle ball with holes/i);
    expect(prompt.toLowerCase()).toContain("not table tennis");
    expect(prompt.toLowerCase()).toContain("not ping pong");
    // 区切りが壊れない（二重ピリオド・二重空白を作らない）
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

describe("generateImage（参照なし=text-to-image / #63）", () => {
  const okResponse = (b64: string) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ b64_json: b64 }] }),
      text: async () => "",
    }) as Awaited<ReturnType<FetchFn>>;

  it("refPath 未指定なら generations へ JSON POST し、readFile を呼ばない", async () => {
    const b64 = Buffer.from("gen").toString("base64");
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(okResponse(b64));
    const readFile = vi.fn(async () => Buffer.from("x"));

    const buf = await generateImage(
      { apiKey: "sk", prompt: "minimal art", size: "1536x1024", quality: "high" },
      { fetchFn, readFile }
    );

    expect(buf.toString()).toBe("gen");
    expect(readFile).not.toHaveBeenCalled();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(IMAGE_GENERATIONS_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json"
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "gpt-image-2",
      prompt: "minimal art",
      n: 1,
    });
  });

  it("refPath 指定なら edits(参照画像)へ送る", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(okResponse("YQ=="));
    const readFile = vi.fn(async () => Buffer.from("ref"));
    await generateImage(
      { apiKey: "sk", prompt: "p", size: "1536x1024", quality: "high", refPath: "/r.png" },
      { fetchFn, readFile }
    );
    expect(readFile).toHaveBeenCalledWith("/r.png");
    expect(fetchFn.mock.calls[0][0]).toBe(EYECATCH_EDITS_URL);
    expect(fetchFn.mock.calls[0][1].body).toBeInstanceOf(FormData);
  });

  it("generations の HTTP エラーは内容付きで例外", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => "server error",
    });
    await expect(
      generateImage(
        { apiKey: "k", prompt: "p", size: "1536x1024", quality: "high" },
        { fetchFn, readFile: vi.fn(async () => Buffer.from("x")) }
      )
    ).rejects.toThrow("500");
  });
});
