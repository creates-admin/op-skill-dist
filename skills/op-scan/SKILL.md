---
name: op-scan
description: デフォルト 6 expert (debug / refactor / optimize / security / ux-ui / design) を並列 spawn して観点別にコードベースを audit し、Critical/High だけを GitHub Issue として起票するスキル。test / feature は --include で追加。--from-issue で人間立て Issue を指示書フル版に正規化する。「スキャン」「op-scan」「監査」「Issue 起票」「正規化」等のキーワードで起動。
---

# op-scan: 観点別並列 audit + Issue 起票

コードベースを観点別に並列 audit し、Critical/High の問題だけを GitHub Issue にする。
scan はコードを変更しない。起票は人間承認後 (`--auto` は品質 gate を通過した分のみ)。

---

## Expert Runtime and Routing Metadata Contract

正本は `_shared/runtime-contract.md`。op-scan 固有の要点:

- scan-time に spawn するのは active expert (`_shared/active-expert-registry.md`) のみ。
  planned expert (`_shared/planned-experts.md`) と Utility Worker (scout / spec-expert) は spawn しない。
- Issue に書く `op-run-expert` / `op-post-check-expert` marker とラベルは routing recommendation であり、
  spawn authorization ではない。op-run が `runtime-contract.md` の優先順位で独立に再解決する。
- `review-expert` は spawn せず、routing 値にも書かない。

---

## expert 構成

デフォルト 6 expert:

- `debug-expert` — バグ・エッジケース・例外握りつぶし
- `refactor-expert` — 散乱 token / god function / 責務境界混線 / 依存逆流 / 重複 / dead code / architecture debt
- `optimize-expert` — ボトルネック・N+1・メモリリーク
- `security-expert` — 脆弱性・入力検証・認証バイパス・IPC / file IO / shell / capability
- `ux-ui-audit-expert` — 使いやすさ: UX 障害パス / 必須 state 欠如 / 復帰不能 / accessibility
- `designer-expert` — 美しさ: token bypass / 共通 component bypass / visual hierarchy / design system 負債

opt-in:

| フラグ | 追加 expert | 用途 |
|---|---|---|
| `--include-test` | `test-expert` | ゴミテスト・カバレッジ穴 |
| `--include-feature` | `feature-expert` | silent fork / wrapper bypass / implementation gap / spec divergence |
| `--all-experts` | 上記 2 体 | 8 expert 一括 |

---

## 実行モード

| モード | 起動 | 起票 |
|---|---|---|
| 対話 (デフォルト) | `/op-scan [scope]` | ユーザー承認後 |
| 自動 | `/op-scan --auto [scope]` | 品質 gate + auto-policy 通過分のみ |
| 観点限定 | `/op-scan --domain debug,security` | 通常通り |
| expert 拡張 | `/op-scan --include-test` / `--all-experts` | 通常通り |
| Issue 正規化 | `/op-scan --from-issue #N` | severity フィルタ無効、派生 Issue を起票 |
| merged PR follow-up | `/op-scan --from-merged-pr <PR>` | plan モード承認後に follow-up Issue を起票 |

### `--domain` の値 / scope

- `--domain` は expert 名 (suffix `-expert` 省略可) のカンマ区切り: `debug, refactor, optimize, security, ux-ui, design, test, feature`。
  alias: `ux` / `ui` / `ux-ui-audit` → `ux-ui`、`designer` / `theme` / `token` → `design`。
- `scope` はディレクトリパス。省略時はリポジトリ全体。
- **scope 省略時の注意**: full-repo は complexity が complex/critical に倒れ、全 expert が Opus になる
  (`model-selection.md` §5.2)。対話モードでは 1 回だけ「full-repo Opus で続行 / scope を絞る / op-patrol に切替」を
  ユーザーに確認する。`--auto` / 非対話は確認せず警告ログのみ。区画ごとに model を下げたい広域監査は op-patrol を使う。

---

## read-only policy (op-patrol と共通)

audit 中 (フェーズ0〜3) の許可・禁止。op-patrol もこの節に従う。

- 許可: `Read` / `Grep` / `Glob`、`git status` / `log` / `diff` / `ls-files`、read-only な `op` CLI (`op issue list|view`、`op scan *`、`op core *` 等)。
- 禁止: ソースコード変更 (`Edit` / `Write` / `NotebookEdit`)、format / lint fix、build、test 実行、依存関係変更。
- 書き込みは起票フェーズの `op issue create` (と `--from-issue` の元 Issue へのコメント / ラベル、`--from-merged-pr` の親 PR trace コメント) のみ。
  対話モードはユーザー承認後、`--auto` は `_shared/auto-policy.md` 通過分のみ。

---

## 参照ドキュメント

- `~/.claude/skills/_shared/filing-gate.md` — 起票前ゲート (レビュー / dedup / 直列起票 / UI Issue) の正本
- `~/.claude/skills/_shared/refute-contract.md` — refute の worker 契約と controller 適用 (§7)
- `~/.claude/skills/_shared/runtime-contract.md` / `active-expert-registry.md` / `planned-experts.md` — spawn 可否
- `~/.claude/skills/_shared/expert-spawn.md` — canonical scan schema / domain extension / Marker Publish Validate
- `~/.claude/skills/_shared/severity-rubric.md` / `auto-policy.md` / `dedup-policy.md`
- `~/.claude/skills/_shared/pr-templates.md` — Issue 本文テンプレ (指示書フル版 / バッチ版)
- `~/.claude/skills/_shared/common-setup.md` / `workflow-calling.md` / `github-channel.md` / `read-economy.md`
- `~/.claude/skills/_shared/model-selection.md` — `region.audit_model`。audit / refute は read-only のため `fable` 禁止
- `~/.claude/skills/_shared/op-config-schema.md` — `domain_tags` / `complexity_thresholds`
- `~/.claude/workflows/op-scan-audit.js` — audit + refute の Dynamic Workflow (prompt / schema の正本)
- `references/from-issue-mode.md` — `--from-issue #N` 指定時のみ読む
- `references/from-merged-pr-mode.md` — `--from-merged-pr <PR>` 指定時のみ読む

---

## フェーズ0: 環境確認

- `_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」を実行する (gh channel で未認証なら中断)。
- 続けて Workflow tool の capability preflight (`workflow-calling.md` §1)。`--from-merged-pr` は audit を持たないため skip。
- controller は全フェーズで `read-economy.md` の Controller 規律に従う。

---

## フェーズ1: 観点別並列 audit (op-scan-audit Workflow)

controller の責務: expert list の決定 → installed check → model 確定 → Workflow 呼び出し → 戻り値受領。
並列上限は workflow runtime が管理するので controller は cap しない。audit prompt 本文は `op-scan-audit.js` の `buildAuditPrompt()` が正本。

### 起動する expert の決定

1. デフォルト 6 expert
2. `--domain` 指定時はそのリストのみ (alias は上記)
3. `--include-test` / `--include-feature` / `--all-experts` で追加

### installed check

```bash
op core registry-verify --lens registry-agent
```

`effective_severity == "error"` の agent を spawn list から除外し `SKIPPED_PLANNED` として最終報告に併記する
(silent 除外禁止、`workflow-calling.md` §3)。grep 等で代替しない。

| ケース | 挙動 |
|---|---|
| デフォルト構成に planned / 欠落 expert が含まれる | skip + `SKIPPED_PLANNED` に併記 |
| `--domain <planned>` 明示 (例: `--domain env`) | 司令官が grep ベースの fallback scan を行う。planned 名は routing metadata として残してよいが spawn しない。fallback した事実をフェーズ3 サマリと最終報告に明示 |
| `--domain` が planned のみ | fallback scan。結果が空なら空で正常終了 |

active expert は `subagent_type: "op-skill:<expert-name>"` で spawn される (`expert-spawn.md` §Plugin scoped-name 規約)。

### op-scan-audit Workflow 呼び出し

```
const auditOut = await Workflow({
  name: "op-scan-audit",
  args: {
    mode: "normal",                        // --from-issue は references/from-issue-mode.md
    scope: "<対象スコープ>",
    domain: "<--domain 指定時のみ>",
    experts: [ { name: "<expert-name>", model: "<region.audit_model>" } /* , ... */ ],
    audit_model: "<region.audit_model の既定値>",
    today: "<YYYY-MM-DD>",                 // controller が date -u +%F で確定 (agent に date を実行させない)
    extra_directives: null,
  },
});
// auditOut.result.findings — 全 expert の scan-finding (detected_by / finding_ref 付き)
// auditOut.result.verdicts — High/Critical に対する refute verdict (フェーズ1.5)
```

- `.result.*` の unwrap は `workflow-calling.md` §2、args 注入規約は §4。
- model は `model-selection.md` §5.2 (single/typical → sonnet、complex/critical → opus)。

### 各 expert の出力

- すべて `expert-spawn.md` の canonical schema に従う。スキーマ外 field は無視する。
- `domain: refactor` / `domain: security` の finding は domain extension field
  (`expert-spawn.md` §domain extension、各 expert の `references/report-schema.md`) を Issue 本文へ必ず転写する。
  必須 field が欠けていれば不完全 finding として reject し、再 spawn するか `manual_review_bucket` に回す。
- `security.attack_path.reachable: false`、または `usable_security.legitimate_workflow_preserved: false` の mitigation を提案する security finding は起票しない。
- `finding_type: needs_spec_decision` かつ `needs_human_decision.can_continue_without_decision: true` の refactor finding は不完全 finding として reject する。

---

## フェーズ1.5: refute 適用

`auditOut.result.verdicts` を `finding_ref` で finding に突合して適用する。
適用順・verdict の扱い・表示ルール・走る経路は `_shared/refute-contract.md` §7 が正本。

### trust model

`refute-contract.md` §7.2 (schema 強制 / drop 方向の literal 照合 / verdict 整合 / security 非対称) に従う。
refute は近似 gate であり、その限界を完了報告に明記する。

---

## フェーズ2: 結果統合・重複除外

順序不変則 (逆転禁止): **refute → severity gate → 統合 → bulk-group → dedup (`op scan dedup`) → 起票**。
severity gate は `_shared/severity-rubric.md` で Critical/High 以外を落とす。

### 2-1. 統合

- 同一ファイル + 行範囲 ±5 行以内、または title が意味的に同じものを重複候補とする。
- 重複は severity の高い方を採用し、別 expert の指摘は本文に補足として追加する。
- ux-ui と design: 同一ファイルでも観点が違えば (使いやすさ vs 美しさ) 両方起票する。
  同一観点の重複は ux-ui-audit-expert を採用し designer の指摘は補足にする。

### 2-1-b. バッチ起票判定 (bulk_group)

```bash
op scan bulk-group --findings-json findings.json --json   # mcp channel では --input-json で既存 Issue 素材を注入
```

閾値・optimize / refactor の batch 特例は CLI が判定する (`_shared/clustering.md` と同じ)。

### 2-2. fingerprint 生成 + 重複・衝突チェック

- 各 finding の fingerprint を `op core fingerprint` (バッチは `op core fingerprint-bulk`) で生成する。手書き禁止 (`dedup-policy.md`)。
- `op scan dedup --findings-json drafts.json --json` で既存 Issue との重複 (block) と類似 (warn) を判定する。
  扱いは `filing-gate.md` §2。重複で skip したものは最終報告に「既存 Issue #N と重複」と記録する。

### 2-3. 並び替え

1. severity (critical > high)
2. expert (security > debug > refactor > optimize > ux-ui > design > feature > test)
3. ファイル名昇順

---

## フェーズ3: ユーザー承認

### 対話モード (デフォルト)

```
## op-scan 検出結果

### サマリ
| expert | Critical | High | 既存重複 |
|---|---|---|---|
| security-expert | 1 | 0 | 0 |
| debug-expert    | 0 | 2 | 1 |
| **合計**        | **1** | **2** | **1** |

### 起票候補 (3 件)
| # | severity | expert | title | files |
|---|---|---|---|---|
| 1 | critical | security | SQL Injection の可能性 | api/query.py:45 |

### 既存 Issue と重複でスキップ (1 件)
- #34 と同等: api/handler.py の null check 漏れ

### 要確認 (manual_review_bucket / 類似 Issue あり)
- ...

起票しますか?
1. すべて起票
2. Critical のみ
3. 番号で個別選択 (例: 1,3)
4. キャンセル
```

承認前に起票しない。

### 自動モード (`--auto`)

`--auto` は人間承認だけを skip する。refute / severity gate / dedup は飛ばさない。各 finding を評価する:

```bash
op scan eligibility --finding-json finding.json   # auto-policy #1〜#7
```

#8 (重複) はフェーズ2-2 の `op scan dedup`。いずれかを満たさない finding は起票せず `manual_review_bucket` に入れ、
次の対話提示で「要確認」として見せる。

---

## フェーズ4: Issue 起票

起票手順は `_shared/filing-gate.md` §3 に従う (marker-lint → `op issue create` を 1 件ずつ直列)。

- 通常検出: `pr-templates.md`「Issue 本文 (指示書フル版)」。hypothesis / excluded_hypotheses / scope_in / scope_out /
  verification_steps / success_criteria / gotchas をすべて展開する。
- 同一 bulk_group 5 件以上 (bulk-group 判定 pass): `pr-templates.md`「Issue 本文 (バッチ版)」。
- additive 検出 (test 不足・機能追加): `recommendation` の実装計画 (`expert-spawn.md`「実装計画の埋め込み」) を指示書節に貼る。
- UI を含む Issue: `filing-gate.md` §4 (見た目の仕様は文章で書かない。モックがあれば `デザインモック: <URL>` の 1 行)。

### Issue 本文 hidden marker (op-patrol と共通)

本文冒頭に埋める marker はこれだけ:

```markdown
<!-- op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol> -->
<!-- op-run-expert: <recommended_runner> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | env-expert | null> -->
```

- バッチ Issue は `op-fingerprint` の代わりに `<!-- op-fingerprint-bulk: <domain>:<bulk_group>:<primary_dir> -->` (`op core fingerprint-bulk`)。
- refactor の debt 系 finding (`finding_type` ∈ `architecture_debt` / `staged_refactor` / `needs_spec_decision`) は
  `op-fingerprint` に加えて debt 追跡キーとして `op-fingerprint-bulk` (`op core fingerprint-bulk --domain refactor --bulk-group <g> --primary-dir <affected_paths の LCA>`) も埋める。
- domain は fingerprint の第 1 segment で表す。検出 expert・元 Issue などの情報は本文の自然文で書く。
- `op-post-check-expert` は post-check 不要でも省略せず `null` を書く。
- 値は canonical schema の `recommended_runner` / `post_check_expert` を転写する。欠けていれば下表で補完する。
  planned expert / spec-expert を書く場合は metadata only。

#### domain → marker パターン表

op-scan / op-patrol 共通の正本。

| domain | op-run-expert | op-post-check-expert | 補足 |
|---|---|---|---|
| `debug` | debug-expert | `null` | |
| `refactor` | refactor-expert | `null` / security-expert / ux-ui-audit-expert | file IO・path・capability・shell・secret 系は security、UI state・flow・a11y・visual 系は ux-ui (`expert-refactor/references/post-check-policy.md`) |
| `optimize` | optimize-expert | `null` | |
| `security` | security-expert | security-expert | op-run が apply を debug-expert に回す場合あり |
| `ux-ui` | designer-expert | ux-ui-audit-expert | 使いやすさ番人が検出 → 美しさ番人が実装 |
| `design` | designer-expert | ux-ui-audit-expert (UI files) / `null` (token・config のみ) | |
| `test` / `feature` (UI 影響なし) | test/feature-expert | `null` | |
| `feature` (UI 影響あり) | feature-expert | ux-ui-audit-expert | silent な UX 退化防止 |
| `env` (planned) | env-expert | env-expert | routing metadata only |

### ラベル付与

- `auto-report`、`severity:critical` または `severity:high`
- apply 担当の `pro-<expert>-expert` (完全形。短縮形は使わない。正本 `labels-and-markers.md`)
- post-check 担当がいれば `pro-ux-ui-audit-expert` / `pro-security-expert` を追加
  (security は基本 `pro-security-expert` 1 つ。apply を debug-expert に回す場合は `pro-debug-expert` + `pro-security-expert`)
- env は `pro-env-expert` (routing metadata only)
- バッチ Issue は `batch`
- `op issue create --label "auto-report,severity:high,..."` とカンマ区切りで渡す。

#### domain=refactor 固有のラベル付与ルール

refactor finding は以下を追加で付与する (op-patrol も同じ表を使う)。finding_type はラベルで表現する。

| 条件 | 追加ラベル |
|---|---|
| `finding_type == architecture_debt` | `op:architecture-debt` (op-patrol が既存 debt Issue を探す正本ラベル。付け忘れると重複起票) |
| `finding_type == staged_refactor` | `op:staged-refactor` |
| `finding_type == needs_spec_decision` または `needs_human_decision.decision_type == spec` | `needs:spec-decision` |
| `blocking == true` | `op:blocking-finding` (op-run で最優先・単独実行) |
| `needs_human_decision.required == true` | `needs:human-decision` (block 全体を本文に転写) |
| 上記かつ `can_continue_without_decision == true` かつ `finding_type != needs_spec_decision` | `needs:human-decision-followup` (op-run は safe_first_step のみ apply し、blocked_actions を守る) |
| `needs_human_decision.decision_type == boundary` | `needs:boundary-decision` (単独では apply を止めない) |
| `seen_count >= 3` または `affected_paths` 増加 | `needs:triage` (op-patrol のみ) |

#### Marker Publish Validate

各 `op issue create` の直前に `expert-spawn.md`「Marker Publish Validate」の 2 段 validate を行う
(`op core marker-lint --body-file <本文> --source-hint issue-body --strict`)。
lint 結果を確認してから起票し、`||` で握り潰さない。block なら起票せず、対話はユーザーに提示、`--auto` は `manual_review_bucket` へ。

mcp channel では `op issue create` / `op issue comment` が call-spec を emit する。`github-channel.md` §3-§4 で完遂し、
新 Issue 番号は ingest envelope から取る。

---

## フェーズ5: 完了報告

```
## op-scan 完了

### 起票結果
| # | Issue | severity | expert | title |
|---|---|---|---|---|
| 1 | #62 | critical | security | SQL Injection の可能性 |

### 統計
- 起票: N 件 / スキップ (重複): N 件 / manual_review_bucket: N 件
- refute: confirmed N / refuted N / downgrade N
- 検出 0 件: <expert>
- SKIPPED_PLANNED / fallback scan: <あれば>

### refute で偽陽性/過大判定 (起票しない)
- [refuted] <expert> / "<title>" — evidence_excerpt: `<再 Read したコード片>` (<file:line-line>)
- (なければ「なし」)
- 注: refute は近似 gate。取りこぼしは次回 scan / patrol で再検出する前提

次は `/op-run` で Issue を実装できます。
```

---

## 特殊モード

- `--from-issue #N` (op-run からの委譲を含む): `references/from-issue-mode.md` を読む。
- `--from-merged-pr <PR>`: `references/from-merged-pr-mode.md` を読む (Cloud / mcp channel 非対応)。
