<!--
機能概要: op-run フェーズ4-3 のラベル遷移 helper 群 (4-3-1 review / 4-3-2 post-check) を
         SKILL.md 本体から物理切り出しした参照ファイル。
作成意図: SKILL.md の god file 化解消 (Issue #406 Stage 1)。bash 実装の内容は
         SKILL.md 本体と byte-identical のまま維持し、挙動を変えない。
注意点: 本ファイルの bash 実装を変更するときは必ず SKILL.md 本体の
        呼び出し site (apply_review_labels / apply_security_post_check_labels /
        apply_ux_post_check_labels) との整合を確認する。
        Stage 2-6 は別 PR (Issue #406 の proposed_stages[1..] 参照)。
-->

<!-- op-domain: refactor -->
<!-- op-source: op-run -->

# op-run: ラベル遷移 helper (4-3)

op-run フェーズ4-3 で使用するラベル遷移 helper の実装と遷移表。
SKILL.md 本体の `### 4-3. レビュー結果の統合` から物理切り出し (Issue #406 Stage 1)。

---

## 4-3. レビュー結果の統合

各 review subagent の出力を集約。**ラベル遷移は排他制御**で行い、過去の review 系ラベル
(`pro-review-stale` / `pro-review-blocked` 等) が残って状態矛盾を起こすことを防ぐ。

### ラベル遷移の正規表 (排他制御)

review_result が確定した時点で、対象 PR に対して必ず以下の add / remove を atomic に適用する。
remove 側は当該ラベルが付いていなくても `|| true` で許容する (gh の挙動上 no-op)。

```text
review_result = approve:
  add:
    - pro-reviewed
  remove:
    - pro-review-needs-fix
    - pro-review-fix-in-progress
    - pro-review-stale
    - pro-review-blocked

review_result = needs-fix:
  add:
    - pro-review-needs-fix
  remove:
    - pro-reviewed
    - pro-review-fix-in-progress
    - pro-review-stale
    - pro-review-blocked

review_result = needs-specialist-review:
  add:
    - pro-review-needs-fix
  remove:
    - pro-reviewed
    - pro-review-fix-in-progress
    - pro-review-stale
    - pro-review-blocked

review_result = blocked:
  add:
    - pro-review-blocked
  remove:
    - pro-reviewed
    - pro-review-needs-fix
    - pro-review-fix-in-progress
    - pro-review-stale
```

### 実装テンプレ

```bash
# B1 (#395) の op pr label-transition primitive 完成により、旧 bash helper 群
# (_op_run_pr_current_labels / _op_run_verify_label_state / _op_run_apply_label_set) を
# CLI primitive に巻き戻し置換した (Issue #577 / op-tools wave)。
#
# 共通方針:
# - `op pr label-transition` が target × result から add/remove delta を算出し、
#   gh pr edit 1 invocation で atomic 適用 + post-condition verify を内包する。
# - 利用側で `set -euo pipefail` を必ず有効にしてから呼ぶ。
# - `op pr label-transition` の失敗を握り潰さない (caller の set -e が拾う)。
# - 出力は JSON envelope { decision, details: { pr, target, result, added, removed, final_labels, verified } }。

apply_review_labels() {
  local pr="$1"; local result="$2"
  # 第3引数 (pre_fetched_labels) は op pr label-transition 内部で取得するため不要 (互換シグネチャとして受け取るが無視)
  # 注意: "needs-specialist-review" は op pr label-transition の --result に渡せない (CLI 未対応)。
  #       旧 bash helper では needs-fix と同じ label 操作を行っていたため、ここで変換する。
  local cli_result="$result"
  if [ "$result" = "needs-specialist-review" ]; then
    cli_result="needs-fix"
  fi
  op pr label-transition --pr "$pr" --target review --result "$cli_result"
}
```

> **重要**: `pro-review-stale` は「再 review 待ち」の中間状態であり、review-expert が新しい
> `reviewed_head_sha` で判定を出した瞬間に必ず剥がす。残置すると op-merge 側 gate と矛盾する。

| PR | review_result | 結果 (排他制御後の最終 label set) | 次のアクション |
|----|--------------|--------------------------------|--------------|
| #N1 | approve | pro-reviewed のみ (review 系で残存可なのはこれだけ) | op-merge へ |
| #N2 | needs-fix | pro-review-needs-fix のみ | フェーズ4.5 Review Fix Loop へ |
| #N3 | needs-specialist-review | pro-review-needs-fix のみ | フェーズ4.5 で specialist handoff |
| #N4 | blocked | pro-review-blocked のみ | 人間判断待ち |

---

## 4-3-2. Post-check ラベル遷移 (排他制御)

post-check (3.5-A / 3.5-B / 3.5-B-4) の判定が確定するたびに、必ず以下の helper を経由して
ラベルを atomic に更新する。**直接 `gh pr edit --add-label pro-security-needs-fix` を呼ぶことは禁止**
(remove 抜けで stuck 状態になり op-merge gate と矛盾する事故を防ぐ)。

### Security post-check ラベル遷移

```text
security_post_check_result = pass | pass_with_notes:
  add:    (なし)
  remove: pro-security-needs-fix
          pro-security-post-check-skipped
  note:   generic needs:human-decision は自動 remove しない
          (security 以外の human decision が同 PR に残っている可能性があるため)

security_post_check_result = block:
  add:    pro-security-needs-fix
  remove: pro-security-post-check-skipped

security_post_check_result = needs_human_decision:
  add:    pro-security-needs-fix
          needs:human-decision
  remove: pro-security-post-check-skipped

security_post_check_result = skipped:
  add:    pro-security-post-check-skipped
  remove: pro-security-needs-fix
  note:   generic needs:human-decision は自動 remove しない
```

> **注意**: `pro-security-expert` (domain ラベル) は本 helper では触らない (Issue routing 専用、状態遷移とは独立)。
> `pro-security-post-check-manual-override` も触らない (人間付与専用、自動 gate でも override 維持)。

### UX post-check ラベル遷移 (3.5-A primary / 3.5-B-4 aux 共通)

```text
ux_post_check_result = pass | pass_with_notes:
  add:    (なし)
  remove: pro-ux-ui-audit-needs-fix
          pro-ux-ui-audit-skipped

ux_post_check_result = block:
  add:    pro-ux-ui-audit-needs-fix
  remove: pro-ux-ui-audit-skipped

ux_post_check_result = skipped:
  add:    pro-ux-ui-audit-skipped
  remove: pro-ux-ui-audit-needs-fix
```

> **注意**: `pro-ux-ui-audit-expert` / `pro-designer-expert` (domain ラベル) は本 helper では触らない。
> `pro-ux-ui-audit-manual-override` も触らない。

### 実装テンプレ

```bash
# B1 (#395) の op pr label-transition primitive 完成により、4-3-1 と同様に
# _op_run_apply_label_set 経由の bash 実装を CLI primitive に巻き戻し置換した (Issue #577)。
#
# 注意: generic な needs:human-decision は security-post-check target の needs_human_decision result で
#       op pr label-transition が `needs:human-decision` label を追加する。security PASS だけで
#       他 domain の human-decision を剥がさないことは CLI primitive 側でも同様の方針。

apply_security_post_check_labels() {
  local pr="$1"; local result="$2"
  # 第3引数 (pre_fetched_labels) は op pr label-transition 内部で取得するため不要 (互換シグネチャとして受け取るが無視)
  # 旧 bash は "block" / "needs_human_decision" (underscore) を受け付けていたため、
  # CLI の accepted value に変換する:
  #   "block"               → "needs-fix-post-check" (security-post-check target の block 相当)
  #   "needs_human_decision"→ "needs-human-decision" (旧 bash の underscore 形式 → dash 形式)
  local cli_result="$result"
  case "$result" in
    block)             cli_result="needs-fix-post-check" ;;
    needs_human_decision) cli_result="needs-human-decision" ;;
    pass_with_notes)   cli_result="pass-with-notes" ;;
  esac
  op pr label-transition --pr "$pr" --target security-post-check --result "$cli_result"
}

# UX post-check (primary 3.5-A / aux 3.5-B-4 共通) は needs_human_decision を返さない。
# 受け付ける enum は pass / pass_with_notes / block / skipped の 4 値のみ。
apply_ux_post_check_labels() {
  local pr="$1"; local result="$2"
  # 第3引数 (pre_fetched_labels) は op pr label-transition 内部で取得するため不要 (互換シグネチャとして受け取るが無視)
  # 旧 bash は "block" / "pass_with_notes" (underscore) を受け付けていたため、CLI 値に変換する:
  #   "block"           → "needs-fix-post-check" (ux-post-check target の block 相当)
  #   "pass_with_notes" → "pass-with-notes" (旧 bash の underscore 形式 → dash 形式)
  local cli_result="$result"
  case "$result" in
    block)           cli_result="needs-fix-post-check" ;;
    pass_with_notes) cli_result="pass-with-notes" ;;
  esac
  op pr label-transition --pr "$pr" --target ux-post-check --result "$cli_result"
}
```

> **重要**: BLOCK / NEEDS_HUMAN_DECISION / SKIPPED で付与した needs-fix / skipped ラベルは、
> 再 audit が PASS / PASS_WITH_NOTES に転じた瞬間に必ず剥がす。残置すると op-merge gate 11〜18 が
> 永続的に BLOCK 状態になり、修正済み PR が merge できなくなる。
>
> 各 post-check 担当 expert (3.5-A / 3.5-B / 3.5-B-4) は **PR コメント投稿と machine-readable
> result の返却までを担当する**。label helper は op-run controller が post-check result を
> 受け取った後に必ず呼ぶ。spawn 失敗時 (3.5-A-3 / 3.5-B-3) も controller が `result=skipped` として
> 本 helper を呼ぶ。expert subagent が直接 label helper / `gh pr edit` を呼ぶことは禁止。

| 判定 → 状態遷移 | 最終 label set (排他制御後) |
|--------------------|---------------------------|
| security PASS / PASS_WITH_NOTES (前回 BLOCK) | pro-security-needs-fix / pro-security-post-check-skipped が剥がれる。generic needs:human-decision は自動 remove しない |
| security BLOCK | pro-security-needs-fix のみ |
| security NEEDS_HUMAN_DECISION | pro-security-needs-fix + needs:human-decision |
| security SKIPPED | pro-security-post-check-skipped のみ |
| UX PASS / PASS_WITH_NOTES (前回 BLOCK) | needs-fix / skipped が剥がれる |
| UX BLOCK | pro-ux-ui-audit-needs-fix のみ |
| UX SKIPPED | pro-ux-ui-audit-skipped のみ |
