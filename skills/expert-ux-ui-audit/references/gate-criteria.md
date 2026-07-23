# Gate Criteria (op-architect の Design Plan 検証)

ux-ui-audit-expert が **op-architect** から呼ばれたとき、designer-expert が出した
Design Plan に対して PASS / PASS_WITH_NOTES / BLOCK を判定するための基準。

## 入力

- designer-expert が出力した Design Plan (Markdown)
- 関連 Issue 本文と関連 ADR
- プロジェクトの既存 design system 情報

---

## 検証 6 観点 (+ motion 時 観点7)

| # | 観点 | NG 例 |
|---|------|-------|
| 1 | 次の行動が明確になる設計か | 主要 CTA が複数並列、優先順位なし |
| 2 | **Applicable States** が網羅されているか | UI 種別の applicable state (loading / failure / empty 等) のいずれかが Plan 未定義、該当しない state に not_applicable_reason がない |
| 3 | エラー復帰導線が設計されているか | 「エラー表示する」だけで retry / cancel 導線なし |
| 4 | 業務フローに合った画面構成か | 業務上の判断順序と画面の入力順序がねじれる |
| 5 | accessibility 要件が十分か | focus / aria / contrast の言及が無い |
| 6 | 美しさのために使いやすさを犠牲にしていないか | 装飾 token 追加だけで状態設計が無い、視覚優先で keyboard 操作が壊れる、見た目重視で復帰導線が消えている |
| 7 | **motion 安全性** (`### Motion Strategy` 節がある場合のみ、ADR-0012 Wave4) | 前庭障害トリガ (大きな視差・回転・ズーム) を含む、`prefers-reduced-motion` fallback が無い、duration/easing を token bypass でハードコード、layout-triggering プロパティ (width/height/top/left/margin) を animate、5 秒以上自動再生で停止手段なし |

> **観点7 は conditional**: Motion Strategy 節が無い Plan は観点 1〜6 のみで判定する (motion 不在 = N/A、起票しない)。
> motion の質 (timing の自然さ / orchestration の一貫性) は完全静的 gate では `requires_runtime` で検証不能。
> gate が BLOCK できるのは **Static Hard blocker の「有無」のみ** (上記 NG 例 = `motion-patterns.md` の Static Hard blocker と対応)。
> motion 方法論・到達ライン・token scale の詳細は `~/.claude/skills/expert-design/references/motion-patterns.md` を参照。

> **Applicable States vs Required States**: 6 状態の機械的全要求は禁止 (詳細・早見表は `recovery-and-states.md` 参照)。

---

## 判定 (3 択)

| 判定 | 意味 | 司令官の次の動作 |
|------|------|------------------|
| **PASS** | この Design Plan で実装してよい | designer-expert を Run Mode で実行 |
| **PASS_WITH_NOTES** | 実装してよいが、以下の注意点あり | 注意点を Issue コメントに追記 → Run へ |
| **BLOCK** | 使いやすさ・復帰性・a11y に重大な欠落あり、再設計必須 | designer-expert に Design Plan の再作成を依頼 |

### BLOCK 判定の絶対条件 (Hard blockers)

`visual-quality-rubric.md` の Hard blockers が 1 つでも残るなら BLOCK。

- primary task が不明
- 該当する Applicable State (UI 種別ごと、`recovery-and-states.md` 早見表参照) が Plan 未定義
  かつ not_applicable_reason の説明もない
- error 復帰手段が Plan に書かれていない (該当する場合)
- 危険操作の保護 (確認 / Undo) が Plan に書かれていない (該当する場合)
- accessibility 要件 (focus / aria / contrast / keyboard) が Plan に書かれていない
- 業務フローと画面構成の齟齬

> 6 状態の機械的な全要求で BLOCK しない (詳細は `recovery-and-states.md` 参照)。

---

## gate モードの出力フォーマット

**冒頭に machine-readable header `<!-- op-ux-ui-gate -->` を必ず置く。**
header の完全な書式 (audit_result / blocking_count / notes_count 等) は
`~/.claude/skills/_shared/pr-templates.md` の「op-architect: UX/UI Audit Gate Result」節に
一次定義があり、本ファイルでは二重保持しない。op-architect / op-run はこの header から
判定結果を直接 parse する (Markdown 走査では脆い)。

scan / patrol は検出 0 件で `[]` を返してよいが、**gate / post-check では `[]` を返さない**。
問題が無い場合も machine-readable header 付きで PASS を返す。

```markdown
## UX/UI Audit Gate Result

### 判定
PASS | PASS_WITH_NOTES | BLOCK

### 評価サマリ
<2〜4 文で全体評価>

### 観点別チェック
| # | 観点 | 結果 | コメント |
|---|------|------|---------|
| 1 | 次の行動が明確 | OK / NG | <NG なら理由> |
| 2 | UI state 網羅 | OK / NG | <NG なら欠落 state> |
| 3 | エラー復帰導線 | OK / NG | <NG なら不足箇所> |
| 4 | 業務フロー整合 | OK / NG | <NG なら矛盾点> |
| 5 | accessibility | OK / NG | <NG なら不足要件> |
| 6 | 美しさが使いやすさを犠牲にしていない | OK / NG | <NG なら指摘> |
| 7 | motion 安全性 (Motion Strategy 節がある場合) | OK / NG / N/A | <N/A=motion 節なし / NG なら Static Hard blocker 該当箇所> |

### Notes (PASS_WITH_NOTES 時)
- 実装時に追加で意識してほしい注意点を箇条書き

### Required Changes (BLOCK 時)
- Design Plan に追加すべき項目 / 修正すべき設計を箇条書き
```

---

## gate 時の自己点検

- [ ] 観点 1〜6 を順に通したか
- [ ] Motion Strategy 節があれば観点7 (motion 安全性、Static Hard blocker) を通したか / 無ければ N/A としたか
- [ ] Hard blockers を `visual-quality-rubric.md` で確認したか
- [ ] BLOCK 時に Required Changes を **設計レベルで** 具体化したか (motion 由来の BLOCK は `target_role: motion-spec` を添える)
- [ ] PASS_WITH_NOTES の Notes が implementer に届く粒度か
- [ ] 「美しさのために使いやすさを犠牲にしていないか」を最後にもう一度問うたか
