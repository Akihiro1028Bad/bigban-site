// @vitest-environment node
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseFacilityContextData } from "./facility-context";
import facilityContextJson from "./facility-context.json";

const ROOT = path.resolve(import.meta.dirname, "../..");
const OPERATIONS_ROOT = path.join(ROOT, "docs/operations");
const SUPERPOWERS_ROOT = path.join(ROOT, "docs/superpowers");
const HISTORY_NOTICE =
  "**履歴資料**: この文書は作成時点の判断・名称・値を保存したもので、現行仕様の正典ではありません。施設の現況・正式開業日は `scripts/growth/facility-context.json`、現行の公開境界・コマンドは `docs/operations/growth/00-canon.md` を参照してください。";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function filesBelow(directory: string, extension: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesBelow(absolutePath, extension);
    return entry.isFile() && entry.name.endsWith(extension) ? [absolutePath] : [];
  });
}

function relativeFromRoot(absolutePath: string): string {
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

function japaneseDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function openLine(document: string): string[] {
  return document.match(/^Open: .+$/gm) ?? [];
}

function markdownLinks(document: string): string[] {
  return [...document.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function localLinkTarget(link: string): string | null {
  const withoutTitle = link.trim().split(/\s+["']/)[0];
  if (/^(?:https?:|mailto:|#)/.test(withoutTitle)) return null;
  const decoded = decodeURIComponent(withoutTitle.split("#")[0]);
  return decoded || null;
}

function growthCommands(document: string): string[] {
  const commands = new Set<string>();
  for (const match of document.matchAll(/`(growth:[a-z0-9:-]+)(?:\s[^`]*)?`/g)) {
    commands.add(match[1]);
  }
  for (const match of document.matchAll(/npm run\s+(growth:[a-z0-9:-]+)/g)) {
    commands.add(match[1]);
  }
  return [...commands];
}

const facilityContext = parseFacilityContextData(facilityContextJson);
const formattedOpenDate = japaneseDate(facilityContext.openDate);
const currentCorpus = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "src/app/growth/approve-proto/mockData.ts",
  ...filesBelow(OPERATIONS_ROOT, ".md").map(relativeFromRoot),
];

describe("施設情報の正典", () => {
  it("openDate と確定事実・補足の開業日が一致する", () => {
    expect(facilityContext.confirmed).toContain(
      `${formattedOpenDate}に開業した営業中の施設`
    );
    expect(facilityContext.notes).toContain(`正式な開業日は${facilityContext.openDate}`);
  });

  it.each(["AGENTS.md", "CLAUDE.md"])("%s の Open 行が正典と一致する", (file) => {
    expect(openLine(read(file))).toEqual([`Open: ${facilityContext.openDate}`]);
  });

  it("現行コーパスに旧開業日を正式日として残さない", () => {
    const forbidden = [/2026-04-18/, /2026年4月18日/, /4月18日のオープン/];
    for (const file of currentCorpus) {
      const document = read(file);
      for (const pattern of forbidden) expect(document, file).not.toMatch(pattern);
    }
  });
});

describe("公開権限の境界", () => {
  const requiredByFile: Record<string, readonly string[]> = {
    "docs/operations/growth/00-canon.md": [
      "AIの自律判断",
      "人間",
      "公開権限",
      "即時公開",
      "予約公開",
      "growth:publish-due",
      "決定的",
      "記事案の承認は公開権限ではない",
    ],
    "docs/operations/growth/10-operator-guide.md": [
      "AIの自律判断",
      "人間",
      "公開権限",
      "即時公開",
      "予約公開",
      "growth:publish-due",
      "決定的",
    ],
    "docs/operations/growth/50-publish-metrics.md": [
      "AIの自律判断",
      "人間",
      "公開権限",
      "即時公開",
      "予約公開",
      "growth:publish-due",
      "決定的",
    ],
  };

  it.each(Object.entries(requiredByFile))("%s に統一モデルを明記する", (file, terms) => {
    const document = read(file);
    for (const term of terms) expect(document, `${file}: ${term}`).toContain(term);
  });

  it("現行文書から無条件の旧公開禁止モデルを除く", () => {
    const forbidden = [
      /絶対禁止[^\n]*[:：]\s*(?:\*\*)?本番公開しない/,
      /本番公開しない[^\n]*microCMS[^\n]*手動/,
      /microCMS[^\n]*公開ボタン[^\n]*人間[^\n]*手動/,
      /worker[^\n]*(?:も|まで)[^\n]*(?:本番)?公開しない/i,
      /承認画面は(?:基本)?\s*Notion\s*を読むだけ/,
    ];
    for (const file of currentCorpus) {
      const document = read(file);
      for (const pattern of forbidden) expect(document, file).not.toMatch(pattern);
    }
  });

  it("記事案の承認を下書き生成の許可として公開操作から分離する", () => {
    const canon = read("docs/operations/growth/00-canon.md");
    const operatorGuide = read("docs/operations/growth/10-operator-guide.md");
    for (const document of [canon, operatorGuide]) {
      expect(document).toContain("下書き生成の許可");
      expect(document).toMatch(/承認[^\n]*直後[^\n]*公開されない/);
      expect(document).toMatch(/別途[^\n]*公開操作/);
    }
  });

  it("ニュース管理画面とグロース公開キューを別経路として説明する", () => {
    const manual = read("docs/operations/news-admin-manual.md");
    expect(manual).toContain("人間の明示操作");
    expect(manual).toContain("グロース公開キューとは別経路");
    expect(manual).toContain("どちらもAIの自律判断による公開ではない");
  });
});

describe("履歴資料", () => {
  it("旧日付・旧文書名を含む全資料のH1直後に正典注記を置く", () => {
    const targets = filesBelow(SUPERPOWERS_ROOT, ".md").filter((file) =>
      /4月18日|2026-04-18|drafts\.md|growth-windows-setup\.md|growth-line-approval-setup\.md/.test(
        fs.readFileSync(file, "utf8")
      )
    );
    expect(targets).toHaveLength(13);
    for (const file of targets) {
      const document = fs.readFileSync(file, "utf8");
      expect(document, relativeFromRoot(file)).toMatch(
        new RegExp(`^# .+\\n\\n${HISTORY_NOTICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
      );
    }
  });
});

describe("現行文書の参照", () => {
  const markdownFiles = [
    "AGENTS.md",
    "CLAUDE.md",
    "README.md",
    ...filesBelow(OPERATIONS_ROOT, ".md").map(relativeFromRoot),
  ];
  const scripts = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

  it("Markdownのローカルリンク先と prompts 配下の参照先が存在する", () => {
    for (const file of markdownFiles) {
      const document = read(file);
      const links = markdownLinks(document)
        .map(localLinkTarget)
        .filter((target): target is string => target !== null);
      const promptReferences = [...document.matchAll(/(?:scripts\/growth\/)?prompts\/[A-Za-z0-9._/-]+\.md/g)].map(
        (match) => match[0]
      );
      for (const target of [...links, ...promptReferences]) {
        const absoluteTarget = target.startsWith("prompts/")
          ? path.join(ROOT, "scripts/growth", target)
          : target.startsWith("scripts/")
            ? path.join(ROOT, target)
            : path.resolve(path.dirname(path.join(ROOT, file)), target);
        expect(fs.existsSync(absoluteTarget), `${file} -> ${target}`).toBe(true);
      }
    }
  });

  it("記載された growth コマンドが package.json に存在する", () => {
    for (const file of markdownFiles) {
      for (const command of growthCommands(read(file))) {
        expect(scripts.scripts, `${file}: ${command}`).toHaveProperty(command);
      }
    }
  });
});
