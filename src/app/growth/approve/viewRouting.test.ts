import { afterEach, describe, expect, it } from "vitest";

import {
  APPROVE_VIEWS,
  decideInitialView,
  initialDraftFromUrl,
  parseSettingsSection,
  parseView,
  resolveLegacyView,
  viewLocation,
} from "./viewRouting";

describe("parseView", () => {
  it("刷新後の7 view を正規化し、未知/欠落は null", () => {
    expect(APPROVE_VIEWS).toEqual(["home", "proposal", "approve", "queue", "performance", "settings", "ops"]);
    for (const v of APPROVE_VIEWS) expect(parseView(v)).toBe(v);
    expect(parseView("articles")).toBeNull(); // 旧値は廃止
    expect(parseView(null)).toBeNull();
    expect(parseView(undefined)).toBeNull();
  });
});

describe("legacy view compatibility", () => {
  it("prompt/models を settings と対応sectionへ移す", () => {
    expect(resolveLegacyView("prompt")).toEqual({ view: "settings", section: "prompts" });
    expect(resolveLegacyView("models")).toEqual({ view: "settings", section: "models" });
    expect(resolveLegacyView("queue")).toEqual({ view: "queue", section: null });
  });

  it("section は models/prompts のみ受理し、既定は models", () => {
    expect(parseSettingsSection("prompts")).toBe("prompts");
    expect(parseSettingsSection("models")).toBe("models");
    expect(parseSettingsSection("other")).toBe("models");
    expect(parseSettingsSection(null)).toBe("models");
  });
});

describe("viewLocation", () => {
  it("settings は選択中sectionをURLへ残す", () => {
    expect(viewLocation("https://example.com/growth/approve?view=home", "settings", "prompts"))
      .toBe("/growth/approve?view=settings&section=prompts");
  });

  it("settings以外へ移るとsectionを削除し、doc/hashは維持する", () => {
    expect(viewLocation("https://example.com/growth/approve?view=settings&section=prompts&doc=x#見出し", "home", "prompts"))
      .toBe("/growth/approve?view=home&doc=x#%E8%A6%8B%E5%87%BA%E3%81%97");
  });
});

describe("initialDraftFromUrl", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("URL の draft パラメータ(=contentId)を読み取る", () => {
    window.history.replaceState(null, "", "/?view=approve&draft=g-abc123");
    expect(initialDraftFromUrl()).toBe("g-abc123");
  });

  it("draft が無ければ null", () => {
    window.history.replaceState(null, "", "/?view=approve");
    expect(initialDraftFromUrl()).toBeNull();
  });

  it("draft が空文字なら null(空 id を選択対象にしない)", () => {
    window.history.replaceState(null, "", "/?draft=");
    expect(initialDraftFromUrl()).toBeNull();
  });
});

describe("decideInitialView", () => {
  it("URL 指定を最優先", () => {
    expect(decideInitialView("queue", { proposalPending: 5, awaiting: 5 })).toBe("queue");
  });
  it("URL指定がなければ件数にかかわらず home", () => {
    expect(decideInitialView(null, { proposalPending: 1, awaiting: 3 })).toBe("home");
    expect(decideInitialView(null, { proposalPending: 0, awaiting: 2 })).toBe("home");
    expect(decideInitialView(null, { proposalPending: 0, awaiting: 0 })).toBe("home");
  });
});
