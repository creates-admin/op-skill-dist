/**
 * 機能概要:
 *   workflows/op-plan-judge.js の aggregateSurveyFindings() (Issue #735 で SKILL.md §2.5-4
 *   fence から移管) の 4 分岐ロジック (files_likely_to_modify dedup / reusable_assets regex
 *   filter / pattern_to_follow regex filter / null ガード) の unit test。
 *   末尾に SKILL.md fence との等価性を assert する sync-check テストを保持
 *   (CI で drift を自動検出する機械的保証)。
 *
 * 作成意図:
 *   Issue #735 対応。aggregateSurveyFindings() が SKILL.md fence と test inline 再実装の
 *   二重定義であった状態を解消し、workflows/op-plan-judge.js の pure function として
 *   loadPureFns 経由で取得する方式に切り替えた。
 *   sync-check (RVW-004/RVW-008 継承): SKILL.md fence と JS 抽出版の動作等価性を
 *   runtime に assert する。SKILL.md fence が変更されると CI でテストが落ちるため
 *   drift 検出機能を維持する。
 *
 * 注意点:
 *   - 非決定 API (Date / Math.random / performance.now) は assertion に持ち込まない。
 *   - sync-check は SKILL.md を読むため fs/path/vm/url を使用する (テスト専用)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { loadPureFns } from "./_extract.mjs";

// workflows/op-plan-judge.js から aggregateSurveyFindings を抽出 (Issue #735 移管後の正本)。
// 作成意図: SKILL.md fence → workflows/ 移管により、inline 再実装を廃止し
//   loadPureFns 方式で正本実装を直接参照する。
const { aggregateSurveyFindings } = loadPureFns("op-plan-judge.js", {
  functions: ["aggregateSurveyFindings"],
});

// ---- null ガード: surveyResult が null / undefined / findings 非配列 ----

test("aggregateSurveyFindings は surveyResult が null のとき null を返す", () => {
  assert.strictEqual(aggregateSurveyFindings(null), null);
});

test("aggregateSurveyFindings は surveyResult が undefined のとき null を返す", () => {
  assert.strictEqual(aggregateSurveyFindings(undefined), null);
});

test("aggregateSurveyFindings は findings が配列でないとき null を返す", () => {
  assert.strictEqual(aggregateSurveyFindings({ findings: "not-an-array" }), null);
  assert.strictEqual(aggregateSurveyFindings({ findings: null }), null);
  assert.strictEqual(aggregateSurveyFindings({}), null);
});

// ---- files_likely_to_modify: flat 化 + dedup ----

test("aggregateSurveyFindings は files_likely_to_modify を flat 化して重複除去する", () => {
  const surveyResult = {
    findings: [
      { files: ["a.ts", "b.ts"] },
      { files: ["b.ts", "c.ts"] }, // b.ts は重複
      { files: ["a.ts"] },         // a.ts も重複
    ],
  };
  const result = aggregateSurveyFindings(surveyResult);
  // dedup 後は a.ts / b.ts / c.ts の 3 件
  assert.deepEqual(result.files_likely_to_modify, ["a.ts", "b.ts", "c.ts"]);
});

test("aggregateSurveyFindings は files が未定義の finding を安全に扱う", () => {
  const surveyResult = {
    findings: [
      { title: "ファイルなし" }, // files フィールド無し
      { files: ["x.ts"] },
    ],
  };
  const result = aggregateSurveyFindings(surveyResult);
  assert.deepEqual(result.files_likely_to_modify, ["x.ts"]);
});

test("aggregateSurveyFindings は findings が空配列のとき files_likely_to_modify が空を返す", () => {
  const result = aggregateSurveyFindings({ findings: [] });
  assert.deepEqual(result.files_likely_to_modify, []);
  assert.deepEqual(result.reusable_assets, []);
  assert.deepEqual(result.pattern_to_follow, []);
  assert.strictEqual(result.survey_findings_count, 0);
});

// ---- reusable_assets: regex filter (マッチ / 非マッチ) ----

test("aggregateSurveyFindings は reusable_assets を recommended_action の regex で正しく抽出する", () => {
  const surveyResult = {
    findings: [
      { title: "既存 hook", files: ["hooks/useFoo.ts"], recommended_action: "再利用できる" },
      { title: "既存 util", files: ["utils/bar.ts"], recommended_action: "流用可" },
      { title: "英語マッチ", files: ["lib/baz.ts"], recommended_action: "reuse this pattern" },
      { title: "非マッチ", files: ["other.ts"], recommended_action: "削除する" },
    ],
  };
  const result = aggregateSurveyFindings(surveyResult);
  // 「再利用」「流用可」「reuse」の 3 件がマッチ
  assert.strictEqual(result.reusable_assets.length, 3);
  assert.deepEqual(result.reusable_assets[0], { title: "既存 hook", files: ["hooks/useFoo.ts"] });
  assert.deepEqual(result.reusable_assets[1], { title: "既存 util", files: ["utils/bar.ts"] });
  assert.deepEqual(result.reusable_assets[2], { title: "英語マッチ", files: ["lib/baz.ts"] });
});

test("aggregateSurveyFindings は reusable_assets の regex に非マッチのみのとき空配列を返す", () => {
  const surveyResult = {
    findings: [
      { title: "非マッチ1", recommended_action: "削除する" },
      { title: "非マッチ2", recommended_action: "新規実装が必要" },
    ],
  };
  const result = aggregateSurveyFindings(surveyResult);
  assert.deepEqual(result.reusable_assets, []);
});

test("aggregateSurveyFindings は reusable_assets で recommended_action 欠落の finding を除外する", () => {
  // recommended_action が無い場合、空文字列として評価され regex に非マッチ
  const surveyResult = {
    findings: [
      { title: "action なし", files: ["foo.ts"] },
      { title: "reuse あり", files: ["bar.ts"], recommended_action: "流用する" },
    ],
  };
  const result = aggregateSurveyFindings(surveyResult);
  assert.strictEqual(result.reusable_assets.length, 1);
  assert.strictEqual(result.reusable_assets[0].title, "reuse あり");
});

// ---- pattern_to_follow: regex filter (マッチ / 非マッチ) ----

test("aggregateSurveyFindings は pattern_to_follow を recommended_action または title の regex で抽出する", () => {
  const surveyResult = {
    findings: [
      { title: "パターン集", files: ["patterns/a.ts"], recommended_action: "参照すること" },
      { title: "手本コンポーネント", files: ["comp/B.tsx"] }, // title でマッチ
      { title: "英語 pattern", files: ["lib/c.ts"], recommended_action: "use this pattern" },
      { title: "template 例", files: ["tmpl/d.ts"], recommended_action: "template を参照" },
      { title: "非マッチ", files: ["x.ts"], recommended_action: "削除候補" },
    ],
  };
  const result = aggregateSurveyFindings(surveyResult);
  // 4 件のファイルが flat() された結果
  assert.deepEqual(result.pattern_to_follow, [
    "patterns/a.ts",
    "comp/B.tsx",
    "lib/c.ts",
    "tmpl/d.ts",
  ]);
});

test("aggregateSurveyFindings は pattern_to_follow の regex に非マッチのみのとき空配列を返す", () => {
  const surveyResult = {
    findings: [
      { title: "無関係 finding", recommended_action: "削除する" },
    ],
  };
  const result = aggregateSurveyFindings(surveyResult);
  assert.deepEqual(result.pattern_to_follow, []);
});

test("aggregateSurveyFindings は pattern_to_follow で files 未定義の finding を空 flat で安全に扱う", () => {
  const surveyResult = {
    findings: [
      { title: "手本だが files なし", recommended_action: "参照" }, // files 未定義
      { title: "通常", files: ["ref.ts"], recommended_action: "パターンを参照" },
    ],
  };
  const result = aggregateSurveyFindings(surveyResult);
  // files 未定義は [] で補完 → flat 後は ["ref.ts"] のみ
  assert.deepEqual(result.pattern_to_follow, ["ref.ts"]);
});

// ---- メタフィールド: survey_findings_count / coverage_notes / raw_survey_findings ----

test("aggregateSurveyFindings は survey_findings_count に findings 配列長を設定する", () => {
  const surveyResult = {
    findings: [{ title: "a" }, { title: "b" }, { title: "c" }],
  };
  const result = aggregateSurveyFindings(surveyResult);
  assert.strictEqual(result.survey_findings_count, 3);
});

test("aggregateSurveyFindings は coverage_notes を引き継ぎ、欠落時は空配列を返す", () => {
  const withNotes = {
    findings: [],
    coverage_notes: [{ axis: "cli-migration", note: "全数確認" }],
  };
  const withoutNotes = { findings: [] };

  assert.deepEqual(aggregateSurveyFindings(withNotes).coverage_notes, [
    { axis: "cli-migration", note: "全数確認" },
  ]);
  assert.deepEqual(aggregateSurveyFindings(withoutNotes).coverage_notes, []);
});

test("aggregateSurveyFindings は raw_survey_findings に元の findings 配列を保存する", () => {
  const findings = [{ title: "finding-A", files: ["a.ts"] }];
  const result = aggregateSurveyFindings({ findings });
  assert.strictEqual(result.raw_survey_findings, findings);
});

// ---- sync-check: SKILL.md §2.5-4 fence と JS 抽出版 (op-plan-judge.js) の動作等価性 (RVW-004/RVW-008) ----
//
// 作成意図:
//   Issue #735 で aggregateSurveyFindings() は workflows/op-plan-judge.js に移管された。
//   SKILL.md fence は教育目的で引き続き残るため、SKILL.md fence と JS 抽出版の動作が
//   等価であることを CI で継続検証する (drift 検出機能を維持)。
//   SKILL.md fence が変更されると eval 結果の動作が変わり CI が落ちる。
//   上記の unit test は JS 抽出版 (aggregateSurveyFindings) を直接呼んで動作を検証し、
//   sync-check は SKILL.md fence との等価性を保証する二層構造になっている。
//
// 注意:
//   - eval は SKILL.md が信頼済みのリポジトリファイルのため許容する。
//   - vm.runInThisContext で host realm の Array/Object を共有し
//     deepEqual の cross-realm prototype 不一致を避ける (loadPureFns と同方針)。

// テスト実行ファイルから repo root の SKILL.md を解決する
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skillMdPath = path.join(repoRoot, "skills/op-plan/SKILL.md");

/**
 * SKILL.md §2.5-4 の javascript fence から aggregateSurveyFindings を eval して返す。
 * 機能概要: fence 抽出 → vm 評価 → 関数参照取得の一連フロー。
 * 作成意図: SKILL.md fence は教育目的で残っているため、JS 抽出版との等価性を
 *   継続検証する sync-check の比較対象として eval で取得する。
 *   vm.runInThisContext で host realm の Array/Object を共有し deepEqual の
 *   cross-realm prototype 不一致を回避している。
 * 注意点: fence が見つからない / 関数が含まれない場合は throw する (テスト失敗で明示)。
 */
function loadAggregateFromSkillMd() {
  const content = fs.readFileSync(skillMdPath, "utf8");
  // ```javascript ... ``` の全 fence を抽出
  const fences = [];
  const re = /```javascript\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    fences.push(m[1]);
  }
  const fence = fences.find((f) => f.includes("aggregateSurveyFindings"));
  if (!fence) {
    throw new Error(
      `sync-check: SKILL.md の javascript fence に aggregateSurveyFindings が見つかりません。\n` +
      `SKILL.md §2.5-4 節を確認してください: ${skillMdPath}`
    );
  }
  // IIFE で wrap して関数参照を返す。host realm を使い deepEqual の cross-realm 問題を回避する。
  const code = `(function() {\n${fence}\nreturn aggregateSurveyFindings;\n})`;
  const factory = vm.runInThisContext(code, { filename: "extracted:SKILL.md:aggregateSurveyFindings" });
  return factory();
}

// SKILL.md から eval した実装参照 (全 sync-check テストで共有)。
// RVW-001: モジュールレベルで throw すると tests 1-15 も巻き込んで全件失敗するため
// try/catch で捕捉し、fence が存在しない場合は null にして sync-check 内で skip する。
let skillMdFn;
try {
  skillMdFn = loadAggregateFromSkillMd();
} catch (e) {
  skillMdFn = null;
}

// sync-check: null ガード等価性
test("sync-check: SKILL.md fence と inline 実装は null 入力で同じ結果を返す (RVW-004/RVW-008)", (t) => {
  if (!skillMdFn) { t.skip("SKILL.md の javascript fence に aggregateSurveyFindings が見つかりません"); return; }
  assert.strictEqual(skillMdFn(null), aggregateSurveyFindings(null));
  assert.strictEqual(skillMdFn(undefined), aggregateSurveyFindings(undefined));
  assert.strictEqual(skillMdFn({ findings: null }), aggregateSurveyFindings({ findings: null }));
});

// sync-check: files_likely_to_modify dedup 等価性
test("sync-check: SKILL.md fence と inline 実装は files_likely_to_modify dedup で同じ結果を返す (RVW-004/RVW-008)", (t) => {
  if (!skillMdFn) { t.skip("SKILL.md の javascript fence に aggregateSurveyFindings が見つかりません"); return; }
  const input = {
    findings: [
      { files: ["a.ts", "b.ts"] },
      { files: ["b.ts", "c.ts"] },
    ],
  };
  assert.deepEqual(
    skillMdFn(input).files_likely_to_modify,
    aggregateSurveyFindings(input).files_likely_to_modify
  );
});

// sync-check: reusable_assets regex 等価性
test("sync-check: SKILL.md fence と inline 実装は reusable_assets regex で同じ結果を返す (RVW-004/RVW-008)", (t) => {
  if (!skillMdFn) { t.skip("SKILL.md の javascript fence に aggregateSurveyFindings が見つかりません"); return; }
  const input = {
    findings: [
      { title: "既存 hook", files: ["hooks/useFoo.ts"], recommended_action: "再利用できる" },
      { title: "非マッチ", files: ["other.ts"], recommended_action: "削除する" },
    ],
  };
  assert.deepEqual(skillMdFn(input).reusable_assets, aggregateSurveyFindings(input).reusable_assets);
});

// sync-check: pattern_to_follow regex 等価性
test("sync-check: SKILL.md fence と inline 実装は pattern_to_follow regex で同じ結果を返す (RVW-004/RVW-008)", (t) => {
  if (!skillMdFn) { t.skip("SKILL.md の javascript fence に aggregateSurveyFindings が見つかりません"); return; }
  const input = {
    findings: [
      { title: "手本コンポーネント", files: ["comp/B.tsx"] },
      { title: "非マッチ", files: ["x.ts"], recommended_action: "削除候補" },
    ],
  };
  assert.deepEqual(
    skillMdFn(input).pattern_to_follow,
    aggregateSurveyFindings(input).pattern_to_follow
  );
});

// sync-check: coverage_notes / survey_findings_count / raw_survey_findings 等価性
test("sync-check: SKILL.md fence と inline 実装はメタフィールドで同じ結果を返す (RVW-004/RVW-008)", (t) => {
  if (!skillMdFn) { t.skip("SKILL.md の javascript fence に aggregateSurveyFindings が見つかりません"); return; }
  const input = {
    findings: [{ title: "a" }, { title: "b" }],
    coverage_notes: [{ axis: "test", note: "note1" }],
  };
  const a = skillMdFn(input);
  const b = aggregateSurveyFindings(input);
  assert.strictEqual(a.survey_findings_count, b.survey_findings_count);
  assert.deepEqual(a.coverage_notes, b.coverage_notes);
  // RVW-002: raw_survey_findings の等価性も assert する
  assert.deepEqual(a.raw_survey_findings, b.raw_survey_findings);
});
