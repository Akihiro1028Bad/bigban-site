// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  bindingContainerTextHash,
  bindingReferencesMatchBody,
} from "./factBindingMetadata";

describe("bindingReferencesMatchBody", () => {
  it("HTML entity・空白を正規化してfact抜粋を照合する", () => {
    const references = [{
      factId: "fact-fee",
      excerpt: '参加費は <500円> & "税込"\nです',
      container: "p" as const,
      containerIndex: 1,
    }];
    expect(bindingReferencesMatchBody(
      "<p>参加費は &lt;500円&gt; &amp; &quot;税込&quot;&nbsp;です</p>",
      references,
    )).toBe(true);
    expect(bindingReferencesMatchBody("<p>参加費は600円です</p>", references)).toBe(false);
    expect(bindingReferencesMatchBody("<p>本文</p>", [])).toBe(false);
  });

  it("同じ抜粋が別要素に残っていても束縛先のfact変更を検知する", () => {
    const references = [{
      factId: "fact-fee",
      excerpt: "参加費は500円です",
      container: "p" as const,
      containerIndex: 1,
    }];

    expect(bindingReferencesMatchBody(
      "<p>参加費は600円です</p><p>参加費は500円です</p>",
      references,
    )).toBe(false);
    expect(bindingReferencesMatchBody(
      "<p><strong>参加費は500円です</strong></p><p>説明を変更しました</p>",
      references,
    )).toBe(true);
    expect(bindingReferencesMatchBody("<p>説明です</p>", [{
      ...references[0],
      containerIndex: 2,
    }])).toBe(false);
  });

  it("前方への非fact段落追加後も一意な束縛先を追跡する", () => {
    const excerpt = "参加費は500円です";
    const references = [{
      factId: "fact-fee",
      excerpt,
      sectionPath: "料金 > 詳細",
      container: "p" as const,
      containerIndex: 1,
      containerTextHash: bindingContainerTextHash(excerpt),
      containerMatchCount: 1,
    }];

    expect(bindingReferencesMatchBody(
      `<h2>料金</h2><h3>詳細</h3><p>補足を追加しました</p><p>${excerpt}</p>`,
      references,
    )).toBe(true);
    expect(bindingReferencesMatchBody(`<p>補足</p><p>${excerpt}</p>`, [{
      ...references[0],
      sectionPath: undefined,
    }])).toBe(false);
    expect(bindingReferencesMatchBody(`<p>補足</p><p>${excerpt}</p>`, [{
      ...references[0],
      sectionPath: "",
      containerTextHash: undefined,
    }])).toBe(false);
    expect(bindingReferencesMatchBody(`<p>補足</p><p>${excerpt}</p>`, [{
      ...references[0],
      sectionPath: "",
      containerTextHash: bindingContainerTextHash("別の本文"),
    }])).toBe(false);
  });

  it("ネストしたliの内側にある束縛先をDOM順で照合する", () => {
    const excerpt = "参加費は500円です";
    expect(bindingReferencesMatchBody(
      `<ul><li>概要<ul><li>${excerpt}</li></ul></li></ul>`,
      [{
        factId: "fact-fee",
        excerpt,
        sectionPath: "",
        container: "li",
        containerIndex: 2,
        containerTextHash: bindingContainerTextHash(excerpt),
        containerMatchCount: 1,
      }],
    )).toBe(true);
  });

  it("同じ要素で重なった不正な抜粋参照は安全側に拒否する", () => {
    expect(bindingReferencesMatchBody(
      "<p>参加費は500円です</p>",
      [
        { factId: "fact-fee", excerpt: "参加費は500円です", container: "p", containerIndex: 1 },
        { factId: "fact-amount", excerpt: "500円", container: "p", containerIndex: 1 },
      ],
    )).toBe(false);
  });

  it("束縛後に見出しへ追加された数値主張を拒否する", () => {
    expect(bindingReferencesMatchBody(
      "<p>参加費は500円です</p><h2>新プランは10万円です</h2>",
      [{ factId: "fact-fee", excerpt: "参加費は500円です", container: "p", containerIndex: 1 }],
    )).toBe(false);
  });

  // 値カバレッジ方式(#fact-coverage)では固有名詞だけの文は reference を持たないのが正常なので、
  // 残余テキストの掃引は crisp な値主張だけを見る。固有名詞の有無ではブロックしない。
  it("束縛後に追加された固有名詞だけの主張は拒否しない", () => {
    const references = [{
      factId: "fact-fee",
      excerpt: "参加費は500円です",
      container: "p" as const,
      containerIndex: 1,
    }];

    expect(bindingReferencesMatchBody(
      "<p>参加費は500円です</p><p>DUPRは公式レーティングです</p>",
      references,
    )).toBe(true);
    expect(bindingReferencesMatchBody(
      "<p>参加費は500円です</p><p>体育館や地域クラブでの活動が中心です</p>",
      references,
    )).toBe(true);
  });

  it("固有名詞に数値主張が加われば拒否する", () => {
    expect(bindingReferencesMatchBody(
      "<p>参加費は500円です</p><p>DUPRは1000人が利用しています</p>",
      [{ factId: "fact-fee", excerpt: "参加費は500円です", container: "p", containerIndex: 1 }],
    )).toBe(false);
  });

  it("英字固有名詞を題材として示すだけの見出しは許可する", () => {
    expect(bindingReferencesMatchBody(
      "<h2>DUPRとは</h2><p>参加費は500円です</p>",
      [{ factId: "fact-fee", excerpt: "参加費は500円です", container: "p", containerIndex: 1 }],
    )).toBe(true);
  });

  it.each([
    ["h4", "<h4>新プランは10万円です</h4>"],
    ["aside", '<aside class="note">新プランは10万円です</aside>'],
    ["blockquote", "<blockquote>新プランは10万円です</blockquote>"],
  ])("束縛後に追加された%s内の数値主張を拒否する", (_tag, addedHtml) => {
    expect(bindingReferencesMatchBody(
      `<p>参加費は500円です</p>${addedHtml}`,
      [{ factId: "fact-fee", excerpt: "参加費は500円です", container: "p", containerIndex: 1 }],
    )).toBe(false);
  });

  it("助詞を省略した英字固有名詞の主張も拒否しない", () => {
    expect(bindingReferencesMatchBody(
      "<p>参加費は500円です</p><p>DUPR公式レーティングです</p>",
      [{ factId: "fact-fee", excerpt: "参加費は500円です", container: "p", containerIndex: 1 }],
    )).toBe(true);
  });

  it("ブロック外に追加された可視テキストの主張を拒否する", () => {
    expect(bindingReferencesMatchBody(
      "<p>参加費は500円です</p>新プランは10万円です",
      [{ factId: "fact-fee", excerpt: "参加費は500円です", container: "p", containerIndex: 1 }],
    )).toBe(false);
  });

  it("aside内の束縛済み段落を親要素で二重検査しない", () => {
    expect(bindingReferencesMatchBody(
      '<aside class="note"><p>参加費は500円です</p></aside>',
      [{ factId: "fact-fee", excerpt: "参加費は500円です", container: "p", containerIndex: 1 }],
    )).toBe(true);
  });
});
