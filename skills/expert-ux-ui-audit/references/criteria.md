<!--
機能概要: ux-ui-audit-expert の gate (op-architect の Design Plan 検証) と post-check
         (op-run の apply 後監査) の判定基準。共通骨格 + モード別節の構成 (ADR-0030 決定 5)。
作成意図: 判定 3 択 / 出力フォーマット規約 / Applicable States 原則は共通だが、marker・parse 経路・
         BLOCK 条件・次動作の宛先・Required Changes の粒度は契約として異なる。共通骨格のみ集約する。
注意点: **以下 5 点は「共通化」で均してはならない** — (1) marker 名 (`op-ux-ui-gate` / `op-ux-ui-audit`)
       (2) parse 経路 (gate = 直接 parse / post-check = 人間向けログ、機械正本は `op-review-state`)
       (3) BLOCK 絶対条件の内容差 (gate 6 項目 / post-check 8 項目) (4) 次動作の宛先差
       (designer-expert 固定 / `op-run-expert` 可変) (5) Required Changes の粒度差 (設計 / コード)。
       inbound 参照は `criteria.md#gate` / `criteria.md#post-check` の stable anchor で解決する
       (節番号 renumber より anchor を優先)。節を増減しても anchor コメントは移動させない。
-->

# Design Plan Gate / Apply Post-check 判定基準

ux-ui-audit-expert が持つ 2 つの判定モードの基準。共通骨格を先に定義し、
契約差は `## Gate (op-architect)` / `## Post-check (op-run)` の各節が持つ。

## 呼ばれ方の対比

| 項目 | gate | post-check |
|---|---|---|
| 呼び出し元 | `op-architect` | `op-run` |
| タイミング | designer-expert が Design Plan を出した直後 (**実装前**) | designer-expert が Run Mode で実装し PR を open した直後 (**実装後**) |
| 判定対象 | Design Plan (Markdown) | PR diff (実装結果) |
| 検証観点 | 6 観点 (+ Motion Strategy 節がある場合のみ 観点7) | 7 観点 (motion 観点なし / 代わりに scope_out 観点あり) |
| **marker 名** | `<!-- op-ux-ui-gate -->` | `<!-- op-ux-ui-audit -->` |
| **marker の性質 (parse 経路)** | op-architect / op-run が**この header から判定結果を直接 parse する** (Markdown 走査では脆いため) | **人間向け監査ログ**。機械正本は PR body の `<!-- op-review-state -->` の `post_checks["ux-ui-audit-expert"]` (`op review state push` 経由、ADR-0027 6b) |
| **BLOCK 絶対条件** | gate 版 **6 項目** (Gate 節) | post-check 版 **8 項目** (Post-check 節) |
| **次動作の宛先** | **designer-expert 固定** (Design Plan の再作成依頼) | **`op-run-expert` 可変** (needs-fix で差し戻し) |
| **Required Changes の粒度** | **設計レベル** | **コードレベル** (具体例付き) |

> 太字の 5 行は **モード間の契約差**である。共通節へ引き上げて均してはならない。

---

## 共通: 判定 (3 択) の意味

- **PASS** — 次の工程へ進んでよい
- **PASS_WITH_NOTES** — 進行してよいが、注意点を残す必要がある
- **BLOCK** — 使いやすさ・復帰性・a11y の必須要件に重大な欠落があり、差し戻し必須

`visual-quality-rubric.md` の Hard blockers が **1 つでも残るなら score を問わず BLOCK**。
Hard blocker の具体リストと **司令官の次の動作はモードで異なる** (各節の「BLOCK 絶対条件」「次の動作」を参照)。

## 共通: 出力フォーマット規約

- **冒頭に machine-readable header を必ず置く**。marker 名と parse 経路はモード別 (上記対比表参照)。
- header の完全な書式 (`audit_result` / `blocking_count` / `notes_count` 等) の一次定義は
  `~/.claude/skills/_shared/pr-templates.md` の各モード節 (gate = 「op-architect: UX/UI Audit Gate Result」/
  post-check = 「op-run: UX/UI Post-check Result」)。本ファイルでは二重保持しない。
- scan / patrol は検出 0 件で `[]` を返してよいが、**gate / post-check では `[]` を返さない**。
  問題が無い場合も machine-readable header 付きで PASS を返す。
- 本文は下記 Gate 節の Markdown テーブル形式に従う (post-check も同形式で、観点行のみ差し替える)。

## 共通: Applicable States の原則

**6 状態の機械的な全要求で BLOCK しない**。UI 種別に該当する state のみを対象とし、
該当しない state に `not_applicable_reason` の説明があれば PASS とする。
詳細・UI 種別ごとの早見表は `recovery-and-states.md` を参照。

---

<!-- anchor: gate -->

## Gate (op-architect)

designer-expert が出した Design Plan に対し、実装前に PASS / PASS_WITH_NOTES / BLOCK を判定する。

### 入力

- designer-expert が出力した Design Plan (Markdown)
- 関連 Issue 本文と関連 ADR
- プロジェクトの既存 design system 情報

### 検証 6 観点 (+ motion 時 観点7)

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

### BLOCK 絶対条件 (gate 版 6 項目)

`visual-quality-rubric.md` の Hard blockers が 1 つでも残るなら BLOCK。

- primary task が不明
- 該当する Applicable State (UI 種別ごと、`recovery-and-states.md` 早見表参照) が Plan 未定義
  かつ not_applicable_reason の説明もない
- error 復帰手段が Plan に書かれていない (該当する場合)
- 危険操作の保護 (確認 / Undo) が Plan に書かれていない (該当する場合)
- accessibility 要件 (focus / aria / contrast / keyboard) が Plan に書かれていない
- 業務フローと画面構成の齟齬

### 次の動作 (宛先 = designer-expert 固定)

- **PASS** — designer-expert を Run Mode で実行
- **PASS_WITH_NOTES** — 注意点を Issue コメントに追記 → Run へ
- **BLOCK** — **designer-expert に Design Plan の再作成を依頼**

### 出力テンプレ

**冒頭に `<!-- op-ux-ui-gate -->` を必ず置く** (op-architect / op-run が直接 parse する。共通規約は上記)。

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

### gate 時の自己点検

- [ ] 観点 1〜6 を順に通したか
- [ ] Motion Strategy 節があれば観点7 (motion 安全性、Static Hard blocker) を通したか / 無ければ N/A としたか
- [ ] Hard blockers を `visual-quality-rubric.md` で確認したか
- [ ] BLOCK 時に Required Changes を **設計レベルで** 具体化したか (motion 由来の BLOCK は `target_role: motion-spec` を添える)
- [ ] PASS_WITH_NOTES の Notes が implementer に届く粒度か
- [ ] 「美しさのために使いやすさを犠牲にしていないか」を最後にもう一度問うたか

---

<!-- anchor: post-check -->

## Post-check (op-run)

designer-expert が Run Mode で実装し PR を open した直後、その **実装結果** に対して判定する。

### 入力

- PR diff (`git diff "origin/${BASE_REF}...HEAD"` / **triple-dot 必須**)
  - `BASE_REF=$(gh pr view <N> --json baseRefName --jq '.baseRefName')` で base branch を解決し固定する (origin/main ハードコード禁止 / release / develop / hotfix branch も対応)
  - 事前に `git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"` で `origin/${BASE_REF}` を最新化する (refspec 明示形式。bare 形式は環境差で更新されないことがある)
  - double-dot (`origin/${BASE_REF}..HEAD`) は base 進行が混じるので使わない
- Issue 本文 + Design Plan
- worktree 内の変更後ファイル

### 検証 7 観点

| # | 観点 | NG 例 |
|---|------|-------|
| 1 | Design Plan と実装差分が一致しているか | Plan 未記載の component が新規作成されている |
| 2 | **Applicable States** が実装されているか | UI 種別に該当する applicable state (例: 一覧画面の empty state) が未実装、該当しない state に not_applicable_reason がない |
| 3 | error / loading が抜けていないか (該当する場合) | try/catch だけで UI feedback 無し |
| 4 | keyboard / focus を壊していないか | `outline:none`、`<div @click>` 残存、tab 順序破壊 |
| 5 | 既存より操作がわかりにくくなっていないか | クリック数増加、戻る導線消失 |
| 6 | Issue 範囲外の redesign が混入していないか | scope_out のファイル変更、無関係な component の見た目変更 |
| 7 | 美しさのために使いやすさが退化していないか | アニメーション過多で操作がブロックされる、視覚優先で keyboard 操作が壊れる |

> hard-coded style 混入そのものは **designer-expert の post-check 領域**。本エージェントが
> post-check で見るのは、それが a11y や使いやすさを直接破壊している場合のみ。

### BLOCK 絶対条件 (post-check 版 8 項目)

`visual-quality-rubric.md` の Hard blockers が 1 つでも実装に残るなら BLOCK。

- Design Plan の Applicable States に挙げられた state が未実装
  (該当しない state に not_applicable_reason 説明があるなら OK)
- error から復帰できない (該当する場合)
- 危険操作が確認 / Undo なしで動く
- focus が見えない (`outline:none` 未代替)
- keyboard 到達不可 (`<div @click>` 残存等)
- contrast 不足 (本文 4.5:1 / 非テキスト 3:1 を割る)
- Design Plan で約束した UI が実装されていない
- Issue scope_out のファイルに無関係な変更が入っている

### 次の動作 (宛先 = `op-run-expert` 可変)

- **PASS** — review-expert global review へ
- **PASS_WITH_NOTES** — 軽微な観点を PR コメントに残す → review-expert global review へ
- **BLOCK** — **needs-fix で designer に戻す** (needs-fix-applied は廃止)

### 出力

**冒頭に `<!-- op-ux-ui-audit -->` を必ず置く** (本 marker は人間向け監査ログ。機械正本は `op-review-state` の
`post_checks["ux-ui-audit-expert"]` — 上記対比表参照)。本文は Gate 節の出力テンプレと同じテーブル形式で、
観点行を上記 7 観点に差し替える。

### Required Changes の書き方 (コードレベル、例)

`Required Changes` (BLOCK 時) は **「実装で追加すべきコード」レベルの具体性** を持たせる。

```markdown
### Required Changes

- `features/job-board/JobList.vue` に EmptyState コンポーネントを追加
  - 「該当する求人がありません」 + 「+ 新規登録」ボタン
  - `useJobs()` の返り値が空の場合に表示
- `features/job-board/JobDetail.vue` の削除ボタンに確認 dialog を追加
  - 既存 `<ConfirmDialog>` (components/ConfirmDialog.vue) を使用
  - default focus は「キャンセル」に置く
- `components/IconButton.vue` の `outline: none` を `:focus-visible` の代替 ring に置き換え
  - design system token: `--color-focus-ring`
```

### post-check 時の自己点検

- [ ] Design Plan の `Components to Use` / `Tokens to Use` と差分が一致するか
- [ ] Design Plan の `Applicable States` がすべて実装されているか (該当しない state に not_applicable_reason 説明があれば PASS)
- [ ] 6 状態を機械的に全要求していないか (`recovery-and-states.md` 参照)
- [ ] Hard blockers を `visual-quality-rubric.md` で確認したか
- [ ] PR diff に scope_out のファイル変更が無いか
- [ ] keyboard / focus / contrast を `a11y-checklist.md` で再確認したか
- [ ] BLOCK 時に Required Changes が **コードレベルで** 具体化されているか
- [ ] designer の自己採点 (実 score) を見て、85 未満なら BLOCK 候補として精査したか

### post-check と scan の違い

scan は「画面全体に問題があるか」を網羅的に audit する。
post-check は「**この PR の差分が** Design Plan を満たすか」だけを見る。

- post-check で scope_out の問題を見つけても、起票はしない (それは scan / patrol の仕事)
- post-check で BLOCK するのは「この PR の差分が問題」のときだけ
- 既存コードの問題は **PR コメントに「scan 領域」として残す** に留める
