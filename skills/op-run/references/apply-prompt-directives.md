# op-run apply prompt — expert 別 load-bearing 指示 (canonical)

ClusterOrchestrator はフェーズ2 で `common` 節 + 当該 expert の節の本文を apply-expert の prompt に注入する
(該当 expert の節が無ければ common 節のみ)。共通宣言は `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§5 が正本。
本ファイルは apply 固有の追加要件だけを定める。

---

## common (全 expert 共通、apply 指示書の追加要件)

### 手順

```
1. 指示書の scope_in 範囲のみで作業し、scope_out は触らない
2. additive Issue (テスト追加 / 機能追加) は recommendation.steps をテンプレとしてそのまま実装する
3. 検証は ~/.claude/skills/_shared/project-profile.md「Verification Ladder」、規約は同「対象 repo 規約への準拠」に従う
   コメントは同「コメント作法」に従う (既定で書かない。理由は commit message へ)
4. files_likely_to_modify から外れるファイルを触る必要が出たら、その変更は行わず needs_human_decision + blocked_actions[] で返す
5. commit する (`Fixes #N` 列挙、判定根拠を message に。形式は ~/.claude/skills/_shared/commit-convention.md)。push しない
```

### UI を含む Issue

```
`デザインモック: <URL>` 行の扱いは ~/.claude/skills/_shared/design-mock.md「利用」に従う (モックが無ければ既存 design system / component に従う)。
~/.claude/skills/_shared/design-ng.md の NG を 1 つも入れない (モックに含まれていても採用しない)。
画面は ~/.claude/skills/_shared/design-system.md の登録済み部品だけで組む。
```

### 検証レベルの記録

```
完了報告に project-profile.md「検証レベルの分類」で記録する (ClusterOrchestrator が PR 本文に転記する)。fail を含むまま完了報告しない。
```

### 自己検証 (Skill op-code-review)

順序・手動 fallback・完了前チェックリストは `_shared/apply-completion-checklist.md`「2-A. commit 先行経路」と同ファイルが正本。

```
1. commit 後、Skill({skill: "op-skill:op-code-review", args: "diff: ${OP_RUN_BASE_SHA}...HEAD effort: ${code_review_effort}"})
   を実行する (code_review_effort が auto / 未指定なら effort を付けない)。scope は自分が変更した diff のみ。
2. 完了報告に含める: self_review_result ("pass" | "needs_fix" | "skip"。skip = ドキュメントのみ等 code-review 非該当) /
   self_check_blocked (false でも省略しない。欠落すると PR が作られない) / commits_added (1 件以上) /
   code_review_invoked / code_review_result (invoked: false なら code_review_skip_reason)
```

---

## feature-expert

```
* 指示書の asset_map.template_files (手本) と asset_map.reusable_assets (再利用資産) を Read する
* asset_map が無い Issue は expert-feature の references/asset-discovery.md に従い既存資産探索を終えてから実装する
* コミットメッセージに「手本」節と「再利用した既存資産」節を書く (空欄なら silent fork の兆候として再探索)
```

---

## optimize-expert

```
* expert-optimize の Optimization Loop と references/benchmark-protocol.md (計測条件・統計判定の正本) に従う
* Before benchmark を実装前に取得する。取れない場合は実装に着手せず、理由を decision_rationale /
  assumptions[] / needs_human_decision / blocked_actions[] に入れて decision="deferred" で返す
* 判定 none → revert して decision="reverted"、unstable → revert して decision="deferred"
* 1 PR = 1 bottleneck。別の bottleneck は remaining_issues[] に列挙し、本 PR に含めない (Issue コメントは書かない)
* 完了報告は `op help payload apply-report` 形式 + 修正完了報告 (`_shared/expert-spawn.md`)
* コミットメッセージに Before / After / improvement / significance / decision を書く
```

---

## designer-expert

```
* Issue の `デザインモック:` URL の artboard (画面・状態ごと) を実装の目標とする。
  `参照: #N` 行は同じ UI surface の lead Issue を示すだけで、モックは各 Issue 自身の `デザインモック:` 行を使う
* 実装する状態はモックの artboard と Issue scope にある状態だけ。該当しない状態は完了報告に not_applicable_reason を 1 行書く
* 既存 UI の visual refactor / token migration / component bypass 解消 Issue では新規状態を追加せず、
  既存状態 (focus / disabled / contrast / hover / selected 等) の regression を確認して完了報告に States Preserved として書く
* コミットメッセージに Components Used / Tokens Used / States Covered / Skipped States (not_applicable_reason) /
  States Preserved / Motion Applied (使用時) を書く
```

---

## refactor-expert

```
* Issue の `## 🧱 Refactor Execution Control` 節と expert-refactor SKILL.md「Refactor Execution Control」に従う
  (節が無い Issue は指示書節と同 SKILL.md から実行制御を再構築してから着手する。推測で direct apply しない)
* 完了報告に behavior_change_claim: "no_behavior_change" と contract_preservation の全 boolean を含める
* post-check が ux-ui-audit-expert / security-expert の場合、UI 状態 / a11y / file IO の既存挙動を壊していない根拠を完了報告に書く
* コミットメッセージに Refactor Type / Stage Executed / Behavior Change Claim / Contract Preservation を書く
```
