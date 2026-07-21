<!--
schema_version: 1
last_breaking_change: 2026-05-16
notes: v1 (2026-05-16): op-run のクラスタリング後 plan mode gate 詳細仕様。
       op-plan SKILL.md フェーズ -1 / 6 のパターンを op-run の対話モード起動時に適用。
       SKILL.md の肥大化抑制のため、本ファイルへ詳細を分離 (follow-up #22 整合。
       op-run/SKILL.md は references/ への段階分解で現在約 1,300 行)。
       2026-06-21 (ADR-0017 W4 IU3, OQ7): 1-3-1 plan file テンプレを lean 構造へ presentation 再構成
       (実行サマリ + wave timeline 先頭 / issue 1 行化 / soft nudge 転記スロット / progressive disclosure 末尾)。
       挙動不変・schema_version 据置 (表示構造変更で非 breaking)。
-->

<!--
機能概要: op-run がクラスタリング後にユーザー承認 (フェーズ 1-3) を取る前段で、
         Claude Code の plan mode に入り read-only で計画フェーズを進め、ExitPlanMode で
         「どの Issue を解決し何がどうなるか」を自然文解説付きの plan file としてユーザーに提示する仕様。
作成意図: 現状の op-run フェーズ 1-3 は cluster table のみで、機械的・解説不足というユーザー指摘 (2026-05-16) を解消。
         op-plan v2 で確立した EnterPlanMode → read-only 計画 → ExitPlanMode → acceptEdits の 4 段モデルを
         op-run のクラスタリング承認に適用し、計画フェーズの read-only を権限機構レベルで担保しつつ、
         承認後の apply / PR open を acceptEdits 自動進行に整流する。
注意点: 本ファイルは op-run/SKILL.md からの pointer 先 (god file 抑制)。
       Stage 1 (フェーズ 1-3) のみが対象。Stage 2 (フェーズ 2-B) には gate を入れない。
       --auto 時は plan mode 自体を skip する (対話モード専用)。
       _shared/clustering.md / op-plan/SKILL.md は本ファイルからは編集しない (パターン参照のみ)。
-->

# op-run plan mode gate 詳細仕様 (フェーズ -1 / フェーズ 1-3)

本ファイルは `skills/op-run/SKILL.md` の「フェーズ -1」と「フェーズ 1-3」の詳細仕様を集約する。
SKILL.md 本体は要点と本ファイルへの pointer のみを保持し、god file 化を抑制する。

公式仕様: Claude Code [Choose a permission mode](https://code.claude.com/docs/en/permission-modes)
パターン参照元: `skills/op-plan/SKILL.md` フェーズ -1 (行 140-180) / フェーズ 6 (行 514-610)

---

## フェーズ -1: プランモード自動遷移 (対話モード起動時)

司令官は op-run を対話モードで起動した直後、フェーズ 0 に入る前に **`EnterPlanMode` tool を呼ぶ**。
これにより以降のフェーズ 0 (環境確認) / フェーズ 1 (Issue 取得・クラスタリング) /
フェーズ 1.5 (健全性チェック) / フェーズ 1-3 (ユーザー承認) が Claude Code の plan mode 下で進行し、
**Edit / Write / Bash の書き込み系が権限機構レベルでブロック** される。
bundled `/batch` および op-plan v2 と同じパターン。

### -1.1. plan mode 状態判定

司令官は現在のセッションの permission mode を確認する手段を持たないため、
**「plan mode に居るかどうか」は EnterPlanMode の応答で判定する** (op-plan -1.1 と同パターン):

- `EnterPlanMode` を呼んでユーザーに承認 prompt が出る → ユーザーが Yes → plan mode 入りを記録
- ユーザーが No → 「plan mode 入りを拒否されました。read-only 規律を SKILL.md 内の指示で守りつつ進めます」と
  ユーザーに伝え、フェーズ 0 へ進む (機能停止しない、フォールバック挙動)

`.claude/settings.json` の `defaultMode: "plan"` や `claude --permission-mode plan` 起動で
**既に plan mode に居る場合**は、EnterPlanMode 呼び出しは no-op として扱われる
(Claude Code 側で冪等)。

### -1.2. 計画フェーズの read-only 保証範囲

plan mode 下でも以下は実行可能:

- `Read` / `Grep` / `Glob` (探索)
- `gh issue list` / `gh issue view` / `gh pr view` / `gh label list` 等の **読み取り** gh コマンド
- `git rev-parse` / `git log` / `git diff` / `git fetch` 等の git 読み取り系
- feature-expert / debug-expert などの **audit / scan モード** spawn (subagent は read-only を引き継ぐ)

plan mode 下で **ブロックされる** (フェーズ 2 以降に集約):

- `gh issue create` / `gh issue comment` / `gh issue edit` 等の write 系
- `git push` / `gh pr create` / `gh pr merge` 等の publish 系
- worktree 作成 (`git worktree add`)
- apply モードの expert spawn (実装担当 expert は plan mode を抜けてから spawn する)

### -1.3. `--auto` モードとの関係

`--auto` で起動された場合、`EnterPlanMode` は **呼ばない**。
理由: `--auto` の本旨は「人間 prompt なしで自動進行」であり、plan mode は対話前提のため両立しない。

`--auto` 時の挙動は現状仕様を維持する:

- 競合のあるクラスタ・Critical 系・`low` confidence をスキップ
- 残りを自動実行 (フェーズ 1-3 のテーブル提示も省略)

`--auto` と `--normalize` 併用時も同様 (plan mode を skip し、partial Issue の op-scan 委譲 +
派生 Issue 取り込みまで自動実行)。

対話モード時のみ plan mode gate を起動する。

---

## フェーズ 1-3: ユーザー承認 (ExitPlanMode + plan file)

クラスタリング (フェーズ 1-2) 完了後、司令官はユーザー承認を取る前に **plan file を書き出し**、
`ExitPlanMode` tool を呼んでユーザーに提示する (op-plan 6-2 と同パターン)。

### 1-3-1. plan file の生成 (lean 構造、ADR-0017 OQ7)

`ExitPlanMode` は plan file の内容をパラメータで受け取らず、システムが指定する **plan ファイル** を
読み取ってユーザーに提示する。司令官は ExitPlanMode を呼ぶ直前に plan を書き出す。

plan file は **「冒頭は実行段取りの俯瞰、詳細は末尾に折りたたむ」** lean 構造を採る
(ADR-0017 OQ7。op-spec が内容・方向性を正本へ持つため、op-run plan gate は **実行段取りに専念**させ軽くする)。
冒頭で「何 issue を何 cluster でどう流すか」が一目で分かり、承認判断に要る情報
(confidence と根拠 / 並列度 / 推定 / judge 推奨案) は冒頭に残し、解説・手順説明・risk は末尾へ送る:

```markdown
# op-run: クラスタ実行プラン

## 実行サマリ

**N issue → M cluster ・ 並列 k ・ 推定 t 分** (対話モード / `--auto` 不使用 / `--normalize` <on|off>)

### wave タイムライン (並列 ∥ / 直列 ──→)

    [block-1] ──→ [auth-1 ∥ ui-1 ∥ profile-1] ──→ [core-1] ──→ PR / review
     最優先1件        並列3件 (blocking 後)         直列化1件      (各 cluster 共通)

## 健全性チェック結果 (フェーズ 1.5 ダイジェスト)

- fully-instructed: <N> 件 (このまま実行)
- partial → op-scan 委譲済: <N> 件 (派生 Issue 取り込み済 / 持ち越し)
- insufficient → 投げ返し: <N> 件

<!-- 未トリアージ Issue が複数 (2 件以上) のときだけ、ここに 1.5-1-b の soft nudge を 1 行転記する。
     文言の正本は references/issue-health-check.md 1.5-1-b。ここはその結果を転記するだけ (二重定義しない)。
     例: 「> ℹ️ 未トリアージ Issue が <N> 件あります (op-spec verdict 未付与)。方向性を先に固めるなら
     /op-spec を推奨します (このまま実行も可・続行が既定)。」 -->

## Issue 一覧 (1 行)

各 issue は **1 行**で示し、内容解説は正本 (`op-spec-ref` link 先) へ委ねる (plan lean 化)。
verdict / `op-spec-ref` が付いた issue は title + verdict emoji + link、
**未トリアージ (verdict / `op-spec-ref` なし) の issue は従来どおり title のみで degrade** する
(op-spec 非依存・後方互換。op-spec 未導入 repo でも plan が機能する):

- #42 ログイン失敗バグ修正 ✅ ([auth#login-session](正本 link))   ← トリアージ済み
- #51 保存できない症状の調査 ✏️ ([export#save-path](正本 link))   ← トリアージ済み
- #70 設定画面の表示崩れ                                          ← 未トリアージ (title のみ degrade)

## クラスタ一覧

### 最優先 (blocking findings) — 直列実行
| ID | Issue | module | expert | 変更候補 | blocking_reason |
|----|-------|--------|--------|---------|----------------|
| block-1 | #88 | report | refactor-expert | src/features/report/** | 既存 architecture_debt の悪化抑止 |

### 並列実行候補 (blocking 完了後)
| ID | Issue | module | expert | 変更候補 | confidence | 並列理由 |
|----|-------|--------|--------|---------|-----------|---------|
| auth-1 | #42 #43 | auth | debug-expert | src-tauri/src/auth/** | high | 他クラスタと変更候補重複なし |

### 直列化対象
| ID | Issue | 理由 |
|----|-------|------|
| core-1 | #60 | Cargo.toml / src/lib.rs を触る可能性あり (risk_flag) |

### 人間判断待ち (manual_review_bucket、apply しない)
| Issue | label | 理由 |
|-------|-------|------|
| #75 | needs:human-decision | 仕様判断保留中 |

---

## 詳細 (必要時に展開)

> 冒頭の俯瞰で承認できる人はここを読み飛ばしてよい。
> クラスタ別の自然文解説・承認後の処理手順・risk_flags をここに集約する (progressive disclosure)。

### クラスタ別 解説 (自然文 2-3 行ずつ)

#### auth-1 (debug クラスタ)
auth-1 は #42 #43 の login 失敗バグ 2 件を一括修正する。src-tauri/src/auth/ 配下の
セッショントークン処理を debug-expert が直し、login 画面の挙動が安定する。
他クラスタとファイル重複なしのため並列実行可能。

#### report-1 (refactor クラスタ)
report-1 は #88 のレポート出力モジュールに溜まった architecture_debt を refactor-expert が整理する。
振る舞いは保ったまま src/features/report/ の構造を平坦化し、後続の機能追加で同領域に
新規変更が走った時に既存 debt が悪化するのを防ぐ。Critical 系のため最優先で直列実行。

#### profile-1 (feature クラスタ)
profile-1 は #51 #52 のプロフィール編集画面新規追加。feature-expert が src/pages/profile/ 配下に
既存パターン (src/pages/account/ を手本) を流用して実装し、ユーザーが自分の情報を編集できる UI が完成する。
post-check で ux-ui-audit-expert を起動するため、UI 整合性も同 PR で担保される。並列実行可能。

### 承認すると何が起きるか

1. フェーズ 2-A (探知): 各クラスタが別 worktree に分離され、expert が探知モードで起動
2. フェーズ 2-B (Stage 2 再クラスタリング): 探知結果の `files_likely_to_modify` を見て競合を再検出
3. フェーズ 2-C (修正): expert が apply モードで実装、worktree 内で commit
4. フェーズ 3 (PR open): worktree から push し PR を自動作成
5. フェーズ 3.5 (post-check): post_check_expert があれば起動
6. フェーズ 4 (review-expert global review): 別 worktree で独立レビュー
7. フェーズ 4.5 (Review Fix Loop): needs-fix の場合は specialist expert に再委任

### risk_flags / 注意事項

- <Cargo.toml / pubspec.yaml / package.json を触る可能性のあるクラスタを列挙>
- <Stage 2 で並列化解除されうるクラスタを列挙>
- <Critical 機能を触るクラスタを列挙>
```

> **lean 構造の不変則 (presentation のみ・挙動不変)**: 上記は plan の **表示再構成**であり、
> 承認 gate の動作・クラスタリング結果・spawn は一切変えない (ADR-0017 OQ7 = 元症状
> 「op-run plan がめちゃくちゃ」の presentation 対処)。承認判断に要る情報
> (cluster table の confidence と根拠 / 並列度・推定 / judge 推奨案) は **冒頭に残す**。
> ④ progressive disclosure は冗長記述 (クラスタ別解説 / 7 ステップ説明 / risk_flags) を
> **末尾へ移すだけで削除しない**。

### 1-3-2. ExitPlanMode 呼び出しと 4 オプション挙動

司令官は plan file を準備した後 `ExitPlanMode` tool を呼ぶ。Claude Code はユーザーに
以下の承認オプションを提示する (公式 UX、op-plan 6-2 と同表構造):

| 承認オプション | op-run フェーズ 2 以降の挙動 |
|---|---|
| **Approve and accept edits** (推奨) | `acceptEdits` モードに遷移し、フェーズ 2 (worktree 作成 / expert spawn / commit) ・フェーズ 3 (PR open) ・フェーズ 3.5 (post-check) ・フェーズ 4 (global review) が permission prompt なしで進行する |
| Approve and start in auto mode | auto mode (要件は公式 permission-modes 参照: 対応モデル + 対応プラン) でフェーズ 2 以降を実行。`git worktree add` / `git push` / `gh pr create` 等の許可は classifier 判定に依存する (working-directory 内コマンドとして自動承認されることが多いが保証はなく、ブロックされた場合は permission prompt にフォールバック)。`--auto` フラグ起動とは別概念 (こちらは ExitPlanMode 承認後の permission モード選択であり、cluster の自動除外ルールは適用されない) |
| Approve and review each edit manually | `default` モードでフェーズ 2 以降に進む。各 expert spawn / `git push` / `gh pr create` ごとに permission prompt が出る |
| Keep planning with feedback | plan mode に留まり、ユーザーフィードバックを受けて修正再実行 (下記 1-3-3) |

「Approve and accept edits」を **推奨**として案内する。理由: op-run は元々
「クラスタリング承認 = 人間承認 gate 必須」原則であり、ExitPlanMode 承認 = 人間承認 gate なので、
それ以降の機械的な worktree 作成・expert spawn・PR open は prompt 不要。

### 1-3-3. Keep planning with feedback への対応

ユーザーが ExitPlanMode 承認画面で「Keep planning with feedback」を選び、フィードバックを返した場合、
修正内容に応じて以下を再実行する (op-plan 6-3 と同パターン、op-run 固有に拡張):

- **軽微修正** (表現変更 / 解説文の追記 / 並列度変更) → 司令官が plan file の body を編集して再度 ExitPlanMode を呼ぶ (再クラスタリングはしない)
- **構造修正** (クラスタの分割 / 統合 / 直列化指定 / 並列化解除 / expert 変更 / Issue の除外) → フェーズ 1-2 (クラスタリング) から再実行 (= 再クラスタリング)
- **設計レベル変更** (対象 Issue の入れ替え / `--label` 変更 / `--normalize` 切り替え / `--max-parallel` 大幅変更) → フェーズ 1-1 (Issue 取得) から再実行

再実行後は再び 1-3-1 → 1-3-2 に戻る (ExitPlanMode 承認まで plan mode を抜けない)。

> **op-plan よりも構造修正の頻度が高い**: op-run はクラスタ単位で並列化判定があるため、
> ユーザーが「このクラスタ分けがおかしい」とフィードバックしてくるケースが op-plan より頻発しうる。
> 司令官は軽微修正か構造修正かを丁寧に判断し、必要なら再クラスタリングに戻る。

### 1-3-4. tool 未提供時の v1 互換フォールバック

Claude Code のバージョンによっては `EnterPlanMode` / `ExitPlanMode` tool が提供されない場合がある
(古い CLI バージョン / 特殊環境 / tool listing から除外されている場合など)。
司令官はフェーズ -1 で `EnterPlanMode` 呼び出しが **tool 未定義エラー** で失敗した場合
(tool listing に EnterPlanMode が存在しない、または ToolSearch で取得不能)、
v1 互換のフォールバック挙動に退避する (op-plan 6-6 と同パターン):

- フェーズ 0-1.5 を **SKILL.md 内の規律のみ** で read-only 進行 (機能停止はしない、規律のみで進める)
- フェーズ 1-3 では `ExitPlanMode` を呼ばず、従来の対話プレビュー
  (司令官が cluster table を表示し `この内容で実装を開始しますか? 1.実行する 2.修正要求 3.キャンセル` を表示する形式) に退避
- ユーザーには「Claude Code のバージョンに `EnterPlanMode` tool がないため、
  v1 互換動作で続行します (SKILL.md 規律レベルの read-only 保証)」と通知

tool 自体は存在するが フェーズ -1 で **ユーザーが承認 prompt に No を返した** 場合は、
-1.1 節のフォールバックに従う (= 同じく v1 互換の対話プレビューに退避)。

### 1-3-5. Direct Mode 固定

本 gate は **Direct Mode 固定** (`_shared/invocation-mode.md` 準拠)。
ExitPlanMode 承認画面のフィードバックは対話で受け付ける (OP-managed Mode のような構造化返却ではない)。
op-run が OP-managed Mode 相当の経路 (e.g. 他スキルから自動 chain) で起動された場合は、
plan mode gate を skip して `--auto` 相当の自動除外ルールに従う。

---

## cluster 解説サンプル文 (plan file の「詳細 (必要時に展開) > クラスタ別 解説」節に転載するテンプレ)

plan file 内の自然文解説のお手本。各クラスタについて **Issue 番号 / 触るファイル / 期待される結果 /
並列 (または直列) の理由** を 2-3 行で記述する。テーブルだけでは伝わらない「何がどうなるか」を補う。
lean 構造 (1-3-1) では冒頭は cluster table の俯瞰のみとし、これらの自然文解説は **末尾の
「詳細 (必要時に展開)」節へ折りたたむ** (progressive disclosure、削除はしない)。

### サンプル 1: debug クラスタ

> auth-1 は #42 #43 の login 失敗バグ 2 件を一括修正する。src-tauri/src/auth/ 配下の
> セッショントークン処理を debug-expert が直し、login 画面で OAuth コールバック後に
> セッションが失われていた現象が解消される。他クラスタとファイル重複なしのため並列実行可能。

### サンプル 2: refactor クラスタ

> report-1 は #88 のレポート出力モジュールに溜まった architecture_debt を refactor-expert が整理する。
> 振る舞いは保ったまま src/features/report/ 配下のネスト 4 階層を 2 階層に平坦化し、
> 後続の機能追加で同領域に新規変更が走った時に既存 debt が悪化するのを防ぐ。
> Critical 系のため最優先で直列実行 (他クラスタの作業前に完了させる)。

### サンプル 3: feature クラスタ

> profile-1 は #51 #52 のプロフィール編集画面新規追加。feature-expert が src/pages/profile/ 配下に
> 既存パターン (src/pages/account/AccountEdit.vue を手本) を流用して実装し、
> ユーザーが自分の表示名 / アバター / 連絡先を編集できる UI が完成する。
> post-check で ux-ui-audit-expert を起動するため、UI 整合性も同 PR で担保される。
> 他クラスタとファイル重複なしのため並列実行可能。

これら 3 例を最低基準とし、司令官は対象 cluster の expert / Issue / 影響範囲に応じて
表現を調整する (機械的なテンプレ流し込みは禁止、ユーザーが「自分のリポジトリで何が起きるか」を
理解できる粒度にする)。

---

## SKILL.md 本体との分担

| 配置 | 内容 |
|------|------|
| SKILL.md 本体 (フェーズ -1 節) | 要点 (`EnterPlanMode` 呼ぶ / `--auto` で skip) + 本ファイルへの pointer |
| SKILL.md 本体 (フェーズ 1-3 節) | 要点 (plan file 生成 → ExitPlanMode → 4 オプション分岐) + 本ファイルへの pointer + 既存 cluster table 例 |
| 本ファイル (plan-mode-gate.md) | -1.1 / -1.2 / -1.3 / 1-3-1 / 1-3-2 / 1-3-3 / 1-3-4 / 1-3-5 + サンプル文 3 例 |

god file 抑制のため、新規詳細は常に本ファイル側に追加する。SKILL.md 本体に流す場合は要点のみ。

---

## 参照

- `skills/op-plan/SKILL.md` フェーズ -1 (行 140-180) / フェーズ 6 (行 514-610) — 構造のお手本 (本ファイル作成元)
- `skills/_shared/clustering.md` — クラスタリングロジック本体 (本 gate からは変更しない)
- Claude Code 公式 [Choose a permission mode](https://code.claude.com/docs/en/permission-modes) — EnterPlanMode / ExitPlanMode の権限機構レベル仕様
- op-run/SKILL.md の controller 分解は完了済 (references/ への段階分解で現在約 1,300 行)。本ファイルはその分解方針の先行実装 (旧 follow-up 作業指示書は完了に伴い削除済)
