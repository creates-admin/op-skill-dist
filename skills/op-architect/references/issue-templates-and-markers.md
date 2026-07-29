<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29): ADR-0029 Wave B1 で SKILL.md フェーズ5-4 直後の本文から移動 (内容変更なし、verbatim 転記)。
       Issue 本文テンプレ + hidden marker パターンは成果物サンプル (dump) であり順序契約を持たないため
       references/ へ退避。marker 名 / label 名自体の正本は引き続き
       `~/.claude/skills/_shared/markers/labels-and-markers.md`。
-->

<!--
機能概要: op-architect フェーズ5-1/5-4 で Issue body (BODY_FILE) に書き出す Issue 本文テンプレと、
          apply_expert 分岐に応じた hidden marker パターンの具体例。
作成意図: テンプレ本体は Write tool で埋める成果物サンプルであり、フェーズ5-4 の bash fence 手順
          そのものではないため分離。marker 分岐表 (HAS_UI_IMPACT × APPLY_EXPERT) は SKILL.md
          フェーズ5-4 本文側に残す (実行時に毎回参照する判定表のため)。
注意点: 内容は SKILL.md からの verbatim 移動。marker 名 / label 名の正規定義は
        `~/.claude/skills/_shared/markers/labels-and-markers.md` が正本であり、本ファイルは
        op-architect が実際に埋め込む具体パターン例に留める (定義の重複ではない)。
-->

# op-architect フェーズ5: Issue 本文テンプレ + hidden marker パターン

**いつ読むか**: フェーズ5-1 (Issue 本文の構築) および フェーズ5-4 Pass 1/Pass 2 で
BODY_FILE / FINAL_FILE の中身を Write tool で生成する際に参照する。

#### Issue 本文テンプレ (BODY_FILE に書き出す内容)

UI 影響マイルストーンは冒頭に hidden marker を埋め込み、フェーズ4.6 で確定した
Design Plan を `## 🎨 Design Plan` 節として `## 🤖 apply agent への指示書` の直後に挟む。
hidden marker は op-run / op-merge が expert 解決と post-check 解決に使う。

#### hidden marker のパターン (apply_expert に応じて分岐)

```markdown
# UI 影響なし (DB / API / CI 等) — 依存なし工程の例
<!-- op-source: op-architect -->
<!-- op-domain: feature -->
<!-- op-architect-expert: feature-expert -->
<!-- op-run-expert: feature-expert -->
<!-- op-post-check-expert: null -->
<!-- 依存なし工程の例: op-depends-on marker は出さない (依存ありの工程のみ Pass 2 で op-post-check-expert 行の直後に追加する。空 value は lint error)。 -->

# UI 影響あり (apply_expert = feature-expert) — 業務機能・データ接続が中心 — 依存あり工程の例
<!-- op-source: op-architect -->
<!-- op-domain: feature -->
<!-- op-architect-expert: designer-expert -->
<!-- op-design-plan-by: designer-expert -->
<!-- op-run-expert: feature-expert -->
<!-- op-post-check-expert: ux-ui-audit-expert -->
<!-- op-depends-on: #806, #807 -->
<!-- ↑ op-depends-on は依存ありの工程のみ Pass 2 で追加する。依存なし工程は行ごと省略 (空 value は lint error)。 -->

# UI 影響あり (apply_expert = designer-expert) — visual / token / component 中心
<!-- op-source: op-architect -->
<!-- op-domain: design -->
<!-- op-architect-expert: designer-expert -->
<!-- op-design-plan-by: designer-expert -->
<!-- op-run-expert: designer-expert -->
<!-- op-post-check-expert: ux-ui-audit-expert -->
```

UI 影響なしマイルストーンでは Design Plan 節を省略し、上記の最小 marker セットのみを埋め込む。
post-check が不要なケースでも `op-post-check-expert` marker は **必須** で、値を `null` にして明示的に出力する (値の省略は op-run dispatcher が「未解決」と「明示 skip」を区別できなくなるため不可)。
UI 影響あり (apply_expert = feature-expert) の場合は `op-architect-expert: designer-expert` を指定する (Design Plan は designer-expert が作るため)。

```markdown
<!-- 以下は UI 影響あり (apply_expert = designer-expert) の例。
     apply_expert / domain は上表に従い、対応する marker セットに置き換える。 -->
<!-- op-source: op-architect -->
<!-- op-domain: design -->
<!-- op-architect-expert: designer-expert -->
<!-- op-design-plan-by: designer-expert -->
<!-- op-run-expert: designer-expert -->
<!-- op-post-check-expert: ux-ui-audit-expert -->

## 概要
<マイルストーンの 1〜2 文要約>

## 検出根拠
- 起点: op-architect 対話による初期設計
- 関連 ADR: ADR-NNNN, ADR-MMMM
- 依存マイルストーン: #<N> (先に完了が必要)

## 観測された挙動 / Evidence
新規構築のため既存挙動なし。下記 ADR の決定に基づき新規実装する。

---

## 🤖 apply agent への指示書

### scan が立てた仮説
op-architect が ADR-NNNN (<タイトル>) に基づき、<方針> で実装すべきと設計した。

### 除外した仮説 (ADR で検討済み)
- <案 B>: ADR-NNNN の Alternatives で <理由> により不採用
- <案 C>: ADR-NNNN の Alternatives で <理由> により不採用

<!-- UI 影響マイルストーンのみ。フェーズ4.6 で確定した Design Plan をそのまま埋め込む。 -->
<!-- op-run の designer-expert はこの節を Issue 本文から読み取って実装する。 -->
## 🎨 Design Plan
<designer-expert (Architect Mode) が出力し、ux-ui-audit-expert (gate) で PASS / PASS_WITH_NOTES 判定を受けた
Design Plan 本文をそのまま貼り付ける。Audit Notes があれば末尾に「### Audit Notes」として追加済み。>

### 触ってよいファイル (新規作成)
- `<path/to/new/file>`
- `<path/to/another/new/file>`

### 触ってはいけないファイル / 領域
- <他マイルストーンが扱う領域>
- <ADR で別案件と決めた領域>

### 必須検証項目
- [ ] <project-profile.md の Static 検証 — fmt / clippy / typecheck>
- [ ] <Unit 検証 — cargo test / vitest / flutter test>
- [ ] <Build 検証 — cargo check / pnpm build>
- [ ] <Integration / Manual — 必要に応じ>

### 成功条件
<マイルストーンの success_criteria を転記>

### 既知の落とし穴 / 注意点
- <初期構築で踏みやすい罠>

---

## 関連 ADR
- ADR-NNNN: <タイトル>
- ADR-MMMM: <タイトル>

## 依存
- depends on #<N> (先に完了が必要)   <!-- Pass 2 で実 issue number を埋める。依存なし工程はこのセクションごと省略する -->

---
🤖 op-architect による自動起票
```
