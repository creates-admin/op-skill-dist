# op-run: Issue 健全性チェックと正規化委譲 (フェーズ1.5)

1-1 (Issue 取得) と 1-2 (クラスタリング) の間で、実装に足る指示を持つ Issue だけをクラスタリングに進める。

## 1.5-1. 健全性判定

Issue ごとに CLI で判定する (判定基準の正本は CLI):

```bash
jq -n --argjson n "$N" --arg title "$TITLE" --arg body "$BODY" --argjson labels "$LABELS_JSON" \
  '{issue_number:$n, title:$title, body:$body, labels:$labels}' | op run issue-health --stdin
# payload: health (complete|partial|insufficient) / missing_sections / next_action / rationale
```

| health | 基準 (要約) | 対応 |
|------|---------|------|
| `complete` | 見出し「概要 / 触ってよいファイル / 成功条件」が揃い、症状記述がある | そのまま 1-2 へ |
| `partial` | 見出しの一部欠落、または症状記述なし | op-scan `--from-issue` に委譲 (1.5-2) |
| `insufficient` | 本文 100 文字未満 (fail-closed)、または見出しも症状記述も無い | 投げ返し (1.5-3) |

本文 30 語未満は 1 段階下がる。

### 1.5-1-b. 未トリアージ Issue の soft nudge

1.5-1 で読んだ本文に `op-spec-ref` marker が無い Issue を未トリアージとして数え、**2 件以上** のときだけ
plan の「健全性チェック結果」節に次の 1 行を出す (文言の正本はここ):

> ℹ️ 未トリアージ Issue が <N> 件あります (op-spec verdict 未付与)。方向性を先に固めるなら /op-spec を推奨します (このまま実行も可・続行が既定)。

- 情報出力のみ。block しない・キューから外さない・manual_review_bucket にも入れない。
- `--auto` では出さない。

## 1.5-2. partial Issue の op-scan 委譲

| モード | 動作 |
|-------|------|
| 対話 (default) | partial 一覧を提示 → 承認後に委譲 → 完了を待って派生 Issue を取り込む |
| `--auto` | 委譲せず `requires-normalization` ラベルを付けて除外 |
| `--auto --normalize` | 委譲・待機・取り込みまで自動 |
| `--no-wait-normalize` | 委譲だけして今回は除外 (次回 op-run で派生 Issue を拾う) |

委譲: partial Issue ごとに `Skill({skill: "op-skill:op-scan", args: "--from-issue <N> [--auto]"})` (`--auto` は `--auto --normalize` 時のみ)。

対話モードの提示例:

```
## op-run 健全性チェック結果
### このままクラスタリング (3 件): #87 #88 #89
### 正規化が必要 (2 件) — op-scan --from-issue に委譲
- #42 "ログイン画面で時々落ちる" (missing: 触ってよいファイル, 完成定義)
### 投げ返し (1 件)
- #99 "なんかおかしい" (本文 100 文字未満)

正規化を実行しますか? 1. すべて委譲  2. 番号で個別選択  3. 委譲スキップ  4. キャンセル
```

## 1.5-3. insufficient Issue の投げ返し

```bash
op issue comment "$N" --body-file - <<'EOF'
## op-run が実装に必要な情報を確認しています

この Issue は op-run のキューに入りましたが、自動実装に必要な情報が不足しています。

### 必要な情報 (どれか 1 つでも追記いただけると進みます)
- 対象ファイルパス (例: `src/auth/login.rs`)
- 再現手順または期待動作 (例: 「ログイン後 X が起きるが Y が正しい」)
- 触ってほしくない領域 (あれば)

情報が揃ったらラベル `auto-report` を再度付けてください。
EOF
op issue edit-labels "$N" --remove "auto-report" --add "needs-clarification"
```

mcp channel では `op issue edit-labels` の直前に fresh な `mcp__github__issue_read` (method: get) を `--input-json` で渡し、
emit された call-spec を `github-channel.md` §3-§4 で完遂する。

## 1.5-4. 派生 Issue の取り込み

委譲完了後、`op issue list --label "derived-from-issue" --state open --search "label:auto-report" --limit 50` で派生 Issue を取得し、
元の partial Issue と入れ替えて 1-2 へ進む (`--no-wait-normalize` では skip)。

## 1.5-6. 同期待ちのタイムアウト

委譲が 15 分以上完了しない Issue は「正規化タイムアウト」として除外し、ユーザーに通知して健全な Issue だけで 1-2 へ進む。
