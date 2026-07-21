/**
 * 機能概要:
 *   _extract.mjs の抽出エンジン (matchDelimiter / extractFunction / extractConst) の
 *   独立ユニットテスト (RVW-002 対応)。
 *
 * 作成意図:
 *   抽出エンジンが壊れても loadPureFns は load-time throw せずに誤った関数を評価し続ける
 *   可能性がある。特に matchDelimiter の template literal 内 ${...} スキップ挙動は
 *   回帰防止のアサーションがなかった。本ファイルでエンジン単体の決定的な振る舞いを固定する。
 *
 * 注意点:
 *   - 対象は _extract.mjs からエクスポートされた matchDelimiter / extractFunction / extractConst。
 *   - 非決定 API は持ち込まない (固定入力→固定出力)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchDelimiter, extractFunction, extractConst, readSource } from "./_extract.mjs";

// ---- matchDelimiter: 括弧対応の基本 ----

test("matchDelimiter は単純なブレースペアの閉じ index を返す", () => {
  const src = "{ a; b; }";
  const closeIdx = matchDelimiter(src, 0, "{", "}");
  assert.equal(closeIdx, 8);
  assert.equal(src[closeIdx], "}");
});

test("matchDelimiter はネストした括弧を正しくカウントする", () => {
  // 外側の { ... { ... } ... } の外側閉じ括弧を返す
  const src = "{ a; { b; } c; }";
  const closeIdx = matchDelimiter(src, 0, "{", "}");
  assert.equal(closeIdx, 15);
  assert.equal(src[closeIdx], "}");
});

test("matchDelimiter は行コメント内の括弧を深さ計算から除外する", () => {
  // `// }` の } はコメント内なので深さを減らさない
  const src = "{ // }\n b; }";
  const closeIdx = matchDelimiter(src, 0, "{", "}");
  // コメント後の } が対応括弧
  assert.equal(src[closeIdx], "}");
  // コメント内の } の index (3) ではなく末尾の } が返るはず
  assert.ok(closeIdx > 4);
});

test("matchDelimiter はブロックコメント内の括弧を深さ計算から除外する", () => {
  // `/* } */` の } はコメント内なので深さを減らさない
  const src = "{ /* } */ b; }";
  const closeIdx = matchDelimiter(src, 0, "{", "}");
  assert.equal(src[closeIdx], "}");
  assert.equal(closeIdx, 13);
});

test("matchDelimiter は文字列リテラル内の括弧を深さ計算から除外する (シングルクォート)", () => {
  const src = `{ a = '}'; }`;
  const closeIdx = matchDelimiter(src, 0, "{", "}");
  // '}'  の } はリテラル内なので深さを減らさない
  assert.equal(src[closeIdx], "}");
  assert.equal(closeIdx, 11);
});

test("matchDelimiter は文字列リテラル内の括弧を深さ計算から除外する (ダブルクォート)", () => {
  const src = `{ a = "}"; }`;
  const closeIdx = matchDelimiter(src, 0, "{", "}");
  assert.equal(src[closeIdx], "}");
  assert.equal(closeIdx, 11);
});

test("matchDelimiter は template literal 内の ${...} を括弧カウントから除外する", () => {
  // template literal 内の ${...} を誤って括弧として数えると深さが合わなくなる
  // ただし本実装は tpl モード中にネストした ${} を追わないため、${} の中身の {} が
  // ` (backtick) の前に閉じる構造でのみ安全 — まずは単純な template literal で確認する
  const src = "{ const s = `hello ${name}`; }";
  const closeIdx = matchDelimiter(src, 0, "{", "}");
  // 最後の } が対応括弧
  assert.equal(src[closeIdx], "}");
  assert.equal(closeIdx, 29);
});

test("matchDelimiter は対応する閉じ括弧が無いとき throw する", () => {
  assert.throws(() => matchDelimiter("{ abc", 0, "{", "}"), /matchDelimiter.*閉じ括弧/);
});

// ---- extractFunction: トップレベル function 宣言の切り出し ----

test("extractFunction は単純な function 宣言を切り出す", () => {
  const src = `
function add(a, b) {
  return a + b;
}
`;
  const result = extractFunction(src, "add");
  assert.match(result, /function add\(a, b\)/);
  assert.match(result, /return a \+ b;/);
  // 末尾が } で閉じている
  assert.ok(result.trimEnd().endsWith("}"));
});

test("extractFunction は async function を切り出す", () => {
  const src = `
async function fetchData(url) {
  return await fetch(url);
}
`;
  const result = extractFunction(src, "fetchData");
  assert.match(result, /async\s+function fetchData/);
  assert.match(result, /await fetch\(url\)/);
});

test("extractFunction はネストしたブレースを含む関数を正しく切り出す", () => {
  const src = `
function complex(x) {
  if (x > 0) {
    return { ok: true };
  }
  return { ok: false };
}
`;
  const result = extractFunction(src, "complex");
  // 関数全体が含まれる
  assert.match(result, /function complex\(x\)/);
  assert.match(result, /return \{ ok: true \}/);
  assert.match(result, /return \{ ok: false \}/);
  // 末尾が } で閉じている
  assert.ok(result.trimEnd().endsWith("}"));
});

test("extractFunction は存在しない関数名で throw する", () => {
  const src = "function add(a, b) { return a + b; }";
  assert.throws(() => extractFunction(src, "multiply"), /extractFunction.*multiply.*見つかりません/);
});

test("extractFunction は複数の関数が存在するとき指定した関数だけ切り出す", () => {
  const src = `
function foo() { return 1; }
function bar() { return 2; }
`;
  const fooResult = extractFunction(src, "foo");
  const barResult = extractFunction(src, "bar");
  assert.match(fooResult, /function foo/);
  assert.ok(!fooResult.includes("function bar"));
  assert.match(barResult, /function bar/);
  assert.ok(!barResult.includes("function foo"));
});

// ---- extractConst: トップレベル const 宣言の切り出し ----

test("extractConst は object リテラルの const を切り出す", () => {
  const src = `
const CONFIG = { key: "value", num: 42 };
`;
  const result = extractConst(src, "CONFIG");
  assert.match(result, /const CONFIG =/);
  assert.match(result, /key: "value"/);
  assert.match(result, /num: 42/);
  assert.ok(result.trimEnd().endsWith(";"));
});

test("extractConst は array リテラルの const を切り出す", () => {
  const src = `
const LENSES = ["security", "spec", "test"];
`;
  const result = extractConst(src, "LENSES");
  assert.match(result, /const LENSES =/);
  assert.match(result, /"security"/);
  assert.match(result, /"test"/);
});

test("extractConst はスカラ値の const を切り出す", () => {
  const src = `
const MAX_COUNT = 100;
`;
  const result = extractConst(src, "MAX_COUNT");
  assert.match(result, /const MAX_COUNT = 100;/);
});

test("extractConst はネストした object の const を正しく切り出す", () => {
  // ネストした {} を持つ場合に末尾 } が誤検出されないことを確認
  const src = `
const RANK = { low: 0, medium: 1, high: { value: 2, alias: "hi" }, critical: 3 };
`;
  const result = extractConst(src, "RANK");
  assert.match(result, /const RANK =/);
  assert.match(result, /alias: "hi"/);
  assert.ok(result.trimEnd().endsWith(";"));
});

test("extractConst は存在しない定数名で throw する", () => {
  const src = `const FOO = 1;`;
  assert.throws(() => extractConst(src, "BAR"), /extractConst.*BAR.*見つかりません/);
});

// ---- RVW-003: matchDelimiter のネスト括弧制限 — template literal 内 ${obj.method({...})} の境界確認 ----
// JSDoc に明記されている制限事項の動作を精密な index assert で固定する。
// 制限の説明: tpl モード中に ${...} 内部の {} を深さカウントに含めない。
// 実際の動作: tpl モード中は depth を一切変化させないため、内部の { } は無視され
// 外側 } の対応位置を正しく返す。制限が「誤検出を起こす」のではなく
// 「${...} 内のネスト構造を追跡しない代わりに tpl 全体を読み飛ばす」設計になっている。
// このテストで正確な index=45 を固定し、壊れた実装 (tpl 内 } を外側 depth に算入して
// index=39 や 41 を返す実装) では fail することを mutation で確認済み。

test("matchDelimiter は template literal 内のネスト括弧 ${obj.method({...})} を tpl モードで読み飛ばし外側 } を正しく返す (制限内正常動作の境界確認)", () => {
  // src の構造 (各 } の index):
  //   index 31: `{ key: 1 }` の内側 }  (tpl モード中 → depth 変化なし)
  //   index 39: `obj.method({...})` の内側 }  (tpl モード中 → depth 変化なし)
  //   index 41: `${...}` 閉じの }  (tpl モード中 → depth 変化なし)
  //   index 45: コードブロック末尾 }  (code モード → depth=0 で正解の index)
  const src = "{ const s = `val=${obj.method({ key: 1 })}`; }";
  //            0123456789012345678901234567890123456789012345
  //                                   ^31      ^39 ^41     ^45
  const closeIdx = matchDelimiter(src, 0, "{", "}");
  // 正しい閉じ index は末尾 } = index 45 を精密に assert する。
  // 壊れた実装が tpl 内 } (index=39 or 41) を返した場合、この assert で検出できる。
  assert.equal(closeIdx, 45);
  assert.equal(src[closeIdx], "}");
});

test("matchDelimiter は template literal の ${...} 外の単純な } のみで構成されるネストを正しく処理する", () => {
  // 制限に抵触しないシンプルなテンプレート (内部 ${} なし) は正常動作
  const src = "{ const s = `hello world`; return s; }";
  const closeIdx = matchDelimiter(src, 0, "{", "}");
  assert.equal(src[closeIdx], "}");
  assert.equal(closeIdx, 37);
});

test("matchDelimiter は template literal 内 ${} が brace を誘発しても外側 { の対応位置を返す (制限内の安全確認)", () => {
  // ${name} だけで内部 {} を持たない場合は正常
  const src = "{ const x = `id=${id}`; }";
  const closeIdx = matchDelimiter(src, 0, "{", "}");
  assert.equal(src[closeIdx], "}");
  assert.equal(closeIdx, 24);
});

// ---- RVW-001: readSource のパス検証 — workflowsDir 配下に解決されることを assert する ----
// 現状 caller はすべてハードコードリテラルのため実害なし。
// defense-in-depth として API 契約を決定論的テストで固定する。

test("readSource は workflowsDir 配下に存在するファイルを正常に読む", () => {
  // op-run-discover.js は workflowsDir 直下に存在するため正常に読める
  // (op-run-review.js は ADR-0016 ClusterOrchestrator 移行で削除済み)
  const src = readSource("op-run-discover.js");
  assert.ok(typeof src === "string");
  assert.ok(src.length > 0);
  // normalizeArgs が存在することを簡易確認
  assert.ok(src.includes("normalizeArgs"));
});

test("readSource は ../ 等の path traversal で throw する (defense-in-depth)", () => {
  // '../' でディレクトリを抜けようとすると workflowsDir 外に解決されるため throw する
  assert.throws(
    () => readSource("../CLAUDE.md"),
    /readSource.*workflowsDir 配下に解決されません/
  );
});

test("readSource は絶対パスで workflowsDir 外を指定すると throw する (defense-in-depth)", () => {
  // 絶対パスで外部を指定した場合も throw する
  assert.throws(
    () => readSource("/etc/passwd"),
    /readSource.*workflowsDir 配下に解決されません/
  );
});
