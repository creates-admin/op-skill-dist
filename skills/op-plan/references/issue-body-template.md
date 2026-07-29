<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29): ADR-0029 Wave B1 (controller 層 progressive disclosure) で
       skills/op-plan/SKILL.md フェーズ7 Pass 2 直後の「Issue 本文テンプレ (`## 依存` セクションの
       書き方)」節から verbatim 分離。成果物サンプル (テンプレ dump) であり、Pass 2 の
       bash 手順そのもの (順序契約) ではないため references 候補 (ADR-0029 決定2)。
-->

<!--
機能概要: op-plan フェーズ7 Pass 2 が生成する Issue 本文 (`-final.md`) の `## 依存` セクションの
         書き方サンプル。hidden marker (`op-depends-on`) と prose (`## 依存`) の正本ペア形式を示す。
作成意図: Pass 2 の bash 手順 (`FINAL_FILE_I` を Write tool で生成する手順) を読んだ後、
         実際にどんな形の Markdown を書けばよいかを確認するための成果物サンプル。
         手順そのものではなく example のため、SKILL.md 本文から分離して god file 化を抑制する
         (ADR-0029 決定2)。
注意点: 内容変更時は schema_version を bump し SKILL.md フェーズ7 Pass 2 直後の pointer 側 `(>=N)` を確認する。
       marker と prose は「正本ペア」(`_shared/markers/labels-and-markers.md` 参照) のため
       必ず両方を更新する — この不変則自体は `_shared/markers/labels-and-markers.md` が正本であり、
       本ファイルは op-plan 固有の適用例に留める。
-->

# op-plan フェーズ7 Pass 2 — Issue 本文テンプレ (`## 依存` セクションの書き方)

**いつ読むか**: フェーズ7 Pass 2 で `FINAL_FILE_I` を Write tool で生成するとき、
実際にどのような Markdown を書けばよいか確認したいときのみ読む。

Pass 1 で書き出す BODY_FILE_I には `## 依存` セクションを placeholder として含めておく。
Pass 2 の Write tool で実番号に差し替える (依存なし issue はセクションごと省略)。

marker と prose は「正本ペア」(`_shared/markers/labels-and-markers.md` 参照) のため必ず両方を更新する。

```markdown
<!-- hidden marker ブロック (op-architect IU1 の依存あり例と同形式) -->
<!-- op-source: op-plan -->
<!-- op-domain: feature -->
<!-- op-run-expert: feature-expert -->
<!-- op-post-check-expert: null -->
<!-- op-depends-on: #806, #807 -->
<!-- ↑ 依存ありの issue のみ Pass 2 で追加。依存なし issue は行ごと省略 (空 value は lint error)。 -->

## 概要
<issue の 1〜2 文要約>

## 依存
- depends on #806 (先に完了が必要)
- depends on #807 (先に完了が必要)
<!-- ↑ 依存なし issue はこの ## 依存 セクションごと省略する -->
```
