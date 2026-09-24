# op-run apply prompt — expert 別 load-bearing 指示 (canonical)

ClusterOrchestrator はフェーズ2 で **`common` 節 + 当該 expert の節**の本文を apply-expert の prompt に注入する。
共通宣言 (invocation_mode / 質問禁止 / fallback 構造化返却) は `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4 が正本。
本ファイルは apply 固有の追加要件だけを定める。

---

## common (全 expert 共通、apply 指示書の追加要件)

### 手順

```
1. 指示書の scope_in 範囲のみで作業し、scope_out は触らない
2. additive Issue (テスト追加 / 機能追加) は recommendation.steps をテンプレとしてそのまま実装する
3. 1〜2 ファイルごとに検証する (検証コマンドは ~/.claude/skills/_shared/project-profile.md のスタック別)
4. CLAUDE.md 規約遵守 (ネスト 2、日本語コメント、最小限の修正)
5. files_likely_to_modify から外れるファイルを触る必要が出たら、修正を止めて司令官に申告する
6. commit する (日本語、`Fixes #N` 列挙、判定根拠を message に。形式は _shared/commit-convention.md)。
   push と PR open は ClusterOrchestrator が行うため、apply agent は push しない
```

### UI を含む Issue

```
Issue に `デザインモック: <URL>` 行があれば Artifact({action:"read", url}) でモックを参照し、見た目の目標とする。
実装は対象 repo の既存 design system / component を使う (モックの見た目を新規 token / hard-coded style で再現しない)。
モックに無い状態、既存 component で表現できない等の判断が要る差分は needs_human_decision で返す。
モックが無い UI Issue は既存 design system / component に従う。
```

### 検証レベルの記録 (PR 本文に必須)

```
project-profile.md の「検証レベルの分類」に従い、完了報告に記録する (ClusterOrchestrator が PR 本文に転記する):
- Static / Unit / Build / Integration: pass | fail | skipped (実行コマンド or skipped 理由)
- Manual required: yes | no
- 未検証理由: skipped / manual の具体的理由
環境依存 (InDesign COM, Tauri full build, iOS / Android 実機) は skipped + 理由記載でよい。
fail を含むまま完了報告しない。
```

PR 本文 (二層構造・タイトル規則) は `_shared/pr-templates.md`「op-run: PR open テンプレ」に従う。

### 指示書が薄い / 古い形式の場合

```
Issue に指示書節が無くても質問で停止しない。推測で進めず、推定した内容を assumptions[] に、
判断不能項目を needs_human_decision (decision_type: "scope" or "behavior") + blocked_actions[] として返す。
```

### 自己検証 (Skill op-code-review)

順序は commit 先行 (`_shared/apply-completion-checklist.md` Section 2-A)。invoke 方法・手動 fallback の発動条件・
完了前チェックリストも同ファイルが正本。

```
1. commit 後、Skill({skill: "op-skill:op-code-review", args: "diff: ${OP_RUN_BASE_SHA}...HEAD effort: ${code_review_effort}"})
   を実行する (code_review_effort が auto / 未指定なら effort を付けない)。scope は自分が変更した diff のみ。
2. Critical / High が出たら自己修正して追加 commit し、自己検証を 1 回だけ再実行する。
   2 回目も Critical/High が残る、または修正不能なら self_check_blocked: true で返す。
3. Medium / Low のみなら自己修正せず返す (formal review に委ねる)。
4. 完了報告に必ず含める:
   - self_review_result: "pass" | "needs_fix" | "skip"   (skip = code-review 非該当。例: ドキュメントのみ)
   - self_check_blocked: true | false   (false でも省略しない。欠落すると PR が作られない)
   - commits_added: [SHA, ...] (1 件以上)、code_review_invoked / code_review_result
     (code_review_invoked: false の場合は code_review_skip_reason も)
5. 完了報告の直前に git status --porcelain が空であることを確認する。
```

---

## feature-expert

```
* 指示書の asset_map.template_files (手本) と asset_map.reusable_assets (再利用資産) を必ず Read する
* asset_map が無い Issue は expert-feature の references/asset-discovery.md に従い既存資産探索を終えてから実装する
* コミットメッセージに「手本」節と「再利用した既存資産」節を必ず書く (空欄なら silent fork の兆候として再探索)
```

---

## optimize-expert

```
* expert-optimize の Optimization Loop と references/benchmark-protocol.md (計測条件・統計判定の正本) に従う
* Before benchmark を実装前に取得する。取れない場合は実装に着手せず、理由を decision_rationale /
  assumptions[] / needs_human_decision / blocked_actions[] に入れて decision="deferred" で返す
* After benchmark は同一コマンド・同一入力・同一環境で取る
* 判定 none → revert して decision="reverted"、unstable → revert して decision="deferred"
* 1 PR = 1 bottleneck。別の bottleneck は remaining_issues[] に列挙し、本 PR に含めない
  (Issue コメント化・別 Issue 起票は commander が判断する。apply agent は Issue コメントを書かない)
* 完了報告は `op help payload apply-report` 形式 + 共通の修正完了報告 (`_shared/expert-spawn.md`)
* コミットメッセージに Before / After / improvement / significance / decision を書く
```

---

## designer-expert

```
* Issue の `デザインモック:` URL を Artifact read し、対応する artboard (画面・状態ごと) を実装の目標とする。
  `参照: #N` 行は同じ UI surface の lead Issue を示すだけで、モックは各 Issue 自身の `デザインモック:` 行を使う
* 既存 design system (theme / token / component / layout pattern) を先に Grep で調べ、新規 token / hard-coded style を作らない
* motion は motion token (duration/easing) 経由・transform/opacity のみ・prefers-reduced-motion fallback 必須
  (expert-design/references/motion-patterns.md)。物理 spring / orchestrated sequence は作り込まない
* 実装する状態はモックの artboard と Issue scope にある状態だけ。6 状態を機械的に全実装しない。
  該当しない状態は完了報告に not_applicable_reason を 1 行書く
* 既存 UI の visual refactor / token migration / component bypass 解消 Issue では新規状態を追加しない。
  既存状態 (focus / disabled / contrast / hover / selected 等) を壊していないか regression check し、
  完了報告に States Preserved として書く
* コミットメッセージに Components Used / Tokens Used / States Covered / Skipped States (not_applicable_reason) /
  States Preserved / Motion Applied (使用時) を書く
```

---

## refactor-expert

```
* Issue の `## 🧱 Refactor Execution Control` 節を実装前に Read する。意味と実行ルール (direct_apply_safe /
  safe_first_step / proposed_stages / forbidden_stage_actions / needs_spec_decision) の正本は
  expert-refactor SKILL.md「Refactor Execution Control」節。節が無い Issue は指示書節と同 SKILL.md から
  最低限の実行制御を再構築してから着手する (推測で direct apply しない)
* direct_apply_safe: true の immediate_refactor のみ direct apply。それ以外は safe_first_step のみ (1 stage = 1 PR)
* needs_spec_decision または needs_human_decision.required: true の Issue は実装せず、block 全体を完了報告に返す。
  例外: needs:human-decision-followup ラベル付きは safe_first_step のみ実行し、blocked_actions[] は行わず、
  block 全体を完了報告と PR 本文 (Refactor Execution Control 節) に残す
  (詳細は expert-refactor/references/architecture-debt.md)
* 挙動非変更が絶対条件 (保護対象は SKILL.md「Apply Report」の contract_preservation)。完了報告に
  behavior_change_claim: "no_behavior_change" と contract_preservation の全 boolean を含める
* post-check が ux-ui-audit-expert / security-expert の場合、UI 状態 / a11y / file IO の既存挙動を壊していない根拠を完了報告に書く
* コミットメッセージに Refactor Type / Stage Executed / Behavior Change Claim / Contract Preservation を書く
```

---

## debug-expert / test-expert / security-expert (apply 担当時)

```
common 節に加え、各 expert SKILL.md (expert-debug / expert-test / expert-security) の apply 手順・検証ラダー・
report schema に従う。debug は最小修正 + 回帰テスト、test はゴミテスト除去とカバレッジ閉鎖、
security は限定 apply (正当な user capability を維持したまま到達経路を遮断する)。
```
