<!--
schema_version: 2
last_breaking_change: 2026-05-23
notes: v2 (2026-05-23) — Issue #436 対応。
       pr-extract-post-check-meta / pr-validate-manual-override の 2 CLI primitive を
       op-tools crates/op/src/commands/pr.rs に追加。
       bash helper 群の上位互換 Rust 実装が完成したため、
       新規 SKILL.md はこれら CLI を優先使用することを推奨する (§7 参照)。
       旧 bash helper (§1-§6) は後方互換のために残すが、
       op-tools CLI が利用可能な環境では Rust 実装を使用すること。
       v1 (2026-05-17) — op-merge/SKILL.md (L188-560) に置かれていた PR メタ抽出 helper 群を
       Single Canonical Source Rule に従い canonical 化した初版。
       op-merge は Phase B (#125) で本ファイルへの pointer 置換を行う。
       将来の helper 変更時は schema_version を bump し、参照する全 SKILL.md の (>=N) 表記を確認すること。

機能概要:
  PR コメントから trusted author の review meta / post-check meta / manual override block を
  抽出する bash helper 群の canonical 仕様・実装を集約する。
  op-merge / op-scan / op-patrol など複数 OP skill が同一 helper を再利用できるよう
  Single Canonical Source として _shared/ に配置する。

作成意図:
  op-merge/SKILL.md に helper 実装が存在していたが、op-scan の --from-merged-pr モード追加など
  他 OP skill からの再利用需要が生じた。helper 群を _shared/ に昇格し、silent fork を防止する。
  Phase A は canonical 化 (本ファイル新規作成のみ)、Phase B (#125) で op-merge を pointer 化する。

注意点:
  - 全 helper は TRUSTED_AUTHORS_JSON が事前にセットされていることを前提とする。
    呼び出し側 (op-merge Phase 1 / Phase 3 final gate 等) で 1 回だけ解決すること。
    helper 内部での再解決は禁止 (重複 init 禁止)。
  - bash sample の indent / escape は op-merge/SKILL.md (L217-560) と完全一致を保つ。
    Phase B の pointer 置換時に grep で一致検証する前提。
  - canonical 正本は本ファイル。op-merge/SKILL.md は Phase B 以降 pointer に降格する。
-->

# PR Meta Helpers

/**
 * 機能概要: PR コメントから trusted author の review meta / post-check meta / manual override block を
 *           抽出する bash helper 群の canonical 仕様。
 * 作成意図: op-merge/SKILL.md に存在していた helper 実装を Single Canonical Source に昇格。
 *           op-scan 等の他 OP skill が再利用できる共有基盤とする。
 * 注意点: TRUSTED_AUTHORS_JSON の事前解決は呼び出し側の責務。本 helper 群は内部で解決しない。
 */

> **historical reference 降格 (2026-05-30, Issue #438 op-merge wave)**:
> op-merge gate 1-21 (review-meta / post-check-meta 抽出 + manual override 10-AND 評価を含む) は
> `op merge verify` (Rust 実装、`op_core::merge::*`) に集約された。op-merge/SKILL.md は本ファイルの
> bash helper (§1-§6) を **もう直接呼ばない** (gate 判定 1 呼び出し = `op merge verify` に内包)。
> 本ファイルの bash helper 群は後方互換 / 他 OP skill の部分利用のために残置するが、**新規 OP skill 開発時は
> §7 の Rust CLI primitive (`op merge verify` / `op pr extract-post-check-meta` /
> `op pr validate-manual-override`) を優先**し、bash helper を新たに call site に増やさないこと。

---

## § 1 前提: TRUSTED_AUTHORS_JSON の解決

全 helper (`extract_latest_trusted_review_meta` / `extract_latest_trusted_post_check_meta` /
`has_valid_manual_override`) は `TRUSTED_AUTHORS_JSON` を前提に動作する。
呼び出し側で **helper を呼ぶ前に 1 回だけ** 解決しておくこと。複数フェーズで同じ値を再利用するため、解決後は再代入しない (重複 init 禁止)。

```bash
# TRUSTED_REVIEW_AUTHORS / TRUSTED_AUTHORS_JSON は Phase 1 / Phase 3 final gate /
# Review Fix Loop で共通使用する。helper を呼ぶ前にここで 1 回だけ解決する。
# #54 修正: DEFAULT を常に含める additive 方式に変更。
#   - OP_TRUSTED_REVIEW_AUTHORS_EXTRA が設定されていれば union 追加 (推奨)。
#   - 旧 OP_TRUSTED_REVIEW_AUTHORS が設定されていれば deprecation warning + 互換受け入れ。
TRUSTED_REVIEW_AUTHORS_DEFAULT="github-actions[bot] claude-bot op-bot"
TRUSTED_REVIEW_AUTHORS="${TRUSTED_REVIEW_AUTHORS_DEFAULT}"
if [ -n "${OP_TRUSTED_REVIEW_AUTHORS_EXTRA:-}" ]; then
  TRUSTED_REVIEW_AUTHORS="${TRUSTED_REVIEW_AUTHORS} ${OP_TRUSTED_REVIEW_AUTHORS_EXTRA}"
fi
if [ -n "${OP_TRUSTED_REVIEW_AUTHORS:-}" ]; then
  echo "警告: OP_TRUSTED_REVIEW_AUTHORS は廃止予定。OP_TRUSTED_REVIEW_AUTHORS_EXTRA を使用してください。" >&2
  TRUSTED_REVIEW_AUTHORS="${TRUSTED_REVIEW_AUTHORS} ${OP_TRUSTED_REVIEW_AUTHORS}"
fi
REPO_OWNER=$(gh repo view --json owner --jq '.owner.login' 2>/dev/null || echo "")
if [ -n "$REPO_OWNER" ]; then
  TRUSTED_REVIEW_AUTHORS="${TRUSTED_REVIEW_AUTHORS} ${REPO_OWNER}"
fi
TRUSTED_AUTHORS_JSON=$(printf '%s\n' $TRUSTED_REVIEW_AUTHORS | jq -R . | jq -s .)
```

---

## § 2 `extract_latest_trusted_review_meta`

### 仕様

| 項目 | 内容 |
|------|------|
| **目的** | `<!-- op-review-meta -->` block から review meta を抽出する |
| **引数** | `$1` = PR 番号 |
| **戻り値** | 改行区切り 8 行 (フェーズ3 final gate の `IFS= read` 8 行読みと完全一致) |
| **依存変数** | `TRUSTED_AUTHORS_JSON` (呼び出し側で事前解決済みであること) |
| **失敗時挙動** | 該当 block が存在しない / trusted author がいない場合は空行 8 行を返す |

出力行 (順序固定):

```
1: review_result
2: reviewed_head_sha
3: review_round
4: max_review_fix_rounds
5: reviewer
6: global_review_expert
7: review_comment_origin
8: op_run_session_id
```

設計意図: Phase 1 (一覧表示用 sha 取得) と Phase 3 (final gate) で同一 helper を共有することで、
forge / origin / session_id 防御が単一実装に集約される (重複 inline awk を排除)。

### 実装

```bash
# helper: フェーズ1 / フェーズ3 (final gate) で共通利用する trusted review meta 抽出。
# 出力 (改行区切り 8 行、フェーズ3 final gate の `IFS= read` 8 行読みと完全一致):
#   1: review_result
#   2: reviewed_head_sha
#   3: review_round
#   4: max_review_fix_rounds
#   5: reviewer
#   6: global_review_expert
#   7: review_comment_origin
#   8: op_run_session_id
#
# 前提: TRUSTED_AUTHORS_JSON が事前にセットされていること
# (上記 "helper 共通前提: TRUSTED_AUTHORS / TRUSTED_AUTHORS_JSON の解決" を参照)。
#
# 設計意図: Phase 1 (一覧表示用 sha 取得) と Phase 3 (final gate) で同一 helper を共有することで、
#           forge / origin / session_id 防御が単一実装に集約される (重複 inline awk を排除)。
extract_latest_trusted_review_meta() {
  local pr_num="$1"

  gh pr view "$pr_num" --json comments |
  jq -r --argjson allowed "$TRUSTED_AUTHORS_JSON" '
    .comments
    | map(select(.author.login as $a | $allowed | index($a)))
    | map(select(.body | contains("<!-- op-review-meta -->")))
    | sort_by(.createdAt)
    | .[].body
  ' |
  awk '
    /<!-- op-review-meta -->/ { in_block = 1; delete cur; next }
    in_block && /^[[:space:]]*$/ { in_block = 0; for (k in cur) last[k] = cur[k]; next }
    in_block && /^<!--/ { in_block = 0; for (k in cur) last[k] = cur[k]; next }
    in_block {
      if (match($0, /^[a-z_]+:[[:space:]]*/)) {
        k = substr($0, 1, index($0, ":") - 1)
        v = substr($0, index($0, ":") + 1)
        sub(/^[[:space:]]+/, "", v)
        sub(/[[:space:]]+$/, "", v)
        cur[k] = v
      }
    }
    END {
      if (in_block) for (k in cur) last[k] = cur[k]
      printf "%s\n", (last["review_result"] ? last["review_result"] : "")
      printf "%s\n", (last["reviewed_head_sha"] ? last["reviewed_head_sha"] : "")
      printf "%s\n", (last["review_round"] ? last["review_round"] : "")
      printf "%s\n", (last["max_review_fix_rounds"] ? last["max_review_fix_rounds"] : "")
      printf "%s\n", (last["reviewer"] ? last["reviewer"] : "")
      printf "%s\n", (last["global_review_expert"] ? last["global_review_expert"] : "")
      printf "%s\n", (last["review_comment_origin"] ? last["review_comment_origin"] : "")
      printf "%s\n", (last["op_run_session_id"] ? last["op_run_session_id"] : "")
    }
  '
}
```

---

## § 3 `extract_latest_trusted_post_check_meta`

### 仕様

| 項目 | 内容 |
|------|------|
| **目的** | `<!-- op-security-post-check -->` / `<!-- op-ux-ui-audit -->` 直後の `<!-- op-post-check-meta -->` block を抽出する |
| **引数** | `$1` = PR 番号 / `$2` = outer header (例: `op-security-post-check` / `op-ux-ui-audit`) |
| **戻り値** | 改行区切りで `key=value` 形式 (key は英小文字 + アンダースコア)。値が空のキーは出力しない |
| **依存変数** | `TRUSTED_AUTHORS_JSON` (呼び出し側で事前解決済みであること) |
| **失敗時挙動** | 該当 block が存在しない / trusted author がいない場合は空文字列を返す |

選択方針 (重要):
- trusted author の outer header コメントを createdAt 昇順 sort し、最後の 1 件 (= 最新 attempt) のみを meta 抽出対象とする
- 過去に valid な post-check があっても、最新 attempt が malformed なら fail-closed で gate 失敗扱い
- merge gate は「最新 attempt が信頼できなければ通さない」を意図しており、過去 valid を採用する fallback は行わない

Provenance / forge 防止:
- trusted author の最新コメントだけを採用する (op-review-meta と同じ TRUSTED_AUTHORS_JSON を流用)
- 外部 header (`<!-- op-security-post-check -->` / `<!-- op-ux-ui-audit -->`) を **そのコメント本文に含む** 場合のみ対象にする (汎用 `<!-- op-post-check-meta -->` 単独の comment を gate 判定に使うことを禁止)
- その header と同じコメント内の `<!-- op-post-check-meta -->` ブロックだけ抽出する (header-anchored 強制)

meta block の終端: `<!-- /op-post-check-meta -->`、空行、別の `<!--` 行、または `## ` 見出しで終わる。

後続 helper で取り出す場合は `get_meta()` を使う。

### 実装

```bash
# helper: フェーズ3 final gate で共通利用する trusted post-check meta 抽出。
# (security post-check / UX post-check / aux UX post-check のすべてで共通使用)
#
# 出力: 改行区切りで `key=value` 形式 (key は英小文字 + アンダースコア)。
# 値が空のキーは出力しない。後続 helper get_meta() で取り出す。
#
# args:
#   $1 = PR number
#   $2 = outer header (例: "op-security-post-check" / "op-ux-ui-audit")
#
# 前提:
#   - TRUSTED_AUTHORS_JSON が事前にセットされていること
#     (フェーズ3 の trusted author 解決ブロックを参照)。
#
# 選択方針 (重要):
#   trusted author の outer header コメントを createdAt 昇順 sort し、最後の 1 件 (= 最新 attempt) のみを meta 抽出対象とする。
#   過去に valid な post-check があっても、最新 attempt が malformed なら fail-closed で gate 失敗扱い。
#   merge gate は「最新 attempt が信頼できなければ通さない」を意図しており、過去 valid を採用する fallback は行わない。
#   後続の helper (gate 14e / 16a / 13a / 13c) は、empty / non-canonical な値を fail として扱うことでこの方針を強制する。
#
# 重要 (provenance / forge 防止):
#   - trusted author の最新コメントだけを採用する
#     → op-review-meta と同じ TRUSTED_AUTHORS_JSON を流用
#   - 外部 header (`<!-- op-security-post-check -->` / `<!-- op-ux-ui-audit -->`) を
#     **そのコメント本文に含む** 場合のみ対象にする
#     → 汎用 `<!-- op-post-check-meta -->` 単独の comment を gate 判定に使うことを禁止する
#   - その header と同じコメント内の `<!-- op-post-check-meta -->` ブロックだけ抽出する
#     → header と meta block の対応 (header-anchored) を強制
#   - meta block は `<!-- /op-post-check-meta -->`、空行、別の `<!--` 行、または
#     `## ` 見出しで終わる
extract_latest_trusted_post_check_meta() {
  local pr_num="$1"
  local outer_header="$2"

  gh pr view "$pr_num" --json comments |
  jq -r --argjson allowed "$TRUSTED_AUTHORS_JSON" --arg outer "<!-- $outer_header -->" '
    .comments
    | map(select(.author.login as $a | $allowed | index($a)))
    | map(select(.body | contains($outer)))
    | sort_by(.createdAt)
    | last
    | .body // ""
  ' |
  awk '
    BEGIN { in_meta = 0 }
    /<!-- op-post-check-meta -->/ {
      in_meta = 1
      delete cur
      next
    }
    in_meta && /<!-- \/op-post-check-meta -->/ {
      in_meta = 0
      for (k in cur) last[k] = cur[k]
      next
    }
    in_meta && /^[[:space:]]*$/ {
      in_meta = 0
      for (k in cur) last[k] = cur[k]
      next
    }
    in_meta && /^<!--/ {
      in_meta = 0
      for (k in cur) last[k] = cur[k]
      next
    }
    in_meta && /^##/ {
      in_meta = 0
      for (k in cur) last[k] = cur[k]
      next
    }
    in_meta {
      if (match($0, /^[a-z_]+:[[:space:]]*/)) {
        k = substr($0, 1, index($0, ":") - 1)
        v = substr($0, index($0, ":") + 1)
        sub(/^[[:space:]]+/, "", v)
        sub(/[[:space:]]+$/, "", v)
        cur[k] = v
      }
    }
    END {
      if (in_meta) for (k in cur) last[k] = cur[k]
      for (k in last) if (last[k] != "") print k "=" last[k]
    }
  '
}
```

---

## § 4 `get_meta`

### 仕様

| 項目 | 内容 |
|------|------|
| **目的** | `extract_latest_trusted_post_check_meta` の出力 (`key=value` 改行区切り文字列) から特定 key の値を取り出す |
| **引数** | `$1` = key=value の改行区切り文字列 / `$2` = key 名 |
| **戻り値** | 対応する value の文字列。値が無ければ空文字を返す |
| **依存変数** | なし |
| **失敗時挙動** | key が存在しない場合は空文字を返す (エラーなし) |

### 実装

```bash
# helper: extract_latest_trusted_post_check_meta の出力 (key=value) から特定 key の値を取り出す。
# 値が無ければ空文字を返す。
#
# args:
#   $1 = key=value の改行区切り文字列
#   $2 = key 名
get_meta() {
  printf '%s\n' "$1" | awk -F'=' -v k="$2" '$1 == k { sub(/^[^=]*=/, ""); print; exit }'
}
```

---

## § 5 `has_valid_manual_override`

### 仕様

| 項目 | 内容 |
|------|------|
| **目的** | manual override block (label + block の AND 条件) を 10-AND で評価する |
| **引数** | `$1` = target (`ux-ui-post-check` または `security-post-check`) / `$2` = expected_head_sha (現在の PR `headRefOid`) |
| **戻り値** | 全 10 条件 AND を満たせば標準出力に `true` を 1 行、いずれか fail なら `false` を 1 行 |
| **依存変数** | `TRUSTED_AUTHORS_JSON` / `LABELS` (呼び出し側で事前解決済みであること) / `PR_NUM` (呼び出し側でセット済みであること) |
| **失敗時挙動** | 各条件の fail 理由を stderr に 1 行出力し、stdout に `false` を返す |

機能概要:
- gate 12〜13 / 15〜16 / 17 / 18 で manual override 適用可否を判定する
- `_shared/markers/merge-gate-markers.md (>=2)` の has_valid_manual_override 節 (10-条件 AND pseudocode) を bash 化したもの。canonical 正本は同 markers ドキュメントであり、本実装は spec 追従の評価器に過ぎない

作成意図:
- 旧実装は `! grep -qx "<label>"` の label-only check で gate を全 skip しており、label 単独で security / UX gate を構造的に bypass できる重大な抜け穴があった
- 本関数は label + trusted-author block + 全フィールド充足 + reviewed_head_sha 一致までを AND で揃えた場合のみ true を返し、label-only bypass を完全に拒否する

target → label 名 マッピング:

| target | expected_label |
|--------|---------------|
| `ux-ui-post-check` | `pro-ux-ui-audit-manual-override` |
| `security-post-check` | `pro-security-post-check-manual-override` |

10 条件 AND (canonical pseudocode は `_shared/markers/merge-gate-markers.md (>=2)` を参照):

1. 対応する manual-override label が PR に付与されている
2. PR comments または PR body に `<!-- op-manual-override -->` block が存在する
3. block の投稿者が trusted author (TRUSTED_AUTHORS_JSON) である
4. block の `override_target` が expected_label と一致する
5. `reason` が non-empty
6. `approver` が non-empty
7. `approver` が trusted author に含まれる (`@username` 形式 / bare username 両対応)
8. `followup_issue` が `#<整数>` 形式かつ実在する Issue を参照
9. `overridden_at` が ISO8601 形式 (YYYY-MM-DDTHH:MM:SS...)
10. `reviewed_head_sha` が 40-hex かつ expected_head_sha と一致 (stale でない)

注意点:
- block は PR comments と PR body の両方を探索する (canonical schema 上 PR body も許容)
- PR body の場合、投稿者は PR author として扱う
- 同 target に複数 block がある場合は最新 createdAt (PR body は PR comments とフォールバック比較し、最終的には最新の trusted block 1 件を採用) で 1 件採用

### 実装

```bash
# helper: manual override block (label + block の AND 条件) を 10-AND で評価する。
#
# 機能概要:
#   gate 12〜13 / 15〜16 / 17 / 18 で manual override 適用可否を判定する。
#   `_shared/markers/merge-gate-markers.md (>=2)` の has_valid_manual_override 節
#   (10-条件 AND pseudocode) を bash 化したもの。canonical 正本は同 markers
#   ドキュメントであり、本実装は spec 追従の評価器に過ぎない。
#
# 作成意図:
#   旧実装は `! grep -qx "<label>"` の label-only check で gate を全 skip しており、
#   label 単独で security / UX gate を構造的に bypass できる重大な抜け穴があった。
#   本関数は label + trusted-author block + 全フィールド充足 + reviewed_head_sha 一致
#   までを AND で揃えた場合のみ true を返し、label-only bypass を完全に拒否する。
#
# 注意点:
#   - 入力 target は "ux-ui-post-check" / "security-post-check" の 2 値。
#     block の `override_target` は label 名 (`pro-*-manual-override`) で記録されているため、
#     内部で target → label 名のマッピングを行う。
#   - block は PR comments と PR body の両方を探索する (canonical schema 上 PR body も許容)。
#     PR body の場合、投稿者は PR author として扱う。
#   - 同 target に複数 block がある場合は最新 (PR comments の createdAt 降順、それでも無ければ PR body) で 1 件採用。
#   - TRUSTED_AUTHORS_JSON が事前にセットされていること。フェーズ3 の trusted author 解決
#     ブロックを参照。
#   - 全 10 条件 AND を満たせば標準出力に `true` を 1 行、いずれか fail なら `false` を 1 行。
#     fail 理由は stderr に 1 行で出す (gate 評価ループ側がそのまま echo できる形)。
#
# args:
#   $1 = target ("ux-ui-post-check" or "security-post-check")
#   $2 = expected_head_sha (現在の PR `headRefOid`)
has_valid_manual_override() {
  local target="$1"
  local expected_head_sha="$2"
  local expected_label
  case "$target" in
    ux-ui-post-check)    expected_label="pro-ux-ui-audit-manual-override" ;;
    security-post-check) expected_label="pro-security-post-check-manual-override" ;;
    *)
      echo "has_valid_manual_override: unknown target=$target" >&2
      echo "false"
      return 0
      ;;
  esac

  # 条件 1: 対応する manual-override label が PR に付与されている
  if ! echo "$LABELS" | grep -qx "$expected_label"; then
    echo "manual override invalid: label '$expected_label' not present" >&2
    echo "false"
    return 0
  fi

  # 条件 2: trusted author 投稿の `<!-- op-manual-override -->` block を抽出する
  #   - PR comments: trusted author の最新コメントから block を取り出す
  #   - PR body: PR author 投稿として扱い、PR author が trusted author に含まれる場合のみ採用
  #   block の `override_target` は expected_label (= label 名) と一致するもののみ拾う。
  #   複数 block がある場合は最新 (PR comments の createdAt 降順、それでも無ければ PR body) で 1 件採用。
  local pr_view
  pr_view=$(gh pr view "$PR_NUM" --json comments,body,author 2>/dev/null)
  if [ -z "$pr_view" ]; then
    echo "manual override invalid: failed to fetch PR view" >&2
    echo "false"
    return 0
  fi

  # PR comments から trusted author 投稿で expected_label を override_target に持つ最新 block 本文を抽出
  local block_body
  block_body=$(printf '%s\n' "$pr_view" | jq -r \
    --argjson allowed "$TRUSTED_AUTHORS_JSON" \
    --arg target_label "$expected_label" '
    .comments
    | map(select(.author.login as $a | $allowed | index($a)))
    | map(select(.body | contains("<!-- op-manual-override")))
    | map(select(.body | test("override_target:\\s*" + $target_label)))
    | sort_by(.createdAt)
    | last
    | .body // ""
  ')

  # PR comments で見つからなければ PR body を確認 (PR author が trusted author の場合のみ)
  if [ -z "$block_body" ]; then
    block_body=$(printf '%s\n' "$pr_view" | jq -r \
      --argjson allowed "$TRUSTED_AUTHORS_JSON" \
      --arg target_label "$expected_label" '
      if (.author.login as $a | $allowed | index($a))
         and (.body | contains("<!-- op-manual-override"))
         and (.body | test("override_target:\\s*" + $target_label))
      then .body
      else ""
      end
    ')
  fi

  if [ -z "$block_body" ]; then
    echo "manual override invalid: no trusted-author block with override_target=$expected_label found" >&2
    echo "false"
    return 0
  fi

  # block 本文から各フィールドを抽出 (block 開始 `<!-- op-manual-override` から `-->` まで)
  local fields_kv
  fields_kv=$(printf '%s\n' "$block_body" | awk '
    BEGIN { in_block = 0 }
    /<!-- op-manual-override/ { in_block = 1; next }
    in_block && /-->/ { in_block = 0; next }
    in_block {
      if (match($0, /^[a-z_]+:[[:space:]]*/)) {
        k = substr($0, 1, index($0, ":") - 1)
        v = substr($0, index($0, ":") + 1)
        sub(/^[[:space:]]+/, "", v)
        sub(/[[:space:]]+$/, "", v)
        print k "=" v
      }
    }
  ')

  local override_target reason approver followup_issue overridden_at reviewed_head_sha
  override_target=$(get_meta "$fields_kv" override_target)
  reason=$(get_meta "$fields_kv" reason)
  approver=$(get_meta "$fields_kv" approver)
  followup_issue=$(get_meta "$fields_kv" followup_issue)
  overridden_at=$(get_meta "$fields_kv" overridden_at)
  reviewed_head_sha=$(get_meta "$fields_kv" reviewed_head_sha)

  # 条件 4: override_target が expected_label と一致
  # (条件 3 trusted-author 検証は block_body 抽出時の jq filter で完結している)
  if [ "$override_target" != "$expected_label" ]; then
    echo "manual override invalid: override_target=${override_target:-<empty>} != $expected_label" >&2
    echo "false"
    return 0
  fi

  # 条件 5: reason non-empty
  if [ -z "$reason" ]; then
    echo "manual override invalid: reason is empty" >&2
    echo "false"
    return 0
  fi

  # 条件 6: approver non-empty
  if [ -z "$approver" ]; then
    echo "manual override invalid: approver is empty" >&2
    echo "false"
    return 0
  fi

  # 条件 7: approver が trusted author に含まれる
  #   approver は `@username` 形式 / bare username 両対応。先頭 `@` を除去して TRUSTED_AUTHORS_JSON と照合。
  local approver_normalized
  approver_normalized=$(printf '%s' "$approver" | sed 's/^@//')
  if ! printf '%s\n' "$TRUSTED_AUTHORS_JSON" | jq -e --arg a "$approver_normalized" 'index($a) != null' >/dev/null 2>&1; then
    echo "manual override invalid: approver=$approver_normalized is not a trusted author" >&2
    echo "false"
    return 0
  fi

  # 条件 8: followup_issue が `#<int>` 形式かつ実在する
  if ! printf '%s' "$followup_issue" | grep -Eq '^#[1-9][0-9]*$'; then
    echo "manual override invalid: followup_issue=${followup_issue:-<empty>} is not in '#<int>' form" >&2
    echo "false"
    return 0
  fi
  local followup_num
  followup_num=$(printf '%s' "$followup_issue" | tr -d '#')
  if ! gh issue view "$followup_num" --json number >/dev/null 2>&1; then
    echo "manual override invalid: followup_issue $followup_issue does not exist" >&2
    echo "false"
    return 0
  fi

  # 条件 9: overridden_at が ISO8601 形式 (簡易 regex: YYYY-MM-DDTHH:MM:SS...)
  if ! printf '%s' "$overridden_at" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}'; then
    echo "manual override invalid: overridden_at=${overridden_at:-<empty>} is not ISO8601" >&2
    echo "false"
    return 0
  fi

  # 条件 10: reviewed_head_sha が 40-hex かつ expected_head_sha と一致 (stale でない)
  if ! printf '%s' "$reviewed_head_sha" | grep -Eq '^[0-9a-f]{40}$'; then
    echo "manual override invalid: reviewed_head_sha=${reviewed_head_sha:-<empty>} is not 40-hex" >&2
    echo "false"
    return 0
  fi
  if [ "$reviewed_head_sha" != "$expected_head_sha" ]; then
    echo "manual override invalid: stale reviewed_head_sha=${reviewed_head_sha:0:7} != current=${expected_head_sha:0:7}" >&2
    echo "false"
    return 0
  fi

  echo "true"
  return 0
}
```

---

## § 6 利用側契約

### 呼び出し側が満たすべき前提条件

| 変数 | 必須 | 解決タイミング | 用途 |
|------|------|--------------|------|
| `TRUSTED_AUTHORS_JSON` | 全 helper | helper 呼び出し前に 1 回だけ解決 | trusted author フィルタ |
| `LABELS` | `has_valid_manual_override` のみ | helper 呼び出し前に解決 | label-only bypass 防止の条件 1 |
| `PR_NUM` | `has_valid_manual_override` のみ | helper 呼び出し前に解決 | PR 取得の対象番号 |

### 推奨呼び出しパターン (op-merge での利用例)

```bash
# § 1 の手順で TRUSTED_AUTHORS_JSON を解決後、以下のように呼び出す

# review meta を 8 行読み込む
review_meta=$(extract_latest_trusted_review_meta "$PR_NUM")
review_result=$(printf '%s\n' "$review_meta" | sed -n '1p')
reviewed_head_sha=$(printf '%s\n' "$review_meta" | sed -n '2p')

# post-check meta を取り出す
post_check_kv=$(extract_latest_trusted_post_check_meta "$PR_NUM" "op-security-post-check")
security_result=$(get_meta "$post_check_kv" security_result)

# manual override を評価する
override_valid=$(has_valid_manual_override "security-post-check" "$head_sha")
```

### Phase B 移行後の契約

Phase B (#125) で op-merge/SKILL.md の helper 実装が本ファイルへの pointer に置き換えられる。
以降、全 OP skill は本ファイルの実装を参照すること。実装の変更は本ファイルにのみ加え、
schema_version を bump して参照側の `(>=N)` 表記を確認する。

参照形式:

```
skills/_shared/pr-meta-helpers.md (>=1)
```

---

## § 7 Rust CLI 移行ガイド (旧 §8)

op-tools が利用可能な環境では、bash helper の代わりに以下の Rust CLI primitive を優先使用すること。

### § 7.1 post-check meta 抽出

bash helper `extract_latest_trusted_post_check_meta` の代替:

```bash
# op pr extract-post-check-meta で HTML アンカー直下の YAML block を KV map として取得
RESULT=$(op pr extract-post-check-meta --pr "${PR_NUMBER}" --header op-post-check-meta)
FOUND=$(echo "${RESULT}" | jq -r '.details.found')
if [ "${FOUND}" = "true" ]; then
  POST_CHECK_RESULT=$(echo "${RESULT}" | jq -r '.details.fields.post_check_result')
  POST_CHECK_EXPERT=$(echo "${RESULT}" | jq -r '.details.fields.post_check_expert')
  POST_CHECKED_HEAD_SHA=$(echo "${RESULT}" | jq -r '.details.fields.post_checked_head_sha')
fi
```

spec: `op-tools/docs/specs/pr-extract-post-check-meta.md`

### § 7.2 manual override 検証

bash helper `has_valid_manual_override` の代替:

```bash
# op pr validate-manual-override で 10 条件 AND 評価
OVERRIDE_RESULT=$(op pr validate-manual-override \
  --pr "${PR_NUMBER}" \
  --target security-post-check \
  --head-sha "${HEAD_SHA}")
OVERRIDE_DECISION=$(echo "${OVERRIDE_RESULT}" | jq -r '.decision')
if [ "${OVERRIDE_DECISION}" = "block" ]; then
  echo "${OVERRIDE_RESULT}" | jq -r '.details.reasons[]' >&2
  exit 1
fi
```

spec: `op-tools/docs/specs/pr-validate-manual-override.md`

### § 7.3 対応表

| bash helper | Rust CLI primitive |
|---|---|
| `extract_latest_trusted_post_check_meta` | `op pr extract-post-check-meta --header op-post-check-meta` |
| `has_valid_manual_override` (security) | `op pr validate-manual-override --target security-post-check` |
| `has_valid_manual_override` (ux-ui) | `op pr validate-manual-override --target ux-ui-audit` |

**注意 (PR #462 RVW-009 fix)**: `extract_latest_trusted_review_meta` を
`op pr extract-post-check-meta --header op-review-meta` で代替する誤誘導は削除。
bash helper § 2 は改行区切り 8 行出力 + createdAt 昇順 sort + last 1 件採用という
**専用挙動** を持ち、`extract-post-check-meta` (JSON envelope + 先頭 hit 採用) で代替できない:

- 出力形式: 8 行 plain text (順序固定) vs JSON envelope
- 選択方針: createdAt 昇順 last vs 先頭 hit (createdAt 逆順 first を実装上は採用するが
  bash と異なる選択経路を辿る可能性あり)
- caller が `IFS= read -r` で 8 行読みする call site が複数あり、移行には別 subcommand
  (`op pr extract-review-meta` 等) の新設が必要

→ 代替 CLI primitive が存在するまで `extract_latest_trusted_review_meta` の bash 実装を
そのまま使うこと。Rust CLI 化は別 Issue として独立起票する。

参照形式 (v2 以降):

```
skills/_shared/pr-meta-helpers.md (>=2)
```
