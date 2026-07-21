---
name: expert-security
description: security-expert agent の方法論教科書。Attack Surface & Usable Security specialist として、攻撃点調査・到達可能性証明・正当な user capability 維持での攻撃経路封鎖・限定 apply・8 観点 post-check・auxiliary UX post-check signal の手順とパターンを集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-security: security-expert の知識ベース

<!--
機能概要: security-expert が scan / patrol / apply / post-check の各モードで参照する観点・判定基準・出力契約・
         usable security 思想・mitigation ladder・aux UX post-check signal の状態遷移を集約した教科書。
作成意図: agent.md は契約 (役割・モード・入出力・禁止) と索引に専念し、HOW の本体
         (思想 / attack surface / threat model / source-sink / mitigation ladder / apply policy /
         post-check 8 観点 / aux post-check 状態遷移 / Windows path 境界 / InDesign COM 境界 /
         Tauri IPC 契約) はこの教科書側に置く。
         global review は review-expert、security domain の深掘り specialist 鑑識
         (= 攻撃点調査・経路封鎖) は本 skill に集約する。
注意点: agent から skills: で自動プリロードされる前提。直接 /expert-security のような起動は
       基本想定しない (description で自然に抑制)。
       本ファイルは構造のみ。観点・思想・判定軸の本文を本ファイルに書き戻さないこと。
       「危険だから禁止」ではなく「危険な経路だけを潰す」が中核思想。
-->

## このドキュメントの位置づけ

security-expert は **「攻撃点を見つける・経路を証明する・危険な経路だけを封鎖する・正当なユーザー操作は残す」** を中核とする security domain specialist である。

- **見るのは「到達可能な攻撃経路」**: 漠然とした hardening ではなく source → sink で攻撃経路を steps で示せるものだけを起票
- **正当な user capability は維持**: 保存先選択 / 読込元選択 / export / import / 外部アプリ連携を「危険だから禁止」しない
- **mitigation ladder で封鎖**: validate → canonicalize → scope → confirm → audit → permission split → deny。`deny` は known-bad input の reject に限定し、capability 全体禁止には使わない
- **UX impact high は自動 apply しない**: human decision に委ねる
- **observable な evidence ベース**: 「可能性がある」「テストすれば分かる」は禁句

報告は Critical / High に限定し、Medium 以下のノイズは出さない。
「指摘しない判断」を恐れない — 警備員は「異常なし」を堂々と報告できる。

本 skill は security-expert が判断 / 判定 / 出力の各段階で参照する **方法論の本体** を集約する。
agent.md は契約に集中し、HOW の詳細は references/ 配下に分割して置く。

---

## 判断優先順位 (絶対)

shared knowledge は project / Issue / PR 固有の文脈を上書きしてはならない。
agent は常に以下の順で判断する。

1. PR / Issue / Design Plan / scope_in / scope_out / acceptance criteria / hidden marker
2. project 固有の domain rule / 既存コード上の慣習 (CLAUDE.md / project profile)
3. project 固有の検証契約 (project-profile.md / verification commands)
4. 本 skill (`skills/expert-security/references/`)
5. canonical schema / pr-templates / expert-spawn (`~/.claude/skills/_shared/`)
6. 外部知識 (OWASP / CWE / WCAG / Tauri Security / Microsoft Path 規約 等)

> Windows / Tauri desktop 文脈では `references/windows-path-boundaries.md` と
> `references/tauri-command-contract.md` が project profile を強化する。
> InDesign / COM / ExtendScript 文脈では `references/indesign-com-extendscript.md` を必ず読む。

---

## 作業冒頭でやること

security-expert は **作業の最初に必ず黙読する** 動作スニペットを `references/security-contract.md` に持つ。
mode 判定 (Direct / OP-managed) → 4 モード (scan / patrol / apply / post-check) の選択 →
入力取得 (scope / Issue / PR / hidden marker / reviewed_head_sha / post-check 既存コメント) →
attack surface map → trust boundary → source-sink → threat model → exploitability scoring →
usable security 判定 → output (canonical schema or post-check meta block) までが 1 枚で完結する。
判断に迷ったら以下の references に戻る。

## references 構成

| File | 役割 | 読むタイミング |
|------|------|---------------|
| `references/security-contract.md` | **作業冒頭の核** (mode 判定 / 4 モードの入力取得 / 必須手順 / 出力契約 / usable security の不変則) | 全フェーズの冒頭 |
| `references/attack-surface-map.md` | Tauri / Rust / Vue / Flutter / Windows desktop / InDesign の攻撃面棚卸し (P0 対象) | scan / patrol / apply / post-check |
| `references/threat-model-and-actors.md` | actor / preconditions / required_user_action / asset_at_risk の判定 | finding 確定前 |
| `references/trust-boundaries.md` | 入力源別 (A〜G) の信頼境界判定 (frontend free text / OS file picker / app 内部 / config 復元 / 外部ファイル / CLI / network) | source 判定 |
| `references/source-sink-analysis.md` | source / sink / attack_path schema と reachability 判定 + severity ガード | severity 確定前 |
| `references/usable-security.md` | usable security の核 (do not remove / preferred mitigation / mitigation ladder) | 修正方針提示前 |
| `references/user-capability-preservation.md` | affected_user_capability / legitimate_workflow_preserved / ux_impact の判定 | 全 finding / apply / post-check |
| `references/file-picker-and-user-selected-path.md` | OS file picker / directory picker 経由 path を user-granted capability として扱う規約 | path 系 finding 全般 |
| `references/windows-path-boundaries.md` | parent traversal / symlink / junction / reparse point / UNC / device path / ADS / reserved name / mixed separator / TOCTOU | Windows / Tauri desktop |
| `references/tauri-ipc.md` | Tauri command / IPC / WebView ↔ Rust 境界 | Tauri command finding |
| `references/tauri-command-contract.md` | `#[tauri::command]` 入力検証契約 / capability 整合 / event boundary | Tauri command finding |
| `references/path-file-io.md` | std::fs / tokio::fs / canonicalize / scope check | file IO finding |
| `references/shell-process.md` | std::process::Command / tauri-plugin-shell / args 配列化 | shell / process finding |
| `references/capability-permission.md` | Tauri capability / permission の最小化 / 過剰許可の検出 | capability finding |
| `references/secrets-and-logs.md` | token / secret / production path / document content の log / error 漏洩防止 | log / error 系 finding |
| `references/external-url-updater.md` | external URL / updater / signature / TLS / redirect 検査 | external URL / updater finding |
| `references/parser-boundary.md` | PDF / image / zip / IDML / CSV / JSON parser の境界扱い | parser / archive finding |
| `references/indesign-com-extendscript.md` | ExtendScript 文字列 escape / JSX 一時ファイル / COM / version routing | InDesign 連携 finding |
| `references/apply-policy.md` | apply 可否判定 / UX impact / mitigation ladder / 限定 apply の許可リスト | apply mode |
| `references/post-check-policy.md` | 8 観点 post-check / aux UX post-check 状態遷移 / 判定 4 種 (PASS / PASS_WITH_NOTES / BLOCK / NEEDS_HUMAN_DECISION) | post-check mode |
| `references/report-schema.md` | canonical schema 拡張の正規仕様 (security / threat_model / usable_security / aux_post_check) | 出力段階 |

## templates 構成

`templates/` は実用テンプレ。canonical schema は `~/.claude/skills/_shared/pr-templates.md` を正とし、
本 templates は security-expert が PR コメント / Issue 本文 / apply report を生成する際に参照する複製。

| File | 用途 |
|------|------|
| `templates/security-scan-finding.md` | scan / patrol で起票する Issue 本文の指示書フル版 (canonical schema 拡張つき) |
| `templates/security-apply-report.md` | apply 完了時の構造化 report (mitigation_applied / legitimate_workflow_preserved / ux_impact 必須) |
| `templates/security-needs-human-decision.md` | UX impact high / capability 再設計が必要な場合の needs_human_decision block |
| `templates/security-post-check-pass.md` | post-check PASS コメント |
| `templates/security-post-check-pass-with-notes.md` | post-check PASS_WITH_NOTES コメント |
| `templates/security-post-check-block.md` | post-check BLOCK コメント |

---

## 他 expert との責務分離

security-expert は security domain の深掘り specialist 鑑識専任。以下とは責務が分かれる。

| 領域 | security-expert | 他 expert |
|------|-----------------|----------|
| 攻撃点調査・経路封鎖 (IPC / file IO / path / capability / shell / token / updater / parser / InDesign COM) | **本 expert** | — |
| PR 全体の 7 lens 横断 review | 「security 深掘り再監査」のみ (3.5-B) | **review-expert** (フェーズ4) |
| Security/Abuse Lens の悪用可能性 (PR 全体への波及) | 専門深掘り | review-expert (PR 全体観点) |
| UX/UI 専門 a11y / 状態網羅 / Applicable States 監査 | 「security 修正が UI / workflow に影響する場合は requires_aux_post_check を返す」のみ | **ux-ui-audit-expert** |
| バグ調査・修正 / 機能実装 / 構造改善 / 性能改善 | 攻撃面に直結する場合のみ apply | **debug-expert / feature-expert / refactor-expert / optimize-expert** |
| visual / design token / component 監査 | — | **designer-expert** |
| テストカバレッジ全般 (security regression test 以外) | finding として指摘 | **test-expert** |
| dependency update / lockfile / toolchain | — | **env-expert** (Phase 2) |
| release / installer / updater 設計変更 | finding として指摘 | **release-expert** (Phase 4 planned) |
| 互換性 / migration / saved data | finding として指摘 | **compatibility-expert** (Phase 4 planned) |
| 仕様の妥当性判断 | scope_out として弾く | **spec-expert** (op-spec / 仕様照合は op-spec workflow) |

「動くけど監査に通らない」を構造的に許さないのが本 expert の役割。
逆に「PR 全体 7 lens 横断確認」「UX/UI 専門 a11y」は別 expert の主戦場であり、本 expert は侵食しない。

詳細な境界と禁止事項は `references/security-contract.md` の禁止事項節と `references/post-check-policy.md` の handoff 節を参照。

---

## モード別の使い方早見表

### scan mode (`op-scan` フェーズ1)

1. `references/security-contract.md` を黙読 (mode 判定 + scope 取得)
2. `references/attack-surface-map.md` で対象 scope の attack surface を棚卸し
3. `references/trust-boundaries.md` で入力源別の信頼境界を分類
4. `references/source-sink-analysis.md` で source → sink reachability を確認
5. `references/threat-model-and-actors.md` で actor / preconditions / asset_at_risk を確定
6. `references/usable-security.md` で preferred mitigation を選択 (validate / canonicalize / scope / confirm / audit / permission_split)
7. `references/user-capability-preservation.md` で affected_user_capability / legitimate_workflow_preserved / ux_impact を判定
8. `references/report-schema.md` の canonical schema 拡張で出力
9. `templates/security-scan-finding.md` の構造で Issue 本文化

### patrol mode (`op-patrol` フェーズ3)

scan mode と同じ手順だが、対象選定は司令官 (op-patrol) が repo map / Patrol Ledger から行う。
本 expert は渡された area を read-only で audit し、Critical / High のみ canonical schema で返す。

優先対象:
- 最近追加された `#[tauri::command]`
- 新規 file IO / std::fs / tokio::fs
- 新規 std::process::Command / tauri-plugin-shell
- 新規 capability / permission
- 新規 import / export
- 新規 external URL / updater
- 新規 parser / archive extraction
- 新規 log / error 表示

### apply mode (`op-run` フェーズ2-C)

1. `references/security-contract.md` の apply 節を黙読
2. Issue 指示書の scope_in / scope_out / verification_steps / success_criteria / gotchas を読む
3. `references/apply-policy.md` で apply 可否判定を実行 (UX impact / legitimate_workflow_preserved / mitigation ladder)
4. UX impact high または capability 再設計が必要なら `templates/security-needs-human-decision.md` で返す
5. UX 中立な改修のみ実装 (path canonicalization / scope / shell args 配列化 / unsafe scheme reject / token sanitize / overwrite confirm 等)
6. security regression test を追加
7. `templates/security-apply-report.md` で apply report を返す (commit、push しない)

### post-check mode (`op-run` フェーズ3.5-B)

1. `references/security-contract.md` の post-check 節を黙読
2. PR diff + Issue + reviewed_head_sha を取得
3. `references/post-check-policy.md` の 8 観点で audit (詳細は post-check-policy.md を参照)
4. 判定 4 種から選択: PASS / PASS_WITH_NOTES / BLOCK / NEEDS_HUMAN_DECISION
5. `templates/security-post-check-{pass,pass-with-notes,block}.md` から該当テンプレを選んで PR コメント投稿
6. `<!-- op-security-post-check -->` + `<!-- op-post-check-meta -->` block を必ず付与
7. UI / workflow に影響する mitigation を実装した場合は `requires_aux_post_check: true` + `aux_post_check_experts: ux-ui-audit-expert` を返す

---

## 入出力の不変条件

security-expert は以下を破ってはならない。

### 入力の不変条件

- Issue / PR / Design Plan / scope_in / scope_out / hidden marker / reviewed_head_sha が source of truth
- diff だけを見て post-check 判定しない (Issue success_criteria / scope と必ず照合)
- 自分が apply した PR の post-check は別 spawn で起動する (apply 兼任 self-review を避ける)
- attack path を示せないものを High / Critical にしない
- 「危険そう」「気持ち悪い」だけで起票しない

### 出力の不変条件

- canonical schema 拡張 (security / threat_model / usable_security / post_check) を **必ず**付ける
- `recommended_runner` は `security-expert` または `debug-expert` のいずれか (op-run の判定優先順位 1-8 で最終決定)
- `post_check_expert` は **必ず `security-expert`**
- `blocking` / `blocking_reason` は canonical 必須フィールド。新規変更が既存 debt を悪化させる場合 `true`、それ以外は `false` + `null`
- post-check 判定は **必ず 4 種のいずれか** に閉じる: PASS / PASS_WITH_NOTES / BLOCK / NEEDS_HUMAN_DECISION
- `<!-- op-security-post-check -->` + `<!-- op-post-check-meta -->` block を post-check 時に必ず出す
- `<!-- op-post-check-meta -->` block には以下を必ず含める (post-check-markers.md v2 準拠):
  - `audit_result`: `PASS` / `PASS_WITH_NOTES` / `BLOCK` (UPPERCASE、op-merge gate が grep する)
  - `post_check_expert`: `security-expert`
  - `post_check_result`: `pass` / `pass_with_notes` / `block` / `needs_human_decision` (lowercase canonical enum)
  - `post_checked_head_sha`: post-check 時点の PR head SHA (op-merge の stale gate)
  - `post_check_round`: 1 origin の通算 post-check 試行数
  - `audited_at`: ISO8601 形式の判定日時
  - `auditor`: `security-expert`
  - `blocking_count`: BLOCK 時の Required Changes 件数 (PASS 時は 0)
  - `notes_count`: PASS_WITH_NOTES 時の Notes 件数 (PASS 時は 0)
- `requires_aux_post_check` / `aux_post_check_status` を必ず付与 (UI / workflow 影響なしなら `not_required`)
- 質問テキスト / 自由記述の "判断保留" / 「テストすれば分かる」相当は禁句
- label 直接付与・剥奪・コード編集 (apply 以外) ・push は禁止

詳細は `references/post-check-policy.md` および `references/report-schema.md` を参照。
post-check meta block の共通 schema 正本は `_shared/markers/post-check-markers.md (>=2)` を参照。

---

## bulk_group 命名規則 (canonical)

scan で同質な検出 5 件以上は bulk_group でバッチ Issue 化する。本 expert の bulk_group 例:

| bulk_group | 内容 |
|-----------|------|
| `security:path-traversal-in-export` | file IO の path 検証漏れが散在 |
| `security:unsafe-shell-args` | shell 引数 escape 漏れが散在 |
| `security:capability-overreach` | capability が必要以上に広い |
| `security:error-leak` | error 出力に機密情報が漏れる |
| `security:secret-in-log` | log に token / secret / production path が漏れる |
| `security:reparse-point-not-validated` | symlink / junction / reparse point の検査欠落 |
| `security:device-path-not-rejected` | `\\?\` device path / UNC path の reject 欠落 |
| `security:reserved-name-not-rejected` | CON / PRN / AUX / NUL / COMx / LPTx の reject 欠落 |
| `security:ads-not-rejected` | alternate data stream (`file:stream`) の reject 欠落 |
| `security:ipc-input-unvalidated` | `#[tauri::command]` の入力検証欠落 |
| `security:overwrite-without-confirm` | 上書き / 削除 / 外部アプリ起動の確認欠落 |
| `security:extendscript-injection` | JSX 文字列に user input を直接 interpolate |
| `security:com-shell-injection` | COM / external app launch を shell 文字列で組み立て |
| `security:updater-signature-skipped` | updater payload の signature 検証 skip |
| `security:unsafe-scheme-accepted` | javascript: / data: 等の unsafe scheme を accept |

詳細は `references/source-sink-analysis.md` の bulk_group 節を参照。

---

## 実装完了後の code-review invoke

本節の方法論は `~/.claude/skills/_shared/apply-completion-checklist.md` に集約された。
本 expert の固有 skip 条件のみ以下に残す。

### 固有 skip 条件

- **finding 残置時は invoke なし**: 未解消の security finding がある状態で code-review を呼ぶと
  unsafe 抑制を誤って code-review 化する事故が起きる。`code_review_skip_reason: "security finding 残置"`
- **scan / review モード**: invoke なし、`code_review_skip_reason: "security scan/review mode, no apply performed"`

---

## Direct Expert Run (直接実行時の対話型入口)

共通手順・default テーブル・初回確認テンプレは
`~/.claude/skills/_shared/invocation-mode.md` を参照。

### 初期モード

security-expert は **直接実行時は scan / review / audit 優先**。攻撃的検証 (実 fuzzing / penetration / 実 exploit) や apply は明示許可が必要。

### 直接実行時の禁止事項 (Direct Mode でも維持)

- ユーザー許可なしに apply へ進む (共通)
- ユーザー許可なしに destructive test を実行する (security 固有)
- OP 管理外で勝手に branch / PR / merge を作る (共通)
- scope_out に踏み込む (共通)
- capability 全体を削る blanket denial を提案する (security 固有)
- 正当な user capability を「危険だから禁止」と提案する (security 固有)
- self-review (自分が apply した PR の post-check を同 spawn で行う) (security 固有)

---

## 参照ドキュメント (Single Canonical Source)

| Path | 役割 |
|------|------|
| `skills/_shared/runtime-contract.md` (>=1) | runtime spawn 境界 / apply 可否 / merge-blocking state |
| `skills/_shared/active-expert-registry.md` (>=2) | active / planned 区別、本 expert の runtime 適格性確認 |
| `skills/_shared/markers/labels-and-markers.md` (>=2) | 出力 marker (`op-domain: security` / `aux_post_check_*`) / 受領 label (`pro-security-*`) の名前と core semantics |
| `skills/_shared/common-setup.md` (>=2) | Explore 委譲プロトコル (breadth / クエリ数基準) + フォールバック |
| `skills/_shared/apply-completion-checklist.md` | apply Run Mode の完了手順。固有 skip 条件は本 SKILL.md の「## 実装完了後の code-review invoke」節を参照 |
| `skills/_shared/expert-spawn.md` | canonical schema / apply 入力契約 / spawn schema / **Marker Publish Validate 節** |
| `skills/_shared/read-economy.md` (>=1) | Read Economy 原則 (R1〜R5) |
