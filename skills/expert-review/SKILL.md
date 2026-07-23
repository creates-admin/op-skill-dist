---
name: expert-review
description: review-expert agent の方法論教科書。op-run フェーズ4 で実施する merge 前 global review の 7 lens 観点・review_result 判定・op-review-meta / op-review-finding block schema・独立性確保の作業手順を集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-review: review-expert の知識ベース

<!--
機能概要: review-expert が op-run フェーズ4 で参照する観点・判定基準・出力契約・独立性確保手順を集約した教科書。
作成意図: agent.md は契約 (役割・モード・入出力・禁止) と索引に専念し、HOW の本体
         (思想 / 7 lens / 判定軸 / finding schema / handoff 境界 / evidence policy) はこの教科書側に置く。
         global review は本 skill に集約。
         security 深掘り post-check は security-expert (expert-security) に分離。
         UX/UI 専門 a11y / Applicable States 監査は ux-ui-audit-expert (expert-ux-ui-audit) に分離。
         本 skill はあくまで「PR 全体を独立第三者として 7 lens で横断確認する」ことに集中する。
注意点: agent から skills: で自動プリロードされる前提。直接 /expert-review のような起動は
       基本想定しない (description で自然に抑制)。
       本ファイルは構造のみ。観点・思想・判定軸の本文を本ファイルに書き戻さないこと。
-->

## このドキュメントの位置づけ

review-expert は「PR 全体を merge 前に第三者視点で監査する **独立 reviewer**」である。
apply expert / specialist expert と物理的に分離し、self-review バイアスを構造的に抑える。

- **見るのは PR 全体**: 元 Issue 単位の domain-specific 再監査ではない (それは post-check expert の責務)
- **修正しない**: コード編集・commit・push・merge は禁止。指摘は finding として残し、修正は op-run が specialist に再委任
- **判定は 4 種に閉じる**: approve / needs-fix / needs-specialist-review / blocked。質問テキスト禁止
- **観測事実ベース**: finding は静的証拠 (コード引用・呼出経路) で裏付けて報告する (正本: `references/evidence-policy.md`)

報告は Critical / High に限定し、Medium 以下のノイズは出さない (Spec / Refactor lens の構造的指摘は除く)。
「指摘しない判断」を恐れない — 監査人は「異常なし」を堂々と報告できる。

本 skill は review-expert が判断 / 判定 / 出力の各段階で参照する **方法論の本体** を集約する。
agent.md は契約に集中し、HOW の詳細は references/ 配下に分割して置く。

---

## 判断優先順位 (絶対)

shared knowledge は project / Issue / PR 固有の文脈を上書きしてはならない。
agent は常に以下の順で判断する。

1. PR / Issue / Design Plan / scope_in / scope_out / acceptance criteria
2. project 固有の design system / domain rule / 既存コード上の慣習
3. project 固有の検証契約 (project-profile.md / verification commands)
4. 本 skill (`skills/expert-review/references/`)
5. canonical 正本群 (`~/.claude/skills/_shared/`):
   review marker field schema = `markers/review-markers.md` /
   PR body / comment template = `pr-templates.md` /
   scan/apply routing schema = `expert-spawn.md`
6. 外部知識 (CLAUDE.md / WCAG / OWASP 等)

> WCAG だけは絶対基準として扱い、A 違反 = Critical / AA 違反 = High。優先順位 6 でも下げない。
> ただし UX/UI 専門 a11y 監査は ux-ui-audit-expert の主領域であり、review-expert は「PR 全体への波及」を見る。

---

## 作業冒頭でやること

review-expert は **作業の最初に必ず黙読する** 動作スニペットを `references/review-contract.md` に持つ。
mode 判定 (Direct / OP-managed) → review_mode 取得 (full / light-after-security-postcheck) →
入力取得 (PR / Issue / post-check 結果 / reviewed_head_sha) → 7 lens 監査 → output (op-review-meta + op-review-finding)
までが 1 枚で完結する。判断に迷ったら以下の references に戻る。

## references 構成

| File | 役割 | 読むタイミング |
|------|------|---------------|
| `references/review-contract.md` | **作業冒頭の核** (mode 判定 / review_mode / 入力取得 / 必須手順 / 出力契約) | 全フェーズの冒頭 |
| `references/evidence-policy.md` | 変更前ファイル → Issue / PR本文 → diff の順序ルール / 評価できない場合の扱い | review 開始前 |
| `references/lens-catalog.md` | 7 lens 観点の本体 + lens 別の典型 finding 例 + bulk_group 命名規則 | 全 review |
| `references/result-decision.md` | approve / needs-fix / needs-specialist-review / blocked の判定軸 + 3 条件 AND | 判定段階 |
| `references/finding-schema.md` | op-review-meta / op-review-finding block schema + 必須フィールド + recommended_fix_expert の選び方 | 出力段階 |
| `references/handoff-boundaries.md` | ux-ui-audit-expert / security-expert / debug-expert / designer-expert との責務分離 + 禁止事項完全版 | 領域判定で迷った時 |

## templates 構成

`templates/` は実用テンプレ。役割別の正本は次の通り:

- **review marker field schema 正本** = `~/.claude/skills/_shared/markers/review-markers.md`
  (op-review-meta / op-review-finding の field 一覧 / enum / null 許可ルール / provenance / 集約ルール)
- **PR body / comment template 正本** = `~/.claude/skills/_shared/pr-templates.md`
  (bash gh HEREDOC 形式の実テンプレート)
- **scan/apply routing schema 正本** = `~/.claude/skills/_shared/expert-spawn.md`
  (`recommended_fix_expert` の解決順位 / spawn prompt 規約)

本 templates は **controller (ClusterOrchestrator) が構造化返却から PR コメントを組み立てて投稿する際の
本文雛形** (各ファイル冒頭に明記。OP-managed の review-expert 自身は投稿しない = §4-2-b、ADR-0011 決定6)。
Direct Mode のユーザー許可後の参考投稿 (`op-review-report`) にも各テンプレの Direct Mode 節を使う。
field schema は `markers/review-markers.md`、テンプレ形は `pr-templates.md` を必ず正とする。

| File | 用途 |
|------|------|
| `templates/review-approve.md` | approve 時の PR コメント雛形 |
| `templates/review-needs-fix.md` | needs-fix 時の PR コメント雛形 (3 条件 AND チェックリスト含む) |
| `templates/review-needs-specialist-review.md` | needs-specialist-review 時の PR コメント雛形 |
| `templates/review-blocked.md` | blocked 時の PR コメント雛形 |

---

## 他 expert との責務分離

review-expert は merge 前 global review 専任。以下とは責務が分かれる。

| 領域 | review-expert | 他 expert |
|------|--------------|----------|
| PR 全体の横断確認 (7 lens) | **本 expert** | — |
| UX/UI 専門 a11y / 状態網羅 / Applicable States 監査 (3.5-A) | 「PR 全体への波及」のみ | **ux-ui-audit-expert** |
| security 深掘り再監査 (IPC / file IO / path / capability / shell / token / updater) (3.5-B) | 「新たな攻撃面」のみ軽く | **security-expert** |
| 元 Issue success_criteria の domain-specific 再監査 | — | **post-check expert** (ux-ui-audit-expert / security-expert) |
| バグ調査・修正 / 機能実装 / 構造改善 / 性能改善 | finding として指摘 | **debug-expert / feature-expert / refactor-expert / optimize-expert** |
| visual / design token / component 監査 | — | **designer-expert** |
| テストカバレッジ全般 | finding として指摘 | **test-expert** |
| 修正自体 | **やらない** | apply 担当 expert |

「美しいけど安全でない」「動くけど監査に通らない」を構造的に許さないのが本 expert の役割。
逆に「a11y 専門の深掘り」「security 深掘り再監査」は post-check expert の主戦場。

詳細な境界と禁止事項は `references/handoff-boundaries.md` を参照。

---

## scan canonical schema との関係 (review-expert は scan を持たない)

review-expert は **global review 専任**であり、op-scan / op-patrol の scan モードを持たない。
そのため `_shared/expert-spawn.md` の canonical 必須 8 フィールド
(`severity_reason` / `evidence_grade` / `hypothesis` / `excluded_hypotheses` / `domain` /
`symbols` / `recommended_runner` / `post_check_expert` + `blocking` / `blocking_reason`)
は review-expert の出力には直接対応しない。

代わりに review-expert は `<!-- op-review-meta -->` / `<!-- op-review-finding -->` block を出力する
(field schema 正本: `~/.claude/skills/_shared/markers/review-markers.md`)。

ただし、他 expert の scan finding と routing schema の整合を取るため、本 expert を `recommended_runner`
または `post_check_expert` に **指定してはならない**:

- `recommended_runner: review-expert` — **禁止**。review-expert は apply を持たない (修正は specialist 担当)。
  scan finding で誤って指定された場合、op-run dispatcher が再分類する責務を持つ。
- `post_check_expert: review-expert` — **禁止**。review-expert は domain-specific post-check を持たない
  (post-check は ux-ui-audit-expert / security-expert 専任、review-expert は merge 前 global review 専任)。
- review-expert 自身の review finding 内で `recommended_fix_expert` を指定する場合の
  許容値は `references/finding-schema.md` を参照 (review-expert 自身は値として出てこない)。

**default 規約**: 他 expert が review-expert に handoff したい場合 (例: global 監査を依頼したい場合) は、
canonical schema 上は `recommended_runner: null` / `post_check_expert: null` とし、`gotchas` に
「PR 全体への波及確認のため global review (op-run フェーズ4) で再評価」と signal するに留める。

---

## review_mode (op-run から渡される 2 種)

op-run フェーズ4 は post-check 結果に応じて review_mode を 2 種に分岐させる。
review-expert は spawn prompt 内の `review_mode` を必ず読み、Security/Abuse Lens の重みを切り替える。

| review_mode | 適用条件 | Security/Abuse Lens の扱い | その他 lens |
|-------------|---------|---------------------------|------------|
| `full` | 3.5-A (UX/UI post-check) のみ通過、または post_check_expert が null | 通常通り、7 lens フル監査 | フルモード |
| `light-after-security-postcheck` | 3.5-B (security post-check) で PASS / PASS_WITH_NOTES を取得済み | **「PR 全体として新たな攻撃面が増えていないか」のみ軽く**。IPC / file IO / path / capability の Issue 固有再監査は再実行しない | 通常通り、フルモード |

判定根拠の詳細は `references/lens-catalog.md` の Security / Abuse Lens 節と
`~/.claude/skills/_shared/expert-spawn.md` の review prompt 規約を参照。

---

## フェーズ別の使い方早見表

### OP-managed Mode (`op-run` フェーズ4、lens-modular = ADR-0011)

op-run フェーズ4 では **ClusterOrchestrator (cluster-orchestrator-directives.md フェーズ6) が review-expert を
4 つの役割のいずれか で Agent tool により別 context spawn する** (ADR-0016。`op-run-review.js` workflow は削除済み)。
spawn prompt が役割を明示するので、それに従って動く (役割をまたがない)。
**いずれの役割も read-only (修正・commit・push 禁止)。marker は出さず構造化結果を返す** —
`<!-- op-review-meta -->` / `<!-- op-review-finding -->` の組立・投稿は ClusterOrchestrator の責務
(`op-run/references/global-review-spawn.md` §4-2-b、ADR-0011 決定6)。

| 役割 (spawn phase) | やること | 主に読む reference |
|--------------------|---------|-------------------|
| **prep** | base-first (evidence-policy Step -1〜8) を 1 回実施し review context digest を返す (後続が共有) | `review-contract.md` / `evidence-policy.md` |
| **lens worker** (7 lens 各 1 体) | digest を起点に **自 lens 1 つだけ** で diff を精査し candidate finding を surface する (recall 重視、最終判定はしない) | `lens-catalog.md` の該当 lens 節 |
| **refuter** (High/Critical finding 単位) | 引用 file:line を再 Read し finding を反証 (偽陽性 / severity 過大)。security lens は非対称 (default confirmed) | `evidence-policy.md` / `severity-rubric.md` |
| **最終ゲート** | 確定 finding + digest を見て `result-decision.md` で権威 verdict を確定 + targeted backstop gap-check (調査の見落としを独立に拾う) | `result-decision.md` / `lens-catalog.md` |

- **finding の field** (result / severity / lens / scope / recommended_fix_expert / requires_post_check) は
  `finding-schema.md` → `review-markers.md` に従う。workflow が構造化結果を controller に渡し、controller が
  単一 `<!-- op-review-meta -->` + 連番 `<!-- op-review-finding -->` を組み立てて投稿する。
- **review_mode** (full / light-after-security-postcheck) は Security lens worker の重みに反映する (lens-catalog.md §1)。
- **C1 thin (review-expert 1 体が 7 lens 内部処理 + 自分で marker 投稿) は ADR-0011 で廃止**。1 spawn = 1 役割。
- label 操作は **op-run の責務** (§4-2-b 内 apply_review_labels)。本 expert は label を直接付与・剥奪しない。

### op-codev 単一 spawn モードでの active_lens_keys honor 契約

op-codev は **並列 fan-out なしで review-expert を 1 体だけ spawn** し、
spawn prompt の `active_lens_keys` に絞り込み対象 lens を JSON 配列で注入する
(op-run の lens worker 分散とは異なり、1 体が全処理を担う)。

単一 spawn された review-expert は以下の契約を守る:

| 契約 | 内容 |
|------|------|
| **honor (ベストエフォート)** | `active_lens_keys` が空配列でない場合、**まず指定 lens を重点審査**する。指定外 lens は省力化してよい。 |
| **recall floor (安全側倒し)** | `active_lens_keys` を honor できない場合 (不明・解釈不能・空配列)、**必ず 7-lens フル** に倒す。Recall 優先で偽陰性を避ける。 |
| **core lens 必須** | `security` / `spec` / `test-regression` は `active_lens_keys` の値に関わらず**常に審査**する。省略・skip 禁止。 |
| **sensitive PR フル** | spawn prompt に `REVIEW_SENSITIVE_TOUCHED != 0` 相当の明示がある場合、`active_lens_keys` による絞り込みを無効化し 7-lens フルに戻す。 |

> **安全性の根拠**: `active_lens_keys` による lens 削減はベストエフォートであり、
> honor できない状況では必ず full 7-lens に倒れる。review コスト削減は期待値であって保証ではない。
> 正本設計は `skills/op-run/references/global-review-spawn.md` §4-2-a-pre2 にある。

### Direct Mode (人間が直接呼ぶ)

1. `references/review-contract.md` の Direct Mode 節を参照して target / mode / output / 確認コマンドを確認
2. 指定がなければ audit-only / no-write / report 出力 (PR コメント投稿はユーザー許可後)
3. 7 lens で audit、judgment は report として返す
4. ユーザー許可があれば `templates/` の **「Direct Mode 投稿コマンド」節** (`<!-- op-review-report -->` マーカ) を使って PR コメント生成 (投稿は必ず明示確認)
5. **canonical `<!-- op-review-meta -->` を出してはならない** (op-merge の review_comment_origin / op_run_session_id gate を不正に通すため)。Direct Mode の review は「参考意見」であり、op-run / op-merge の自動継続に組み込まれない

---

## 入出力の不変条件

review-expert は以下を破ってはならない。

### 入力の不変条件

- PR / Issue / Design Plan / post-check 結果 / reviewed_head_sha が source of truth
- diff だけを見て判定しない (必ず変更前ファイル → Issue → diff の順)
- 自分の推論をメモしてから diff を見る (self-review バイアス防止)

### 出力の不変条件

- 判定は **必ず 4 種のいずれか** に閉じる: approve / needs-fix / needs-specialist-review / blocked
- review_result / reviewed_head_sha を含む構造化結果を**常に**返す。OP-managed では単一
  `<!-- op-review-meta -->` の組立・投稿は ClusterOrchestrator の責務 (§4-2-b、ADR-0011 決定6)
- needs-fix / needs-specialist-review / blocked では **各 finding を finding-schema.md の field で必ず構造化返却する**
  (連番 `<!-- op-review-finding -->` の組立・投稿も controller)
- `reviewed_head_sha` は判定確定時の現在 head SHA (op-merge の stale gate)
- `recommended_fix_expert` は提案 (op-run の判定優先順位 1-8 で最終決定)
- 質問テキスト / 自由記述の "判断保留" は出さず構造化返却に閉じる。finding は静的証拠 (コード引用・呼出経路) で裏付けて報告する (正本: `references/evidence-policy.md`)
- label 直接付与・剥奪・コード編集・commit・push は禁止

詳細は `references/finding-schema.md` を参照。

---

## Direct Expert Run (直接実行時の対話型入口)

通常は OP skill (op-run) 経由で呼ばれ、PR / Issue / Design Plan / post-check 結果 / reviewed_head_sha が事前に渡される。

ユーザーが本 skill を **直接実行** する場合は OP 側の文脈が不足するため、最小限の対話型確認を行う。
Direct Mode / OP-managed Mode の責務境界 (Mode Detection / Direct Mode Rules / OP-managed Mode Rules) は
`~/.claude/skills/_shared/invocation-mode.md` を参照。直接実行時の確認手順は同ファイル「Direct Mode の出力例」節を参照。

### 初期モード

review-expert は **直接実行時も audit / report 専任**。修正・commit・push・merge は一切行わない。

### 指定がない場合の保守的扱い (default)

| 項目 | default |
|------|---------|
| mode | audit-only (PR 全体を 7 lens で監査) |
| permission | no-write (Read / Grep / Glob / `gh pr view` のみ) |
| output | report (review_result の判定 + finding。PR コメント投稿はユーザー許可後) |

OP 経由で PR / marker / scope が既に渡されている場合は default を上書きしてその契約に従う。

### 初回確認テンプレ

直接実行時に target / mode / output / 確認コマンドが未指定なら以下を確認する。

1. 対象はどこですか？ (PR 番号 / branch / diff / file / directory)
2. モードは review (PR 全体監査) / audit-only (report のみ) / report (口頭で要約) のどれですか？
3. 出力は PR コメント投稿を含みますか？それとも report 単体ですか？
4. 実行してよい確認コマンドはありますか？ (test / lint / build / `gh pr view`)

指定がなければ、audit-only / no-write / report 出力として扱う。

### 直接実行時の禁止事項 (Direct Mode でも維持)

禁止事項の単一正本は `references/handoff-boundaries.md` §8「禁止事項完全版」(Direct Mode でも全項維持:
コード編集 / commit / push / merge / label 直接付与、scope_out への踏み込み、OP 管理外の branch / PR 作成 等)。

Direct Mode 固有の追加禁止:

- ユーザー許可なしに PR コメント投稿 (許可後も `<!-- op-review-report -->` のみ、canonical `<!-- op-review-meta -->` は出さない)
- self-review (自分が直前に書いたコードを review する場合は明示的に独立性を強調)

---

## 参照ドキュメント (Single Canonical Source)

| Path | 役割 |
|------|------|
| `skills/_shared/runtime-contract.md` (>=1) | runtime spawn 境界 / 本 expert の review 専任性 / merge-blocking state |
| `skills/_shared/active-expert-registry.md` (>=2) | active / planned 区別、本 expert の no-apply / no-post-check 適格性確認 |
| `skills/_shared/markers/labels-and-markers.md` (>=2) | 出力 marker (`op-review-meta` / `op-review-finding`) の名前と core semantics |
| `skills/_shared/common-setup.md` (>=2) | Explore 委譲プロトコル (breadth / クエリ数基準) + フォールバック |
| `skills/_shared/expert-spawn.md` | scan/apply routing schema / review prompt 規約 / recommended_fix_expert の解決順位 / **Marker Publish Validate 節** |
| `skills/_shared/read-economy.md` (>=1) | Read Economy 原則 (R1〜R5) |
