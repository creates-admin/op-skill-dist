# op-run plan mode gate (フェーズ -1 / フェーズ 1-3)

対話モード専用。`--auto`、または他 skill から OP-managed で起動された場合は plan mode を使わず、
`--auto` の除外ルール (競合あり / Critical 系 / `low` confidence を除外) で進む。

## フェーズ -1: EnterPlanMode

起動直後、フェーズ0 の前に `EnterPlanMode` を呼ぶ (既に plan mode なら no-op)。ユーザーが拒否した場合は
その旨を伝え、以下の read-only 規律を自分で守って続行する。

- 可: Read / Grep / Glob、`op issue list|view` / `op pr view` などの読み取り、git の読み取り系、read-only の subagent。
- 1-3 の承認後に行う: Issue / PR への書き込み、`git push` / `op pr create`、worktree 作成、apply spawn。
- 例外: 1-2-e の `op claim acquire` は計画提示前に行う (他 instance が作業中の Issue を plan から外すため)。

## フェーズ 1-3: ExitPlanMode + plan file

### 1-3-1. plan file の生成

`ExitPlanMode` の直前に plan file を書く。冒頭は実行段取りの俯瞰、詳細は末尾に置く。

```markdown
# op-run: クラスタ実行プラン

## 実行サマリ
**N issue → M cluster ・ 並列 k ・ 推定 t 分** (対話モード / `--normalize` <on|off>)
model: 全 cluster Opus 天井 (Fable 昇格なし) | <id_short> のみ Fable 昇格 (承認済) / 他は Opus | skip (<理由>)

    [block-1] ──→ [auth-1 ∥ ui-1] ──→ [core-1] ──→ PR / review

## 健全性チェック結果 (フェーズ 1.5)
- complete: <N> 件 / partial → op-scan 委譲: <N> 件 / insufficient → 投げ返し: <N> 件
<未トリアージ 2 件以上なら issue-health-check.md 1.5-1-b の nudge を 1 行>

## Issue 一覧 (1 行ずつ)
- #42 ログイン失敗バグ修正 ✅ ([auth#login-session](正本 link))   ← op-spec-ref あり
- #70 設定画面の表示崩れ                                          ← 未トリアージは title のみ

## クラスタ一覧
### 最優先 (blocking) — 直列
| ID | Issue | module | expert | 変更候補 | blocking_reason |
### 並列実行候補
| ID | Issue | module | expert | 変更候補 | confidence | 並列理由 |
| auth-1 | #42 #43 | auth | debug-expert | src-tauri/src/auth/** | high | 他クラスタと変更候補重複なし |
### 直列化対象
| ID | Issue | 理由 |
### 人間判断待ち (manual_review_bucket、apply しない)
| Issue | label | 理由 |

---

## 詳細
### クラスタ別 解説 (各 2-3 行: Issue / 触るファイル / 期待される結果 / 並列または直列の理由)
### 承認後の流れ
worktree provision → 探知 (2-A) → Stage 2 再検出 (2-B) → CO 起動 (apply → PR → post-check → review → Review Fix Loop)
### risk_flags
<依存マニフェスト / 基盤ファイルを触るクラスタ、Stage 2 で直列化されうるクラスタ、Critical 機能を触るクラスタ>
```

expert は 1-2-d 正規化後の名前を出す。cluster table には confidence と根拠を必ず含める。

クラスタ別解説の例 (そのまま流用せず対象に合わせて書く):

> auth-1 は #42 #43 の login 失敗バグ 2 件を一括修正する。src-tauri/src/auth/ 配下のセッショントークン処理を
> debug-expert が直し、OAuth コールバック後にセッションが失われる現象が解消される。他クラスタとファイル重複なしのため並列実行する。

### 1-3-2. ExitPlanMode 呼び出しと 4 オプション挙動

| 承認オプション | フェーズ2 以降 |
|---|---|
| **Approve and accept edits** (推奨) | permission prompt なしで worktree 作成 / spawn / PR open が進む |
| Approve and start in auto mode | auto mode の classifier 判定で進む (ブロックされたら prompt)。`--auto` フラグとは別物で、除外ルールは適用しない |
| Approve and review each edit manually | 各 spawn / push / PR 作成ごとに prompt |
| Keep planning with feedback | plan mode に留まる (1-3-3) |

### 1-3-3. Keep planning with feedback

- 軽微 (表現 / 解説 / 並列度) → plan file を直して ExitPlanMode を再度呼ぶ
- 構造 (クラスタ分割・統合 / 直列化指定 / expert 変更 / Issue 除外) → 1-2 からやり直す
- 対象の変更 (Issue 入れ替え / `--label` / `--normalize`) → 1-1 からやり直す

ExitPlanMode が承認されるまで plan mode を抜けない。
