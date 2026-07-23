---
name: expert-refactor
description: refactor-expert agent の方法論教科書。挙動非変更を絶対条件として、散乱 token / god function / large file / large component / 責務境界混線 / ディレクトリ構造劣化 / 依存逆流 / 重複ロジック / dead code / architecture debt の検出・段階改善・追跡手順とパターンを集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-refactor: refactor-expert の知識ベース

<!--
機能概要: refactor-expert agent が op-scan / op-patrol / op-run から呼ばれた際に
         参照する方法論・パターン・schema を集約した教科書。
         挙動非変更を絶対条件にした構造改善エージェント用 skill。
作成意図: agent.md は人格と契約に集中させ、HOW の本体はここに置く。
         旧 refactor-expert は token 散乱や architecture_debt の概念を持たなかったため、
         OP スキル群の長期保守性の番人として再設計し、検出・段階改善・追跡を成立させる。
注意点: agent から skills: で自動プリロードされる前提。直接 /expert-refactor のような
       起動は基本想定しない (description で自然に抑制)。
-->

## このドキュメントの位置づけ

refactor-expert agent (`~/.claude/agents/refactor-expert.md`) が `skills: [expert-refactor]` で本ファイルを自動プリロードする。

agent はここに書かれた **判断基準・mode 別契約・canonical schema 出力契約・post-check 優先順位**
に従って自走する。詳細は `references/*.md` を必要時に Read する。

---

## Purpose

挙動を変えずに、構造的負債を減らす。

この skill は、refactor-expert が scan / patrol / apply で使う正式 skill である。

対象は、**散乱 token**、**ゴッド関数**、**巨大ファイル**、**巨大 component**、**責務境界の混線**、
**ディレクトリ構造劣化**、**依存方向の逆流**、**重複ロジック**、**dead code**、
**architecture debt** である。

`refactor-expert` は「全部きれいにする agent」ではない:

```text
安全に直せる構造負債は直す
一度で直せない負債は分解して追跡する
境界判断が必要なものは人間に返す
新規悪化だけは止める
```

---

## Technology Profile (常時参照スコープ)

```yaml
active_stack:
  - Rust          # ドメインロジック・Tauri backend
  - Tauri v2      # WebView + Rust の境界
  - Vue 3         # フロントエンド (Composition API + Pinia + Vuetify)
  - TypeScript    # Vue / Tauri フロントの型システム
  - Dart          # Flutter アプリ
  - Flutter       # クロスプラットフォーム UI

conditional_stack:
  - React  # 通常 scan 対象外。scope_in に明示された場合または変更差分に含まれる場合のみ対象
  - Go     # 通常 scan 対象外。scope_in に明示された場合または変更差分に含まれる場合のみ対象
```

active_stack の構造劣化のみ通常 scan で報告対象。
React / Go は `scope_in` に明示されている場合、または op-run の変更差分に含まれる場合のみ
報告対象とする。それ以外は `ignored_noise` に分類して捨てる。

これは「他社製 OSS / generated / vendor が repo 内に同居している場合に
完全無視で実害を見落とすこと」を避けるための例外運用。
通常 patrol / 通常 scan で React / Go を検出しに行くことはしない。

---

## Severity Policy (報告閾値)

報告対象は **Critical / High のみ**。判定基準を以下に固定する。

行数だけでは Issue 化しない:

```text
行数 = scan trigger
責務混在 = Issue 化の根拠
```

### severity と blocking は分離する

severity は finding の **重大度** を、blocking は op-run / op-merge を **止めるべきか** を、
それぞれ独立して扱う。Critical = blocking ではない。

```text
severity = high + blocking = true   ← よくあるケース (新規悪化を止める)
severity = critical + blocking = true  ← 重大かつ即対応必須 (例: contract 破壊)
severity = high + blocking = false  ← 観測しているが本 PR では止めない
```

### Critical (限定的)

以下のいずれかに該当する場合のみ Critical:

- public API / IPC contract / serialized format / DB schema の同期境界が現に崩壊している
  (build を壊しているか、実行時 silent 破壊が確認できる)
- 既にビルド破壊または実行時破壊に直結している循環依存
- file IO / permission / shell 周辺で security-expert post-check が必要な構造悪化が
  進行中で、現バージョンの本番 build に影響している

これら以外は Critical にしない。「悪化のリスクがある」だけでは Critical にならない。

### High (主たる起票対象)

- 同じ意味の literal / token / path / key が 3 箇所以上に散っており、
  2 つ以上の layer / module / feature を跨いでいる
- god function / large file / large component が責務複数を抱え、変更理由が複数化している
- import 方向の逆流 / shared が domain を import / utils 配下に feature 固有処理が漏れている
- active path と紛らわしい dead code が残り、新規実装が誤再利用するリスクがある
- 既存 architecture_debt の腐敗度が以下のいずれかで上がっている:
  - 変更頻度が高い feature に存在する
  - 新規実装が同じ負債を悪化させている (この場合 `blocking: true` も付与)
  - file IO / path / IPC / config / storage / serialized data に絡む
  - 依存逆流により複数 feature へ波及している
  - `seen_count >= 3` (既存 Issue から **op-patrol が渡す値**。agent はこの値を推測・算出せず、
    与えられた値をこの条件式にそのまま当てはめるだけ — 新規検出時は常に `seen_count=1` のため該当しない)
  - `affected_paths` が増加している
  - shared / common / utils に feature 固有責務が漏れている

### blocking フラグ

severity と独立に、以下のいずれかを満たす finding は `blocking: true` を付与する。
`blocking_reason` を必ず添える。

- 新規変更 (今回のスキャン対象 PR / 変更ファイル) が既存 architecture_debt を悪化させている
- public API / IPC contract / serialized format / file location に近接する変更が
  refactor PR 内で進行しており、scope_out を踏もうとしている
- 構造的に Critical 級だが severity を Critical に上げる前に、まず本 PR を止めて
  人間判断を仰ぎたいケース

`blocking: true` の finding は `op:blocking-finding` ラベルで起票され、
op-run / op-merge は **解消されるまで進めない**。

### Medium / Low

原則として detect mode では **報告しない**。`ignored_noise` に分類して捨てる。
好み / formatter で解決する整形問題 / 2 箇所程度の軽微な重複もここに含む。

---

## Modes

### scan モード (op-scan 経由)

明示範囲・変更範囲・Issue 起点で、op-run 可能な refactor finding を検出する。

- Read / Grep / Glob のみ使用
- コードを変更しない
- machine-readable output は canonical schema JSON 配列のみ
- domain は `"refactor"` 固定
- recommended_runner は `"refactor-expert"` 固定
- post_check_expert は **原則 `null`** (検証リスクが高い場合のみ specialist 1 つを指定)
- Critical / High のみ報告
- Medium / Low / 好み / formatter 問題は finding として返さない
- `ignored_noise` は JSON finding として返さない
- `bulk_group` を必ず付与
- subtype を必要に応じて付与
- 一度で直せない巨大負債は捨てず、`architecture_debt` finding として記録する

### patrol モード (op-patrol 経由)

repo 全体を risk-weighted に巡回し、構造劣化・architecture_debt・新規悪化を検出する。

主な patrol 対象:

- 肥大化し続けているファイル
- ゴッド関数 / 巨大 Tauri command / 巨大 Vue component / 巨大 Flutter Widget
- utils / common / helpers のゴミ箱化
- feature 間の依存逆流
- path / key / command / status / token の散乱
- ディレクトリ構造の一貫性崩壊
- architecture_debt の再検出
- 新規コードによる既存負債の悪化

#### Patrol Sampling Policy

op-patrol では repo 全体を均等に見ず、risk-weighted に巡回する。

優先度高:

- 最近変更されたファイル
- 行数が増加傾向のファイル
- import 数が多いファイル
- public export が多いファイル
- utils / common / helpers
- src-tauri commands
- feature boundary
- path / config / IPC / storage / status を含むファイル
- 過去に `architecture_debt` として検出された affected_paths
- 新規実装によって触られた既存 debt 周辺

出力契約は scan モードと同じ。

### apply モード (op-run 経由、worktree 隔離)

Issue 指示書に従い、挙動非変更の範囲で構造改善する。

- Issue 指示書の `scope_in` に閉じる
- 仕様変更しない
- bug fix を混ぜない
- performance optimization を混ぜない
- feature 実装を混ぜない
- 不変則 (後述) を厳守
- 変更前に Grep で参照元を確認する (**inbound-ref grep は repo 全体を対象にする** → 下記ガード参照)
- 小さな単位で抽出・移動・統合する
- 既存テストを維持する
- 新規テスト設計は原則 test-expert に委譲する
- 変更後に一次検証 (verification ladder Level 0〜2) を行う
- 検証不能な箇所は `residual_risk` として apply report に明記する
- push / PR 作成は司令官に任せる

#### apply 時の不変則 (絶対に変更しない)

保護対象の正本一覧は「Apply Report」節の `contract_preservation` (正本) を参照。
file location の変更が避けられない場合は移動せず `staged_refactor` で計画化する。
加えて UI 見た目 / UX flow / DOM 構造 / props / emit / class / key / focus / state も変更しない
(component 分割時の詳細は下記 Mechanical Refactor Guard を参照)。

#### Mechanical Refactor Guard (apply 時の禁止事項)

- grep 結果を見ずに一括置換する
- 同名 literal をすべて同じ意味とみなす
- 完全一致だけで機械的に置換する
- 型が通ることだけを根拠に責務を移動する
- public export を整理目的で削除する
- import path の循環確認なしにファイル移動する
- Rust module 分割時に visibility を広げてごまかす
- Vue / Flutter component 分割時に DOM 構造 / props / emit / class / key / focus / state を不用意に変える
- UI component 分割時に visual design / UX flow を変える

#### Doc 圧縮・再構成時の安全ガード (canonical doc refactor 専用)

##### prose 論理保存ガード

否定・列挙・閾値・条件分岐を含む命令文 (instructional prose) を圧縮・言い換えする場合は、
**圧縮前後で論理が一致することを canonical ソース / 同一ファイルの未変更箇所と照合してから commit する**。

具体的に確認すること:

- 否定表現 (`しない` / `ではない` / `以外`) が残っているか、正否が反転していないか
- 列挙の「全件」が保存されているか (途中省略による意味変更がないか)
- 閾値・数値 (`>=3` / `100 LOC` 等) が変わっていないか
- 条件分岐の「〜のとき」と「〜以外のとき」が入れ替わっていないか

「圧縮するな」ではない。「圧縮しても**論理を保て**」が原則。

##### inbound-ref grep スコープ拡張ガード

節番号・anchor (HTML id)・見出し文字列・ファイルパスを変更・削除する前に、
**repo 全体** (op-tools/ コードコメント・docs/specs・他 skill・agents/ 含む) を対象に grep し、
検出した **全 inbound 参照を同 PR で追従更新する**。

```bash
# 例: §7 番号変更前の全 repo 確認
grep -rn "§7\|section-7\|#7" . --include="*.md" --include="*.rs" --include="*.ts" --include="*.js"
```

- `files_allowed` 外ファイルで参照が見つかった場合は **全件を `blocked_actions[]` に網羅列挙**する
  (自己申告の取りこぼし禁止。「把握した 2 件のみ列挙」は不可)
- 節番号 renumber より **stable anchor の維持を優先**する
  (`<!-- anchor: section-name -->` 等で番号に依存しない参照先を確立すると drift が起きにくい)

---

## Canonical Schema Contract

scan / patrol の出力は `_shared/expert-spawn.md` の canonical schema JSON 配列に従う。

### refactor-expert の標準値

- domain: `"refactor"`
- recommended_runner: `"refactor-expert"`
- post_check_expert: **`ux-ui-audit-expert` | `security-expert` | `null` の 3 値のみ**

### Phase 1 の post_check_expert 許容値 (硬い制限)

詳細選択基準・禁止事項・逃がし先は `references/post-check-policy.md` を参照 (正本)。

許容値: `ux-ui-audit-expert` | `security-expert` | `null` の 3 値のみ。
op-run フェーズ3.5 dispatcher / Issue marker の許容値に揃える。

### Machine-readable Output

scan / patrol の machine-readable output は canonical schema JSON 配列のみとする。

- `ignored_noise` は JSON finding として返さない
- 質問テキスト / free-form 文を JSON に混ぜない
- 検出 0 件は `[]`
- ただし、人間向け report mode が op-scan / op-patrol 側で `allow_text_tail: true` を
  明示した場合のみ、非 blocking な観測を末尾にまとめてよい

---

## Refactor Execution Control

<!--
機能概要: refactor Issue を apply するときに参照すべき実行制御の集約節。
作成意図: op-run/SKILL.md の apply prompt が「expert-refactor/SKILL.md の
         『Refactor Execution Control』節を Read」と参照するため、本節を
         source of truth として明示する。Issue 本文の `## 🧱 Refactor Execution Control`
         節 (`_shared/pr-templates.md` で展開) と対になる。
注意点: 実装ルールが分散すると挙動非変更の絶対条件が破られやすい。本節は
       op-run / refactor-expert / Issue 本文の 3 者を 1 か所で同期させる入口。
-->

refactor Issue では、Issue 本文の `## 🧱 Refactor Execution Control` 節を
**source of truth** とする。本節はその意味と実行ルールを定義する集約点。

### Issue 本文 / scan finding から必ず確認する項目

- `finding_type` ∈ `immediate_refactor` / `staged_refactor` / `architecture_debt` / `needs_spec_decision`
- `execution_mode` ∈ `direct_apply` / `staged_refactor` / `needs_human_decision`
- `direct_apply_safe` (boolean)
- `safe_first_step` (architecture_debt / staged_refactor で必須)
- `proposed_stages` (順序付き stage 配列、architecture_debt / staged_refactor で必須)
- `forbidden_stage_actions` (本 PR で禁止する具体行為)
- `blocking` / `blocking_reason` (新規変更が既存 debt を悪化させる場合 true)
- `needs_human_decision` (構造化 block。`_shared/invocation-mode.md` の正規 schema。
  `required: true` なら本 PR で apply せず、block 全体 (`reason` / `decision_type` /
  `options[]` / `recommended_option` / `safest_default` / `blocked_actions[]` /
  `can_continue_without_decision` / `next_safe_action`) を完了報告に返す)
- `human_decision_points` (refactor 固有の補助配列。判断点を 1〜N 件で列挙)
- `decision_type` は `needs_human_decision.decision_type` 内に格納する
  (refactor で多用するのは `scope` / `behavior` / `boundary` / `spec`)

### 実行ルール

| finding_type | direct_apply_safe | 本 PR で実行する | 備考 |
|-------------|-------------------|------------------|------|
| `immediate_refactor` | `true` | scope_in 範囲のみで recommendation 全体を直接適用 | 通常の direct apply |
| `immediate_refactor` | `false` | 着手しない | 設定不整合。`needs:triage` で人間判断 |
| `staged_refactor` | `false` | `safe_first_step` のみ実行 | `proposed_stages[1..]` は本 PR で実行しない |
| `architecture_debt` | `false` | `safe_first_step` のみ実行 | 1 stage = 1 PR を厳守 |
| `needs_spec_decision` | `false` | 実装せず `needs_human_decision` block (`required: true`, `decision_type: spec` または `boundary`, `options[]`, `blocked_actions[]` ほか必須項目) を返す | 人間判断待ち |

### 不変則 (絶対条件)

- **挙動非変更** が絶対条件。保護対象の正本一覧 (public API の signature・trait/interface・引数順・
  戻り値型、serialized format、DB schema、migration、config format、IPC contract、Tauri command name、
  event name、permission name、path / key / status / error / env の実値、file location を含む) は
  「Apply Report」節の `contract_preservation` (正本) を参照。破らざるを得ない場合は実装せず
  `needs_spec_decision` として返す
- `forbidden_stage_actions` に列挙された行為は本 PR で実行しない
- `proposed_stages` の 2 つ目以降は **絶対に実行しない** (1 stage = 1 PR)

### blocking finding の扱い

- `blocking == true` の Issue は **op-run で最優先・単独実行**
  (`skills/op-run/SKILL.md` フェーズ1-2-pre)
- `op-merge` は `op:blocking-finding` ラベル付き Issue が repo に残っている間、
  当該 PR がそれを `Fixes #N` で閉じる場合に限り merge を許可
  (`skills/op-merge/SKILL.md` gate 19)
- agent 側の責務: **新規変更が既存 debt を悪化させた場合に finding に
  `blocking: true` + `blocking_reason` を付与して返す**こと。これは agent
  自身の判定 (今 PR / 変更ファイル起点) であり、過去回数推測ではない

### 完了報告に必須のフィールド

apply 完了時、以下を報告に必ず含める (完了手順の正本は `_shared/apply-completion-checklist.md`):

共通フィールド (`commits_added` / `code_review_invoked` / `code_review_result` /
`code_review_skip_reason` / `verification_executed`) の定義は
`_shared/expert-spawn.md`「修正完了報告 フィールドの必須性」節 (L841) を参照 (正本)。

refactor-expert 固有フィールド:
- `behavior_change_claim`: `"no_behavior_change"` (絶対条件)
- `contract_preservation`: 全 boolean (api / serialized / ipc / path / location)
  - いずれかを破る変更が必要なら、実装せず `needs_spec_decision` として返す
- `stage_executed`: 実行した stage 識別子 (`safe_first_step` / `direct_apply` / `N/A`)
- `forbidden_actions_respected`: `forbidden_stage_actions` を実行していないことの確認

詳細な report schema は `references/report-schema.md`、apply report は
本 SKILL.md の「Apply Report」節、architecture_debt 追跡は本 SKILL.md の
「Architecture Debt Tracking」節を参照。

---

## bulk_group カテゴリ (refactor-expert 固有)

カテゴリ一覧・scattered token の subtype 詳細は `references/refactor-taxonomy.md` を参照 (正本)。

---

## Refactor Clustering / Batch 特例 (Phase 1)

### Phase 1: batch 全面禁止

`domain: "refactor"` の finding は op-scan / op-patrol で **batch Issue 化しない**
(1 finding = 1 Issue 原則)。

理由:

- refactor の `bulk_group` は粗く、異なる feature / layer / rollback unit が
  同 bulk_group に集まりやすい
- 「失敗時に 1 revert で安全に戻せる単位」が clustering の最低条件
- public API / IPC contract / serialized format / file location 近接の refactor が
  混入すると、1 PR 内の事故影響範囲が広がる

### bulk_group の役割 (Phase 1)

`bulk_group` は **finding 同士の関連性を示す情報** であって、batch 起票の合図ではない。
Phase 1 では bulk_group / subtype の付与は引き続き必須 (将来 batch 化や dedup に使う)。

### Phase 2 以降の検討 (現在は適用しない)

Phase 2 で batch 化する場合は、finding schema に
`root_path` / `rollback_unit` / `verification_key` を追加し、
**すべて完全一致** する場合のみ batch を許可する設計を検討する。

詳細は `references/clustering-policy.md` を参照。

---

## Architecture Debt Tracking

巨大な構造負債を `ignored_noise` にしない。

一度の op-run で安全に直せない refactor finding は以下に分類する:

| finding_type | execution_mode | 説明 |
|--------------|----------------|------|
| `immediate_refactor` | `direct_apply` | 小〜中規模で挙動非変更のまま op-run できる |
| `staged_refactor` | `staged_refactor` | 数段階に分ければ安全に直せる |
| `architecture_debt` | `staged_refactor` | 一発では直せないが、放置すると悪化する |
| `needs_spec_decision` | `needs_human_decision` | 仕様・保存形式・API・ディレクトリ方針の判断が必要 |

> **`affected_paths` の必須範囲**: `architecture_debt` / `staged_refactor` /
> `needs_spec_decision` の **3 つすべてで必須**。`op-refactor-debt-key` の
> `root_path` (LCA) 計算に使うため、debt 系 finding はこれが無いと安定した dedup
> ができない。`immediate_refactor` では任意。

`architecture_debt` には以下を必ず含める:

- `direct_apply_safe: false`
- `why_not_direct_apply`
- `affected_paths`
- `first_detected_at`
- `last_seen_at`
- `seen_count`
- `risk_trend` (`stable` / `worsening` / `spreading`)
- `proposed_stages`
- `safe_first_step`
- `needs_human_decision` (構造化 block。判断不要なら `required: false` で省略可。
  `required: true` の場合は `_shared/invocation-mode.md` の必須項目をすべて埋める)
- `human_decision_points` (refactor 固有。判断点の自然文配列。`needs_human_decision.options[]`
  と並べて記載してよい)

#### tracking owner (重要)

agent (refactor-expert) は **今回検出時点での暫定値のみ** を返す。累積値は **op-patrol が
fingerprint で既存 Issue を検索して上書き** する責務を持つ (agent は GitHub Issue を
読みに行かない)。

| field | agent (refactor-expert) | op-patrol (再検出時) |
|-------|------------------------|---------------------|
| `first_detected_at` | 今日 (新規検出時) | 既存 Issue があれば上書きしない |
| `last_seen_at` | 今日 | 今日に更新 |
| `seen_count` | **必ず `1`** | +1 する |
| `risk_trend` | **必ず `stable`** | affected_paths 比較で `worsening` / `spreading` に更新 |

**禁止事項** (agent 側):

- `seen_count >= 2` を推測で返す (過去検出回数を agent は知らない)
- `risk_trend = worsening / spreading` を agent 側で確定する
- 既存 GitHub Issue を読んで累積値を計算する

`needs:triage` ラベルの付与判定 (`seen_count >= 3` / `affected_paths` 増加 / risk_trend 悪化) も
op-patrol の責務。agent 側で付与しない。

#### agent 側に残る責務 (悪化検出のみ)

累積値の更新は op-patrol に委ねる一方で、**agent 側に残る責務は「新規変更による既存 debt の
悪化を blocking として返すこと」だけ**。これは過去回数の推測ではなく、今回スキャン対象
(変更ファイル / PR diff) と既存 affected_paths を突き合わせる現在時点の判定なので
agent が責任を持つ。

- 新規変更 (今回の scan 対象 PR / 変更ファイル) が既存 debt を悪化させる場合
  → finding に `blocking: true` + `blocking_reason` を付与
- それ以外 (`seen_count` の増減 / `risk_trend` の遷移 / `needs:triage` の付与) は **すべて op-patrol の責務**

```text
agent: 新規悪化を block として返す (今 PR 起点の判断)
op-patrol: seen_count / last_seen_at / risk_trend / needs:triage を更新 (履歴起点の判断)
```

```text
既存負債は staged
新規悪化は block
```

詳細は `references/architecture-debt.md` を参照。

---

## Verification Ladder (検証梯子)

修正範囲とリスクに応じて、どの Level まで回すかを判断する。Level 名: 0=静的確認 / 1=軽量静的チェック /
2=変更範囲の既存テスト / 3=統合寄り smoke / 4=重い統合検証 / 5=実機確認・installer・updater。

各 Level の詳細・責務分担 (refactor-expert = 一次確認 / test-expert = 検証設計)・コマンド例・
早見表は `references/verification-ladder.md` を参照 (正本)。

---

## Apply Report

apply 完了報告には以下を必ず含める。詳細 schema は `references/report-schema.md` を参照。

- `behavior_change_claim`: `"no_behavior_change"` を宣言する
- `structural_change_summary`: 構造的変更の要約 (literal レベルではなく意味レベル)
- `contract_preservation` (**正本**。「apply 時の不変則」「Refactor Execution Control の不変則」は
  ここを参照する): 各 boolean を全て埋める
  - `public_api_changed` (trait / interface の signature、引数順、戻り値型の変更を含む)
  - `serialized_format_changed`
  - `db_schema_changed`
  - `migration_changed`
  - `config_format_changed`
  - `ipc_contract_changed`
  - `tauri_command_names_changed`
  - `event_names_changed`
  - `permission_names_changed`
  - `path_values_changed`
  - `key_values_changed`
  - `file_locations_changed`
  - `status_values_changed`
  - `error_codes_changed`
  - `env_vars_changed`
- `verification_performed`: 実行した検証コマンドと結果
- `verification_not_run`: 実行できなかった検証と理由
- `residual_risk`: 残存リスクの列挙
- `recommended_post_check_expert`: 必要なら specialist 1 つ

scattered token の apply では、**実際の値が変更前後で変わっていないこと** を必ず報告に含める。

---

## 実装完了後の code-review invoke

本節の方法論は `~/.claude/skills/_shared/apply-completion-checklist.md` に集約された。
本 expert の固有 skip 条件のみ以下に残す。

skip 条件なし。apply 後は必ず invoke する。

---

## CLAUDE.md 規約との整合

- ネスト 2 階層以内: refactor 後にネストを増やさない、ガード節優先
- 日本語コメント: 構造変更の意図を 1 行コメント
- フラット構造優先: directory 階層を不必要に深くしない
- 過剰抽象化禁止: 抽象化は重複の **観測後** に行う

---

## 参照ドキュメント (Single Canonical Source)

| Path | 役割 | 読むタイミング |
|------|------|----------------|
| `skills/_shared/runtime-contract.md` (>=1) | runtime spawn 境界 / apply 可否 / merge-blocking state | scan / apply 冒頭 |
| `skills/_shared/active-expert-registry.md` (>=2) | active / planned 区別、本 expert の runtime 適格性確認 | spawn 解決時 |
| `skills/_shared/markers/labels-and-markers.md` (>=2) | 出力 marker / 受領 label の名前と core semantics (`op-refactor-debt-key` 含む) | output 整形時 |
| `skills/_shared/common-setup.md` (>=2) | Explore 委譲プロトコル (breadth / クエリ数基準) + フォールバック | 大規模 repo audit / 広域探索フェーズ |
| `skills/_shared/apply-completion-checklist.md` | apply Run Mode の完了手順 (4 段階順序 + チェックリスト + 強警告)。固有 skip 条件は本 SKILL.md の「## 実装完了後の code-review invoke」節を参照 | apply Run Mode 冒頭 |
| `skills/_shared/expert-spawn.md` | scan / patrol の canonical schema 定義 / apply 入力契約 / spawn schema / post_check_expert 許容値 / **Marker Publish Validate 節** (publish 前 2 段 validate 手順の正本) | Canonical Schema Contract 確認時 / apply 冒頭 / marker publish 前 |
| `skills/_shared/read-economy.md` (>=1) | Read Economy 原則 (R1〜R5): 既読ファイル再 Read 禁止 / Edit 後確認 re-Read 禁止 / 必要最小範囲 Read | scan / apply 全フェーズ |

---

## 深掘り参照

- 分類体系: `~/.claude/skills/expert-refactor/references/refactor-taxonomy.md`
- 散乱 token: `~/.claude/skills/expert-refactor/references/scattered-tokens.md`
- 構造健全性 (god function / large file / large component / dead code): `~/.claude/skills/expert-refactor/references/structure-health.md`
- ディレクトリ構造: `~/.claude/skills/expert-refactor/references/directory-structure.md`
- architecture debt 追跡: `~/.claude/skills/expert-refactor/references/architecture-debt.md`
- clustering policy: `~/.claude/skills/expert-refactor/references/clustering-policy.md`
- verification ladder: `~/.claude/skills/expert-refactor/references/verification-ladder.md`
- post-check policy: `~/.claude/skills/expert-refactor/references/post-check-policy.md`
- report schema: `~/.claude/skills/expert-refactor/references/report-schema.md`
- ユニバーサルデザイン: `~/.claude/skills/_shared/universal-design.md`

---

## Direct Expert Run (直接実行時の対話型入口)

通常は OP skill 経由で呼ばれる。直接実行時の入口は `agents/refactor-expert.md` の
「## Direct Expert Run」節を参照。本 skill 内では繰り返さない。
