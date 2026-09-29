// @vitest-environment node
import { describe, expect, it } from "vitest";

import { NuxtPayloadError, extractNuxtSource, node, nodeList, parseNuxtState } from "./nuxtPayload";

function page(payload: string): string {
  return `<html><body><div id="__nuxt"></div><script>window.__NUXT__=${payload};</script></body></html>`;
}

describe("extractNuxtSource", () => {
  it("script から代入式の右辺を取り出す", () => {
    expect(extractNuxtSource(page("(function(a){return {x:a}}(1))"))).toBe(
      "(function(a){return {x:a}}(1))",
    );
  });

  it("window.__NUXT__ がなければエラー", () => {
    expect(() => extractNuxtSource("<html></html>")).toThrow(NuxtPayloadError);
  });
});

describe("parseNuxtState", () => {
  it("引数参照・入れ子・配列・エスケープを復元する", () => {
    const html = page(
      '(function(a,b,c){return {state:{id:a,flag:b,none:c,list:[a,"x\\u002Fy",{n:-1}],"quoted-key":void 0}}}(10,false,null))',
    );
    expect(parseNuxtState(html)).toEqual({
      state: { id: 10, flag: false, none: null, list: [10, "x/y", { n: -1 }], "quoted-key": undefined },
    });
  });

  it("配列の穴は undefined、! 演算と undefined 識別子に対応する", () => {
    const html = page("(function(a){return {list:[,a],neg:!a,u:undefined}}(true))");
    expect(parseNuxtState(html)).toEqual({ list: [undefined, true], neg: false, u: undefined });
  });

  it("__proto__ キーでプロトタイプを汚さない", () => {
    const state = parseNuxtState(page('(function(){return {"__proto__":{polluted:true}}}())')) as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(state, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it.each([
    ["関数呼び出しでない", "{a:1}"],
    ["呼び出し先が関数式でない", "foo(1)"],
    ["引数が識別子でない", "(function({a}){return {}}(1))"],
    ["本体が return 1文でない", "(function(a){a.x=1;return {}}(1))"],
    ["未定義の識別子", "(function(){return {x:window}}())"],
    ["未対応の構文", "(function(){return {x:1+1}}())"],
    ["未対応の単項演算", "(function(){return {x:typeof 1}}())"],
    ["数値以外の負号", '(function(){return {x:-"a"}}())'],
    ["計算プロパティ", '(function(){return {["x"]:1}}())'],
    ["スプレッド", "(function(a){return {...a}}({}))"],
    ["正規表現", "(function(){return {x:/a/}}())"],
    ["テンプレート文字列", "(function(){return {x:`a`}}())"],
    ["メソッド", "(function(){return {m(){}}}())"],
  ])("%s はエラーにする", (_label, payload) => {
    expect(() => parseNuxtState(page(payload))).toThrow(NuxtPayloadError);
  });
});

describe("構文木の形の検査", () => {
  it("ノードでない値・配列でない値はエラー、正しい形はそのまま返す", () => {
    expect(() => node(null)).toThrow(NuxtPayloadError);
    expect(() => node({ type: 1 })).toThrow(NuxtPayloadError);
    expect(() => nodeList("x")).toThrow(NuxtPayloadError);
    expect(nodeList([null, { type: "Literal" }])).toEqual([null, { type: "Literal" }]);
  });
});
