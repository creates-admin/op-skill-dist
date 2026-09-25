---
name: op-scan
description: デフォルト 6 expert (debug / refactor / optimize / security / ux-ui / design) を並列 spawn して観点別にコードベースを audit し、Critical/High だけを GitHub Issue として起票するスキル。test / feature は --include で追加。--from-issue で人間立て Issue を指示書フル版に正規化する。「スキャン」「op-scan」「監査」「Issue 起票」「正規化」等のキーワードで起動。
---

# op-scan: 観点別並列 audit + Issue 起票

コードベースを観点別に並列 audit し、Critical/High の問題だけを GitHub Issue にする。
scan はコードを変更しない。起票は人間承認後 (`--auto` は品質 gate を通過した分のみ)。

---

## Expert Runtime and Routing Metadata Contract

spawn 可否の正本は `_shared/runtime-contract.md` / `active-expert-registry.md` / `planned-experts.md`。
scan で spawn するのは active expert のみ (planned / scout / spec-expert は spawn しない)。review-expert は spawn せず、routing 値にも書かない。

---

## expert 構成

デフォルト 6 expert:

- `debug-expert` — バグ・エッジケース・例外握りつぶし
- `refactor-expert` — 散乱 token / god function / 責務境界混線 / 依存逆流 / 重複 / dead code / architecture debt
- `optimize-expert` — ボトルネック・N+1・メモリリーク
- `security-expert` — 脆弱性・入力検証・認証バイパス・IPC / file IO / shell / capability
- `ux-ui-audit-expert` — 使いやすさ: UX 障害パス / 必須 state 欠如 / 復帰不能 / accessibility
- `designer-expert` — 美しさ: token bypass / 共通 component bypass / visual hierarchy / design system 負債

opt-in: `--include-test` (`test-expert`: ゴミテスト・カバレッジ穴)、`--include-feature` (`feature-expert`: silent fork / wrapper bypass /
implementation gap / spec divergence)、`--all-experts` (両方)。

---

## 実行モード

| モード | 起動 | 起票 |
|---|---|---|
| 対話 (デフォルト) | `/op-skill:op-scan [scope]` | ユーザー承認後 |
| 自動 | `/op-skill:op-scan --auto [scope]` | 品質 gate + auto-policy 通過分のみ |
| 観点限定 | `/op-skill:op-scan --domain debug,security` | 通常通り |
| expert 拡張 | `/op-skill:op-scan --include-test` / `--all-experts` | 通常通り |
| Issue 正規化 | `/op-skill:op-scan --from-issue #N` | severity フィルタ無効、派生 Issue を起票 |
| merged PR follow-up | `/op-skill:op-scan --from-merged-pr <PR>` | plan モード承認後に follow-up Issue を起票 |

### `--domain` の値 / scope

- `--domain` は expert 名 (suffix `-expert` 省略可) のカンマ区切り: `debug, refactor, optimize, security, ux-ui, design, test, feature`。
  alias: `ux` / `ui` / `ux-ui-audit` → `ux-ui`、`designer` / `theme` / `token` → `design`。
- `scope` はディレクトリパス。省略時はリポジトリ全体。
- scope 省略時、対話モードでは 1 回だけ「full-repo で続行 / scope を絞る / op-patrol に切替」を確認する (full-repo は audit model が上がる。
  `model-selection.md` §5.2)。`--auto` / 非対話は確認せず警告ログのみ。

---

## read-only policy (op-patrol と共通)

audit 中 (フェーズ0〜3) は `severity-rubric.md`「scan 実行レベル」に従う (controller も同じ)。read-only な `op` CLI (`op issue list|view`、`op scan *`、`op core *` 等) は使ってよい。
書き込みは起票フェーズの `op issue create` (と `--from-issue` の元 Issue へのコメント / ラベル、`--from-merged-pr` の親 PR trace コメント) のみ。

---

## フェーズ0: 環境確認

- `_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」を実行する。gh channel で未認証なら中断する。
  Workflow の capability preflight は `--from-merged-pr` では skip する。
- controller は全フェーズで `read-economy.md` の Controller 規律に従う。

---

## フェーズ1: 観点別並列 audit (op-scan-audit Workflow)

controller の責務: expert list の決定 → installed check → model 確定 → Workflow 呼び出し → 戻り値受領。
audit prompt 本文は `workflows/op-scan-audit.js` の `buildAuditPrompt()` が正本。

### 起動する expert の決定

1. デフォルト 6 expert
2. `--domain` 指定時はそのリストのみ (alias は上記)
3. `--include-test` / `--include-feature` / `--all-experts` で追加

### installed check

```bash
op core registry-verify --lens registry-agent
```

`effective_severity == "error"` の agent を spawn list から除外する (`workflow-calling.md` §3)。grep 等で代替しない。
`--domain` に planned expert だけが指定された場合 (例: `--domain env`) は、司令官が grep ベースの fallback scan を行い、
fallback した事実をフェーズ3 サマリと最終報告に明示する (結果が空なら空で正常終了)。

### op-scan-audit Workflow 呼び出し

```
const auditOut = await Workflow({
  name: "op-skill:op-scan-audit",
  args: {
    mode: "normal",                        // --from-issue は references/from-issue-mode.md
    scope: "<対象スコープ>",
    experts: [ { name: "<expert-name>", model: "<model>" } /* , ... */ ],
    today: "<YYYY-MM-DD>",
  },
});
// auditOut.result.findings — 全 expert の scan-finding (detected_by / finding_ref 付き)
// auditOut.result.verdicts — High/Critical に対する refute verdict (フェーズ1.5)
```

- `experts[].name` は prefix なしの素の agent 名 (`debug-expert`)。`op-skill:` prefix は workflow が付ける。
- model は `model-selection.md` §5.2。unwrap / args 規約は `workflow-calling.md` §2 / §4。

### 各 expert の出力

- `expert-spawn.md` の canonical schema に従う。`domain: refactor` / `domain: security` の domain extension field は
  `expert-spawn.md`「domain extension」に従って Issue 本文へ転写する。必須 field が欠けていれば再 spawn するか `manual_review_bucket` に回す。
- `security.attack_path.reachable: false`、または `usable_security.legitimate_workflow_preserved: false` の mitigation を提案する security finding は起票しない。
- `finding_type: needs_spec_decision` かつ `needs_human_decision.can_continue_without_decision: true` の refactor finding は不完全 finding として reject する。

---

## フェーズ1.5: refute 適用

`auditOut.result.verdicts` を `finding_ref` で finding に突合して適用する。適用順・verdict の扱い・表示ルールは `_shared/refute-contract.md` §7。

### trust model

`refute-contract.md` §7.2 に従う。

---

## フェーズ2: 結果統合・重複除外

順序は `refute-contract.md` §7.1。severity gate は `_shared/severity-rubric.md` で Critical/High 以外を落とす。

### 2-1. 統合

- 同一ファイル + 行範囲 ±5 行以内、または title が意味的に同じものを重複候補とする。
- 重複は severity の高い方を採用し、別 expert の指摘は本文に補足として追加する。
- ux-ui と design: 同一ファイルでも観点が違えば (使いやすさ vs 美しさ) 両方起票する。
  同一観点の重複は ux-ui-audit-expert を採用し designer の指摘は補足にする。

### 2-1-b. バッチ起票判定 (bulk_group)

```bash
op scan bulk-group --findings-json findings.json --json   # mcp channel では --input-json で既存 Issue 素材を注入
```

### 2-2. fingerprint 生成 + 重複・衝突チェック

fingerprint は `op core fingerprint` / `op core fingerprint-bulk` で生成し、`op scan dedup --findings-json drafts.json --json` で判定する
(扱いは `filing-gate.md` §2)。`decision == "block"` は次の 3 通りに分ける:

- `matched_existing` あり → 既存 Issue と重複。起票せず、最終報告に「既存 Issue #<`matched_existing.issue_number`> と重複」と記録する。
- `matched_draft` あり → run 内重複 (先行 draft と fingerprint 完全一致)。起票せず先行 draft に統合し、最終報告に「先行 draft「<`matched_draft.draft_title`>」と統合」と記録する。
- どちらも無い → 想定外として fail-closed。起票せず `blocking_reasons` を添えて、対話はユーザーに提示、`--auto` は `manual_review_bucket` へ。

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

### 起票候補 (N 件)
| # | severity | expert | title | files |
|---|---|---|---|---|
| 1 | critical | security | SQL Injection の可能性 | api/query.py:45 |

### 既存 Issue と重複でスキップ (N 件)
- #34 と同等: api/handler.py の null check 漏れ

### run 内重複で統合 (N 件)
- 先行 draft「<matched_draft.draft_title>」と fingerprint 完全一致: <title>

### 要確認 (manual_review_bucket / 類似 Issue あり)
- ...

起票しますか?
1. すべて起票  2. Critical のみ  3. 番号で個別選択 (例: 1,3)  4. キャンセル
```

承認前に起票しない。

### 自動モード (`--auto`)

`--auto` は人間承認だけを skip する (`refute-contract.md` §7.4)。各 finding を評価する:

```bash
op scan eligibility --finding-json finding.json   # auto-policy #1〜#7
```

#8 (重複) はフェーズ2-2 の `op scan dedup`。いずれかを満たさない finding は起票せず `manual_review_bucket` に入れ、
次の対話提示で「要確認」として見せる。`--auto` は完了報告まで完遂する。途中で止まってよいのは gh 認証失敗 / Workflow 利用不可のときだけ。

---

## フェーズ4: Issue 起票

起票手順は `_shared/filing-gate.md` §3 (marker-lint → `op issue create` を 1 件ずつ直列)。

- 本文は `pr-templates.md`「Issue 本文 (指示書フル版)」。同一 bulk_group 5 件以上 (bulk-group 判定 pass) は「Issue 本文 (バッチ版)」。
- additive 検出 (test 不足・機能追加): `recommendation` の実装計画 (`expert-spawn.md`「実装計画の埋め込み」) を指示書節に貼る。
- UI を含む Issue: `filing-gate.md` §4。

### Issue 本文 hidden marker (op-patrol と共通)

marker とラベルは `pr-templates.md`「Issue 本文 hidden marker」/「domain → marker / ラベル表」。値は canonical schema の
`recommended_runner` / `post_check_expert` を転写し、欠けていれば同表で補完する。

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

各 `op issue create` の直前に `expert-spawn.md`「Marker Publish Validate」を行う
(`op core marker-lint --body-file <本文> --source-hint issue-body --strict`)。block なら起票せず、対話はユーザーに提示、`--auto` は `manual_review_bucket` へ。
mcp channel の call-spec 完遂は `github-channel.md` §3-§4 (新 Issue 番号は ingest envelope から取る)。

---

## フェーズ5: 完了報告

```
## op-scan 完了

### 起票結果
| # | Issue | severity | expert | title |
|---|---|---|---|---|

### 統計
- 起票: N 件 / スキップ (重複): N 件 / manual_review_bucket: N 件
- refute: confirmed N / refuted N / downgrade N
- 検出 0 件: <expert>
- SKIPPED_PLANNED / fallback scan: <あれば>

### refute で偽陽性/過大判定 (起票しない)
- [refuted] <expert> / "<title>" — evidence_excerpt: `<再 Read したコード片>` (<file:line-line>)
- (なければ「なし」)

次は `/op-skill:op-run` で Issue を実装できます。
```

refute の限界の明示は `refute-contract.md` §7.2。

---

## 特殊モード

- `--from-issue #N` (op-run からの委譲を含む): `references/from-issue-mode.md` を読む。
- `--from-merged-pr <PR>`: `references/from-merged-pr-mode.md` を読む (Cloud / mcp channel 非対応)。
