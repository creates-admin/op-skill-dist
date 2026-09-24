# refute (skeptic) 契約

起票前 refute の worker 契約と controller 側の適用規則の正本。verdict JSON schema の機械正本は
`workflows/op-scan-audit.js` / `op-patrol-audit.js` (`refuteVerdictSchema`) と `op-spec-patrol-audit.js` (`REFUTE_SCHEMA`)。
verdict schema が本ファイルと食い違った場合は workflow 実装が正。prompt 文面の正本は本ファイル。

## 1. 位置付け

- いつ: op-scan / op-patrol / op-spec-patrol の audit 後、severity gate / dedup / 起票の前。
- 何を: audit が挙げた High / Critical の finding を 1 件ずつ独立に反証し、偽陽性と severity 過大を落とす。
- 誰が呼ぶ: workflow の refute フェーズ。severity gate / 起票 / Ledger 更新は controller に残る。
- 誰が呼ばれる: audit した expert の別インスタンス (`detected_by` をそのまま `agentType`)。skeptic 性は prompt で確保する。spec drift は `spec-expert` の別インスタンス。
- model: Opus 固定。invocation mode: 常に `op_managed`。

## 2. worker の立場と禁止事項

自 domain expert の別インスタンス (skeptic mode)。read-only (Read / Grep / Glob のみ) で、コード・正本・Issue を変更しない。
判断不能は `needs_human_decision`。返却は verdict JSON のみ。

## 3. 必須手順 (証拠の再取得)

| # | 手順 | 違反時 |
|---|---|---|
| 1 | finding が引用する `file:line` (spec drift では `file::symbol` + 正本の該当節) を再 Read する (±20 行、または該当シンボル全体) | 再 Read 無しの `reread_performed: true` は contract violation |
| 2 | 再 Read した実コード片 (spec drift では正本該当節も可) を `evidence_excerpt` に生のまま引用 | 自然文要約のみは不可 (controller が literal 照合して drop) |
| 3 | 再 Read 範囲を `evidence_location` に `file:line-line` (spec drift では `<spec_path>:<section>` 可) で記す | literal 照合の anchor が失われる |
| 4 | `finding_ref` は与えられた値をそのまま転写 | verdict ⟷ finding を keying できない |

## 4. verdict 判定軸

| verdict | 条件 |
|---|---|
| `refuted` | 偽陽性。引用箇所に主張の事象が存在しない / 主張の因果が成立しない / (spec drift) 正本と code は一致している |
| `downgrade` | 実在するが severity 過大 (`severity-rubric.md` の到達経路 → 被害 test で Critical / High 未満)。`confirmed_severity` 必須 |
| `downgrade` または `refuted` | `evidence_grade` が `direct` 以外なのに Critical 申告、または `inferred` で起票不適格 |
| `confirmed` | 実在し、severity も妥当 |

判定材料:

- severity: `_shared/severity-rubric.md`。スタック前提: `_shared/project-profile.md`。
- 対象 repo の CLAUDE.md 規約に準拠したコードは refuted 方向の材料 (`project-profile.md`「対象 repo 規約への準拠 (worker 共通)」節)。
- op-patrol では Patrol Finding Policy (好み / 将来不安のみ / 未読推測 / 根拠の薄い security は起票不適格) も refuted 方向の材料。
- op-spec-patrol の機械 drift (broken-link / paths-overlap / cite / index) は CLI 担当ゆえ `refuted`。

## 5. default の向き (非対称)

default は「証拠が足りないときにどちらへ倒すか」。経路ごとに向きが違う。

| 経路 / domain | default | 反対側にするための要件 |
|---|---|---|
| op-scan / op-patrol、非 security | refuted | `confirmed` には実コード引用による積極的証拠が必要 |
| op-scan / op-patrol、`domain: security` | confirmed | `refuted` には `security_unreachable_proof` 必須 (source → sink 不到達 / trust boundary で遮断 / `required_user_action` 不成立 等を実コードで示す)。示せなければ confirmed |
| op-spec-patrol (spec domain drift) | refuted | `confirmed` には正本と code が実際に食い違う証拠 (`drift_confirmed_by_evidence: true` + `evidence_excerpt` の実引用) が必要 |

## 6. 返却 field

| field | 必須 | 意味 |
|---|---|---|
| `finding_ref` | ✓ | 与えられた値をそのまま転写 |
| `verdict` | ✓ | `confirmed` \| `refuted` \| `downgrade` |
| `refuted` | ✓ | boolean。`verdict` と整合させる |
| `reason` | ✓ | `evidence_excerpt` を根拠にした判定理由 |
| `evidence_excerpt` | ✓ | 再 Read した生のコード片 / 正本該当節。空不可 |
| `reread_performed` | ✓ | 実際に再 Read した場合のみ true |
| `supports_claim` | ✓ (scan / patrol) | 引用コードが finding の主張 (到達経路 / 被害) を支持するか |
| `evidence_location` | 推奨 | `file:line-line` (spec drift では `<spec_path>:<section>` 可) |
| `confirmed_severity` | `downgrade` 時必須 | audit より低い severity |
| `evidence_grade_observed` | 任意 (scan / patrol) | `direct` \| `inferred` \| `requires_runtime` |
| `security_unreachable_proof` | security の `refuted` 時必須 | 到達不可の積極的証拠 |
| `drift_confirmed_by_evidence` | spec drift の `confirmed` 時必須 | 正本 ⟷ code の乖離を実証できたか |
| `needs_human_decision` | 判断不能時 | スキーマは `_shared/invocation-mode.md` |

## 7. controller 側の適用 (op-scan / op-patrol)

### 7.1 適用順と verdict 適用

`refute verdict 適用 → severity gate → 統合 → (bulk-group) → dedup → 起票 (→ Ledger 更新)` の順。
severity gate を refute より前に置かない (downgrade が severity を変えるため)。
verdict は `finding_ref` で finding に突合する。op-patrol は `finding_ref` の region prefix (`<region_id>:<expert>#<idx>`) の region にのみ適用する。

| verdict | 適用 |
|---|---|
| `confirmed` | severity 不変で通過 |
| `downgrade` | `finding.severity = confirmed_severity` で上書き → severity gate で Critical/High 外なら drop |
| `refuted` | drop (統合・dedup・起票に渡さない) |

### 7.2 trust model

1. schema 強制 (workflow): `evidence_excerpt` (minLength:1) / `reread_performed` / `supports_claim` 必須。
2. controller literal 照合 (drop 方向のみ): `refuted` / downgrade-drop の `evidence_excerpt` が `evidence_location` のファイル内に literal 存在するか Grep / Read で確認する。不在なら verdict を信頼せず安全側に倒す。
3. verdict ⟷ severity 整合: 非整合 (例 `verdict: confirmed` だが `refuted: true`) は reject し安全側に倒す。安全側 = 非 security は `refuted` (drop)、security は `confirmed` (keep)。
4. security 非対称: `domain: security` の Critical/High の `refuted` で `security_unreachable_proof` が欠落 / 弱い場合、controller が `confirmed` に override する。

refute は近似 gate であって証明ではない (excerpt の存在は照合できるが、到達経路 / 被害の成否は LLM 判断)。この限界を完了報告に明示する。
取りこぼしは次回 scan / patrol で再検出される前提とする。

### 7.3 表示ルール

- drop / downgrade-drop した finding は完了報告に「refute で偽陽性/過大判定」として `evidence_excerpt` (+ `evidence_location`) 付きで必ず列挙する (silent drop 禁止)。
- refute で drop した finding は `manual_review_bucket` に入れない。ただし downgrade で `evidence_grade_observed: requires_runtime` になった finding は `manual_review_bucket` に退避する。
- 統計に confirmed / refuted / downgrade 件数を出す。

### 7.4 refute が走る / 走らない経路

- 走る: op-scan normal mode、op-patrol 通常巡回。`--auto` でも走る (`--auto` は人間承認 skip であって品質 gate skip ではない)。
- 走らない: op-scan `--from-issue` / `--from-merged-pr` (workflow が `verdicts: []` を返す)、op-patrol `--dry-run` / `--compact-ledger` (audit に到達しない)。
