// jsdom は vitest の実行環境として入っているが型定義(@types/jsdom)は無い。
// body-diff.ts が使う範囲だけを宣言する。
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string);
    readonly window: { readonly document: Document };
  }
}
