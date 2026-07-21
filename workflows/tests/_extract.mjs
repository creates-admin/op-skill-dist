/**
 * 機能概要:
 *   workflows/op-*.js (Dynamic Workflows 正本) の純関数を、本体ソースを一切改変せず
 *   テストから安全に取り出すための抽出ヘルパー (Issue #608 logic harness の土台)。
 *
 * 作成意図:
 *   op-*.js は Dynamic Workflows runtime が「文字列評価する前提」の named workflow script で、
 *   トップレベルに `phase()` / `await parallel()` / `return {...}` を持つ (= 通常の ESM import では
 *   実行されない / runtime グローバル `phase`/`agent`/`parallel`/`pipeline`/`args` に依存する)。
 *   そのため `import { dedupFindings } from "../op-run-review.js"` 方式は runtime 互換を壊しかねない。
 *   Issue #608「既知の落とし穴」が推奨する option (a): runtime に一切触れず、ソース文字列から
 *   対象の純関数宣言 + 依存する top-level const のみを brace-balanced で切り出し、隔離した
 *   vm context で評価して関数参照を取り出す方式を実装する。これで op-*.js 本体は不変のまま、
 *   業務ロジック (集約 / dedup / index-zip / refute 適用 / verdict floor / severity 振り分け) を
 *   決定的に assert できる。
 *
 * 注意点:
 *   - 本ファイルは workflows/tests/ 配下のため Ladder1 静的ゲート (workflows/op-*.js のみ対象) の
 *     対象外。ただし再現性のため、assertion 側 (各 *.test.mjs) は非決定 API (Date / Math.random /
 *     performance.now) を持ち込まない (Issue #608 必須検証項目)。
 *   - 抽出は「トップレベル宣言」前提。対象は `function NAME(...) {...}` と `const NAME = ...;`。
 *     ネストした宣言や動的定義は対象外 (純関数ロジックの検証に必要十分)。
 *   - 本体ソースを読むための fs / vm 使用は harness 側であり、op-*.js 本体の禁則とは無関係。
 */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workflowsDir = path.resolve(here, "..");

/**
 * 指定 workflow script のソース全文を読む。
 * defense-in-depth: scriptName が workflowsDir 配下に解決されることを検証する。
 * 現状の全 caller はハードコードリテラルのため実害はないが、将来の外部入力化に備える。
 */
function readSource(scriptName) {
  const full = path.resolve(workflowsDir, scriptName);
  // path traversal 防御: workflowsDir 配下に解決されることを assert する
  if (!full.startsWith(workflowsDir + path.sep) && full !== workflowsDir) {
    throw new Error(
      `readSource: scriptName が workflowsDir 配下に解決されません (scriptName=${scriptName}, resolved=${full})`
    );
  }
  return fs.readFileSync(full, "utf8");
}

/**
 * 機能概要: src の openIdx から open/close 括弧の対応が取れる終端 close の index を返す。
 *   文字列リテラル ('/"/`) と行/ブロックコメントを跨いだ括弧は深さ計算から除外する。
 *   matchBrace / matchBracket の共通実装。
 *
 * 制限事項:
 *   template literal (`) 内の `${...}` ネストは追跡しない。
 *   テンプレートリテラルは "tpl" モードで ` 終端だけを追い、内部の ${...} の brace を
 *   深さカウントに含めないため、テンプレートリテラル中に `${obj.method({ key: val })}` の
 *   ような入れ子 brace があると外側 `}` の対応位置を誤検出する可能性がある。
 *   op-*.js の純関数抽出対象では該当パターンが存在しないため現状は問題ない。
 *   将来 `${...}` ネスト対応が必要になった場合は本関数に集約して修正すること。
 */
function matchDelimiter(src, openIdx, open, close) {
  let depth = 0;
  let i = openIdx;
  let mode = "code"; // code | sq | dq | tpl | line | block
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (mode === "code") {
      if (ch === "/" && next === "/") {
        mode = "line";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        mode = "block";
        i += 2;
        continue;
      }
      if (ch === "'") mode = "sq";
      else if (ch === '"') mode = "dq";
      else if (ch === "`") mode = "tpl";
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return i; // 対応する閉じ括弧
      }
      i++;
      continue;
    }
    // 文字列 / コメント中: エスケープと終端だけ追う (ネスト無視)
    if (mode === "line") {
      if (ch === "\n") mode = "code";
      i++;
      continue;
    }
    if (mode === "block") {
      if (ch === "*" && next === "/") {
        mode = "code";
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    // 文字列リテラル
    if (ch === "\\") {
      i += 2; // エスケープ 1 文字スキップ
      continue;
    }
    if (mode === "sq" && ch === "'") mode = "code";
    else if (mode === "dq" && ch === '"') mode = "code";
    else if (mode === "tpl" && ch === "`") mode = "code";
    i++;
  }
  throw new Error(`matchDelimiter: 対応する閉じ括弧 '${close}' が見つかりません`);
}

// matchBrace / matchBracket はインターフェース互換を保ちつつ matchDelimiter に委譲する。
function matchBrace(src, openIdx) {
  return matchDelimiter(src, openIdx, "{", "}");
}

// '[' 対応版 (const = [...] リテラル用)。
function matchBracket(src, openIdx) {
  return matchDelimiter(src, openIdx, "[", "]");
}

// トップレベル `function NAME(...) {...}` 宣言を brace-balanced で切り出す。
function extractFunction(src, name) {
  // 行頭 (= トップレベル) の async? function NAME( を探す
  const re = new RegExp(`(?:^|\\n)(async\\s+)?function\\s+${name}\\s*\\(`, "m");
  const m = re.exec(src);
  if (!m) throw new Error(`extractFunction: function ${name} が見つかりません`);
  const declStart = m.index + (m[0].startsWith("\n") ? 1 : 0);
  // 宣言の開き '{' を探す ( ) の後)
  const braceIdx = src.indexOf("{", m.index + m[0].length);
  if (braceIdx < 0) throw new Error(`extractFunction: function ${name} の本体 { が見つかりません`);
  const end = matchBrace(src, braceIdx);
  return src.slice(declStart, end + 1);
}

// トップレベル `const NAME = ...;` 宣言を切り出す。値が object/array リテラルなら brace/bracket 対応で、
// それ以外は行末 ';' まで。純関数の依存定数 (VERDICT_RANK / LENSES 等) の取り出し用。
function extractConst(src, name) {
  const re = new RegExp(`(?:^|\\n)const\\s+${name}\\s*=\\s*`, "m");
  const m = re.exec(src);
  if (!m) throw new Error(`extractConst: const ${name} が見つかりません`);
  const declStart = m.index + (m[0].startsWith("\n") ? 1 : 0);
  const valueStart = m.index + m[0].length;
  const firstChar = src[valueStart];
  if (firstChar === "{" || firstChar === "[") {
    // object/array リテラル: 対応する括弧まで取り、続く ';' を含める
    const closeIdx = firstChar === "{" ? matchBrace(src, valueStart) : matchBracket(src, valueStart);
    let endIdx = closeIdx + 1;
    // 直後の ';' まで含める (改行/空白を許容)
    while (endIdx < src.length && /\s/.test(src[endIdx])) endIdx++;
    if (src[endIdx] === ";") endIdx++;
    return src.slice(declStart, endIdx);
  }
  // スカラ / new Set(...) 等: 行末の ';' まで (簡易。複数行は対象外)
  const semi = src.indexOf(";", valueStart);
  if (semi < 0) throw new Error(`extractConst: const ${name} の終端 ; が見つかりません`);
  return src.slice(declStart, semi + 1);
}

// src から consts (定数) + functions (関数) を順序通り抽出して配列で返す共通前処理。
// loadPureFns / loadNormalizeArgs の重複 3 行を一元化する (RVW-006 修正)。
function buildParts(src, consts, functions) {
  const parts = [];
  // 依存定数を先に (関数が参照するため順序を保つ)
  for (const c of consts) parts.push(extractConst(src, c));
  // 関数本体
  for (const fn of functions) parts.push(extractFunction(src, fn));
  return parts;
}

/**
 * 機能概要: workflow script から純関数群と依存定数を取り出し、隔離 vm context で評価して
 *           関数参照 map を返す。本体の workflow 実行 body (phase/parallel/return) は評価しない。
 * @param {string} scriptName  例 "op-run-review.js"
 * @param {object} opts
 *   - functions: string[]  取り出す関数名
 *   - consts: string[]     先に評価しておく依存定数名 (VERDICT_RANK 等)
 *   - sandbox: object      vm context に注入する追加グローバル (args 等、log は含めないこと)
 * @returns {object} 関数名 → 関数参照
 */
export function loadPureFns(scriptName, { functions = [], consts = [], sandbox = {} } = {}) {
  const src = readSource(scriptName);
  const parts = buildParts(src, consts, functions);
  // 取り出した宣言を IIFE で包んで評価し、関数参照を返す。
  // vm.createContext の別 realm を使うと、関数の戻り値 (配列/object) が host と別 prototype に
  // なり assert.deepStrictEqual が "not reference-equal" で落ちる (cross-realm intrinsic 問題)。
  // runInThisContext で host realm の Array/Object 等を使わせ、IIFE スコープで global 汚染を防ぐ。
  // sandbox (args 等) はクロージャ変数として注入する (host global を汚さない)。
  // 注意: sandbox に log を含めてはならない。log は常に IIFE 第1引数として固定注入するため、
  //   sandbox に log を含めると仮引数が (log, log, ...) の重複になり logStub が上書きされる。
  const sandboxKeysWithoutLog = Object.keys(sandbox).filter((k) => k !== "log");
  const code =
    `(function(${["log", ...sandboxKeysWithoutLog].join(", ")}) {\n` +
    `${parts.join("\n\n")}\n\n` +
    `return { ${functions.join(", ")} };\n` +
    `})`;
  const factory = vm.runInThisContext(code, { filename: `extracted:${scriptName}` });
  const logStub = sandbox.log || (() => {});
  return factory(logStub, ...sandboxKeysWithoutLog.map((k) => sandbox[k]));
}

/**
 * 機能概要: workflow script からトップレベル const (object/array/scalar リテラル) の値を取り出して
 *           map で返す。loadPureFns は関数参照しか返さないため、純粋な定数マップ
 *           (ROLE_MODEL_FALLBACK 等の役別 model 既定値) を回帰 assert したいケース用。
 * 作成意図:
 *   #676 RVW-002: op-enrichment の ROLE_MODEL_FALLBACK は async runRolePipeline 内消費で
 *   pure-fn harness の対象外だが、マップ定義自体は top-level const なのでソースから決定的に
 *   切り出して値を固定できる。runtime (phase/parallel/return) は評価しない。
 * @param {string} scriptName  例 "op-enrichment.js"
 * @param {string[]} names     取り出す const 名
 * @returns {object} const 名 → 評価済みの値
 */
export function loadConsts(scriptName, names = []) {
  const src = readSource(scriptName);
  // 依存定数の宣言だけを切り出し、IIFE で評価して値を map で返す。
  // 他の loader と同様 runInThisContext で host realm の Array/Object を共有する
  // (deepEqual の cross-realm prototype 不一致を避ける)。
  const parts = names.map((n) => extractConst(src, n));
  const code = `(function(){\n${parts.join("\n\n")}\n\nreturn { ${names.join(", ")} };\n})`;
  const factory = vm.runInThisContext(code, { filename: `extracted:${scriptName}:consts` });
  return factory();
}

/**
 * 機能概要: workflow script の normalizeArgs() を取り出して、与えた args (object or JSON 文字列) で
 *           評価する。args は vm context のグローバルとして注入する (本体と同じ `const a =
 *           typeof args === "string" ? JSON.parse(args) : args` 経路を通す)。
 * @returns {{ run: (argsValue: any) => any }}  run(argsValue) で normalizeArgs の戻り / throw を得る
 */
export function loadNormalizeArgs(scriptName, { consts = [], functions = [] } = {}) {
  const src = readSource(scriptName);
  // normalizeArgs の依存定数 + 依存関数を先に取り込み、最後に normalizeArgs 本体を追加する。
  const parts = buildParts(src, consts, functions);
  parts.push(extractFunction(src, "normalizeArgs"));
  // host realm の Array/Object を使わせるため runInThisContext + IIFE。args はクロージャ注入。
  const code = `(function(args){\n${parts.join("\n\n")}\n\nreturn normalizeArgs();\n})`;
  const factory = vm.runInThisContext(code, { filename: `extracted:${scriptName}:normalizeArgs` });
  return {
    run(argsValue) {
      return factory(argsValue);
    },
  };
}

// 抽出エンジン本体 (matchDelimiter / extractFunction / extractConst) と
// readSource (パス検証テスト用) は _extract.test.mjs で独立テストするためにエクスポートする。
// readSource は loadPureFns 等の内部ヘルパーだが、RVW-001 パス検証の決定論的 assert のため公開する。
export { matchDelimiter, extractFunction, extractConst, readSource };
