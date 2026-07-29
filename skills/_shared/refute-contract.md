<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29) — ADR-0030 決定3 (A) / MIS-03 により新設。
       refute (skeptic) mode の worker 契約を prose 正本化した。
       実装 (機械正本) は workflows/op-scan-audit.js / op-patrol-audit.js / op-spec-patrol-audit.js の
       refute prompt + verdict schema であり、本ファイルはその prose ミラーである (乖離時は実装が正)。
       expert-spawn.md に入れず独立ファイルにしたのは、同ファイルが既に 1,200 行超で
       ADR-0030 決定1 の密度基準に反するため。
-->

<!--
機能概要: 起票前 refute (反証 / skeptic) フェーズで spawn される worker の契約
         — 立場・必須手順 (再 Read)・verdict 判定軸・default の向き (非対称)・返却 field — を定める正本。
作成意図: refute の契約が L3 (workflow の spawn prompt) にしか存在せず、L1 (agents/*.md) と
         L2 (skills/expert-*/) に記述ゼロだったため、各 expert は「自分が skeptic としても spawn される」
         ことを知らず、モード列挙 (scan / apply / review / post-check) も実態と不一致だった (ADR-0030 MIS-03)。
注意点: refute は enrichment の cross-review とは **別レイヤー**。enrichment は「起票する Issue の質」を
        上げる層、refute は「そもそも起票に値するか」を落とす層である。
        verdict の詳細 JSON schema は各 workflow の refuteVerdictSchema / REFUTE_SCHEMA が機械正本。
        本ファイルの表と食い違った場合は workflow 実装が正。
-->

# refute (skeptic) 契約

## 1. 位置付け — spawn の 4 パターン目

`_shared/expert-spawn.md` が定義する spawn パターン (1: scan / 2: apply / 3: review) に対し、
**refute は 4 パターン目**である。

- **いつ走るか**: op-scan / op-patrol / op-spec-patrol が finding を **起票する前**。
  audit フェーズの後、severity gate / dedup / enrichment / `gh issue create` の前段に入る。
- **何をするか**: audit が挙げた High / Critical の finding を **1 件ずつ独立に反証**し、
  偽陽性と severity 過大を落とす。
- **誰が呼ぶか**: controller ではなく workflow (`op-scan-audit.js` / `op-patrol-audit.js` /
  `op-spec-patrol-audit.js`) の refute フェーズ。severity gate / 起票 / Ledger 更新は controller に残る。
- **誰が呼ばれるか**: **audit した本人と同じ expert の別インスタンス**
  (`detected_by` をそのまま `agentType` にする)。skeptic 性は別 agent ではなく **prompt で確保**する。
  spec drift の refute は `spec-expert` の別インスタンス。
- **model**: 起票可否 = 不可逆 gate のため **Opus 固定**。
- **invocation mode**: 常に `op_managed`。質問で停止せず、判断不能は `needs_human_decision` を返す。

> refute は enrichment の cross-review とは別レイヤーである。両者を統合してはならない。

## 2. worker の立場と禁止事項

- あなたは自 domain expert の **別インスタンス (skeptic mode)** である。
- **read-only**。Read / Grep / Glob のみ。コード・正本・Issue を変更しない。
- 質問で停止しない (OP-managed Mode)。
- **JSON 以外のテキストを付けない**。返却は verdict schema のみ。

## 3. 必須手順 (証拠の再取得)

| # | 手順 | 違反時 |
|---|---|---|
| 1 | finding が引用する `file:line` (spec drift では `file::symbol` + **正本の該当節**) を **必ず再 Read する** (該当行 ±20 行、または該当シンボル全体) | `reread_performed: true` を再 Read 無しで返すのは **contract violation** |
| 2 | 再 Read した **実コード片 (spec drift では実コード片 / 正本該当節) を `evidence_excerpt` に生のまま引用**する | 自然文要約のみは不可 (schema が `minLength: 1`、controller が literal 照合して drop) |
| 3 | 再 Read した範囲を `evidence_location` に `file:line-line` (spec drift では `<spec_path>:<section>` 可) で記す | controller が literal 照合する anchor が失われる |
| 4 | `finding_ref` は与えられた値を **そのまま転写**する | controller が verdict ⟷ finding を keying できない |

> **trust model の限界**: schema 必須化 + controller-side literal 照合 (drop 方向) +
> verdict ⟷ severity 整合の 3 段は **近似 gate であって証明ではない** (決定論照合が無い)。
> この限界は各 SKILL.md / 完了報告に明示する。

## 4. verdict 判定軸

| verdict | 条件 |
|---|---|
| `refuted` | 偽陽性。引用箇所に主張の事象が存在しない / コードは読めたが主張の因果が成立しない / (spec drift) 正本と code は実は一致している |
| `downgrade` | 実在するが severity 過大。`severity-rubric.md` の「到達経路 → 観測可能な被害」test に照らして Critical / High より低い。**`confirmed_severity` 必須** |
| `downgrade` または `refuted` | `evidence_grade` が `direct` 以外 (`requires_runtime` / `inferred`) なのに Critical 申告、または `inferred` で起票不適格 |
| `confirmed` | 実在し、severity も妥当。起票に値する |

判定の共通材料:

- **severity 判定の正本**: `_shared/severity-rubric.md` (到達経路 → 被害 test)。
- **スタック前提**: `_shared/project-profile.md`。
- **対象 repo の CLAUDE.md 規約に準拠したコードを「問題」として批判しない** — 規約準拠は **refuted 方向**の材料。
  (正本は `_shared/project-profile.md`「対象 repo 規約への準拠 (worker 共通)」節)
- op-patrol 経由では **Patrol Finding Policy** (好み / 将来不安のみ / 未読推測 / 根拠の薄い security は
  起票不適格) も refuted 方向の材料とする。
- op-spec-patrol では **機械 drift** (broken-link / paths-overlap / cite / index) は CLI 担当ゆえ
  そもそも refute 対象外 = `refuted`。

## 5. default の向き (非対称 — 最重要)

**default は「証拠が足りないときにどちらへ倒すか」であり、経路ごとに逆を向く。**

| 経路 / domain | default | confirmed (または refuted) にするための追加要件 | 理由 |
|---|---|---|---|
| op-scan / op-patrol、**非 security** domain | **refuted** | `confirmed` にするには実コード引用による積極的証拠が必要。不確実 / 証拠不十分なら refuted へ倒す | 偽陽性起票のノイズを抑える |
| op-scan / op-patrol、**`domain: security`** (D7 非対称) | **confirmed** | **`refuted` にするには `security_unreachable_proof` が必須** — source → sink が到達しない / trust boundary で遮断される / `required_user_action` が成立しない 等を **実コードで示す積極的証拠**。示せない場合は confirmed のまま | security の取りこぼし (false negative) は実害が大きい |
| op-spec-patrol (spec **domain drift**、ADR-0017 決定12) | **refuted** | `confirmed` にするには正本と code が **実際に食い違う**ことを示す積極的証拠 (`drift_confirmed_by_evidence: true` + `evidence_excerpt` の実引用) が必要 | spec drift の偽陽性は「正本を誤って書き換える」本末転倒を招く。**security 非対称とは逆方向**である点に注意 |

## 6. 返却 field (prose ミラー)

機械正本は各 workflow の verdict schema (`op-scan-audit.js` / `op-patrol-audit.js` の
`refuteVerdictSchema`、`op-spec-patrol-audit.js` の `REFUTE_SCHEMA`)。

| field | 必須 | 意味 |
|---|---|---|
| `finding_ref` | ✓ | audit finding との keying 用。与えられた値をそのまま転写 |
| `verdict` | ✓ | `confirmed` \| `refuted` \| `downgrade` |
| `refuted` | ✓ | boolean。`verdict` と整合させる |
| `reason` | ✓ | 判定理由。`evidence_excerpt` を根拠に論証する |
| `evidence_excerpt` | ✓ | 再 Read した **生のコード片 / 正本該当節**。空不可 |
| `reread_performed` | ✓ | 実際に再 Read した場合のみ true |
| `supports_claim` | ✓ (scan / patrol) | 引用コードが finding の主張 (到達経路 / 観測可能な被害) を支持するか |
| `evidence_location` | 推奨 | `file:line-line` (spec drift では `<spec_path>:<section>` 可)。controller が literal 照合する |
| `confirmed_severity` | `downgrade` のとき必須 | audit より低い severity |
| `evidence_grade_observed` | 任意 (scan / patrol) | `direct` \| `inferred` \| `requires_runtime` |
| `security_unreachable_proof` | **security の `refuted` で必須** | 到達不可の積極的証拠 |
| `drift_confirmed_by_evidence` | spec drift の `confirmed` で必須 | 正本 ⟷ code の乖離を実証できたか |
| `needs_human_decision` | 判断不能時 | 正規スキーマは `_shared/invocation-mode.md` |

## 7. 関連ドキュメント

- `_shared/expert-spawn.md` — spawn パターン 1〜3 / canonical scan-finding schema / scan 出力 envelope 契約
- `_shared/severity-rubric.md` — severity 判定と scan 報告ルールの正本
- `_shared/invocation-mode.md` — OP-managed Mode と `needs_human_decision` の正規スキーマ
- `_shared/project-profile.md` — スタック前提 / 対象 repo 規約への準拠
- `_shared/issue-enrichment.md` — enrichment (別レイヤー)。refute の後段に位置する
- `workflows/op-scan-audit.js` / `op-patrol-audit.js` / `op-spec-patrol-audit.js` — 機械正本 (実装)
