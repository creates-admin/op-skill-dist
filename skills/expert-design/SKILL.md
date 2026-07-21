---
name: expert-design
description: designer-expert agent の方法論教科書。design system 整合・視覚秩序・token / component / layout pattern の判断に必要な思想・参照体系・rubric・起票基準を集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-design: designer-expert の知識ベース

<!--
機能概要: designer-expert agent が op-scan / op-patrol / op-architect / op-run から
         呼ばれた際に参照する方法論・パターン・rubric・起票基準を集約した教科書。
作成意図: agent.md は人格と契約 (フェーズ定義 / 出力契約 / 禁止事項) に集中させ、
         HOW の本体 (思想 / 判断順序 / 視覚階層 / 密度 / rubric / scan policy) は
         この教科書側に置く。ux-ui-audit-expert との責務分離を維持しつつ、
         両 agent で共有される rubric / reference-map / philosophy 核は意図的に
         expert-ux-ui-audit 側にも重複保持して、agent ごとの視点で再執筆する。
注意点: agent から skills: で自動プリロードされる前提。直接 /expert-design
       のような起動は基本想定しない (description で自然に抑制)。
-->

## このドキュメントの位置づけ

designer-expert は UI を飾るエージェントではない。
画面の **「使える美しさ」** を担保するために、design system の意図を読み取り、
視覚秩序を守り、Issue 範囲内で最小差分の改善を行うエージェントである。

本 skill は、designer-expert が判断 / 起票 / 実装の各段階で参照する
**方法論の本体** を集約したもの。agent.md は契約 (誰が・いつ・何を出すか) に集中し、
HOW の詳細は references/ 配下に分割して置く。

## 判断優先順位 (絶対)

shared knowledge は project 固有の token / component / brand rule を上書きしてはならない。
agent は常に以下の順で判断する。

0. **CLAUDE.md (絶対層)** — project ルートの規約 / 禁止パターン。これに反する案は出力不可。
   Issue が CLAUDE.md と矛盾する場合は CLAUDE.md を優先し、Issue コメントで矛盾を報告する。
1. Issue / task 指示
2. project 固有 design system (`Share/design-system/` 等)
3. 実コード上の token / component / theme
4. 本 skill (`skills/expert-design/references/`)
5. 外部デザイン思想

### project 側からの override 経路

skill 内の「経験則しきい値」(例: bulk_group の 5 件以上で High) は CLAUDE.md / `docs/design/scan-overrides.md` で上書き可。
agent は CLAUDE.md を読んだとき、`design.scan_thresholds` / `design.bulk_group_min` 等の節があれば skill のしきい値より優先する。

---

## 作業冒頭でやること (核 instruction)

designer-expert は **作業の最初に必ず黙読する** 短いスニペットを `references/agent-instructions.md` に持つ。
判断の最初に黙読し、迷ったら `decision-order.md` / `visual-quality-rubric.md` / `scan-finding-policy.md` に戻る。

### 判断装置の役割分担 (重複に見えるが用途が違う)

designer-expert は思想・実務原則・判断順序を 4 つのリストで持つが、**用途が異なる**ため重複ではない。

| リスト | 場所 | 何をするときに見るか | 粒度 |
|--------|------|--------------------|------|
| 8 ステップ判断順序 | `agent-instructions.md` | **作業冒頭で必ず黙読する核** | 凝縮 |
| 10 ステップ判断順序 | `decision-order.md` | 8 ステップで判断停止したときの**詳細展開** | 詳細 + 「迷ったらやらない」 |
| 12 原則 (思想) | `philosophy.md` 前半 | **設計判断の根拠**を Issue コメント等に書くとき | 哲学 |
| 12 ヶ条 (実務原則) | `philosophy.md` 後半 | 現場のチェックリストとして**実装中に見る** | 短い実務リスト |

**実行時の最低読み込みセット**:

- scan / patrol → `agent-instructions.md` + `scan-finding-policy.md` + `visual-hierarchy-patterns.md`
- architect → `agent-instructions.md` + `project-design-system-lookup.md` + `decision-order.md` + `enterprise-ui-density.md` + `visual-quality-rubric.md`
- run → `agent-instructions.md` + `project-design-system-lookup.md` + `visual-quality-rubric.md`

`philosophy.md` は **迷った時にだけ立ち戻る**。常時読み込まない。

## references 構成

| File | 役割 | 読むタイミング |
|------|------|---------------|
| `references/agent-instructions.md` | 作業冒頭の核 instruction | 全フェーズの冒頭 |
| `references/philosophy.md` | 12 原則 + 思想抜粋 (designer 視点) | 迷った時の立ち戻り |
| `references/decision-order.md` | 判断順序 10 ステップ + 優先順位 | architect / run の前 |
| `references/project-design-system-lookup.md` | project 固有 DS の探索手順 | architect / run 冒頭 |
| `references/enterprise-ui-density.md` | 業務 UI の密度設計 (view 別) | architect の layout 判断 |
| `references/visual-hierarchy-patterns.md` | 視覚階層パターン (10 観点) | scan / architect / run |
| `references/visual-quality-rubric.md` | 100 点 rubric | architect の目標宣言 / run 後の自己採点 |
| `references/scan-finding-policy.md` | scan / patrol の起票基準 | scan / patrol |
| `references/reference-map.md` | 外部参考の正規リンク集 | キャリブレーション時 |
| `references/data-viz-patterns.md` | chart 選定 / data honesty / dashboard 状態 | chart 使用画面の architect / run |
| `references/motion-patterns.md` | motion token / transition / 性能 / reduced-motion / AI 到達ライン | motion を使う画面の architect / run |
| `~/.claude/skills/_shared/runtime-verification.md` | runtime 検証手段と static 代理の対応表 | evidence_grade 判定時 / 採点で N/A 判定する前 |

---

## ux-ui-audit-expert との責務分離

- **designer-expert は「美しさ・design system 整合・視覚秩序」の番人** — token / component / 視覚階層の破綻を検出する
- **ux-ui-audit-expert は「使いやすさ・わかりやすさ・a11y」の番人** — 業務フロー破綻と必須 state 欠如を検出する
- 両者の検出が衝突した場合、**使いやすさが常に優先される**

`visual-quality-rubric.md` は両 skill に重複保持する (agent 同士で共通の合格ラインを共有するため)。
`reference-map.md` も両方に置く (Tier ごとの読み方は agent ごとに異なるため再執筆する)。

### a11y の責務境界

designer-expert は **a11y を再定義しない**。ただし、自身の設計・実装が
focus / contrast / keyboard / aria を破壊しない責務を持つ。a11y の最終判定
(gate / post-check) は ux-ui-audit-expert に委譲する。

| 領域 | 主担当 |
|------|-------|
| a11y 要件の最終監査 / gate / post-check | ux-ui-audit-expert |
| Design Plan に a11y 要件を落とし込む | designer-expert |
| 実装時に focus / contrast / aria を壊さない | designer-expert |
| scan で広義の a11y 欠陥を起票 | ux-ui-audit-expert |
| scan で「見た目優先が原因の focus 不可視 / contrast 破綻」を起票 | designer-expert (この種類のみ) |

designer は a11y の番人ではなく、**a11y を壊さない実装者**。
scan モードで designer が a11y 系を起票できるのは、見た目優先の実装が原因で
focus 不可視 / contrast 破綻などを起こしている場合に限る。

---

## フェーズ別の使い方早見表

### Scan Mode (`op-scan`) / Patrol Mode (`op-patrol`)

1. `references/agent-instructions.md` を黙読
2. `references/scan-finding-policy.md` で起票範囲を確認
3. `references/visual-hierarchy-patterns.md` の 10 観点で audit
4. Critical / High のみ起票 (patrol は Medium / Low 完全禁止)

### Architect Mode (`op-architect`)

1. `references/agent-instructions.md` を黙読
2. `references/project-design-system-lookup.md` で project 固有 DS を探す
3. `references/decision-order.md` で判断順序を通す
4. `references/enterprise-ui-density.md` / `visual-hierarchy-patterns.md` で layout 設計
5. (motion を使う画面のみ) `references/motion-patterns.md` で transition / motion token を設計し、Design Plan に `### Motion Strategy` 節を追加 (AI 到達ライン ③④ は human polish / design spike を明記)
6. `references/visual-quality-rubric.md` で目標 score を宣言

### Run Mode (`op-run`)

1. `references/agent-instructions.md` を黙読
2. `references/project-design-system-lookup.md` で既存資産を探索
3. Design Plan の `Components to Use` / `Tokens to Use` 通りに実装
4. (`### Motion Strategy` 節があれば) `references/motion-patterns.md` の token / `<Transition>` / 性能ガード / reduced-motion で実装。① 宣言的 transition のみ自走し、③④ (物理 spring / orchestrated) は勝手に作り込まず Design Plan の意図に留める
5. `references/visual-quality-rubric.md` で実 score を確認 (85 未満なら再修正)

---

## Scan Mode (read-only audit)

`op-scan` / `op-patrol` から呼ばれた時。frontend code を Read / Grep で audit する。
**実装はしない。** 検出 → 報告のみ。

scan で見るのは「画面がきれいか」ではなく **「design system が壊れているか」**。
「もっとおしゃれにできる」のような好みの提案は一切しない。

### 検出対象 (見る観点)

以下の **Scan Mode 観点 1〜9** が `design_principle_violated` フィールドの値域 (scan / patrol で起票して良いカテゴリ)。
**`expert-design/references/visual-hierarchy-patterns.md` の 10 パターン** は別軸 (Architect Mode の Design Plan で使う設計パターン集) であり、scan の検出カテゴリではない。
ただし scan で「観点 7 (情報階層崩壊)」「観点 6 (色記号崩壊)」を判定するときの**ヒント集**として参照する。

| # | 観点 (= bulk_group カテゴリ) | NG 例 |
|---|------|-------|
| 1 | design token bypass | `color: #3b82f6` / `padding: 13px` 等の hard-coded 値が theme/token を回避 |
| 2 | 共通 component bypass | 既存 `<Button>` を使わず素の `<button>` で同等 UI を再実装 |
| 3 | 同一用途 UI の分裂 | 同じ「確認ダイアログ」が複数 component で別実装、見た目もバラバラ |
| 4 | typography scale 不一致 | font-size / line-height / weight が token を外れて散在 |
| 5 | spacing scale 不一致 | spacing token を使わず ad-hoc な margin / padding が画面ごとに散らばる |
| 6 | 色記号体系の崩壊 | 「success=緑 / error=赤」の意味が画面ごとに揺れる、装飾色が semantic 役割を侵食 |
| 7 | 情報階層崩壊 | 重要操作と補助操作が同じ視覚重み、CTA が複数並列で優先順位が読み取れない |
| 8 | 一画面だけ別プロダクト化 | 角丸 / shadow / 配色が他画面と乖離、独自 UI が孤立 |
| 9 | design system 構造的負債 | token 体系の将来変更を妨げる hard-code の蔓延、theme 切替が物理的に不可能 |

詳細パターン (Architect 用) は `expert-design/references/visual-hierarchy-patterns.md` を参照。

### 起票基準

`expert-design/references/scan-finding-policy.md` を必ず読み、Critical / High のみ起票する。
主観・好み批評は禁止。ux-ui-audit-expert の領域 (使いやすさ・必須 state・a11y) には踏み込まない。

### scan モードの出力契約

`~/.claude/skills/_shared/expert-spawn.md` の **canonical schema** に従う JSON 配列。
`domain` フィールドには **`design`** を入れる。

すべての検出に以下を含める:

- `design_principle_violated` — 上記観点 1〜9 のどれに違反しているか
- `bypass_count` — 同一カテゴリの bypass が観測された箇所数 (token bypass / component bypass の場合)
- `affected_screens` — 視覚的不統一の影響範囲 (ファイル数 / 画面数)
- `evidence` — 該当コード 5〜10 行 (静的に観測したもの)
- `evidence_grade` — `direct | inferred | requires_runtime` (`direct` 以外で Critical 不可)
- `severity_reason` — Critical / High と判定した根拠
- `recommended_runner` — `designer-expert` (実装も自分の責務)

### bulk_group 命名規則 (5 件以上で batch 起票対象)

- `design:hardcoded-color` — token 未使用の色直書き
- `design:hardcoded-spacing` — spacing scale 未使用の余白直書き
- `design:hardcoded-typography` — font-size / weight / line-height 直書き
- `design:hardcoded-radius` — border-radius 直書き
- `design:hardcoded-shadow` — box-shadow 直書き
- `design:component-bypass` — 既存共通 component を使わない自前実装
- `design:duplicate-ui-pattern` — 同一用途 UI の複数実装分裂
- `design:visual-hierarchy-break` — 重要度と視覚重みの不一致

---

## Patrol Mode (op-patrol からの read-only 巡回)

scan モードと同じ出力契約。ただし `expert-design/references/scan-finding-policy.md` の **patrol 限定の追加制約** を厳守する:

- 好みのデザイン批評は完全禁止
- 命名・スタイルの好みは起票しない
- 「将来不安」だけの指摘は出さない
- **Medium / Low を一切起票しない**
- 全体 redesign 提案は出さない (巡回スコープ外)
- 未読箇所の推測指摘は出さない (見たものだけ報告)

許可は Critical / High に限り、**観測可能な design system 破綻**のみ。

---

## Architect Mode (Design Plan の作成)

`op-architect` から呼ばれた時。実装はしない。**Design Plan のみ作成する**。

### 手順

1. Issue 本文と関連 ADR を Read
2. **project 固有 design system を最初に探す** (`expert-design/references/project-design-system-lookup.md` の lookup order):
   - theme / token / palette / variables ファイル
   - 既存 Button / Dialog / Card / Form / Toast 等の component
   - layout pattern (grid / spacing scale / typography scale)
3. 業務フロー上の user goal を特定
4. **Applicable States を判定** — UI 種別 (フォーム / 一覧 / modal / 静的表示等) ごとに該当する state のみ列挙する。**6 状態 (loading / success / failure / empty / disabled / focus) を機械的に全列挙してはいけない。** 該当しない state は `not_applicable_reason` を 1 行添えて省略する (詳細は `_shared/pr-templates.md` の Applicable States 節および `expert-ux-ui-audit/references/recovery-and-states.md` を参照)
5. 情報階層と layout 方針を決める (`expert-design/references/enterprise-ui-density.md` / `visual-hierarchy-patterns.md`)
6. accessibility 要件を明文化
7. 実装者が迷わない Design Plan を Markdown で出力
8. 自己採点 (`expert-design/references/visual-quality-rubric.md`) で目標 score を宣言

### Design Plan 出力フォーマット

Design Plan の **正規テンプレは `~/.claude/skills/_shared/pr-templates.md` の
「op-architect / op-run: Design Plan (designer-expert 出力)」節を SSoT** として参照する。
本 SKILL.md ではテンプレ全文を重複保持しない (`Required States` / `Applicable States` 等の
表記ズレを構造的に防ぐため)。

正規テンプレに含まれる節 (詳細は SSoT 側を参照):

- `User Goal` / `Current UX/UI Problem` / `Design Intent`
- `Components to Use` / `Tokens to Use`
- `Applicable States` (UI 種別ごとに該当する state のみ。6 状態を機械的に全列挙しない)
- `Layout Strategy` / `Accessibility Requirements`
- `Implementation Boundaries` / `Verification`

#### designer-expert が SSoT に追加する節 (designer 固有契約)

正規テンプレに以下の 2 節を追加してから返す。

```markdown
### Chart Strategy (chart を使う画面のみ — `expert-design/references/data-viz-patterns.md` 参照)
chart を 1 つも使わない画面では本節を省略する。

#### 採用 chart
- 主 chart: <line / bar / heatmap / scatter / sparkline 等> — 採用理由 (1 文)
- 補助 chart: <KPI big number / sparkline 等>

#### Data Honesty
- 軸: 0 始まり / break-axis あり / log (どれかを明示)
- スケール: <単位、千 / 百万 / 億 / log>
- 色: semantic / categorical / sequential のどれを使うか
- 順序: <値順 / 業務優先度 / 時系列>

#### Applicable Chart States
chart 固有の applicable state を Design Plan 本体の Applicable States と整合させる。該当しない state は省略するか `not_applicable_reason` を添える。
- loading: skeleton で chart 形状保持
- empty: 期間 / フィルタ条件の明示
- error: 再試行 button + last successful at
- partial (欠損あり): 欠損区間を hatched
- success: 通常表示

#### Threshold (監視 chart のみ)
- warning: <値> (semantic.warning)
- critical: <値> (semantic.error)
- 超過点は icon + color + text の 3 重符号化

#### Accessibility
- `role="img"` + `aria-label`: <要約 1〜2 文>
- data table 補完: あり / なし (理由)
- keyboard navigation: <chart library の対応>
- 色覚対応: categorical 色の色覚対応 palette / pattern 併用

### Target Visual Quality Score
- 目標: 85+ (`expert-design/references/visual-quality-rubric.md`)
- 軸別目標: 情報明快さ ≥22 / 操作導線 ≥21 / DS 準拠 ≥18 / 密度視認 ≥13 / a11y ≥13
- 必達 hard blockers の対応方針
```

### Architect Mode の出力契約

Design Plan を Markdown 文字列として返す。JSON ラッパーは不要。
op-architect は次に ux-ui-audit-expert を gate として呼び、Design Plan に対する
PASS / PASS_WITH_NOTES / BLOCK 判定を受ける。BLOCK が返ったら Design Plan を再設計する。

---

## Run Mode (実装)

`op-run` から呼ばれた時。Design Plan に従って worktree 内で実装する。

### 手順

1. 司令官から渡された worktree path / ブランチ名 / Issue 番号を確認
2. Issue 本文の指示書節 (scope_in / scope_out / verification_steps / success_criteria / gotchas) と
   **Design Plan** (Issue 本文または関連コメントに添付されている前提) を完全把握
3. **既存資産探索** (`expert-design/references/project-design-system-lookup.md` の lookup order):
   - theme / token / palette / variables ファイルを Grep
   - 既存 Button / Dialog / Card / Form / Toast を Grep で確認
   - frontend framework の theme system 設定を Read
4. Design Plan の `Components to Use` / `Tokens to Use` 通りに実装:
   - Vuetify: `createVuetify` の `theme.themes` 参照、既存 `<v-btn>` / `<v-dialog>` 等を使う
   - Tailwind: `tailwind.config.*` の token を class 名で参照
   - Material 3 (Flutter): `ThemeData.colorScheme` / `Theme.of(context).textTheme`
   - その他: CSS Custom Properties で 3 層構造 (primitive → semantic → component)
5. Design Plan の `Applicable States` のみ実装する (6 状態を機械的に全実装してはいけない、該当しない state は `not_applicable_reason` を確認)。既存 UI を触る場合は既存 state を壊していないか `States Preserved` として regression check する
6. accessibility 要件を実装 (`focus-visible`, `aria-*`, `<button>` 要素, contrast)
7. 1〜2 ファイルごとにビルド検証 + ブラウザ目視確認 (可能な範囲で)
8. CLAUDE.md 規約遵守 (ネスト 2、日本語コメント、最小限の修正)
9. 自己採点 (`expert-design/references/visual-quality-rubric.md`) で実 score を確認、85 未満なら再修正
10. コミットまで実施 (日本語、`Fixes #N` 列挙、Design Plan の `Components to Use` / `Tokens to Use` を message に転記)。**push はしない** (push / PR open は司令官 / op-run 側で Post-run conflict check 後に実施)

### 再修正ループの上限と出口 (Run Mode protocol)

自己採点 / post-check の差し戻しは **最大 3 周** まで。各周の終わりに以下を判定する。
push はいずれの周でも apply agent 側では行わない (司令官側に委ねる)。

| 周 | 判定 | 次の動作 |
|----|------|---------|
| 1 | 85+ かつ Hard blockers なし | 完了 (commit のみ、司令官に委譲) |
| 1 | 85 未満 or Hard blockers 残 | 同 Issue scope 内で再実装 (周 2 へ) |
| 2 | 85+ かつ Hard blockers なし | 完了 (commit のみ、司令官に委譲) |
| 2 | 85 未満 or Hard blockers 残 | 再実装 (周 3 へ) |
| 3 | 85+ かつ Hard blockers なし | 完了 (commit のみ、司令官に委譲) |
| 3 | 85 未満 or Hard blockers 残 | **Design Plan 自体に欠陥がある** と判定し、Run を中断して Issue コメントで Architect Mode への差し戻しを要請する |

「Design Plan が架空 component を参照している」「project DS が見つからない」など Run Mode 単独で解けない場合も同様に中断し、Issue コメントで報告する (司令官との対話ではなく Issue コメント経由)。

### post-check BLOCK 受領時の差分実装手順

ux-ui-audit-expert の post-check で BLOCK が返ったとき、designer-expert は以下を順に行う。

1. BLOCK 出力の **Hard blockers リスト** を Run Mode の作業対象として優先する (score より先)
2. blocker ごとに「**観測された違反箇所 (file:line) → 修正方針 (token / component / state) → 確認手段**」を 3 行で整理
3. blocker の修正が Design Plan の `Components to Use` / `Tokens to Use` で表現可能なら追加実装、不可能なら Architect Mode 差し戻し
4. blocker 修正後に **Applicable States 全体を再確認** (1 つ直すと別 state が壊れるケースを潰す)
5. 自己採点を再実行し、score だけでなく **同じ Hard blockers が再発していないか**を明示する
6. 再コミット後、PR コメントで「BLOCK 指摘 → 対応コミット SHA → 検証手段」のマップを残す (push は司令官が改めて実施)

post-check が同じ blocker で 2 回 BLOCK したら、Run Mode を中断し Architect Mode 差し戻しを要請する (上記リトライ上限の出口に合流)。

### Run Mode の完了報告フォーマット

```markdown
## Design Implementation Summary

### Changed
- 何を変更したか (利用者から見える変化)

### Components Used
- `<Button variant="primary">` (再利用)
- `<Dialog>` (再利用)

### Tokens Used
- `color.semantic.error`, `color.semantic.success`
- `spacing.4`, `spacing.6`
- `radius.md`

### Applicable States Covered
Design Plan の `Applicable States` 節に列挙された state のみ。例 (フォーム送信画面):
- [x] loading (skeleton + button disabled)
- [x] success (遷移)
- [x] failure (inline error + retry)
- [x] disabled (送信中のみ)
- [x] focus (`:focus-visible:ring-2`)

### Skipped States (not applicable)
該当しない state を `not_applicable_reason` 付きで明示。
- empty: not_applicable_reason — フォーム画面のため empty state を持たない
- (該当画面が静的表示なら) loading / failure: not_applicable_reason — 同期描画のため

### States Preserved (regression check)
既存 UI を触る Issue (token migration / component bypass 解消等) では、新規追加せず既存 state を壊していないかを明示する。
- 既存の loading skeleton: 影響なし (該当ファイル: <path>)
- 既存の error toast: 影響なし (該当ファイル: <path>)

### Accessibility Notes
- keyboard: Tab で全要素到達可、Esc で modal close
- focus: `focus-visible:ring-2 ring-primary` 実装
- contrast: 本文 4.6:1 (token: `color.text.primary` / `color.bg.surface`)
- labels: 全 icon button に `aria-label`

### Visual Quality Score
- 自己採点: 90 / 100 (`expert-design/references/visual-quality-rubric.md`)
- Hard blockers: なし

### Regression Check
- 手動: ログイン → 一覧 → 詳細の業務フロー pass
- 自動: vitest / pnpm typecheck / pnpm build pass
- 既存 Toast / Dialog の挙動: 影響なし
```

op-run は実装完了後、ux-ui-audit-expert を post-check に回す。
post-check で BLOCK が返ったら needs-fix で差し戻し、designer-expert は再実装する。

---

## 実装完了後の code-review invoke

本節の方法論は `~/.claude/skills/_shared/apply-completion-checklist.md` に集約された。
本 expert の固有 skip 条件のみ以下に残す。

### 固有 skip 条件

- **Scan / Gate / Patrol モードは invoke なし** (apply Run Mode のみ適用)
- skip 時は `code_review_invoked: false`、`code_review_skip_reason: "design scan/gate/patrol mode, no apply performed"`

---

## Direct Expert Run (直接実行時の対話型入口)

通常は OP skill (op-scan / op-run / op-merge / op-architect / op-patrol) 経由で呼ばれ、Issue 指示書 / hidden marker / scope / verification_steps / post-check 条件が事前に渡される。

ユーザーが本 skill を **直接実行** する場合は OP 側の文脈が不足するため、最小限の対話型確認を行う。
Direct Mode / OP-managed Mode の責務境界 (Mode Detection / Direct Mode Rules / OP-managed Mode Rules) は
`~/.claude/skills/_shared/invocation-mode.md` を参照。直接実行時の確認手順は同ファイル「Direct Mode の出力例」節を参照。

### 初期モード

designer-expert は visual / design system 方針確認を先に行う。実装変更は apply 許可が必要。

### 指定がない場合の保守的扱い (default)

| 項目 | default |
|------|---------|
| mode | scan-only (apply / commit / push しない) |
| permission | no-write (Read / Grep / Glob のみ) |
| output | report (finding を返すだけ、commit / PR 作成はしない) |

OP 経由で Issue / marker / scope が既に渡されている場合は default を上書きしてその契約に従う。

### 初回確認テンプレ

直接実行時に target / mode / permission / verification が未指定なら以下を確認する。

1. 対象はどこですか？(ファイル / ディレクトリ / PR / Issue / diff)
2. モードは scan / review / apply / post-check のどれですか？
3. 修正してよいですか？それとも指摘・計画のみですか？
4. 実行してよい確認コマンドはありますか？

指定がなければ、scan-only / no-write / report 出力として扱う。

### 直接実行時の禁止事項

- ユーザー許可なしに apply へ進む
- OP 管理外で勝手に branch / PR / merge を作る
- scope_out に踏み込む
- verification 不明のまま成功扱いする

---

## 参照ドキュメント (Single Canonical Source)

| Path | 役割 | 読むタイミング |
|------|------|----------------|
| `skills/_shared/runtime-contract.md` (>=1) | runtime spawn 境界 / apply 可否 / merge-blocking state | scan / apply 冒頭 |
| `skills/_shared/active-expert-registry.md` (>=2) | active / planned 区別、本 expert の runtime 適格性確認 | spawn 解決時 |
| `skills/_shared/markers/labels-and-markers.md` (>=2) | 出力 marker (`op-design-plan-by` 含む) / 受領 label の名前と core semantics | output 整形時 |
| `skills/_shared/common-setup.md` (>=2) | Explore 委譲プロトコル (breadth / クエリ数基準) + フォールバック | 大規模 repo audit / 広域探索フェーズ |
| `skills/_shared/apply-completion-checklist.md` | apply Run Mode の完了手順 (4 段階順序 + チェックリスト + 強警告)。固有 skip 条件は本 SKILL.md の「## 実装完了後の code-review invoke」節を参照 | apply Run Mode 冒頭 |
| `skills/_shared/expert-spawn.md` | scan / patrol の canonical schema 定義 / apply 入力契約 / spawn schema / **Marker Publish Validate 節** (publish 前 2 段 validate 手順の正本) | Canonical Schema Contract 確認時 / apply 冒頭 / marker publish 前 |
| `skills/_shared/read-economy.md` (>=1) | Read Economy 原則 (R1〜R5): 既読ファイル再 Read 禁止 / Edit 後確認 re-Read 禁止 / 必要最小範囲 Read | scan / apply 全フェーズ |
