/**
 * テニスベアの HTML に埋め込まれた window.__NUXT__ を、JS を実行せずに復元する。
 * acorn で構文解析し、実データに現れるノードだけを評価する。未知の構文は推測せずエラーにする。
 */
import { parseExpressionAt } from "acorn";

const NUXT_PATTERN = /<script>window\.__NUXT__=([\s\S]*?);?<\/script>/;

export interface AstNode {
  type: string;
  [key: string]: unknown;
}

type Scope = ReadonlyMap<string, unknown>;

export class NuxtPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NuxtPayloadError";
  }
}

function isNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}

export function node(value: unknown): AstNode {
  if (!isNode(value)) throw new NuxtPayloadError("構文木の形が想定と違います");
  return value;
}

export function nodeList(value: unknown): Array<AstNode | null> {
  if (!Array.isArray(value)) throw new NuxtPayloadError("構文木の形が想定と違います");
  return value.map((item) => (item === null ? null : node(item)));
}

function identifierName(value: AstNode): string {
  if (value.type !== "Identifier") throw new NuxtPayloadError(`識別子ではありません: ${value.type}`);
  return String(value.name);
}

export function extractNuxtSource(html: string): string {
  const match = NUXT_PATTERN.exec(html);
  if (!match) throw new NuxtPayloadError("window.__NUXT__ が見つかりません");
  return match[1];
}

function evaluateObject(value: AstNode, scope: Scope): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const item of nodeList(value.properties)) {
    const property = node(item);
    if (property.type !== "Property" || property.computed || property.method || property.kind !== "init") {
      throw new NuxtPayloadError(`未対応のプロパティ: ${property.type}`);
    }
    const key = node(property.key);
    const name = key.type === "Identifier" ? String(key.name) : String(evaluateLiteral(key));
    Object.defineProperty(result, name, {
      value: evaluate(node(property.value), scope),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

function evaluateLiteral(value: AstNode): unknown {
  if (value.type !== "Literal" || value.regex) throw new NuxtPayloadError(`未対応のリテラル: ${value.type}`);
  return value.value;
}

function evaluateUnary(value: AstNode, scope: Scope): unknown {
  const argument = evaluate(node(value.argument), scope);
  switch (value.operator) {
    case "void":
      return undefined;
    case "!":
      return !argument;
    case "-":
      if (typeof argument !== "number") throw new NuxtPayloadError("数値以外に負号が付いています");
      return -argument;
    default:
      throw new NuxtPayloadError(`未対応の単項演算: ${String(value.operator)}`);
  }
}

function evaluate(value: AstNode, scope: Scope): unknown {
  switch (value.type) {
    case "Literal":
      return evaluateLiteral(value);
    case "Identifier": {
      const name = identifierName(value);
      if (scope.has(name)) return scope.get(name);
      if (name === "undefined") return undefined;
      throw new NuxtPayloadError(`未定義の識別子: ${name}`);
    }
    case "ArrayExpression":
      return nodeList(value.elements).map((element) => (element === null ? undefined : evaluate(element, scope)));
    case "ObjectExpression":
      return evaluateObject(value, scope);
    case "UnaryExpression":
      return evaluateUnary(value, scope);
    default:
      throw new NuxtPayloadError(`未対応の構文: ${value.type}`);
  }
}

/** HTML から window.__NUXT__ の値を復元する。 */
export function parseNuxtState(html: string): unknown {
  const root = node(parseExpressionAt(extractNuxtSource(html), 0, { ecmaVersion: 2022 }));
  if (root.type !== "CallExpression") throw new NuxtPayloadError("関数呼び出しではありません");
  const callee = node(root.callee);
  if (callee.type !== "FunctionExpression") throw new NuxtPayloadError("呼び出し先が関数式ではありません");
  const params = nodeList(callee.params).map((param) => identifierName(node(param)));
  const args = nodeList(root.arguments).map((arg) => evaluate(node(arg), new Map()));
  const scope = new Map(params.map((name, index) => [name, args[index]]));
  const statements = nodeList(node(callee.body).body);
  const onlyStatement = statements.length === 1 ? node(statements[0]) : null;
  if (!onlyStatement || onlyStatement.type !== "ReturnStatement") {
    throw new NuxtPayloadError("関数本体が return 1文ではありません");
  }
  return evaluate(node(onlyStatement.argument), scope);
}
