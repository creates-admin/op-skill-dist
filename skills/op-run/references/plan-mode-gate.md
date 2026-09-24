# op-run plan mode gate (フェーズ -1 / フェーズ 1-3)

対話モード専用。`--auto`、または他 skill から OP-managed で起動された場合は plan mode を使わず、
SKILL.md「実行モード」の `--auto` 除外規則で進む。

## フェーズ -1: EnterPlanMode

起動直後、フェーズ0 の前に `EnterPlanMode` を呼ぶ (既に plan mode なら no-op)。ユーザーが拒否した場合は
その旨を伝え、次の規律を自分で守って続行する。

- Issue / PR への書き込み、`git push` / `op pr create`、worktree 作成、apply spawn は 1-3 の承認後に行う。
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
### op-component で実施 (apply しない)
| Issue | 部品名 |

---

## 詳細
### クラスタ別 解説 (各 2-3 行: Issue / 触るファイル / 期待される結果 / 並列または直列の理由)
### 承認後の流れ
worktree provision → 探知 (2-A) → Stage 2 再検出 (2-B) → CO 起動 (apply → PR → post-check → review → Review Fix Loop)
### risk_flags
<依存マニフェスト / 基盤ファイルを触るクラスタ、Stage 2 で直列化されうるクラスタ、Critical 機能を触るクラスタ>
```

expert は 1-2-d 正規化後の名前を出す。cluster table には confidence と根拠を含める。

### 1-3-2. ExitPlanMode の承認

どの承認オプションでもフェーズ2 以降に進む (auto mode で承認されても `--auto` の除外規則は適用しない)。
「Keep planning with feedback」は 1-3-3。

### 1-3-3. Keep planning with feedback

- 軽微 (表現 / 解説 / 並列度) → plan file を直して ExitPlanMode を再度呼ぶ
- 構造 (クラスタ分割・統合 / 直列化指定 / expert 変更 / Issue 除外) → 1-2 からやり直す
- 対象の変更 (Issue 入れ替え / `--label` / `--normalize`) → 1-1 からやり直す

ExitPlanMode が承認されるまで plan mode を抜けない。
