<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 初版 — CLAUDE.md「bash fence convention」節を本ファイルへ移設 (Wave B3、ADR-0029 決定1)。
       移設時に不変則1 の「export すれば次 fence で必ず参照できる」前提を実挙動へ訂正:
       export の fence 間持続は環境依存 (local CLI = persistent shell で持続 / Cloud sandbox =
       呼び出しごとに shell 状態が初期化され持続しない) であり保証ではない、を正本として明記。
-->

# bash fence convention (subshell / shell 状態 drift 防止)

<!--
機能概要: OP skill 群 SKILL.md 内の prescriptive bash code fence が原因で発生する
         shell 状態 drift / 未定義変数 silent fail を構造的に予防する規約 (正本)。
作成意図: op-patrol run-2026-05-21-001 で発生した複数事故 (#377 ADR_DIR 未定義 /
         #384 FINDING_DRAFT_FILES 未定義 / #386 NEW_ISSUE_NUMS 未定義) の根本原因が
         bash fence 間の変数共有ルール不在であることが判明。convention 制定で再発防止 (Issue #399)。
         2026-07-29 に CLAUDE.md から移設 — 本ファイルが正本、CLAUDE.md 側は要旨 + pointer。
注意点: 既存 SKILL.md の retroactive 修正は本 convention の scope_out (各 Issue で個別対応)。
         本規約は documentation 層のみ。CI lint 化は将来 phase。
-->

OP skill 群 SKILL.md 内の prescriptive bash code fence (` ```bash `) は、Claude Code の
Bash tool 呼び出し (= fence) 間で **shell 状態が引き継がれない可能性がある** 前提で記述する。
複数 fence を跨いで変数を共有する場合、以下の前提と不変則を守ること。

## 前提: fence 間の shell 状態持続は環境依存 (保証ではない)

- **local CLI (persistent shell)**: export した env は fence (Bash tool 呼び出し) を跨いで持続する。
- **Cloud / sandbox session**: shell 状態が呼び出しごとに初期化され、export しても次 fence へ持続しない。

よって **「export + 受け側 `:?` ガード」を基本** としつつ、**Cloud 対応 skill・確実性が要る値は
一時ファイル経由 (`declare -p` serialize 含む) を優先する**。export 持続は環境依存であり保証ではない。
持続しない環境では受け側 `:?` ガードが fail-fast し、一時ファイルからの復元 / 同一 fence 内での
再導出で回復する構造にする。

## 不変則

**1. 明示 export + 持続を前提にしない**

fence A で定義した変数を fence B で参照する場合、fence A で `export VAR=...` を明示する。
`VAR=...` (export なし) は persistent shell 環境でも subshell 内ローカル扱いとなり、次 fence で空展開される。
ただし export しても fence 間持続は環境依存 (上記前提) のため、**export を「必ず渡る」前提で
後続 fence を書いてはならない** — 受け側 `:?` ガード (不変則2) を必ず併用し、確実性が要る値は
一時ファイル経由 (不変則3 の受け渡しパターンと同型) を優先する。

```bash
# NG: 次 fence で ADR_DIR が空になる (persistent shell でも渡らない)
ADR_DIR="$(git rev-parse --show-toplevel)/docs/adr"

# OK: persistent shell 環境では次 fence でも参照できる (ただし環境依存 — 受け側 :? guard 必須)
export ADR_DIR="$(git rev-parse --show-toplevel)/docs/adr"
```

**2. `:?` ガード必須 (受け側 fence での fail-fast)**

受け側 fence では `: "${VAR:?error message}"` で未定義 / 空文字列を検出して即停止する。
silent fail を防ぎ、根本原因 (= 変数が伝わっていない) を早期に発見できる。
export 持続が保証されない (前提節) ため、fence を跨ぐ受け側での本ガードは必須とする。

```bash
# 受け側 fence の冒頭で guard
: "${ADR_DIR:?ADR_DIR must be set — フェーズ0 で確定した ADR フォルダパス}"
ADR_FILE="${ADR_DIR}/${NNNN}-${SLUG}.md"
```

**3. command substitution 並列化禁止**

`RESULT=$(...)` で取得した値を background `&` で並列化する場合、`$(...)` 内の変数は
**subshell 内ローカル** であり親 shell に戻らない。並列化が必要な場合は **一時ファイル経由** で値を受け渡す。

```bash
# NG: subshell 変数空問題 — RESULT が親 shell に戻らない (memory feedback_gh_issue_create_background 参照)
for ITEM in "${ITEMS[@]}"; do
  RESULT=$(some_command "$ITEM") &
done
wait

# OK: 一時ファイル経由で値を受け渡す
TMP_DIR=$(mktemp -d)
for ITEM in "${ITEMS[@]}"; do
  some_command "$ITEM" > "$TMP_DIR/$ITEM.out" &
done
wait
for f in "$TMP_DIR"/*.out; do
  # $f を読んで処理する
  :
done
rm -rf "$TMP_DIR"
```

特に `gh issue create` の並列化は **重複起票事故** の原因になる (memory `feedback_gh_issue_create_background`)。
`gh issue create` は直列実行を原則とし、並列化が必要な場合も一時ファイル経由で URL を受け渡すこと。

> **一時ファイル経由の補足**: 連想配列 / 複数変数は `declare -p VAR1 VAR2 > "$TMP"` で serialize し、
> 受け側 fence で `:?` ガード後に `source "$TMP"` で復元するパターンを推奨する
> (連想配列はそもそも export で渡せない。実例: `skills/op-architect/SKILL.md` の Pass 1 → Pass 2 受け渡し)。

**4. 配列初期化必須**

bash 配列は **使用前に必ず初期化** する。未定義配列の `${ARR[@]}` 展開は空 (引数 0 個) で
silent 通過し、後続処理が意図しない動作になる。

```bash
# NG: 初期化なし — 未定義配列の展開は silent 通過
for f in "${FINDING_DRAFT_FILES[@]}"; do ...

# OK: 使用前に初期化する
FINDING_DRAFT_FILES=()
# ... ファイルを追加する処理 ...
for f in "${FINDING_DRAFT_FILES[@]}"; do ...
```

## 関連事故記録 (memory)

- `feedback_gh_issue_create_background`: 並列化 subshell 変数空 → 重複起票 8 件 (2026-05-17)
- `feedback_apply_commit_skip_recurrence_20260519`: commits_added schema 違反
- `feedback_root_cause_via_implementation_read`: shallow RCA 防止

## 構造的代替 (推奨)

可能であれば bash fence 自体を `op` CLI primitive に置換する (`op-tools/docs/implementation-order.md` 参照)。
bash 依存が消えれば本 convention 違反も構造的に発生しない。
