<!--
schema_version: 3
last_breaking_change: 2026-05-05
notes: v3 (2026-05-05) — architecture_debt 用補助 marker `op-refactor-debt-key` を追加。
       op-fingerprint の共通仕様は変更せず、refactor の debt 追跡だけ別 namespace で安定化する。
       op-patrol の architecture_debt 更新は op-refactor-debt-key を優先キーとし、
       op-fingerprint / 構造類似度の順で fall back する。
       v3 補強 (2026-05-09) — op-tools::op-core::fingerprint v1 と同期。
       句読点列挙 / whitespace Unicode / :LINE 抽出規則 / バッチ Issue 用 fingerprint (3-seg) /
       op-refactor-debt-key 正規化方針を明記。schema_version は据え置き (clarification)。
       v3 補強 (2026-05-09 第二弾) — 連続ハイフンの発生条件 ("a , b" → "a--b") を明記。
       schema_version は据え置き (現挙動の文書化のみ)。
       v3 補強 (2026-05-09 第三弾) — 空文字列 title の silent 許容 / bulk_group 等の
       silent pass を仕様として明記 (NHD-1 / NHD-2 確定、現挙動の文書化のみ)。
       v3 補強 (2026-05-16) — priority 4 (title 類似度) の算法を明文化:
       normalize_title 後の Levenshtein 距離 ≤ 3 で判定。正本実装は
       op-tools/crates/op-core/src/dedup.rs::classify_dedup。schema_version は据え置き
       (clarification only、現挙動の文書化のみ、過去 Issue marker と互換)。
       v3 補強 (2026-05-19) — 日本語助詞除去 step を追加 (silent fork 防止のための prose 同期、
       現挙動の文書化のみ、過去 Issue marker と互換)。normalized_title を 5 ステップから
       6 ステップに更新: step 4 として JP_PARTICLES 15 機能語 (は/が/を/に/へ/で/と/も/の/から/まで/や/ね/よ/か)
       の除去を追加し、以降の step 番号を繰り下げた。Rust 実装
       (op-tools/crates/op-core/src/fingerprint.rs::strip_jp_particles) との
       prose ↔ Rust 双方向同期を達成 (Issue #214 対応)。
       `より` は文脈で意味語と判別が難しいため Rust 実装で採用せず、prose でも除外 (RVW-002 解消)。
       v3 補強 (2026-05-19 第二弾) — 機能語リストを Rust 実装 JP_PARTICLES const (15 要素) と
       完全一致させる (RVW-002 解消、4 経路 canonical sync)。
       v2 (2026-05-03 第三段階) — canonical schema (expert-spawn.md) との整合修正。
       primary_file / symbol の抽出元を `affected_files[0]` から `files[0]` + `symbols[0]` に統一。
       canonical schema 側の field 名 (`files`, `symbols`) が正本。schema 不整合による
       fingerprint 計算の silent failure を解消。
       v1 (2026-05-03 初期): fingerprint 生成仕様 + 重複除外 4 段優先順位を集約。
-->

# fingerprint 生成 + 重複除外 policy (op-scan / op-patrol 共通)

/**
 * 機能概要: 検出に付ける fingerprint の文字列仕様、および既存 open Issue との重複判定の
 *           優先順位 4 段を定義する。op-scan / op-patrol 双方の起票を同一空間で重複判定するため、
 *           両者で文字列仕様が完全一致している必要がある。
 * 作成意図: op-scan フェーズ2-2 と op-patrol フェーズ5-2 に同一仕様が verbatim で重複していた。
 *           normalized_title の仕様変更や優先順位変更を片側だけに反映するとサイレントに divergence する。
 * 注意点: fingerprint 文字列は GitHub Issue 本文の hidden marker `<!-- op-fingerprint: ... -->` に
 *         埋め込まれて永続化される。文字列仕様を変えると過去 Issue との比較が崩れる (false negative)。
 *         破壊的変更時は schema_version を bump し、_shared/version-check.md の段階移行プロトコルに従うこと。
 */

---

## fingerprint 生成仕様

各検出に **fingerprint** を計算する。op-scan / op-patrol 双方の起票を同一空間で重複判定するため、
共通仕様で生成する。

```text
fingerprint = "<domain>:<normalized_title>:<primary_file>:<symbol>"

normalized_title (順序固定):
  1. 小文字化 (Rust: str::to_lowercase。多言語対応、ASCII 大文字のみ小文字化)
  2. 連続空白を 1 つに圧縮 (Unicode 全空白対象、Rust: char::is_whitespace)。
     対象: 半角空白 / TAB / NL / CR / 全角空白 U+3000 等
     先頭・末尾の空白は trim する
  3. 句読点除去:
     - ASCII 句読点全 (Rust: char::is_ascii_punctuation):
       !"#$%&'()*+,-./:;<=>?@[\]^_`{|}~
     - CJK 句読点: 、 。 「 」 『 』 ・ 〜 …
     - 全角ブラケット: （ ） ［ ］ 【 】 〔 〕 〈 〉 《 》
     - 全角 ASCII: ！ ？ ： ； ， ． ／ ＝ ＋ － ＊ ＆ ＿
  4. 日本語助詞除去:
     - 対象 JP_PARTICLES (15 機能語): は / が / を / に / へ / で / と / も / の / から / まで / や / ね / よ / か
     - 削除条件: 助詞の前後少なくとも一方が ASCII 文字または空白である場合のみ削除
       (CJK 文字に前後を囲まれた助詞は CJK 固有語の一部とみなして保護)
     - 空白吸収挙動: 助詞の前にある空白も合わせて除去する。
       例: `fetcherror に deriveclone を付与` → step 3 で `-` 等が除去済 →
           `fetcherror に deriveclone を付与` → 助詞 `に` の前空白を含め除去 →
           `fetcherror deriveclone 付与` → step 5 で空白を `-` に置換 →
           `fetcherror-deriveclone-付与`
       (単語間の空白だけが残るため、最終的な `-` 区切りが自然になる)
  5. 30 char 単位で切り詰め (UTF-8 byte ではなく char 単位、multi-byte 安全)
  6. 残った空白を `-` に置換 (truncate 後に行うので最大 30 char)

primary_file: files[0] から **末尾の `:digits` を 1 段だけ** 除去
              アルゴリズム: rfind(':') で最後の `:` を探し、後ろが全 ASCII 数字なら
              `:数字` 部分を捨てる。それ以外はそのまま。
              例:
                "src/foo.vue:42"     → "src/foo.vue"      (LINE 除去)
                "src/foo.py"         → "src/foo.py"       (suffix なし、そのまま)
                "src/foo.py:bar"     → "src/foo.py:bar"   (数字でない、そのまま)
                "src/foo.py:"        → "src/foo.py:"      (空 suffix、そのまま)
                "src/foo.rs:42:5"    → "src/foo.rs:42"    (LINE:COL は trailing のみ除去)
              注意: canonical schema (expert-spawn.md) は "path:LINE" 形式のみ規定。
                    LINE:COL 等の入力は schema 違反だが現状の rfind ベース実装では
                    trailing :digits のみ除去される (silent normalize)。

symbol:       symbols[0] (関数名 / 型名 / module 名)、symbols 配列が空なら "" (空文字列)
              空文字列の場合、fingerprint 末尾 segment も空となる:
              "security:foo:bar:" のように末尾コロンが残る形式
              (これは仕様。3-seg として扱わない)

空文字列 title (NHD-1 確定):
  caller が title="" を渡した場合、normalize_title("") = "" を返し、fingerprint は
  "<domain>::<file>:<symbol>" となる。clap で reject せず silent 許容する。
  理由: caller (各 expert agent) が title 欠落時に fail-closed で停止するより、
  空 segment を記録して後続 dedup / patrol で照合できるほうが ledger の安定運用に資する。
  title 必須化が必要な caller 側は spawn schema レベルで担保する。

bulk_group / primary_dir / root_path / symbol_or_boundary の不正値 (NHD-2 確定):
  大文字 / 空白 / 全角 / 不明 enum 値 等が混入しても CLI は silent pass する
  (正規化しない)。caller が canonical schema 由来の確定値を渡す前提を維持し、
  schema 違反検出は `op core marker-lint` (Phase 1 後続) に委ねる。

連続ハイフンの発生条件 (仕様):
  step 2 (連続空白圧縮) の後で step 3 (句読点除去) を行うため、
  「空白 + 句読点 + 空白」(例: "a , b") は次のように変化する:
    1. 小文字化         → "a , b"
    2. 連続空白圧縮     → "a , b"  (各空白は単独 1 文字なので変わらず)
    3. 句読点除去 (",")  → "a  b"  (空白 2 連続)
    4. truncate         → "a  b"
    5. space → "-"      → "a--b"  (連続ハイフン)
  空白の二次圧縮は行わない。fingerprint 同一性は保たれるため許容済み。
  step 5 を「空白 1 つ以上 → 1 つの "-"」に変更すれば消えるが、過去 Issue の
  fingerprint と非互換になるため schema_version bump が必要。当面は現挙動を固定する。

正規化アルゴリズムの正本: op-tools/crates/op-core/src/fingerprint.rs 内の
normalize_title() / extract_primary_file() および同 mod の test 群。本 prose は
その仕様記述。両者の整合は op-tools/crates/op-core/src/fingerprint.rs の
fingerprint_example_* tests で検証する。
```

> **field 名の根拠**: canonical schema (`~/.claude/skills/_shared/expert-spawn.md`) は
> `files: ["path:LINE"]` (string 配列) と `symbols: ["name"]` (string 配列) を別フィールドで持つ。
> 旧表記 `affected_files[0].path` / `affected_files[0].symbol` は schema 不整合の温床になるため、
> 本ドキュメントから削除した。実装側は `files[0]` から `:LINE` を除いたパス + `symbols[0]` を使う。

### 例

```
security:sql-injection-in-query:api/query.py:run_query
debug:exception-swallowed:service.ts:handleEvent
security:path-traversal-in-export:src-tauri/src/commands/export.rs:export_report
debug:race-on-job-queue:src-tauri/src/jobs/worker.rs:run_loop
```

---

## バッチ Issue 用 fingerprint (3-seg 形式)

`bulk_group` ごとに finding をまとめて起票する Issue (`op-scan` の bulk Issue) には
通常の 4-seg ではなく 3-seg 形式を使う。

```text
fingerprint = "<domain>:<bulk_group>:<primary_dir>"
```

| field | 由来 | 正規化 |
|---|---|---|
| domain | finding 集合の共通 domain | 通常 domain と同じ kebab-case enum |
| bulk_group | finding 側の `bulk_group` (例: `refactor-scattered-tokens`) | **正規化しない** (事前 enum 値) |
| primary_dir | affected_paths の最小共通祖先 (LCA) ディレクトリ | 末尾 `/` を trim する以外そのまま |

### 例

```
refactor:refactor-scattered-tokens:src/features/report
optimize:optimize-bundle-bloat:packages/web
```

### 通常 4-seg との使い分け

- 通常 finding (Issue 1 件 = 1 問題) → 4-seg
- bulk Issue (Issue 1 件 = N 個の同種問題) → 3-seg

bulk Issue の起票テンプレは `pr-templates.md:355-380 周辺` 参照。

---

## 既存 Issue との重複除外

```bash
# op-scan / op-patrol 両方の起票を対象にする
gh issue list --label "auto-report" --state open \
  --json number,title,body,labels --limit 100
```

### 判定優先順位 (上から順に評価し、最初に一致したものでスキップ確定)

1. **fingerprint 完全一致** (本文 hidden marker `<!-- op-fingerprint: ... -->` を比較)
2. `primary_file` + `symbol` 一致 (両者非空)
3. `primary_file` + 行範囲 ±5 (両者に line がある場合のみ)
4. title 類似度が高い (**normalize_title 後の Levenshtein 距離 ≤ 3** で判定)

いずれかに該当 → スキップ。スキップした検出の扱いは呼び出し側 SKILL に委ねる:
- op-scan: 「既存 Issue #N と重複」として最終報告に記録
- op-patrol: run コメントの `skipped_duplicates` に記録

#### priority 4 の title 類似度算法 (固定)

- 算法: 2 文字列の **Levenshtein 距離 (編集距離)**
- 適用対象: candidate / existing 双方の title に `normalize_title` を適用後の文字列 (最大 30 char)
- 閾値: 距離 ≤ 3 で類似と判定
- 実装: 外部 crate (`strsim` 等) を採用せず、`op-tools/crates/op-core/src/dedup.rs` 内に
  内部関数 `levenshtein` として実装 (依存最小化、30 char 範囲では十分高速)
- 採用理由: deterministic、normalize_title (最大 30 char) で 100 件比較しても 1ms 未満、
  jaccard / cosine は日英混在で fragile
- 既知の限界: 短 title (10 char 程度) で 3 編集距離は緩い可能性。運用観測で false positive
  発生率を計測し、必要なら閾値見直しは future work

正本実装: `op-tools/crates/op-core/src/dedup.rs::classify_dedup` および同 mod の test 群。

---

## architecture_debt 補助 marker (`op-refactor-debt-key`)

**op-fingerprint の共通仕様 (`<domain>:<normalized_title>:<primary_file>:<symbol>`)
は debt 追跡には粒度が細かすぎる**。architecture_debt は同じ構造負債が title 微調整 /
ファイル名 rename / symbol 抽象度の差で fingerprint がブレやすく、op-patrol 再検出時に
既存 Issue を取り逃がして二重起票する温床になる。

そのため refactor の debt 系 finding (`finding_type` ∈ `architecture_debt` /
`staged_refactor` / `needs_spec_decision`) には、op-fingerprint と並べて
**`op-refactor-debt-key`** を Issue 本文に埋め込む。

```text
op-refactor-debt-key = "refactor:<bulk_group>:<root_path>:<symbol_or_boundary>"

bulk_group:        finding 側の `bulk_group` をそのまま使う
                   (例: refactor-boundary-mixing / refactor-scattered-tokens)
root_path:         affected_paths の最小共通祖先 (LCA) ディレクトリ
                   (例: src/features/report)
symbol_or_boundary: 具体 symbol が立つなら symbols[0]、
                   feature / boundary 単位なら抽象名 (例: report-feature-cross-cutting)
```

### 正規化方針

bulk_group / root_path / symbol_or_boundary は **すべて正規化なし**。
caller が canonical schema 由来の確定値を渡す前提。

例外として root_path のみ末尾 `/` を trim する (`src/foo/` → `src/foo`)。

理由:
- bulk_group は事前 enum 値で固定文字列
- root_path / primary_dir は LCA path (caller が計算済み)
- symbol_or_boundary は人間が選んだ抽象名

これらに `normalized_title` の 5-step 正規化を通すと **正規化の二重がけ** が起きて
意味のない fingerprint drift を生むため、そのまま使う。

### symbol_or_boundary が空の場合

symbols 配列が空 + 抽象境界名も決まらない場合、末尾 segment は空文字列:
`refactor:refactor-something:src/foo:`

これは通常 fingerprint と同じく「空 segment 末尾コロン残し」を採用する。

### Issue 本文に埋め込む 2 つの marker

```markdown
<!-- op-fingerprint: refactor:report-output-paths-scattered:src/features/report/export.ts:exportReport -->
<!-- op-refactor-debt-key: refactor:refactor-scattered-tokens:src/features/report:report-output-paths -->
```

- `op-fingerprint` は **すべての finding に必須** (共通仕様。dedup の標準キー)
- `op-refactor-debt-key` は **refactor の debt 系 finding にのみ追加** (補助キー)

### op-patrol による architecture_debt 既存 Issue 検索の優先順位

```text
1. op-refactor-debt-key 完全一致
2. op-fingerprint 完全一致
3. affected_paths 類似 + bulk_group 一致 + symbols 類似 (タイブレーカ)
```

最初に一致したものを「同一 debt」と判定し、`seen_count` / `last_seen_at` /
`risk_trend` / `affected_paths` を更新する (重複起票しない)。
3 のタイブレーカは false positive を増やすため、**op-patrol が既存 Issue 上限件数まで
拾えなかった場合のみ** 適用する。

### op-fingerprint との関係

- op-fingerprint は **変えない** (共通仕様を壊さない)
- op-refactor-debt-key は **refactor の debt 追跡専用 namespace**
- 両者の優先順位を分離することで、debt の追跡安定化と immediate_refactor の
  通常 dedup を両立する

---

## 既知の限界

fingerprint = `<domain>:<title30文字>:<file>:<symbol>` はファイル / 関数 rename ですり抜ける
(false negative)。Ledger 長期運用 (半年〜1年) で累積する前提の許容済み弱み。
症状が出たら patrol_score の `incident_score` 異常で察知できる
(同じバグが何度も Issue 化される)。詳細は ROADMAP.md の P4 を参照。

### LINE:COL 形式の入力 (schema 違反)

canonical schema は `files: ["path:LINE"]` のみ規定する。LINE:COL 形式
(`src/foo.rs:42:5` 等) は契約違反だが、現状の rfind ベース実装は trailing `:5`
のみ除去して `src/foo.rs:42` を返す (silent normalize)。

`:LINE` だけが除去される動作を保ったほうが scan / patrol の出力ブレが小さいため、
fail-closed 化はせず silent normalize で許容する。op-scan / op-patrol 側で
canonical schema 違反を検出する責務は `op core marker-lint` (Phase 1 後続) に委ねる。
