<!--
schema_version: 1
last_breaking_change: 2026-05-30
notes: v1 (2026-05-30): ADR-0009 Phase C C1 で新設。op-run apply フェーズの expert 別
       load-bearing 指示を SKILL.md 2-C prompt (旧 L843-1016) から verbatim 抽出した canonical 正本。
       controller がフェーズ2-C で本ファイルの「common」節 + 各 cluster.expert の節を読み、
       ClusterOrchestrator (cluster-orchestrator-directives.md フェーズ2) が apply-expert spawn 時の prompt に注入する。
       op-run-fanout.js は ADR-0016 で削除済み。本文言はここが正本。
-->

<!--
機能概要: op-run apply フェーズで apply agent に渡す expert 別 load-bearing 指示の正本。
作成意図: C1 で 2-C の Agent spawn を Workflow へ移行する際、SKILL.md 内に inline していた
         230 行の expert 別 prompt 文言を .js に埋めると肥大化するため、markdown 正本に分離。
         「教科書は markdown」の repo 哲学 + post-check-prompts.md と同じ controller 注入パターンに整合。
注意点: 脱落禁止 (旧 SKILL.md 2-C prompt の expert 別分岐を 1 文字も削らず移植する)。
       変更時は schema_version を bump し op-run/SKILL.md フェーズ2-C の `(>=N)` を確認する。
-->

# op-run apply prompt — expert 別 load-bearing 指示 (canonical)

ClusterOrchestrator は apply-expert を spawn するフェーズ2 (cluster-orchestrator-directives.md フェーズ2) において、
各 cluster について **`common` 節 + 当該 `cluster.expert` の節**を結合して apply-expert prompt に注入する。
expert 固有の判断基準は本ファイルが唯一の正本 (`op-run-fanout.js` は ADR-0016 で削除済み)。

---

## common (全 expert 共通、apply 指示書の追加要件)

### 手順 (構造 prompt の補足)

```
3. 指示書の scope_in 範囲のみで作業、scope_out は触らない
4. additive Issue (テスト追加 / 機能追加) の場合は recommendation の
   実装計画 (recommendation.steps) をテンプレとしてそのまま実装
5. ファイルを修正、1〜2 ファイルごとに検証
   検証コマンドは ~/.claude/skills/_shared/project-profile.md に従う
   (Cargo.toml なら cargo fmt/clippy/test、pubspec.yaml なら dart format/flutter analyze/test、
    package.json なら pnpm lint/typecheck/test、src-tauri/ なら cargo check)
6. CLAUDE.md 規約遵守 (ネスト 2、日本語コメント、最小限の修正)
7. report の files_likely_to_modify から外れるファイルを触る必要が出た場合は、
   **修正を止めて司令官に追加申告する** (再 Stage 2 検証が必要)
8. コミット (メッセージは日本語、Fixes #N 列挙、判定根拠を message に)
   **push と PR open は ClusterOrchestrator (cluster-orchestrator-directives.md フェーズ4) が行うため、apply agent は push しない**
   完了報告の末尾に **必ず以下の 1 行を含める** (ADR-0007 §設計の骨子 §worker prompt パターン 6):
   ```
   PR: <url>      ← push / PR open 完了後に司令官が記入 (apply agent 自身は "--" を入れる)
   PR: none — <reason>   ← PR を作成しない場合 (失敗 / blocked / scope-out 等)
   ```
   apply agent は commit 時点では PR URL が未確定のため、完了報告に `PR: --` を記載する。
   ClusterOrchestrator がフェーズ4 で PR open 後、controller が ClusterSummary の pr_url で status table を更新する。
```

### 検証レベルの記録 (PR 本文に必須)

```
project-profile.md の「検証レベルの分類」に従い、以下を必ず PR 本文に書く:
- Static / Unit / Build / Integration: pass | fail | skipped (実行コマンド or skipped 理由)
- Manual required: yes | no
- 未検証理由: skipped / manual の具体的理由
Manual required = yes は失格ではない。環境依存 (InDesign COM, Tauri full build,
iOS / Android 実機) は適切に skipped + 理由記載で問題ない。
```

### PR 本文の可読性要件 (二層構造)

```
PR 本文は ~/.claude/skills/_shared/pr-templates.md の「op-run: PR open テンプレ」と
「PR 本文の品質要件 (apply agent / reviewer 共通)」に完全準拠する。
二層構造 (上半分=非エンジニア向け / 下半分=エンジニア向け技術詳細) と
自動検証 / 回帰テストの別セクション分離は必須。詳細・禁止事項は pr-templates.md を参照。

PR タイトルは原則 `<業務領域>: <利用者から見える変更> [#<issues>]` 形式。
利用者影響がない純粋なリファクタ等は旧形式 `<type>(<scope>): <summary> [#<issues>]` を許容。
タイトル規則の詳細は pr-templates.md の「PR タイトル」節を参照。
```

### 指示書が薄い / 古い形式の場合

```
Issue 本文に指示書節がない場合、apply agent は質問で停止しない。
推測で進めず、`assumptions[]` に推定した内容を記録、判断不能項目を
`needs_human_decision` (decision_type: "scope" or "behavior") + `blocked_actions[]`
として完了報告に構造化返却する。
Issue コメント化は op-run / commander 側が後段で必要に応じて行う。
```

### 自己検証 (Skill code-review)

実装・commit が完了したら、PR 作成前に以下を実行すること (ClusterOrchestrator フェーズ3、push は ClusterOrchestrator がフェーズ4 で行う):

```
1. Skill(code-review, --high) を worktree の変更差分に対して実行する
   (scope: apply-expert が変更した diff のみ、PR 全体ではない)
2. Critical または High が検出された場合: 自己修正して再 commit し、自己検証を再実行する
   (再実行は 1 回まで。2 回目の Critical/High は self_check_blocked: true を含めて ClusterOrchestrator に返す)
   - 修正不可能な場合は ClusterOrchestrator に self_check_blocked: true を含めて返す
3. Medium / Low のみの場合: 自己修正せず ClusterOrchestrator に返し、formal review 工程に委ねる
   (過剰な自己ブロックを避ける)
4. 完了報告に self_review_result: "pass" | "needs_fix" | "skip" を含める
   (cluster-orchestrator-directives.md フェーズ3 と同 enum)
```

### 完了手順

```
完了手順は `_shared/apply-completion-checklist.md` に集約。各 expert は固有 skip 条件のみ
自身の SKILL.md に持つ。完了報告 (`expert-spawn.md` v14 schema) には `code_review_invoked` /
`code_review_result` を必ず含める (skip の場合は `code_review_skip_reason` も必須)。
v14 / v15 完了報告 (旧 `simplify_*` フィールド) も controller の auto-translate で 1 release
backward-compat (詳細は expert-spawn.md v16 の deprecation 節)。
**commits_added: [SHA, ...]** (1 件以上) を完了報告に必ず含める。
commits_added が空のまま完了報告を返すことは contract violation。
**チェックリスト全項目 yes でない状態で完了報告を返すことは contract violation**。

【完了条件】
該当する検証レベルがすべて pass または正当な skipped であること。
fail を含むまま完了報告してはいけない (PR は draft のまま)。
完了後、変更ファイル一覧と検証レベル一覧を報告。
- [ ] Skill(code-review, --high) を実行し、Critical/High を解消した (Medium/Low は formal review に委ねる)
```

---

## feature-expert

```
指示書の scope_in が additive (テスト追加 / 機能追加) の場合は recommendation の
実装計画 (recommendation.steps) をテンプレとしてそのまま実装する。

feature-expert apply の場合は追加で:
* 指示書の `asset_map.template_files` (手本ファイル) と
  `asset_map.reusable_assets` (再利用資産) を必ず Read で確認
* 指示書に asset_map がない (古い形式 / 人間由来 Issue) 場合は、
  expert-feature skill の references/asset-discovery.md に従って
  既存資産探索を完了してから実装に入る (silent fork 防止の最低充足)
* コミットメッセージに「手本」節と「再利用した既存資産」節を必ず記載
  (空欄なら完了報告できない、silent fork 兆候として再探索)
```

---

## optimize-expert

```
optimize-expert apply の場合は追加で:
* `~/.claude/skills/expert-optimize/SKILL.md` の Optimization Loop と
  `references/benchmark-protocol.md` を最優先で参照する
* **Before benchmark を実装前に必ず取得する**
  - release build / warmup 3 以上 / min-runs 10 以上 / 同一環境を満たす
  - small / medium / large fixture を分け、I/O 系は cold / warm を区別
* **Before benchmark が取れない場合は実装に着手しない**
  理由 (環境依存・ツール非導入・fixture 不足等) は completion report の
  measurement_missing / assumptions[] / needs_human_decision / blocked_actions[] に
  構造化して返し、decision="deferred" で完了報告する。
  Issue コメント化は commander / OP skill が判断する (OP-managed Mode では
  apply subagent が直接 Issue コメントを書かない)。
* **After benchmark は同一コマンド・同一入力・同一環境で取得する**
* 統計判定は improvement_ms / combined_stddev_ms を基に行う:
  - improvement_ms = before_mean_ms - after_mean_ms
  - combined_stddev_ms = sqrt(before_stddev_ms^2 + after_stddev_ms^2)
  - clear      : ratio = improvement_ms / combined_stddev_ms >= 3
  - marginal   : 1 <= ratio < 3
  - none       : ratio < 1
  - unstable   : before_stddev_ms > before_mean_ms * 0.2
                 or after_stddev_ms > after_mean_ms * 0.2
* none の場合は変更を revert し、decision="reverted" で完了報告
* unstable の場合は変更を revert し、decision="deferred" で完了報告
  (benchmark 環境改善 Issue を別起票推奨)
* **複数 bottleneck を 1 PR に混ぜない**
  1 Issue = 1 bottleneck = 1 改善カテゴリの原則を維持。
  探知中に別 bottleneck を発見した場合は completion report の
  `remaining_issues[]` に列挙し、今回の PR には含めない。
  Issue コメント化や別 Issue 起票は commander / OP skill が判断する
  (OP-managed Mode では apply subagent が直接 Issue コメントを書かない)。
* 完了報告は `~/.claude/skills/expert-optimize/templates/apply-report.schema.json`
  形式で必ず行う (Before/After 数値・improvement_ms / combined_stddev_ms /
  significance / decision を含む)
* コミットメッセージに「Before / After / improvement / significance / decision」を必ず記載
```

---

## designer-expert

```
designer-expert apply の場合は追加で:
* Issue 本文の `## 🎨 Design Plan` 節を必ず Read し、Components to Use /
  Tokens to Use / Applicable States / Accessibility Requirements /
  Motion Strategy (あれば) を実装の起点とする (op-architect が事前に gate 済み)
* Design Plan が無い (op-scan / op-patrol 由来 / 人間立て Issue) 場合は、
  ux-ui-audit-expert.md の Usability Invariants と Issue 本文の指示書節から
  最低限の Design Plan を自分で再構築してから実装に入る
* 既存 design system (theme / token / component / layout pattern) を Grep で
  先に調査し、新規 token / hard-coded style を作らない
* `### Motion Strategy` 節がある場合、motion は必ず motion token (duration/easing) 経由・
  `transform`/`opacity` のみ animate・`prefers-reduced-motion` fallback 必須で実装する
  (`expert-design/references/motion-patterns.md`)。AI 到達ライン ③④ (物理 spring /
  orchestrated sequence) は勝手に作り込まず Design Plan の意図に留め、human polish / design spike に委ねる
* **Applicable States を実装する。6 状態を機械的に全実装してはいけない。**
  Design Plan の Applicable States 節に列挙された state のみ実装し、
  該当しない state は完了報告に `not_applicable_reason` を 1 行添える。
  (例: 静的 about ページに empty / disabled は不要 → not_applicable_reason 記載)
* **既存 UI の visual refactor / token migration / component bypass 解消 Issue
  (op-scan / op-patrol 由来の design Issue 等) では新規 state を勝手に追加しない。**
  ただし既存 state (focus / disabled / contrast / hover / selected 等) を
  壊していないかは必ず regression check し、完了報告に `States Preserved` として記載する
* 判定の指針: Issue / Design Plan の scope に「state を増やす」要求が明示されているかで決める。
  明示されていなければ既存 state の維持に留める (scope クリープ防止)
* コミットメッセージに「Components Used」「Tokens Used」「Applicable States Covered」
  「Skipped States (with not_applicable_reason)」「States Preserved (regression check 済)」
  「Motion Applied (motion 使用時: 使用 token + reduced-motion 対応の有無)」節を必ず記載
```

---

## refactor-expert

```
refactor-expert apply の場合は追加で:
* Issue 本文の `## 🧱 Refactor Execution Control` 節を必ず Read し、
  `finding_type` / `execution_mode` / `direct_apply_safe` /
  `safe_first_step` / `proposed_stages` / `forbidden_stage_actions` /
  `blocking` / `blocking_reason` を実装前に必ず確認する。
  節が無い (古い形式 / 人間立て Issue) 場合は、Issue 本文の指示書節
  (scope_in / scope_out / verification_steps / success_criteria / gotchas) と
  `~/.claude/skills/expert-refactor/SKILL.md` の「Refactor Execution Control」節から
  最低限の実行制御を再構築してから着手する (推測で direct apply に進まない)。
* **direct_apply_safe: true** の `immediate_refactor` のみ direct apply してよい。
  それ以外 (`staged_refactor` / `architecture_debt`) は **`safe_first_step` のみ実行**。
  `proposed_stages` の 2 つ目以降は本 PR で実行しない (1 stage = 1 PR を厳守)。
* **`finding_type=needs_spec_decision`** または
  **`needs_human_decision.required: true`** (構造化 block) を含む Issue は
  原則として **実装せず**、`needs_human_decision` block 全体 (`required: true`,
  `decision_type: "spec" or "boundary"`, `options[]`, `recommended_option`,
  `safest_default`, `blocked_actions[]`, `can_continue_without_decision`,
  `next_safe_action`) を完了報告に構造化返却する (Issue コメント化は司令官が判断)。
* **例外 (opt-out): `needs:human-decision-followup` ラベルが付いた Issue**
  (= `required: true` かつ `can_continue_without_decision: true` かつ
  `finding_type != needs_spec_decision`) は **`safe_first_step` のみ実行してよい**。
  ただし以下を必ず守る:
  - `proposed_stages` の 2 つ目以降は本 PR で実行しない (1 stage = 1 PR 厳守)
  - `needs_human_decision.blocked_actions[]` に列挙された操作は本 PR で **絶対に行わない**
    (ディレクトリ移動 / 実値変更 / public API 変更 / IPC contract 変更 等。
     境界判断 (boundary decision) を先取りしない)
  - 完了報告に `needs_human_decision` block 全体をそのまま転載する (司令官が
    PR 本文「残存リスク / follow-up」節と global review への follow-up として処理する)
  - PR 本文の Refactor Execution Control 節に `needs_human_decision` 節を必ず残す
    (merge 後に判断 → 次 stage の Issue を起票するための痕跡)
  - safe_first_step を実行しても判断が必要になった場合は、その時点で停止して
    `needs_human_decision.required: true` + `can_continue_without_decision: false`
    に格上げした報告を返す (人間判断待ち、blocking)
* **挙動非変更を絶対条件** とする。以下に該当する変更は本 PR で行わない
  (必要なら `needs_spec_decision` として返す):
  - public API / trait / interface の signature 変更
  - serialized format / DB schema / migration / IPC contract の変更
  - Tauri command name / event name / permission name の変更
  - path / key / status / error / env の **実値** 変更
  - file location (出力先 / 設定保存先 / cache 位置) の変更
  - public function の引数順 / 戻り値型の変更
* 完了報告には **`behavior_change_claim: "no_behavior_change"`** と
  **`contract_preservation` の全 boolean** を必ず含める。
  いずれかの contract を破る変更が必要なら、実装せず
  `needs_spec_decision` として返す。
* post-check が `ux-ui-audit-expert` / `security-expert` の場合は、
  refactor の scope_in 範囲のみで作業し、UI 状態 / a11y / file IO の
  既存挙動を壊していないことを完了報告で根拠付きで明示する。
* コミットメッセージに「Refactor Type (immediate_refactor / staged_refactor の別)」
  「Stage Executed (safe_first_step / N/A)」「Behavior Change Claim
  (no_behavior_change)」「Contract Preservation (api/serialized/ipc/path/etc)」
  節を必ず記載。
```

---

## debug-expert / test-expert / security-expert (apply 担当時)

```
上記 common 節に加え、各自の expert SKILL.md (expert-debug / expert-test / expert-security) の
apply 手順・検証ラダー・report schema に従う。debug は最小修正 + 回帰テスト、test は
ゴミテスト除去とカバレッジ閉鎖、security は限定 apply + 8 観点 post-check signal を遵守する。
(これらは固有 skip 条件を各 SKILL.md に持つため、本ファイルでは common + 各 expert SKILL.md 参照に留める)
```
